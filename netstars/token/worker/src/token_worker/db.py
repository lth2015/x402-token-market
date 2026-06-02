"""
Worker-side SQLAlchemy Core table references (sync, for APScheduler jobs).

We use synchronous SQLAlchemy here because APScheduler runs jobs in a thread
pool by default, and mixing asyncio inside those threads is cumbersome. The
worker does not need the throughput or latency profile of the API; correctness
and simplicity matter more.

AP2 compliance: this DB is the token-system's own DB only — never the x402 DB.
"""
from __future__ import annotations

from sqlalchemy import (
    BigInteger,
    Column,
    DateTime,
    Date,
    Integer,
    LargeBinary,
    MetaData,
    Numeric,
    SmallInteger,
    String,
    Table,
    func,
    create_engine,
)
from sqlalchemy.dialects.mysql import JSON, VARCHAR
from sqlalchemy import Engine

metadata = MetaData()

merchants = Table(
    "merchants", metadata,
    Column("id", VARCHAR(40), primary_key=True),
    Column("name", String(255)),
    Column("legal_name", String(255)),
    Column("tax_id", VARCHAR(64)),
    Column("currency_pref", VARCHAR(8)),
    Column("status", VARCHAR(16)),
    Column("metadata", JSON),
    Column("created_at", DateTime(6)),
)

token_ledger_entries = Table(
    "token_ledger_entries", metadata,
    Column("id", BigInteger, primary_key=True, autoincrement=True),
    Column("merchant_id", VARCHAR(40)),
    Column("project_id", VARCHAR(40)),
    Column("agent_key_id", VARCHAR(40)),
    Column("type", VARCHAR(16)),
    Column("amount_token", Numeric(30, 0)),
    Column("balance_after", Numeric(30, 0)),
    Column("source", VARCHAR(24)),
    Column("source_ref", VARCHAR(64)),
    Column("request_id", VARCHAR(40)),
    Column("description", String(255)),
    Column("trace_id", VARCHAR(64)),
    Column("created_at", DateTime(6)),
)

balances = Table(
    "balances", metadata,
    Column("merchant_id", VARCHAR(40), primary_key=True),
    Column("balance_token", Numeric(30, 0)),
    Column("on_hold_token", Numeric(30, 0)),
    Column("last_ledger_entry_id", BigInteger),
    Column("last_updated_at", DateTime(6)),
)

payment_orders_mirror = Table(
    "payment_orders_mirror", metadata,
    Column("payment_order_id", VARCHAR(40), primary_key=True),
    Column("merchant_id", VARCHAR(40)),
    Column("amount_usdc_micro", BigInteger),
    Column("tokens_credited", Numeric(30, 0)),
    Column("tx_hash", VARCHAR(96)),
    Column("status", VARCHAR(20)),
    Column("confirmed_at", DateTime(6)),
    Column("ledger_entry_id", BigInteger),
    Column("created_at", DateTime(6)),
    Column("updated_at", DateTime(6)),
)

requests = Table(
    "requests", metadata,
    Column("id", VARCHAR(40), primary_key=True),
    Column("agent_key_id", VARCHAR(40)),
    Column("merchant_id", VARCHAR(40)),
    Column("project_id", VARCHAR(40)),
    Column("model", VARCHAR(64)),
    Column("provider", VARCHAR(24)),
    Column("prompt_tokens", Integer),
    Column("completion_tokens", Integer),
    Column("cached_input_tokens", Integer),
    Column("cost_token", Numeric(30, 0)),
    Column("cost_usdc_equiv_micro", BigInteger),
    Column("status", VARCHAR(24)),
    Column("error_class", VARCHAR(64)),
    Column("latency_ms", Integer),
    Column("created_at", DateTime(6)),
    Column("metadata", JSON),
)

invoices = Table(
    "invoices", metadata,
    Column("id", VARCHAR(40), primary_key=True),
    Column("merchant_id", VARCHAR(40)),
    Column("period_yyyymm", String(6)),
    Column("subtotal_jpy", BigInteger),
    Column("tax_jpy", BigInteger),
    Column("total_jpy", BigInteger),
    Column("fx_rate_usdc_to_jpy", Numeric(10, 4)),
    Column("legacy_invoice_id", VARCHAR(64)),
    Column("pdf_url", VARCHAR(512)),
    Column("status", VARCHAR(16)),
    Column("issued_at", DateTime(6)),
    Column("paid_at", DateTime(6)),
    Column("created_at", DateTime(6)),
)

invoice_items = Table(
    "invoice_items", metadata,
    Column("id", BigInteger, primary_key=True, autoincrement=True),
    Column("invoice_id", VARCHAR(40)),
    Column("item_type", VARCHAR(32)),
    Column("description", String(255)),
    Column("quantity", Numeric(20, 4)),
    Column("unit_price_jpy", BigInteger),
    Column("amount_jpy", BigInteger),
    Column("metadata", JSON),
)

usage_daily = Table(
    "usage_daily", metadata,
    Column("merchant_id", VARCHAR(40)),
    Column("day", Date),
    Column("model", VARCHAR(64)),
    Column("request_count", BigInteger),
    Column("prompt_tokens", BigInteger),
    Column("completion_tokens", BigInteger),
    Column("total_cost_token", Numeric(30, 0)),
    Column("total_cost_usdc_micro", BigInteger),
    Column("refreshed_at", DateTime(6)),
)

audit_log = Table(
    "audit_log", metadata,
    Column("id", BigInteger, primary_key=True, autoincrement=True),
    Column("occurred_at", DateTime(6)),
    Column("actor_type", VARCHAR(16)),
    Column("actor_id", VARCHAR(64)),
    Column("action", VARCHAR(64)),
    Column("resource_type", VARCHAR(40)),
    Column("resource_id", VARCHAR(64)),
    Column("before_state", JSON),
    Column("after_state", JSON),
    Column("trace_id", VARCHAR(64)),
    Column("metadata", JSON),
)


def make_engine(url: str) -> Engine:
    """Return a synchronous SQLAlchemy engine (pymysql driver).

    Guards against the most common misconfiguration: accidentally passing an
    async URL (aiomysql / asyncmy) which causes the greenlet_spawn error at
    runtime inside BlockingScheduler threads.
    """
    _async_drivers = ("aiomysql", "asyncmy", "+async")
    for driver in _async_drivers:
        if driver in url:
            raise ValueError(
                f"token-worker uses BlockingScheduler + sync SQLAlchemy — "
                f"async driver detected in DATABASE_URL ('{driver}'). "
                f"Use mysql+pymysql:// instead."
            )
    return create_engine(
        url,
        pool_size=3,
        max_overflow=5,
        pool_pre_ping=True,
        pool_recycle=3600,
    )
