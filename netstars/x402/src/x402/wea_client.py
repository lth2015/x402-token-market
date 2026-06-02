"""
Thin httpx client for the WEA facilitator.

Two operations the gateway needs from the facilitator:
    verify  — does this payment payload satisfy these requirements? (no on-chain)
    settle  — broadcast the payment on chain and return a settlement receipt.

WEA may also expose a build_payment helper for clients that don't hold a
Solana wallet (e.g. headless agents using the demo payer). We don't need it
on the gateway side.

All errors normalize to WeaFacilitatorError so callers can decide whether to
return 402 (payment failed verification), 502 (facilitator unreachable),
or surface a specific reason to the client.
"""
from __future__ import annotations

import os
from dataclasses import dataclass
from typing import Optional

import httpx

WEA_API_BASE_URL = os.environ.get("WEA_API_BASE_URL", "http://wea-api:8080")
WEA_TIMEOUT_SECS = float(os.environ.get("WEA_TIMEOUT_SECS", "45.0"))


class WeaFacilitatorError(Exception):
    """Raised when the facilitator is unreachable, errored, or rejected the call."""

    def __init__(self, message: str, *, http_status: Optional[int] = None, reason: Optional[str] = None):
        super().__init__(message)
        self.http_status = http_status
        self.reason = reason


@dataclass(slots=True)
class VerifyResult:
    is_valid: bool
    invalid_reason: Optional[str]
    payer: Optional[str]


@dataclass(slots=True)
class SettleResult:
    success: bool
    transaction: str            # base58 Solana signature
    network: str
    payer: str
    error_reason: Optional[str] = None


@dataclass(slots=True)
class TxStatusResult:
    """Result of GET /facilitator/tx/{signature}."""
    signature: str
    status: str                 # "pending" | "confirmed" | "finalized" | "failed"
    slot: Optional[int]
    confirmations: Optional[int]
    err: Optional[str]          # non-null when status == "failed"


INTERNAL_AUTH_SECRET = os.environ.get("INTERNAL_AUTH_SECRET", "internal_localdev_token")


class WeaFacilitatorClient:
    """Stateless client; safe to share. Re-uses a single httpx.AsyncClient."""

    def __init__(
        self,
        http: httpx.AsyncClient,
        base_url: str = WEA_API_BASE_URL,
        internal_auth_secret: str = INTERNAL_AUTH_SECRET,
    ):
        self._http = http
        self._base = base_url.rstrip("/")
        self._internal_auth = internal_auth_secret

    async def verify(self, *, payment_payload: dict, requirements: dict) -> VerifyResult:
        url = f"{self._base}/facilitator/verify"
        try:
            resp = await self._http.post(
                url,
                json={"paymentPayload": payment_payload, "paymentRequirements": requirements},
                headers={"X-Internal-Auth": self._internal_auth},
                timeout=WEA_TIMEOUT_SECS,
            )
        except httpx.HTTPError as e:
            raise WeaFacilitatorError(f"WEA unreachable: {e}", reason="unreachable") from e

        if resp.status_code >= 500:
            raise WeaFacilitatorError(
                f"WEA verify HTTP {resp.status_code}: {resp.text[:200]}",
                http_status=resp.status_code,
                reason="upstream_error",
            )

        try:
            body = resp.json()
        except ValueError as e:
            raise WeaFacilitatorError(f"WEA verify returned non-JSON: {e}", reason="malformed") from e

        return VerifyResult(
            is_valid=bool(body.get("isValid", False)),
            invalid_reason=body.get("invalidReason"),
            payer=body.get("payer"),
        )

    async def settle(self, *, payment_payload: dict, requirements: dict) -> SettleResult:
        url = f"{self._base}/facilitator/settle"
        try:
            resp = await self._http.post(
                url,
                json={"paymentPayload": payment_payload, "paymentRequirements": requirements},
                headers={"X-Internal-Auth": self._internal_auth},
                timeout=WEA_TIMEOUT_SECS,
            )
        except httpx.HTTPError as e:
            raise WeaFacilitatorError(f"WEA unreachable: {e}", reason="unreachable") from e

        if resp.status_code >= 500:
            raise WeaFacilitatorError(
                f"WEA settle HTTP {resp.status_code}: {resp.text[:200]}",
                http_status=resp.status_code,
                reason="upstream_error",
            )

        try:
            body = resp.json()
        except ValueError as e:
            raise WeaFacilitatorError(f"WEA settle returned non-JSON: {e}", reason="malformed") from e

        return SettleResult(
            success=bool(body.get("success", False)),
            transaction=str(body.get("transaction", "")),
            network=str(body.get("network", "")),
            payer=str(body.get("payer", "")),
            error_reason=body.get("errorReason"),
        )

    async def get_tx_status(self, signature: str) -> TxStatusResult:
        """
        Delegate on-chain tx status query to WEA (AP4: x402 never polls Solana directly).

        GET /facilitator/tx/{signature}
        Header: X-Internal-Auth: <secret>

        Returns a TxStatusResult. Raises WeaFacilitatorError on network/server errors.
        """
        url = f"{self._base}/facilitator/tx/{signature}"
        try:
            resp = await self._http.get(
                url,
                headers={"X-Internal-Auth": self._internal_auth},
                timeout=WEA_TIMEOUT_SECS,
            )
        except httpx.HTTPError as e:
            raise WeaFacilitatorError(f"WEA unreachable: {e}", reason="unreachable") from e

        if resp.status_code == 401:
            raise WeaFacilitatorError(
                "WEA tx status: unauthorized (check INTERNAL_AUTH_SECRET)",
                http_status=401,
                reason="unauthorized",
            )
        if resp.status_code >= 400:
            raise WeaFacilitatorError(
                f"WEA tx status HTTP {resp.status_code}: {resp.text[:200]}",
                http_status=resp.status_code,
                reason="upstream_error",
            )

        try:
            body = resp.json()
        except ValueError as e:
            raise WeaFacilitatorError(f"WEA tx status returned non-JSON: {e}", reason="malformed") from e

        return TxStatusResult(
            signature=str(body.get("signature", signature)),
            status=str(body.get("status", "pending")),
            slot=body.get("slot"),
            confirmations=body.get("confirmations"),
            err=body.get("err"),
        )


__all__ = [
    "WEA_API_BASE_URL",
    "WeaFacilitatorClient",
    "WeaFacilitatorError",
    "VerifyResult",
    "SettleResult",
    "TxStatusResult",
]
