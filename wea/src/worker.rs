// Settlement worker — single process, no leader election in MVP.
//
// One tick does three jobs in sequence:
//   1. Broadcast claim: pending → broadcasting (assign tx_hash via mock RPC).
//   2. Confirmer:       broadcasting → confirmed (mock RPC reports success).
//   3. Callback:        confirmed → done (POST HMAC-signed body to caller).
//
// Real Wea splits these into separate workers with Redis leader election
// (wea/DESIGN.md §3/§4/§7). MVP collapses them so a single binary closes the
// loop end-to-end — sufficient for demos and contract tests.
//
// Concurrency note: we use SELECT ... FOR UPDATE SKIP LOCKED to claim rows
// atomically, so when this scales to N replicas we just remove the single-
// process assumption; the claim sql is already multi-writer safe.

use anyhow::Result;
use chrono::Utc;
use hmac::{Hmac, Mac};
use sha2::Sha256;
use sqlx::{MySqlPool, Row};
use std::{sync::Arc, time::Duration};

use crate::{kms::KmsClient, mock_rpc::MockRpc, models::{callback_status, status}};

type HmacSha256 = Hmac<Sha256>;

/// Callback retry schedule (5m / 15m / 1h / 6h / 24h). Sticks to the
/// DESIGN.md §7 numbers — change here = change docs.
const RETRY_INTERVALS_SECS: [u64; 5] = [300, 900, 3600, 21600, 86400];

pub struct Worker {
    db:   MySqlPool,
    rpc:  Arc<MockRpc>,
    http: reqwest::Client,
    kms:  Arc<KmsClient>,
}

impl Worker {
    /// Convenience constructor that uses identity (dev) KMS mode.
    /// For production, use `new_with_kms` and pass a KMS client built via
    /// `KmsClient::from_env().await` so the KMS_MODE env is respected.
    /// Also used in integration tests that don't need real KMS.
    #[allow(dead_code)]
    pub fn new(db: MySqlPool) -> Self {
        Self::new_with_kms(db, Arc::new(KmsClient::dev()))
    }

    /// Production path: inject a pre-built KmsClient (allows KMS_MODE=aws).
    pub fn new_with_kms(db: MySqlPool, kms: Arc<KmsClient>) -> Self {
        Self {
            db,
            rpc: Arc::new(MockRpc),
            http: reqwest::Client::builder()
                .timeout(Duration::from_secs(10))
                .build()
                .expect("reqwest build"),
            kms,
        }
    }

    /// Run forever. Each pass advances at most one row through each phase so
    /// no single slow callback starves the others.
    pub async fn run(self: Arc<Self>) {
        tracing::info!("worker.start mode=single-process retry_intervals_secs={:?}", RETRY_INTERVALS_SECS);
        loop {
            if let Err(e) = self.broadcast_pass().await {
                tracing::warn!(error = ?e, "worker.broadcast_pass_error");
            }
            if let Err(e) = self.confirm_pass().await {
                tracing::warn!(error = ?e, "worker.confirm_pass_error");
            }
            if let Err(e) = self.callback_pass().await {
                tracing::warn!(error = ?e, "worker.callback_pass_error");
            }
            tokio::time::sleep(Duration::from_millis(300)).await;
        }
    }

    // ── 1. Broadcast ──────────────────────────────────────────────
    async fn broadcast_pass(&self) -> Result<()> {
        let mut tx = self.db.begin().await?;
        // Take one. Real impl: claim a batch.
        let row = sqlx::query(
            r#"SELECT id, signed_tx_b64
               FROM settlements
               WHERE status = ?
               ORDER BY created_at
               LIMIT 1
               FOR UPDATE SKIP LOCKED"#,
        )
        .bind(status::PENDING)
        .fetch_optional(&mut *tx)
        .await?;

        let Some(row) = row else { tx.rollback().await.ok(); return Ok(()); };
        let id:            String = row.try_get("id")?;
        let signed_tx_b64: String = row.try_get("signed_tx_b64")?;

        let tx_hash = self.rpc.send_transaction(&signed_tx_b64).await?;
        sqlx::query(
            r#"UPDATE settlements
               SET status = ?, tx_hash = ?, broadcast_at = NOW(6)
               WHERE id = ?"#,
        )
        .bind(status::BROADCASTING)
        .bind(&tx_hash)
        .bind(&id)
        .execute(&mut *tx)
        .await?;
        tx.commit().await?;
        tracing::info!(settlement_id=%id, tx_hash=%tx_hash, "settlement.broadcasting");
        Ok(())
    }

