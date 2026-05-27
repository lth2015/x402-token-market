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
// success state — dramatic Solana proof view (devnet) + clean dev fallback
// ────────────────────────────────────────────────────────────────────
function SuccessView({
  phase,
  onNewOrder,
}: {
  phase: Extract<Phase, { kind: "success" }>;
  onNewOrder: () => void;
}) {
  const isRealChain = phase.chainMode === "devnet";

  if (isRealChain) {
    return <DevnetSuccessView phase={phase} onNewOrder={onNewOrder} />;
  }
  return <DevSuccessView phase={phase} onNewOrder={onNewOrder} />;
}

/** Full-drama Devnet success — used when a real Solana tx was confirmed */
function DevnetSuccessView({
  phase,
  onNewOrder,
}: {
  phase: Extract<Phase, { kind: "success" }>;
  onNewOrder: () => void;
}) {
  return (
    <div className="mt-8 space-y-5 animate-fade-up">

      {/* ── TOP BANNER ─────────────────────────────────────── */}
      <div className="overflow-hidden rounded-2xl border border-emerald-500/30 bg-gradient-to-br from-emerald-50/80 via-white to-emerald-50/40 p-6 shadow-e2">

        {/* Confirmation header */}
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          {/* Left: animated checkmark */}
          <div className="flex items-center gap-4">
            <div className="relative flex h-14 w-14 shrink-0 items-center justify-center">
              {/* Pulse ring */}
              <span className="animate-pulse-ring absolute inline-block h-14 w-14 rounded-full border-2 border-emerald-400/50" />
              <span className="relative inline-flex h-12 w-12 items-center justify-center rounded-full bg-gradient-to-br from-emerald-400 to-emerald-600 shadow-lg">
                <CheckCircle className="h-6 w-6 text-white" aria-hidden />
              </span>
            </div>
            <div>
              <p className="text-[18px] font-bold text-emerald-700">订单已确认</p>
              <p className="mt-0.5 text-small text-ink-secondary">
                真实 SPL USDC 交易 · Solana Devnet
              </p>
            </div>
          </div>

          {/* Right: chain badge */}
          <div className="flex flex-col items-start gap-1.5 sm:items-end">
            <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-500/30 bg-emerald-500/10 px-3 py-1.5 text-[10px] font-bold uppercase tracking-[0.15em] text-emerald-700">
              <Link2 className="h-3 w-3" aria-hidden />
              真实链上交易
            </span>
            <span className="text-[10px] text-ink-tertiary">Devnet · 非真实资金</span>
          </div>
        </div>

        {/* Amount highlight */}
        <div className="mt-5 rounded-xl border border-emerald-500/15 bg-white/60 px-5 py-4">
          <div className="flex items-baseline gap-3">
            <span className="text-[28px] font-extrabold tabular-nums text-brand-ink">
              {phase.amountUsdc.toFixed(4)}
            </span>
            <span className="text-[15px] font-semibold text-emerald-600">USDC</span>
            <span className="ml-1 text-small text-ink-tertiary">
              ≈ {formatJpy(phase.totalJpy)}
            </span>
          </div>
          <p className="mt-1 text-[11px] text-ink-tertiary">
            结算时间：{new Date(phase.placedAt).toLocaleString("zh-CN")}
          </p>
        </div>
      </div>

      {/* ── CHAIN PROOF CARD (dark) ─────────────────────── */}
      <div className="overflow-hidden rounded-2xl border border-brand-ink/15 bg-brand-ink shadow-e2">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-white/8 px-5 py-3.5">
          <div className="flex items-center gap-2">
            <span className="animate-breathe inline-block h-1.5 w-1.5 rounded-full bg-emerald-400" />
            <p className="text-[10px] font-bold uppercase tracking-[0.15em] text-white/50">
              链上确认证明 · Solana Devnet
            </p>
          </div>
          <span className="text-[10px] text-emerald-400/70">已广播</span>
        </div>

        {/* KV rows */}
        <div className="divide-y divide-white/5 px-5">
          <ChainKV label="订单号"   value={phase.orderId}        mono />
          <ChainKV label="支付订单" value={phase.paymentOrderId} mono />
          <ChainKV label="链上 Tx"  value={phase.txHash ?? "—"} mono highlight />
          <ChainKV label="结算链"   value="Solana Devnet" />
          <ChainKV label="协议"     value="SPL TransferChecked + x402" />
        </div>

        {/* Note */}
        <div className="px-5 py-3 text-[10px] text-white/25">
          Devnet USDC 为测试代币，非真实资金。tx_hash 可通过 Solana Explorer 独立验证。
        </div>
      </div>

      {/* ── CTA BUTTONS ────────────────────────────────── */}
      <div className="flex flex-wrap gap-3">
        {/* PRIMARY: Explorer link — most important for demo */}
        {phase.explorerUrl && (
          <a
            href={phase.explorerUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-2 rounded-xl bg-brand-ink px-5 py-3 text-small font-bold text-white shadow-e2 transition-all hover:scale-[1.02] hover:shadow-e3 active:scale-[0.98]"
          >
            <ExternalLink className="h-4 w-4" aria-hidden />
            在 Solana Explorer 验证
          </a>
        )}
        <Link
          href="/"
          className="inline-flex items-center gap-1.5 rounded-xl border border-border-default bg-surface-base px-5 py-3 text-small font-medium text-ink-secondary transition-colors hover:border-brand-primary/40 hover:text-brand-primary"
        >
          继续购物
        </Link>
        <button
          type="button"
          onClick={onNewOrder}
          className="inline-flex items-center gap-1.5 rounded-xl border border-border-default bg-surface-base px-5 py-3 text-small font-medium text-ink-secondary transition-colors hover:border-brand-primary/40 hover:text-brand-primary"
        >
          新建订单
        </button>
        <Link
          href="/topup"
          className="inline-flex items-center gap-1.5 rounded-xl border border-border-default bg-surface-base px-5 py-3 text-small font-medium text-ink-secondary transition-colors hover:border-brand-primary/40 hover:text-brand-primary"
        >
          看 Token 充值流程
        </Link>
      </div>
    </div>
  );
}

/** Chain KV row inside the dark proof card */
function ChainKV({
  label, value, mono, highlight,
}: {
  label: string; value: string; mono?: boolean; highlight?: boolean;
}) {
  return (
    <div className="flex items-start gap-3 py-2.5">
      <dt className="w-20 shrink-0 text-[10px] uppercase tracking-wider text-white/30">{label}</dt>
      <dd className="min-w-0 flex-1">
        <span
          className={
            highlight
              ? "block truncate font-mono text-[11px] font-semibold text-emerald-300"
              : mono
              ? "block truncate font-mono text-[11px] text-white/60"
              : "text-[12px] text-white/60"
          }
        >
          {value}
        </span>
      </dd>
    </div>
  );
}

/** Dev mode success — clean, no chain drama */
function DevSuccessView({
  phase,
  onNewOrder,
}: {
  phase: Extract<Phase, { kind: "success" }>;
  onNewOrder: () => void;
}) {
  return (
    <div className="mt-8 space-y-5 animate-fade-up">
      <div className="rounded-2xl border border-semantic-success/35 bg-semantic-success/4 p-6">
        <div className="flex items-center gap-3">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-semantic-success/15">
            <CheckCircle className="h-5 w-5 text-semantic-success" aria-hidden />
          </span>
          <div>
            <p className="text-[15px] font-bold text-semantic-success">订单已确认</p>
            <p className="text-small text-ink-secondary">DEV 演示模式 · admin-confirm</p>
          </div>
        </div>

        <dl className="mt-5 grid grid-cols-1 gap-2 text-caption sm:grid-cols-2">
          <KV label="订单号"   value={phase.orderId}        mono />
          <KV label="支付订单" value={phase.paymentOrderId} mono />
          <KV label="链上 tx"  value={phase.txHash ?? "—"} mono />
          <KV label="金额"     value={`${phase.amountUsdc.toFixed(4)} USDC · ${formatJpy(phase.totalJpy)}`} />
          <KV label="下单时间" value={new Date(phase.placedAt).toLocaleString("zh-CN")} />
        </dl>

        <p className="mt-4 rounded-lg bg-surface-muted/60 px-3 py-2 text-caption text-ink-tertiary">
          DEV 模式：admin-confirm 直接返回模拟 tx_hash，无链上广播。
          配置 DEMO_PAYER_PRIVATE_KEY_B64 后可升级为真实 Devnet 链上交易。
        </p>
      </div>

      <div className="flex flex-wrap gap-3">
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
        <Link
          href="/topup"
          className="rounded-xl border border-border-default bg-surface-base px-5 py-2.5 text-small font-medium text-ink-secondary hover:border-brand-primary/40 hover:text-brand-primary"
        >
          看 Token 充值流程
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
