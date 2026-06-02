// USDC depeg guardian — DESIGN §5.
//
// # Behaviour
//
//   Every `CHECK_INTERVAL_SECS` seconds the worker calls `PriceFeed::fetch()`
//   to get the current USDC/USD price. It then:
//
//   1. Persists the sample to `price_history`.
//   2. Reads thresholds from `system_flags`:
//        depeg_low_threshold   (default 0.97)
//        depeg_high_threshold  (default 1.03)
//        depeg_window_minutes  (default 5)
//   3. If `consecutive_outside_window >= window` and the flag
//      `accepting_new_settlements` is currently true → flips it to false.
//
//   Auto-recovery is intentionally absent: per DESIGN §5 a human must
//   re-enable acceptance once a depeg event clears.
//
// # Price feed abstraction
//
//   `PriceFeed` is a trait so tests and dev runs can inject `MockPriceFeed`.
//   Production wires in `HttpPriceFeed` (CoinGecko simple price endpoint).
//
//   TODO (production): add a second source (e.g. Chainlink on-chain feed) and
//   average the two as per DESIGN §5 `fetch_aggregate_price`.

use anyhow::Result;
use sqlx::MySqlPool;
use std::{future::Future, pin::Pin, time::Duration};

pub const CHECK_INTERVAL_SECS: u64 = 60;

// ── Price feed trait ─────────────────────────────────────────────────────────

pub trait PriceFeed: Send + Sync {
    /// Return current USDC/USD price. Error means "source unavailable".
    fn fetch(&self) -> Pin<Box<dyn Future<Output = Result<f64>> + Send + '_>>;
}

// ── HTTP price feed (CoinGecko simple price) ─────────────────────────────────

pub struct HttpPriceFeed {
    client: reqwest::Client,
}

impl HttpPriceFeed {
    pub fn new() -> Self {
        Self {
            client: reqwest::Client::builder()
                .timeout(Duration::from_secs(10))
                .build()
                .expect("reqwest build"),
        }
    }
}

impl PriceFeed for HttpPriceFeed {
    fn fetch(&self) -> Pin<Box<dyn Future<Output = Result<f64>> + Send + '_>> {
        Box::pin(async move {
            // CoinGecko free tier — no API key required.
            // Returns e.g. {"usd-coin":{"usd":1.0002}}
            let url = "https://api.coingecko.com/api/v3/simple/price\
                       ?ids=usd-coin&vs_currencies=usd";
            let v: serde_json::Value = self.client.get(url).send().await?
                .json().await?;
            let price = v.pointer("/usd-coin/usd")
                .and_then(serde_json::Value::as_f64)
                .ok_or_else(|| anyhow::anyhow!("coingecko: missing /usd-coin/usd"))?;
            Ok(price)
        })
    }
}

// ── Mock price feed (dev / test) ─────────────────────────────────────────────

/// Injectable mock that returns a fixed price on each call.
/// Tests can share an `Arc<tokio::sync::Mutex<MockPriceFeed>>` and mutate
/// `price` between calls to drive depeg scenarios.
pub struct MockPriceFeed {
    pub price: f64,
}

impl MockPriceFeed {
    pub fn new(price: f64) -> Self { Self { price } }
}

impl PriceFeed for MockPriceFeed {
    fn fetch(&self) -> Pin<Box<dyn Future<Output = Result<f64>> + Send + '_>> {
        let price = self.price;
        Box::pin(async move { Ok(price) })
    }
}

// ── System-flags helpers ─────────────────────────────────────────────────────

/// Read a boolean system flag.
pub async fn read_bool_flag(db: &MySqlPool, key: &str) -> Option<bool> {
    let row: Option<serde_json::Value> = sqlx::query_scalar(
        r#"SELECT JSON_UNQUOTE(JSON_EXTRACT(value, '$.value'))
           FROM system_flags WHERE `key` = ?"#,
    )
    .bind(key)
    .fetch_optional(db)
    .await
    .ok()
    .flatten();

    row.and_then(|v| {
        // JSON_UNQUOTE returns "true" / "false" strings.
        match v.as_str() {
            Some("true")  => Some(true),
            Some("false") => Some(false),
            _ => v.as_bool(),
        }
    })
}

/// Read a float system flag.
pub async fn read_f64_flag(db: &MySqlPool, key: &str) -> Option<f64> {
    let row: Option<serde_json::Value> = sqlx::query_scalar(
        r#"SELECT JSON_UNQUOTE(JSON_EXTRACT(value, '$.value'))
           FROM system_flags WHERE `key` = ?"#,
    )
    .bind(key)
    .fetch_optional(db)
    .await
    .ok()
    .flatten();

    row.and_then(|v| match v.as_str() {
        Some(s) => s.parse().ok(),
        None    => v.as_f64(),
    })
}