    // ── 2. Confirm ────────────────────────────────────────────────
    async fn confirm_pass(&self) -> Result<()> {
        let row = sqlx::query(
            r#"SELECT id, tx_hash, broadcast_at
               FROM settlements
               WHERE status = ? AND tx_hash IS NOT NULL
               ORDER BY broadcast_at
               LIMIT 1"#,
        )
        .bind(status::BROADCASTING)
        .fetch_optional(&self.db)
        .await?;

        let Some(row) = row else { return Ok(()); };
        let id:           String                      = row.try_get("id")?;
        let tx_hash:      String                      = row.try_get("tx_hash")?;
        let broadcast_at: chrono::NaiveDateTime       = row.try_get("broadcast_at")?;
        let age = chrono::Utc::now().naive_utc().signed_duration_since(broadcast_at);
        let age = Duration::from_millis(age.num_milliseconds().max(0) as u64);

        match self.rpc.get_signature_status(&tx_hash, age).await? {
            Some(Ok(())) => {
                sqlx::query(
                    r#"UPDATE settlements
                       SET status = ?, confirmed_at = NOW(6),
                           callback_status = ?, callback_next_retry = NOW(6)
                       WHERE id = ?"#,
                )
                .bind(status::CONFIRMED)
                .bind(callback_status::PENDING)
                .bind(&id)
                .execute(&self.db)
                .await?;
                tracing::info!(settlement_id=%id, tx_hash=%tx_hash, "settlement.confirmed");
            }
            Some(Err(chain_err)) => {
                sqlx::query(
                    r#"UPDATE settlements
                       SET status = ?, status_reason = ?,
                           callback_status = ?, callback_next_retry = NOW(6)
                       WHERE id = ?"#,
                )
                .bind(status::FAILED)
                .bind(format!("chain_error: {chain_err}"))
                .bind(callback_status::PENDING)
                .bind(&id)
                .execute(&self.db)
                .await?;
                tracing::warn!(settlement_id=%id, reason=%chain_err, "settlement.failed_onchain");
            }
            None => {
                // still pending; next tick will check again
            }
        }
        Ok(())
    }

