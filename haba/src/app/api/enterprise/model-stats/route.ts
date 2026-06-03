import { NextResponse } from "next/server";
import { MOCK_MODEL_STATS } from "@/lib/haba/enterprise";

export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json({ data: MOCK_MODEL_STATS, is_mock: true });
}
