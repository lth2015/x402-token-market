"""
Standard x402 protected-resource routes.

This module is the wire-protocol surface — it is the only place in this
service that speaks the HTTP 402 + X-PAYMENT-header retry pattern.

Endpoints:
    POST /v1/protected/checkout/order
        No X-PAYMENT header → 402 with PaymentChallengeBody.
        Valid X-PAYMENT     → calls WEA facilitator (verify + settle),
                              transitions the order to confirmed, returns 200
                              + X-PAYMENT-RESPONSE header.

    POST /internal/build-payment-payload
        DEV helper. Given paymentRequirements, builds + signs a Solana USDC
        tx using DEMO_PAYER_PRIVATE_KEY_B64 and returns a ready-to-use
        X-PAYMENT header. Production clients (Phantom etc.) bypass this and
        sign in the browser.

The router takes app config + dependencies via a small ProtectedDeps object
so this module stays decoupled from FastAPI app state.
"""
from __future__ import annotations

import base64
import hashlib
import hmac as _hmac
import json
import os
from dataclasses import dataclass
from datetime import datetime, timezone
from typing import Optional

import httpx
import structlog
from fastapi import APIRouter, HTTPException, Request
from fastapi.responses import JSONResponse
from pydantic import BaseModel, ConfigDict, Field, ValidationError
from solders.hash import Hash
from solders.pubkey import Pubkey
from sqlalchemy import select

from . import db
from .orders import OrderService, OrderStateConflictError
from .proof import ProofError, verify_proof
from .protocol import (
    PaymentPayload,
    PaymentRequirements,
    SolanaExactPayload,
    XPaymentDecodeError,
    assert_payload_matches_requirements,
    build_challenge_body,
    build_requirements,
    decode_x_payment_header,
    encode_x_payment_header,
)
from .solana_rpc import SolanaRpcError
from .tx_builder import TxBuildError, build_x402_payment_tx, keypair_from_b64
from .wea_client import WeaFacilitatorClient, WeaFacilitatorError

log = structlog.get_logger("x402-api.protected")


# ── DI / Config ─────────────────────────────────────────────────────
@dataclass(slots=True)
class ProtectedDeps:
    """Everything the protected routes need from the surrounding app."""
    network: str                 # solana-devnet | solana
    usdc_mint: str
    deposit_recipient: str
    facilitator_url: str         # WEA base URL, surfaced in 402 body
    gateway_public_base_url: str # so resource fields are fully-qualified URLs
    internal_auth_secret: str    # for /internal/* routes
    demo_payer_key_b64: Optional[str]  # for /internal/build-payment-payload
    expiry_seconds: int = 600


def _now_naive_utc() -> datetime:
    return datetime.now(timezone.utc).replace(tzinfo=None)


# ── Bodies ──────────────────────────────────────────────────────────
class ProtectedCheckoutIn(BaseModel):
    """Body of POST /v1/protected/checkout/order on BOTH the 402 and retry calls."""
    model_config = ConfigDict(populate_by_name=True)

    amount_usdc_micro: int = Field(..., gt=0, le=10_000_000,
        description="USDC in micro-units. Capped at 10 USDC for the public demo.")
    idempotency_key: str = Field(..., min_length=1, max_length=80,
        description="Same key on the 402 attempt and the retry — pins to one order.")
    description: str = Field("MARVIE order checkout", max_length=200)
    metadata: Optional[dict] = None
    demo_expiry_seconds: Optional[int] = Field(
        None,
        alias="_demo_expiry_seconds",
        ge=1,
        le=60,
        description="Console-demo-only short expiry override. Remove before production.",
    )


def _err_402(body: dict, status: int = 402) -> JSONResponse:
    """Return 402 + WWW-Authenticate per spec."""
    return JSONResponse(content=body, status_code=status,
                        headers={"WWW-Authenticate": "X402"})


