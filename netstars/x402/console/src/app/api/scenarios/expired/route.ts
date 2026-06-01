/**
 * Scenario: expired order.
 * Create a short-lived challenge, build a valid X-PAYMENT while it is fresh,
 * wait until requirements.extra.expiresAt passes, then retry. Expected:
 * 410 + EXPIRED before WEA verify/settle is called.
 */
import { NextResponse } from "next/server";
import { buildPaymentHeader, fetchChallenge, retryWithProof } from "@/lib/x402";

export const dynamic = "force-dynamic";

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export async function POST() {
  const idem = `console-expired-${Date.now().toString(36)}`;
  const steps: Array<{ name: string; status: "ok" | "fail"; detail?: unknown }> = [];

  const ch = await fetchChallenge({
    amountUsdcMicro: 100_000,
    idempotencyKey: idem,
    description: "Console · expired order",
    demoExpirySeconds: 2,
  });
  steps.push({
    name: "① 创建 2 秒过期的 PaymentRequirements",
    status: ch.status === 402 && !!ch.body?.accepts?.[0] ? "ok" : "fail",
    detail: { http: ch.status, requirements: ch.body?.accepts?.[0] },
  });
  if (ch.status !== 402 || !ch.body?.accepts?.[0]) {
    return NextResponse.json({ ok: false, scenario: "expired", steps, error: "challenge failed" });
  }

  const built = await buildPaymentHeader(ch.body.accepts[0]!);
  steps.push({
    name: "② 在过期前构造有效 X-PAYMENT",
    status: built.status === 200 && !!built.body?.x_payment_header ? "ok" : "fail",
    detail: { http: built.status, payer: built.body?.payer, nonce: built.body?.nonce },
  });
  if (built.status !== 200 || !built.body?.x_payment_header) {
    return NextResponse.json({ ok: false, scenario: "expired", steps, error: "build failed" });
  }

  await sleep(3_000);

  const retry = await retryWithProof({
    amountUsdcMicro: 100_000,
    idempotencyKey: idem,
    description: "Console · expired order",
    xPaymentHeader: built.body.x_payment_header,
    demoExpirySeconds: 2,
  });
  const expired = retry.status === 410
    && typeof retry.body === "object"
    && retry.body !== null
    && "error" in retry.body
    && retry.body.error === "EXPIRED";
  steps.push({
    name: "③ 等 3 秒后 retry,Gateway 拒绝过期订单",
    status: expired ? "ok" : "fail",
    detail: { http: retry.status, body: retry.body },
  });

  return NextResponse.json({
    ok: expired,
    expected: "HTTP 410 + error EXPIRED",
    scenario: "expired",
    steps,
    response: retry.body,
  });
}
