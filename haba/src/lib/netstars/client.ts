/**
 * Server-only HTTP client for Netstars Token + x402 APIs.
 *
 * The HABA site itself never speaks to these APIs from the browser; instead,
 * Next.js API routes under app/api/payment/* import this module to proxy
 * requests. Two reasons:
 *   1. CORS + secret leakage — HMAC secrets must stay on the server.
 *   2. Network routing — inside docker the URLs are http://token-api:8080,
 *      from a host browser they are http://localhost:8080.
 *
 * URL resolution:
 *   - When running inside docker compose: NETSTARS_*_INTERNAL is set to the
 *     service DNS name (http://token-api:8080).
 *   - When running locally outside docker: falls back to NEXT_PUBLIC_* which
 *     defaults to http://localhost:8080.
 */
import "server-only";
import { signRequest } from "./sign";

const TOKEN_API =
  process.env.NETSTARS_TOKEN_API_INTERNAL
  || process.env.NEXT_PUBLIC_NETSTARS_TOKEN_API
  || "http://localhost:8080";

const X402_API =
  process.env.NETSTARS_X402_API_INTERNAL
  || process.env.NEXT_PUBLIC_NETSTARS_X402_API
  || "http://localhost:8081";

const API_KEY_ID = process.env.NETSTARS_API_KEY ?? "ak_localdev_test";
const API_KEY_SECRET = process.env.NETSTARS_API_KEY_SECRET ?? "secret_localdev_test";

export class NetstarsError extends Error {
  constructor(public readonly status: number, message: string, public readonly raw?: string) {
    super(message);
  }
}

/** GET /v1/balance — HMAC signed, returns merchant Token balance. */
export async function fetchBalance(): Promise<{ balance_token: string; usdc_equivalent: string }> {
  const path = "/v1/balance";
  const headers = signRequest({
    method: "GET",
    path,
    body: "",
    apiKeyId: API_KEY_ID,
    apiKeySecret: API_KEY_SECRET,
  });
  const res = await fetch(`${TOKEN_API}${path}`, {
    method: "GET",
    headers,
    cache: "no-store",
  });
  if (!res.ok) {
    const text = await res.text();
    throw new NetstarsError(res.status, `balance ${res.status}`, text);
  }
  return (await res.json()) as { balance_token: string; usdc_equivalent: string };
}

/** GET /v1/recent-activity?limit=N — HMAC signed (used by Console too). */
export async function fetchRecentActivity(limit = 5): Promise<{ items: Array<Record<string, unknown>> }> {
  // Server signs request.url.path which excludes query string — match that.
  const path = "/v1/recent-activity";
  const headers = signRequest({
    method: "GET",
    path,
    body: "",
    apiKeyId: API_KEY_ID,
    apiKeySecret: API_KEY_SECRET,
  });
  const res = await fetch(`${TOKEN_API}${path}?limit=${limit}`, {
    method: "GET",
    headers,
    cache: "no-store",
  });
  if (!res.ok) {
    const text = await res.text();
    throw new NetstarsError(res.status, `recent-activity ${res.status}`, text);
  }
  return (await res.json()) as { items: Array<Record<string, unknown>> };
}

/** POST /v1/token-purchase — HMAC signed, creates payment via x402 gateway. */
export async function createTokenPurchase(args: {
  amountUsdc: number;
  idempotencyKey: string;
}): Promise<{
  payment_order_id: string;
  amount_usdc_micro: number;
  recipient: string;
  nonce: string;
  status: string;
  expires_at: string;
}> {
  const path = "/v1/token-purchase";
  const bodyObj = { amount_usdc: args.amountUsdc, idempotency_key: args.idempotencyKey };
  const body = JSON.stringify(bodyObj);
  const headers = signRequest({
    method: "POST",
    path,
    body,
    apiKeyId: API_KEY_ID,
    apiKeySecret: API_KEY_SECRET,
  });
  const res = await fetch(`${TOKEN_API}${path}`, {
    method: "POST",
    headers: { ...headers, "Content-Type": "application/json" },
    body,
    cache: "no-store",
  });
  if (!res.ok) {
    const text = await res.text();
    throw new NetstarsError(res.status, `token-purchase ${res.status}`, text);
  }
  return (await res.json()) as Awaited<ReturnType<typeof createTokenPurchase>>;
}

/** POST /v1/admin/payments/{id}/confirm — DEV-only shortcut on x402-api. */
export async function adminConfirm(args: {
  paymentOrderId: string;
  txHash?: string;
}): Promise<{ ok: boolean; order: Record<string, unknown>; credit: Record<string, unknown> }> {
  const path = `/v1/admin/payments/${args.paymentOrderId}/confirm`;
  const bodyObj = { tx_hash: args.txHash ?? `DEV_HABA_${Date.now().toString(16)}` };
  const body = JSON.stringify(bodyObj);
  // admin/confirm is unauthenticated in DEV mode (see x402/main.py:admin_confirm).
  const res = await fetch(`${X402_API}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body,
    cache: "no-store",
  });
  if (!res.ok) {
    const text = await res.text();
    throw new NetstarsError(res.status, `admin-confirm ${res.status}`, text);
  }
  return (await res.json()) as Awaited<ReturnType<typeof adminConfirm>>;
}

export type ChatMessage = { role: "user" | "assistant"; content: string };

export type ChatResponse = {
  id: string;
  content: string;
  finish_reason: string;
  usage: {
    prompt_tokens: number;
    completion_tokens: number;
    cached_input_tokens: number;
    tokens_consumed: number;
    balance_after: number;
    cost_usdc_equiv: number;
  };
  provider: string;
  model: string;
};

/**
 * POST /v1/messages — real LLM call against token-api. Pre-flight balance
 * check, dispatches to a provider (or stub if no key configured), then
 * debits the merchant Token ledger by the exact usage.
 *
 * Returns the LLM response **and** the balance_after the debit landed, so
 * the caller can update the UI without an extra round-trip.
 */
export async function chatCompletion(args: {
  model: string;
  system?: string;
  messages: ChatMessage[];
  maxTokens?: number;
}): Promise<ChatResponse> {
  const path = "/v1/messages";
  const bodyObj = {
    model: args.model,
    messages: args.messages,
    system: args.system,
    max_tokens: args.maxTokens ?? 512,
  };
  const body = JSON.stringify(bodyObj);
  const headers = signRequest({
    method: "POST",
    path,
    body,
    apiKeyId: API_KEY_ID,
    apiKeySecret: API_KEY_SECRET,
  });
  const res = await fetch(`${TOKEN_API}${path}`, {
    method: "POST",
    headers: { ...headers, "Content-Type": "application/json" },
    body,
    cache: "no-store",
  });
  if (!res.ok) {
    const text = await res.text();
    throw new NetstarsError(res.status, `messages ${res.status}`, text);
  }
  return (await res.json()) as ChatResponse;
}

export const debugEnv = {
  tokenApi: TOKEN_API,
  x402Api: X402_API,
  apiKeyIdMasked: API_KEY_ID.slice(0, 4) + "…",
};
