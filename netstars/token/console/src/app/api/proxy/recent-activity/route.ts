// BFF proxy — browser hits this; we forward to token-api on the server side
// so that any future per-merchant auth header is added once, here.
import { NextResponse } from "next/server";
import { api } from "@/lib/api";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const limit = Number(url.searchParams.get("limit") ?? "20");
  try {
    const data = await api.recentActivity(limit);
    return NextResponse.json(data);
  } catch (e: unknown) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "unknown" },
      { status: 502 }
    );
  }
}