    // ── 3. Callback ───────────────────────────────────────────────
    async fn callback_pass(&self) -> Result<()> {
        // Claim one ready-to-send callback under a row lock so retries don't
        // double-send if we scale to N workers later.
        let mut tx = self.db.begin().await?;
        let row = sqlx::query(
            r#"SELECT id, payment_order_id, status, tx_hash, confirmed_at,
                      callback_url, callback_secret_enc, callback_attempt_count
               FROM settlements
               WHERE callback_status = ?
                 AND (callback_next_retry IS NULL OR callback_next_retry <= NOW(6))
                 AND status IN (?, ?)
               ORDER BY callback_next_retry
               LIMIT 1
               FOR UPDATE SKIP LOCKED"#,
        )
        .bind(callback_status::PENDING)
        .bind(status::CONFIRMED)
        .bind(status::FAILED)
        .fetch_optional(&mut *tx)
        .await?;

        let Some(row) = row else { tx.rollback().await.ok(); return Ok(()); };
        let id:               String = row.try_get("id")?;
        let payment_order_id: String = row.try_get("payment_order_id")?;
        let setl_status:      String = row.try_get("status")?;
        let tx_hash:          Option<String> = row.try_get("tx_hash")?;
        let confirmed_at:     Option<chrono::NaiveDateTime> = row.try_get("confirmed_at")?;
        let callback_url:     String = row.try_get("callback_url")?;
        let enc_bytes:        Vec<u8> = row.try_get("callback_secret_enc")?;
        let attempt_count:    i32 = row.try_get("callback_attempt_count")?;

        // KMS-decrypt the stored callback secret before HMAC signing.
        let secret_bytes = match self.kms.decrypt(&enc_bytes).await {
            Ok(b) => b,
            Err(e) => {
                tracing::error!(settlement_id=%id, error=?e, "callback.kms_decrypt_failed");
                // Release the in_flight lock so it can retry.
                sqlx::query(r#"UPDATE settlements SET callback_status = ? WHERE id = ?"#)
                    .bind(callback_status::PENDING)
                    .bind(&id)
                    .execute(&self.db)
                    .await.ok();
                return Err(e);
            }
        };

        // Mark in_flight inside the same tx, then commit so other workers
        // don't try to send it concurrently.
        sqlx::query(r#"UPDATE settlements SET callback_status = ? WHERE id = ?"#)
            .bind(callback_status::IN_FLIGHT)
            .bind(&id)
            .execute(&mut *tx).await?;
        tx.commit().await?;

        let body = serde_json::json!({
            "settlement_id":     id,
            "payment_order_id":  payment_order_id,
            "status":            setl_status,
            "tx_hash":           tx_hash,
            "confirmed_at":      confirmed_at.map(|t| chrono::Utc.from_utc_datetime(&t).to_rfc3339()),
        });
        let body_bytes = serde_json::to_vec(&body)?;
        let sig = hmac_sha256_hex(&secret_bytes, &body_bytes);
        let ts  = Utc::now().timestamp();

        let resp = self.http
            .post(&callback_url)
            .header("Content-Type",       "application/json")
            .header("X-Wea-Timestamp",    ts.to_string())
            .header("X-Wea-Signature",    sig)
            .header("X-Wea-Settlement-Id", id.clone())
            .body(body_bytes)
            .send()
            .await;

        let ok = matches!(&resp, Ok(r) if r.status().is_success());
        if ok {
            // Confirmed → done. Failed stays failed (semantically still terminal).
            let final_status = match setl_status.as_str() {
                s if s == status::CONFIRMED => status::DONE,
                other => other, // FAILED stays FAILED
            };
            sqlx::query(
                r#"UPDATE settlements
                   SET callback_status = ?, status = ?
                   WHERE id = ?"#,
            )
            .bind(callback_status::SENT_OK)
            .bind(final_status)
            .bind(&id)
            .execute(&self.db)
            .await?;
            tracing::info!(settlement_id=%id, "callback.sent_ok");
        } else {
            let new_attempt = attempt_count + 1;
            if (new_attempt as usize) >= RETRY_INTERVALS_SECS.len() {
                sqlx::query(
                    r#"UPDATE settlements
                       SET callback_status = ?, callback_attempt_count = ?
                       WHERE id = ?"#,
                )
                .bind(callback_status::FAIL_DEAD_LETTER)
                .bind(new_attempt)
                .bind(&id)
                .execute(&self.db)
                .await?;
                tracing::error!(settlement_id=%id, attempts=new_attempt,
                                "callback.dead_letter");
            } else {
                let interval = RETRY_INTERVALS_SECS[new_attempt as usize];
                let next = Utc::now().naive_utc() + chrono::Duration::seconds(interval as i64);
                sqlx::query(
                    r#"UPDATE settlements
                       SET callback_status = ?,
                           callback_attempt_count = ?,
                           callback_last_attempt = NOW(6),
                           callback_next_retry = ?
                       WHERE id = ?"#,
                )
                .bind(callback_status::PENDING)
                .bind(new_attempt)
                .bind(next)
                .bind(&id)
                .execute(&self.db)
                .await?;
                let reason: String = match resp {
                    Ok(r)  => format!("http_{}", r.status().as_u16()),
                    Err(e) => format!("transport: {e}"),
                };
                tracing::warn!(settlement_id=%id, attempt=new_attempt,
                               next_retry_secs=interval, reason=%reason,
                               "callback.retry_scheduled");
            }
        }
        Ok(())
    }
}

fn hmac_sha256_hex(key: &[u8], msg: &[u8]) -> String {
    let mut mac = HmacSha256::new_from_slice(key).expect("hmac accepts any key length");
    mac.update(msg);
    hex::encode(mac.finalize().into_bytes())
}


// Bring NaiveDateTime → DateTime<Utc> trait into scope for the callback body.
use chrono::TimeZone;
