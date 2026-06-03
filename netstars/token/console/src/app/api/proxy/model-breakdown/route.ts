import { NextResponse } from "next/server";
import { getModelBreakdown } from "@/lib/platform-mock";

export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json({ data: getModelBreakdown(), is_mock: true });
}
