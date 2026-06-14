/**
 * Server-only x402 gateway client used by the console's demo orchestrator
 * routes (src/app/api/scenarios/*).
 */
import "server-only";

const X402_API = process.env.X402_API_BASE_URL ?? "http://x402-api:8080";
const INTERNAL_AUTH = process.env.INTERNAL_AUTH_SECRET ?? "internal_localdev_token";

const PROTECTED_RESOURCE_PATH = "/v1/protected/checkout/order";

export type Headers = Record<string, string>;

export type Resp = {
  status: number;
  body: unknown;
  headers: Headers;
};

async function http(method: string, path: string, opts: { body?: unknown; headers?: Headers } = {}): Promise<Resp> {
  const url = path.startsWith("http") ? path : `${X402_API}${path}`;
  const res = await fetch(url, {
    method,
    headers: { "Content-Type": "application/json", ...(opts.headers ?? {}) },
    body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
    cache: "no-store",
  });
  const text = await res.text();
  let body: unknown;
  try { body = JSON.parse(text); } catch { body = text; }
  const headers: Headers = {};
  res.headers.forEach((v, k) => { headers[k] = v; });
  return { status: res.status, body, headers };
}

export type PaymentRequirements = {
  scheme: string;
  network: string;
  maxAmountRequired: string;
  resource: string;
  description?: string;
  payTo: string;
  asset: string;
  maxTimeoutSeconds: number;
  extra: { nonce?: string; facilitator?: string; expiresAt?: string; decimals?: number; name?: string };
};

export async function fetchChallenge(opts: { amountUsdcMicro: number; idempotencyKey: string; description?: string; demoExpirySeconds?: number }): Promise<{
  status: number;
  body: { x402Version?: number; accepts?: PaymentRequirements[]; error?: string };
  headers: Headers;
}> {
  return http("POST", PROTECTED_RESOURCE_PATH, {
    body: {
      amount_usdc_micro: opts.amountUsdcMicro,
      idempotency_key: opts.idempotencyKey,
      description: opts.description ?? "x402 payment verification",
      ...(opts.demoExpirySeconds !== undefined ? { _demo_expiry_seconds: opts.demoExpirySeconds } : {}),
    },
  }) as unknown as ReturnType<typeof fetchChallenge>;
}

export async function buildPaymentHeader(reqs: PaymentRequirements): Promise<{ status: number; body: { x_payment_header?: string; payer?: string; nonce?: string } }> {
  return http("POST", "/internal/build-payment-payload", {
    body: reqs,
    headers: { "X-Internal-Auth": INTERNAL_AUTH },
  }) as unknown as ReturnType<typeof buildPaymentHeader>;
}

export async function retryWithProof(opts: {
  amountUsdcMicro: number;
  idempotencyKey: string;
  description?: string;
  xPaymentHeader: string;
  demoExpirySeconds?: number;
}): Promise<Resp> {
  return http("POST", PROTECTED_RESOURCE_PATH, {
    body: {
      amount_usdc_micro: opts.amountUsdcMicro,
      idempotency_key: opts.idempotencyKey,
      description: opts.description ?? "x402 payment verification",
      ...(opts.demoExpirySeconds !== undefined ? { _demo_expiry_seconds: opts.demoExpirySeconds } : {}),
    },
    headers: { "X-PAYMENT": opts.xPaymentHeader },
  });
}

/** Replace one top-level field inside a base64-encoded PaymentPayload. */
export function tamperPayload(headerB64: string, override: Record<string, unknown>): string {
  const json = Buffer.from(headerB64, "base64").toString("utf-8");
  const obj = JSON.parse(json);
  Object.assign(obj, override);
  return Buffer.from(JSON.stringify(obj), "utf-8").toString("base64");
}

export const RESOURCE_PATH = PROTECTED_RESOURCE_PATH;
export const X402_API_BASE = X402_API;
