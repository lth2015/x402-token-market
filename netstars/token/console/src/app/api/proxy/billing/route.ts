import { NextResponse } from "next/server";
import { getBillingStatement } from "@/lib/platform-mock";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const url    = new URL(req.url);
  const period = url.searchParams.get("period") ?? "2026-06";
  return NextResponse.json({ data: getBillingStatement(period), is_mock: true });
}
