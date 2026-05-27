// Wea Settlement Connector · MVP entry.
//
// Loop-closing single-process implementation. See wea/DESIGN.md for the full
// production architecture (separate broadcaster/confirmer/callback workers
// with Redis leader election). This MVP folds them into one `Worker::run`
// task spawned alongside the axum HTTP server.

mod api;
mod db;
mod mock_rpc;
mod models;
mod worker;

use axum::{routing::{get, post}, Json, Router};
use serde::Serialize;
use std::{env, net::SocketAddr, sync::Arc};
use tracing_subscriber::EnvFilter;

pub struct AppCtx {
    pub db: sqlx::MySqlPool,
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
    // MVP: only the DB is on the hard path. Solana RPC is mocked, so we don't
    // surface its absence as a ready failure (mock = always ready).
    let db_ok = sqlx::query_scalar::<_, i32>("SELECT 1").fetch_one(&ctx.db).await.is_ok();
    let body = Ready {
        status: if db_ok { "ok" } else { "degraded" },
        checks: serde_json::json!({
            "mysql":      if db_ok { "ok" } else { "fail" },
            "solana_rpc": "mock (DEV)",
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
    let ctx = Arc::new(AppCtx { db: pool.clone() });

    // Spawn the settlement worker. If it panics we want the pod to die so the
    // orchestrator restarts it with a clean state — don't swallow.
    let worker = Arc::new(worker::Worker::new(pool));
    let worker_handle = tokio::spawn(async move { worker.run().await });

    let app = Router::new()
        .route("/",                       get(|| async {
            Json(serde_json::json!({
                "service": "wea-api",
                "version": "0.2.0",
                "endpoints": [
                    "POST /v1/settlements",
                    "GET  /v1/settlements/{id}",
                ],
                "mode": "MVP (mock RPC, single-process worker)",
            }))
        }))
        .route("/healthz",                get(healthz))
        .route("/readyz",                 get(readyz))
        .route("/v1/settlements",         post(api::create_settlement))
        .route("/v1/settlements/:id",     get(api::get_settlement))
        .with_state(ctx);

    let addr: SocketAddr = "0.0.0.0:8080".parse()?;
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
