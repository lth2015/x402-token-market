"""
LedgerService · the single source of truth for AI Token balance changes.

Invariants:
- The ledger is APPEND-ONLY (no UPDATE / DELETE on token_ledger_entries).
- `balances` is a cache row; the true balance = SUM(credits) − SUM(debits).
- All credit/debit pass through this service inside a single transaction so
  the cache stays consistent.
- balance_token ≥ 0 enforced both by app (early raise) and DB CHECK constraint.

The caller is expected to BEGIN the transaction; this service participates
in it (so business logic can group e.g. debit + INSERT requests row atomically).
"""
from __future__ import annotations

from dataclasses import dataclass
from decimal import Decimal
from typing import Literal, Optional

from sqlalchemy import insert, select, update
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncConnection

from . import db


class InsufficientBalanceError(Exception):
    def __init__(self, required: Decimal, available: Decimal):
        super().__init__(f"insufficient balance: need {required}, have {available}")
        self.required = required
        self.available = available


@dataclass(frozen=True)
class LedgerEntry:
    id: int
    merchant_id: str
    type: str
    amount_token: Decimal
    balance_after: Decimal
    source: str
    source_ref: Optional[str]


class LedgerService:
    """All methods require an open AsyncConnection inside a transaction."""

    # ── Reads ───────────────────────────────────────────────────────
    @staticmethod
    async def get_balance(conn: AsyncConnection, merchant_id: str) -> Decimal:
        row = (await conn.execute(
            select(db.balances.c.balance_token).where(db.balances.c.merchant_id == merchant_id)
        )).first()
        return row.balance_token if row else Decimal(0)

    # ── Writes ──────────────────────────────────────────────────────
    @staticmethod
    async def credit(
        conn: AsyncConnection,
        *,
        merchant_id: str,
        amount_token: Decimal,
        source: Literal["x402_payment", "refund", "admin_adjust", "promo", "correction"],
        source_ref: Optional[str] = None,
        project_id: Optional[str] = None,
        agent_key_id: Optional[str] = None,
        description: Optional[str] = None,
        trace_id: Optional[str] = None,
    ) -> LedgerEntry:
        """Add tokens to merchant balance. Idempotent via source+source_ref check."""
        if amount_token <= 0:
            raise ValueError("credit amount must be > 0")

        # Idempotency: if a ledger entry already exists for this (source, source_ref),
        # short-circuit and return the existing one. Critical for X402 callback retries.
        if source_ref is not None:
            existing = (await conn.execute(
                select(db.token_ledger_entries).where(
                    (db.token_ledger_entries.c.source == source)
                    & (db.token_ledger_entries.c.source_ref == source_ref)
                )
            )).first()
            if existing:
                return _row_to_entry(existing)

        # Lock the balance row (or insert if absent) — FOR UPDATE
        balance_row = (await conn.execute(
            select(db.balances.c.balance_token)
              .where(db.balances.c.merchant_id == merchant_id)
              .with_for_update()
        )).first()

        if balance_row is None:
            await conn.execute(insert(db.balances).values(
                merchant_id=merchant_id,
                balance_token=Decimal(0),
                on_hold_token=Decimal(0),
            ))
            current = Decimal(0)
        else:
            current = balance_row.balance_token

        new_balance = current + amount_token

        result = await conn.execute(insert(db.token_ledger_entries).values(
            merchant_id=merchant_id,
            project_id=project_id,
            agent_key_id=agent_key_id,
            type="credit",
            amount_token=amount_token,
            balance_after=new_balance,
            source=source,
            source_ref=source_ref,
            description=description,
            trace_id=trace_id,
        ))
        entry_id = result.inserted_primary_key[0]

        await conn.execute(
            update(db.balances)
              .where(db.balances.c.merchant_id == merchant_id)
              .values(balance_token=new_balance, last_ledger_entry_id=entry_id)
        )

        return LedgerEntry(
            id=entry_id, merchant_id=merchant_id, type="credit",
            amount_token=amount_token, balance_after=new_balance,
            source=source, source_ref=source_ref,
        )

    @staticmethod
    async def debit(
        conn: AsyncConnection,
        *,
        merchant_id: str,
        amount_token: Decimal,
        source: Literal["ai_call", "admin_adjust", "correction"],
        source_ref: Optional[str] = None,
        request_id: Optional[str] = None,
        project_id: Optional[str] = None,
        agent_key_id: Optional[str] = None,
        description: Optional[str] = None,
        trace_id: Optional[str] = None,
    ) -> LedgerEntry:
        """Subtract tokens from merchant balance; raise InsufficientBalanceError if insufficient."""
        if amount_token <= 0:
            raise ValueError("debit amount must be > 0")

        # Lock + read
        balance_row = (await conn.execute(
            select(db.balances.c.balance_token)
              .where(db.balances.c.merchant_id == merchant_id)
              .with_for_update()
        )).first()

        current = balance_row.balance_token if balance_row else Decimal(0)
        new_balance = current - amount_token
        if new_balance < 0:
            raise InsufficientBalanceError(required=amount_token, available=current)

        try:
            result = await conn.execute(insert(db.token_ledger_entries).values(
                merchant_id=merchant_id,
                project_id=project_id,
                agent_key_id=agent_key_id,
                type="debit",
                amount_token=amount_token,
                balance_after=new_balance,
                source=source,
                source_ref=source_ref,
                request_id=request_id,
                description=description,
                trace_id=trace_id,
            ))
        except IntegrityError as e:
            # CHECK constraint may also reject negative balance — re-raise as InsufficientBalance
            if "chk_ledger_amount" in str(e) or "chk_balances_nonneg" in str(e):
                raise InsufficientBalanceError(required=amount_token, available=current) from e
            raise

        entry_id = result.inserted_primary_key[0]
        await conn.execute(
            update(db.balances)
              .where(db.balances.c.merchant_id == merchant_id)
              .values(balance_token=new_balance, last_ledger_entry_id=entry_id)
        )

        return LedgerEntry(
            id=entry_id, merchant_id=merchant_id, type="debit",
            amount_token=amount_token, balance_after=new_balance,
            source=source, source_ref=source_ref,
        )


def _row_to_entry(row) -> LedgerEntry:
    return LedgerEntry(
        id=row.id, merchant_id=row.merchant_id, type=row.type,
        amount_token=row.amount_token, balance_after=row.balance_after,
        source=row.source, source_ref=row.source_ref,
    )
