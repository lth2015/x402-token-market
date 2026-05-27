"""Exception hierarchy. All Netstars-raised errors inherit from NetstarsError."""
from __future__ import annotations

from typing import Any, Optional


class NetstarsError(Exception):
    """Base class for all Netstars SDK errors."""

    def __init__(
        self,
        message: str = "",
        *,
        code: str = "UNKNOWN",
        trace_id: Optional[str] = None,
        request_id: Optional[str] = None,
        status_code: Optional[int] = None,
        metadata: Optional[dict[str, Any]] = None,
    ):
        super().__init__(message)
        self.code = code
        self.trace_id = trace_id
        self.request_id = request_id
        self.status_code = status_code
        self.metadata = metadata or {}

    def __repr__(self) -> str:  # pragma: no cover
        return (
            f"{type(self).__name__}({super().__str__()!r}, "
            f"code={self.code!r}, trace_id={self.trace_id!r})"
        )


class AuthenticationError(NetstarsError):
    """API key invalid, signature mismatch, timestamp drift, replay nonce."""
    pass


class AuthorizationError(NetstarsError):
    """API key valid but not allowed (frozen, wrong model, etc.)."""
    pass


class PaymentRequiredError(NetstarsError):
    """Server returned 402; carries a PaymentIntent that can drive top-up."""

    def __init__(self, message: str = "", *, intent: Any = None, **kwargs):
        super().__init__(message, code=kwargs.pop("code", "PAYMENT_REQUIRED"), **kwargs)
        self.intent = intent


class InsufficientBalanceError(PaymentRequiredError):
    """Specific case of PaymentRequiredError when balance is too low."""
    pass


class PaymentFailedError(NetstarsError):
    """On-chain settlement failed, or auto-purchase did not succeed."""

    def __init__(self, message: str = "", *, order: Any = None, **kwargs):
        super().__init__(message, code=kwargs.pop("code", "PAYMENT_FAILED"), **kwargs)
        self.order = order


class RateLimitError(NetstarsError):
    """429 — too many requests."""

    def __init__(self, message: str = "", *, retry_after: int = 60, **kwargs):
        super().__init__(message, code=kwargs.pop("code", "RATE_LIMITED"), **kwargs)
        self.retry_after = retry_after


class ValidationError(NetstarsError):
    """4xx — bad request, validation failure."""
    pass


class ServerError(NetstarsError):
    """5xx — Netstars side failure. Subset is retryable."""
    pass


class TimeoutError(NetstarsError):  # noqa: A001 — intentionally shadowing builtin
    """Request did not complete within the configured timeout."""
    pass


class WalletError(NetstarsError):
    """Local wallet / signer problem (file not found, bad keypair, KMS deny…)."""
    pass


class ConfigurationError(NetstarsError):
    """SDK was instantiated with invalid configuration."""
    pass
