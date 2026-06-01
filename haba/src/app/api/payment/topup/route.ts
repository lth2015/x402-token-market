/**
 * POST /api/payment/topup — removed in v0.4.0.
 *
 * The old DEV flow created a Token-purchase order then called the
 * unauthenticated /v1/admin/payments/{id}/confirm endpoint to fake a
 * confirmation. Both pieces are gone — admin-confirm bypassed the x402
 * protocol's "verify before unlock" contract.
 *
 * For Token top-ups going forward, NetStars will expose a protected
 * x402 endpoint (POST /v1/protected/token-purchase) that returns 402 +
 * paymentRequirements; clients drive the same retry loop as the consumer
 * checkout. Until that lands, this route returns 410 Gone.
 */
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export async function POST() {
  return NextResponse.json(
    {
      ok: false,
      error: "GONE",
      message:
        "Top-up via the old DEV admin-confirm path was removed. The next iteration will expose a real x402 protected endpoint at /v1/protected/token-purchase.",
    },
    { status: 410 },
  );
}
