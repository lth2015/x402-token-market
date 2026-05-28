"use client";

import { useState } from "react";
import Link from "next/link";
import { ArrowRight, Plus, Check } from "lucide-react";
import { useCart } from "@/lib/cart/store";
import type { MarvieProduct } from "@/lib/haba";
import { cn } from "@/lib/utils";

/**
 * Adds a single MarvieProduct to the cart and keeps the checkout shortcut
 * visible long enough for a natural next click.
 */
export function AddToCartButton({
  productId,
  size = "sm",
  className,
}: {
  productId: MarvieProduct["id"];
  size?: "sm" | "md";
  className?: string;
}) {
  const { addItem } = useCart();
  const [justAdded, setJustAdded] = useState(false);

  function go() {
    addItem(productId);
    setJustAdded(true);
    setTimeout(() => setJustAdded(false), 5000);
  }

  return (
    <div className={cn("inline-flex flex-wrap items-center gap-2", className)}>
      <button
        type="button"
        onClick={go}
        aria-label={justAdded ? "已加入购物车" : "加入购物车"}
        className={cn(
          "inline-flex items-center gap-2 whitespace-nowrap rounded-xl border font-semibold transition-colors",
          size === "sm" ? "px-3.5 py-2 text-small" : "px-4 py-2.5 text-body",
          justAdded
            ? "border-semantic-success/40 bg-semantic-success/10 text-semantic-success"
            : "border-brand-primary/40 bg-brand-primary/8 text-brand-primary hover:bg-brand-primary hover:text-white",
        )}
      >
        {justAdded ? (
          <>
            <Check className="h-4 w-4" aria-hidden /> 已加入
          </>
        ) : (
          <>
            <Plus className="h-4 w-4" aria-hidden /> 加入购物车
          </>
        )}
      </button>

      {justAdded && (
        <Link
          href="/cart"
          className={cn(
            "inline-flex items-center gap-1.5 whitespace-nowrap rounded-xl bg-brand-primary font-semibold text-white shadow-e1 transition-colors hover:bg-brand-primary-hover",
            size === "sm" ? "px-3.5 py-2 text-small" : "px-4 py-2.5 text-body",
          )}
        >
          去结账
          <ArrowRight className="h-4 w-4" aria-hidden />
        </Link>
      )}
    </div>
  );
}

/**
 * Bulk variant — used by AgentChatDemo's "全部加入购物车" CTA. Adds every
 * recommended product in one click.
 */
export function AddAllToCartButton({
  productIds,
  label = "全部加入购物车",
  className,
}: {
  productIds: MarvieProduct["id"][];
  label?: string;
  className?: string;
}) {
  const { addItems } = useCart();
  const [justAdded, setJustAdded] = useState(false);

  function go() {
    addItems(productIds);
    setJustAdded(true);
    setTimeout(() => setJustAdded(false), 5000);
  }

  return (
    <div className={cn("inline-flex flex-wrap items-center gap-2", className)}>
      <button
        type="button"
        onClick={go}
        className={cn(
          "inline-flex items-center gap-2 whitespace-nowrap rounded-xl border px-5 py-3 text-body font-semibold transition-colors",
          justAdded
            ? "border-semantic-success/40 bg-semantic-success/10 text-semantic-success"
            : "border-transparent bg-brand-primary text-white hover:bg-brand-primary-hover",
        )}
      >
        {justAdded ? (
          <>
            <Check className="h-4 w-4" aria-hidden /> 已加入 ({productIds.length})
          </>
        ) : label}
      </button>
      {justAdded && (
        <Link
          href="/cart"
          className="inline-flex items-center gap-1.5 whitespace-nowrap rounded-xl border border-brand-primary/30 bg-surface-base px-5 py-3 text-body font-semibold text-brand-primary shadow-e1 hover:bg-brand-primary/8"
        >
          立即购买
          <ArrowRight className="h-4 w-4" aria-hidden />
        </Link>
      )}
    </div>
  );
}
