/**
 * Scenario: tamper payload.resource.
 * Build a real X-PAYMENT, mutate the resource field to a different URL,
 * submit. Expected: 402 + REQUIREMENTS_MISMATCH (resource binding).
 *
 * No on-chain settle: validation fails before WEA is called.
 */
import { NextResponse } from "next/server";
import { buildPaymentHeader, fetchChallenge, retryWithProof, tamperPayload } from "@/lib/x402";

export const dynamic = "force-dynamic";

export async function POST() {
  const idem = `console-tamper-res-${Date.now().toString(36)}`;
  const ch = await fetchChallenge({ amountUsdcMicro: 100_000, idempotencyKey: idem, description: "Console · tamper resource" });
  if (ch.status !== 402 || !ch.body?.accepts?.[0]) {
    return NextResponse.json({ ok: false, error: "challenge failed" });
  }
  const built = await buildPaymentHeader(ch.body.accepts[0]!);
  if (built.status !== 200 || !built.body?.x_payment_header) {
    return NextResponse.json({ ok: false, error: "build failed" });
  }
  const tampered = tamperPayload(built.body.x_payment_header, { resource: "/v1/protected/something-else" });
  const t = Date.now();
  const r = await retryWithProof({
    amountUsdcMicro: 100_000,
    idempotencyKey: idem,
    xPaymentHeader: tampered,
  });
  return NextResponse.json({
    ok: r.status === 402,
    expected: "HTTP 402 + error REQUIREMENTS_MISMATCH",
    scenario: "tamper-resource",
    steps: [
      {
        name: "篡改 payload.resource 为别的 URL,提交",
        status: r.status === 402 ? "ok" : "fail",
        detail: { http: r.status, body: r.body, tampered_to: "/v1/protected/something-else", took_ms: Date.now() - t },
      },
    ],
    response: r.body,
  });
}
