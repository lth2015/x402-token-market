"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  CheckCircle,
  Clock,
  ExternalLink,
  Loader2,
  Minus,
  Plus,
  ShieldCheck,
  ShoppingBag,
  Wallet,
  XCircle,
} from "lucide-react";
import { useCart, type CartHydratedItem } from "@/lib/cart/store";
import { formatJpy } from "@/lib/utils";
import { MAX_CHECKOUT_USDC, USDC_RATE_JPY } from "@/lib/haba/checkout";

/** Persisted across page refreshes in localStorage (24-h TTL) */
const STORAGE_KEY = "haba_last_order";
const ORDER_TTL_MS = 24 * 60 * 60 * 1000;

type SuccessPayload = {
  orderId: string;
  paymentOrderId: string;
  amountUsdc: number;
  totalJpy: number;
  placedAt: string;
  chainMode: "devnet" | "dev";
  txHash: string | null;
  explorerUrl: string | null;
  status: string | null;
};

type Phase =
  | { kind: "cart" }
  | { kind: "processing" }
  | ({ kind: "success" } & SuccessPayload)
  | { kind: "error"; message: string };

function saveOrder(payload: SuccessPayload) {
  try {
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({ ...payload, savedAt: new Date().toISOString() }),
    );
  } catch { /* storage full or SSR — ignore */ }
}

function loadSavedOrder(): SuccessPayload | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as SuccessPayload & { savedAt: string };
    if (Date.now() - new Date(parsed.savedAt).getTime() > ORDER_TTL_MS) {
      localStorage.removeItem(STORAGE_KEY);
      return null;
    }
    return {
      orderId: parsed.orderId,
      paymentOrderId: parsed.paymentOrderId,
      amountUsdc: parsed.amountUsdc,
      totalJpy: parsed.totalJpy,
      placedAt: parsed.placedAt,
      chainMode: parsed.chainMode === "devnet" ? "devnet" : "dev",
      txHash: typeof parsed.txHash === "string" ? parsed.txHash : null,
      explorerUrl: typeof parsed.explorerUrl === "string" ? parsed.explorerUrl : null,
      status: typeof parsed.status === "string" ? parsed.status : null,
    };
  } catch { return null; }
}

