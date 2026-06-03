/**
 * Scenario: replay — reuse the X-PAYMENT from a previous successful call.
 * Expected: 409 with error "REPLAY" or "ORDER_ALREADY_CONSUMED".
 *
 * No new USDC is burned — we're submitting bytes already on-chain.
 */
import { NextResponse } from "next/server";
import { retryWithProof } from "@/lib/x402";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const body = await req.json().catch(() => ({} as { x_payment_header?: string; idempotency_key?: string }));
  if (!body.x_payment_header || !body.idempotency_key) {
    return NextResponse.json({ ok: false, error: "Run Normal payment first so the console can capture a valid X-PAYMENT" }, { status: 400 });
  }
  const t = Date.now();
  const r = await retryWithProof({
    amountUsdcMicro: 100_000,
    idempotencyKey: body.idempotency_key,
    xPaymentHeader: body.x_payment_header,
  });
  return NextResponse.json({
    ok: r.status === 409,
    expected: "HTTP 409 + error REPLAY or ORDER_ALREADY_CONSUMED",
    scenario: "replay",
    steps: [
      {
        name: "Resend the same X-PAYMENT to the same resource",
        status: r.status === 409 ? "ok" : "fail",
        detail: { http: r.status, body: r.body, took_ms: Date.now() - t },
      },
    ],
    response: r.body,
  });
}
