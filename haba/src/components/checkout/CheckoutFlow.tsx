"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  ArrowRight,
  Clock,
  Loader2,
  Minus,
  Plus,
  ShoppingBag,
  XCircle,
} from "lucide-react";
import { useCart, type CartHydratedItem } from "@/lib/cart/store";
import { formatJpy } from "@/lib/utils";
import {
  loadSavedAddress,
  saveAddress,
  type ShippingAddress,
} from "@/lib/haba/checkout";
import { AddressStep } from "./AddressStep";
import { ConfirmStep } from "./ConfirmStep";
import { SuccessStep, type OrderConfirmation } from "./SuccessStep";

/** Persisted across page refreshes in localStorage (24-h TTL) */
const STORAGE_KEY = "haba_last_order";
const ORDER_TTL_MS = 24 * 60 * 60 * 1000;

type Phase =
  | { kind: "cart" }
  | { kind: "address" }
  | { kind: "confirm"; address: ShippingAddress }
  | { kind: "processing"; address: ShippingAddress }
  | ({ kind: "success" } & OrderConfirmation)
  | { kind: "error"; message: string };

function saveOrder(payload: OrderConfirmation) {
  try {
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({ ...payload, savedAt: new Date().toISOString() }),
    );
  } catch {
    /* storage full or SSR — ignore */
  }
}

function loadSavedOrder(): OrderConfirmation | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as OrderConfirmation & { savedAt: string };
    if (Date.now() - new Date(parsed.savedAt).getTime() > ORDER_TTL_MS) {
      localStorage.removeItem(STORAGE_KEY);
      return null;
    }
    if (!parsed.address || !parsed.address.recipient) {
      // Pre-address-flow saved orders are no longer renderable cleanly.
      localStorage.removeItem(STORAGE_KEY);
      return null;
    }
    return {
      orderId: parsed.orderId,
      paymentOrderId: parsed.paymentOrderId,
      amountUsdc: parsed.amountUsdc,
      totalJpy: parsed.totalJpy,
      placedAt: parsed.placedAt,
      address: parsed.address,
    };
  } catch {
    return null;
  }
}

