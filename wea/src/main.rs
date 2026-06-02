// Wea Settlement Connector · MVP entry.
//
// Loop-closing single-process implementation. See wea/DESIGN.md for the full
// production architecture (separate broadcaster/confirmer/callback workers
// with Redis leader election). This MVP folds them into one `Worker::run`
// task spawned alongside the axum HTTP server.

mod api;
mod console;
mod db;
mod depeg;
mod facilitator;
mod kms;
mod mock_rpc;
mod models;
mod rpc_pool;
mod worker;

use axum::{middleware, routing::{get, post}, Json, Router};
use serde::Serialize;
use std::{env, net::SocketAddr, sync::Arc};
use tracing_subscriber::EnvFilter;

pub struct AppCtx {
    pub db:                      sqlx::MySqlPool,
    pub http:                    reqwest::Client,
    pub kms:                     kms::KmsClient,
    pub rpc_pool:                rpc_pool::RpcPool,
    pub x402_api_base_url:       String,
    /// Shared secret header: X-Internal-Auth. Protects /facilitator/* and
    /// /v1/settlements from unauthenticated external callers.
    ///
    /// TODO(production): replace with mTLS (DESIGN §9). The ALB injects
    /// `X-Client-Cert-CN` after client-cert verification; until that is wired
    /// this shared-secret guard is the interim defence. See DESIGN §9.
    pub internal_auth_secret:    String,
    pub solana_rpc_url_devnet:   String,
    pub solana_rpc_url_mainnet:  String,
    pub usdc_mint:               String,
    pub deposit_recipient:       String,
    pub demo_payer_pubkey:       String,
    pub call_log:                console::CallLog,
}

#[derive(Serialize)]
struct Health { status: &'static str, service: &'static str }

#[derive(Serialize)]
struct Ready {
    status: &'static str,
    checks: serde_json::Value,
}

async fn healthz() -> Json<Health> {
    Json(Health { status: "ok", service: "wea-api" })
}

async fn readyz(
    axum::extract::State(ctx): axum::extract::State<Arc<AppCtx>>,
) -> (axum::http::StatusCode, Json<Ready>) {
    let db_ok = sqlx::query_scalar::<_, i32>("SELECT 1").fetch_one(&ctx.db).await.is_ok();
    let accepting = depeg::is_accepting_settlements(&ctx.db).await;
    let body = Ready {
        status: if db_ok { "ok" } else { "degraded" },
        checks: serde_json::json!({
            "mysql":                      if db_ok { "ok" } else { "fail" },
            "solana_rpc":                 "mock (DEV)",
            "accepting_new_settlements":  accepting,
        }),
    };
    let code = if db_ok { axum::http::StatusCode::OK } else { axum::http::StatusCode::SERVICE_UNAVAILABLE };
    (code, Json(body))
}

