// KMS client for encrypting/decrypting callback secrets at rest.
//
// # Design (DESIGN §8 / ARCHITECTURE KMS constraint)
//
// AWS KMS ap-northeast-1 (Tokyo) direct — no CloudHSM, no YubiHSM, no Netstars
// internal KMS. Only the `aws_sdk_kms` crate talking directly to AWS.
//
// ## Build modes
//
//   Default (no feature):
//     KMS_MODE=dev is the only option. Identity mode: encrypt = store plaintext
//     bytes tagged with 0x00, decrypt = strip tag and return. No AWS credentials
//     required. Use for local dev on Apple Silicon.
//
//   cargo build --features aws-kms  (requires Rust ≥ 1.91.1):
//     KMS_MODE=aws uses real AWS KMS kms:Encrypt / kms:Decrypt via the CMK
//     identified by KMS_KEY_ID env var.
//     Region is HARD-CODED to "ap-northeast-1" (Tokyo) — architectural constraint.
//     KMS_MODE=dev still works even with this feature enabled.
//
// ## Wire format
//
//   Bytes stored in DB (callback_secret_enc VARBINARY(512)):
//     byte[0] = tag:  0x00 = dev plaintext   0x01 = AWS KMS ciphertext
//     byte[1..] = payload
//
//   The tag allows runtime mode detection and warns on mismatch.

use anyhow::Result;
#[cfg(feature = "aws-kms")]
use anyhow::Context;
use std::env;

/// Architecturally constrained to ap-northeast-1 (Tokyo). Never change
/// without Wea Japan architecture review.
// KMS_REGION is used at runtime by the aws-kms feature path. Without the
// feature it is a documented constant for architecture reference.
#[allow(dead_code)]
pub const KMS_REGION: &str = "ap-northeast-1";

const TAG_DEV: u8 = 0x00;
const TAG_AWS: u8 = 0x01;

pub struct KmsClient {
    inner: KmsInner,
}

enum KmsInner {
    Dev,
    #[cfg(feature = "aws-kms")]
    Aws {
        key_id: String,
        client: aws_sdk_kms::Client,
    },
    #[cfg(not(feature = "aws-kms"))]
    #[allow(dead_code)]
    AwsUnavailable,
}

impl KmsClient {
    /// Synchronous dev-mode constructor. No AWS credentials needed.
    pub fn dev() -> Self {
        Self { inner: KmsInner::Dev }
    }

    /// Build from environment. Reads KMS_MODE (default: "dev") and KMS_KEY_ID.
    ///
    /// If `KMS_MODE=aws` but the `aws-kms` feature is not enabled, this panics
    /// at startup — better to fail fast than silently fall back to plaintext.
    pub async fn from_env() -> Self {
        let mode = env::var("KMS_MODE").unwrap_or_else(|_| "dev".into());
        match mode.to_lowercase().as_str() {
            "aws" => {
                #[cfg(feature = "aws-kms")]
                {
                    let key_id = env::var("KMS_KEY_ID")
                        .expect("KMS_MODE=aws requires KMS_KEY_ID (ARN or alias)");
                    tracing::info!(
                        kms_mode = "aws",
                        region   = KMS_REGION,
                        key_id   = %key_id,
                        "kms.init: AWS KMS ap-northeast-1 (Tokyo) direct"
                    );
                    let sdk_config = aws_config::defaults(aws_config::BehaviorVersion::latest())
                        .region(aws_config::meta::region::RegionProviderChain::first_try(
                            aws_sdk_kms::config::Region::new(KMS_REGION),
                        ))
                        .load()
                        .await;
                    let client = aws_sdk_kms::Client::new(&sdk_config);
                    Self { inner: KmsInner::Aws { key_id, client } }
                }
                #[cfg(not(feature = "aws-kms"))]
                panic!(
                    "KMS_MODE=aws but wea was compiled without --features aws-kms. \
                     Rebuild with: cargo build --features aws-kms  \
                     (requires Rust ≥ 1.91.1 and the aws-sdk-kms crate)"
                );
            }
            _ => {
                tracing::info!(
                    kms_mode = "dev",
                    "kms.init: identity mode (TAG_DEV). \
                     Set KMS_MODE=aws + KMS_KEY_ID for production. \
                     Build with --features aws-kms to enable."
                );
                Self { inner: KmsInner::Dev }
            }
        }
    }

