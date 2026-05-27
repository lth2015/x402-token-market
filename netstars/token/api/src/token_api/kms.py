"""
KMS abstraction for API-key-secret encryption at rest.

Why this exists:
    HMAC request signing (token_api.auth) requires the SERVER to recompute
    the signature, which means it needs the plaintext API secret. Storing
    plaintext in MySQL is a non-starter for production, so the `agent_keys`
    table has a `key_secret_enc VARBINARY(512)` column that holds an opaque
    ciphertext blob. This module owns the decrypt step.

Two implementations:

    DevKmsClient (KMS_MODE=dev — default for local + tests)
        Treats the column bytes as raw plaintext. Zero AWS dependency, zero
        latency. Seeded via the migration as `secret_localdev_test`.

    AwsKmsClient (KMS_MODE=aws — QA + prod)
        Wraps boto3 `kms:Decrypt` (and `kms:Encrypt` for the seeding CLI).
        AWS KMS handles a 4 KiB plaintext limit per call, well above our
        ~32-byte API secrets, so we encrypt the secret directly — no
        envelope encryption / data keys needed. AWS recommends data keys
        only for >4 KiB payloads or high-throughput symmetric workloads.

        Authentication uses the default AWS credential chain:
          - In EKS: IAM Roles for Service Accounts (IRSA) — pod gets a
            scoped IAM role with `kms:Decrypt` on the specific key alias.
          - Locally: developer's AWS_ACCESS_KEY_ID / SSO profile.
        We deliberately do NOT pass static keys via env vars.

Caching:
    The decrypt path is wrapped by token_api.auth's 60-second in-memory
    AgentKeyRecord cache. So a hot agent key triggers KMS once per minute,
    not per request. At < 100 keys and 60s TTL, KMS load and cost are
    negligible (~$0.03 per 10K calls).

Audit:
    AWS KMS logs every Decrypt call to CloudTrail with the caller identity
    and key id. Operators don't need additional audit at the app layer.
"""
from __future__ import annotations

import asyncio
import logging
import os
from typing import Optional, Protocol

log = logging.getLogger("token-api.kms")


class KmsError(RuntimeError):
    pass


class KmsClient(Protocol):
    """The shape any KMS implementation must expose."""

    async def decrypt(self, ciphertext: bytes) -> bytes:
        """Return the plaintext bytes. Raise KmsError on any failure."""
        ...

    async def encrypt(self, plaintext: bytes, *, key_id: Optional[str] = None) -> bytes:
        """Return the ciphertext bytes. `key_id` overrides the configured default."""
        ...


# ── Dev (no AWS) ──────────────────────────────────────────────────
class DevKmsClient:
    """
    Identity transform. Stored bytes ARE the plaintext.

    Suitable for: local dev, integration tests, any environment where the
    DB row is already as sensitive as the secret it 'protects' (e.g. a
    seeded demo).
    """

    mode = "dev"

    async def decrypt(self, ciphertext: bytes) -> bytes:
        return bytes(ciphertext)

    async def encrypt(self, plaintext: bytes, *, key_id: Optional[str] = None) -> bytes:
        return bytes(plaintext)


# ── AWS KMS ───────────────────────────────────────────────────────
class AwsKmsClient:
    """Thin boto3 wrapper. Sync calls offloaded to a thread to keep the event loop free."""

    mode = "aws"

    def __init__(self, *, region: str, default_key_id: Optional[str]):
        # Lazy import so KMS_MODE=dev doesn't require boto3 at import time
        try:
            import boto3  # type: ignore[import-not-found]
        except ImportError as e:  # pragma: no cover
            raise KmsError(
                "boto3 not installed; required for KMS_MODE=aws. "
                "Run `poetry install` (boto3 is in pyproject.toml)."
            ) from e

        self._client = boto3.client("kms", region_name=region)
        self._default_key_id = default_key_id
        self._region = region
        log.info("kms.aws.init region=%s default_key=%s", region, default_key_id or "(none)")

    async def decrypt(self, ciphertext: bytes) -> bytes:
        try:
            res = await asyncio.to_thread(self._client.decrypt, CiphertextBlob=bytes(ciphertext))
        except Exception as e:  # boto3 raises ClientError + many sub-types
            raise KmsError(f"AWS KMS Decrypt failed: {e}") from e
        plaintext = res.get("Plaintext")
        if not isinstance(plaintext, (bytes, bytearray)):
            raise KmsError(f"AWS KMS Decrypt returned non-bytes Plaintext: {type(plaintext)!r}")
        return bytes(plaintext)

    async def encrypt(self, plaintext: bytes, *, key_id: Optional[str] = None) -> bytes:
        kid = key_id or self._default_key_id
        if not kid:
            raise KmsError(
                "no key_id: pass --key-id to the CLI or set AWS_KMS_KEY_ALIAS env var"
            )
        try:
            res = await asyncio.to_thread(
                self._client.encrypt, KeyId=kid, Plaintext=bytes(plaintext),
            )
        except Exception as e:
            raise KmsError(f"AWS KMS Encrypt failed: {e}") from e
        ct = res.get("CiphertextBlob")
        if not isinstance(ct, (bytes, bytearray)):
            raise KmsError(f"AWS KMS Encrypt returned non-bytes CiphertextBlob: {type(ct)!r}")
        return bytes(ct)


# ── Factory + module singleton ────────────────────────────────────
_singleton: Optional[KmsClient] = None


def make_kms_client() -> KmsClient:
    """Build a KmsClient from env. Idempotent — repeated calls reuse the singleton."""
    global _singleton
    if _singleton is not None:
        return _singleton

    mode = os.environ.get("KMS_MODE", "dev").strip().lower()
    if mode == "dev":
        _singleton = DevKmsClient()
    elif mode == "aws":
        region = os.environ.get("AWS_REGION") or os.environ.get("AWS_DEFAULT_REGION") or "ap-northeast-1"
        key_id = os.environ.get("AWS_KMS_KEY_ALIAS")
        _singleton = AwsKmsClient(region=region, default_key_id=key_id)
    else:
        raise KmsError(f"Unknown KMS_MODE={mode!r}; expected 'dev' or 'aws'")
    return _singleton


def get_kms_client() -> KmsClient:
    """Return the current singleton; lazily creates one if absent."""
    return _singleton or make_kms_client()


def _reset_for_tests() -> None:  # pragma: no cover
    """Test hook to drop the singleton between unit tests."""
    global _singleton
    _singleton = None
