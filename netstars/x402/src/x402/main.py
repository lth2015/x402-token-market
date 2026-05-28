"""
X402 Gateway · v0.3.0 (real Devnet USDC edition)

Endpoints:
    POST /v1/payments                          create payment order (idempotent, internal-auth only)
    GET  /v1/payments/{id}                     query order
    POST /v1/payments/{id}/proof               verify signed USDC tx + broadcast to Solana RPC
    POST /v1/payments/{id}/dev-checkout        DEV: server-side sign + broadcast real devnet USDC tx
    POST /v1/admin/payments/{id}/confirm       DEV: skip chain, then settle by order metadata

Background:
    Confirmer task — polls broadcasting orders, transitions to confirmed
    when on-chain status is 'confirmed'/'finalized'. Token top-up orders call
    token-api /internal/credit; merchant checkout orders stop at confirmed.

Real chain path (v0.3.0):
    - dev-checkout builds + signs a real SPL TransferChecked + Memo tx
      using DEMO_PAYER_PRIVATE_KEY_B64 (a pre-funded devnet wallet)
    - Broadcasts to Solana Devnet (SOLANA_RPC_URL=https://api.devnet.solana.com)
    - Polls on-chain status and completes token credit only for Token top-ups
    - Returns real tx_hash + Solana Explorer URL

Setup: run scripts/setup-devnet-wallet.py once to generate keypairs +
get the funding instructions (airdrop SOL + Circle USDC faucet).
"""
from __future__ import annotations

import asyncio
import base64
import hmac as _hmac
import logging
import os
from contextlib import asynccontextmanager
from datetime import datetime, timezone
from typing import Optional

import httpx
import redis.asyncio as aioredis
import structlog
from fastapi import Depends, FastAPI, HTTPException, Request
from fastapi.responses import JSONResponse
from pydantic import BaseModel, Field
from solders.hash import Hash
from solders.pubkey import Pubkey
from sqlalchemy import select, text

from . import db
from .orders import OrderService, OrderStateConflictError
from .proof import ProofError, verify_proof
from .solana_rpc import SolanaRpc, SolanaRpcError
from .tx_builder import TxBuildError, build_x402_payment_tx, keypair_from_b64
from .webhooks import (
    DEFAULT_SIGNING_SECRET,
    DEFAULT_TARGET_URL,
    Deliverer as WebhookDeliverer,
    build_event_payload,
    compute_signature,
    enqueue as enqueue_webhook,
)

# ── Logging ────────────────────────────────────────────────────────
structlog.configure(
    processors=[
        structlog.contextvars.merge_contextvars,
        structlog.processors.add_log_level,
        structlog.processors.TimeStamper(fmt="iso"),
        structlog.processors.JSONRenderer(),
    ],
    wrapper_class=structlog.make_filtering_bound_logger(logging.INFO),
)
log = structlog.get_logger("x402-api")

# ── Settings ───────────────────────────────────────────────────────
ENV = os.environ.get("ENV", "local")
DATABASE_URL = os.environ.get(
    "DATABASE_URL",
    "mysql+aiomysql://x402_app:x402_app_dev@localhost:3306/x402_qa",
)
REDIS_URL = os.environ.get("REDIS_URL", "redis://localhost:6379/0")
TOKEN_API_BASE_URL = os.environ.get("TOKEN_API_BASE_URL", "http://token-api:8080")
INTERNAL_AUTH_SECRET = os.environ.get("INTERNAL_AUTH_SECRET", "internal_localdev_token")

# Solana / USDC config.
# Default SOLANA_RPC_URL is Devnet so the stack works without a local validator.
# For fully-local testing with solana-test-validator set SOLANA_RPC_URL=http://solana:8899.
SOLANA_RPC_URL = os.environ.get("SOLANA_RPC_URL", "https://api.devnet.solana.com")
USDC_MINT = os.environ.get(
    "USDC_MINT",
    "4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU",  # Circle devnet USDC
)
DEPOSIT_RECIPIENT = os.environ.get(
    "DEPOSIT_RECIPIENT_ADDRESS",
    "5dHJpDeM4kvNSnSqkA2D9wmJZ5fHZ3iH3a6CkZxJ2hYz",  # replace with real merchant wallet
)

