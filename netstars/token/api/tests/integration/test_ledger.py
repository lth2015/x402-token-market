"""
Integration tests for LedgerService — require a running MySQL.

Run via docker compose:
    make up
    cd netstars/token/api
    poetry install --with dev
    DATABASE_URL='mysql+aiomysql://token_app:token_app_dev@localhost:3306/token_qa' \
      poetry run pytest tests/integration -v

These tests are SKIPPED if DATABASE_URL is not set (so CI without MySQL still passes).
"""
from __future__ import annotations

import os
from decimal import Decimal

import pytest
from sqlalchemy import delete, insert, select

# Skip the entire module if no DB available
pytestmark = pytest.mark.skipif(
    not os.environ.get("DATABASE_URL"),
    reason="DATABASE_URL not set; skipping integration tests",
)


@pytest.fixture
async def engine():
    from token_api import db
    eng = db.make_engine(os.environ["DATABASE_URL"])
    yield eng
    await eng.dispose()


@pytest.fixture
async def clean_merchant(engine):
    """Ensures a clean balance + no ledger entries for a fresh test merchant."""
    from token_api import db
    merchant_id = "mch_test_ledger"
    async with engine.begin() as conn:
        # Ensure merchant exists (FK requirement)
        existing = (await conn.execute(
            select(db.merchants.c.id).where(db.merchants.c.id == merchant_id)
        )).first()
        if not existing:
            await conn.execute(insert(db.merchants).values(
                id=merchant_id, name="Test", status="active", metadata={},
            ))
        # Wipe any prior ledger for this merchant
        await conn.execute(
            delete(db.token_ledger_entries).where(db.token_ledger_entries.c.merchant_id == merchant_id)
        )
        await conn.execute(delete(db.balances).where(db.balances.c.merchant_id == merchant_id))
    yield merchant_id


async def test_credit_creates_balance_and_entry(engine, clean_merchant):
    from token_api.ledger import LedgerService
    async with engine.begin() as conn:
        entry = await LedgerService.credit(
            conn,
            merchant_id=clean_merchant,
            amount_token=Decimal(1000),
            source="x402_payment",
            source_ref="pmt_test_001",
        )
    assert entry.balance_after == Decimal(1000)
    assert entry.type == "credit"

    async with engine.connect() as conn:
        bal = await LedgerService.get_balance(conn, clean_merchant)
        assert bal == Decimal(1000)


async def test_credit_idempotency_returns_existing_entry(engine, clean_merchant):
    from token_api.ledger import LedgerService
    async with engine.begin() as conn:
        e1 = await LedgerService.credit(
            conn, merchant_id=clean_merchant, amount_token=Decimal(500),
            source="x402_payment", source_ref="pmt_idem_001",
        )
    # Second call with same source_ref should NOT double-credit
    async with engine.begin() as conn:
        e2 = await LedgerService.credit(
            conn, merchant_id=clean_merchant, amount_token=Decimal(500),
            source="x402_payment", source_ref="pmt_idem_001",
        )
    assert e1.id == e2.id
    async with engine.connect() as conn:
        bal = await LedgerService.get_balance(conn, clean_merchant)
        assert bal == Decimal(500)  # only credited once


async def test_debit_reduces_balance(engine, clean_merchant):
    from token_api.ledger import LedgerService
    async with engine.begin() as conn:
        await LedgerService.credit(
            conn, merchant_id=clean_merchant, amount_token=Decimal(1000),
            source="promo", source_ref="seed",
        )
    async with engine.begin() as conn:
        entry = await LedgerService.debit(
            conn, merchant_id=clean_merchant, amount_token=Decimal(300),
            source="ai_call", request_id="req_test_001",
        )
    assert entry.balance_after == Decimal(700)


async def test_debit_insufficient_balance_raises(engine, clean_merchant):
    from token_api.ledger import InsufficientBalanceError, LedgerService
    async with engine.begin() as conn:
        await LedgerService.credit(
            conn, merchant_id=clean_merchant, amount_token=Decimal(100),
            source="promo", source_ref="seed2",
        )
    with pytest.raises(InsufficientBalanceError):
        async with engine.begin() as conn:
            await LedgerService.debit(
                conn, merchant_id=clean_merchant, amount_token=Decimal(200),
                source="ai_call",
            )
    # Balance unchanged
    async with engine.connect() as conn:
        bal = await LedgerService.get_balance(conn, clean_merchant)
        assert bal == Decimal(100)
