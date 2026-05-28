import { getTranslations } from "next-intl/server";
import { Bot, User, Sparkles, Check } from "lucide-react";
import { getProductById } from "@/lib/haba";
import { formatJpy } from "@/lib/utils";

/**
 * Hero right-column visual — a polished "AI Advisor recommendation" preview.
 * Shows a consumer question and one curated MARVIE pick so a first-time
 * visitor immediately sees what the product does for them. Pure server
 * component, data-driven from the catalog.
 */
export async function AdvisorPreviewCard() {
  const t = await getTranslations("hero");
  const product = getProductById("marvie_liquid_200ml");

  return (
    <div className="relative">
      {/* Soft glow behind the card */}
      <div
        aria-hidden
        className="pointer-events-none absolute -inset-4 rounded-[2rem] bg-brand-primary/8 blur-2xl"
      />

      <div className="relative overflow-hidden rounded-[28px] border border-border-subtle bg-surface-base shadow-e3">
        {/* Header */}
        <div className="flex items-center gap-3 border-b border-border-subtle bg-brand-primary/5 px-6 py-4">
          <span className="inline-flex h-9 w-9 items-center justify-center rounded-full bg-brand-primary text-white">
            <Sparkles className="h-[18px] w-[18px]" aria-hidden />
          </span>
          <span className="text-small font-bold text-brand-primary">{t("previewLabel")}</span>
          <span className="ml-auto inline-flex items-center gap-1.5 text-[11px] font-medium text-ink-tertiary">
            <span className="inline-block h-2 w-2 animate-pulse rounded-full bg-semantic-success" />
            在线
          </span>
        </div>

        <div className="space-y-5 p-6">
          {/* User question bubble */}
          <div className="flex justify-end">
            <div className="flex max-w-[85%] items-start gap-2">
              <p className="rounded-2xl rounded-tr-sm bg-surface-muted px-4 py-3 text-[15px] leading-6 text-brand-ink">
                {t("previewQuestion")}
              </p>
              <span className="mt-0.5 inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-surface-muted text-ink-tertiary">
                <User className="h-[18px] w-[18px]" aria-hidden />
              </span>
            </div>
          </div>

          {/* Advisor reply */}
          <div className="flex items-start gap-2">
            <span className="mt-0.5 inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-brand-primary text-white">
              <Bot className="h-[18px] w-[18px]" aria-hidden />
            </span>
            <div className="flex-1">
              {/* Recommended product card */}
              {product && (
                <div className="rounded-2xl rounded-tl-sm border border-brand-primary/20 bg-brand-primary/[0.04] p-5">
                  <div className="flex items-start gap-4">
                    <span className="text-5xl leading-none" aria-hidden>
                      {product.imageEmoji}
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <h3 className="truncate text-[16px] font-bold text-brand-ink">
                          {product.shortName}
                        </h3>
                        <span className="shrink-0 rounded-full bg-brand-accent/15 px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider text-brand-accent">
                          {t("previewBadge")}
                        </span>
                      </div>
                      <p className="mt-2 flex items-start gap-2 text-small leading-5 text-ink-secondary">
                        <Check className="mt-0.5 h-4 w-4 shrink-0 text-brand-primary" aria-hidden />
                        <span>{t("previewReason")}</span>
                      </p>
                      <div className="mt-3 flex items-baseline justify-between">
                        <span className="text-xl font-bold text-brand-ink">
                          {formatJpy(product.priceJpy)}
                        </span>
                        <span className="text-[10px] text-ink-tertiary">含税</span>
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
