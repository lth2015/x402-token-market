"use client";

import { useState } from "react";
import { Plus, Check } from "lucide-react";
import { useCart } from "@/lib/cart/store";
import type { MarvieProduct } from "@/lib/haba";
import { cn } from "@/lib/utils";

/**
 * Adds a single MarvieProduct to the cart. Briefly flips to a "✓ added"
 * confirmation so the user gets feedback before the TopBar badge updates.
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
    setTimeout(() => setJustAdded(false), 1400);
  }

  return (
    <button
      type="button"
      onClick={go}
      aria-label={justAdded ? "已加入购物车" : "加入购物车"}
      className={cn(
        "inline-flex items-center gap-1 rounded-lg border font-medium transition-colors",
        size === "sm" ? "px-2.5 py-1 text-caption" : "px-3 py-1.5 text-small",
        justAdded
          ? "border-semantic-success/40 bg-semantic-success/10 text-semantic-success"
          : "border-brand-primary/40 bg-brand-primary/5 text-brand-primary hover:bg-brand-primary hover:text-white",
        className,
      )}
    >
      {justAdded ? (
        <>
          <Check className="h-3 w-3" aria-hidden /> 已加入
        </>
      ) : (
        <>
          <Plus className="h-3 w-3" aria-hidden /> 加入购物车
        </>
      )}
    </button>
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
    setTimeout(() => setJustAdded(false), 1400);
  }

  return (
    <button
      type="button"
      onClick={go}
      className={cn(
        "rounded-lg border px-3 py-2 text-small font-medium transition-colors",
        justAdded
          ? "border-semantic-success/40 bg-semantic-success/10 text-semantic-success"
          : "border-transparent bg-brand-primary text-white hover:bg-brand-primary-hover",
        className,
      )}
    >
      {justAdded ? `✓ 已加入 (${productIds.length})` : label}
    </button>
  );
}
