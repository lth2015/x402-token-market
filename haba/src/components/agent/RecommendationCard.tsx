import { Check } from "lucide-react";
import {
  getBundleById,
  getProductById,
  type Recommendation,
} from "@/lib/haba";
import { formatJpy } from "@/lib/utils";
import { AddToCartButton } from "@/components/cart/AddToCartButton";

/**
 * One recommended SKU — a compact, fixed-width card designed to sit in a
 * horizontal scroll row (see AgentChatDemo). Vertical layout: emoji + short
 * name + top reasons + price/add-to-cart. Uses shortName (not the long full
 * name) to avoid awkward wrapping.
 */
export function RecommendationCard({ recommendation }: { recommendation: Recommendation }) {
  const product = getProductById(recommendation.productId);
  if (!product) {
    return (
      <li className="w-64 shrink-0 rounded-2xl border border-semantic-danger/30 bg-semantic-danger/5 p-4 text-caption text-semantic-danger">
        broken recommendation: {recommendation.productId}
      </li>
    );
  }
  const bundle = recommendation.bundleSuggestionId
    ? getBundleById(recommendation.bundleSuggestionId)
    : undefined;

  return (
    <li className="flex w-64 shrink-0 snap-start flex-col rounded-2xl border border-border-subtle bg-surface-base p-4 shadow-e1">
      {/* emoji + badge */}
      <div className="flex items-start justify-between gap-2">
        <span className="text-4xl leading-none" aria-hidden>
          {product.imageEmoji}
        </span>
        {recommendation.badge && (
          <span className="shrink-0 rounded-full bg-brand-accent/15 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-brand-accent">
            {recommendation.badge}
          </span>
        )}
      </div>

      {/* name + pitch */}
      <h4 className="mt-3 text-small font-bold leading-snug text-brand-ink">
        {product.shortName}
      </h4>
      <p className="mt-1 text-caption leading-snug text-ink-tertiary">{product.shortPitch}</p>

      {/* reasons — keep top 3, compact */}
      <ul className="mt-3 flex-1 space-y-1.5">
        {recommendation.reasons.slice(0, 3).map((r) => (
          <li key={r} className="flex gap-1.5 text-caption leading-snug text-ink-secondary">
            <Check className="mt-0.5 h-3 w-3 shrink-0 text-brand-primary" aria-hidden />
            <span>{r}</span>
          </li>
        ))}
      </ul>

      {/* price + add to cart */}
      <div className="mt-4 flex items-center justify-between border-t border-border-subtle pt-3">
        <span className="text-body font-bold text-brand-ink">{formatJpy(product.priceJpy)}</span>
        <AddToCartButton productId={product.id} />
      </div>

      {/* optional bundle hint — compact */}
      {bundle && (
        <p className="mt-2 text-[10px] text-brand-primary">
          套餐价 {formatJpy(bundle.bundlePriceJpy)} · {bundle.saveLabel}
        </p>
      )}
    </li>
  );
}
