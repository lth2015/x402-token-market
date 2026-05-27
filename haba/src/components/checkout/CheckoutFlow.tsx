"use client";

import { useState } from "react";
import Link from "next/link";
import {
  CheckCircle,
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

type Phase =
  | { kind: "cart" }
  | { kind: "processing" }
  | {
      kind: "success";
      orderId: string;
      paymentOrderId: string;
      txHash: string | null;
      amountUsdc: number;
      totalJpy: number;
      placedAt: string;
    }
  | { kind: "error"; message: string };

export function CheckoutFlow() {
  const cart = useCart();
  const [phase, setPhase] = useState<Phase>({ kind: "cart" });

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
      setPhase({
        kind: "success",
        orderId: j.order_id,
        paymentOrderId: j.payment_order_id,
        txHash: j.tx_hash,
        amountUsdc: j.amount_usdc,
        totalJpy: j.total_jpy,
        placedAt: j.placed_at,
      });
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

  if (phase.kind === "cart") return <CartView onCheckout={placeOrder} />;
  if (phase.kind === "processing") return <ProcessingView />;
  if (phase.kind === "success") return <SuccessView phase={phase} />;
  return <ErrorView message={phase.message} retry={() => setPhase({ kind: "cart" })} />;
}

// ────────────────────────────────────────────────────────────────────
// cart state
// ────────────────────────────────────────────────────────────────────
function CartView({ onCheckout }: { onCheckout: () => void }) {
  const cart = useCart();
  if (cart.items.length === 0) {
    return (
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
    );
  }

  return (
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
        <span>正在请求 USDC 钱包签名 + 链上确认…</span>
      </div>
      <X402TopupSteps
        steps={x402CheckoutSteps}
        title="USDC 钱包结账 · 8 步链上结算"
        subtitle="动画自动推进；同时后台正在跑真实的 token-purchase + admin-confirm"
        intervalMs={1100}
      />
    </div>
  );
}

// ────────────────────────────────────────────────────────────────────
// success state — show real order ids + tx hash
// ────────────────────────────────────────────────────────────────────
function SuccessView({ phase }: { phase: Extract<Phase, { kind: "success" }> }) {
  return (
    <div className="mt-10 space-y-6">
      <div className="rounded-2xl border border-semantic-success/40 bg-semantic-success/5 p-6">
        <div className="flex items-center gap-2 text-body font-semibold text-semantic-success">
          <CheckCircle className="h-5 w-5" aria-hidden /> 订单已确认
        </div>
        <p className="mt-2 text-small text-ink-secondary">
          USDC 钱包签名 + 链上结算回调已就绪，HABA 收到你的订单并开始处理。
        </p>
        <dl className="mt-5 grid grid-cols-1 gap-2 text-caption sm:grid-cols-2">
          <KV label="订单号" value={phase.orderId} mono />
          <KV label="支付订单号" value={phase.paymentOrderId} mono />
          <KV label="链上 tx" value={phase.txHash ?? "—"} mono />
          <KV label="支付金额" value={`${phase.amountUsdc.toFixed(4)} USDC · ${formatJpy(phase.totalJpy)}`} />
          <KV label="下单时间" value={new Date(phase.placedAt).toLocaleString("zh-CN")} />
        </dl>
        <p className="mt-4 text-caption text-ink-tertiary">
          演示备注：DEV 模式下未广播到公链，admin-confirm 直接返回模拟的 tx_hash。HABA Token
          余额会作为本次结算的副作用上涨——生产环境中这一段走「消费者钱包 → HABA」的资金方向。
        </p>
      </div>
      <div className="flex flex-wrap gap-3">
        <Link
          href="/"
          className="rounded-lg bg-brand-primary px-4 py-2 text-small font-semibold text-white hover:bg-brand-primary-hover"
        >
          继续购物
        </Link>
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

function KV({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="flex items-baseline gap-2">
      <dt className="text-ink-tertiary">{label}</dt>
      <dd className={`flex-1 truncate text-brand-ink${mono ? " font-mono text-[11px]" : ""}`}>
        {value}
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