# Demo payer keypair for dev-checkout (server-side signing).
# Base64-encoded 64-byte Solana keypair (seed || pubkey).
# Generate with: python scripts/setup-devnet-wallet.py
# Then fund the payer with devnet SOL (airdrop) and USDC (Circle faucet).
DEMO_PAYER_PRIVATE_KEY_B64: Optional[str] = os.environ.get("DEMO_PAYER_PRIVATE_KEY_B64") or None

CONFIRMER_POLL_INTERVAL_SECS = float(os.environ.get("CONFIRMER_POLL_INTERVAL_SECS", "2.0"))
CONFIRMER_BATCH_SIZE = int(os.environ.get("CONFIRMER_BATCH_SIZE", "50"))

# 1 USDC = 1,000,000 AI Token (must match token-api)
TOKEN_PER_USDC = 1_000_000

# Solana Explorer base URL for devnet links
_SOLANA_EXPLORER_BASE = "https://explorer.solana.com/tx"
_SOLANA_NETWORK_PARAM = "devnet"   # change to "mainnet-beta" for production


# ── Lifespan ───────────────────────────────────────────────────────
@asynccontextmanager
async def lifespan(app: FastAPI):
    log.info("startup", env=ENV, solana_rpc=SOLANA_RPC_URL, usdc_mint=USDC_MINT,
             demo_payer_configured=bool(DEMO_PAYER_PRIVATE_KEY_B64),
             webhook_default_url=DEFAULT_TARGET_URL or "(none)")
    app.state.db = db.make_engine(DATABASE_URL)
    app.state.redis = aioredis.from_url(REDIS_URL, decode_responses=True)
    app.state.http = httpx.AsyncClient(timeout=10.0)
    app.state.solana_rpc = SolanaRpc(SOLANA_RPC_URL, app.state.http)

    # Background confirmer task — single replica only in v0.2.0. For multi-replica
    # we'd add a Redis leader-election lock; tracked in DESIGN.md follow-ups.
    confirmer_task = asyncio.create_task(_confirmer_loop(app), name="x402.confirmer")
    log.info("startup.confirmer_started")

    # Background webhook deliverer (same single-replica concern as confirmer)
    app.state.webhook_deliverer = WebhookDeliverer(
        engine=app.state.db, http=app.state.http,
        signing_secret=DEFAULT_SIGNING_SECRET,
    )
    app.state.webhook_deliverer.start()

    try:
        yield
    finally:
        log.info("shutdown")
        confirmer_task.cancel()
        try:
            await confirmer_task
        except asyncio.CancelledError:
            pass
        await app.state.webhook_deliverer.stop()
        await app.state.db.dispose()
        await app.state.redis.aclose()
        await app.state.http.aclose()


app = FastAPI(
    title="X402 Gateway",
    version="0.2.0",
    docs_url="/docs" if ENV in ("local", "qa") else None,
    redoc_url=None,
    lifespan=lifespan,
)


# ── Auth (internal-only deps) ─────────────────────────────────────
async def require_internal(request: Request) -> None:
    """Reject calls that don't carry our shared internal-service secret."""
    provided = request.headers.get("X-Internal-Auth", "")
    if not _hmac.compare_digest(provided, INTERNAL_AUTH_SECRET):
        raise HTTPException(401, "Missing or invalid X-Internal-Auth header")


# ── Health ─────────────────────────────────────────────────────────
@app.get("/healthz")
async def healthz():
    return {"status": "ok", "service": "x402-api", "version": "0.2.0"}


