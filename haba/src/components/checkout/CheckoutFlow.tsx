"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  CheckCircle,
  Clock,
  ExternalLink,
  Link2,
  Loader2,
  Minus,
  Plus,
  ShoppingBag,
  Wallet,
  XCircle,
} from "lucide-react";
import { useCart, type CartHydratedItem } from "@/lib/cart/store";
import { formatJpy } from "@/lib/utils";
import { X402TopupSteps } from "@/components/payment/X402TopupSteps";
import { x402CheckoutSteps } from "@/lib/haba";

/** Persisted across page refreshes in localStorage */
const STORAGE_KEY = "haba_last_order";
const ORDER_TTL_MS = 24 * 60 * 60 * 1000; // 24 h

type ChainMode = "devnet" | "dev";

type SuccessPayload = {
  orderId: string;
  paymentOrderId: string;
  txHash: string | null;
  amountUsdc: number;
  totalJpy: number;
  placedAt: string;
  /** "devnet" = real Solana Devnet tx · "dev" = admin-confirm mock */
  chainMode: ChainMode;
  /** Only present when chainMode === "devnet" */
  explorerUrl?: string;
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
    // Expire after 24 h
    if (Date.now() - new Date(parsed.savedAt).getTime() > ORDER_TTL_MS) {
      localStorage.removeItem(STORAGE_KEY);
      return null;
    }
    return parsed;
  } catch { return null; }
}