export function CheckoutFlow() {
  const cart = useCart();
  const [phase, setPhase] = useState<Phase>({ kind: "cart" });
  const [savedOrder, setSavedOrder] = useState<OrderConfirmation | null>(null);
  const [savedAddress, setSavedAddress] = useState<ShippingAddress | null>(null);

  useEffect(() => {
    setSavedOrder(loadSavedOrder());
    setSavedAddress(loadSavedAddress());
  }, []);

  async function placeOrder(
    address: ShippingAddress,
    auth: { idempotencyKey: string; userVerification: string | null },
  ) {
    setPhase({ kind: "processing", address });
    try {
      const body = {
        items: cart.items.map((it) => ({ productId: it.productId, qty: it.qty })),
        idempotencyKey: auth.idempotencyKey,
        userVerification: auth.userVerification,
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
      const order: OrderConfirmation = {
        orderId: j.order_id,
        paymentOrderId: j.payment_order_id,
        amountUsdc: j.amount_usdc,
        totalJpy: j.total_jpy,
        placedAt: j.placed_at,
        address,
      };
      saveAddress(address);
      saveOrder(order);
      setSavedOrder(order);
      setSavedAddress(address);
      setPhase({ kind: "success", ...order });
      cart.clear();
    } catch (e) {
      setPhase({
        kind: "error",
        message: e instanceof Error ? e.message : "网络异常",
      });
    }
  }

  if (phase.kind === "cart") {
    return (
      <CartView
        onCheckout={() => setPhase({ kind: "address" })}
        savedOrder={savedOrder}
        onViewSaved={() =>
          savedOrder && setPhase({ kind: "success", ...savedOrder })
        }
        onDismissSaved={() => {
          localStorage.removeItem(STORAGE_KEY);
          setSavedOrder(null);
        }}
      />
    );
  }
  if (phase.kind === "address") {
    return (
      <AddressStep
        initial={savedAddress}
        onBack={() => setPhase({ kind: "cart" })}
        onNext={(address) => {
          saveAddress(address);
          setSavedAddress(address);
          setPhase({ kind: "confirm", address });
        }}
      />
    );
  }
  if (phase.kind === "confirm") {
    return (
      <ConfirmStep
        address={phase.address}
        onBack={() => setPhase({ kind: "address" })}
        onConfirmed={(auth) => void placeOrder(phase.address, auth)}
      />
    );
  }
  if (phase.kind === "processing") {
    return <ProcessingView />;
  }
  if (phase.kind === "success") {
    return (
      <SuccessStep
        order={phase}
        onNewOrder={() => setPhase({ kind: "cart" })}
      />
    );
  }
  return (
    <ErrorView
      message={phase.message}
      retry={() => setPhase({ kind: "cart" })}
    />
  );
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
  savedOrder: OrderConfirmation | null;
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
              <span className="ml-1 font-mono text-caption text-ink-secondary">
                {savedOrder.orderId}
              </span>
              <span className="ml-1 text-ink-tertiary">
                · {new Date(savedOrder.placedAt).toLocaleString("zh-CN")}
              </span>
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
        <div className="mt-10 rounded-2xl border border-dashed border-border-default bg-surface-elevated p-12 text-center">
          <ShoppingBag className="mx-auto h-10 w-10 text-ink-tertiary" aria-hidden />
          <h3 className="mt-4 font-serif text-[20px] font-normal text-ink-primary">购物车暂无商品</h3>
          <p className="mt-2 font-sans text-small text-ink-secondary">
            回到首页,让 HABA 顾问帮你挑几款 MARVIE 商品。
          </p>
          <Link
            href="/"
            className="mt-5 inline-flex items-center gap-1.5 rounded-xl bg-brand-primary px-5 py-2.5 font-sans text-small font-semibold text-white shadow-e1 hover:bg-brand-primary-hover"
          >
            去和顾问聊聊
          </Link>
        </div>
      ) : (
        <div className="mt-8 grid grid-cols-1 gap-6 lg:grid-cols-3">
          <ul className="space-y-3 lg:col-span-2">
            {cart.items.map((item) => (
              <CartLine key={item.productId} item={item} />
            ))}
          </ul>
          <aside className="rounded-2xl border border-border-subtle bg-surface-elevated p-6 shadow-e1 lg:sticky lg:top-24 lg:h-fit">
            <h3 className="font-sans text-[15px] font-semibold text-ink-primary">订单摘要</h3>
            <dl className="mt-4 space-y-2 font-sans text-small">
              <Row label="件数" value={`${cart.totalItems} 件`} />
              <Row label="合计" value={formatJpy(cart.totalJpy)} />
            </dl>
            <button
              type="button"
              onClick={onCheckout}
              className="mt-6 inline-flex w-full items-center justify-center gap-2 rounded-xl bg-brand-primary px-4 py-3 font-sans text-small font-semibold text-white shadow-e1 transition-all duration-200 hover:bg-brand-primary-hover hover:shadow-e2"
            >
              填写送货地址
              <ArrowRight className="h-4 w-4" aria-hidden />
            </button>
            <p className="mt-3 font-sans text-[11px] text-ink-tertiary">
              下一步用 Touch ID 确认支付 —— 无需输入密码。
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
    <li className="flex items-center gap-4 rounded-2xl border border-border-subtle bg-surface-elevated p-4 shadow-e1">
      {/* Warm tint tile instead of emoji */}
      <span
        aria-hidden
        className="inline-flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-surface-deep border border-border-subtle font-serif text-[11px] text-brand-primary/50"
      >
        M
      </span>
      <div className="flex-1 min-w-0">
        <p className="font-sans text-small font-semibold text-ink-primary truncate">
          {item.product.shortName}
        </p>
        <p className="font-sans text-caption text-ink-tertiary">{item.product.sku}</p>
      </div>
      <div className="flex items-center gap-1.5">
        <button
          type="button"
          aria-label="减少"
          onClick={() => cart.setQty(item.productId, item.qty - 1)}
          className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-border-default text-ink-secondary transition-colors hover:border-brand-primary/40 hover:text-brand-primary"
        >
          <Minus className="h-3.5 w-3.5" aria-hidden />
        </button>
        <span className="min-w-7 text-center font-sans text-small font-medium tabular-nums text-ink-primary">
          {item.qty}
        </span>
        <button
          type="button"
          aria-label="增加"
          onClick={() => cart.setQty(item.productId, item.qty + 1)}
          className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-border-default text-ink-secondary transition-colors hover:border-brand-primary/40 hover:text-brand-primary"
        >
          <Plus className="h-3.5 w-3.5" aria-hidden />
        </button>
      </div>
      <div className="w-20 text-right font-sans text-small font-semibold tabular-nums text-ink-primary">
        {formatJpy(item.product.priceJpy * item.qty)}
      </div>
    </li>
  );
}

function Row({
  label,
  value,
  sub,
}: {
  label: string;
  value: string;
  sub?: string;
}) {
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

function ProcessingView() {
  return (
    <div className="mt-10 flex flex-col items-center justify-center gap-4 rounded-2xl border border-border-subtle bg-surface-base px-6 py-16 text-center shadow-e1">
      <Loader2 className="h-8 w-8 animate-spin text-brand-primary" aria-hidden />
      <div>
        <p className="text-body font-semibold text-brand-ink">指纹通过 · 正在安全处理支付…</p>
        <p className="mt-1 text-small text-ink-secondary">几秒钟,请稍候。</p>
      </div>
    </div>
  );
}

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
