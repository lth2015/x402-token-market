"""SQLAlchemy Core table definitions for X402 gateway."""
from __future__ import annotations

from sqlalchemy import BigInteger, CheckConstraint, Column, DateTime, Index, Integer, LargeBinary, MetaData, String, Table, func
from sqlalchemy.dialects.mysql import JSON, MEDIUMTEXT, SMALLINT, VARCHAR
from sqlalchemy.ext.asyncio import AsyncEngine, create_async_engine

metadata = MetaData()

payment_orders = Table(
    "payment_orders", metadata,
    Column("id", VARCHAR(40), primary_key=True),
    Column("merchant_id", VARCHAR(40), nullable=False),
    Column("api_key_id", VARCHAR(40), nullable=False),
    Column("idempotency_key", VARCHAR(80), nullable=False),
    Column("amount_usdc_micro", BigInteger, nullable=False),
    Column("recipient", VARCHAR(64), nullable=False),
    Column("nonce", String(64), nullable=False),
    Column("network", VARCHAR(16), nullable=False, server_default="solana"),
    Column("asset", VARCHAR(16), nullable=False, server_default="USDC"),
    Column("resource", String(512)),  # x402 protocol — URL/path this proof unlocks
    Column("status", VARCHAR(20), nullable=False, server_default="created"),
    Column("status_reason", String(255)),
    Column("expires_at", DateTime(6), nullable=False),
    Column("tx_hash", VARCHAR(96)),
    Column("solana_slot", BigInteger),
    Column("confirmed_at", DateTime(6)),
    Column("wea_settlement_id", VARCHAR(40)),
    Column("token_ledger_entry_id", BigInteger),
    Column("metadata", JSON, nullable=False),
    Column("webhook_url", String(512)),
    Column("webhook_secret_enc", LargeBinary(512)),
    Column("created_at", DateTime(6), nullable=False, server_default=func.current_timestamp(6)),
    Column("updated_at", DateTime(6), nullable=False, server_default=func.current_timestamp(6)),
    Column("created_trace_id", VARCHAR(64)),
    CheckConstraint("amount_usdc_micro > 0", name="chk_payment_orders_amount"),
    Index("idx_payment_orders_status", "status", "created_at"),
)

payment_proofs = Table(
    "payment_proofs", metadata,
    Column("id", BigInteger, primary_key=True, autoincrement=True),
    Column("payment_order_id", VARCHAR(40), nullable=False),
    Column("signed_tx_b64", MEDIUMTEXT, nullable=False),
    Column("signed_tx_hash", String(64)),   # SHA-256(signed_tx_b64) — UNIQUE for replay protection
    Column("parsed_tx", JSON),
    Column("verification_result", JSON, nullable=False),
    Column("submitted_at", DateTime(6), nullable=False, server_default=func.current_timestamp(6)),
    Column("submitter_trace_id", VARCHAR(64)),
)

webhook_deliveries = Table(
    "webhook_deliveries", metadata,
    Column("id", BigInteger, primary_key=True, autoincrement=True),
    Column("payment_order_id", VARCHAR(40), nullable=False),
    Column("event_type", VARCHAR(40), nullable=False),
    Column("target_url", String(512), nullable=False),
    Column("payload_json", JSON, nullable=False),
    Column("status", VARCHAR(24), nullable=False, server_default="pending"),
    Column("attempt_count", Integer, nullable=False, server_default="0"),
    Column("last_attempt_at", DateTime(6)),
    Column("last_response_code", Integer),
    Column("last_response_body", String(1024)),
    Column("next_retry_at", DateTime(6)),
    Column("created_at", DateTime(6), nullable=False, server_default=func.current_timestamp(6)),
    Column("delivered_at", DateTime(6)),
    Index("idx_webhook_payment", "payment_order_id"),
    Index("idx_webhook_retry", "next_retry_at", "status"),
)

idempotency_records = Table(
    "idempotency_records", metadata,
    Column("api_key_id", VARCHAR(40), primary_key=True),
    Column("idempotency_key", VARCHAR(80), primary_key=True),
    Column("request_hash", String(64), nullable=False),
    Column("response_status", SMALLINT, nullable=False),
    Column("response_body", JSON, nullable=False),
    Column("created_at", DateTime(6), nullable=False, server_default=func.current_timestamp(6)),
    Column("expires_at", DateTime(6), nullable=False),
)


def make_engine(url: str) -> AsyncEngine:
    return create_async_engine(url, pool_size=5, max_overflow=10, pool_pre_ping=True, pool_recycle=3600)
