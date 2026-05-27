/**
 * POST /api/payment/topup — fires a real (DEV-mode) Token top-up.
 *
 * Server-side flow against the upstream payment provider:
 *   1. token-purchase  (HMAC-signed)              → payment order
 *   2. admin/payments/{id}/confirm  (DEV shortcut) → simulate confirmation,
 *      credit HABA's Token ledger
 *
 * No real on-chain broadcast in DEV mode — keeps the loop survivable on
 * machines where the local validator can't run.
 *
 * Body: { amount_usdc?: number, idempotency_key?: string }
 * Defaults to 10 USDC (10,000 Token) if amount_usdc not specified.
 */
import { NextResponse } from "next/server";
import { randomBytes } from "node:crypto";
import { adminConfirm, createTokenPurchase, NetstarsError } from "@/lib/netstars/client";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  let body: { amount_usdc?: number; idempotency_key?: string } = {};
  try {
    if (req.headers.get("content-length")) body = await req.json();
  } catch {
    // ignore — defaults below
  }

  const amount = typeof body.amount_usdc === "number" && body.amount_usdc > 0
    ? body.amount_usdc
    : 10.0;
  const idem = body.idempotency_key ?? `haba-${randomBytes(6).toString("hex")}`;

  try {
    const order = await createTokenPurchase({ amountUsdc: amount, idempotencyKey: idem });
    const confirm = await adminConfirm({ paymentOrderId: order.payment_order_id });

    return NextResponse.json({
      ok: true,
      amount_usdc: amount,
      payment_order_id: order.payment_order_id,
      tx_hash: (confirm.order as { tx_hash?: string }).tx_hash ?? null,
      status: (confirm.order as { status?: string }).status ?? null,
      credit: confirm.credit,
    });
  } catch (e) {
    if (e instanceof NetstarsError) {
      return NextResponse.json(
        { ok: false, error: e.message, detail: e.raw?.slice(0, 240) },
        { status: 502 },
      );
    }
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : "unknown" },
      { status: 500 },
    );
  }
}
