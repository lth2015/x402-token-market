// WEA Facilitator — the x402 verify + settle endpoints.
//
// `verify` :: payload structurally + cryptographically sane vs requirements
//             (delegated to x402-api's /internal/verify-payment-payload until
//             the SPL TransferChecked parser is ported to native Rust).
//
// `settle` :: broadcast the signed tx to Solana RPC, poll for confirmation,
//             return a settlement receipt the gateway can re-verify against
//             the original requirements.
//
// Both handlers push a CallRecord into `ctx.call_log` on exit so the WEA
// console can render a live facilitator activity feed.

use axum::{extract::State, http::StatusCode, response::{IntoResponse, Json, Response}};
use chrono::Utc;
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use std::{sync::Arc, time::Duration};

use crate::console::{CallKind, CallRecord};
use crate::AppCtx;

// ── Inbound wire format (matches netstars/x402 PaymentPayload schema) ──────
#[derive(Debug, Deserialize, Clone)]
pub struct PaymentRequirements {
    pub scheme:            String,
    pub network:           String,
    #[serde(rename = "maxAmountRequired")]
    pub max_amount_required: String,
    pub resource:          String,
    #[serde(default)]
    pub description:       String,
    #[serde(rename = "mimeType", default)]
    pub mime_type:         String,
    #[serde(rename = "payTo")]
    pub pay_to:            String,
    #[serde(rename = "maxTimeoutSeconds", default)]
    pub max_timeout_seconds: i64,
    pub asset:             String,
    #[serde(default)]
    pub extra:             Value,
}

impl PaymentRequirements {
    fn nonce(&self) -> Option<String> {
        self.extra.get("nonce").and_then(Value::as_str).map(str::to_owned)
    }
}

#[derive(Debug, Deserialize, Clone)]
pub struct SolanaExactPayload {
    #[serde(rename = "signedTxBase64")]
    pub signed_tx_base64: String,
    #[serde(rename = "userVerification", default)]
    pub user_verification: Option<String>,
}

#[derive(Debug, Deserialize, Clone)]
pub struct PaymentPayload {
    #[serde(rename = "x402Version", default)]
    pub x402_version: i32,
    pub scheme:       String,
    pub network:      String,
    pub resource:     String,
    pub payload:      SolanaExactPayload,
}

#[derive(Debug, Deserialize, Clone)]
pub struct FacilitatorRequest {
    #[serde(rename = "paymentPayload")]
    pub payment_payload:     PaymentPayload,
    #[serde(rename = "paymentRequirements")]
    pub payment_requirements: PaymentRequirements,
}

#[derive(Debug, Serialize)]
pub struct VerifyResponse {
    #[serde(rename = "isValid")]
    pub is_valid:       bool,
    #[serde(rename = "invalidReason")]
    pub invalid_reason: Option<String>,
    pub payer:          Option<String>,
    pub signature:      Option<String>,
}

#[derive(Debug, Serialize)]
pub struct SettleResponse {
    pub success:     bool,
    pub transaction: String,
    pub network:     String,
    pub payer:       String,
    #[serde(rename = "errorReason")]
    pub error_reason: Option<String>,
}

// ── verify ────────────────────────────────────────────────────────────────
pub async fn verify(
    State(ctx): State<Arc<AppCtx>>,
    Json(req): Json<FacilitatorRequest>,
) -> Response {
    let started = Utc::now();
    let (resp, ok, payer, reason) = verify_inner(&ctx, &req).await;
    push_call(&ctx, CallKind::Verify, started, &req, ok, payer, reason, None);
    resp
}

