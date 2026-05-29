"""
Provider router · model name → provider + pricing.

`provider_for_model("claude-opus-4-7")` → AnthropicProvider instance.
`provider_for_model("gpt-4.1")`         → OpenAIProvider instance.

Pricing table is the single source of truth used by:
  - estimate_cost_token()  — pre-flight 402 check before calling the provider
  - settle_cost_token()    — post-call ledger debit using ACTUAL provider usage

Numbers are in **AI Token per 1K tokens** (same units as the Console Models
page; 1 USDC = 1,000,000 AI Token).

DUMMY-key fallback: if no provider for a model has a real API key set, the
caller (main.py) can choose to fall back to the canned stub. We don't decide
that here; we just expose `PROVIDER_AVAILABLE` so callers can branch.
"""
from __future__ import annotations

from dataclasses import dataclass
from typing import Optional

import httpx

from .anthropic import AnthropicProvider
from .base import NormalizedRequest, Provider, ProviderError, Usage
from .google import GoogleProvider
from .openai_compat import OpenAIProvider, XAIProvider


@dataclass(slots=True)
class Price:
    input_per_1k: int
    output_per_1k: int


# Keep in sync with netstars/token/console/src/lib/mock.ts MODELS
PRICING: dict[str, Price] = {
    "claude-opus-4-7":   Price(15_000, 75_000),
    "claude-sonnet-4-6": Price( 3_000, 15_000),
    "claude-haiku-4-5":  Price(   800,  4_000),
    "gpt-5.5":           Price( 5_000, 30_000),
    "gpt-5.5-2026-04-23": Price(5_000, 30_000),
    "gpt-4.1":           Price(10_000, 30_000),
    "gpt-4.1-mini":      Price( 2_000,  6_000),
    "grok-4":            Price( 8_000, 24_000),
    "gemini-2.5-pro":    Price( 8_000, 24_000),
}

# Fallback price for an unknown model — middle of the road; logs a warning at call site.
DEFAULT_PRICE = Price(5_000, 15_000)


def price_for(model: str) -> Price:
    return PRICING.get(model, DEFAULT_PRICE)


# Map (lowercased) model name prefix → Provider class
_PREFIX_MAP: list[tuple[str, type[Provider]]] = [
    ("claude-",  AnthropicProvider),
    ("gpt-",     OpenAIProvider),
    ("o1-",      OpenAIProvider),
    ("o3-",      OpenAIProvider),
    ("grok-",    XAIProvider),
    ("gemini-",  GoogleProvider),
]


def _cls_for_model(model: str) -> Optional[type[Provider]]:
    m = model.lower()
    for prefix, cls in _PREFIX_MAP:
        if m.startswith(prefix):
            return cls
    return None


def provider_for_model(model: str, http: httpx.AsyncClient) -> Provider:
    cls = _cls_for_model(model)
    if cls is None:
        raise ProviderError(
            f"unrecognized model {model!r}; supported prefixes: {[p for p, _ in _PREFIX_MAP]}",
            vendor="router",
        )
    return cls(http)


def PROVIDER_AVAILABLE(model: str) -> bool:  # noqa: N802 (treated as a constant by callers)
    """True iff the provider for `model` has a real (non-DUMMY) API key in env."""
    cls = _cls_for_model(model)
    if cls is None:
        return False
    # We don't have an httpx client here, but `api_key()` doesn't need one
    inst = cls(http=None)  # type: ignore[arg-type]
    return inst.available()


# ── Cost math ─────────────────────────────────────────────────────
def estimate_cost_token(
    model: str,
    prompt_chars: int,
    max_output_tokens: int,
) -> int:
    """
    Worst-case cost in AI Token, used for the pre-flight balance check.
    We approximate prompt tokens as chars/4 (industry rule of thumb); the
    real settle uses the exact provider-reported usage.
    """
    p = price_for(model)
    prompt_estimate = max(1, prompt_chars // 4)
    return (prompt_estimate * p.input_per_1k + max_output_tokens * p.output_per_1k) // 1000


def settle_cost_token(model: str, usage: Usage) -> int:
    """
    Exact cost in AI Token from the provider's reported usage. Caches are
    rebated at the input rate (same as Anthropic/OpenAI cache-discount policy).
    """
    p = price_for(model)
    billable_input = max(0, usage.prompt_tokens - usage.cached_input_tokens)
    cost = (billable_input * p.input_per_1k + usage.completion_tokens * p.output_per_1k) // 1000
    return max(1, cost)  # never charge 0 — every successful call costs at least 1 token


def estimate_from_request(req: NormalizedRequest) -> int:
    chars = sum(len(t.content) for t in req.turns) + len(req.system or "")
    return estimate_cost_token(req.model, chars, req.max_tokens)
