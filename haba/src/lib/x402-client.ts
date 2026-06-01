/**
 * Standard x402 client (server-side, for HABA's Next.js API routes).
 *
 * Implements the spec loop:
 *   1.  POST {resource}                              → 402 + paymentRequirements
 *   2.  POST {x402_api}/internal/build-payment-payload  → X-PAYMENT header
 *   3.  POST {resource}  X-PAYMENT: <header>         → 200 + business body
 *
 * Step 2 currently uses x402-api's demo-wallet builder. In production a
 * client wallet (Phantom / Solflare) would replace this with a browser-side
 * sign(); the rest of the loop is unchanged.
 *
 * NB: this module is server-only. HABA's browser never sees the demo wallet
 * key, never builds Solana transactions, and never speaks directly to
 * x402-api / wea-api.
 */
import "server-only";

const X402_API =
  process.env.NETSTARS_X402_API_INTERNAL
  || process.env.NEXT_PUBLIC_NETSTARS_X402_API
  || "http://localhost:8081";

const INTERNAL_AUTH =
  process.env.X402_INTERNAL_AUTH_SECRET
  || process.env.INTERNAL_AUTH_SECRET
  || "internal_localdev_token";

/** One PaymentRequirements row from a 402 body. */
export type PaymentRequirements = {
  scheme: "exact";
  network: string;
  maxAmountRequired: string;
  resource: string;
  description?: string;
  mimeType?: string;
  payTo: string;
  maxTimeoutSeconds: number;
  asset: string;
  outputSchema?: unknown;
  extra: {
    name?: string;
    decimals?: number;
    nonce?: string;
    facilitator?: string;
    expiresAt?: string;
  };
};

/** 402 body. */
export type PaymentChallenge = {
  x402Version: number;
  accepts: PaymentRequirements[];
  error?: string;
  message?: string;
};

export type X402ProtocolError = {
  code: "BAD_RESPONSE" | "BUILD_FAILED" | "RETRY_REJECTED" | "GATEWAY_ERROR";
  message: string;
  status?: number;
  body?: unknown;
};

/**
 * One end-to-end x402 round-trip.
 *
 * @param resourceUrl  Fully qualified URL of the protected resource on the
 *                     gateway (e.g. http://x402-api:8080/v1/protected/checkout/order).
 * @param body         Business payload sent on BOTH the 402 attempt and the
 *                     retry. Must include `idempotency_key` so the gateway
 *                     binds both calls to the same order.
 * @param userVerification  Optional base64-encoded WebAuthn assertion the
 *                     consumer just produced. Gateway logs it as audit but
 *                     does not cryptographically verify in this MVP.
 *
 * Returns the gateway's 200 body on success, or throws an Error whose
 * `.cause` is an X402ProtocolError describing where the loop broke.
 */
