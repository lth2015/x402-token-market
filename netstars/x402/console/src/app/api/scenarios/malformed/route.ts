/**
 * Scenario: malformed X-PAYMENT.
 * Submit random base64 as X-PAYMENT. Expected: 402 + X_PAYMENT_INVALID.
 */
import { NextResponse } from "next/server";
import { retryWithProof } from "@/lib/x402";

export const dynamic = "force-dynamic";

export async function POST() {
  const idem = `console-malformed-${Date.now().toString(36)}`;
  const t = Date.now();
  const r = await retryWithProof({
    amountUsdcMicro: 100_000,
    idempotencyKey: idem,
    xPaymentHeader: "Z2FyYmFnZS1ub3QtanNvbg==",  // base64 of "garbage-not-json"
  });
  return NextResponse.json({
    ok: r.status === 402,
    expected: "HTTP 402 + error X_PAYMENT_INVALID",
    scenario: "malformed",
    steps: [
      {
        name: "Submit base64 that cannot be decoded as JSON",
        status: r.status === 402 ? "ok" : "fail",
        detail: { http: r.status, body: r.body, took_ms: Date.now() - t },
      },
    ],
    response: r.body,
  });
}