@app.get("/readyz")
async def readyz():
    checks: dict[str, str] = {}
    overall = "ok"
    try:
        async with app.state.db.connect() as conn:
            await conn.execute(text("SELECT 1"))
        checks["mysql"] = "ok"
    except Exception as e:
        checks["mysql"] = f"error: {e!s}"[:80]
        overall = "degraded"
    try:
        await app.state.redis.ping()
        checks["redis"] = "ok"
    except Exception as e:
        checks["redis"] = f"error: {e!s}"[:80]
        overall = "degraded"
    solana_ok = await app.state.solana_rpc.get_health()
    checks["solana_rpc"] = "ok" if solana_ok else "error"
    if not solana_ok:
        overall = "degraded"
    return JSONResponse(
        {"status": overall, "checks": checks},
        status_code=200 if overall == "ok" else 503,
    )


# ── Models ─────────────────────────────────────────────────────────
class CreatePaymentIn(BaseModel):
    merchant_id: str
    api_key_id: str
    amount_usdc_micro: int = Field(..., gt=0)
    idempotency_key: str = Field(..., min_length=1, max_length=80)
    metadata: Optional[dict] = None


class PaymentOut(BaseModel):
    id: str
    merchant_id: str
    amount_usdc_micro: int
    recipient: str
    nonce: str
    network: str
    asset: str
    status: str
    expires_at: str
    tx_hash: Optional[str] = None
    confirmed_at: Optional[str] = None


class SubmitProofIn(BaseModel):
    signed_tx_base64: str = Field(..., min_length=4)


class AdminConfirmIn(BaseModel):
    """Dev shortcut: simulate Wea callback. Skips Solana, just transitions state."""
    tx_hash: str = "DEV_FAKE_TX_HASH"


def _settlement_kind(order: dict) -> str:
    metadata = order.get("metadata") or {}
    if not isinstance(metadata, dict):
        return "token_topup"
    kind = metadata.get("settlement_kind")
    return kind if isinstance(kind, str) and kind else "token_topup"


def _should_credit_token(order: dict) -> bool:
    return _settlement_kind(order) == "token_topup"


# ── Routes ─────────────────────────────────────────────────────────
@app.post("/v1/payments", response_model=PaymentOut)
async def create_payment(body: CreatePaymentIn, _: None = Depends(require_internal)):
    async with app.state.db.begin() as conn:
        order = await OrderService.create_payment(
            conn,
            merchant_id=body.merchant_id,
            api_key_id=body.api_key_id,
            amount_usdc_micro=body.amount_usdc_micro,
            idempotency_key=body.idempotency_key,
            recipient_address=DEPOSIT_RECIPIENT,
            metadata=body.metadata or {},
            webhook_url=DEFAULT_TARGET_URL or None,
        )
    log.info("payment.created", order_id=order["id"],
             merchant_id=body.merchant_id, amount=body.amount_usdc_micro)
    return order


@app.get("/v1/payments/{order_id}", response_model=PaymentOut)
async def get_payment(order_id: str):
    async with app.state.db.connect() as conn:
        order = await OrderService.fetch(conn, order_id)
    if not order:
        raise HTTPException(404, f"payment order {order_id} not found")
    return order