export async function x402Fetch<T = unknown>(args: {
  resourceUrl: string;
  body: Record<string, unknown>;
  userVerification?: string | null;
}): Promise<{
  body: T;
  challenge: PaymentChallenge;
  requirements: PaymentRequirements;
  settlementReceipt: unknown;
  xPaymentHeader: string;
}> {
  const bodyJson = JSON.stringify(args.body);

  // ── Step 1. Trigger the 402 challenge ──
  const challengeRes = await fetch(args.resourceUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: bodyJson,
    cache: "no-store",
  });
  if (challengeRes.status !== 402) {
    // Gateway should have asked for payment first. If we got 200 here, the
    // protocol is broken (or the resource is not actually protected).
    const text = await challengeRes.text();
    const err: X402ProtocolError = {
      code: "BAD_RESPONSE",
      message: `expected 402 on first attempt, got ${challengeRes.status}`,
      status: challengeRes.status,
      body: text.slice(0, 400),
    };
    throw Object.assign(new Error(err.message), { cause: err });
  }
  const challenge: PaymentChallenge = await challengeRes.json();
  if (!challenge.accepts || challenge.accepts.length === 0) {
    const err: X402ProtocolError = {
      code: "BAD_RESPONSE",
      message: "402 body did not carry any acceptable PaymentRequirements",
      body: challenge,
    };
    throw Object.assign(new Error(err.message), { cause: err });
  }
  const requirements = challenge.accepts[0]!;

  // ── Step 2. Build a PaymentPayload via x402-api's demo-wallet builder ──
  // In production a wallet adapter (Phantom / Solflare / WalletConnect) would
  // sign in the browser; the resulting X-PAYMENT header has the same shape.
  const buildRes = await fetch(`${X402_API}/internal/build-payment-payload`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Internal-Auth": INTERNAL_AUTH,
    },
    body: JSON.stringify(requirements),
    cache: "no-store",
  });
  if (!buildRes.ok) {
    const text = await buildRes.text();
    const err: X402ProtocolError = {
      code: "BUILD_FAILED",
      message: `build-payment-payload HTTP ${buildRes.status}: ${text.slice(0, 240)}`,
      status: buildRes.status,
    };
    throw Object.assign(new Error(err.message), { cause: err });
  }
  const built = await buildRes.json() as {
    x_payment_header: string;
    payer: string;
    nonce: string;
  };
  // If the consumer supplied a WebAuthn assertion, splice it into the
  // payload by decoding → mutating → re-encoding. We could instead push the
  // assertion through the build step, but the build endpoint shouldn't need
  // to know about WebAuthn.
  let xPaymentHeader = built.x_payment_header;
  if (args.userVerification) {
    xPaymentHeader = spliceUserVerification(xPaymentHeader, args.userVerification);
  }

  // ── Step 3. Retry the original request with X-PAYMENT ──
  const retryRes = await fetch(args.resourceUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-PAYMENT": xPaymentHeader,
    },
    body: bodyJson,
    cache: "no-store",
  });

  if (retryRes.status === 200) {
    const data = await retryRes.json() as T;
    const receiptHeader = retryRes.headers.get("X-PAYMENT-RESPONSE");
    let receipt: unknown = null;
    if (receiptHeader) {
      try {
        receipt = JSON.parse(Buffer.from(receiptHeader, "base64").toString("utf-8"));
      } catch { /* keep raw */ receipt = receiptHeader; }
    }
    return {
      body: data,
      challenge,
      requirements,
      settlementReceipt: receipt,
      xPaymentHeader,
    };
  }

  // ── Retry was rejected — surface details for the caller. ──
  let problem: unknown = null;
  try { problem = await retryRes.json(); }
  catch { problem = await retryRes.text(); }
  const err: X402ProtocolError = retryRes.status >= 500
    ? { code: "GATEWAY_ERROR", message: `gateway 5xx: ${retryRes.status}`, status: retryRes.status, body: problem }
    : { code: "RETRY_REJECTED", message: `gateway rejected the proof (HTTP ${retryRes.status})`, status: retryRes.status, body: problem };
  throw Object.assign(new Error(err.message), { cause: err });
}

/**
 * Splice a WebAuthn `userVerification` field into a base64-encoded
 * PaymentPayload header. Used so the gateway can log proof of which
 * biometric assertion authorised this specific payment.
 */
function spliceUserVerification(headerB64: string, uv: string): string {
  try {
    const json = Buffer.from(headerB64, "base64").toString("utf-8");
    const obj = JSON.parse(json);
    if (obj && typeof obj === "object" && obj.payload && typeof obj.payload === "object") {
      obj.payload.userVerification = uv;
    }
    return Buffer.from(JSON.stringify(obj), "utf-8").toString("base64");
  } catch {
    return headerB64; // never break the loop because the splice failed
  }
}

/** Convenience: full URL of HABA's checkout-order protected endpoint on the gateway. */
export function protectedCheckoutOrderUrl(): string {
  return `${X402_API}/v1/protected/checkout/order`;
}
