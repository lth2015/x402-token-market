"""
Read-only console endpoints for the NetStars X402 Console UI.

These endpoints surface the protocol state — recent 402 challenges, X-PAYMENT
submissions, verifications, settlements — so an operator can SEE the standard
x402 flow in real time. They are intentionally separate from the operational
API (no auth in DEV; production should mount them behind an admin SSO).

Endpoints:
    GET  /v1/_console/events?limit=N   recent protected-resource orders + proofs
    GET  /v1/_console/metrics          aggregate counters + config snapshot
    GET  /v1/_console/order/{id}       single order detail with proofs
"""
from __future__ import annotations

from dataclasses import dataclass
from typing import Optional

from fastapi import APIRouter, Request
from sqlalchemy import desc, func, select

from . import db


@dataclass(slots=True)
class ConsoleDeps:
    network: str
    usdc_mint: str
    deposit_recipient: str
    facilitator_url: str
    demo_payer_key_b64: Optional[str]


def make_router(deps: ConsoleDeps) -> APIRouter:
    router = APIRouter(prefix="/v1/_console")

    @router.get("/events")
    async def events(req: Request, limit: int = 30):
        limit = max(1, min(int(limit), 100))
        async with req.app.state.db.connect() as conn:
            order_rows = (await conn.execute(
                select(db.payment_orders)
                .where(db.payment_orders.c.resource.isnot(None))
                .order_by(desc(db.payment_orders.c.created_at))
                .limit(limit)
            )).all()
            order_ids = [r.id for r in order_rows]
            proof_rows = []
            if order_ids:
                proof_rows = (await conn.execute(
                    select(db.payment_proofs)
                    .where(db.payment_proofs.c.payment_order_id.in_(order_ids))
                    .order_by(db.payment_proofs.c.submitted_at)
                )).all()

        proofs_by_order: dict[str, list[dict]] = {}
        for p in proof_rows:
            vr = p.verification_result or {}
            proofs_by_order.setdefault(p.payment_order_id, []).append({
                "submitted_at": p.submitted_at.isoformat() if p.submitted_at else None,
                "verified": vr.get("verified"),
                "reason": vr.get("reason"),
                "payer": vr.get("payer"),
                "signature": vr.get("signature"),
                "memo": vr.get("memo"),
                "had_user_verification": bool(vr.get("user_verification")),
            })

        return {
            "events": [
                {
                    "order_id": r.id,
                    "resource": r.resource,
                    "amount_usdc_micro": r.amount_usdc_micro,
                    "network": r.network,
                    "status": r.status,
                    "status_reason": r.status_reason,
                    "tx_hash": r.tx_hash,
                    "nonce": r.nonce,
                    "expires_at": r.expires_at.isoformat() if r.expires_at else None,
                    "created_at": r.created_at.isoformat() if r.created_at else None,
                    "confirmed_at": r.confirmed_at.isoformat() if r.confirmed_at else None,
                    "metadata": r.metadata or {},
                    "proofs": proofs_by_order.get(r.id, []),
                }
                for r in order_rows
            ],
        }

    @router.get("/metrics")
    async def metrics(req: Request):
        async with req.app.state.db.connect() as conn:
            total = (await conn.execute(
                select(func.count(db.payment_orders.c.id))
                .where(db.payment_orders.c.resource.isnot(None))
            )).scalar() or 0
            confirmed = (await conn.execute(
                select(func.count(db.payment_orders.c.id))
                .where(db.payment_orders.c.resource.isnot(None))
                .where(db.payment_orders.c.status == "confirmed")
            )).scalar() or 0
            proofs_total = (await conn.execute(
                select(func.count(db.payment_proofs.c.id))
            )).scalar() or 0
            proofs_rejected = (await conn.execute(
                select(func.count(db.payment_proofs.c.id))
                .where(func.json_extract(db.payment_proofs.c.verification_result, "$.verified") == False)  # noqa: E712
            )).scalar() or 0

        return {
            "challenges_issued":     int(total),
            "settlements_confirmed": int(confirmed),
            "proofs_submitted":      int(proofs_total),
            "proofs_rejected":       int(proofs_rejected),
            "config": {
                "network":           deps.network,
                "usdc_mint":         deps.usdc_mint,
                "deposit_recipient": deps.deposit_recipient,
                "facilitator":       deps.facilitator_url,
                "demo_payer":        "configured" if deps.demo_payer_key_b64 else "not_set",
            },
        }

    @router.get("/order/{order_id}")
    async def order_detail(req: Request, order_id: str):
        async with req.app.state.db.connect() as conn:
            row = (await conn.execute(
                select(db.payment_orders).where(db.payment_orders.c.id == order_id)
            )).first()
            if not row:
                return {"error": "not_found"}
            proof_rows = (await conn.execute(
                select(db.payment_proofs)
                .where(db.payment_proofs.c.payment_order_id == order_id)
                .order_by(db.payment_proofs.c.submitted_at)
            )).all()
        return {
            "order": {
                "id": row.id,
                "resource": row.resource,
                "amount_usdc_micro": row.amount_usdc_micro,
                "network": row.network,
                "status": row.status,
                "tx_hash": row.tx_hash,
                "nonce": row.nonce,
                "metadata": row.metadata or {},
                "expires_at": row.expires_at.isoformat() if row.expires_at else None,
                "confirmed_at": row.confirmed_at.isoformat() if row.confirmed_at else None,
            },
            "proofs": [
                {
                    "submitted_at": p.submitted_at.isoformat() if p.submitted_at else None,
                    "verification_result": p.verification_result,
                }
                for p in proof_rows
            ],
        }

    return router


__all__ = ["ConsoleDeps", "make_router"]