@app.post("/v1/payments/{order_id}/proof")
async def submit_proof(order_id: str, body: SubmitProofIn):
    """
    Verify the client-submitted signed USDC tx, then broadcast to Solana.
    Confirmer task picks up the broadcasting order and finalizes it.
    """
    async with app.state.db.connect() as conn:
        order = await OrderService.fetch(conn, order_id)
    if not order:
        raise HTTPException(404, f"order {order_id} not found")
    if order["status"] != "created":
        raise HTTPException(
            409, f"order is in state {order['status']!r}; proof already accepted or order closed"
        )

    # 1. Verify proof against this order's expectations
    try:
        result = verify_proof(
            signed_tx_b64=body.signed_tx_base64,
            expected_recipient_owner=DEPOSIT_RECIPIENT,
            expected_amount_usdc_micro=order["amount_usdc_micro"],
            expected_nonce=order["nonce"],
            usdc_mint=USDC_MINT,
        )
    except ProofError as e:
        # Persist a failed proof for audit; do NOT advance order state.
        async with app.state.db.begin() as conn:
            await conn.execute(db.payment_proofs.insert().values(
                payment_order_id=order_id,
                signed_tx_b64=body.signed_tx_base64,
                parsed_tx=None,
                verification_result={"verified": False, "reason": str(e)},
            ))
        log.warning("payment.proof_invalid", order_id=order_id, reason=str(e))
        raise HTTPException(400, f"proof invalid: {e}") from e

    # 2. Persist a passing proof and transition created → pending
    async with app.state.db.begin() as conn:
        await conn.execute(db.payment_proofs.insert().values(
            payment_order_id=order_id,
            signed_tx_b64=body.signed_tx_base64,
            parsed_tx=None,
            verification_result={
                "verified": True,
                "payer": result.payer,
                "memo": result.memo,
                "signature": result.signature_b58,
            },
        ))
        try:
            order = await OrderService.transition(
                conn, order_id, from_status="created", to_status="pending",
            )
        except OrderStateConflictError as e:
            raise HTTPException(409, f"{e}") from e

    # 3. Broadcast to Solana RPC
    try:
        rpc_sig = await app.state.solana_rpc.send_transaction(body.signed_tx_base64)
    except SolanaRpcError as e:
        # Mark order failed so it doesn't sit in pending forever
        async with app.state.db.begin() as conn:
            try:
                await OrderService.transition(
                    conn, order_id, from_status="pending", to_status="failed",
                    updates={"status_reason": f"rpc_send_failed: {e!s}"[:255]},
                )
            except OrderStateConflictError:
                pass
        log.error("payment.broadcast_failed", order_id=order_id, error=str(e))
        raise HTTPException(502, f"Solana RPC: {e}") from e

    # 4. Sanity: the signature from the RPC should match what we parsed.
    if rpc_sig != result.signature_b58:
        log.warning("payment.sig_mismatch", parsed=result.signature_b58, rpc=rpc_sig)

    # 5. Transition pending → broadcasting; persist tx_hash
    async with app.state.db.begin() as conn:
        try:
            order = await OrderService.transition(
                conn, order_id, from_status="pending", to_status="broadcasting",
                updates={"tx_hash": rpc_sig},
            )
        except OrderStateConflictError as e:
            raise HTTPException(409, f"{e}") from e

    log.info("payment.broadcasting", order_id=order_id, tx_hash=rpc_sig, payer=result.payer)
    return {
        "ok": True,
        "order": order,
        "tx_hash": rpc_sig,
        "note": "tx broadcast; confirmer will settle according to order metadata",
    }


@app.post("/v1/admin/payments/{order_id}/confirm")
async def admin_confirm(order_id: str, body: AdminConfirmIn):
    """
    Dev shortcut: bypass real Solana entirely. Transitions through pending →
    broadcasting → confirmed, then credits Token only for Token top-up orders.
    Useful when running the quickstart without funding a real USDC ATA.
    """
    if ENV not in ("local", "qa"):
        raise HTTPException(403, "admin/confirm is dev-only")

    now = datetime.now(timezone.utc).replace(tzinfo=None)

    async with app.state.db.begin() as conn:
        order = await OrderService.fetch(conn, order_id)
        if not order:
            raise HTTPException(404, f"order {order_id} not found")
        if order["status"] == "created":
            order = await OrderService.transition(
                conn, order_id, from_status="created", to_status="pending"
            )
        if order["status"] == "pending":
            order = await OrderService.transition(
                conn, order_id, from_status="pending", to_status="broadcasting"
            )
        if order["status"] == "broadcasting":
            order = await OrderService.transition(
                conn, order_id, from_status="broadcasting", to_status="confirmed",
                updates={"tx_hash": body.tx_hash, "confirmed_at": now},
            )

    if not _should_credit_token(order):
        await _enqueue_event(order, "payment.confirmed")
        log.info("payment.admin_confirmed", order_id=order_id, tx_hash=body.tx_hash,
                 settlement_kind=_settlement_kind(order))
        return {"ok": True, "order": order, "credit": None}

    credit = await _credit_via_token_api(order, body.tx_hash)

    async with app.state.db.begin() as conn:
        try:
            order = await OrderService.transition(
                conn, order_id, from_status="confirmed", to_status="token_credited",
                updates={"token_ledger_entry_id": credit["ledger_entry_id"]},
            )
        except OrderStateConflictError:
            order = await OrderService.fetch(conn, order_id)

    await _enqueue_event(order, "payment.token_credited")
    log.info("payment.admin_confirmed", order_id=order_id, tx_hash=body.tx_hash,
             settlement_kind=_settlement_kind(order))
    return {"ok": True, "order": order, "credit": credit}


