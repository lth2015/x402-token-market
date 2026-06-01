"""
x402 protocol primitives.

Implements the HTTP-402 challenge / X-PAYMENT-header retry pattern from
https://x402.org — adapted to Solana USDC settlement.

Responsibility split:
    PaymentRequirements      — server-issued challenge body (what client must pay)
    PaymentPayload           — client-supplied proof body  (carried in X-PAYMENT)
    encode_x_payment_header  — base64-encode a payload for transit
    decode_x_payment_header  — parse + validate a header back to PaymentPayload
    build_requirements       — construct PaymentRequirements from order context

This module does NOT touch the database, the Solana RPC, or any framework.
It is pure data + (de)serialization so it can be reused by tests and other
services (e.g. an SDK shipping in the future).
"""
from __future__ import annotations

import base64
import binascii
import json
from datetime import datetime, timedelta, timezone
from typing import Any, Literal, Optional

from pydantic import BaseModel, Field, ValidationError


# ── Protocol version ─────────────────────────────────────────────────
X402_VERSION = 1

# Scheme we implement. The x402 spec allows multiple, but for Solana USDC
# the only meaningful one today is "exact" (exact-amount transfer).
SCHEME_EXACT = "exact"

# Networks we recognise. The string is matched verbatim on the wire.
NETWORK_SOLANA_DEVNET = "solana-devnet"
NETWORK_SOLANA_MAINNET = "solana"


# ── Wire-format models ───────────────────────────────────────────────
class PaymentRequirements(BaseModel):
    """One acceptable payment option in a 402 challenge body."""

    scheme: Literal["exact"] = SCHEME_EXACT
    network: str = Field(..., description="solana | solana-devnet")
    maxAmountRequired: str = Field(
        ...,
        description="Amount in the asset's smallest unit (micro-USDC = 1e-6 USDC).",
    )
    resource: str = Field(
        ...,
        description="Fully qualified URL or path of the protected resource. "
                    "Binds the proof to a single endpoint — proofs for resource A "
                    "cannot be replayed against resource B.",
    )
    description: str = Field("", description="Human-readable purpose of the payment.")
    mimeType: str = Field("application/json", description="Content-Type the protected resource returns.")
    payTo: str = Field(..., description="Base58 recipient wallet pubkey (merchant).")
    maxTimeoutSeconds: int = Field(600, ge=1, description="Max seconds before the requirements expire.")
    asset: str = Field(..., description="Token mint address (USDC mint on the target network).")
    outputSchema: Optional[dict] = Field(None, description="Optional JSONSchema of the protected response.")
    extra: dict[str, Any] = Field(
        default_factory=dict,
        description="Network-specific extensions. For Solana USDC we put: "
                    "{name, decimals, nonce, facilitator, expiresAt}.",
    )

    @property
    def nonce(self) -> Optional[str]:
        n = self.extra.get("nonce")
        return n if isinstance(n, str) else None

    @property
    def facilitator(self) -> Optional[str]:
        f = self.extra.get("facilitator")
        return f if isinstance(f, str) else None

    @property
    def expires_at_iso(self) -> Optional[str]:
        v = self.extra.get("expiresAt")
        return v if isinstance(v, str) else None


class PaymentChallengeBody(BaseModel):
    """Top-level body returned with a 402 response."""

    x402Version: int = X402_VERSION
    accepts: list[PaymentRequirements]
    error: str = Field("PAYMENT_REQUIRED")


class SolanaExactPayload(BaseModel):
    """The `payload` field of a PaymentPayload when scheme=exact, network=solana*."""

    signedTxBase64: str = Field(..., min_length=4, description="Base64-encoded signed Solana transaction.")
    userVerification: Optional[str] = Field(
        None,
        description="Optional WebAuthn attestation/assertion the client used to "
                    "authorise this specific payment. Base64-encoded JSON. The "
                    "gateway logs it for audit; it is not cryptographically "
                    "verified server-side in this MVP.",
    )


class PaymentPayload(BaseModel):
    """Decoded form of the X-PAYMENT request header."""

    x402Version: int = X402_VERSION
    scheme: Literal["exact"] = SCHEME_EXACT
    network: str
    resource: str = Field(
        ...,
        description="Resource the client expects this proof to unlock. Gateway "
                    "MUST refuse if it does not match the actual request URL.",
    )
    payload: SolanaExactPayload


# ── X-PAYMENT (de)serialization ──────────────────────────────────────
class XPaymentDecodeError(ValueError):
    """Raised when the X-PAYMENT header is malformed."""


