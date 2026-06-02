// Server-side fetch wrapper. Talks to token-api on behalf of the browser
// (BFF pattern — browser never sees the API key or HMAC secret).
//
// URL resolution order:
//   1. NETSTARS_API_BASE_INTERNAL — docker DNS, e.g. http://token-api:8080
//      (set in docker-compose; only the server-side container sees it).
//   2. NETSTARS_API_BASE          — bare env override
//   3. NEXT_PUBLIC_API_BASE       — browser-visible, set to host port
//   4. http://localhost:8080      — last-resort dev fallback
//
// Every request is HMAC-SHA256 signed (port of sdk/quickstart.py). The
// merchant API key + secret come from NETSTARS_API_KEY / _SECRET; defaults
// match sdk/quickstart.py's local-dev creds.

import "server-only";
import { signRequest } from "./sign";

const BASE =
  process.env.NETSTARS_API_BASE_INTERNAL ??
  process.env.NETSTARS_API_BASE ??
  process.env.NEXT_PUBLIC_API_BASE ??
  "http://localhost:8080";

const API_KEY_ID = process.env.NETSTARS_API_KEY ?? "ak_localdev_test";
const API_KEY_SECRET = process.env.NETSTARS_API_KEY_SECRET ?? "secret_localdev_test";

export type ActivityEvent = {
  id: string;
  ts: string;
  kind: "credit" | "debit" | "error";
  icon: string;
  description: string;
  path: string;
  amount_jpy: number | null;
  amount_usdc: number | null;
  amount_token: number;
  trace_id: string;
};

export type RecentActivityResponse = { items: ActivityEvent[]; is_mock?: boolean };

export type Balance = {
  balance_token: string;
  usdc_equivalent: string;
  jpy_equivalent?: string;
  on_hold_token: string;
  as_of?: string;
};

export type MerchantProfile = {
  merchant_id: string;
  display_name: string;
  abbr: string;
  env_label: string;
  legal_name: string | null;
  tax_id: string | null;
  currency_pref: string;
  status: string;
};

/**
 * Server signs `request.url.path` which excludes the query string; we strip
 * it here too so HMAC matches. See sdk/src/netstars/transport.py for the
 * canonical signing rule.
 */
function pathOnly(p: string): string {
  return p.split("?", 1)[0]!;
}

async function get<T>(path: string, init?: RequestInit): Promise<T> {
  const url = `${BASE}${path}`;
  const signed = signRequest({
    method: "GET",
    path: pathOnly(path),
    body: "",
    apiKeyId: API_KEY_ID,
    apiKeySecret: API_KEY_SECRET,
  });
  const res = await fetch(url, {
    cache: "no-store",
    next: { revalidate: 0 },
    ...init,
    headers: { ...signed, ...(init?.headers ?? {}) },
  });
  if (!res.ok) {
    throw new Error(`API ${path} → ${res.status}`);
  }
  return res.json() as Promise<T>;
}

export const api = {
  recentActivity: (limit = 20) =>
    get<RecentActivityResponse>(`/v1/recent-activity?limit=${limit}`),
  balance: () => get<Balance>("/v1/balance"),
  healthz: () => get<{ status: string }>("/healthz"),
  merchantProfile: () => get<MerchantProfile>("/v1/merchant/profile"),
};
