# Agent-Key Secret Encryption (KMS)

This page covers how `agent_keys.key_secret_enc` is protected at rest in
QA / production, and how to migrate from `KMS_MODE=dev` to `KMS_MODE=aws`.

## Why we encrypt

HMAC-SHA256 request signing requires token-api to recompute the signature
on every request, which means it needs the **plaintext** API secret. A
SHA-2 hash alone isn't enough. We therefore store the secret as KMS
ciphertext in the `key_secret_enc VARBINARY(512)` column and decrypt on
each cache-miss (60s in-memory TTL keeps KMS call volume bounded).

## Why direct encryption, not envelope encryption

AWS recommends envelope encryption (generate-data-key + AES-256-GCM) for
payloads larger than 4 KiB or for very-high-throughput workloads. Our
secrets are ~32 bytes and we touch a single secret per minute per active
key. Direct `kms:Encrypt` / `kms:Decrypt` is simpler, has fewer moving
parts, and costs the same — ~$0.03 per 10K calls.

## Why not HSM

CloudHSM is ~$1.5K/month/region plus dev complexity. KMS gives us
FIPS-140-2 Level 3 hardware backing for ~$1/month/key, and CloudTrail
records every Decrypt call. The marginal security improvement of HSM
isn't worth the cost at our stage.

## Mode switch

| Env var               | dev (default)               | aws (QA / prod)                                            |
| --------------------- | --------------------------- | ---------------------------------------------------------- |
| `KMS_MODE`            | `dev`                       | `aws`                                                      |
| `AWS_REGION`          | unused                      | `ap-northeast-1` (or wherever the key lives)               |
| `AWS_KMS_KEY_ALIAS`   | unused                      | `alias/netstars-token-qa` (or the prod equivalent)         |
| `key_secret_enc` col  | plaintext UTF-8 bytes       | KMS `CiphertextBlob` bytes (opaque, includes key metadata) |
| boto3 calls AWS?      | no — `DevKmsClient` no-ops  | yes — `AwsKmsClient` via `boto3.client('kms').decrypt(...)`|

Authentication uses the default boto3 credential chain. In EKS that
means **IRSA** (IAM Roles for Service Accounts); never inject static
`AWS_ACCESS_KEY_ID` env vars into the pod.

## One-time IAM setup (per environment)

1. **Create a customer-managed symmetric KMS key** with a clear purpose:
   ```
   aws kms create-key \
     --description "Netstars token-api agent_keys.key_secret_enc" \
     --key-usage ENCRYPT_DECRYPT \
     --key-spec SYMMETRIC_DEFAULT \
     --tags TagKey=Service,TagValue=token-api
   aws kms create-alias --alias-name alias/netstars-token-qa --target-key-id <key-id>
   ```

2. **Create an IAM role** for the token-api pod's service account
   (`token-api-sa` in the namespace) with a trust policy that allows the
   EKS OIDC provider to assume it (standard IRSA setup).

3. **Grant least-privilege KMS permissions** on the role:
   ```json
   {
     "Version": "2012-10-17",
     "Statement": [
       {
         "Effect": "Allow",
         "Action": ["kms:Decrypt"],
         "Resource": "arn:aws:kms:ap-northeast-1:<acct>:key/<key-id>",
         "Condition": {
           "StringEquals": {
             "kms:ViaService": "dynamodb.ap-northeast-1.amazonaws.com"
           }
         }
       }
     ]
   }
   ```
   Drop the `kms:ViaService` condition since we call KMS directly, not via
   another AWS service. For the ops machine that runs `kms_cli encrypt`,
   add `kms:Encrypt` on the same key.

4. **Patch the ServiceAccount** with the role ARN annotation
   (`eks.amazonaws.com/role-arn`). See `infra/k8s/token/serviceaccount.yaml`.

## Day-2: rotating a key (rare)

KMS key rotation is automatic (yearly) and transparent — old ciphertexts
remain decryptable. If you ever need to rotate to a brand-new key:

1. Create the new key + alias.
2. Update `AWS_KMS_KEY_ALIAS` for the pod, redeploy.
3. For each row in `agent_keys` whose `key_secret_enc` was encrypted with
   the old key: decrypt (still works via the old key's CMK), re-encrypt
   with the new key, `UPDATE` the column.
4. Schedule the old key for deletion (≥7 day waiting period).

## Creating a new agent_key in QA / prod

```bash
# 1. Generate a 192-bit random secret
secret=$(openssl rand -hex 24)

# 2. Encrypt it with the env's KMS key
KMS_MODE=aws \
AWS_REGION=ap-northeast-1 \
AWS_KMS_KEY_ALIAS=alias/netstars-token-qa \
poetry run python -m token_api.kms_cli encrypt --plaintext "$secret"

# 3. Use the printed SQL snippet (FROM_BASE64('…')) to INSERT into agent_keys.
#    The CLI also prints the base64 if you'd rather use a different DB tool.

# 4. Hand `$secret` to the merchant out-of-band (1Password / signed PDF).
#    The server never sees plaintext again — only KMS-decrypted bytes.
```

## Local dev: how does the demo still work?

`KMS_MODE=dev` is the docker-compose default. `DevKmsClient.decrypt(b)`
returns `b` unchanged, so the migration's plaintext seed
(`secret_localdev_test`) works as-is. Switching the local stack to
`aws` mode requires real AWS credentials and a real KMS key — usually not
worth the friction for day-to-day SDK work.

## Failure modes

| Symptom                                      | Likely cause                                                 |
| -------------------------------------------- | ------------------------------------------------------------ |
| All requests fail 401 right after deploy     | `KMS_MODE=aws` but pod's IRSA role lacks `kms:Decrypt`       |
| Some keys 401, others fine                   | Those rows were seeded with plaintext while in dev mode      |
| Pod crashes at boot in aws mode              | `boto3` not installed (`poetry install`) or bad `AWS_REGION` |
| CloudTrail shows spikes in `Decrypt` volume  | In-memory cache misconfigured; check `CACHE_TTL_SECS` in auth|