async fn verify_inner(
    ctx: &AppCtx,
    req: &FacilitatorRequest,
) -> (Response, bool, Option<String>, Option<String>) {
    if req.payment_payload.scheme != "exact" {
        let reason = format!("scheme {:?} not supported", req.payment_payload.scheme);
        return (ok_verify(false, Some(reason.clone()), None), false, None, Some(reason));
    }
    if req.payment_payload.network != req.payment_requirements.network {
        let reason = "payload.network != requirements.network".to_string();
        return (ok_verify(false, Some(reason.clone()), None), false, None, Some(reason));
    }
    if req.payment_payload.resource != req.payment_requirements.resource {
        let reason = "payload.resource != requirements.resource".to_string();
        return (ok_verify(false, Some(reason.clone()), None), false, None, Some(reason));
    }
    let amount_micro: i64 = match req.payment_requirements.max_amount_required.parse() {
        Ok(n) if n > 0 => n,
        _ => {
            let reason = "requirements.maxAmountRequired invalid".to_string();
            return (ok_verify(false, Some(reason.clone()), None), false, None, Some(reason));
        }
    };
    let nonce = match req.payment_requirements.nonce() {
        Some(n) if !n.is_empty() => n,
        _ => {
            let reason = "requirements.extra.nonce missing".to_string();
            return (ok_verify(false, Some(reason.clone()), None), false, None, Some(reason));
        }
    };

    let url = format!("{}/internal/verify-payment-payload", ctx.x402_api_base_url.trim_end_matches('/'));
    let body = json!({
        "signedTxBase64":           req.payment_payload.payload.signed_tx_base64,
        "expectedRecipientOwner":   req.payment_requirements.pay_to,
        "expectedAmountUsdcMicro":  amount_micro,
        "expectedNonce":            nonce,
        "usdcMint":                 req.payment_requirements.asset,
    });
    let resp = ctx.http.post(&url)
        .header("X-Internal-Auth", &ctx.internal_auth_secret)
        .json(&body)
        .send().await;
    let resp = match resp {
        Ok(r) => r,
        Err(e) => {
            tracing::error!(error=?e, "facilitator.verify.delegate_unreachable");
            let r = server_err(&format!("upstream verify unreachable: {e}"));
            return (r, false, None, Some(format!("upstream unreachable: {e}")));
        }
    };
    let body_v: Value = match resp.json().await {
        Ok(v) => v,
        Err(e) => {
            let r = server_err(&format!("upstream verify returned non-JSON: {e}"));
            return (r, false, None, Some(format!("non-JSON: {e}")));
        }
    };
    let is_valid = body_v.get("isValid").and_then(Value::as_bool).unwrap_or(false);
    let invalid_reason = body_v.get("invalidReason").and_then(Value::as_str).map(str::to_owned);
    let payer = body_v.get("payer").and_then(Value::as_str).map(str::to_owned);
    let signature = body_v.get("signature").and_then(Value::as_str).map(str::to_owned);
    tracing::info!(is_valid, ?payer, ?invalid_reason, "facilitator.verify.result");
    let response = Json(VerifyResponse {
        is_valid,
        invalid_reason: invalid_reason.clone(),
        payer: payer.clone(),
        signature,
    }).into_response();
    (response, is_valid, payer, invalid_reason)
}

// ── settle ────────────────────────────────────────────────────────────────
pub async fn settle(
    State(ctx): State<Arc<AppCtx>>,
    Json(req): Json<FacilitatorRequest>,
) -> Response {
    let started = Utc::now();
    let (resp, ok, payer, reason, tx_hash) = settle_inner(&ctx, &req).await;
    push_call(&ctx, CallKind::Settle, started, &req, ok, payer, reason, tx_hash);
    resp
}

async fn settle_inner(
    ctx: &AppCtx,
    req: &FacilitatorRequest,
) -> (Response, bool, Option<String>, Option<String>, Option<String>) {
    let signed_tx_b64 = &req.payment_payload.payload.signed_tx_base64;
    let network = req.payment_requirements.network.clone();

    let rpc_url = match network.as_str() {
        "solana-devnet" => &ctx.solana_rpc_url_devnet,
        "solana"        => &ctx.solana_rpc_url_mainnet,
        other => {
            let reason = format!("network {other:?} not supported");
            let r = Json(SettleResponse {
                success: false, transaction: String::new(), network: other.into(),
                payer: String::new(), error_reason: Some(reason.clone()),
            }).into_response();
            return (r, false, None, Some(reason), None);
        }
    };

    // ── 1. Broadcast ──
    let send_body = json!({
        "jsonrpc": "2.0", "id": 1, "method": "sendTransaction",
        "params": [signed_tx_b64, {
            "encoding": "base64",
            "skipPreflight": false,
            "preflightCommitment": "confirmed",
        }],
    });
    let send_resp = ctx.http.post(rpc_url).json(&send_body).send().await;
    let send_resp = match send_resp {
        Ok(r) => r,
        Err(e) => {
            tracing::error!(error=?e, %rpc_url, "facilitator.settle.send_unreachable");
            let r = Json(SettleResponse {
                success: false, transaction: String::new(), network,
                payer: String::new(),
                error_reason: Some(format!("RPC unreachable: {e}")),
            }).into_response();
            return (r, false, None, Some(format!("RPC unreachable: {e}")), None);
        }
    };
    let send_json: Value = match send_resp.json().await {
        Ok(v) => v,
        Err(e) => {
            let r = Json(SettleResponse {
                success: false, transaction: String::new(), network,
                payer: String::new(),
                error_reason: Some(format!("RPC sendTransaction non-JSON: {e}")),
            }).into_response();
            return (r, false, None, Some(format!("non-JSON: {e}")), None);
        }
    };
    if let Some(err) = send_json.get("error") {
        let msg = err.get("message").and_then(Value::as_str).unwrap_or("unknown RPC error");
        tracing::warn!(error=%msg, "facilitator.settle.broadcast_rejected");
        let reason = format!("broadcast rejected: {msg}");
        let r = Json(SettleResponse {
            success: false, transaction: String::new(), network,
            payer: String::new(), error_reason: Some(reason.clone()),
        }).into_response();
        return (r, false, None, Some(reason), None);
    }
    let signature = match send_json.get("result").and_then(Value::as_str) {
        Some(s) => s.to_owned(),
        None => {
            let reason = "RPC sendTransaction returned no result".to_string();
            let r = Json(SettleResponse {
                success: false, transaction: String::new(), network,
                payer: String::new(), error_reason: Some(reason.clone()),
            }).into_response();
            return (r, false, None, Some(reason), None);
        }
    };
    tracing::info!(%signature, %network, "facilitator.settle.broadcast_ok");

    // ── 2. Poll for confirmation (up to ~30 s) ──
    let mut confirmed = false;
    let mut on_chain_err: Option<String> = None;
    for attempt in 0..15 {
        tokio::time::sleep(Duration::from_secs(2)).await;
        let status_body = json!({
            "jsonrpc": "2.0", "id": 1, "method": "getSignatureStatuses",
            "params": [[signature], {"searchTransactionHistory": true}],
        });
        let status_resp = match ctx.http.post(rpc_url).json(&status_body).send().await {
            Ok(r) => r,
            Err(e) => {
                tracing::warn!(error=?e, attempt, "facilitator.settle.poll_unreachable");
                continue;
            }
        };
        let sj: Value = match status_resp.json().await {
            Ok(v) => v,
            Err(_) => continue,
        };
        let Some(arr) = sj.pointer("/result/value").and_then(Value::as_array) else { continue };
        let Some(first) = arr.first() else { continue };
        if first.is_null() { continue; }
        let conf_status = first.get("confirmationStatus").and_then(Value::as_str).unwrap_or("");
        if let Some(err_val) = first.get("err") {
            if !err_val.is_null() {
                on_chain_err = Some(format!("on_chain_err: {err_val}"));
                break;
            }
        }
        if matches!(conf_status, "confirmed" | "finalized") {
            confirmed = true;
            break;
        }
        tracing::debug!(attempt, %conf_status, "facilitator.settle.awaiting");
    }

    if let Some(err) = on_chain_err {
        let r = Json(SettleResponse {
            success: false, transaction: signature.clone(), network: network.clone(),
            payer: String::new(), error_reason: Some(err.clone()),
        }).into_response();
        return (r, false, None, Some(err), Some(signature));
    }
    if !confirmed {
        let reason = "tx not confirmed within 30 s".to_string();
        let r = Json(SettleResponse {
            success: false, transaction: signature.clone(), network: network.clone(),
            payer: String::new(), error_reason: Some(reason.clone()),
        }).into_response();
        return (r, false, None, Some(reason), Some(signature));
    }

    let payer = extract_payer_via_verify(ctx, req).await.unwrap_or_default();
    let r = Json(SettleResponse {
        success: true, transaction: signature.clone(), network: network.clone(),
        payer: payer.clone(), error_reason: None,
    }).into_response();
    (r, true, Some(payer), None, Some(signature))
}

