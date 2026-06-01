"""
OrderService — payment order lifecycle (create / fetch / transition).

Implements the FSM enforced in DESIGN.md §5; the DB trigger version was
deferred (see migrations/001_init.up.sql comment), so we rely on this
service exclusively to gatekeep transitions.
"""
from __future__ import annotations

import secrets
from datetime import datetime, timedelta, timezone
from typing import Optional

from sqlalchemy import insert, select, update
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncConnection

from . import db
from .ulid_util import new_ulid

# Allowed state transitions (matches DESIGN.md §5)
_TRANSITIONS = {
    "created":        {"pending", "expired", "canceled"},
    "pending":        {"broadcasting", "failed", "expired"},
    "broadcasting":   {"confirmed", "failed"},
    "confirmed":      {"token_credited"},
    "token_credited": {"refunded"},
}


class OrderStateConflictError(Exception):
    def __init__(self, current: str, attempted: str):
        super().__init__(f"illegal transition {current} → {attempted}")
        self.current = current
        self.attempted = attempted


class IdempotencyConflictError(Exception):
    """Same idempotency key, different body."""


class OrderService:
    """
    Stateless service. All methods need an open AsyncConnection.
    Caller decides when to commit.
    """

    @staticmethod
    async def create_payment(
        conn: AsyncConnection,
        *,
        merchant_id: str,
        api_key_id: str,
        amount_usdc_micro: int,
        idempotency_key: str,
        recipient_address: str,
        metadata: Optional[dict] = None,
        expiry_seconds: int = 1800,
        trace_id: Optional[str] = None,
        webhook_url: Optional[str] = None,
        resource: Optional[str] = None,
    ) -> dict:
        """
        Idempotent create. Returns the order row (existing or new) as a plain dict
        with all fields a 402 response needs.

        Idempotency strategy:
        1. SELECT existing row with (api_key_id, idempotency_key); if found → return it.
        2. INSERT; on UNIQUE-violation race, re-fetch and return existing.
        """
        # Fast path — look up existing
        existing = (await conn.execute(
            select(db.payment_orders).where(
                (db.payment_orders.c.api_key_id == api_key_id)
                & (db.payment_orders.c.idempotency_key == idempotency_key)
            )
        )).first()
        if existing is not None:
            return _row_to_dict(existing)

        order_id = "pmt_" + new_ulid()
        nonce = secrets.token_hex(32)
        expires_at = datetime.now(timezone.utc) + timedelta(seconds=expiry_seconds)

        try:
            await conn.execute(insert(db.payment_orders).values(
                id=order_id,
                merchant_id=merchant_id,
                api_key_id=api_key_id,
                idempotency_key=idempotency_key,
                amount_usdc_micro=amount_usdc_micro,
                recipient=recipient_address,
                nonce=nonce,
                status="created",
                expires_at=expires_at.replace(tzinfo=None),  # MySQL DATETIME has no tz
                metadata=metadata or {},
                created_trace_id=trace_id,
                webhook_url=webhook_url,
                resource=resource,
            ))
        except IntegrityError:
            # Race — another caller won. Re-fetch.
            row = (await conn.execute(
                select(db.payment_orders).where(
                    (db.payment_orders.c.api_key_id == api_key_id)
                    & (db.payment_orders.c.idempotency_key == idempotency_key)
                )
            )).first()
            if row is None:
                raise  # shouldn't happen but propagate
            return _row_to_dict(row)

        # Re-fetch to get all server-defaulted columns (created_at, etc.)
        row = (await conn.execute(
            select(db.payment_orders).where(db.payment_orders.c.id == order_id)
        )).first()
        return _row_to_dict(row)

    @staticmethod
    async def fetch(conn: AsyncConnection, order_id: str) -> Optional[dict]:
        row = (await conn.execute(
            select(db.payment_orders).where(db.payment_orders.c.id == order_id)
        )).first()
        return _row_to_dict(row) if row else None

    @staticmethod
    async def transition(
        conn: AsyncConnection,
        order_id: str,
        *,
        to_status: str,
        from_status: Optional[str] = None,
        updates: Optional[dict] = None,
    ) -> dict:
        """
        Move order to `to_status`. If `from_status` is given, verify before update.
        Otherwise infer current status from a SELECT … FOR UPDATE.
        """
        row = (await conn.execute(
            select(db.payment_orders)
              .where(db.payment_orders.c.id == order_id)
              .with_for_update()
        )).first()
        if row is None:
            raise LookupError(f"order not found: {order_id}")

        current = row.status
        if from_status is not None and current != from_status:
            raise OrderStateConflictError(current, to_status)

        if to_status not in _TRANSITIONS.get(current, set()):
            raise OrderStateConflictError(current, to_status)

        vals = {"status": to_status, **(updates or {})}
        await conn.execute(
            update(db.payment_orders)
              .where(db.payment_orders.c.id == order_id)
              .values(**vals)
        )

        updated = (await conn.execute(
            select(db.payment_orders).where(db.payment_orders.c.id == order_id)
        )).first()
        return _row_to_dict(updated)


def _row_to_dict(row) -> dict:
    if row is None:
        return None  # type: ignore
    return {
        "id": row.id,
        "merchant_id": row.merchant_id,
        "api_key_id": row.api_key_id,
        "idempotency_key": row.idempotency_key,
        "amount_usdc_micro": row.amount_usdc_micro,
        "recipient": row.recipient,
        "nonce": row.nonce,
        "network": row.network,
        "asset": row.asset,
        "resource": getattr(row, "resource", None),
        "status": row.status,
        "status_reason": row.status_reason,
        "expires_at": row.expires_at.replace(tzinfo=timezone.utc).isoformat() if row.expires_at else None,
        "tx_hash": row.tx_hash,
        "confirmed_at": row.confirmed_at.replace(tzinfo=timezone.utc).isoformat() if row.confirmed_at else None,
        "created_at": row.created_at.replace(tzinfo=timezone.utc).isoformat() if row.created_at else None,
        "metadata": row.metadata or {},
        "webhook_url": getattr(row, "webhook_url", None),
    }
