// WEA Facilitator console module.
//
// Exposes read-only observability so the Wea Console UI can render verify /
// settle activity, Solana RPC interactions, and demo-wallet state.
//
// Design choices:
//   - In-process ring buffer (Mutex<VecDeque<CallRecord>>) instead of a DB
//     table. Restart loses history — acceptable for a demo console and saves
//     one round-trip per facilitator call. Capacity is fixed at 200.
//   - Metrics are aggregate counters maintained alongside the ring buffer.
//   - Demo-wallet balance probing is delegated to Solana RPC at request time
//     so we never cache stale on-chain state.

use axum::{
    extract::State,
    http::StatusCode,
    response::{IntoResponse, Json, Response},
};
use chrono::{DateTime, Utc};
use serde::Serialize;
use serde_json::json;
use std::{
    collections::VecDeque,
    sync::{Arc, Mutex},
};

use crate::AppCtx;

pub const RING_CAPACITY: usize = 200;

/// Which facilitator surface this call hit.
#[derive(Debug, Clone, Copy, Serialize)]
#[serde(rename_all = "snake_case")]
pub enum CallKind {
    Verify,
    Settle,
}

/// One row in the facilitator activity log.
#[derive(Debug, Clone, Serialize)]
pub struct CallRecord {
    pub kind:                  CallKind,
    pub started_at:            DateTime<Utc>,
    pub took_ms:               u64,
    pub network:               String,
    pub amount_usdc_micro:     i64,
    pub pay_to:                String,
    pub payer:                 Option<String>,
    pub resource:              String,
    pub nonce:                 Option<String>,
    pub ok:                    bool,
    pub error_reason:          Option<String>,
    pub tx_hash:               Option<String>,
    pub had_user_verification: bool,
}

/// Aggregate counters maintained alongside the ring buffer.
#[derive(Debug, Default, Serialize)]
pub struct Counters {
    pub verify_ok:     u64,
    pub verify_fail:   u64,
    pub settle_ok:     u64,
    pub settle_fail:   u64,
}

/// Thread-safe handle the facilitator uses to record activity.
#[derive(Clone)]
pub struct CallLog {
    inner: Arc<Mutex<Inner>>,
}

struct Inner {
    ring:     VecDeque<CallRecord>,
    counters: Counters,
}

impl Default for CallLog {
    fn default() -> Self {
        Self {
            inner: Arc::new(Mutex::new(Inner {
                ring:     VecDeque::with_capacity(RING_CAPACITY),
                counters: Counters::default(),
            })),
        }
    }
}

impl CallLog {
    pub fn record(&self, rec: CallRecord) {
        let Ok(mut g) = self.inner.lock() else { return };
        match (rec.kind, rec.ok) {
            (CallKind::Verify, true)  => g.counters.verify_ok    += 1,
            (CallKind::Verify, false) => g.counters.verify_fail  += 1,
            (CallKind::Settle, true)  => g.counters.settle_ok    += 1,
            (CallKind::Settle, false) => g.counters.settle_fail  += 1,
        }
        if g.ring.len() >= RING_CAPACITY {
            g.ring.pop_front();
        }
        g.ring.push_back(rec);
    }

    fn snapshot(&self, limit: usize) -> (Vec<CallRecord>, Counters) {
        let Ok(g) = self.inner.lock() else { return (vec![], Counters::default()) };
        let limit = limit.min(g.ring.len());
        let mut items: Vec<CallRecord> = g.ring.iter().rev().take(limit).cloned().collect();
        items.reverse();
        let counters = Counters {
            verify_ok:   g.counters.verify_ok,
            verify_fail: g.counters.verify_fail,
            settle_ok:   g.counters.settle_ok,
            settle_fail: g.counters.settle_fail,
        };
        (items, counters)
    }
}

// ── Handlers ──────────────────────────────────────────────────────────
#[derive(Serialize)]
struct CallsResponse {
    items:    Vec<CallRecord>,
    counters: Counters,
}

pub async fn calls(State(ctx): State<Arc<AppCtx>>) -> Response {
    let (items, counters) = ctx.call_log.snapshot(200);
    Json(CallsResponse { items, counters }).into_response()
}

#[derive(Serialize)]
struct MetricsResponse {
    service:           &'static str,
    role:              &'static str,
    counters:          Counters,
    config: serde_json::Value,
    wallet: serde_json::Value,
}

pub async fn metrics(State(ctx): State<Arc<AppCtx>>) -> Response {
    let (_, counters) = ctx.call_log.snapshot(0);
    // Best-effort: probe demo wallet balances against Solana Devnet. If RPC is
    // unreachable we return None so the UI can show "—" instead of failing.
    let payer = ctx.demo_payer_pubkey.clone();
    let recipient = ctx.deposit_recipient.clone();
    let mint = ctx.usdc_mint.clone();
    let payer_balance = fetch_token_balance(&ctx.http, &ctx.solana_rpc_url_devnet, &payer, &mint).await;
    let recipient_balance = fetch_token_balance(&ctx.http, &ctx.solana_rpc_url_devnet, &recipient, &mint).await;

    let body = MetricsResponse {
        service: "wea-api",
        role:    "x402-facilitator",
        counters,
        config: json!({
            "network_devnet":  ctx.solana_rpc_url_devnet,
            "network_mainnet": ctx.solana_rpc_url_mainnet,
            "x402_gateway":    ctx.x402_api_base_url,
            "usdc_mint":       mint,
            "ring_capacity":   RING_CAPACITY,
        }),
        wallet: json!({
            "demo_payer":         { "pubkey": payer,     "usdc": payer_balance },
            "deposit_recipient":  { "pubkey": recipient, "usdc": recipient_balance },
        }),
    };
    Json(body).into_response()
}

async fn fetch_token_balance(
    http: &reqwest::Client,
    rpc_url: &str,
    owner: &str,
    mint: &str,
) -> Option<String> {
    if owner.is_empty() || mint.is_empty() {
        return None;
    }
    let body = json!({
        "jsonrpc": "2.0", "id": 1, "method": "getTokenAccountsByOwner",
        "params": [owner, {"mint": mint}, {"encoding": "jsonParsed"}],
    });
    let resp = http.post(rpc_url)
        .json(&body)
        .timeout(std::time::Duration::from_secs(8))
        .send().await.ok()?;
    let v: serde_json::Value = resp.json().await.ok()?;
    let arr = v.pointer("/result/value")?.as_array()?;
    if let Some(first) = arr.first() {
        let amt = first.pointer("/account/data/parsed/info/tokenAmount/uiAmountString")?.as_str()?;
        return Some(amt.to_string());
    }
    Some("0".to_string())
}

#[allow(dead_code)]
pub async fn _allow_unused() -> Response {
    (StatusCode::OK, "ok").into_response()
}
