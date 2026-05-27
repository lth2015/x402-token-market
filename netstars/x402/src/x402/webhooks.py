"""
Webhook enqueue + delivery.

Lifecycle:
    1. State transition (token_credited / failed / expired) calls `enqueue()`
       which INSERTs a row into `webhook_deliveries` with status='pending'
       and next_retry_at=NOW (eligible immediately).
    2. The background `Deliverer` task wakes every POLL_INTERVAL seconds,
       SELECTs eligible rows (`status IN ('pending','failed_retrying') AND
       next_retry_at <= NOW`) up to BATCH_SIZE, then POSTs each in parallel.
    3. Per-row outcome:
         2xx              → status='delivered',          delivered_at=NOW
         4xx (non-429)    → status='failed_dead_letter'  (won't be retried)
         5xx/429/timeout  → attempt_count++,             next_retry_at=NOW+backoff
                            status='failed_retrying' until attempt_count > MAX,
                            then 'failed_dead_letter'

Backoff schedule (matches Stripe's defaults, ±20% jitter):
    1m, 5m, 15m, 1h, 6h, 24h, then dead letter.

Signature format (Stripe-compatible v1):
    Header  X-Netstars-Signature: t=<unix>,v1=<sha256-hex>
    Where sha256 = HMAC-SHA256(secret, f"{t}.{body}")

    Plus convenience headers:
        X-Netstars-Event:    payment.token_credited
        X-Netstars-Delivery: wh_<id>
        X-Netstars-Trace:    <w3c traceparent>     (if available)

Concurrency: single-replica in v0.2 — same pattern as the confirmer loop.
Multi-replica safety: switch the SELECT to `... FOR UPDATE SKIP LOCKED`
and add a redis lock or partition by id%N. Tracked in DESIGN.md follow-ups.
"""
from __future__ import annotations

import asyncio
import hashlib
import hmac
import json
import os
import random
import time
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
from typing import Optional

import httpx
import structlog
from sqlalchemy import select, update
from sqlalchemy.ext.asyncio import AsyncConnection, AsyncEngine

from . import db

log = structlog.get_logger("x402-webhooks")

# ── Config (env-overridable) ──────────────────────────────────────
POLL_INTERVAL_SECS = float(os.environ.get("WEBHOOK_POLL_INTERVAL_SECS", "3.0"))
BATCH_SIZE        = int(os.environ.get("WEBHOOK_BATCH_SIZE",         "25"))
HTTP_TIMEOUT_SECS = float(os.environ.get("WEBHOOK_HTTP_TIMEOUT_SECS","8.0"))
MAX_ATTEMPTS      = int(os.environ.get("WEBHOOK_MAX_ATTEMPTS",       "6"))

# Backoff per attempt (1-indexed). attempts > len use the last value.
_BACKOFF_SECS = [60, 300, 900, 3_600, 21_600, 86_400]
_JITTER_FRAC = 0.20  # ±20%

DEFAULT_SIGNING_SECRET = os.environ.get("WEBHOOK_SIGNING_SECRET", "whsec_localdev_change_me")
DEFAULT_TARGET_URL    = os.environ.get("WEBHOOK_DEFAULT_URL", "")  # empty = don't auto-stamp orders


# ── Event payload shapers ────────────────────────────────────────
def build_event_payload(*, order: dict, event_type: str) -> dict:
    """The body partners receive. Keep stable — versioning will be `event_version`."""
    return {
        "event_version": "1",
        "event_type": event_type,
        "occurred_at": datetime.now(timezone.utc).isoformat(),
        "payment_order": {
            "id": order["id"],
            "merchant_id": order["merchant_id"],
            "amount_usdc_micro": order["amount_usdc_micro"],
            "asset": order.get("asset", "USDC"),
            "network": order.get("network", "solana"),
            "status": order["status"],
            "tx_hash": order.get("tx_hash"),
            "confirmed_at": order.get("confirmed_at"),
            "status_reason": order.get("status_reason"),
        },
    }


# ── Signature ─────────────────────────────────────────────────────
def compute_signature(secret: str, *, timestamp: int, body: bytes) -> str:
    """Return the value for X-Netstars-Signature."""
    payload = f"{timestamp}.".encode() + body
    sig = hmac.new(secret.encode("utf-8"), payload, hashlib.sha256).hexdigest()
    return f"t={timestamp},v1={sig}"


