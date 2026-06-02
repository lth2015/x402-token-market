import type { MarvieProduct } from "@/lib/haba";
import { cn, formatJpy } from "@/lib/utils";
import { AddToCartButton } from "@/components/cart/AddToCartButton";

// Warm-tinted background per category — no cold blue/purple
const CATEGORY_STYLE: Record<string, { bg: string; border: string }> = {
  sweetener_liquid: {
    bg:     "bg-[#EEF4F0]",
    border: "border-[#C8DDD1]",
  },
  sweetener_powder: {
    bg:     "bg-[#F5F0E8]",
    border: "border-[#DDD3C0]",
  },
  cooking_aid: {
    bg:     "bg-[#F4EDE5]",
    border: "border-[#DACFC0]",
  },
  jam: {
    bg:     "bg-[#F4EDEA]",
    border: "border-[#DACAC4]",
  },
  candy: {
    bg:     "bg-[#EEF0F4]",
    border: "border-[#C8CEDB]",
  },
};

const DEFAULT_STYLE = {
  bg:     "bg-surface-deep",
  border: "border-border-subtle",
};

// Thin category SVG — consistent with ChatProductCard aesthetic
function CategoryIcon({ category }: { category: string }) {
  const cls = "h-16 w-16 text-brand-primary/30";
  const base = "fill-none stroke-current strokeWidth-[1.2] strokeLinecap-round";
  void base; // used in SVG directly

  if (category.startsWith("sweetener")) {
    return (
      <svg aria-hidden viewBox="0 0 48 48" fill="none" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" className={cls}>
        <path d="M14 38C14 30 18 16 24 12C30 8 38 18 36 28C34 38 22 40 14 38Z" />
        <path d="M24 12L24 6 M18 15L14 10 M30 15L34 10" />
        <path d="M19 28C19 28 21 31 24 28C27 25 29 28 29 28" />
      </svg>
    );
  }
  if (category === "jam") {
    return (
      <svg aria-hidden viewBox="0 0 48 48" fill="none" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" className={cls}>
        <path d="M15 40L15 20C15 14 33 14 33 20L33 40C33 41 15 41 15 40Z" />
        <path d="M12 20L36 20" />
        <path d="M19 14L19 10L29 10L29 14" />
        <path d="M20 30C20 30 24 33 28 30" />
      </svg>
    );
  }
  if (category === "candy") {
    return (
      <svg aria-hidden viewBox="0 0 48 48" fill="none" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" className={cls}>
        <circle cx="24" cy="24" r="10" />
        <path d="M24 14L24 8 M34 24L40 24 M24 34L24 40 M14 24L8 24" />
        <path d="M20 24C20 21.8 21.8 20 24 20C26.2 20 28 21.8 28 24" />
      </svg>
    );
  }
  // Default — leaf
  return (
    <svg aria-hidden viewBox="0 0 48 48" fill="none" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" className={cls}>
      <path d="M24 40C24 28 18 18 10 12C20 8 38 12 38 28C38 36 31 40 24 40Z" />
      <path d="M24 40L24 32 M24 32C24 32 16 24 12 18" />
    </svg>
  );
}

export function ProductCard({ product, className }: { product: MarvieProduct; className?: string }) {
  const style = CATEGORY_STYLE[product.category] ?? DEFAULT_STYLE;

  return (
    <article
      className={cn(
        "group flex flex-col overflow-hidden rounded-2xl",
        "border border-border-subtle bg-surface-elevated shadow-e1",
        "transition-all duration-300 hover:-translate-y-1 hover:shadow-e3 hover:border-brand-border",
        className,
      )}
    >
      {/* Image tile — warm gradient, centered SVG mark */}
      <div
        className={cn(
          "relative flex h-44 items-center justify-center overflow-hidden",
          "border-b border-border-subtle",
          style.bg,
        )}
      >
        <CategoryIcon category={product.category} />
      </div>

      {/* Card body */}
      <div className="flex flex-1 flex-col p-5">
        <h3 className="font-sans text-[16px] font-semibold leading-snug text-ink-primary">
          {product.shortName}
        </h3>
        <p className="mt-1 font-sans text-[11px] uppercase tracking-wider text-ink-tertiary">
          {product.sku}
        </p>
        <p className="mt-3 font-sans text-small leading-relaxed text-ink-secondary">
          {product.shortPitch}
        </p>

        {/* Nutrition stats */}
        <dl className="mt-4 grid grid-cols-2 gap-2 text-caption">
          <Datum
            label="カロリー"
            value={`${product.caloriesPerServing.value} ${product.caloriesPerServing.unit}`}
            sub={product.caloriesPerServing.servingLabel}
          />
          {product.sweetnessRatioToSugar !== undefined && (
            <Datum
              label="甜度"
              value={`${product.sweetnessRatioToSugar}× 砂糖`}
              sub={product.sweetnessRatioToSugar >= 100 ? "强效" : "近似砂糖"}
            />
          )}
        </dl>

        {/* Tags */}
        <div className="mt-4 flex flex-wrap gap-1.5">
          {product.tags.slice(0, 4).map((tag) => (
            <span
              key={tag}
              className="rounded-md bg-surface-muted px-2 py-0.5 font-sans text-[11px] text-ink-tertiary"
            >
              {tag}
            </span>
          ))}
        </div>

        {/* Price + CTA — pushed to bottom */}
        <div className="mt-auto pt-4">
          <div className="flex items-baseline justify-between border-t border-border-subtle pt-4">
            <span className="font-sans text-[22px] font-semibold tabular-nums text-ink-primary">
              {formatJpy(product.priceJpy)}
            </span>
            <span className="font-sans text-small text-ink-tertiary">含税</span>
          </div>
          <div className="mt-3.5 flex justify-end">
            <AddToCartButton productId={product.id} size="md" />
          </div>
        </div>
      </div>
    </article>
  );
}

function Datum({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="rounded-lg bg-surface-muted/70 px-3 py-2">
      <dt className="font-sans text-[10px] uppercase tracking-wider text-ink-tertiary">{label}</dt>
      <dd className="mt-1 font-sans text-small font-semibold text-ink-primary">{value}</dd>
      {sub && <dd className="font-sans text-[10px] leading-snug text-ink-tertiary">{sub}</dd>}
    </div>
  );
}
