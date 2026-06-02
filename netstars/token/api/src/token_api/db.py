"""
SQLAlchemy Core table definitions + engine factory.

We deliberately stay on Core (no ORM) because:
- Ledger semantics are best expressed in raw INSERT/UPDATE with FOR UPDATE locks
- Avoids ORM session/identity-map traps in async contexts
- Schema mirrors db/migrations/001_init.up.sql exactly
"""
from __future__ import annotations

from sqlalchemy import (
    BigInteger,
    CheckConstraint,
    Column,
    DateTime,
    Index,
    Integer,
    LargeBinary,
    MetaData,
    Numeric,
    SmallInteger,
    String,
    Table,
    func,
)
from sqlalchemy.dialects.mysql import JSON, VARCHAR
from sqlalchemy.ext.asyncio import AsyncEngine, create_async_engine

metadata = MetaData()


merchants = Table(
    "merchants", metadata,
    Column("id", VARCHAR(40), primary_key=True),
    Column("name", String(255), nullable=False),
    Column("legal_name", String(255), nullable=True),
    Column("tax_id", VARCHAR(64), nullable=True),
    Column("contact_email_enc", LargeBinary(512), nullable=True),
    Column("contact_phone_enc", LargeBinary(256), nullable=True),
    Column("billing_address_enc", LargeBinary(1024), nullable=True),
    Column("currency_pref", VARCHAR(8), nullable=False, server_default="JPY"),
    Column("status", VARCHAR(16), nullable=False, server_default="active"),
    Column("crm_external_id", VARCHAR(64), nullable=True),
    Column("metadata", JSON, nullable=False),
    Column("created_at", DateTime(6), nullable=False, server_default=func.current_timestamp(6)),
    Column("updated_at", DateTime(6), nullable=False, server_default=func.current_timestamp(6)),
)

agent_keys = Table(
    "agent_keys", metadata,
    Column("id", VARCHAR(40), primary_key=True),
    Column("project_id", VARCHAR(40), nullable=False),
    Column("key_public", VARCHAR(64), nullable=False, unique=True),
    Column("key_secret_hash", String(64), nullable=False),
    Column("key_secret_enc", LargeBinary(512)),
    Column("label", String(128)),
    Column("allowed_models", JSON, nullable=False),
    Column("rate_limit_rpm", Integer, nullable=False, server_default="600"),
    Column("rate_limit_tpm", BigInteger, nullable=False, server_default="100000000"),
    Column("status", VARCHAR(16), nullable=False, server_default="active"),
    Column("created_at", DateTime(6), nullable=False, server_default=func.current_timestamp(6)),
    Column("last_used_at", DateTime(6)),
    Column("revoked_at", DateTime(6)),
)

projects = Table(
    "projects", metadata,
    Column("id", VARCHAR(40), primary_key=True),
    Column("merchant_id", VARCHAR(40), nullable=False),
    Column("name", String(128), nullable=False),
    Column("description", String(512), nullable=True),
    Column("monthly_limit_usdc_micro", BigInteger, nullable=True),
    Column("daily_limit_usdc_micro", BigInteger, nullable=True),
    Column("status", VARCHAR(16), nullable=False, server_default="active"),
)

balances = Table(
    "balances", metadata,
    Column("merchant_id", VARCHAR(40), primary_key=True),
    Column("balance_token", Numeric(30, 0), nullable=False, server_default="0"),
    Column("on_hold_token", Numeric(30, 0), nullable=False, server_default="0"),
    Column("last_ledger_entry_id", BigInteger),
    Column("last_updated_at", DateTime(6), nullable=False, server_default=func.current_timestamp(6)),
    CheckConstraint("balance_token >= 0 AND on_hold_token >= 0", name="chk_balances_nonneg"),
)

token_ledger_entries = Table(
    "token_ledger_entries", metadata,
    Column("id", BigInteger, primary_key=True, autoincrement=True),
    Column("merchant_id", VARCHAR(40), nullable=False, index=True),
    Column("project_id", VARCHAR(40)),
    Column("agent_key_id", VARCHAR(40)),
    Column("type", VARCHAR(16), nullable=False),
    Column("amount_token", Numeric(30, 0), nullable=False),
    Column("balance_after", Numeric(30, 0), nullable=False),
    Column("source", VARCHAR(24), nullable=False),
    Column("source_ref", VARCHAR(64)),
    Column("request_id", VARCHAR(40)),
    Column("description", String(255)),
    Column("trace_id", VARCHAR(64)),
    Column("created_at", DateTime(6), nullable=False, server_default=func.current_timestamp(6)),
    Index("idx_ledger_source", "source", "source_ref"),
)

payment_orders_mirror = Table(
    "payment_orders_mirror", metadata,
    Column("payment_order_id", VARCHAR(40), primary_key=True),
    Column("merchant_id", VARCHAR(40), nullable=False, index=True),
    Column("amount_usdc_micro", BigInteger, nullable=False),
    Column("tokens_credited", Numeric(30, 0)),
    Column("tx_hash", VARCHAR(96)),
    Column("status", VARCHAR(20), nullable=False),
    Column("confirmed_at", DateTime(6)),
    Column("ledger_entry_id", BigInteger),
    Column("created_at", DateTime(6), nullable=False, server_default=func.current_timestamp(6)),
    Column("updated_at", DateTime(6), nullable=False, server_default=func.current_timestamp(6)),
)

requests = Table(
    "requests", metadata,
    Column("id", VARCHAR(40), primary_key=True),
    Column("agent_key_id", VARCHAR(40), nullable=False),
    Column("merchant_id", VARCHAR(40), nullable=False, index=True),
    Column("project_id", VARCHAR(40)),
    Column("model", VARCHAR(64), nullable=False),
    Column("provider", VARCHAR(24), nullable=False),
    Column("prompt_tokens", Integer, nullable=False, server_default="0"),
    Column("completion_tokens", Integer, nullable=False, server_default="0"),
    Column("cached_input_tokens", Integer, nullable=False, server_default="0"),
    Column("cost_token", Numeric(30, 0), nullable=False, server_default="0"),
    Column("cost_usdc_equiv_micro", BigInteger, nullable=False, server_default="0"),
    Column("status", VARCHAR(24), nullable=False),
    Column("error_class", VARCHAR(64)),
    Column("error_message_truncated", String(512)),
    Column("latency_ms", Integer),
    Column("trace_id", VARCHAR(64)),
    Column("request_hash", String(64)),
    Column("metadata", JSON, nullable=False),
    Column("created_at", DateTime(6), nullable=False, server_default=func.current_timestamp(6)),
)


def make_engine(url: str) -> AsyncEngine:
    return create_async_engine(
        url,
        pool_size=5,
        max_overflow=10,
        pool_pre_ping=True,
        pool_recycle=3600,
    )
