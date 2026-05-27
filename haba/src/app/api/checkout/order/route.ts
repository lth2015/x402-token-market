/**
 * POST /api/checkout/order — consumer USDC checkout with real Solana Devnet support.
 *
 * Payment path (in priority order):
 *   1. REAL CHAIN  — x402-api dev-checkout builds + signs + broadcasts a real
 *                    SPL TransferChecked transaction on Solana Devnet.
 *                    Requires DEMO_PAYER_PRIVATE_KEY_B64 in .env (setup-devnet-wallet.py).
 *   2. DEV BYPASS  — admin-confirm shortcut: no on-chain activity, instant mock tx_hash.
 *                    Used when the demo wallet is not configured or Solana RPC is down.
 *
 * Amount:
 *   Cart total in JPY → USDC at 150 JPY/USDC, clamped to [MIN_USDC, MAX_USDC].
 *   MAX_USDC = 9 keeps every demo transaction well under $10 as requested.
 *
 * Body: { items: Array<{ productId: string; qty: number }>;
 *         totalUsdc?: number; idempotencyKey?: string }
 */
import { NextResponse } from "next/server";
import { randomBytes } from "node:crypto";
import {
  adminConfirm,
  createTokenPurchase,
  devCheckout,
  NetstarsError,
} from "@/lib/netstars/client";
import { getProductById } from "@/lib/haba";

export const dynamic = "force-dynamic";

const USDC_RATE_JPY = 150;
// Keep every demo payment under $10 USDC as instructed.
const MIN_USDC = 0.10;   // 10¢ floor so tiny demo carts still trigger real tx
const MAX_USDC = 9.00;   // $9 ceiling — well within the "under $10" requirement

type ItemIn = { productId?: unknown; qty?: unknown };
type Body = { items?: ItemIn[]; totalUsdc?: unknown; idempotencyKey?: unknown };

type ChainMode = "devnet" | "dev";

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

  // Recompute totals server-side to prevent client-side tampering.
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

  // JPY → USDC conversion, clamped to [MIN_USDC, MAX_USDC].
  let amountUsdc = +(totalJpy / USDC_RATE_JPY).toFixed(4);
  if (amountUsdc < MIN_USDC) amountUsdc = MIN_USDC;
  if (amountUsdc > MAX_USDC) amountUsdc = MAX_USDC;

  const idem = typeof body.idempotencyKey === "string" && body.idempotencyKey
    ? body.idempotencyKey
    : `haba-checkout-${randomBytes(6).toString("hex")}`;

  try {
    // Step 1: Create payment order via token-api → x402-api.
    const order = await createTokenPurchase({ amountUsdc, idempotencyKey: idem });

    // Step 2: Attempt real Devnet USDC payment; fall back to admin-confirm.
    let chainMode: ChainMode = "dev";
    let txHash: string | null = null;
    let explorerUrl: string | undefined;
    let finalStatus: string | null = null;

    try {
      // 45-second timeout is set inside devCheckout (AbortSignal.timeout).
      const devResult = await devCheckout({ paymentOrderId: order.payment_order_id });
      txHash       = devResult.tx_hash;
      chainMode    = "devnet";
      explorerUrl  = devResult.explorer_url;
      finalStatus  = (devResult.order as { status?: string }).status ?? null;
    } catch (devErr) {
      // Graceful fallback: log the reason and continue with admin-confirm.
      const reason = devErr instanceof NetstarsError
        ? `${devErr.message} (HTTP ${devErr.status})`
        : devErr instanceof Error ? devErr.message : String(devErr);
      console.warn(`[checkout] dev-checkout unavailable, falling back to admin-confirm: ${reason}`);

      const adminResult = await adminConfirm({ paymentOrderId: order.payment_order_id });
      txHash      = (adminResult.order as { tx_hash?: string }).tx_hash ?? null;
      finalStatus = (adminResult.order as { status?: string }).status ?? null;
    }

    const orderInternalId = `ord_${randomBytes(5).toString("hex")}`;

    return NextResponse.json({
      ok: true,
      order_id:          orderInternalId,
      payment_order_id:  order.payment_order_id,
      tx_hash:           txHash,
      chain_mode:        chainMode,
      explorer_url:      explorerUrl ?? null,
      status:            finalStatus,
      amount_usdc:       amountUsdc,
      total_jpy:         totalJpy,
      items:             lineSummary,
      placed_at:         new Date().toISOString(),
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
