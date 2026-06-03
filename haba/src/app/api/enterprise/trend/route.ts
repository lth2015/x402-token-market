import { NextResponse } from "next/server";
import {
  MOCK_TREND_TODAY,
  MOCK_TREND_WEEK,
  MOCK_TREND_MONTH,
} from "@/lib/haba/enterprise";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const period = searchParams.get("period") ?? "today";

  const data =
    period === "week"  ? MOCK_TREND_WEEK  :
    period === "month" ? MOCK_TREND_MONTH :
    MOCK_TREND_TODAY;

  return NextResponse.json({ data, period, is_mock: true });
}
