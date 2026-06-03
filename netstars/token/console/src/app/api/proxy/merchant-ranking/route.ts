import { NextResponse } from "next/server";
import { getMerchantRanking } from "@/lib/platform-mock";

export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json({ data: getMerchantRanking(), is_mock: true });
}
