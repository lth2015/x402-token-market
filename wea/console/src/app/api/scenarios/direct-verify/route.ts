/**
 * WEA Console demo · "Send invalid payload directly to facilitator verify".
 *
 * Bypasses the gateway. Constructs a syntactically-valid PaymentPayload +
 * PaymentRequirements pair but feeds garbage in `signedTxBase64`, then POSTs
 * directly to wea-api /facilitator/verify. Expected: { isValid: false,
 * invalidReason: "memo missing prefix..." } or similar.
 *
 * Shows up in the WEA call log as a `verify` row with ok=false.
 */
import { NextResponse } from "next/server";

const WEA = process.env.WEA_API_BASE_URL ?? "http://wea-api:8080";

export const dynamic = "force-dynamic";

export async function POST() {
  const body = {
    paymentPayload: {
      x402Version: 1,
      scheme: "exact",
      network: "solana-devnet",
      resource: "http://x402-api:8080/v1/protected/checkout/order",
      payload: {
        signedTxBase64: Buffer.from("not-a-real-solana-tx").toString("base64"),
        userVerification: null,
      },
    },
    paymentRequirements: {
      scheme: "exact",
      network: "solana-devnet",
      maxAmountRequired: "100000",
      resource: "http://x402-api:8080/v1/protected/checkout/order",
      payTo: "61e1MSTEN5dTjNGNQcwUivRVubYz6ebYfmz9qvYtkeNr",
      maxTimeoutSeconds: 600,
      asset: "4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU",
      extra: {
        nonce: `console-direct-${Date.now().toString(36)}`,
        decimals: 6,
        name: "USDC",
      },
    },
  };
  const t = Date.now();
  const r = await fetch(`${WEA}/facilitator/verify`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
    cache: "no-store",
  });
  const j = await r.json().catch(() => ({}));
  return NextResponse.json({
    ok: r.status === 200 && j.isValid === false,
    expected: "isValid=false with invalidReason set",
    steps: [
      {
        name: "POST wea-api /facilitator/verify with bogus signedTxBase64",
        status: (r.status === 200 && j.isValid === false) ? "ok" : "fail",
        http: r.status,
        body: j,
        took_ms: Date.now() - t,
      },
    ],
  });
}
