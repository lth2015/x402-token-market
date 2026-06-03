export interface EnterpriseKpi {
  activeUsersOnline: number;
  todayTokenUsage: number;
  weeklyTokenUsage: number;
  monthlyTokenUsage: number;
  currentBudgetUsed: number;
  remainingBudget: number;
  budgetLimit: number;
  tokenLimit: number;
}

export interface AiModelStats {
  model: "gpt-4.1";
  requestCount: number;
  tokenUsage: number;
  estimatedCost: number;
}

export interface ConsumptionDataPoint {
  label: string;
  tokens: number;
}

export interface AutoTopupRecord {
  id: string;
  time: string;
  triggerReason: string;
  remainingTokenBefore: number | null;
  topupAmount: 100_000_000;
  usdCost: number;
  txHash: string;
  status: "completed" | "pending" | "failed";
}

export const MOCK_KPI: EnterpriseKpi = {
  activeUsersOnline: 247,
  todayTokenUsage: 14_200_000,
  weeklyTokenUsage: 89_600_000,
  monthlyTokenUsage: 312_400_000,
  currentBudgetUsed: 2847,
  remainingBudget: 2153,
  budgetLimit: 5000,
  tokenLimit: 5_000_000_000,
};

export const MOCK_MODEL_STATS: AiModelStats = {
  model: "gpt-4.1",
  requestCount: 18432,
  tokenUsage: 312_400_000,
  estimatedCost: 2847.00,
};

export const MOCK_TREND_TODAY: ConsumptionDataPoint[] = Array.from({ length: 24 }, (_, i) => ({
  label: `${String(i).padStart(2, "0")}:00`,
  tokens: Math.floor(400_000 + Math.sin(i / 3) * 200_000 + (i * 17 % 7) * 30_000),
}));

export const MOCK_TREND_WEEK: ConsumptionDataPoint[] = [
  { label: "Mon", tokens: 11_800_000 },
  { label: "Tue", tokens: 13_400_000 },
  { label: "Wed", tokens: 12_900_000 },
  { label: "Thu", tokens: 14_700_000 },
  { label: "Fri", tokens: 15_200_000 },
  { label: "Sat", tokens: 8_900_000 },
  { label: "Sun", tokens: 12_600_000 },
];

export const MOCK_TREND_MONTH: ConsumptionDataPoint[] = Array.from({ length: 30 }, (_, i) => ({
  label: `Jun ${i + 1}`,
  tokens: i === 0 ? 9_800_000 : i === 1 ? 13_200_000 : i === 2 ? 14_200_000 : 0,
}));

export const MOCK_TOPUP_HISTORY: AutoTopupRecord[] = [
  {
    id: "top_001",
    time: "2026-06-03T14:32:00Z",
    triggerReason: "Budget usage reached 80% ($4,000 / $5,000)",
    remainingTokenBefore: 12_400_000,
    topupAmount: 100_000_000,
    usdCost: 100.00,
    txHash: "5gYYVx...wYMS",
    status: "completed",
  },
  {
    id: "top_002",
    time: "2026-06-02T09:15:00Z",
    triggerReason: "Balance below 20M Tokens",
    remainingTokenBefore: 18_600_000,
    topupAmount: 100_000_000,
    usdCost: 100.00,
    txHash: "4R1wey...pHJAF",
    status: "completed",
  },
  {
    id: "top_003",
    time: "2026-06-01T17:44:00Z",
    triggerReason: "Budget usage reached 80%",
    remainingTokenBefore: 9_800_000,
    topupAmount: 100_000_000,
    usdCost: 100.00,
    txHash: "3Kx9mn...qRTWD",
    status: "completed",
  },
  {
    id: "top_004",
    time: "2026-05-31T11:20:00Z",
    triggerReason: "Balance below 20M Tokens",
    remainingTokenBefore: 15_200_000,
    topupAmount: 100_000_000,
    usdCost: 100.00,
    txHash: "7Pqrst...mNBVC",
    status: "completed",
  },
  {
    id: "top_005",
    time: "2026-05-30T08:05:00Z",
    triggerReason: "Budget usage reached 80%",
    remainingTokenBefore: 22_100_000,
    topupAmount: 100_000_000,
    usdCost: 100.00,
    txHash: "2Lmnop...xYZAB",
    status: "failed",
  },
  {
    id: "top_006",
    time: "2026-05-29T16:38:00Z",
    triggerReason: "Balance below 20M Tokens",
    remainingTokenBefore: 11_300_000,
    topupAmount: 100_000_000,
    usdCost: 100.00,
    txHash: "9Fghij...kLMNO",
    status: "completed",
  },
];

export function formatTokenCount(n: number): string {
  if (n >= 1_000_000_000) return `${(n / 1_000_000_000).toFixed(2)}B`;
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(0)}K`;
  return n.toLocaleString();
}
