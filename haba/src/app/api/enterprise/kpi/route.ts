import { NextResponse } from "next/server";
import { MOCK_KPI } from "@/lib/haba/enterprise";

export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json({ data: MOCK_KPI, is_mock: true });
}