export function CheckoutFlow() {
  const cart = useCart();
  const [phase, setPhase] = useState<Phase>({ kind: "cart" });
  const [savedOrder, setSavedOrder] = useState<SuccessPayload | null>(null);

  useEffect(() => {
    const order = loadSavedOrder();
    if (order) setSavedOrder(order);
  }, []);

  async function placeOrder() {
    setPhase({ kind: "processing" });
    try {
      const body = {
        items: cart.items.map((it) => ({ productId: it.productId, qty: it.qty })),
        totalUsdc: cart.checkoutUsdc,
      };
      const res = await fetch("/api/checkout/order", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const j = await res.json();
      if (!res.ok || !j.ok) {
        setPhase({
          kind: "error",
          message: typeof j?.error === "string" ? j.error : `HTTP ${res.status}`,
        });
        return;
      }
      const successPayload: SuccessPayload = {
        orderId: j.order_id,
        paymentOrderId: j.payment_order_id,
        amountUsdc: j.amount_usdc,
        totalJpy: j.total_jpy,
        placedAt: j.placed_at,
        chainMode: j.chain_mode === "devnet" ? "devnet" : "dev",
        txHash: typeof j.tx_hash === "string" ? j.tx_hash : null,
        explorerUrl: typeof j.explorer_url === "string" ? j.explorer_url : null,
        status: typeof j.status === "string" ? j.status : null,
      };
      setPhase({ kind: "success", ...successPayload });
      saveOrder(successPayload);
      setSavedOrder(successPayload);
      cart.clear();
    } catch (e) {
      setPhase({
        kind: "error",
        message: e instanceof Error ? e.message : "网络异常",
      });
    }
  }

  if (phase.kind === "cart") return (
    <CartView
      onCheckout={placeOrder}
      savedOrder={savedOrder}
      onViewSaved={() => savedOrder && setPhase({ kind: "success", ...savedOrder })}
      onDismissSaved={() => {
        localStorage.removeItem(STORAGE_KEY);
        setSavedOrder(null);
      }}
    />
  );
  if (phase.kind === "processing") return <ProcessingView />;
  if (phase.kind === "success") return (
    <SuccessView phase={phase} onNewOrder={() => setPhase({ kind: "cart" })} />
  );
  return <ErrorView message={phase.message} retry={() => setPhase({ kind: "cart" })} />;
}

// ────────────────────────────────────────────────────────────────────
// cart
// ────────────────────────────────────────────────────────────────────
function CartView({
  onCheckout,
  savedOrder,
  onViewSaved,
  onDismissSaved,
}: {
  onCheckout: () => void;
  savedOrder: SuccessPayload | null;
  onViewSaved: () => void;
  onDismissSaved: () => void;
}) {
  const cart = useCart();

  return (
    <>
      {savedOrder && (
        <div className="mt-8 flex items-center justify-between gap-3 rounded-2xl border border-semantic-success/40 bg-semantic-success/5 px-5 py-3 text-small">
          <div className="flex items-center gap-2 text-semantic-success">
            <Clock className="h-4 w-4 shrink-0" aria-hidden />
            <span>
              <span className="font-semibold">上次订单</span>
              <span className="ml-1 font-mono text-caption text-ink-secondary">{savedOrder.orderId}</span>
              <span className="ml-1 text-ink-tertiary">· {new Date(savedOrder.placedAt).toLocaleString("zh-CN")}</span>
            </span>
          </div>
          <div className="flex shrink-0 gap-2">
            <button
              type="button"
              onClick={onViewSaved}
              className="rounded-lg border border-semantic-success/50 bg-semantic-success/10 px-3 py-1 text-caption font-semibold text-semantic-success hover:bg-semantic-success/20"
            >
              查看
            </button>
            <button
              type="button"
              onClick={onDismissSaved}
              className="rounded-lg border border-border-default px-3 py-1 text-caption text-ink-tertiary hover:text-ink-secondary"
            >
              忽略
            </button>
          </div>
        </div>
      )}

      {cart.items.length === 0 ? (
        <div className="mt-10 rounded-2xl border border-dashed border-border-default bg-surface-base p-12 text-center">
          <ShoppingBag className="mx-auto h-10 w-10 text-ink-tertiary" aria-hidden />
          <h3 className="mt-4 text-body font-semibold text-brand-ink">购物车空空</h3>
          <p className="mt-2 text-small text-ink-secondary">
            打开首页，让 HABA AI Advisor 帮你挑几款 MARVIE 商品。
          </p>
          <Link
            href="/"
            className="mt-5 inline-flex items-center gap-1.5 rounded-lg bg-brand-primary px-3 py-2 text-small font-semibold text-white hover:bg-brand-primary-hover"
          >
            去逛 MARVIE 全系列
          </Link>
        </div>
      ) : (
        <div className="mt-8 grid grid-cols-1 gap-6 lg:grid-cols-3">
          <ul className="space-y-3 lg:col-span-2">
            {cart.items.map((item) => (
              <CartLine key={item.productId} item={item} />
            ))}
          </ul>
          <aside className="rounded-2xl border border-border-subtle bg-surface-base p-6 shadow-e1 lg:sticky lg:top-24 lg:h-fit">
            <h3 className="text-body font-semibold text-brand-ink">订单摘要</h3>
            <dl className="mt-4 space-y-2 text-small">
              <Row label="件数" value={`${cart.totalItems} 件`} />
              <Row label="合计 (JPY)" value={formatJpy(cart.totalJpy)} />
              <Row
                label={cart.isCheckoutCapped ? "链上实扣 USDC" : "折合 USDC"}
                value={`${cart.checkoutUsdc.toFixed(2)} USDC`}
                sub={
                  cart.isCheckoutCapped
                    ? `演示支付上限 ${MAX_CHECKOUT_USDC.toFixed(2)} USDC；原始折合 ${cart.totalUsdc.toFixed(2)} USDC`
                    : `1 USDC ≈ ${USDC_RATE_JPY} JPY`
                }
              />
            </dl>
            <button
              type="button"
              onClick={onCheckout}
              className="mt-6 inline-flex w-full items-center justify-center gap-2 rounded-lg bg-brand-primary px-4 py-3 text-body font-semibold text-white hover:bg-brand-primary-hover"
            >
              <Wallet className="h-4 w-4" aria-hidden /> USDC 钱包结账
            </button>
            <p className="mt-3 text-caption text-ink-tertiary">
              使用 USDC 钱包安全支付，确认后立即完成。
            </p>
          </aside>
        </div>
      )}
    </>
  );
}

function CartLine({ item }: { item: CartHydratedItem }) {
  const cart = useCart();
  return (
    <li className="flex items-center gap-4 rounded-2xl border border-border-subtle bg-surface-base p-4 shadow-e1">
      <span className="text-3xl leading-none" aria-hidden>
        {item.product.imageEmoji}
      </span>
      <div className="flex-1">
        <p className="text-small font-semibold text-brand-ink">{item.product.shortName}</p>
        <p className="text-caption text-ink-tertiary">{item.product.sku}</p>
        <p className="mt-1 text-caption text-ink-secondary">{item.product.shortPitch}</p>
      </div>
      <div className="flex items-center gap-2">
        <button
          type="button"
          aria-label="减少"
          onClick={() => cart.setQty(item.productId, item.qty - 1)}
          className="inline-flex h-7 w-7 items-center justify-center rounded-md border border-border-default text-ink-secondary hover:border-brand-primary/40 hover:text-brand-primary"
        >
          <Minus className="h-3 w-3" aria-hidden />
        </button>
        <span className="min-w-6 text-center text-small font-medium text-brand-ink">
          {item.qty}
        </span>
        <button
          type="button"
          aria-label="增加"
          onClick={() => cart.setQty(item.productId, item.qty + 1)}
          className="inline-flex h-7 w-7 items-center justify-center rounded-md border border-border-default text-ink-secondary hover:border-brand-primary/40 hover:text-brand-primary"
        >
          <Plus className="h-3 w-3" aria-hidden />
        </button>
      </div>
      <div className="w-24 text-right text-small font-semibold text-brand-ink">
        {formatJpy(item.product.priceJpy * item.qty)}
      </div>
    </li>
  );
}

function Row({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <dt className="text-ink-tertiary">{label}</dt>
      <dd className="text-right">
        <div className="font-medium text-brand-ink">{value}</div>
        {sub && <div className="text-caption text-ink-tertiary">{sub}</div>}
      </dd>
    </div>
  );
}

// ────────────────────────────────────────────────────────────────────
// processing
// ────────────────────────────────────────────────────────────────────
function ProcessingView() {
  return (
    <div className="mt-10 flex flex-col items-center justify-center gap-4 rounded-2xl border border-border-subtle bg-surface-base px-6 py-16 text-center shadow-e1">
      <Loader2 className="h-8 w-8 animate-spin text-brand-primary" aria-hidden />
      <div>
        <p className="text-body font-semibold text-brand-ink">正在确认你的支付…</p>
        <p className="mt-1 text-small text-ink-secondary">几秒钟，请稍候。</p>
      </div>
    </div>
  );
}

// ────────────────────────────────────────────────────────────────────
// success — clean order confirmation
// ────────────────────────────────────────────────────────────────────
function SuccessView({
  phase,
  onNewOrder,
}: {
  phase: Extract<Phase, { kind: "success" }>;
  onNewOrder: () => void;
}) {
  return (
    <div className="mt-8 space-y-5 animate-fade-up">
      <div className="rounded-2xl border border-semantic-success/35 bg-semantic-success/5 p-8 text-center">
        <div className="relative mx-auto flex h-16 w-16 items-center justify-center">
          <span className="animate-pulse-ring absolute inline-block h-16 w-16 rounded-full border-2 border-emerald-400/50" />
          <span className="relative inline-flex h-14 w-14 items-center justify-center rounded-full bg-gradient-to-br from-emerald-400 to-emerald-600 shadow-lg">
            <CheckCircle className="h-7 w-7 text-white" aria-hidden />
          </span>
        </div>
        <h3 className="mt-5 text-[20px] font-bold text-brand-ink">订单已确认，感谢你的购买</h3>
        <p className="mt-1.5 text-small text-ink-secondary">
          支付已完成，HABA 会尽快为你处理这笔订单。
        </p>

        <dl className="mx-auto mt-6 max-w-sm space-y-2 text-left text-small">
          <div className="flex items-baseline justify-between gap-3">
            <dt className="text-ink-tertiary">订单号</dt>
            <dd className="font-mono text-[12px] text-brand-ink">{phase.orderId}</dd>
          </div>
          <div className="flex items-baseline justify-between gap-3">
            <dt className="text-ink-tertiary">支付金额</dt>
            <dd className="font-semibold text-brand-ink">
              {formatJpy(phase.totalJpy)}
              <span className="ml-1 text-caption font-normal text-ink-tertiary">
                · {phase.amountUsdc.toFixed(2)} USDC
              </span>
            </dd>
          </div>
          <div className="flex items-baseline justify-between gap-3">
            <dt className="text-ink-tertiary">下单时间</dt>
            <dd className="text-brand-ink">{new Date(phase.placedAt).toLocaleString("zh-CN")}</dd>
          </div>
        </dl>
      </div>

      {phase.txHash && (
        <div className="rounded-2xl border border-brand-primary/20 bg-brand-primary/5 p-5">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div className="flex gap-3">
              <span className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-brand-primary/10 text-brand-primary">
                <ShieldCheck className="h-5 w-5" aria-hidden />
              </span>
              <div>
                <div className="flex flex-wrap items-center gap-2">
                  <h4 className="text-body font-semibold text-brand-ink">支付凭证</h4>
                  <span className="rounded-full border border-brand-primary/20 bg-surface-base px-2 py-0.5 text-caption font-medium text-brand-primary">
                    {phase.chainMode === "devnet" ? "Solana Devnet" : "Dev fallback"}
                  </span>
                  {phase.status && (
                    <span className="rounded-full bg-surface-muted px-2 py-0.5 text-caption text-ink-tertiary">
                      {phase.status}
                    </span>
                  )}
                </div>
                <p className="mt-2 break-all font-mono text-[12px] leading-5 text-ink-secondary">
                  {phase.txHash}
                </p>
              </div>
            </div>
            {phase.explorerUrl && (
              <a
                href={phase.explorerUrl}
                target="_blank"
                rel="noreferrer"
                className="inline-flex shrink-0 items-center gap-1.5 rounded-xl bg-brand-primary px-4 py-2 text-small font-semibold text-white hover:bg-brand-primary-hover"
              >
                Solana Explorer
                <ExternalLink className="h-3.5 w-3.5" aria-hidden />
              </a>
            )}
          </div>
        </div>
      )}

      <div className="flex flex-wrap justify-center gap-3">
        <Link
          href="/"
          className="rounded-xl bg-brand-primary px-5 py-2.5 text-small font-semibold text-white hover:bg-brand-primary-hover"
        >
          继续购物
        </Link>
        <button
          type="button"
          onClick={onNewOrder}
          className="rounded-xl border border-border-default bg-surface-base px-5 py-2.5 text-small font-medium text-ink-secondary hover:border-brand-primary/40 hover:text-brand-primary"
        >
          新建订单
        </button>
      </div>
    </div>
  );
}

// ────────────────────────────────────────────────────────────────────
// error
// ────────────────────────────────────────────────────────────────────
function ErrorView({ message, retry }: { message: string; retry: () => void }) {
  return (
    <div className="mt-10 rounded-2xl border border-semantic-danger/40 bg-semantic-danger/5 p-6">
      <div className="flex items-center gap-2 text-body font-semibold text-semantic-danger">
        <XCircle className="h-5 w-5" aria-hidden /> 结算失败
      </div>
      <p className="mt-2 break-words text-small text-ink-secondary">{message}</p>
      <button
        type="button"
        onClick={retry}
        className="mt-4 rounded-lg bg-brand-primary px-4 py-2 text-small font-semibold text-white hover:bg-brand-primary-hover"
      >
        回到购物车
      </button>
    </div>
  );
}