/// Read an i64 system flag.
pub async fn read_i64_flag(db: &MySqlPool, key: &str) -> Option<i64> {
    let row: Option<serde_json::Value> = sqlx::query_scalar(
        r#"SELECT JSON_UNQUOTE(JSON_EXTRACT(value, '$.value'))
           FROM system_flags WHERE `key` = ?"#,
    )
    .bind(key)
    .fetch_optional(db)
    .await
    .ok()
    .flatten();

    row.and_then(|v| match v.as_str() {
        Some(s) => s.parse().ok(),
        None    => v.as_i64(),
    })
}

/// Flip `accepting_new_settlements` to `false` (or `true`) and write audit info.
pub async fn set_accepting_settlements(db: &MySqlPool, value: bool, by: &str) -> Result<()> {
    sqlx::query(
        r#"UPDATE system_flags
           SET value = JSON_OBJECT('value', ?), updated_by = ?
           WHERE `key` = 'accepting_new_settlements'"#,
    )
    .bind(value)
    .bind(by)
    .execute(db)
    .await?;
    Ok(())
}

// ── Depeg monitor loop ───────────────────────────────────────────────────────

/// Spawn-and-forget: runs until process exits.
///
/// Call this from `worker::Worker::run` alongside the existing broadcast/confirm/
/// callback passes.  It runs in its own tokio task with a 60-second tick.
pub async fn run_depeg_monitor(db: MySqlPool, feed: Box<dyn PriceFeed>) {
    tracing::info!("depeg_monitor.start");
    let mut consecutive_outside: u32 = 0;

    loop {
        let price = match feed.fetch().await {
            Ok(p)  => p,
            Err(e) => {
                tracing::warn!(error=?e, "depeg_monitor.price_fetch_failed");
                tokio::time::sleep(Duration::from_secs(CHECK_INTERVAL_SECS)).await;
                continue;
            }
        };

        // Persist sample.
        if let Err(e) = sqlx::query(
            r#"INSERT INTO price_history (asset, source, price_usd)
               VALUES ('USDC', 'coingecko', ?)"#,
        )
        .bind(price)
        .execute(&db)
        .await
        {
            tracing::warn!(error=?e, "depeg_monitor.price_history_insert_failed");
        }

        let low    = read_f64_flag(&db, "depeg_low_threshold" ).await.unwrap_or(0.97);
        let high   = read_f64_flag(&db, "depeg_high_threshold").await.unwrap_or(1.03);
        let window = read_i64_flag(&db, "depeg_window_minutes" ).await.unwrap_or(5) as u32;

        let outside = price < low || price > high;
        tracing::debug!(
            price, low, high, window, outside, consecutive_outside,
            "depeg_monitor.tick"
        );

        if outside {
            consecutive_outside += 1;
            tracing::warn!(
                price, low, high, consecutive_outside, window,
                "depeg_monitor.outside_band"
            );

            if consecutive_outside >= window {
                // Only act if currently accepting — prevents spam updates.
                let currently_accepting = read_bool_flag(&db, "accepting_new_settlements")
                    .await
                    .unwrap_or(true);
                if currently_accepting {
                    match set_accepting_settlements(&db, false, "depeg_monitor").await {
                        Ok(()) => {
                            tracing::error!(
                                price, low, high,
                                consecutive_outside,
                                "depeg_monitor.protection_engaged: \
                                 accepting_new_settlements=false. \
                                 Manual re-enable required after price recovers."
                            );
                        }
                        Err(e) => {
                            tracing::error!(error=?e,
                                "depeg_monitor.flag_update_failed");
                        }
                    }
                }
            }
        } else {
            if consecutive_outside > 0 {
                tracing::info!(
                    price, consecutive_outside,
                    "depeg_monitor.back_in_band \
                     (auto-recovery disabled; operator must re-enable)"
                );
            }
            consecutive_outside = 0;
        }

        tokio::time::sleep(Duration::from_secs(CHECK_INTERVAL_SECS)).await;
    }
}

// ── Guard used by HTTP handlers ──────────────────────────────────────────────

/// Returns `true` if new settlements are currently accepted.
/// Fast path: reads from DB; returns `true` on error (fail-open for liveness).
pub async fn is_accepting_settlements(db: &MySqlPool) -> bool {
    read_bool_flag(db, "accepting_new_settlements").await.unwrap_or(true)
}
