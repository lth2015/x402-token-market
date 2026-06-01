/**
 * Scenario: tamper payload.network.
 * Build a real X-PAYMENT for solana-devnet, mutate the network field to
 * solana (mainnet). Expected: 402 + REQUIREMENTS_MISMATCH.
 */
import { NextResponse } from "next/server";
import { buildPaymentHeader, fetchChallenge, retryWithProof, tamperPayload } from "@/lib/x402";

export const dynamic = "force-dynamic";

export async function POST() {
  const idem = `console-tamper-net-${Date.now().toString(36)}`;
  const ch = await fetchChallenge({ amountUsdcMicro: 100_000, idempotencyKey: idem, description: "Console · tamper network" });
  if (ch.status !== 402 || !ch.body?.accepts?.[0]) {
    return NextResponse.json({ ok: false, error: "challenge failed" });
  }
  const built = await buildPaymentHeader(ch.body.accepts[0]!);
  if (built.status !== 200 || !built.body?.x_payment_header) {
    return NextResponse.json({ ok: false, error: "build failed" });
  }
  const tampered = tamperPayload(built.body.x_payment_header, { network: "solana" });   // claim mainnet
  const t = Date.now();
  const r = await retryWithProof({
    amountUsdcMicro: 100_000,
    idempotencyKey: idem,
    xPaymentHeader: tampered,
  });
  return NextResponse.json({
    ok: r.status === 402,
    expected: "HTTP 402 + error REQUIREMENTS_MISMATCH",
    scenario: "tamper-network",
    steps: [
      {
        name: "篡改 payload.network 为 solana(mainnet),提交",
        status: r.status === 402 ? "ok" : "fail",
        detail: { http: r.status, body: r.body, tampered_to: "solana", took_ms: Date.now() - t },
      },
    ],
    response: r.body,
  });
}
