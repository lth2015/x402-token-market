// Settlement domain types — kept thin; sqlx hydrates them straight from rows.

use chrono::NaiveDateTime;
use serde::{Deserialize, Serialize};
use sqlx::FromRow;

/// Lifecycle states for a settlement row.
/// String-backed to match the `chk_settlements_status` CHECK constraint in
/// wea/db/migrations/001_init.up.sql — keep these in lock-step.
pub mod status {
    pub const PENDING:          &str = "pending";
    pub const BROADCASTING:     &str = "broadcasting";
    pub const CONFIRMED:        &str = "confirmed";
    pub const DONE:             &str = "done";
    pub const FAILED:           &str = "failed";
    // TODO(phase2): surface callback_failed as a distinct terminal state
    // (currently a settlement stays FAILED regardless of callback outcome).
    // This constant is retained so the DB CHECK constraint value is
    // documented in code.
    #[allow(dead_code)]
    pub const CALLBACK_FAILED:  &str = "callback_failed";
}

pub mod callback_status {
    pub const PENDING:          &str = "pending";
    pub const IN_FLIGHT:        &str = "in_flight";
    pub const SENT_OK:          &str = "sent_ok";
    pub const FAIL_DEAD_LETTER: &str = "fail_dead_letter";
}

/// Row shape used by workers — includes columns the workers actually read.
/// (Not every column from the schema; e.g. parsed_tx / status_reason are
/// orthogonal to the loop logic.)
///
/// TODO(phase2): replace raw sqlx::query() with sqlx::query_as!(SettlementRow, ...)
/// macros once we have a compile-time DB connection for macro expansion in CI.
#[derive(Debug, Clone, FromRow)]
#[allow(dead_code)] // Fields are hydrated via FromRow; the struct is the canonical query shape.
pub struct SettlementRow {
    pub id:                       String,
    pub payment_order_id:         String,
    pub expected_amount_micro:    i64,
    pub expected_recipient:       String,
    pub expected_asset:           String,
    pub signed_tx_b64:            String,
    pub confirmation_level:       String,
    pub status:                   String,
    pub tx_hash:                  Option<String>,
    pub broadcast_at:             Option<NaiveDateTime>,
    pub confirmed_at:             Option<NaiveDateTime>,
    pub callback_url:             String,
    pub callback_secret_enc:      Vec<u8>,
    pub callback_attempt_count:   i32,
    pub created_at:               NaiveDateTime,
}

/// Request body for POST /v1/settlements
/// `callback_secret` is delivered out-of-band by the caller (e.g. x402) and
/// stored as opaque bytes in `callback_secret_enc`. In DEV mode (KMS_MODE=dev)
/// we treat the bytes as plaintext — matching token-api's `DevKmsClient` so
/// the local stack stays AWS-free. See netstars/token/api/KMS.md.
#[derive(Debug, Deserialize)]
pub struct CreateSettlementRequest {
    pub payment_order_id:        String,
    pub expected_amount_micro:   i64,
    pub expected_recipient:      String,
    #[serde(default = "default_asset")]
    pub expected_asset:          String,
    /// Pre-signed base64 USDC transfer (Solana). MVP doesn't parse it; the
    /// mock broadcaster just hashes a fake tx id. Real Wea will verify
    /// recipient/amount/nonce match `expected_*` before broadcast.
    pub signed_tx_b64:           String,
    pub callback_url:            String,
    pub callback_secret:         String,
    #[serde(default = "default_conf_level")]
    pub confirmation_level:      String,
}

fn default_asset() -> String      { "USDC".into() }
fn default_conf_level() -> String { "confirmed".into() }

#[derive(Debug, Serialize)]
pub struct CreateSettlementResponse {
    pub settlement_id:                 String,
    pub status:                        &'static str,
    pub estimated_completion_seconds:  u32,
}

#[derive(Debug, Serialize)]
pub struct GetSettlementResponse {
    pub settlement_id:        String,
    pub payment_order_id:     String,
    pub status:               String,
    pub tx_hash:              Option<String>,
    pub broadcast_at:         Option<chrono::DateTime<chrono::Utc>>,
    pub confirmed_at:         Option<chrono::DateTime<chrono::Utc>>,
    pub callback_status:      Option<String>,
    pub callback_attempts:    i32,
}
