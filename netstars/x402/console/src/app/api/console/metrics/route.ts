import { NextResponse } from "next/server";

const X402_API = process.env.X402_API_BASE_URL ?? "http://x402-api:8080";

export const dynamic = "force-dynamic";

export async function GET() {
  const r = await fetch(`${X402_API}/v1/_console/metrics`, { cache: "no-store" });
  const body = await r.json().catch(() => ({}));
  return NextResponse.json(body, { status: r.status });
}
