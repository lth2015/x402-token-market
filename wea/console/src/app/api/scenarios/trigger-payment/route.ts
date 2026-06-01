/**
 * WEA Console demo · "Trigger a payment through the gateway".
 *
 * Drives a full x402 round-trip via NetStars x402 gateway. The interesting
 * part for the WEA console is what happens INSIDE WEA — the verify call and
 * the settle call (Solana broadcast + confirmation poll). Those land in the
 * WEA ring buffer and surface in the console's live call log within ~2s.
 *
 * Burns one small Devnet USDC payment.
 */
import { NextResponse } from "next/server";

const X402 = process.env.X402_API_BASE_URL ?? "http://x402-api:8080";
const INTERNAL = process.env.INTERNAL_AUTH_SECRET ?? "internal_localdev_token";

export const dynamic = "force-dynamic";

export async function POST() {
  const idem = `wea-console-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;

  // 1. 402 challenge
  const t1 = Date.now();
  const ch = await fetch(`${X402}/v1/protected/checkout/order`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ amount_usdc_micro: 100_000, idempotency_key: idem, description: "WEA console · trigger" }),
    cache: "no-store",
  });
  if (ch.status !== 402) {
    return NextResponse.json({ ok: false, error: `expected 402 got ${ch.status}` });
  }
  const challenge = await ch.json();
  const reqs = challenge.accepts?.[0];
  if (!reqs) return NextResponse.json({ ok: false, error: "no requirements in 402 body" });

  // 2. Build X-PAYMENT
  const t2 = Date.now();
  const build = await fetch(`${X402}/internal/build-payment-payload`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-Internal-Auth": INTERNAL },
    body: JSON.stringify(reqs),
    cache: "no-store",
  });
  if (!build.ok) {
    return NextResponse.json({ ok: false, error: `build ${build.status}: ${await build.text()}` });
  }
  const built = await build.json();

  // 3. Retry (this is the call that hits WEA /facilitator/verify + /settle)
  const t3 = Date.now();
  const retry = await fetch(`${X402}/v1/protected/checkout/order`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-PAYMENT": built.x_payment_header },
    body: JSON.stringify({ amount_usdc_micro: 100_000, idempotency_key: idem, description: "WEA console · trigger" }),
    cache: "no-store",
  });
  const body = await retry.json().catch(() => ({}));

  return NextResponse.json({
    ok: retry.status === 200,
    steps: [
      { name: "① 402 challenge (gateway)",         status: ch.status === 402 ? "ok" : "fail",    took_ms: t2 - t1, http: ch.status },
      { name: "② Build X-PAYMENT (demo wallet)",   status: build.ok        ? "ok" : "fail",      took_ms: t3 - t2, payer: built.payer, nonce: built.nonce },
      { name: "③ Gateway → WEA verify → WEA settle → Solana", status: retry.status === 200 ? "ok" : "fail", took_ms: Date.now() - t3, http: retry.status, body },
    ],
    settlement: body,
  });
}