# ── Webhook ops + dev sink ────────────────────────────────────────
@app.get("/v1/webhook-deliveries")
async def list_webhook_deliveries(
    limit: int = 50,
    order_id: Optional[str] = None,
    status: Optional[str] = None,
):
    """Operator view of recent webhook deliveries. Powers a future Console panel."""
    from sqlalchemy import desc, select as sa_select
    q = sa_select(db.webhook_deliveries).order_by(desc(db.webhook_deliveries.c.id)).limit(min(limit, 200))
    if order_id:
        q = q.where(db.webhook_deliveries.c.payment_order_id == order_id)
    if status:
        q = q.where(db.webhook_deliveries.c.status == status)
    async with app.state.db.connect() as conn:
        rows = (await conn.execute(q)).all()
    return {
        "items": [
            {
                "id": r.id,
                "payment_order_id": r.payment_order_id,
                "event_type": r.event_type,
                "target_url": r.target_url,
                "status": r.status,
                "attempt_count": r.attempt_count,
                "last_response_code": r.last_response_code,
                "last_response_body": r.last_response_body,
                "next_retry_at": r.next_retry_at.replace(tzinfo=timezone.utc).isoformat()
                                 if r.next_retry_at else None,
                "delivered_at": r.delivered_at.replace(tzinfo=timezone.utc).isoformat()
                                if r.delivered_at else None,
                "created_at": r.created_at.replace(tzinfo=timezone.utc).isoformat()
                              if r.created_at else None,
            } for r in rows
        ],
    }


@app.post("/dev/webhook-sink")
async def dev_webhook_sink(request: Request):
    """
    DEV ONLY: loopback receiver so the full delivery loop is testable inside
    one docker-compose stack. Verifies signature, logs the event, returns 200.
    Set WEBHOOK_DEFAULT_URL=http://x402-api:8080/dev/webhook-sink to use it.
    """
    if ENV not in ("local", "qa"):
        raise HTTPException(403, "dev/webhook-sink is dev-only")

    raw = await request.body()
    ts = request.headers.get("X-Netstars-Timestamp", "")
    sig = request.headers.get("X-Netstars-Signature", "")
    event = request.headers.get("X-Netstars-Event", "?")
    delivery = request.headers.get("X-Netstars-Delivery", "?")

    valid = False
    if ts.isdigit() and sig:
        expected = compute_signature(DEFAULT_SIGNING_SECRET, timestamp=int(ts), body=raw)
        valid = _hmac.compare_digest(expected, sig)

    # `event` collides with structlog's reserved first-positional kwarg, so rename.
    log.info("webhook_sink.received", event_type=event, delivery=delivery,
             signature_valid=valid, size=len(raw))
    if not valid:
        raise HTTPException(401, "bad signature")
    return {"ok": True, "event": event, "delivery": delivery, "signature_valid": True}


