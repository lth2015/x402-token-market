/**
 * Server-side proxy to x402-api's /v1/_console/events.
 * Adds no auth — read-only on internal DEV; production must mount these
 * behind admin SSO at the ALB layer.
 */
import { NextResponse } from "next/server";

const X402_API = process.env.X402_API_BASE_URL ?? "http://x402-api:8080";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const url = new URL(req.url);
  const limit = url.searchParams.get("limit") ?? "30";
  const r = await fetch(`${X402_API}/v1/_console/events?limit=${encodeURIComponent(limit)}`, { cache: "no-store" });
  const body = await r.json().catch(() => ({}));
  return NextResponse.json(body, { status: r.status });
}
