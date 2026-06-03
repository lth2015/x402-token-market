/**
 * Topup history: fetches real credit entries from token-api /v1/recent-activity,
 * filtered for x402_payment credits. Falls back to mock data if unreachable.
 */
import { NextResponse } from "next/server";
import { signRequest } from "@/lib/netstars/sign";
import { MOCK_TOPUP_HISTORY, type AutoTopupRecord } from "@/lib/haba/enterprise";

export const dynamic = "force-dynamic";

const TOKEN_API = process.env.NETSTARS_TOKEN_API_INTERNAL ?? "http://localhost:8080";
const KEY_ID    = process.env.NETSTARS_AGENT_KEY_ID       ?? "ak_localdev_test";
const KEY_SEC   = process.env.NETSTARS_AGENT_KEY_SECRET   ?? "secret_localdev_test";

interface ActivityItem {
  id: string;
  ts: string;
  kind: "credit" | "debit" | "error";
  description: string;
  amount_token: number;
  amount_usdc: number | null;
  trace_id: string;
}

export async function GET() {
  try {
    const path = "/v1/recent-activity?limit=30";
    const hdrs = signRequest({ method: "GET", path: "/v1/recent-activity", body: "", apiKeyId: KEY_ID, apiKeySecret: KEY_SEC });
    const res = await fetch(`${TOKEN_API}${path}`, {
      headers: hdrs as HeadersInit,
      cache: "no-store",
    });

    if (!res.ok) {
      return NextResponse.json({ data: MOCK_TOPUP_HISTORY, is_mock: true });
    }

    const json = await res.json() as { items: ActivityItem[]; is_mock?: boolean };
    const creditEntries = json.items.filter((it) => it.kind === "credit");

    if (creditEntries.length === 0) {
      return NextResponse.json({ data: MOCK_TOPUP_HISTORY, is_mock: true });
    }

    const records: AutoTopupRecord[] = creditEntries.map((entry) => ({
      id: entry.id,
      time: entry.ts ?? new Date().toISOString(),
      triggerReason: entry.description || "Token purchase via x402",
      remainingTokenBefore: null,
      topupAmount: 100_000_000 as const,
      usdCost: entry.amount_usdc ?? 100,
      txHash: entry.trace_id ? `${entry.trace_id.slice(0, 8)}…` : "—",
      status: "completed" as const,
    }));

    return NextResponse.json({ data: records, is_mock: json.is_mock ?? false });
  } catch {
    return NextResponse.json({ data: MOCK_TOPUP_HISTORY, is_mock: true });
  }
}
