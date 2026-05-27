"""Pydantic data models used at the SDK boundary."""
from __future__ import annotations

from typing import Any, Literal, Optional

from pydantic import BaseModel, ConfigDict, Field


class _Model(BaseModel):
    model_config = ConfigDict(populate_by_name=True, extra="ignore")


# ── Payment ──────────────────────────────────────────────────────────
class PaymentIntent(_Model):
    """402-response body — what the server requires to unlock the resource."""
    order_id: str
    amount_usdc_micro: int = Field(..., ge=1)
    recipient: str                  # base58 Solana address
    asset: str = "USDC"
    network: str = "solana"
    nonce: str
    expires_at: Optional[str] = None  # ISO-8601


class PaymentOrder(_Model):
    """Returned by /v1/payments/{id} — full order state."""
    id: str
    status: Literal[
        "created", "pending", "broadcasting", "confirmed",
        "token_credited", "failed", "expired", "canceled", "refunded",
    ]
    amount_usdc_micro: int
    tx_hash: Optional[str] = None
    confirmed_at: Optional[str] = None
    status_reason: Optional[str] = None


# ── AI calls ─────────────────────────────────────────────────────────
class ChatMessage(_Model):
    role: Literal["system", "user", "assistant"]
    content: str


class ChatRequest(_Model):
    model: str
    messages: list[ChatMessage] | list[dict[str, Any]]
    max_tokens: int = 4096
    temperature: float = 1.0
    stream: bool = False
    provider_options: Optional[dict[str, Any]] = None


class Usage(_Model):
    prompt_tokens: int = 0
    completion_tokens: int = 0
    cached_input_tokens: int = 0
    tokens_consumed: int = 0          # Netstars AI Token units charged
    balance_after: Optional[int] = None
    cost_usdc_equiv: Optional[float] = None


class ChatResponse(_Model):
    id: str
    content: str
    finish_reason: Optional[str] = None
    usage: Usage = Usage()
    trace_id: Optional[str] = None


# ── Balance / models / orders ────────────────────────────────────────
class Balance(_Model):
    balance_token: str
    usdc_equivalent: str
    jpy_equivalent: Optional[str] = None
    on_hold_token: str = "0"
    as_of: Optional[str] = None


class ModelInfo(_Model):
    name: str
    provider: str
    rate_per_1k_input: int            # AI Token per 1K input tokens
    rate_per_1k_output: int