async fn extract_payer_via_verify(ctx: &AppCtx, req: &FacilitatorRequest) -> Option<String> {
    let url = format!("{}/internal/verify-payment-payload", ctx.x402_api_base_url.trim_end_matches('/'));
    let amount_micro: i64 = req.payment_requirements.max_amount_required.parse().ok()?;
    let nonce = req.payment_requirements.nonce()?;
    let body = json!({
        "signedTxBase64":           req.payment_payload.payload.signed_tx_base64,
        "expectedRecipientOwner":   req.payment_requirements.pay_to,
        "expectedAmountUsdcMicro":  amount_micro,
        "expectedNonce":            nonce,
        "usdcMint":                 req.payment_requirements.asset,
    });
    let resp = ctx.http.post(&url)
        .header("X-Internal-Auth", &ctx.internal_auth_secret)
        .json(&body).send().await.ok()?;
    let v: Value = resp.json().await.ok()?;
    v.get("payer").and_then(Value::as_str).map(str::to_owned)
}

fn ok_verify(is_valid: bool, reason: Option<String>, payer: Option<String>) -> Response {
    Json(VerifyResponse { is_valid, invalid_reason: reason, payer, signature: None }).into_response()
}

fn server_err(msg: &str) -> Response {
    (StatusCode::INTERNAL_SERVER_ERROR, Json(json!({"error":"internal","message":msg}))).into_response()
}

fn push_call(
    ctx: &AppCtx,
    kind: CallKind,
    started: chrono::DateTime<Utc>,
    req: &FacilitatorRequest,
    ok: bool,
    payer: Option<String>,
    reason: Option<String>,
    tx_hash: Option<String>,
) {
    let took_ms = (Utc::now() - started).num_milliseconds().max(0) as u64;
    let amount_usdc_micro = req.payment_requirements.max_amount_required.parse().unwrap_or(0);
    ctx.call_log.record(CallRecord {
        kind,
        started_at: started,
        took_ms,
        network: req.payment_requirements.network.clone(),
        amount_usdc_micro,
        pay_to: req.payment_requirements.pay_to.clone(),
        payer,
        resource: req.payment_requirements.resource.clone(),
        nonce: req.payment_requirements.nonce(),
        ok,
        error_reason: reason,
        tx_hash,
        had_user_verification: req.payment_payload.payload.user_verification.is_some(),
    });
}
