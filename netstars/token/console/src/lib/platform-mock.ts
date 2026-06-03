/**
 * Platform-level mock data for the Netstars operator dashboard.
 * Revenue, merchant ranking, model breakdown, billing statements.
 *
 * All values are deterministic fiction — labelled MOCK in the UI via <MockBadge />.
 * When real endpoints land, swap the import to lib/api.ts.
 */

export interface PlatformMetrics {
  totalTokenConsumption: number;
  totalCostUsd: number;
  totalRevenueUsd: number;
  activeMerchants: number;
  totalAutoTopups: number;
}

export interface RevenueTrendPoint {
  date: string;    // "Jun 1", "Jun 2", …
  revenue: number; // cumulative USD
}

export interface ModelBreakdownItem {
  model: "GPT-4o" | "GPT-4.1" | "Claude" | "Gemini";
  tokenShare: number;   // 0.0 – 1.0
  tokenCount: number;
  color: string;
}

export interface MerchantRankingRow {
  rank: number;
  merchantId: string;
  merchantName: string;
  monthlyTokenUsage: number;
  monthlyCostUsd: number;
  revenueUsd: number;
  status: "active" | "trial" | "suspended";
}

export interface BillingLineItem {
  model: string;
  tokens: number;
  unitRatePerMillion: number;
  amount: number;
}

export interface BillingStatement {
  period: string;
  merchantName: string;
  lineItems: BillingLineItem[];
  subtotal: number;
  taxRate: number;
  total: number;
}

// ── Accessors ────────────────────────────────────────────────────────────────

export function getPlatformMetrics(): PlatformMetrics {
  return {
    totalTokenConsumption: 2_140_000_000_000,
    totalCostUsd: 14_280,
    totalRevenueUsd: 17_136,
    activeMerchants: 47,
    totalAutoTopups: 312,
  };
}

export function getRevenueTrend(): RevenueTrendPoint[] {
  // Current date is June 3 2026 — 3 data points (days 1–3)
  const points: RevenueTrendPoint[] = [];
  let cumulative = 0;
  for (let i = 1; i <= 3; i++) {
    cumulative += Math.round(5712 * (i === 1 ? 1 : 0.85));
    points.push({ date: `Jun ${i}`, revenue: cumulative });
  }
  return points;
}

export function getModelBreakdown(): ModelBreakdownItem[] {
  return [
    { model: "GPT-4o",  tokenShare: 0.48, tokenCount: 1_027_200_000_000, color: "#2563EB" },
    { model: "GPT-4.1", tokenShare: 0.31, tokenCount:   663_400_000_000, color: "#7C3AED" },
    { model: "Claude",  tokenShare: 0.13, tokenCount:   278_200_000_000, color: "#D97706" },
    { model: "Gemini",  tokenShare: 0.08, tokenCount:   171_200_000_000, color: "#059669" },
  ];
}

export function getMerchantRanking(): MerchantRankingRow[] {
  return [
    { rank: 1,  merchantId: "mch_haba_001", merchantName: "HABA Co., Ltd.",     monthlyTokenUsage: 312_400_000, monthlyCostUsd: 2847, revenueUsd: 3416, status: "active" },
    { rank: 2,  merchantId: "mch_002",       merchantName: "MedTech Corp",       monthlyTokenUsage: 287_100_000, monthlyCostUsd: 2614, revenueUsd: 3137, status: "active" },
    { rank: 3,  merchantId: "mch_003",       merchantName: "HealthPlus Inc.",    monthlyTokenUsage: 241_800_000, monthlyCostUsd: 2201, revenueUsd: 2641, status: "active" },
    { rank: 4,  merchantId: "mch_004",       merchantName: "PharmaCare Japan",   monthlyTokenUsage: 198_500_000, monthlyCostUsd: 1806, revenueUsd: 2167, status: "active" },
    { rank: 5,  merchantId: "mch_005",       merchantName: "NutriBot Solutions", monthlyTokenUsage: 156_200_000, monthlyCostUsd: 1422, revenueUsd: 1706, status: "active" },
    { rank: 6,  merchantId: "mch_006",       merchantName: "AgroTech AI",        monthlyTokenUsage: 134_700_000, monthlyCostUsd: 1226, revenueUsd: 1471, status: "active" },
    { rank: 7,  merchantId: "mch_007",       merchantName: "FinSight Analytics", monthlyTokenUsage: 112_300_000, monthlyCostUsd: 1022, revenueUsd: 1226, status: "active" },
    { rank: 8,  merchantId: "mch_008",       merchantName: "RetailGenius KK",    monthlyTokenUsage:  89_600_000, monthlyCostUsd:  816, revenueUsd:  979, status: "active" },
    { rank: 9,  merchantId: "mch_009",       merchantName: "LogiAI Express",     monthlyTokenUsage:  67_400_000, monthlyCostUsd:  614, revenueUsd:  737, status: "trial" },
    { rank: 10, merchantId: "mch_010",       merchantName: "EduBot Systems",     monthlyTokenUsage:  45_200_000, monthlyCostUsd:  411, revenueUsd:  494, status: "suspended" },
  ];
}

export function getBillingStatement(period = "2026-06"): BillingStatement {
  return {
    period,
    merchantName: "HABA Co., Ltd.",
    lineItems: [
      { model: "GPT-4o",  tokens: 149_900_000, unitRatePerMillion: 10.00, amount: 1499.00 },
      { model: "GPT-4.1", tokens:  96_800_000, unitRatePerMillion:  8.50, amount:  822.80 },
      { model: "Claude",  tokens:  40_600_000, unitRatePerMillion:  7.50, amount:  304.50 },
      { model: "Gemini",  tokens:  25_100_000, unitRatePerMillion:  8.80, amount:  220.88 },
    ],
    subtotal: 2847.18,
    taxRate: 0.10,
    total: 3131.90,
  };
}