#[tokio::main]
async fn main() -> anyhow::Result<()> {
    tracing_subscriber::fmt()
        .with_env_filter(EnvFilter::try_from_default_env().unwrap_or_else(|_| EnvFilter::new("info")))
        .json()
        .init();

    let db_url = env::var("DATABASE_URL")
        .unwrap_or_else(|_| "mysql://wea_app:wea_app_dev@mysql:3306/wea_qa".into());
    tracing::info!(db_url=%db_url, "wea-api boot");

    let pool = db::connect(&db_url).await?;

    let http = reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(45))
        .build()?;

    // KMS client — mode from KMS_MODE env (dev | aws).
    let kms = kms::KmsClient::from_env().await;

    // RPC pool — reads from rpc_endpoints table; falls back to SOLANA_RPC_URL_DEVNET.
    let solana_rpc_url_devnet = env::var("SOLANA_RPC_URL_DEVNET")
        .or_else(|_| env::var("SOLANA_RPC_URL"))
        .unwrap_or_else(|_| "https://api.devnet.solana.com".into());
    let rpc_pool = rpc_pool::RpcPool::new(pool.clone(), solana_rpc_url_devnet.clone());

    let x402_api_base_url = env::var("X402_API_BASE_URL")
        .unwrap_or_else(|_| "http://x402-api:8080".into());
    let internal_auth_secret = env::var("INTERNAL_AUTH_SECRET")
        .unwrap_or_else(|_| "internal_localdev_token".into());
    let solana_rpc_url_mainnet = env::var("SOLANA_RPC_URL_MAINNET")
        .unwrap_or_else(|_| "https://api.mainnet-beta.solana.com".into());
    let usdc_mint = env::var("USDC_MINT")
        .unwrap_or_else(|_| "4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU".into());
    let deposit_recipient = env::var("DEPOSIT_RECIPIENT_ADDRESS").unwrap_or_default();
    let demo_payer_pubkey = env::var("DEMO_PAYER_PUBKEY").unwrap_or_default();

    let ctx = Arc::new(AppCtx {
        db: pool.clone(),
        http,
        kms,
        rpc_pool,
        x402_api_base_url,
        internal_auth_secret,
        solana_rpc_url_devnet,
        solana_rpc_url_mainnet,
        usdc_mint,
        deposit_recipient,
        demo_payer_pubkey,
        call_log: console::CallLog::default(),
    });

    // ── Spawn worker + depeg monitor ─────────────────────────────────────
    // Pass the KMS client to the worker so callback secrets are properly
    // decrypted (KMS_MODE=aws will use real KMS; dev uses identity).
    let worker = Arc::new(worker::Worker::new_with_kms(
        pool.clone(),
        Arc::new(kms::KmsClient::from_env().await),
    ));
    let worker_handle = tokio::spawn(async move { worker.run().await });

    // Depeg monitor: choose real HTTP feed in production, mock in dev.
    //
    // Selection logic (evaluated in order):
    //   1. DEPEG_PRICE_FEED=mock  → MockPriceFeed (price from DEPEG_MOCK_PRICE or 1.0)
    //   2. DEPEG_PRICE_FEED=http  → HttpPriceFeed (CoinGecko)
    //   3. DEPEG_MOCK_PRICE=<f64> → MockPriceFeed (legacy env, kept for back-compat)
    //   4. (default)              → MockPriceFeed with price=1.0
    //      Production must explicitly set DEPEG_PRICE_FEED=http to enable live feed.
    let price_feed: Box<dyn depeg::PriceFeed> = {
        let feed_mode = env::var("DEPEG_PRICE_FEED")
            .map(|s| s.to_lowercase())
            .unwrap_or_else(|_| "mock".into());

        match feed_mode.as_str() {
            "http" => {
                tracing::info!("depeg_monitor: using HttpPriceFeed (CoinGecko)");
                Box::new(depeg::HttpPriceFeed::new()) as Box<dyn depeg::PriceFeed>
            }
            _ => {
                // "mock" or any unrecognised value → safe mock default.
                let price: f64 = env::var("DEPEG_MOCK_PRICE")
                    .ok()
                    .and_then(|s| s.parse().ok())
                    .unwrap_or(1.0);
                tracing::info!(price, mode=%feed_mode, "depeg_monitor: using MockPriceFeed");
                Box::new(depeg::MockPriceFeed::new(price))
            }
        }
    };
    let depeg_db = pool.clone();
    tokio::spawn(async move { depeg::run_depeg_monitor(depeg_db, price_feed).await });

    // ── Routes ─────────────────────────────────────────────────────────
    //
    // /facilitator/* routes are protected by internal_auth_middleware as a
    // layer, giving uniform X-Internal-Auth coverage over verify + settle +
    // tx_status.  The layer fires before any handler; no inline guard needed
    // inside individual handlers.
    let facilitator_routes = Router::new()
        .route("/facilitator/verify",        post(facilitator::verify))
        .route("/facilitator/settle",        post(facilitator::settle))
        .route("/facilitator/tx/:signature", get(facilitator::tx_status))
        .layer(middleware::from_fn_with_state(
            ctx.clone(),
            facilitator::internal_auth_middleware,
        ));

    let app = Router::new()
        .route("/",                           get(|| async {
            Json(serde_json::json!({
                "service": "wea-api",
                "version": "0.4.0",
                "endpoints": [
                    "POST /facilitator/verify              — x402 facilitator: verify a PaymentPayload (X-Internal-Auth required)",
                    "POST /facilitator/settle              — x402 facilitator: broadcast + confirm on Solana (X-Internal-Auth required)",
                    "GET  /facilitator/tx/{signature}      — AP4 tx status query (X-Internal-Auth required)",
                    "POST /v1/settlements                  — internal async settlement queue (X-Internal-Auth required)",
                    "GET  /v1/settlements/{id}",
                ],
                "mode": "x402 facilitator (real Solana RPC via reqwest)",
            }))
        }))
        .route("/healthz",                    get(healthz))
        .route("/readyz",                     get(readyz))
        // ── All /facilitator/* — guarded by internal_auth_middleware ──
        .merge(facilitator_routes)
        // ── Console observability ────────────────────────────────────
        .route("/v1/_console/calls",          get(console::calls))
        .route("/v1/_console/metrics",        get(console::metrics))
        // ── Legacy async settlement queue (kept for compatibility) ───
        .route("/v1/settlements",             post(api::create_settlement))
        .route("/v1/settlements/:id",         get(api::get_settlement))
        .with_state(ctx);

    // Task 4: listen address is now env-configurable.
    // Default: 0.0.0.0:8080. Override with WEA_LISTEN_ADDR.
    let listen_addr = env::var("WEA_LISTEN_ADDR")
        .unwrap_or_else(|_| "0.0.0.0:8080".into());
    let addr: SocketAddr = listen_addr.parse()
        .map_err(|e| anyhow::anyhow!("invalid WEA_LISTEN_ADDR {:?}: {}", listen_addr, e))?;
    tracing::info!(?addr, "wea-api listening");
    let listener = tokio::net::TcpListener::bind(addr).await?;
    tokio::select! {
        r = axum::serve(listener, app) => r?,
        r = worker_handle => {
            tracing::error!(?r, "worker task ended; exiting");
        }
    }
    Ok(())
}
