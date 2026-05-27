"use client";

import { useTranslations } from "next-intl";
import { Bot, User } from "lucide-react";
import type { AgentCta, HabaAgentScenario, MarvieProduct } from "@/lib/haba";
import { cn } from "@/lib/utils";
import { RecommendationCard } from "./RecommendationCard";
import { RealAdvisorPanel } from "./RealAdvisorPanel";
import { B2BCallNotice } from "./B2BCallNotice";
import { AddAllToCartButton } from "@/components/cart/AddToCartButton";

/**
 * Renders one scenario as an Agent chat thread.
 *   user prompt → agent opening → real-AI panel → curated recommendations → CTAs
 *
 * Client component so it can swap scenarios on click without a server
 * round-trip. The `<RealAdvisorPanel />` fires a live LLM call against
 * the upstream Token API on demand so every scenario can show real
 * Token-burn behaviour without losing the curated SKU recommendations.
 */
export function AgentChatDemo({ scenario }: { scenario: HabaAgentScenario }) {
  const t = useTranslations("agent");

  return (
    <div className="overflow-hidden rounded-2xl border border-border-subtle bg-surface-base shadow-e2">
      {/* user bubble */}
      <div className="flex gap-3 border-b border-border-subtle bg-surface-muted px-6 py-5">
        <span
          aria-hidden
          className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-surface-base text-ink-tertiary"
        >
          <User className="h-4 w-4" />
        </span>
        <div className="flex-1">
          <p className="text-caption font-medium text-ink-tertiary">{t("userLabel")}</p>
          <p className="mt-1 whitespace-pre-wrap text-body text-brand-ink">{scenario.userPrompt}</p>
        </div>
      </div>

      {/* agent reply */}
      <div className="flex gap-3 px-6 py-6">
        <span
          aria-hidden
          className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-brand-primary text-white"
        >
          <Bot className="h-4 w-4" />
        </span>
        <div className="flex-1">
          <div className="flex items-center gap-2">
            <p className="text-caption font-medium text-brand-primary">{t("agentLabel")}</p>
            <span className="rounded-full bg-surface-muted px-2 py-0.5 text-[10px] uppercase tracking-wider text-ink-tertiary">
              {scenario.persona.replace(/^c_/, "").replace(/^b2b_/, "B2B · ").replace(/_/g, " ")}
            </span>
          </div>
          <p className="mt-2 text-body text-ink-primary">{scenario.agentOpening}</p>

          {/* Live LLM call — proves Token actually moves on click. */}
          <RealAdvisorPanel
            scenarioId={scenario.id}
            userPrompt={scenario.userPrompt}
            systemHint={`Persona: ${scenario.persona}.${scenario.billsAsB2bCall ? " (B2B-billed call)" : ""}`}
          />

          {/* recommendations */}
          <ul className="mt-5 space-y-3">
            {scenario.recommendations.map((r) => (
              <RecommendationCard key={r.productId} recommendation={r} />
            ))}
          </ul>

          {/* B2B billing notice — live monthly call counter */}
          {scenario.billsAsB2bCall && <B2BCallNotice />}

          {/* fallback / warning */}
          {scenario.warning && (
            <p className="mt-4 rounded-lg border border-semantic-warning/30 bg-semantic-warning/5 px-3 py-2 text-small text-semantic-warning">
              ⚠️ {scenario.warning.text}
            </p>
          )}

          {/* CTAs */}
          <div className="mt-5 flex flex-wrap gap-2">
            {scenario.closingCtas.map((cta) => (
              <CtaButton
                key={cta.label}
                cta={cta}
                productIds={scenario.recommendations.map((r) => r.productId)}
              />
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

function CtaButton({
  cta,
  productIds,
}: {
  cta: AgentCta;
  productIds: MarvieProduct["id"][];
}) {
  // "Add to cart" CTAs (C-end + pharmacy "推荐给顾客") wire to the real
  // cart store. Other CTAs (print / copy / embed) remain demo-only no-ops.
  if (cta.kind === "add_to_cart" || cta.kind === "recommend_to_client") {
    return <AddAllToCartButton productIds={productIds} label={cta.label} />;
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
        "rounded-lg border px-3 py-2 text-small font-medium transition-colors",
        "border-border-default bg-surface-base text-ink-secondary hover:border-brand-primary/40 hover:text-brand-primary",
      )}
    >
      {cta.label}
    </button>
  );
}