def encode_x_payment_header(payload: PaymentPayload) -> str:
    """Base64-encode a PaymentPayload JSON for the X-PAYMENT request header."""
    raw = payload.model_dump_json().encode("utf-8")
    return base64.b64encode(raw).decode("ascii")


def decode_x_payment_header(header_value: str) -> PaymentPayload:
    """Parse and validate the X-PAYMENT header. Raises XPaymentDecodeError."""
    if not header_value or not header_value.strip():
        raise XPaymentDecodeError("X-PAYMENT header is empty")
    try:
        raw = base64.b64decode(header_value, validate=True)
    except (binascii.Error, ValueError) as e:
        raise XPaymentDecodeError(f"X-PAYMENT not valid base64: {e}") from e
    try:
        obj = json.loads(raw.decode("utf-8"))
    except (UnicodeDecodeError, json.JSONDecodeError) as e:
        raise XPaymentDecodeError(f"X-PAYMENT not valid JSON: {e}") from e
    try:
        return PaymentPayload.model_validate(obj)
    except ValidationError as e:
        raise XPaymentDecodeError(f"X-PAYMENT schema violation: {e}") from e


# ── PaymentRequirements builders ─────────────────────────────────────
def build_requirements(
    *,
    network: str,
    usdc_mint: str,
    pay_to: str,
    amount_usdc_micro: int,
    resource: str,
    description: str,
    nonce: str,
    facilitator_url: str,
    max_timeout_seconds: int = 600,
    expires_at: Optional[datetime] = None,
) -> PaymentRequirements:
    """Assemble a single PaymentRequirements row for the 402 body."""
    if expires_at is None:
        expires_at = datetime.now(timezone.utc) + timedelta(seconds=max_timeout_seconds)
    return PaymentRequirements(
        scheme=SCHEME_EXACT,
        network=network,
        maxAmountRequired=str(int(amount_usdc_micro)),
        resource=resource,
        description=description,
        mimeType="application/json",
        payTo=pay_to,
        maxTimeoutSeconds=max_timeout_seconds,
        asset=usdc_mint,
        outputSchema=None,
        extra={
            "name": "USDC",
            "decimals": 6,
            "nonce": nonce,
            "facilitator": facilitator_url,
            "expiresAt": expires_at.astimezone(timezone.utc).isoformat(),
        },
    )


def build_challenge_body(reqs: list[PaymentRequirements]) -> dict:
    """Serialize a 402 response body."""
    return PaymentChallengeBody(accepts=reqs).model_dump(mode="json")


# ── Cross-field validation helpers ───────────────────────────────────
def assert_payload_matches_requirements(
    payload: PaymentPayload,
    requirements: PaymentRequirements,
    *,
    expected_resource: str,
) -> None:
    """
    Verify the wire-format invariants the gateway must enforce BEFORE handing
    the payload to the facilitator for on-chain verification:

      - x402 version compatible
      - scheme matches  (exact)
      - network matches (solana-devnet / solana)
      - resource matches the actual request URL (resource binding)
      - resource matches what the requirements promised

    Raises ValueError on any mismatch.
    """
    if payload.x402Version != requirements.x402Version if hasattr(requirements, "x402Version") else False:
        raise ValueError(
            f"x402 version mismatch: payload={payload.x402Version}, requirements assume {X402_VERSION}"
        )
    if payload.scheme != requirements.scheme:
        raise ValueError(
            f"scheme mismatch: payload={payload.scheme!r}, requirements={requirements.scheme!r}"
        )
    if payload.network != requirements.network:
        raise ValueError(
            f"network mismatch: payload={payload.network!r}, requirements={requirements.network!r}"
        )
    if payload.resource != requirements.resource:
        raise ValueError(
            f"resource mismatch: payload claims {payload.resource!r}, "
            f"requirements were for {requirements.resource!r}"
        )
    if payload.resource != expected_resource:
        raise ValueError(
            f"resource mismatch: payload claims {payload.resource!r}, "
            f"actual request URL is {expected_resource!r} (replay attempt across resources?)"
        )


__all__ = [
    "X402_VERSION",
    "SCHEME_EXACT",
    "NETWORK_SOLANA_DEVNET",
    "NETWORK_SOLANA_MAINNET",
    "PaymentRequirements",
    "PaymentChallengeBody",
    "SolanaExactPayload",
    "PaymentPayload",
    "XPaymentDecodeError",
    "encode_x_payment_header",
    "decode_x_payment_header",
    "build_requirements",
    "build_challenge_body",
    "assert_payload_matches_requirements",
]
