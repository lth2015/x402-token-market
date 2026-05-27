/**
 * POST /api/checkout/order — fires a real (DEV-mode) consumer checkout.
 *
 * From HABA's product viewpoint, this is "consumer pays USDC for MARVIE
 * goods". Under the hood we reuse the same two-step token-purchase +
 * admin-confirm chain as /api/payment/topup — that's the demo backend's
 * only USDC settlement path. The amount comes from the cart total (JPY
 * → USDC at 1 USDC = 150 JPY).
 *
 * The HABA Token balance will increment as a side-effect because the
 * backend is a Token sale endpoint. We accept the mild semantic blur in
 * exchange for showing a real on-chain confirmation + a tx_hash in the
 * order success panel.
 *
 * Body: { items: Array<{ productId: string; qty: number }>;
 *         totalUsdc?: number; idempotencyKey?: string }
 */
import { NextResponse } from "next/server";
import { randomBytes } from "node:crypto";
import { adminConfirm, createTokenPurchase, NetstarsError } from "@/lib/netstars/client";
import { getProductById } from "@/lib/haba";

export const dynamic = "force-dynamic";

const USDC_RATE_JPY = 150;
// Backend enforces a minimum order value; clamp tiny demo carts so the
// USDC amount stays sensible without rejecting the demo flow.
const MIN_USDC = 1;
const MAX_USDC = 10_000;

type ItemIn = { productId?: unknown; qty?: unknown };
type Body = { items?: ItemIn[]; totalUsdc?: unknown; idempotencyKey?: unknown };

export async function POST(req: Request) {
  let body: Body = {};
  try {
    body = (await req.json()) as Body;
  } catch {
    return NextResponse.json({ ok: false, error: "invalid JSON body" }, { status: 400 });
  }

  const items = Array.isArray(body.items) ? body.items : [];
  if (items.length === 0) {
    return NextResponse.json({ ok: false, error: "cart is empty" }, { status: 400 });
  }

  // Recompute totals server-side rather than trusting the client number,
  // so a tampered cart can't move arbitrary amounts.
  let totalJpy = 0;
  const lineSummary: Array<{ productId: string; qty: number; sku: string; nameShort: string; priceJpy: number }> = [];
  for (const it of items) {
    const productId = typeof it.productId === "string" ? it.productId : "";
    const qty = typeof it.qty === "number" && it.qty > 0 ? Math.floor(it.qty) : 0;
    if (!productId || qty <= 0) continue;
    const product = getProductById(productId);
    if (!product) continue;
    totalJpy += product.priceJpy * qty;
    lineSummary.push({
      productId,
      qty,
      sku: product.sku,
      nameShort: product.shortName,
      priceJpy: product.priceJpy,
    });
  }

  if (lineSummary.length === 0) {
    return NextResponse.json({ ok: false, error: "no valid line items" }, { status: 400 });
  }

  let amountUsdc = +(totalJpy / USDC_RATE_JPY).toFixed(4);
  if (amountUsdc < MIN_USDC) amountUsdc = MIN_USDC;
  if (amountUsdc > MAX_USDC) amountUsdc = MAX_USDC;

  const idem = typeof body.idempotencyKey === "string" && body.idempotencyKey
    ? body.idempotencyKey
    : `haba-checkout-${randomBytes(6).toString("hex")}`;

  try {
    const order = await createTokenPurchase({ amountUsdc, idempotencyKey: idem });
    const confirm = await adminConfirm({ paymentOrderId: order.payment_order_id });

    const orderInternalId = `ord_${randomBytes(5).toString("hex")}`;
    return NextResponse.json({
      ok: true,
      order_id: orderInternalId,
      payment_order_id: order.payment_order_id,
      tx_hash: (confirm.order as { tx_hash?: string }).tx_hash ?? null,
      status: (confirm.order as { status?: string }).status ?? null,
      amount_usdc: amountUsdc,
      total_jpy: totalJpy,
      items: lineSummary,
      placed_at: new Date().toISOString(),
    });
  } catch (e) {
    if (e instanceof NetstarsError) {
      return NextResponse.json(
        { ok: false, error: e.message, detail: e.raw?.slice(0, 240) },
        { status: 502 },
      );
    }
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : "unknown" },
      { status: 500 },
    );
  }
}
