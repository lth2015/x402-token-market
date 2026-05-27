/**
 * Deterministic mock data for Console pages whose backend endpoint does not
 * exist yet. Two design goals:
 *
 *   1. Stability: refreshing the page does not shuffle numbers. We seed from
 *      "today" (UTC date), so daily it shifts slightly — which makes the
 *      Console feel alive — but within a day it's stable.
 *   2. Plausibility: numbers add up. Per-model spend sums to the day total;
 *      per-key request counts sum to the org total.
 *
 * Each factory is clearly labelled as MOCK in the UI via <MockBadge />.
 * When the real endpoint lands, swap the import to lib/api.ts.
 */

// ── Deterministic PRNG (mulberry32) ───────────────────────────────
function mulberry32(seed: number) {
  return function () {
    let t = (seed += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function todaySeed(): number {
  const now = new Date();
  return now.getUTCFullYear() * 10000 + (now.getUTCMonth() + 1) * 100 + now.getUTCDate();
}

const rnd = mulberry32(todaySeed());
const between = (lo: number, hi: number) => lo + Math.floor(rnd() * (hi - lo + 1));

// ── Models catalog (also used by the Models page; static + price-stable) ──
export type ModelRow = {
  id: string;
  provider: "Anthropic" | "OpenAI" | "xAI" | "Google";
  inputPer1K: number;       // tokens per 1K input
  outputPer1K: number;
  docsUrl: string;
  ok: boolean;
};

export const MODELS: ModelRow[] = [
  { id: "claude-opus-4-7",   provider: "Anthropic", inputPer1K: 15_000, outputPer1K: 75_000, docsUrl: "https://docs.anthropic.com", ok: true },
  { id: "claude-sonnet-4-6", provider: "Anthropic", inputPer1K:  3_000, outputPer1K: 15_000, docsUrl: "https://docs.anthropic.com", ok: true },
  { id: "claude-haiku-4-5",  provider: "Anthropic", inputPer1K:    800, outputPer1K:  4_000, docsUrl: "https://docs.anthropic.com", ok: true },
  { id: "gpt-4.1",           provider: "OpenAI",    inputPer1K: 10_000, outputPer1K: 30_000, docsUrl: "https://platform.openai.com/docs", ok: true },
  { id: "gpt-4.1-mini",      provider: "OpenAI",    inputPer1K:  2_000, outputPer1K:  6_000, docsUrl: "https://platform.openai.com/docs", ok: true },
  { id: "grok-4",            provider: "xAI",       inputPer1K:  8_000, outputPer1K: 24_000, docsUrl: "https://docs.x.ai", ok: true },
  { id: "gemini-2.5-pro",    provider: "Google",    inputPer1K:  8_000, outputPer1K: 24_000, docsUrl: "https://ai.google.dev", ok: false },
];

// ── Usage analytics (Usage page) ──────────────────────────────────
export type UsageRow = {
  model: string;
  provider: string;
  requests: number;
  tokensIn: number;
  tokensOut: number;
  spendJpy: number;
};

export type UsageSummary = {
  totalSpendJpy: number;
  totalTokens: number;
  totalRequests: number;
  perDay: { date: string; spendJpy: number }[];   // 30 days
  perModel: UsageRow[];
};

export function getUsageMock(): UsageSummary {
  // Per-model split with realistic proportions
  const shares = [0.42, 0.29, 0.22, 0.04, 0.02, 0.005, 0.005]; // sums ~1.0
  const totalSpendJpy = 234_500;
  const totalRequests = 18_420;
  const perModel: UsageRow[] = MODELS.map((m, i) => {
    const share = shares[i] ?? 0.01;
    const spend = Math.round(totalSpendJpy * share);
    const requests = Math.round(totalRequests * share);
    const tokensIn = Math.round(requests * between(1_200, 2_400));
    const tokensOut = Math.round(tokensIn * 0.28);
    return {
      model: m.id,
      provider: m.provider,
      requests,
      tokensIn,
      tokensOut,
      spendJpy: spend,
    };
  });

  const totalTokens = perModel.reduce((a, r) => a + r.tokensIn + r.tokensOut, 0);

  // Per-day spend: shape = ~normal + weekday bias + noise
  const perDay: { date: string; spendJpy: number }[] = [];
  const today = new Date();
  for (let i = 29; i >= 0; i--) {
    const d = new Date(today.getTime() - i * 86_400_000);
    const weekday = d.getUTCDay();
    const base = totalSpendJpy / 30;
    const weekend = weekday === 0 || weekday === 6 ? 0.55 : 1.0;
    const noise = 0.65 + rnd() * 0.8;
    perDay.push({
      date: d.toISOString().slice(0, 10),
      spendJpy: Math.round(base * weekend * noise),
    });
  }

  return { totalSpendJpy, totalTokens, totalRequests, perDay, perModel };
}

// ── API Keys ──────────────────────────────────────────────────────
export type ApiKeyRow = {
  id: string;
  prefix: string;
  label: string;
  project: string;
  status: "active" | "revoked";
  lastUsed: string;            // ISO
  ratePerMin: number;
  tokensPerMin: number;
  dailyLimitJpy: number;
  allowedModels: string[];     // glob list
};

export function getApiKeysMock(): ApiKeyRow[] {
  return [
    {
      id: "agk_01HX7P3Q8K",
      prefix: "ak_a1b2",
      label: "Production AI Advisor",
      project: "prod",
      status: "active",
      lastUsed: new Date(Date.now() - 2 * 60_000).toISOString(),
      ratePerMin: 600,
      tokensPerMin: 100_000_000,
      dailyLimitJpy: 10_000,
      allowedModels: ["claude-*", "gpt-4.1"],
    },
    {
      id: "agk_01HX7P3Q9L",
      prefix: "ak_c3d4",
      label: "Pharmacy B2B Channel",
      project: "prod",
      status: "active",
      lastUsed: new Date(Date.now() - 17 * 60_000).toISOString(),
      ratePerMin: 300,
      tokensPerMin: 30_000_000,
      dailyLimitJpy: 5_000,
      allowedModels: ["claude-haiku-*"],
    },
    {
      id: "agk_01HX7P3QAM",
      prefix: "ak_e5f6",
      label: "Hospital Dietitian Bot",
      project: "staging",
      status: "active",
      lastUsed: new Date(Date.now() - 3 * 86_400_000).toISOString(),
      ratePerMin: 120,
      tokensPerMin: 10_000_000,
      dailyLimitJpy: 1_000,
      allowedModels: ["*"],
    },
    {
      id: "agk_01HX7P3QBN",
      prefix: "ak_g7h8",
      label: "Legacy EC Partner — DRG Online (revoked)",
      project: "prod",
      status: "revoked",
      lastUsed: "2026-05-20T10:14:00Z",
      ratePerMin: 600,
      tokensPerMin: 100_000_000,
      dailyLimitJpy: 10_000,
      allowedModels: ["*"],
    },
  ];
}

export type KeyCallRow = {
  ts: string;
  model: string;
  tokens: number | null;
  costJpy: number | null;
  status: "succeed" | "timeout" | "error";
  traceId: string;
};

export function getKeyCallsMock(): KeyCallRow[] {
  const out: KeyCallRow[] = [];
  let t = Date.now() - 30_000;
  for (let i = 0; i < 12; i++) {
    const ok = rnd() > 0.12;
    out.push({
      ts: new Date(t).toISOString(),
      model: "claude-opus-4-7",
      tokens: ok ? between(2_500, 4_800) : null,
      costJpy: ok ? between(280, 520) : null,
      status: ok ? "succeed" : (rnd() > 0.5 ? "timeout" : "error"),
      traceId: `00-${randHex(32)}-${randHex(16)}-01`,
    });
    t -= between(2_000, 18_000);
  }
  return out;
}

function randHex(n: number): string {
  let s = "";
  for (let i = 0; i < n; i++) s += Math.floor(rnd() * 16).toString(16);
  return s;
}

// ── Invoices ──────────────────────────────────────────────────────
export type InvoiceRow = {
  period: string;        // YYYY/MM
  id: string;
  totalJpy: number;
  status: "issued" | "paid" | "overdue";
  txCount: number;
  callCount: number;
};

export function getInvoicesMock(): InvoiceRow[] {
  const now = new Date();
  const months = 6;
  const rows: InvoiceRow[] = [];
  for (let i = 0; i < months; i++) {
    const m = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - i, 1));
    const ym = `${m.getUTCFullYear()}/${String(m.getUTCMonth() + 1).padStart(2, "0")}`;
    const totalJpy = i === 0 ? 234_500 : between(140_000, 280_000);
    rows.push({
      period: ym,
      id: `inv_${ym.replace("/", "")}_${String(12 - i).padStart(5, "0")}`,
      totalJpy,
      status: i === 0 ? "issued" : "paid",
      txCount: between(15, 40),
      callCount: between(8_000, 22_000),
    });
  }
  return rows;
}

// ── Audit log ─────────────────────────────────────────────────────
export type AuditRow = {
  ts: string;
  actor: string;
  actorType: "user" | "system" | "api";
  action: string;
  resourceType: string;
  resourceId: string;
  traceId: string;
};

const AUDIT_ACTIONS = [
  ["ops@haba-rd.jp",       "user",   "api_key.view",   "agent_key"],
  ["system",               "system", "token.credit",   "payment_order"],
  ["ops@haba-rd.jp",       "user",   "api_key.create", "agent_key"],
  ["system",               "system", "ledger.debit",   "request"],
  ["finance@haba-rd.jp",   "user",   "invoice.view",   "invoice"],
  ["system",               "system", "webhook.deliver","webhook"],
] as const;

export function getAuditMock(limit = 40): AuditRow[] {
  const out: AuditRow[] = [];
  let t = Date.now();
  for (let i = 0; i < limit; i++) {
    const [actor, actorType, action, resourceType] = AUDIT_ACTIONS[i % AUDIT_ACTIONS.length];
    out.push({
      ts: new Date(t).toISOString(),
      actor,
      actorType: actorType as AuditRow["actorType"],
      action,
      resourceType,
      resourceId: `${resourceType.slice(0, 3)}_${randHex(10)}`,
      traceId: `00-${randHex(32)}-${randHex(16)}-01`,
    });
    t -= between(60_000, 600_000);
  }
  return out;
}
