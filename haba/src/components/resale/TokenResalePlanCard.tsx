import { Check, Sparkles } from "lucide-react";
import type { TokenResalePlan } from "@/lib/haba";
import { cn, formatJpy, formatTokenCount } from "@/lib/utils";

/**
 * One Token AI Resale plan card. Three of these sit side-by-side in
 * TokenResaleSection; the `recommended` plan gets the visual emphasis.
 */
export function TokenResalePlanCard({ plan }: { plan: TokenResalePlan }) {
  const recommended = plan.recommended === true;
  const priceLabel =
    plan.id === "enterprise"
      ? "议价"
      : `${formatJpy(plan.pricePerTokenJpy)} / Token`;

  return (
    <article
      className={cn(
        "relative flex flex-col rounded-2xl border bg-surface-base p-6 shadow-e1",
        recommended
          ? "border-brand-primary ring-2 ring-brand-primary/30 shadow-e2"
          : "border-border-subtle",
      )}
    >
      {recommended && (
        <span className="absolute -top-3 left-6 inline-flex items-center gap-1 rounded-full bg-brand-primary px-3 py-0.5 text-caption font-medium text-white">
          <Sparkles className="h-3 w-3" aria-hidden />
          推荐
        </span>
      )}

      <header>
        <h3 className="text-xl font-semibold text-brand-ink">{plan.displayName}</h3>
        <p className="mt-1 text-caption text-ink-tertiary">{plan.targetPersona}</p>
      </header>

      <div className="mt-5 space-y-1">
        <div className="text-2xl font-semibold text-brand-ink">
          {formatTokenCount(plan.monthlyTokenQuota)}
          <span className="ml-1 text-caption font-normal text-ink-tertiary">Token / 月</span>
        </div>
        <div className="text-small text-ink-secondary">{priceLabel}</div>
        {plan.monthlyBaseFeeJpy > 0 && (
          <div className="text-caption text-ink-tertiary">
            月基础费 {formatJpy(plan.monthlyBaseFeeJpy)}
          </div>
        )}
      </div>

      <p className="mt-3 text-small text-brand-primary">{plan.marketingLine}</p>

      <ul className="mt-5 flex-1 space-y-2 border-t border-border-subtle pt-4 text-small text-ink-secondary">
        {plan.features.map((f) => (
          <li key={f} className="flex gap-2">
            <Check className="mt-0.5 h-3.5 w-3.5 shrink-0 text-brand-primary" aria-hidden />
            <span>{f}</span>
          </li>
        ))}
      </ul>

      <button
        type="button"
        className={cn(
          "mt-6 rounded-lg px-4 py-2.5 text-small font-medium transition-colors",
          recommended
            ? "bg-brand-primary text-white hover:bg-brand-primary-hover"
            : "border border-border-default bg-surface-base text-brand-ink hover:border-brand-primary hover:text-brand-primary",
        )}
      >
        {plan.id === "enterprise" ? "联系商务" : "选择套餐"}
      </button>
    </article>
  );
}
