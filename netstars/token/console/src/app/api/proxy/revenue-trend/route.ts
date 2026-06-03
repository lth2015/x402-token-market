import { NextResponse } from "next/server";
import { getRevenueTrend } from "@/lib/platform-mock";

export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json({ data: getRevenueTrend(), is_mock: true });
}
