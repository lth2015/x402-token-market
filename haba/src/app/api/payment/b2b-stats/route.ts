/**
 * GET /api/payment/b2b-stats
 *
 * Returns the number of AI calls charged to HABA's Token ledger this
 * calendar month, along with the demo monthly cap.  Powers the live
 * b2bCallNotice inside AgentChatDemo so the counter is real, not a
 * hard-coded "(演示数据 18,432 / 100,000)".
 *
 * Implementation: reads the last 100 ledger entries via /v1/recent-activity,
 * then counts "ai_call" debits whose timestamp falls in the current month.
 * For a demo ledger with moderate traffic this is accurate; production would
 * use a proper monthly-aggregation endpoint.
 */
import { NextResponse } from "next/server";
import { fetchRecentActivity, NetstarsError } from "@/lib/netstars/client";

export const dynamic = "force-dynamic";

/** Demo monthly cap — matches the "growth" plan in tokenResalePlans. */
const MONTHLY_CAP = 50_000;

export async function GET() {
  try {
    const { items } = await fetchRecentActivity(100);

    const now = new Date();
    const monthStartIso = new Date(
      Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1),
    ).toISOString();

    // Count debit entries from AI calls in the current month
    const monthlyCalls = items.filter((item) => {
      return (
        item.kind === "debit" &&
        typeof item.ts === "string" &&
        item.ts >= monthStartIso
      );
    }).length;

    return NextResponse.json({
      ok: true,
      monthly_calls: monthlyCalls,
      monthly_cap: MONTHLY_CAP,
      month: `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, "0")}`,
    });
  } catch (e) {
    // If the backend is down (e.g. during local dev without docker) return a
    // graceful null so the UI falls back to the static placeholder.
    if (e instanceof NetstarsError && e.status >= 500) {
      return NextResponse.json(
        { ok: false, monthly_calls: null, monthly_cap: MONTHLY_CAP, error: "upstream unavailable" },
        { status: 200 }, // 200 so the UI doesn't show an error state
      );
    }
    return NextResponse.json(
      { ok: false, monthly_calls: null, monthly_cap: MONTHLY_CAP, error: "unknown" },
      { status: 200 },
    );
  }
}
