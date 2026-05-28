"use client";

import { useTranslations } from "next-intl";
import Link from "next/link";
import { ArrowRight, Bot, User } from "lucide-react";
import type { AgentCta, HabaAgentScenario, MarvieProduct } from "@/lib/haba";
import { cn } from "@/lib/utils";
import { RecommendationCard } from "./RecommendationCard";
import { AdvisorFollowupChat } from "./AdvisorFollowupChat";
import { AddAllToCartButton } from "@/components/cart/AddToCartButton";

/**
 * Renders one scenario as an Agent chat thread.
 *   user prompt → agent opening → recommendations → CTAs
 *
 * Client component so it can swap scenarios on click without a server
 * round-trip.
 */
export function AgentChatDemo({
  scenario,
  onAskMore,
}: {
  scenario: HabaAgentScenario;
  onAskMore?: () => void;
}) {
  const t = useTranslations("agent");

  return (
    <div className="overflow-hidden rounded-[24px] border border-border-subtle bg-surface-base shadow-e3">
      {/* user bubble */}
      <div className="flex gap-4 border-b border-border-subtle bg-surface-muted px-7 py-6">
        <span
          aria-hidden
          className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-surface-base text-ink-tertiary"
        >
          <User className="h-5 w-5" />
        </span>
        <div className="flex-1">
          <p className="text-small font-semibold text-ink-tertiary">{t("userLabel")}</p>
          <p className="mt-1.5 whitespace-pre-wrap text-[15px] leading-7 text-brand-ink">{scenario.userPrompt}</p>
        </div>
      </div>

      {/* agent reply */}
      <div className="flex gap-4 px-7 py-7">
        <span
          aria-hidden
          className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-brand-primary text-white"
        >
          <Bot className="h-5 w-5" />
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <p className="text-small font-semibold text-brand-primary">{t("agentLabel")}</p>
            <span className="rounded-full bg-surface-muted px-2.5 py-1 text-[11px] uppercase tracking-wider text-ink-tertiary">
              {scenario.persona.replace(/^c_/, "").replace(/^b2b_/, "B2B · ").replace(/_/g, " ")}
            </span>
          </div>
          <p className="mt-3 text-[15px] leading-7 text-ink-primary">{scenario.agentOpening}</p>

          {/* recommendations — horizontal scroll keeps the page height fixed
              no matter how many products the advisor returns */}
          <ul className="mt-5 flex snap-x gap-3 overflow-x-auto pb-2 [scrollbar-width:thin]">
            {scenario.recommendations.map((r) => (
              <RecommendationCard key={r.productId} recommendation={r} />
            ))}
          </ul>

          {/* fallback / warning */}
          {scenario.warning && (
            <p className="mt-4 rounded-lg border border-semantic-warning/30 bg-semantic-warning/5 px-3 py-2 text-small text-semantic-warning">
              ⚠️ {scenario.warning.text}
            </p>
          )}

          {/* CTAs */}
          <div className="mt-6 flex flex-wrap gap-2.5">
            {scenario.closingCtas.map((cta) => (
              <CtaButton
                key={cta.label}
                cta={cta}
                productIds={scenario.recommendations.map((r) => r.productId)}
                onAskMore={onAskMore}
              />
            ))}
            {scenario.persona === "c_concierge" && (
              <Link
                href="#products"
                className="inline-flex items-center gap-1.5 whitespace-nowrap rounded-xl border border-border-default bg-surface-base px-5 py-3 text-body font-semibold text-ink-secondary transition-colors hover:border-brand-primary/40 hover:text-brand-primary"
              >
                查看全部商品
                <ArrowRight className="h-4 w-4" aria-hidden />
              </Link>
            )}
          </div>

          {scenario.persona === "c_concierge" && <AdvisorFollowupChat scenario={scenario} />}
        </div>
      </div>
    </div>
  );
}

function CtaButton({
  cta,
  productIds,
  onAskMore,
}: {
  cta: AgentCta;
  productIds: MarvieProduct["id"][];
  onAskMore?: () => void;
}) {
  // "Add to cart" CTAs (C-end + pharmacy "推荐给顾客") wire to the real
  // cart store. Other CTAs (print / copy / embed) remain demo-only no-ops.
  if (cta.kind === "add_to_cart" || cta.kind === "recommend_to_client") {
    return <AddAllToCartButton productIds={productIds} label={cta.label} />;
  }
  if (cta.kind === "ask_more") {
    return (
      <button
        type="button"
        onClick={onAskMore}
        className={cn(
          "inline-flex items-center gap-1.5 whitespace-nowrap rounded-xl border px-5 py-3 text-body font-semibold transition-colors",
          "border-border-default bg-surface-base text-ink-secondary hover:border-brand-primary/40 hover:text-brand-primary",
        )}
      >
        {cta.label}
        <ArrowRight className="h-4 w-4" aria-hidden />
      </button>
    );
  }
  return (
    <button
      type="button"
      onClick={() => {
        if (typeof window !== "undefined") {
          // eslint-disable-next-line no-console
          console.info("[demo] CTA clicked:", cta.kind, cta.label);
        }
      }}
      className={cn(
        "whitespace-nowrap rounded-xl border px-5 py-3 text-body font-semibold transition-colors",
        "border-border-default bg-surface-base text-ink-secondary hover:border-brand-primary/40 hover:text-brand-primary",
      )}
    >
      {cta.label}
    </button>
  );
}