# ── Enqueue ───────────────────────────────────────────────────────
async def enqueue(
    conn: AsyncConnection,
    *,
    payment_order_id: str,
    event_type: str,
    payload: dict,
    target_url: Optional[str],
) -> Optional[int]:
    """
    Insert a webhook delivery row if `target_url` is non-empty.
    Returns the new row id, or None if no target was configured.
    Caller manages the txn — pass an open AsyncConnection.
    """
    if not target_url:
        return None
    res = await conn.execute(db.webhook_deliveries.insert().values(
        payment_order_id=payment_order_id,
        event_type=event_type,
        target_url=target_url,
        payload_json=payload,
        status="pending",
        next_retry_at=datetime.now(timezone.utc).replace(tzinfo=None),
    ))
    return int(res.inserted_primary_key[0]) if res.inserted_primary_key else None


# ── Deliverer loop ────────────────────────────────────────────────
@dataclass(slots=True)
class _Row:
    id: int
    payment_order_id: str
    event_type: str
    target_url: str
    payload_json: dict
    attempt_count: int


class Deliverer:
    """Background webhook deliverer. One instance per service process."""

    def __init__(self, *, engine: AsyncEngine, http: httpx.AsyncClient, signing_secret: str):
        self._engine = engine
        self._http = http
        self._secret = signing_secret
        self._task: Optional[asyncio.Task] = None

    def start(self) -> None:
        if self._task and not self._task.done():
            return
        self._task = asyncio.create_task(self._loop(), name="x402.webhook_deliverer")
        log.info("webhook_deliverer.started",
                 poll_interval=POLL_INTERVAL_SECS, batch=BATCH_SIZE,
                 max_attempts=MAX_ATTEMPTS, default_url=DEFAULT_TARGET_URL or "(none)")

    async def stop(self) -> None:
        if not self._task:
            return
        self._task.cancel()
        try:
            await self._task
        except asyncio.CancelledError:
            pass
        self._task = None

    # ── Internals ─────────────────────────────────────────────────
    async def _loop(self) -> None:
        await asyncio.sleep(2.0)  # let the rest of startup settle
        while True:
            try:
                await self._tick()
            except asyncio.CancelledError:
                raise
            except Exception as e:  # noqa: BLE001
                log.error("webhook_deliverer.tick_error", err=str(e))
            try:
                await asyncio.sleep(POLL_INTERVAL_SECS)
            except asyncio.CancelledError:
                raise

    async def _tick(self) -> None:
        now = datetime.now(timezone.utc).replace(tzinfo=None)
        async with self._engine.connect() as conn:
            rows = (await conn.execute(
                select(
                    db.webhook_deliveries.c.id,
                    db.webhook_deliveries.c.payment_order_id,
                    db.webhook_deliveries.c.event_type,
                    db.webhook_deliveries.c.target_url,
                    db.webhook_deliveries.c.payload_json,
                    db.webhook_deliveries.c.attempt_count,
                )
                  .where(db.webhook_deliveries.c.status.in_(["pending", "failed_retrying"]))
                  .where(db.webhook_deliveries.c.next_retry_at <= now)
                  .order_by(db.webhook_deliveries.c.next_retry_at)
                  .limit(BATCH_SIZE)
            )).all()
        if not rows:
            return

        log.info("webhook_deliverer.tick", n=len(rows))
        await asyncio.gather(*(self._deliver_one(_Row(
            id=r.id,
            payment_order_id=r.payment_order_id,
            event_type=r.event_type,
            target_url=r.target_url,
            payload_json=r.payload_json,
            attempt_count=r.attempt_count,
        )) for r in rows), return_exceptions=True)

    async def _deliver_one(self, row: _Row) -> None:
        body = json.dumps(row.payload_json, separators=(",", ":"), sort_keys=False).encode()
        ts = int(time.time())
        sig = compute_signature(self._secret, timestamp=ts, body=body)
        headers = {
            "Content-Type":           "application/json",
            "User-Agent":             "Netstars-X402-Webhook/1.0",
            "X-Netstars-Event":       row.event_type,
            "X-Netstars-Delivery":    f"wh_{row.id}",
            "X-Netstars-Signature":   sig,
            "X-Netstars-Timestamp":   str(ts),
        }

        status: Optional[int] = None
        resp_body_excerpt = ""
        kind = "transport_error"
        try:
            r = await self._http.post(row.target_url, content=body, headers=headers,
                                      timeout=HTTP_TIMEOUT_SECS)
            status = r.status_code
            resp_body_excerpt = r.text[:1000]
            if 200 <= status < 300:
                await self._mark_delivered(row.id, status, resp_body_excerpt)
                log.info("webhook.delivered", id=row.id, order=row.payment_order_id,
                         event=row.event_type, status=status)
                return
            if 400 <= status < 500 and status != 429:
                # Client error — partner's endpoint says "never going to accept this"
                kind = "client_error_dead_letter"
                await self._mark_dead_letter(row.id, status, resp_body_excerpt, kind)
                log.warning("webhook.dead_letter_4xx", id=row.id, status=status,
                            url=row.target_url, body=resp_body_excerpt[:200])
                return
            # 5xx, 429, anything else → retry
            kind = f"http_{status}"
        except httpx.HTTPError as e:
            resp_body_excerpt = f"{type(e).__name__}: {e!s}"[:1000]
            kind = "transport_error"

        # Retry path
        next_attempt = row.attempt_count + 1
        if next_attempt >= MAX_ATTEMPTS:
            await self._mark_dead_letter(row.id, status, resp_body_excerpt, kind)
            log.warning("webhook.dead_letter_max_attempts", id=row.id,
                        attempts=next_attempt, last_kind=kind)
            return
        delay = _compute_backoff(next_attempt)
        next_at = datetime.now(timezone.utc).replace(tzinfo=None) + timedelta(seconds=delay)
        await self._mark_retrying(row.id, attempt=next_attempt,
                                  status=status, body=resp_body_excerpt, next_at=next_at)
        log.info("webhook.retry_scheduled", id=row.id, attempt=next_attempt,
                 delay_s=int(delay), kind=kind)

    async def _mark_delivered(self, row_id: int, status: int, body_excerpt: str) -> None:
        now = datetime.now(timezone.utc).replace(tzinfo=None)
        async with self._engine.begin() as conn:
            await conn.execute(
                update(db.webhook_deliveries)
                  .where(db.webhook_deliveries.c.id == row_id)
                  .values(
                      status="delivered",
                      delivered_at=now,
                      last_attempt_at=now,
                      last_response_code=status,
                      last_response_body=body_excerpt[:1024],
                      attempt_count=db.webhook_deliveries.c.attempt_count + 1,
                  )
            )

    async def _mark_dead_letter(self, row_id: int, status: Optional[int],
                                body_excerpt: str, kind: str) -> None:
        now = datetime.now(timezone.utc).replace(tzinfo=None)
        async with self._engine.begin() as conn:
            await conn.execute(
                update(db.webhook_deliveries)
                  .where(db.webhook_deliveries.c.id == row_id)
                  .values(
                      status="failed_dead_letter",
                      last_attempt_at=now,
                      last_response_code=status,
                      last_response_body=f"[{kind}] {body_excerpt}"[:1024],
                      attempt_count=db.webhook_deliveries.c.attempt_count + 1,
                  )
            )

    async def _mark_retrying(self, row_id: int, *, attempt: int,
                             status: Optional[int], body: str, next_at: datetime) -> None:
        now = datetime.now(timezone.utc).replace(tzinfo=None)
        async with self._engine.begin() as conn:
            await conn.execute(
                update(db.webhook_deliveries)
                  .where(db.webhook_deliveries.c.id == row_id)
                  .values(
                      status="failed_retrying",
                      attempt_count=attempt,
                      last_attempt_at=now,
                      last_response_code=status,
                      last_response_body=body[:1024],
                      next_retry_at=next_at,
                  )
            )


def _compute_backoff(attempt: int) -> float:
    """attempt is 1-indexed (the attempt about to be scheduled, not the one just done)."""
    idx = min(len(_BACKOFF_SECS) - 1, max(0, attempt - 1))
    base = _BACKOFF_SECS[idx]
    jitter = base * _JITTER_FRAC
    return base + random.uniform(-jitter, jitter)
