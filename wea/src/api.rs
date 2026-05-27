// HTTP handlers for the settlement API.
//
// Endpoints:
//   POST /v1/settlements        — create a settlement (202 Accepted, worker
//                                  picks up async)
//   GET  /v1/settlements/{id}   — query status (caller polls; canonical state
//                                  is also pushed to `callback_url`)
//
// Auth: none in MVP. Production will be mTLS between x402 ↔ wea; the cert CN
// gates this whole router. See wea/DESIGN.md §9.

use axum::{
    extract::{Path, State},
    http::StatusCode,
    response::{IntoResponse, Json, Response},
};
use chrono::{TimeZone, Utc};
use serde_json::json;
use sqlx::Row;
use std::sync::Arc;
use ulid::Ulid;

use crate::models::{
    callback_status, status, CreateSettlementRequest, CreateSettlementResponse,
    GetSettlementResponse,
};
use crate::AppCtx;

/// POST /v1/settlements — INSERT a row and return immediately. Worker advances
/// it through broadcasting → confirmed → callback → done.
pub async fn create_settlement(
    State(ctx): State<Arc<AppCtx>>,
    Json(req): Json<CreateSettlementRequest>,
) -> Response {
    if req.expected_amount_micro <= 0 {
        return bad("expected_amount_micro must be > 0");
    }
    if req.signed_tx_b64.is_empty() {
        return bad("signed_tx_b64 must be non-empty");
    }
    if !req.callback_url.starts_with("http") {
        return bad("callback_url must be http(s)://...");
    }

    let id = format!("stl_{}", Ulid::new().to_string());
    // DEV: KMS_MODE=dev → bytes ARE plaintext. Production will Encrypt via
    // AWS KMS ap-northeast-1 here (mirrors token-api/KMS.md DevKmsClient).
    let secret_bytes = req.callback_secret.as_bytes().to_vec();

    let res = sqlx::query(
        r#"
        INSERT INTO settlements
          (id, payment_order_id, expected_amount_micro, expected_recipient,
           expected_asset, signed_tx_b64, confirmation_level,
           status, callback_url, callback_secret_enc)
        VALUES
          (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        "#,
    )
    .bind(&id)
    .bind(&req.payment_order_id)
    .bind(req.expected_amount_micro)
    .bind(&req.expected_recipient)
    .bind(&req.expected_asset)
    .bind(&req.signed_tx_b64)
    .bind(&req.confirmation_level)
    .bind(status::PENDING)
    .bind(&req.callback_url)
    .bind(&secret_bytes)
    .execute(&ctx.db)
    .await;

    if let Err(e) = res {
        tracing::error!(error = ?e, "settlement_insert_failed");
        return server_err(&format!("db insert failed: {e}"));
    }

    tracing::info!(settlement_id=%id, payment_order=%req.payment_order_id,
                   amount=req.expected_amount_micro, "settlement.created");

    (
        StatusCode::ACCEPTED,
        Json(CreateSettlementResponse {
            settlement_id: id,
            status: status::PENDING,
            estimated_completion_seconds: 3,
        }),
    )
        .into_response()
}

/// GET /v1/settlements/{id}
pub async fn get_settlement(
    State(ctx): State<Arc<AppCtx>>,
    Path(settlement_id): Path<String>,
) -> Response {
    // The PK is (id, created_at) because of partitioning; id alone is still
    // unique in practice (ULID collision is astronomical), so we just LIMIT 1.
    let row = sqlx::query(
        r#"
        SELECT id, payment_order_id, status, tx_hash, broadcast_at,
               confirmed_at, callback_status, callback_attempt_count
        FROM settlements
        WHERE id = ?
        LIMIT 1
        "#,
    )
    .bind(&settlement_id)
    .fetch_optional(&ctx.db)
    .await;

    let row = match row {
        Ok(Some(r)) => r,
        Ok(None) => {
            return (
                StatusCode::NOT_FOUND,
                Json(json!({"error": "not_found", "settlement_id": settlement_id})),
            )
                .into_response();
        }
        Err(e) => {
            tracing::error!(error = ?e, settlement_id=%settlement_id, "settlement_fetch_failed");
            return server_err(&format!("db fetch failed: {e}"));
        }
    };

    let broadcast_at: Option<chrono::NaiveDateTime> = row.try_get("broadcast_at").ok();
    let confirmed_at: Option<chrono::NaiveDateTime> = row.try_get("confirmed_at").ok();

    let body = GetSettlementResponse {
        settlement_id:     row.try_get::<String, _>("id").unwrap_or_default(),
        payment_order_id:  row.try_get::<String, _>("payment_order_id").unwrap_or_default(),
        status:            row.try_get::<String, _>("status").unwrap_or_default(),
        tx_hash:           row.try_get::<Option<String>, _>("tx_hash").unwrap_or(None),
        broadcast_at:      broadcast_at.map(|t| Utc.from_utc_datetime(&t)),
        confirmed_at:      confirmed_at.map(|t| Utc.from_utc_datetime(&t)),
        callback_status:   row.try_get::<Option<String>, _>("callback_status").unwrap_or(None),
        callback_attempts: row.try_get::<i32, _>("callback_attempt_count").unwrap_or(0),
    };
    // Suppress unused-warning for the import (only used through ::PENDING etc).
    let _ = callback_status::PENDING;
    Json(body).into_response()
}

fn bad(msg: &str) -> Response {
    (StatusCode::BAD_REQUEST, Json(json!({"error": "bad_request", "message": msg})))
        .into_response()
}
fn server_err(msg: &str) -> Response {
    (StatusCode::INTERNAL_SERVER_ERROR, Json(json!({"error": "internal", "message": msg})))
        .into_response()
}