@app.post("/v1/payments/{order_id}/dev-checkout")
async def dev_checkout(order_id: str) -> dict:
    """
    DEV/QA: Build, sign, and broadcast a real Solana Devnet USDC payment
    using the DEMO_PAYER_PRIVATE_KEY_B64 keypair, then wait for on-chain
    confirmation and credit tokens.

    Returns the final order state + tx_hash + Solana Explorer URL.
    Useful for demos on machines without a user wallet (Phantom/Solflare).

    Prerequisites:
      - DEMO_PAYER_PRIVATE_KEY_B64 configured in .env (run setup-devnet-wallet.py)
      - Payer ATA funded with at least [order amount] USDC on Devnet
      - SOLANA_RPC_URL pointing to Devnet (default: https://api.devnet.solana.com)
    """
    if ENV not in ("local", "qa"):
        raise HTTPException(403, "dev-checkout is dev-only (ENV must be local or qa)")

    if not DEMO_PAYER_PRIVATE_KEY_B64:
        raise HTTPException(
            503,
            "DEMO_PAYER_PRIVATE_KEY_B64 not configured. "
            "Run scripts/setup-devnet-wallet.py and add the key to .env",
        )

    # ── 1. Fetch order ───────────────────────────────────────────────
    async with app.state.db.connect() as conn:
        order = await OrderService.fetch(conn, order_id)
    if not order:
        raise HTTPException(404, f"order {order_id} not found")
    if order["status"] != "created":
        raise HTTPException(
            409,
            f"order is in state {order['status']!r}; "
            "dev-checkout only works from 'created' state",
        )

    # ── 2. Get latest blockhash from Solana ──────────────────────────
    try:
        blockhash_data = await app.state.solana_rpc.get_latest_blockhash()
    except SolanaRpcError as e:
        raise HTTPException(502, f"Solana RPC unreachable: {e}") from e

    # ── 3. Build + sign transaction ──────────────────────────────────
    try:
        payer_kp = keypair_from_b64(DEMO_PAYER_PRIVATE_KEY_B64)
    except TxBuildError as e:
        raise HTTPException(500, f"demo keypair decode error: {e}") from e

    try:
        tx_bytes = build_x402_payment_tx(
            payer_keypair=payer_kp,
            recipient_owner=Pubkey.from_string(DEPOSIT_RECIPIENT),
            mint=Pubkey.from_string(USDC_MINT),
            amount_micro=order["amount_usdc_micro"],
            nonce=order["nonce"],
            recent_blockhash=Hash.from_string(blockhash_data["blockhash"]),
            ensure_dest_ata=True,
        )
    except (TxBuildError, Exception) as e:
        raise HTTPException(500, f"tx build failed: {e}") from e

    signed_tx_b64 = base64.b64encode(tx_bytes).decode()

    # ── 4. Self-verify proof (catch tx_builder bugs early) ───────────
    try:
        proof_result = verify_proof(
            signed_tx_b64=signed_tx_b64,
            expected_recipient_owner=DEPOSIT_RECIPIENT,
            expected_amount_usdc_micro=order["amount_usdc_micro"],
            expected_nonce=order["nonce"],
            usdc_mint=USDC_MINT,
        )
    except ProofError as e:
        raise HTTPException(500, f"self-verification failed (tx_builder bug): {e}") from e

    # ── 5. Persist proof + transition created → pending ──────────────
    async with app.state.db.begin() as conn:
        await conn.execute(db.payment_proofs.insert().values(
            payment_order_id=order_id,
            signed_tx_b64=signed_tx_b64,
            parsed_tx=None,
            verification_result={
                "verified": True,
                "payer": proof_result.payer,
                "memo": proof_result.memo,
                "signature": proof_result.signature_b58,
                "mode": "dev-checkout",
            },
        ))
        try:
            order = await OrderService.transition(
                conn, order_id, from_status="created", to_status="pending",
            )
        except OrderStateConflictError as e:
            raise HTTPException(409, str(e)) from e

    # ── 6. Broadcast to Solana ───────────────────────────────────────
    try:
        rpc_sig = await app.state.solana_rpc.send_transaction(signed_tx_b64)
    except SolanaRpcError as e:
        async with app.state.db.begin() as conn:
            try:
                await OrderService.transition(
                    conn, order_id, from_status="pending", to_status="failed",
                    updates={"status_reason": f"rpc_broadcast: {str(e)[:200]}"},
                )
            except OrderStateConflictError:
                pass
        log.error("dev_checkout.broadcast_failed", order_id=order_id, err=str(e))
        raise HTTPException(502, f"Solana RPC broadcast failed: {e}") from e

    # ── 7. Transition pending → broadcasting ─────────────────────────
    async with app.state.db.begin() as conn:
        try:
            order = await OrderService.transition(
                conn, order_id, from_status="pending", to_status="broadcasting",
                updates={"tx_hash": rpc_sig},
            )
        except OrderStateConflictError as e:
            raise HTTPException(409, str(e)) from e

    log.info("dev_checkout.broadcasting",
             order_id=order_id, tx_hash=rpc_sig, payer=proof_result.payer,
             amount_micro=order["amount_usdc_micro"])

    # ── 8. Poll for on-chain confirmation (max 30 seconds, 15 × 2 s) ─
    # We call _confirmer_advance_one directly so we don't have to wait
    # for the background loop's next tick.
    for attempt in range(15):
        await asyncio.sleep(2.0)
        try:
            await _confirmer_advance_one(app, order_id, rpc_sig)
        except Exception as poll_err:
            log.warning("dev_checkout.poll_error",
                        attempt=attempt, order_id=order_id, err=str(poll_err))
        async with app.state.db.connect() as conn:
            order = await OrderService.fetch(conn, order_id) or order
        terminal_statuses = (
            ("token_credited", "failed")
            if _should_credit_token(order)
            else ("confirmed", "failed")
        )
        if order["status"] in terminal_statuses:
            break
        log.debug("dev_checkout.awaiting_confirmation",
                  attempt=attempt + 1, status=order["status"])

    explorer_url = f"{_SOLANA_EXPLORER_BASE}/{rpc_sig}?cluster={_SOLANA_NETWORK_PARAM}"
    log.info("dev_checkout.complete",
             order_id=order_id, final_status=order["status"], tx_hash=rpc_sig)

    return {
        "ok": True,
        "order": order,
        "tx_hash": rpc_sig,
        "payer": proof_result.payer,
        "explorer_url": explorer_url,
        "chain": _SOLANA_NETWORK_PARAM,
    }


