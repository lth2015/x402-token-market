"use client";

import type { MarvieProduct } from "@/lib/haba";
import { formatJpy } from "@/lib/utils";
import { AddToCartButton } from "@/components/cart/AddToCartButton";

export function ChatProductCard({ product }: { product: MarvieProduct }) {
  return (
    <li className="flex w-[280px] shrink-0 snap-start gap-3 rounded-2xl border border-border-subtle bg-surface-base p-4 shadow-e1 transition-shadow hover:shadow-e2">
      <span className="text-3xl leading-none shrink-0" aria-hidden>
        {product.imageEmoji}
      </span>
      <div className="min-w-0 flex-1">
        <p className="truncate text-small font-bold text-brand-ink">{product.shortName}</p>
        <p className="mt-1 line-clamp-2 text-caption leading-snug text-ink-tertiary">
          {product.shortPitch}
        </p>
        <div className="mt-3 flex items-center justify-between gap-2">
          <span className="text-body font-bold text-brand-ink">
            {formatJpy(product.priceJpy)}
          </span>
          <AddToCartButton productId={product.id} size="sm" />
        </div>
      </div>
    </li>
  );
}
