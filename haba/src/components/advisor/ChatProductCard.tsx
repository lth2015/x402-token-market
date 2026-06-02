"use client";

import type { MarvieProduct } from "@/lib/haba";
import { formatJpy } from "@/lib/utils";
import { AddToCartButton } from "@/components/cart/AddToCartButton";
import { cn } from "@/lib/utils";

// Minimal category mark — thin SVG icon per category type
function CategoryMark({ category, className }: { category: string; className?: string }) {
  const cls = cn("text-brand-primary/40", className);
  if (category.startsWith("sweetener")) {
    return (
      <svg aria-hidden viewBox="0 0 32 32" fill="none" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" className={cls}>
        <path d="M8 24 C8 20 10 10 16 8 C22 6 26 14 24 20 C22 26 14 26 8 24Z" />
        <path d="M16 8 L16 4 M12 10 L9 7 M20 10 L23 7" />
        <path d="M12 18 C12 18 14 20 16 18 C18 16 20 18 20 18" />
      </svg>
    );
  }
  if (category === "jam") {
    return (
      <svg aria-hidden viewBox="0 0 32 32" fill="none" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" className={cls}>
        <path d="M10 26 L10 14 C10 10 22 10 22 14 L22 26 C22 27 10 27 10 26Z" />
        <path d="M8 14 L24 14" />
        <path d="M13 10 L13 7 L19 7 L19 10" />
        <path d="M14 19 C14 19 16 21 18 19" />
      </svg>
    );
  }
  if (category === "candy") {
    return (
      <svg aria-hidden viewBox="0 0 32 32" fill="none" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" className={cls}>
        <circle cx="16" cy="16" r="7" />
        <path d="M16 9 L16 5 M23 16 L27 16 M16 23 L16 27 M9 16 L5 16" />
        <path d="M13 16 C13 14.3 14.3 13 16 13 C17.7 13 19 14.3 19 16" />
      </svg>
    );
  }
  // default — leaf / herb
  return (
    <svg aria-hidden viewBox="0 0 32 32" fill="none" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" className={cls}>
      <path d="M16 26 C16 18 12 12 8 8 C14 6 24 8 24 18 C24 24 20 26 16 26Z" />
      <path d="M16 26 L16 22 M16 22 C16 22 12 18 9 14" />
    </svg>
  );
}

export function ChatProductCard({ product }: { product: MarvieProduct }) {
  return (
    <li
      className={cn(
        "flex w-[260px] shrink-0 snap-start flex-col",
        "rounded-2xl border border-border-subtle bg-surface-elevated shadow-e1",
        "transition-all duration-200 hover:-translate-y-0.5 hover:shadow-e2 hover:border-brand-border",
      )}
    >
      {/* Image area — warm tinted, SVG mark centered */}
      <div className="flex h-[100px] items-center justify-center rounded-t-2xl bg-surface-deep">
        <CategoryMark category={product.category} className="h-14 w-14" />
      </div>

      {/* Content */}
      <div className="flex flex-1 flex-col p-4">
        <p className="font-sans text-[13px] font-semibold leading-snug text-ink-primary line-clamp-1">
          {product.shortName}
        </p>
        <p className="mt-1.5 font-sans text-[12px] leading-relaxed text-ink-tertiary line-clamp-2">
          {product.shortPitch}
        </p>

        {/* Price + CTA */}
        <div className="mt-3 flex items-center justify-between gap-2 pt-3 border-t border-border-subtle">
          <span className="font-sans text-[15px] font-semibold tabular-nums text-ink-primary">
            {formatJpy(product.priceJpy)}
          </span>
          <AddToCartButton productId={product.id} size="sm" />
        </div>
      </div>
    </li>
  );
}
