import { Check, Tag } from "lucide-react";
import {
  getBundleById,
  getProductById,
  type Recommendation,
} from "@/lib/haba";
import { formatJpy } from "@/lib/utils";
import { DemoBadge } from "@/components/shared/DemoBadge";
import { AddToCartButton } from "@/components/cart/AddToCartButton";

/**
 * One recommended SKU as Agent output.
 *  - Shows product card (emoji + name + pitch + price).
 *  - Lists ≥ 3 "为什么推荐" bullet reasons.
 *  - Optional badge ("Best for Diabetic" etc.).
 *  - Optional bundle suggestion link.
 *
 * Pure server component — no client state.
 */
export function RecommendationCard({ recommendation }: { recommendation: Recommendation }) {
  const product = getProductById(recommendation.productId);
  if (!product) {
    return (
      <li className="rounded-lg border border-semantic-danger/30 bg-semantic-danger/5 p-4 text-caption text-semantic-danger">
        broken recommendation: product {recommendation.productId} not in catalog
      </li>
    );
  }
  const bundle = recommendation.bundleSuggestionId
    ? getBundleById(recommendation.bundleSuggestionId)
    : undefined;

  return (
    <li className="rounded-xl border border-border-subtle bg-surface-base p-5 shadow-e1">
      <div className="flex items-start gap-4">
        <span className="text-3xl leading-none" aria-hidden>
          {product.imageEmoji}
        </span>
        <div className="flex-1">
          <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
            <h4 className="text-body font-semibold text-brand-ink">{product.name}</h4>
            {recommendation.badge && (
              <span className="rounded-full bg-brand-accent/15 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-brand-accent">
                {recommendation.badge}
              </span>
            )}
          </div>
          <p className="mt-1 text-caption text-ink-secondary">{product.shortPitch}</p>

          {/* reasons — agent-design §4.1 demands ≥3 dimensions */}
          <ul className="mt-3 space-y-1.5">
            {recommendation.reasons.map((r) => (
              <li key={r} className="flex gap-2 text-small text-ink-secondary">
                <Check className="mt-0.5 h-3.5 w-3.5 shrink-0 text-brand-primary" aria-hidden />
                <span>{r}</span>
              </li>
            ))}
          </ul>
        </div>
        <div className="shrink-0 text-right">
          <div className="text-body font-semibold text-brand-ink">
            {formatJpy(product.priceJpy)}
          </div>
          <DemoBadge className="mt-1" />
          <div className="mt-2">
            <AddToCartButton productId={product.id} />
          </div>
        </div>
      </div>

      {/* bundle deal footer */}
      {bundle && (
        <div className="mt-4 flex items-center gap-2 rounded-lg border border-dashed border-brand-primary/40 bg-brand-primary/5 px-3 py-2 text-small">
          <Tag className="h-3.5 w-3.5 text-brand-primary" aria-hidden />
          <span className="font-medium text-brand-primary">{bundle.pitch}</span>
          <span className="ml-auto flex items-baseline gap-2">
            <span className="text-ink-tertiary line-through">{formatJpy(bundle.originalTotalJpy)}</span>
            <span className="font-semibold text-brand-ink">{formatJpy(bundle.bundlePriceJpy)}</span>
            <span className="rounded bg-brand-primary/15 px-1.5 py-0.5 text-caption text-brand-primary">
              {bundle.saveLabel}
            </span>
          </span>
        </div>
      )}
    </li>
  );
}