def make_router(deps: ProtectedDeps) -> APIRouter:
    """Construct the APIRouter, closing over deps + the surrounding app state."""
    router = APIRouter()
    resource_path = "/v1/protected/checkout/order"
    resource_url = f"{deps.gateway_public_base_url.rstrip('/')}{resource_path}"

    # ── 1. Protected resource endpoint ─────────────────────────────
    @router.post(resource_path)
    async def protected_checkout_order(req: Request, body: ProtectedCheckoutIn):
        app = req.app
        x_payment = req.headers.get("X-PAYMENT") or req.headers.get("X-Payment")
        # Console-demo only: lets the attack-scenario UI create a short-lived
        # order without changing the global X402_EXPIRY_SECONDS setting.
        expiry_seconds = body.demo_expiry_seconds or deps.expiry_seconds

        # ── 1a. Make-or-fetch the idempotent order row up front ───
        async with app.state.db.begin() as conn:
            order = await OrderService.create_payment(
                conn,
                merchant_id="haba",
                api_key_id="ak_x402_protected",
                amount_usdc_micro=body.amount_usdc_micro,
                idempotency_key=body.idempotency_key,
                recipient_address=deps.deposit_recipient,
                metadata={
                    **(body.metadata or {}),
                    "settlement_kind": "merchant_checkout",
                    "x402_resource": resource_url,
                },
                resource=resource_url,
                expiry_seconds=expiry_seconds,
            )

        requirements = build_requirements(
            network=deps.network,
            usdc_mint=deps.usdc_mint,
            pay_to=deps.deposit_recipient,
            amount_usdc_micro=order["amount_usdc_micro"],
            resource=resource_url,
            description=body.description,
            nonce=order["nonce"],
            facilitator_url=deps.facilitator_url,
            max_timeout_seconds=expiry_seconds,
            expires_at=(datetime.fromisoformat(order["expires_at"])
                        if order["expires_at"] else None),
        )

        # ── 1b. No X-PAYMENT header → 402 challenge ────────────────
        if not x_payment:
            log.info("protected.challenge",
                     order_id=order["id"], amount=body.amount_usdc_micro,
                     resource=resource_url, nonce=order["nonce"])
            return _err_402(build_challenge_body([requirements]))

        # ── 1c. X-PAYMENT present → decode + validate wire format ──
        try:
            payment_payload = decode_x_payment_header(x_payment)
        except XPaymentDecodeError as e:
            log.warning("protected.x_payment_decode_failed", err=str(e))
            return _err_402(_problem("X_PAYMENT_INVALID", str(e)))

        try:
            assert_payload_matches_requirements(
                payment_payload, requirements, expected_resource=resource_url,
            )
        except ValueError as e:
            log.warning("protected.x_payment_mismatch", err=str(e))
            return _err_402(_problem("REQUIREMENTS_MISMATCH", str(e)))

        # ── 1d. Order must still be in `created` state ─────────────
        if order["status"] != "created":
            log.warning("protected.order_already_consumed",
                        order_id=order["id"], state=order["status"])
            return _err_402(_problem(
                "ORDER_ALREADY_CONSUMED",
                f"order is in state {order['status']!r}; this proof can no longer be accepted",
            ), status=409)

        # ── 1e. Expiry check (M1 fix) ─────────────────────────────
        if order["expires_at"]:
            exp = datetime.fromisoformat(order["expires_at"])
            if exp < datetime.now(timezone.utc):
                async with app.state.db.begin() as conn:
                    try:
                        await OrderService.transition(
                            conn, order["id"], from_status="created", to_status="expired",
                        )
                    except OrderStateConflictError:
                        pass
                return _err_402(_problem(
                    "EXPIRED", f"order expired at {order['expires_at']}",
                ), status=410)

        # ── 1f. Replay protection — hash(signed_tx) must be unique ─
        signed_tx_b64 = payment_payload.payload.signedTxBase64
        sig_hash = hashlib.sha256(signed_tx_b64.encode("utf-8")).hexdigest()
        async with app.state.db.connect() as conn:
            existing = (await conn.execute(
                select(db.payment_proofs.c.id).where(
                    db.payment_proofs.c.signed_tx_hash == sig_hash
                )
            )).first()
        if existing:
            log.warning("protected.replay_detected", sig_hash=sig_hash[:16])
            return _err_402(_problem(
                "REPLAY", "this signed tx has already been submitted",
            ), status=409)

        # ── 1g. Local pre-verification (catches malformed payloads) ─
        try:
            local_proof = verify_proof(
                signed_tx_b64=signed_tx_b64,
                expected_recipient_owner=deps.deposit_recipient,
                expected_amount_usdc_micro=order["amount_usdc_micro"],
                expected_nonce=order["nonce"],
                usdc_mint=deps.usdc_mint,
            )
        except ProofError as e:
            async with app.state.db.begin() as conn:
                await conn.execute(db.payment_proofs.insert().values(
                    payment_order_id=order["id"],
                    signed_tx_b64=signed_tx_b64,
                    signed_tx_hash=sig_hash,
                    parsed_tx=None,
                    verification_result={"verified": False, "reason": str(e)},
                ))
            return _err_402(_problem("PROOF_INVALID", str(e)))

        # ── 1h. Persist passing proof ──────────────────────────────
        async with app.state.db.begin() as conn:
            await conn.execute(db.payment_proofs.insert().values(
                payment_order_id=order["id"],
                signed_tx_b64=signed_tx_b64,
                signed_tx_hash=sig_hash,
                parsed_tx=None,
                verification_result={
                    "verified": True,
                    "payer": local_proof.payer,
                    "memo": local_proof.memo,
                    "signature": local_proof.signature_b58,
                    "user_verification": payment_payload.payload.userVerification,
                },
            ))

        # ── 1i. Facilitator verify → settle ───────────────────────
        wea = WeaFacilitatorClient(app.state.http, base_url=deps.facilitator_url)
        payload_dict = payment_payload.model_dump(mode="json")
        req_dict = requirements.model_dump(mode="json")

        try:
            vresult = await wea.verify(payment_payload=payload_dict, requirements=req_dict)
        except WeaFacilitatorError as e:
            log.error("protected.wea_verify_unreachable", err=str(e))
            raise HTTPException(502, f"facilitator verify: {e}") from e
        if not vresult.is_valid:
            log.warning("protected.wea_verify_failed", reason=vresult.invalid_reason)
            return _err_402(_problem("VERIFY_FAILED",
                vresult.invalid_reason or "facilitator rejected the payload"))

        try:
            sresult = await wea.settle(payment_payload=payload_dict, requirements=req_dict)
        except WeaFacilitatorError as e:
            log.error("protected.wea_settle_unreachable", err=str(e))
            raise HTTPException(502, f"facilitator settle: {e}") from e
        if not sresult.success:
            log.error("protected.wea_settle_failed", reason=sresult.error_reason)
            raise HTTPException(502, f"facilitator settle: {sresult.error_reason}")

        # ── 1j. Walk the FSM: created → pending → broadcasting → confirmed
        now = _now_naive_utc()
        async with app.state.db.begin() as conn:
            try:
                await OrderService.transition(
                    conn, order["id"], from_status="created", to_status="pending",
                )
                await OrderService.transition(
                    conn, order["id"], from_status="pending", to_status="broadcasting",
                    updates={"tx_hash": sresult.transaction},
                )
                order = await OrderService.transition(
                    conn, order["id"], from_status="broadcasting", to_status="confirmed",
                    updates={"confirmed_at": now},
                )
            except OrderStateConflictError as e:
                raise HTTPException(409, str(e)) from e

        # ── 1k. Build settlement receipt + return 200 ─────────────
        receipt = {
            "success": True,
            "transaction": sresult.transaction,
            "network": sresult.network,
            "payer": sresult.payer,
        }
        receipt_b64 = base64.b64encode(json.dumps(receipt).encode()).decode()
        log.info("protected.success",
                 order_id=order["id"], tx_hash=sresult.transaction,
                 payer=sresult.payer)
        return JSONResponse(
            content={
                "ok": True,
                "order_id": order["id"],
                "amount_usdc_micro": order["amount_usdc_micro"],
                "tx_hash": sresult.transaction,
                "network": sresult.network,
                "payer": sresult.payer,
                "confirmed_at": order["confirmed_at"],
                "resource": resource_url,
                "settlement_receipt": receipt,
            },
            status_code=200,
            headers={"X-PAYMENT-RESPONSE": receipt_b64},
        )

    # ── 2. DEV helper: build a PaymentPayload for the demo wallet ───
    @router.post("/internal/build-payment-payload")
    async def build_payment_payload_endpoint(req: Request, body: dict):
        """
        DEV/internal. Given a PaymentRequirements JSON (as returned in a 402
        body), build + sign a Solana USDC tx using DEMO_PAYER_PRIVATE_KEY_B64
        and return a ready-to-use X-PAYMENT header value.

        Production clients with their own wallet bypass this entirely.
        """
        # Auth
        provided = req.headers.get("X-Internal-Auth", "")
        if not _hmac.compare_digest(provided, deps.internal_auth_secret):
            raise HTTPException(401, "Missing or invalid X-Internal-Auth header")
        if not deps.demo_payer_key_b64:
            raise HTTPException(503, "DEMO_PAYER_PRIVATE_KEY_B64 not configured")

        try:
            requirements = PaymentRequirements.model_validate(body)
        except ValidationError as e:
            raise HTTPException(400, f"invalid paymentRequirements: {e}") from e

        nonce = requirements.nonce
        if not nonce:
            raise HTTPException(400, "paymentRequirements.extra.nonce missing")
        amount_micro = int(requirements.maxAmountRequired)

        try:
            blockhash_data = await req.app.state.solana_rpc.get_latest_blockhash()
        except SolanaRpcError as e:
            raise HTTPException(502, f"Solana RPC unreachable: {e}") from e

        try:
            payer_kp = keypair_from_b64(deps.demo_payer_key_b64)
        except TxBuildError as e:
            raise HTTPException(500, f"demo keypair decode: {e}") from e

        try:
            tx_bytes = build_x402_payment_tx(
                payer_keypair=payer_kp,
                recipient_owner=Pubkey.from_string(requirements.payTo),
                mint=Pubkey.from_string(requirements.asset),
                amount_micro=amount_micro,
                nonce=nonce,
                recent_blockhash=Hash.from_string(blockhash_data["blockhash"]),
                ensure_dest_ata=True,
            )
        except (TxBuildError, Exception) as e:
            raise HTTPException(500, f"tx build failed: {e}") from e

        signed_tx_b64 = base64.b64encode(tx_bytes).decode()
        payload = PaymentPayload(
            scheme=requirements.scheme,
            network=requirements.network,
            resource=requirements.resource,
            payload=SolanaExactPayload(
                signedTxBase64=signed_tx_b64,
                userVerification=None,
            ),
        )
        header_value = encode_x_payment_header(payload)
        return {
            "x_payment_header": header_value,
            "payer": str(payer_kp.pubkey()),
            "nonce": nonce,
            "amount_usdc_micro": amount_micro,
        }

    # ── 3. Internal helper exposed for WEA to delegate verify ───────
    @router.post("/internal/verify-payment-payload")
    async def internal_verify(req: Request, body: dict):
        """
        WEA's /facilitator/verify delegates the strong tx parse here so the
        cryptographic verification logic lives in one place (proof.py) until
        it is ported to native Rust.
        """
        provided = req.headers.get("X-Internal-Auth", "")
        if not _hmac.compare_digest(provided, deps.internal_auth_secret):
            raise HTTPException(401, "Missing or invalid X-Internal-Auth header")

        signed_tx_b64 = body.get("signedTxBase64")
        expected_recipient = body.get("expectedRecipientOwner")
        expected_amount = body.get("expectedAmountUsdcMicro")
        expected_nonce = body.get("expectedNonce")
        usdc_mint = body.get("usdcMint")
        if not all([signed_tx_b64, expected_recipient, expected_amount,
                    expected_nonce, usdc_mint]):
            raise HTTPException(400, "missing required field(s)")

        try:
            result = verify_proof(
                signed_tx_b64=signed_tx_b64,
                expected_recipient_owner=expected_recipient,
                expected_amount_usdc_micro=int(expected_amount),
                expected_nonce=expected_nonce,
                usdc_mint=usdc_mint,
            )
        except ProofError as e:
            return {
                "isValid": False,
                "invalidReason": str(e),
                "payer": None,
                "signature": None,
            }
        return {
            "isValid": True,
            "invalidReason": None,
            "payer": result.payer,
            "signature": result.signature_b58,
            "memo": result.memo,
        }

    return router


def _problem(code: str, msg: str) -> dict:
    """Minimal RFC-7807-style problem body for 402/409/410 responses."""
    return {
        "x402Version": 1,
        "error": code,
        "message": msg,
    }


__all__ = ["ProtectedDeps", "make_router"]
