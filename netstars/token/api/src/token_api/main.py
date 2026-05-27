"""
Token System API · v0.2.0
Real ledger + balance + X402 purchase coordination.

Endpoints in this version:
    GET  /healthz                 liveness
    GET  /readyz                  readiness with MySQL/Redis ping
    GET  /v1/balance              real balance from ledger cache
    GET  /v1/recent-activity      reads last N ledger entries (real, not mock)
    POST /v1/token-purchase       proxies to X402 to create payment intent
    POST /internal/credit         X402 calls this after payment confirms
    GET  /                        service info + TODO list

Not yet implemented (Tier 5+): real AI provider calls, invoice generator,
per-key rate limiter, real KMS-decrypted secrets (KMS_MODE=dev for now).
"""
from __future__ import annotations

import hashlib
import logging
import os
import time
import uuid
from contextlib import asynccontextmanager
from datetime import datetime, timezone
from decimal import Decimal
from typing import Optional

import httpx
import redis.asyncio as aioredis
import structlog
from fastapi import Depends, FastAPI, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from pydantic import BaseModel, Field
from sqlalchemy import desc, select, text

from . import db
from .auth import AuthContext, verify_request
from .kms import make_kms_client
from .ledger import InsufficientBalanceError, LedgerService
from .providers import (
    PROVIDER_AVAILABLE,
    ChatTurn,
    NormalizedRequest,
    ProviderError,
    estimate_from_request,
    price_for,
    provider_for_model,
    settle_cost_token,
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
log = structlog.get_logger("token-api")

# ── Settings ───────────────────────────────────────────────────────
ENV = os.environ.get("ENV", "local")
DATABASE_URL = os.environ.get(
    "DATABASE_URL",
    "mysql+aiomysql://token_app:token_app_dev@localhost:3306/token_qa",
)
REDIS_URL = os.environ.get("REDIS_URL", "redis://localhost:6379/1")
X402_API_BASE_URL = os.environ.get("X402_API_BASE_URL", "http://x402-api:8080")

# 1 USDC = 1,000,000 AI Token. (See token/DESIGN.md §2)
TOKEN_PER_USDC_MICRO = 1  # i.e. 1 token per 1 USDC-micro


@asynccontextmanager
async def lifespan(app: FastAPI):
    # Build the KMS client eagerly so a bad config (missing AWS perms,
    # bad region, missing boto3) crashes the pod at boot instead of on
    # the first authenticated request.
    kms = make_kms_client()
    log.info("startup", env=ENV, db=DATABASE_URL.split("@")[-1], kms_mode=kms.mode)
    app.state.db = db.make_engine(DATABASE_URL)
    app.state.redis = aioredis.from_url(REDIS_URL, decode_responses=True)
    app.state.http = httpx.AsyncClient(timeout=10.0)
    app.state.kms = kms
    yield
    log.info("shutdown")
    await app.state.db.dispose()
    await app.state.redis.aclose()
    await app.state.http.aclose()


app = FastAPI(
    title="Netstars Token API",
    version="0.2.0",
    docs_url="/docs" if ENV in ("local", "qa") else None,
    redoc_url=None,
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"] if ENV == "local" else ["https://qa.app.netstars.jp"],
    allow_methods=["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    allow_headers=["*"],
)


# ── Auth ───────────────────────────────────────────────────────────
# Real HMAC-SHA256 verification lives in token_api.auth.verify_request.
# Use it as a FastAPI dependency on every protected route.


# ── Pydantic IO models ─────────────────────────────────────────────
class BalanceOut(BaseModel):
    balance_token: str
    on_hold_token: str = "0"
    usdc_equivalent: str
    jpy_equivalent: str
    as_of: str


class CreditIn(BaseModel):
    """Body for POST /internal/credit (called by X402 after on-chain confirm)."""
    merchant_id: str
    amount_token: int = Field(..., gt=0)
    payment_order_id: str
    tx_hash: Optional[str] = None
    trace_id: Optional[str] = None


class TokenPurchaseIn(BaseModel):
    amount_usdc: float = Field(..., gt=0, le=10000)
    idempotency_key: Optional[str] = None


class TokenPurchaseOut(BaseModel):
    payment_order_id: str
    amount_usdc_micro: int
    recipient: str
    nonce: str
    expires_at: str
    status: str


# ── Health ─────────────────────────────────────────────────────────
@app.get("/healthz")
async def healthz():
    return {"status": "ok", "service": "token-api", "version": "0.2.0"}


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
    code = 200 if overall == "ok" else 503
    return JSONResponse({"status": overall, "checks": checks}, status_code=code)


# ── Balance ────────────────────────────────────────────────────────
@app.get("/v1/balance", response_model=BalanceOut)
async def balance(auth: AuthContext = Depends(verify_request)):
    async with app.state.db.connect() as conn:
        bal = await LedgerService.get_balance(conn, auth.merchant_id)
    usdc_eq = float(bal) / 1_000_000
    jpy_eq = usdc_eq * 150  # mock FX
    return BalanceOut(
        balance_token=str(int(bal)),
        usdc_equivalent=f"{usdc_eq:.4f}",
        jpy_equivalent=f"{jpy_eq:.0f}",
        as_of=datetime.now(timezone.utc).isoformat(),
    )


# ── Recent activity (real ledger reads) ────────────────────────────
@app.get("/v1/recent-activity")
async def recent_activity(limit: int = 20, auth: AuthContext = Depends(verify_request)):
    """Reads last N ledger entries for the merchant. Powers Console Live Activity Ticker."""
    merchant_id = auth.merchant_id
    items = []
    async with app.state.db.connect() as conn:
        rows = (await conn.execute(
            select(db.token_ledger_entries)
              .where(db.token_ledger_entries.c.merchant_id == merchant_id)
              .order_by(desc(db.token_ledger_entries.c.created_at))
              .limit(min(limit, 100))
        )).all()
    for r in rows:
        kind = "credit" if r.type == "credit" else "debit"
        icon = "💳" if r.source == "x402_payment" else ("🧠" if r.source == "ai_call" else "ℹ")
        items.append({
            "id": f"led_{r.id}",
            "ts": r.created_at.replace(tzinfo=timezone.utc).isoformat() if r.created_at else None,
            "kind": kind,
            "icon": icon,
            "description": r.description or (
                "Token purchase" if r.source == "x402_payment"
                else "AI call" if r.source == "ai_call"
                else r.source.replace("_", " ").title()
            ),
            "path": (
                "api/v1/token-purchase" if r.source == "x402_payment"
                else "api/v1/messages" if r.source == "ai_call"
                else r.source
            ),
            "amount_jpy": None,
            "amount_usdc": (float(r.amount_token) / 1_000_000) if r.source == "x402_payment" else None,
            "amount_token": int(r.amount_token),
            "trace_id": r.trace_id or "",
        })
    return {"items": items, "is_mock": False}


# ── Token purchase (creates a payment order via X402) ──────────────
@app.post("/v1/token-purchase", response_model=TokenPurchaseOut)
async def token_purchase(
    body: TokenPurchaseIn,
    request: Request,
    auth: AuthContext = Depends(verify_request),
):
    amount_usdc_micro = int(round(body.amount_usdc * 1_000_000))
    idempotency_key = body.idempotency_key or request.headers.get("Idempotency-Key")
    if not idempotency_key:
        raise HTTPException(400, "Idempotency-Key header or body field required")

    # Delegate to X402 with internal-service shared-secret auth
    from .auth import INTERNAL_AUTH_SECRET
    payload = {
        "merchant_id": auth.merchant_id,
        "api_key_id": auth.agent_key_id,
        "amount_usdc_micro": amount_usdc_micro,
        "idempotency_key": idempotency_key,
    }
    log.info("token_purchase.delegate", **payload)
    try:
        resp = await app.state.http.post(
            f"{X402_API_BASE_URL}/v1/payments",
            json=payload,
            headers={
                "X-Internal-Caller": "token-api",
                "X-Internal-Auth":   INTERNAL_AUTH_SECRET,
            },
        )
    except httpx.HTTPError as e:
        raise HTTPException(503, f"X402 unreachable: {e}") from e
    if resp.status_code >= 400:
        raise HTTPException(resp.status_code, f"X402 error: {resp.text[:200]}")
    # x402 calls the field `id`; we expose it as `payment_order_id` to keep
    # downstream consumers (SDK / Console) speaking the same vocabulary the
    # ledger uses.
    j = resp.json()
    return {
        "payment_order_id": j["id"],
        "amount_usdc_micro": j["amount_usdc_micro"],
        "recipient":         j["recipient"],
        "nonce":             j["nonce"],
        "expires_at":        j["expires_at"],
        "status":            j["status"],
    }


# ── Credit endpoint (called by X402 after on-chain confirmation) ───
@app.post("/internal/credit")
async def internal_credit(body: CreditIn, auth: AuthContext = Depends(verify_request)):
    """
    Idempotent: same (source='x402_payment', source_ref=payment_order_id) returns
    the existing ledger entry rather than double-crediting.

    Restricted to internal callers (X-Internal-Auth header). Anyone able to
    POST here without that header gets 401.
    """
    if not auth.is_internal:
        raise HTTPException(403, "internal endpoint — requires X-Internal-Auth")
    async with app.state.db.begin() as conn:
        entry = await LedgerService.credit(
            conn,
            merchant_id=body.merchant_id,
            amount_token=Decimal(body.amount_token),
            source="x402_payment",
            source_ref=body.payment_order_id,
            description=f"Token purchased via x402 ({body.tx_hash[:12] + '…' if body.tx_hash else 'no-tx'})",
            trace_id=body.trace_id,
        )
    log.info("credit.ok", merchant_id=body.merchant_id, amount=body.amount_token,
             ledger_entry_id=entry.id, balance_after=str(entry.balance_after))
    return {
        "ok": True,
        "ledger_entry_id": entry.id,
        "balance_after_token": str(int(entry.balance_after)),
    }


# ── AI call (real provider router) ────────────────────────────────
class ChatMessageIn(BaseModel):
    role: str = Field(..., pattern="^(system|user|assistant)$")
    content: str


class ChatIn(BaseModel):
    model: str
    messages: list[ChatMessageIn]
    max_tokens: int = Field(4096, gt=0, le=64_000)
    temperature: float = Field(1.0, ge=0.0, le=2.0)
    system: Optional[str] = None


async def _persist_request_row(
    *,
    request_id: str,
    auth: AuthContext,
    model: str,
    provider_vendor: str,
    prompt_tokens: int,
    completion_tokens: int,
    cached_input_tokens: int,
    cost_token: int,
    status: str,
    error_class: Optional[str],
    latency_ms: int,
    trace_id: Optional[str],
    request_hash: str,
    extra_meta: dict,
) -> None:
    """Best-effort persistence into the `requests` table for audit + analytics."""
    try:
        async with app.state.db.begin() as conn:
            await conn.execute(db.requests.insert().values(
                id=request_id,
                agent_key_id=auth.agent_key_id,
                merchant_id=auth.merchant_id,
                project_id=auth.project_id,
                model=model,
                provider=provider_vendor,
                prompt_tokens=prompt_tokens,
                completion_tokens=completion_tokens,
                cost_token=Decimal(cost_token),
                cost_usdc_equiv_micro=cost_token,  # 1 Token = 1 micro-USDC
                status=status,
                error_class=error_class,
                latency_ms=latency_ms,
                trace_id=trace_id,
                metadata={
                    "cached_input_tokens": cached_input_tokens,
                    **extra_meta,
                },
            ))
    except Exception as e:  # noqa: BLE001
        log.warning("requests.persist_failed", err=str(e), request_id=request_id)


@app.post("/v1/messages")
async def chat(
    body: ChatIn,
    request: Request,
    auth: AuthContext = Depends(verify_request),
):
    """
    Real AI call. Pre-flight balance check; provider dispatch; settle with
    the provider's exact reported usage; persist a `requests` audit row.

    If no real API key is configured for the model's provider (env value is
    missing or contains 'DUMMY'), we transparently fall back to a canned
    stub response so demos run without real keys.
    """
    request_id = f"req_{uuid.uuid4().hex[:24]}"
    trace_id = request.headers.get("traceparent")
    body_bytes = await request.body()
    request_hash = hashlib.sha256(body_bytes).hexdigest()

    turns = [ChatTurn(role=m.role, content=m.content) for m in body.messages]
    norm = NormalizedRequest(
        model=body.model,
        turns=turns,
        max_tokens=body.max_tokens,
        temperature=body.temperature,
        system=body.system,
    )

    # 1. Pre-flight 402 check: refuse if balance can't cover worst-case cost
    estimated = estimate_from_request(norm)
    async with app.state.db.connect() as conn:
        current_balance = await LedgerService.get_balance(conn, auth.merchant_id)
    if current_balance < estimated:
        raise HTTPException(402, detail={
            "error_code": "INSUFFICIENT_BALANCE",
            "detail": (
                f"need ≥{estimated} token (worst-case for this request); "
                f"have {int(current_balance)}"
            ),
            "metadata": {
                "required_token": estimated,
                "available_token": int(current_balance),
                "model": body.model,
                "price_per_1k_input": price_for(body.model).input_per_1k,
                "price_per_1k_output": price_for(body.model).output_per_1k,
            },
            # SDK X402Coordinator looks for `payment_intent` to trigger auto-retry.
            # We don't pre-create an order here — the caller should POST
            # /v1/token-purchase first. payment_intent stays null for v0.2.
            "payment_intent": None,
        })

    # 2. Provider call (or stub fallback)
    started = time.monotonic()
    provider_vendor = "stub"
    finish_reason: Optional[str] = "stop"
    content_text = ""
    usage_prompt = 0
    usage_completion = 0
    usage_cached = 0
    provider_response_id: Optional[str] = None
    extra_meta: dict = {}

    use_real = PROVIDER_AVAILABLE(body.model)
    if use_real:
        try:
            provider = provider_for_model(body.model, app.state.http)
            provider_vendor = provider.vendor
            resp = await provider.chat(norm)
            content_text = resp.content
            finish_reason = resp.finish_reason or "stop"
            usage_prompt = resp.usage.prompt_tokens
            usage_completion = resp.usage.completion_tokens
            usage_cached = resp.usage.cached_input_tokens
            provider_response_id = resp.provider_response_id
            extra_meta = {
                "model_returned": resp.model_returned,
                "provider_response_id": resp.provider_response_id,
            }
        except ProviderError as e:
            latency = int((time.monotonic() - started) * 1000)
            await _persist_request_row(
                request_id=request_id, auth=auth, model=body.model,
                provider_vendor=e.vendor or provider_vendor,
                prompt_tokens=0, completion_tokens=0, cached_input_tokens=0,
                cost_token=0,
                status="error",
                error_class=type(e).__name__,
                latency_ms=latency,
                trace_id=trace_id,
                request_hash=request_hash,
                extra_meta={"error": str(e)[:500], "status_code": e.status_code},
            )
            log.warning("chat.provider_failed", model=body.model, vendor=e.vendor,
                        status=e.status_code, err=str(e))
            raise HTTPException(
                status_code=e.status_code if e.status_code and 400 <= e.status_code < 600 else 502,
                detail={
                    "error_code": "PROVIDER_ERROR",
                    "detail": str(e)[:400],
                    "metadata": {"vendor": e.vendor, "retryable": e.retryable},
                },
            ) from e
    else:
        # No real key for this provider — return canned stub so demos work
        last_user = next((m for m in reversed(body.messages) if m.role == "user"), None)
        content_text = f"(stub — {body.model}'s API key not configured) you said: {last_user.content[:80] if last_user else ''}"
        usage_prompt = sum(len(m.content) for m in body.messages) // 4
        usage_completion = max(8, len(content_text) // 4)
        finish_reason = "stub"

    latency_ms = int((time.monotonic() - started) * 1000)

    # 3. Settle: exact cost from real usage (or estimated cost in stub mode)
    if use_real:
        from .providers.base import Usage as ProviderUsage
        cost_token = settle_cost_token(
            body.model,
            ProviderUsage(
                prompt_tokens=usage_prompt,
                completion_tokens=usage_completion,
                cached_input_tokens=usage_cached,
            ),
        )
    else:
        # Stub mode: charge a flat, modest cost so the ledger still moves
        cost_token = max(1, (usage_prompt + usage_completion) * 5)

    try:
        async with app.state.db.begin() as conn:
            entry = await LedgerService.debit(
                conn,
                merchant_id=auth.merchant_id,
                amount_token=Decimal(cost_token),
                source="ai_call",
                source_ref=None,
                request_id=request_id,
                description=f"{provider_vendor}/{body.model}",
                trace_id=trace_id,
            )
    except InsufficientBalanceError as e:
        # Rare: balance was sufficient at the pre-flight but dropped under
        # the actual cost during the call. Persist the request as 'unbilled'
        # and surface 402 so the SDK can top up & retry.
        await _persist_request_row(
            request_id=request_id, auth=auth, model=body.model,
            provider_vendor=provider_vendor,
            prompt_tokens=usage_prompt, completion_tokens=usage_completion,
            cached_input_tokens=usage_cached,
            cost_token=cost_token, status="unbilled",
            error_class="InsufficientBalanceError",
            latency_ms=latency_ms, trace_id=trace_id,
            request_hash=request_hash, extra_meta=extra_meta,
        )
        raise HTTPException(402, detail={
            "error_code": "INSUFFICIENT_BALANCE",
            "detail": str(e),
            "metadata": {"required": str(e.required), "available": str(e.available)},
            "payment_intent": None,
        }) from e

    # 4. Persist request audit row
    await _persist_request_row(
        request_id=request_id, auth=auth, model=body.model,
        provider_vendor=provider_vendor,
        prompt_tokens=usage_prompt, completion_tokens=usage_completion,
        cached_input_tokens=usage_cached,
        cost_token=cost_token, status="ok",
        error_class=None,
        latency_ms=latency_ms, trace_id=trace_id,
        request_hash=request_hash, extra_meta=extra_meta,
    )

    log.info("chat.ok", request_id=request_id, model=body.model, vendor=provider_vendor,
             cost_token=cost_token, latency_ms=latency_ms,
             prompt_tokens=usage_prompt, completion_tokens=usage_completion)

    return {
        "id": request_id,
        "content": content_text,
        "finish_reason": finish_reason,
        "usage": {
            "prompt_tokens": usage_prompt,
            "completion_tokens": usage_completion,
            "cached_input_tokens": usage_cached,
            "tokens_consumed": cost_token,
            "balance_after": int(entry.balance_after),
            "cost_usdc_equiv": cost_token / 1_000_000,
        },
        "provider": provider_vendor,
        "model": body.model,
        "trace_id": trace_id,
    }


@app.get("/")
async def root():
    return {
        "service": "token-api",
        "version": "0.2.0",
        "endpoints": [
            "GET  /v1/balance",
            "GET  /v1/recent-activity",
            "POST /v1/token-purchase  (delegates to x402)",
            "POST /internal/credit    (called by x402)",
            "POST /v1/messages        (stub AI call → debit)",
        ],
    }