    /// Encrypt `plaintext` for storage. Returns tagged ciphertext bytes.
    pub async fn encrypt(&self, plaintext: &[u8]) -> Result<Vec<u8>> {
        match &self.inner {
            KmsInner::Dev => {
                let mut out = Vec::with_capacity(1 + plaintext.len());
                out.push(TAG_DEV);
                out.extend_from_slice(plaintext);
                Ok(out)
            }
            #[cfg(feature = "aws-kms")]
            KmsInner::Aws { key_id, client } => {
                let res = client
                    .encrypt()
                    .key_id(key_id)
                    .plaintext(aws_sdk_kms::primitives::Blob::new(plaintext.to_vec()))
                    .send()
                    .await
                    .context("kms:Encrypt failed")?;
                let blob = res.ciphertext_blob()
                    .context("kms:Encrypt returned no ciphertext")?;
                let mut out = Vec::with_capacity(1 + blob.as_ref().len());
                out.push(TAG_AWS);
                out.extend_from_slice(blob.as_ref());
                Ok(out)
            }
            #[cfg(not(feature = "aws-kms"))]
            KmsInner::AwsUnavailable => {
                unreachable!("AwsUnavailable variant only constructed when feature is absent")
            }
        }
    }

    /// Decrypt bytes previously produced by `encrypt`.
    pub async fn decrypt(&self, ciphertext: &[u8]) -> Result<Vec<u8>> {
        if ciphertext.is_empty() {
            return Ok(vec![]);
        }
        let tag     = ciphertext[0];
        let payload = &ciphertext[1..];

        match tag {
            TAG_DEV => {
                #[cfg(feature = "aws-kms")]
                if matches!(self.inner, KmsInner::Aws { .. }) {
                    tracing::warn!(
                        "kms.decrypt: dev-tagged row (TAG_DEV=0x00) in KMS_MODE=aws. \
                         Re-encrypt this row before production go-live."
                    );
                }
                Ok(payload.to_vec())
            }
            TAG_AWS => {
                #[cfg(feature = "aws-kms")]
                {
                    let client = match &self.inner {
                        KmsInner::Aws { client, .. } => client,
                        KmsInner::Dev => anyhow::bail!(
                            "kms.decrypt: TAG_AWS (0x01) requires KMS_MODE=aws"
                        ),
                    };
                    let res = client
                        .decrypt()
                        .ciphertext_blob(aws_sdk_kms::primitives::Blob::new(payload.to_vec()))
                        .send()
                        .await
                        .context("kms:Decrypt failed")?;
                    let plain = res.plaintext()
                        .context("kms:Decrypt returned no plaintext")?;
                    Ok(plain.as_ref().to_vec())
                }
                #[cfg(not(feature = "aws-kms"))]
                anyhow::bail!(
                    "kms.decrypt: TAG_AWS (0x01) found but aws-kms feature not enabled. \
                     Rebuild with --features aws-kms."
                );
            }
            other => anyhow::bail!("kms.decrypt: unknown tag byte 0x{:02x}", other),
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[tokio::test]
    async fn dev_mode_roundtrip() {
        unsafe { env::set_var("KMS_MODE", "dev") };
        let client = KmsClient::from_env().await;
        let secret = b"test-hmac-secret-value";
        let enc = client.encrypt(secret).await.unwrap();
        assert_eq!(enc[0], TAG_DEV);
        let dec = client.decrypt(&enc).await.unwrap();
        assert_eq!(dec, secret.as_ref());
    }

    #[tokio::test]
    async fn dev_empty_roundtrip() {
        unsafe { env::set_var("KMS_MODE", "dev") };
        let client = KmsClient::from_env().await;
        let enc = client.encrypt(b"").await.unwrap();
        let dec = client.decrypt(&enc).await.unwrap();
        assert!(dec.is_empty());
    }

    #[tokio::test]
    async fn decrypt_empty_slice_returns_empty() {
        let client = KmsClient::dev();
        let dec = client.decrypt(&[]).await.unwrap();
        assert!(dec.is_empty());
    }

    #[tokio::test]
    async fn dev_constructed_directly() {
        let client = KmsClient::dev();
        let enc = client.encrypt(b"abc").await.unwrap();
        let dec = client.decrypt(&enc).await.unwrap();
        assert_eq!(dec, b"abc");
    }
}
