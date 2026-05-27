"use client";

import Link from "next/link";
import { ShoppingBag } from "lucide-react";
import { useCart } from "@/lib/cart/store";
import { cn } from "@/lib/utils";

/**
 * Cart shortcut for HabaTopBar — shows current item count as a badge.
 * Client-side because cart total comes from a Context that touches
 * localStorage (not available during SSR).
 */
export function CartIconLink({ className }: { className?: string }) {
  const { totalItems } = useCart();
  const hasItems = totalItems > 0;
  return (
    <Link
      href="/cart"
      aria-label={`购物车${hasItems ? ` (${totalItems} 件)` : ""}`}
      className={cn(
        "relative inline-flex h-9 w-9 items-center justify-center rounded-full border transition-colors",
        hasItems
          ? "border-brand-primary/30 bg-brand-primary/5 text-brand-primary"
          : "border-border-subtle bg-surface-base text-ink-tertiary hover:text-brand-primary",
        className,
      )}
    >
      <ShoppingBag className="h-4 w-4" aria-hidden />
      {hasItems && (
        <span className="absolute -right-1 -top-1 inline-flex h-4 min-w-4 items-center justify-center rounded-full bg-brand-primary px-1 text-[10px] font-semibold text-white">
          {totalItems > 99 ? "99+" : totalItems}
        </span>
      )}
    </Link>
  );
}
