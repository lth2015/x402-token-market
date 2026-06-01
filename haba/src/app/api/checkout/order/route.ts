/**
 * POST /api/checkout/order — consumer product checkout via the standard
 * x402 protocol.
 *
 * Flow (proxied from the browser to NetStars x402 gateway):
 *   1.  POST {gateway}/v1/protected/checkout/order (no header)  → 402 + requirements
 *   2.  POST {gateway}/internal/build-payment-payload(requirements) → X-PAYMENT
 *   3.  POST {gateway}/v1/protected/checkout/order  X-PAYMENT: ... → 200 + receipt
 *
 * The actual on-chain settlement happens at step 3, inside the gateway,
 * which delegates verify + broadcast to the WEA facilitator
 * (POST /facilitator/verify, /facilitator/settle).
 *
 * Business boundary: this route does NOT touch Solana, does NOT hold any
 * payer key, and does NOT bypass the 402 challenge — anything that does
 * any of those breaks the protocol invariant.
 *
 * Body: { items: Array<{productId, qty}>;
 *         totalUsdc?, idempotencyKey?, userVerification? }
 */
import { NextResponse } from "next/server";
import { randomBytes } from "node:crypto";
import { getProductById } from "@/lib/haba";
import { jpyToCheckoutUsdc } from "@/lib/haba/checkout";
import { protectedCheckoutOrderUrl, x402Fetch } from "@/lib/x402-client";

export const dynamic = "force-dynamic";

type ItemIn = { productId?: unknown; qty?: unknown };
type Body = {
  items?: ItemIn[];
  idempotencyKey?: unknown;
  userVerification?: unknown;
};

export async function POST(req: Request) {
  let body: Body = {};
  try { body = (await req.json()) as Body; }
  catch { return NextResponse.json({ ok: false, error: "invalid JSON body" }, { status: 400 }); }

  const items = Array.isArray(body.items) ? body.items : [];
  if (items.length === 0) {
    return NextResponse.json({ ok: false, error: "cart is empty" }, { status: 400 });
  }

  // Recompute totals server-side (no client trust on amount).
  let totalJpy = 0;
  const lineSummary: Array<{
    productId: string; qty: number; sku: string; nameShort: string; priceJpy: number;
  }> = [];
  for (const it of items) {
    const productId = typeof it.productId === "string" ? it.productId : "";
    const qty = typeof it.qty === "number" && it.qty > 0 ? Math.floor(it.qty) : 0;
    if (!productId || qty <= 0) continue;
    const product = getProductById(productId);
    if (!product) continue;
    totalJpy += product.priceJpy * qty;
    lineSummary.push({
      productId, qty,
      sku: product.sku,
      nameShort: product.shortName,
      priceJpy: product.priceJpy,
    });
  }
  if (lineSummary.length === 0) {
    return NextResponse.json({ ok: false, error: "no valid line items" }, { status: 400 });
  }

  const amountUsdc = jpyToCheckoutUsdc(totalJpy);
  const amountUsdcMicro = Math.round(amountUsdc * 1_000_000);

  const idem = typeof body.idempotencyKey === "string" && body.idempotencyKey
    ? body.idempotencyKey
    : `haba-checkout-${randomBytes(6).toString("hex")}`;
  const userVerification = typeof body.userVerification === "string" && body.userVerification
    ? body.userVerification
    : null;
  const orderInternalId = `ord_${randomBytes(5).toString("hex")}`;

  try {
    // Drive the canonical 402 → build → retry loop.
    const result = await x402Fetch<{
      ok: boolean;
      order_id: string;
      amount_usdc_micro: number;
      tx_hash: string;
      network: string;
      payer: string;
      confirmed_at: string | null;
      resource: string;
      settlement_receipt: { transaction: string; network: string; payer: string };
    }>({
      resourceUrl: protectedCheckoutOrderUrl(),
      body: {
        amount_usdc_micro: amountUsdcMicro,
        idempotency_key: idem,
        description: `HABA MARVIE order · ${lineSummary.length} 件 / ¥${totalJpy.toLocaleString()}`,
        metadata: {
          channel: "haba-cart",
          total_jpy: totalJpy,
          line_count: lineSummary.length,
        },
      },
      userVerification,
    });

    return NextResponse.json({
      ok: true,
      order_id: orderInternalId,
      payment_order_id: result.body.order_id,
      tx_hash: result.body.tx_hash,
      network: result.body.network,
      payer: result.body.payer,
      x402: {
        resource: result.body.resource,
        requirements: result.requirements,
        settlement_receipt: result.settlementReceipt,
      },
      amount_usdc: amountUsdc,
      total_jpy: totalJpy,
      items: lineSummary,
      placed_at: new Date().toISOString(),
    });
  } catch (e) {
    const cause = (e as { cause?: unknown })?.cause;
    if (cause && typeof cause === "object") {
      return NextResponse.json({ ok: false, error: e instanceof Error ? e.message : "x402 error", detail: cause }, { status: 502 });
    }
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : "unknown" },
      { status: 500 },
    );
  }
}
