import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const body = await req.json() as { id?: string };
  const id   = body.id ?? "unknown";
  return NextResponse.json({
    ok: true,
    email: "ops@haba-rd.jp",
    invoiceId: id,
    sentAt: new Date().toISOString(),
    is_mock: true,
  });
}
