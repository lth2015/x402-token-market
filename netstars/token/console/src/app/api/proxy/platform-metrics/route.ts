import { NextResponse } from "next/server";
import { getPlatformMetrics } from "@/lib/platform-mock";

export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json({ data: getPlatformMetrics(), is_mock: true });
}
