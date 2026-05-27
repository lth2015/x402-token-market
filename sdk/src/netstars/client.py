"""
Netstars Client — the public facade. Most users only ever import this + a Wallet.
"""
from __future__ import annotations

import logging
import os
from typing import Any, Callable, Literal, Optional

from .errors import ConfigurationError
from .models import Balance, ChatRequest, ChatResponse, PaymentOrder
from .transport import DEFAULT_BASE_URLS, Transport
from .wallet.base import Wallet
from .x402 import X402Coordinator

log = logging.getLogger(__name__)


class _TokensAPI:
    def __init__(self, client: "Client"):
        self._c = client

    def balance(self) -> Balance:
        resp = self._c._transport.get("/v1/balance")
        return Balance.model_validate(resp.json())

    def get_payment(self, order_id: str) -> PaymentOrder:
        resp = self._c._transport.get(f"/v1/payments/{order_id}")
        return PaymentOrder.model_validate(resp.json())

    def purchase(self, *, amount_usdc: float, idempotency_key: str) -> dict:
        """
        Create a token-purchase payment intent. Returns the X402 PaymentOut
        JSON (id, recipient, nonce, amount_usdc_micro, expires_at, status).

        The caller is responsible for the on-chain settlement step — either
        sign + POST /proof, or (for dev) call the admin shortcut.
        """
        resp = self._c._transport.post(
            "/v1/token-purchase",
            json_body={"amount_usdc": amount_usdc, "idempotency_key": idempotency_key},
        )
        return resp.json()

    def recent_activity(self, *, limit: int = 20) -> dict:
        """Return last N ledger entries for the merchant — same shape Console renders."""
        resp = self._c._transport.get(f"/v1/recent-activity?limit={limit}")
        return resp.json()


class Client:
    """
    Synchronous Netstars client.

    The client is thread-safe to the extent that the underlying httpx.Client is
    (which is itself thread-safe). The Wallet instance must also be safe to call
    concurrently from multiple threads — FileWallet is.

    Args:
        api_key: Your public API key id, e.g. ``ak_a1b2c3…``
        api_key_secret: The matching secret used for HMAC signing.
        wallet: A :class:`Wallet` instance for signing USDC transfers.
        env: ``"devnet"`` (local + test) or ``"mainnet"`` (production).
        base_url: Override the base URL inferred from ``env``.
        timeout: Per-request timeout in seconds.
        max_retries: How many times to retry transient (5xx/429/network) errors.
        auto_purchase: If True (default), 402 responses trigger an automatic
            top-up using the wallet. Set False to surface PaymentRequiredError.
        on_event: Optional callback invoked with structured events like
            ``{"event":"payment_initiated", "order_id":"pmt_…", ...}``.
            Errors in this callback are silently swallowed.
    """

    def __init__(
        self,
        *,
        api_key: Optional[str] = None,
        api_key_secret: Optional[str] = None,
        wallet: Optional[Wallet] = None,
        env: Literal["devnet", "mainnet"] = "devnet",
        base_url: Optional[str] = None,
        timeout: float = 30.0,
        max_retries: int = 5,
        auto_purchase: bool = True,
        on_event: Optional[Callable[[dict[str, Any]], None]] = None,
    ):
        api_key = api_key or os.environ.get("NETSTARS_API_KEY")
        api_key_secret = api_key_secret or os.environ.get("NETSTARS_API_KEY_SECRET")
        if not api_key or not api_key_secret:
            raise ConfigurationError(
                "api_key and api_key_secret are required "
                "(pass as kwargs or set NETSTARS_API_KEY / NETSTARS_API_KEY_SECRET)",
                code="MISSING_CREDENTIALS",
            )
        if env not in ("devnet", "mainnet"):
            raise ConfigurationError(f"env must be 'devnet' or 'mainnet', got {env!r}", code="BAD_ENV")

        self._env = env
        self._auto_purchase = auto_purchase
        self._wallet = wallet
        self._on_event = on_event or (lambda _e: None)

        self._transport = Transport(
            base_url=base_url or DEFAULT_BASE_URLS[env],
            api_key=api_key,
            api_key_secret=api_key_secret,
            timeout=timeout,
            max_retries=max_retries,
        )
        self._x402 = X402Coordinator(self)

        # Sub-resources
        self.tokens = _TokensAPI(self)

    # ── Convenience: chat ───────────────────────────────────────────
    def chat(
        self,
        *,
        model: str,
        messages: list[dict[str, Any]],
        max_tokens: int = 4096,
        temperature: float = 1.0,
        **kwargs: Any,
    ) -> ChatResponse:
        """Call an AI model. Token cost is metered server-side; balance debited automatically."""
        req = ChatRequest(
            model=model, messages=messages,
            max_tokens=max_tokens, temperature=temperature,
            provider_options=kwargs.get("provider_options"),
        )
        resp = self._x402.call("POST", "/v1/messages", json_body=req.model_dump(exclude_none=True))
        return ChatResponse.model_validate(resp.json())

    # ── Health ──────────────────────────────────────────────────────
    def healthz(self) -> dict[str, Any]:
        resp = self._transport.get("/healthz")
        return resp.json()

    # ── Lifecycle ───────────────────────────────────────────────────
    def close(self) -> None:
        self._transport.close()

    def __enter__(self) -> "Client":
        return self

    def __exit__(self, *exc) -> None:
        self.close()

    # ── Internal ────────────────────────────────────────────────────
    def _emit(self, event: str, **fields: Any) -> None:
        try:
            self._on_event({"event": event, **fields})
        except Exception:  # noqa: BLE001
            log.debug("on_event callback raised; ignoring", exc_info=True)