@app.get("/")
async def root():
    return {
        "service": "x402-api",
        "version": "0.3.0",
        "endpoints": [
            "POST /v1/payments                         (internal)",
            "GET  /v1/payments/{id}",
            "POST /v1/payments/{id}/proof              (real chain — client wallet)",
            "POST /v1/payments/{id}/dev-checkout       (DEV — server-side Devnet signing)",
            "POST /v1/admin/payments/{id}/confirm      (DEV — skip chain entirely)",
        ],
        "demo_payer_configured": bool(DEMO_PAYER_PRIVATE_KEY_B64),
        "solana_rpc": SOLANA_RPC_URL,
    }


# ── Webhook enqueue helper ────────────────────────────────────────
async def _enqueue_event(order: dict, event_type: str) -> None:
    """Enqueue a webhook delivery if the order has a target URL."""
    url = order.get("webhook_url") or DEFAULT_TARGET_URL or None
    if not url:
        return
    payload = build_event_payload(order=order, event_type=event_type)
    async with app.state.db.begin() as conn:
        wid = await enqueue_webhook(
            conn,
            payment_order_id=order["id"],
            event_type=event_type,
            payload=payload,
            target_url=url,
        )
    log.info("webhook.enqueued", id=wid, order=order["id"], event_type=event_type, url=url)


# ── Confirmer loop ─────────────────────────────────────────────────
async def _confirmer_loop(app: FastAPI) -> None:
    """
    Background task: every poll-interval seconds, advance broadcasting orders
    to confirmed/failed based on Solana RPC status, then credit Token only
    for Token top-up orders.
    """
    await asyncio.sleep(2.0)  # give the rest of startup a moment
    while True:
        try:
            await _confirmer_tick(app)
        except asyncio.CancelledError:
            raise
        except Exception as e:  # noqa: BLE001
            log.error("confirmer.tick_error", err=str(e))
        try:
            await asyncio.sleep(CONFIRMER_POLL_INTERVAL_SECS)
        except asyncio.CancelledError:
            raise


