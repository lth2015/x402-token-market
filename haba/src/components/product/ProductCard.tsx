import type { MarvieProduct } from "@/lib/haba";
import { cn, formatJpy } from "@/lib/utils";
import { DemoBadge } from "@/components/shared/DemoBadge";
import { AddToCartButton } from "@/components/cart/AddToCartButton";

/**
 * Category → gradient background tokens for the product image tile.
 * Keeps styling self-contained without touching tailwind.config.ts.
 */
const CATEGORY_STYLE: Record<string, { bg: string; ring: string }> = {
  sweetener_liquid: {
    bg: "bg-gradient-to-br from-sky-50 to-cyan-100",
    ring: "ring-1 ring-cyan-200",
  },
  sweetener_powder: {
    bg: "bg-gradient-to-br from-amber-50 to-yellow-100",
    ring: "ring-1 ring-yellow-200",
  },
  cooking_aid: {
    bg: "bg-gradient-to-br from-orange-50 to-amber-100",
    ring: "ring-1 ring-orange-200",
  },
  jam: {
    bg: "bg-gradient-to-br from-rose-50 to-pink-100",
    ring: "ring-1 ring-rose-200",
  },
  candy: {
    bg: "bg-gradient-to-br from-violet-50 to-purple-100",
    ring: "ring-1 ring-violet-200",
  },
};

const DEFAULT_STYLE = {
  bg: "bg-gradient-to-br from-slate-50 to-slate-100",
  ring: "ring-1 ring-slate-200",
};

/**
 * Standalone product card for the catalog grid (vs. the Agent-recommendation
 * variant which embeds reasons). Keep both shapes — they serve different
 * cognitive moments.
 */
export function ProductCard({ product, className }: { product: MarvieProduct; className?: string }) {
  const style = CATEGORY_STYLE[product.category] ?? DEFAULT_STYLE;

  return (
    <article
      className={cn(
        "group flex flex-col overflow-hidden rounded-2xl border border-border-subtle bg-surface-base shadow-e1 transition-shadow hover:shadow-e2",
        className,
      )}
    >
      {/* ── Image tile — gradient + large emoji ───────────────── */}
      <div
        className={cn(
          "relative flex h-40 items-center justify-center",
          style.bg,
          style.ring,
        )}
      >
        <span className="text-6xl leading-none drop-shadow-sm" aria-hidden>
          {product.imageEmoji}
        </span>
        <div className="absolute right-3 top-3">
          <DemoBadge />
        </div>
      </div>

      {/* ── Card body ──────────────────────────────────────────── */}
      <div className="flex flex-1 flex-col p-5">
        <h3 className="text-body font-semibold text-brand-ink">{product.shortName}</h3>
        <p className="mt-0.5 text-caption text-ink-tertiary">{product.sku}</p>
        <p className="mt-2 text-small text-ink-secondary">{product.shortPitch}</p>

        {/* Nutrition stats */}
        <dl className="mt-4 grid grid-cols-2 gap-2 text-caption">
          <Datum
            label="卡路里"
            value={`${product.caloriesPerServing.value} ${product.caloriesPerServing.unit}`}
            sub={product.caloriesPerServing.servingLabel}
          />
          {product.sweetnessRatioToSugar !== undefined && (
            <Datum
              label="甜度"
              value={`${product.sweetnessRatioToSugar}× 砂糖`}
              sub={product.sweetnessRatioToSugar >= 100 ? "强（一两滴定甜）" : "近似砂糖（1:1）"}
            />
          )}
        </dl>

        {/* Tags */}
        <div className="mt-3 flex flex-wrap gap-1">
          {product.tags.slice(0, 4).map((t) => (
            <span
              key={t}
              className="rounded bg-surface-muted px-1.5 py-0.5 text-[10px] text-ink-tertiary"
            >
              {t}
            </span>
          ))}
        </div>

        {/* Price + CTA — pushed to bottom */}
        <div className="mt-auto pt-4">
          <div className="flex items-baseline justify-between border-t border-border-subtle pt-4">
            <span className="text-lg font-semibold text-brand-ink">{formatJpy(product.priceJpy)}</span>
            <span className="text-caption text-ink-tertiary">含税 · 演示价</span>
          </div>
          <div className="mt-3 flex justify-end">
            <AddToCartButton productId={product.id} />
          </div>
        </div>
      </div>
    </article>
  );
}

function Datum({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="rounded-lg bg-surface-muted/60 px-2.5 py-2">
      <dt className="text-[10px] uppercase tracking-wider text-ink-tertiary">{label}</dt>
      <dd className="mt-0.5 text-small font-medium text-brand-ink">{value}</dd>
      {sub && <dd className="text-[10px] text-ink-tertiary">{sub}</dd>}
    </div>
  );
}