export function CheckoutFlow() {
  const cart = useCart();
  const [phase, setPhase] = useState<Phase>({ kind: "cart" });
  const [savedOrder, setSavedOrder] = useState<SuccessPayload | null>(null);

  // Restore last order from localStorage on mount (24-h TTL)
  useEffect(() => {
    const order = loadSavedOrder();
    if (order) setSavedOrder(order);
  }, []);

  async function placeOrder() {
    setPhase({ kind: "processing" });
    try {
      const body = {
        items: cart.items.map((it) => ({ productId: it.productId, qty: it.qty })),
        totalUsdc: cart.totalUsdc,
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
        txHash: j.tx_hash,
        amountUsdc: j.amount_usdc,
        totalJpy: j.total_jpy,
        placedAt: j.placed_at,
        chainMode: (j.chain_mode as ChainMode | undefined) ?? "dev",
        explorerUrl: typeof j.explorer_url === "string" ? j.explorer_url : undefined,
      };
      setPhase({ kind: "success", ...successPayload });
      // Persist for 24 h so the user can return to the page after a refresh
      saveOrder(successPayload);
      setSavedOrder(successPayload);
      // Empty the cart on confirmation; refresh the TopBar Token pill so
      // anyone watching it sees the credit land.
      cart.clear();
      window.dispatchEvent(new CustomEvent("haba:balance-refresh"));
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
    <SuccessView
      phase={phase}
      onNewOrder={() => setPhase({ kind: "cart" })}
    />
  );
  return <ErrorView message={phase.message} retry={() => setPhase({ kind: "cart" })} />;
}

// ────────────────────────────────────────────────────────────────────
// cart state
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
      {/* Saved order banner — shown when a recent order exists and cart is open */}
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
                label="折合 USDC"
                value={`${cart.totalUsdc.toFixed(4)} USDC`}
                sub="1 USDC ≈ 150 JPY (demo)"
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
              DEV 演示模式：会真发起链上结算请求，几秒内返回 tx hash。
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
// processing state — animation runs in parallel with the API call
// ────────────────────────────────────────────────────────────────────
function ProcessingView() {
  return (
    <div className="mt-10 space-y-6">
      <div className="flex items-center gap-3 rounded-2xl border border-brand-primary/30 bg-brand-primary/5 px-5 py-4 text-small text-brand-primary">
        <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
        <span>正在构建 SPL 交易 + 广播到 Solana Devnet…</span>
      </div>
      <X402TopupSteps
        steps={x402CheckoutSteps}
        title="USDC 结账 · 8 步链上结算"
        subtitle="动画同步推进；后台正在广播真实 Devnet USDC 交易并等待链上确认"
        intervalMs={1100}
      />
    </div>
  );
}

// ────────────────────────────────────────────────────────────────────
// success state — show real order ids + tx hash + optional explorer link
// ────────────────────────────────────────────────────────────────────
function SuccessView({
  phase,
  onNewOrder,
}: {
  phase: Extract<Phase, { kind: "success" }>;
  onNewOrder: () => void;
}) {
  const isRealChain = phase.chainMode === "devnet";

  return (
    <div className="mt-10 space-y-6">
      <div className="rounded-2xl border border-semantic-success/40 bg-semantic-success/5 p-6">

        {/* Header */}
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2 text-body font-semibold text-semantic-success">
            <CheckCircle className="h-5 w-5" aria-hidden /> 订单已确认
          </div>
          {isRealChain && (
            <span className="inline-flex items-center gap-1 rounded-full border border-emerald-500/30 bg-emerald-500/10 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wider text-emerald-600">
              <Link2 className="h-3 w-3" aria-hidden />
              真实 Devnet 链上交易
            </span>
          )}
        </div>

        <p className="mt-2 text-small text-ink-secondary">
          {isRealChain
            ? "已广播真实 SPL USDC 交易至 Solana Devnet，链上确认后 HABA Token 余额自动入账。"
            : "USDC 结算回调已就绪，HABA 收到你的订单并开始处理。"}
        </p>

        {/* KV grid */}
        <dl className="mt-5 grid grid-cols-1 gap-2 text-caption sm:grid-cols-2">
          <KV label="订单号" value={phase.orderId} mono />
          <KV label="支付订单号" value={phase.paymentOrderId} mono />
          <KV
            label="链上 tx"
            value={phase.txHash ?? "—"}
            mono
            badge={isRealChain ? "Devnet" : undefined}
          />
          <KV label="支付金额" value={`${phase.amountUsdc.toFixed(4)} USDC · ${formatJpy(phase.totalJpy)}`} />
          <KV label="下单时间" value={new Date(phase.placedAt).toLocaleString("zh-CN")} />
        </dl>

        {/* Demo note */}
        <p className="mt-4 text-caption text-ink-tertiary">
          {isRealChain
            ? "演示备注：使用 Devnet USDC (非真实资金)。tx_hash 可在 Solana Explorer 验证。HABA Token 余额在确认后上涨。"
            : "演示备注：DEV 模式下 admin-confirm 直接返回模拟的 tx_hash，无链上广播。HABA Token 余额作为副作用上涨。"}
        </p>
      </div>

      {/* CTA buttons */}
      <div className="flex flex-wrap gap-3">
        <Link
          href="/"
          className="rounded-lg bg-brand-primary px-4 py-2 text-small font-semibold text-white hover:bg-brand-primary-hover"
        >
          继续购物
        </Link>
        <button
          type="button"
          onClick={onNewOrder}
          className="rounded-lg border border-border-default bg-surface-base px-4 py-2 text-small font-medium text-ink-secondary hover:border-brand-primary/40 hover:text-brand-primary"
        >
          新建订单
        </button>
        {/* Solana Explorer link — only when a real tx exists */}
        {isRealChain && phase.explorerUrl && (
          <a
            href={phase.explorerUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 rounded-lg border border-emerald-500/40 bg-emerald-500/5 px-4 py-2 text-small font-medium text-emerald-600 transition-colors hover:bg-emerald-500/10"
          >
            <ExternalLink className="h-3.5 w-3.5" aria-hidden />
            在 Solana Explorer 查看
          </a>
        )}
        <Link
          href="/topup"
          className="rounded-lg border border-border-default bg-surface-base px-4 py-2 text-small font-medium text-ink-secondary hover:border-brand-primary/40 hover:text-brand-primary"
        >
          看 AI Token 充值流程
        </Link>
      </div>
    </div>
  );
}

function KV({
  label, value, mono, badge,
}: {
  label: string; value: string; mono?: boolean; badge?: string;
}) {
  return (
    <div className="flex items-baseline gap-2">
      <dt className="text-ink-tertiary">{label}</dt>
      <dd className="flex min-w-0 flex-1 items-center gap-1.5">
        <span className={`truncate text-brand-ink${mono ? " font-mono text-[11px]" : ""}`}>
          {value}
        </span>
        {badge && (
          <span className="shrink-0 rounded-full bg-emerald-500/10 px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wide text-emerald-600">
            {badge}
          </span>
        )}
      </dd>
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