async def _confirmer_tick(app: FastAPI) -> None:
    """One sweep through broadcasting orders."""
    async with app.state.db.connect() as conn:
        rows = (await conn.execute(
            select(db.payment_orders.c.id, db.payment_orders.c.tx_hash)
              .where(db.payment_orders.c.status == "broadcasting")
              .where(db.payment_orders.c.tx_hash.is_not(None))
              .limit(CONFIRMER_BATCH_SIZE)
        )).all()
    if not rows:
        return

    log.info("confirmer.tick", n_orders=len(rows))
    for row in rows:
        try:
            await _confirmer_advance_one(app, row.id, row.tx_hash)
        except Exception as e:  # noqa: BLE001
            log.error("confirmer.advance_error", order_id=row.id, err=str(e))


async def _confirmer_advance_one(app: FastAPI, order_id: str, tx_hash: str) -> None:
    """Poll RPC for one order; advance state on success."""
    status = await app.state.solana_rpc.get_signature_status(tx_hash)
    if status is None:
        return  # not yet seen by the network
    confirm_level = status.get("confirmationStatus")
    err = status.get("err")
    if err is not None:
        # Tx landed but failed (e.g. insufficient funds in source ATA)
        failed_order: Optional[dict] = None
        async with app.state.db.begin() as conn:
            try:
                failed_order = await OrderService.transition(
                    conn, order_id, from_status="broadcasting", to_status="failed",
                    updates={"status_reason": f"on_chain_error: {str(err)[:200]}"},
                )
            except OrderStateConflictError:
                pass
        if failed_order:
            await _enqueue_event(failed_order, "payment.failed")
        log.warning("confirmer.tx_failed", order_id=order_id, tx_hash=tx_hash, err=str(err))
        return
    if confirm_level not in ("confirmed", "finalized"):
        return  # still processing

    now = datetime.now(timezone.utc).replace(tzinfo=None)
    async with app.state.db.begin() as conn:
        try:
            order = await OrderService.transition(
                conn, order_id, from_status="broadcasting", to_status="confirmed",
                updates={"confirmed_at": now},
            )
        except OrderStateConflictError:
            return  # race with another worker

    if not _should_credit_token(order):
        await _enqueue_event(order, "payment.confirmed")
        log.info("confirmer.confirmed", order_id=order_id, tx_hash=tx_hash,
                 settlement_kind=_settlement_kind(order))
        return

    credit = await _credit_via_token_api(order, tx_hash)

    final_order: Optional[dict] = None
    async with app.state.db.begin() as conn:
        try:
            final_order = await OrderService.transition(
                conn, order_id, from_status="confirmed", to_status="token_credited",
                updates={"token_ledger_entry_id": credit["ledger_entry_id"]},
            )
        except OrderStateConflictError:
            pass
    if final_order:
        await _enqueue_event(final_order, "payment.token_credited")
    log.info("confirmer.credited", order_id=order_id, tx_hash=tx_hash,
             tokens=credit.get("balance_after_token"))


async def _credit_via_token_api(order: dict, tx_hash: str) -> dict:
    """Call token-api /internal/credit; returns its JSON body."""
    tokens = order["amount_usdc_micro"] * TOKEN_PER_USDC // 1_000_000
    try:
        resp = await app.state.http.post(
            f"{TOKEN_API_BASE_URL}/internal/credit",
            json={
                "merchant_id": order["merchant_id"],
                "amount_token": int(tokens),
                "payment_order_id": order["id"],
                "tx_hash": tx_hash,
            },
            headers={"X-Internal-Auth": INTERNAL_AUTH_SECRET},
            timeout=5.0,
        )
    except httpx.HTTPError as e:
        raise HTTPException(503, f"token-api unreachable: {e}") from e
    if resp.status_code >= 400:
        raise HTTPException(502, f"token credit failed: {resp.status_code} {resp.text[:200]}")
    return resp.json()
