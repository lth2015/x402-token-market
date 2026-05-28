/**
 * GET /api/payment/balance — server-side proxy that fetches HABA's
 * current Token balance from the upstream payment provider.
 *
 * HMAC secret never reaches the browser. Server-side balance capability.
 */
import { NextResponse } from "next/server";
import { fetchBalance, NetstarsError } from "@/lib/netstars/client";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const balance = await fetchBalance();
    return NextResponse.json(balance);
  } catch (e) {
    if (e instanceof NetstarsError) {
      return NextResponse.json(
        { error: e.message, status: e.status, detail: e.raw?.slice(0, 200) },
        { status: 502 },
      );
    }
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "unknown" },
      { status: 500 },
    );
  }
}
