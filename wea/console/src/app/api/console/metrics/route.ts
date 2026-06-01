import { NextResponse } from "next/server";
const WEA = process.env.WEA_API_BASE_URL ?? "http://wea-api:8080";
export const dynamic = "force-dynamic";

export async function GET() {
  const r = await fetch(`${WEA}/v1/_console/metrics`, { cache: "no-store" });
  const body = await r.json().catch(() => ({}));
  return NextResponse.json(body, { status: r.status });
}
