import { NextResponse } from "next/server";
import { MOCK_KPI } from "@/lib/haba/enterprise";

export const dynamic = "force-dynamic";

export async function GET() {
  const { currentBudgetUsed, budgetLimit, tokenLimit, monthlyTokenUsage } = MOCK_KPI;
  return NextResponse.json({
    data: {
      currentBudgetUsed,
      budgetLimit,
      tokenLimit,
      monthlyTokenUsage,
      budgetUsedPct: (currentBudgetUsed / budgetLimit) * 100,
      tokenUsedPct:  (monthlyTokenUsage / tokenLimit) * 100,
      autoTopupThresholdUsd: budgetLimit * 0.8,
    },
    is_mock: true,
  });
}
