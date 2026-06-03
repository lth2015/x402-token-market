import { NextResponse } from "next/server";
import { signRequest } from "@/lib/netstars/sign";

export const dynamic = "force-dynamic";

const TOKEN_API = process.env.NETSTARS_TOKEN_API_INTERNAL ?? "http://localhost:8080";
const KEY_ID    = process.env.NETSTARS_AGENT_KEY_ID     ?? "ak_localdev_test";
const KEY_SEC   = process.env.NETSTARS_AGENT_KEY_SECRET ?? "secret_localdev_test";

export async function GET() {
  const path = "/v1/balance";
  const hdrs = signRequest({ method: "GET", path, body: "", apiKeyId: KEY_ID, apiKeySecret: KEY_SEC });
  try {
    const res = await fetch(`${TOKEN_API}${path}`, { headers: hdrs as HeadersInit, cache: "no-store" });
    const data = await res.json();
    return NextResponse.json(data, { status: res.status });
  } catch (e) {
    return NextResponse.json({ error: "token-api unreachable", detail: String(e) }, { status: 503 });
  }
}
