/**
 * Scenario: normal x402 round-trip.
 *   ① POST {resource} (no header)             → 402 + paymentRequirements
 *   ② POST /internal/build-payment-payload     → X-PAYMENT
 *   ③ POST {resource} with X-PAYMENT           → 200 + on-chain settlement
 *
 * Burns one real Devnet USDC payment (~smallest demo amount).
 */
import { NextResponse } from "next/server";
import { buildPaymentHeader, fetchChallenge, retryWithProof } from "@/lib/x402";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const body = await req.json().catch(() => ({} as { amount_usdc_micro?: number }));
  const amount = typeof body.amount_usdc_micro === "number" && body.amount_usdc_micro > 0
    ? Math.min(body.amount_usdc_micro, 500_000)   // cap at 0.5 USDC per console run
    : 100_000;
  const idem = `console-normal-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;

  const steps: Array<{ name: string; status: "ok" | "fail"; detail?: unknown }> = [];

  // ① 402 challenge
  const t1 = Date.now();
  const ch = await fetchChallenge({ amountUsdcMicro: amount, idempotencyKey: idem, description: "Console · normal payment" });
  steps.push({
    name: "① POST 受保护资源(无 X-PAYMENT)",
    status: ch.status === 402 ? "ok" : "fail",
    detail: { http: ch.status, www_authenticate: ch.headers["www-authenticate"] ?? null, requirements: ch.body?.accepts?.[0], took_ms: Date.now() - t1 },
  });
  if (ch.status !== 402 || !ch.body?.accepts?.[0]) {
    return NextResponse.json({ ok: false, scenario: "normal", steps, error: "expected 402" });
  }
  const reqs = ch.body.accepts[0]!;

  // ② Build X-PAYMENT via demo wallet
  const t2 = Date.now();
  const built = await buildPaymentHeader(reqs);
  steps.push({
    name: "② 客户端签名 → 拿到 X-PAYMENT",
    status: built.status === 200 ? "ok" : "fail",
    detail: { http: built.status, payer: built.body?.payer, nonce: built.body?.nonce, took_ms: Date.now() - t2 },
  });
  if (built.status !== 200 || !built.body?.x_payment_header) {
    return NextResponse.json({ ok: false, scenario: "normal", steps, error: "build-payment-payload failed" });
  }
  const xPayment = built.body.x_payment_header;

  // ③ retry → verify → settle → 200
  const t3 = Date.now();
  const retry = await retryWithProof({ amountUsdcMicro: amount, idempotencyKey: idem, xPaymentHeader: xPayment });
  const receiptB64 = retry.headers["x-payment-response"];
  let receipt: unknown = null;
  if (receiptB64) {
    try { receipt = JSON.parse(Buffer.from(receiptB64, "base64").toString("utf-8")); } catch { /* ignore */ }
  }
  steps.push({
    name: "③ 带 X-PAYMENT retry → Gateway → WEA verify → Solana settle",
    status: retry.status === 200 ? "ok" : "fail",
    detail: { http: retry.status, body: retry.body, settlement_receipt: receipt, took_ms: Date.now() - t3 },
  });

  return NextResponse.json({
    ok: retry.status === 200,
    scenario: "normal",
    steps,
    x_payment_header: xPayment,        // client remembers for replay demo
    requirements: reqs,
    response: retry.body,
    settlement_receipt: receipt,
  });
}
