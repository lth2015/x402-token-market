/**
 * HabaHero — consumer-facing hero. Leads with the consumer pain point
 * ("love sweet, watch sugar?") + a clear CTA into the AI advisor, and a
 * right-column recommendation preview so the value is obvious at a glance.
 */
import { getTranslations } from "next-intl/server";
import { ArrowRight } from "lucide-react";
import { habaMerchant } from "@/lib/haba";
import { AdvisorPreviewCard } from "./AdvisorPreviewCard";

export async function HabaHero() {
  const t = await getTranslations("hero");
  return (
    <section className="relative overflow-hidden border-b border-border-subtle bg-surface-page">

      <div className="absolute inset-x-0 top-0 h-1 bg-gradient-to-r from-brand-primary via-brand-accent to-brand-primary" aria-hidden />

      <div className="relative mx-auto max-w-6xl px-6 py-20 lg:flex lg:items-center lg:gap-16 lg:px-12 lg:py-28">

        {/* Left — pain-point headline + CTA */}
        <div className="lg:flex-1">
          <p className="animate-fade-up text-small font-bold uppercase tracking-[0.18em] text-brand-primary">
            {t("eyebrow")}
          </p>

          <h1 className="animate-fade-up-delay-1 mt-5 text-[44px] font-extrabold leading-[1.05] tracking-tight text-brand-ink lg:text-[64px]">
            {t("headline")}
            <span className="mt-1 block text-brand-primary">{t("headlineAccent")}</span>
          </h1>

          <p className="animate-fade-up-delay-2 mt-6 max-w-xl text-[18px] leading-8 text-ink-secondary">
            {t("sub")}
          </p>

          {/* Consumer pain-point chips */}
          <div className="animate-fade-up-delay-2 mt-6 flex flex-wrap gap-2">
            {habaMerchant.consumerSegments.map((seg) => (
              <span
                key={seg}
                className="rounded-full border border-brand-primary/15 bg-brand-primary/6 px-4 py-2 text-small font-semibold text-brand-primary"
              >
                {seg}
              </span>
            ))}
          </div>

          {/* CTAs */}
          <div className="animate-fade-up-delay-3 mt-8 flex flex-wrap items-center gap-3">
            <a
              href="#advisor"
              className="inline-flex items-center gap-2 rounded-2xl bg-brand-primary px-7 py-4 text-[15px] font-bold text-white shadow-e2 transition-all hover:scale-[1.02] hover:bg-brand-primary-hover"
            >
              {t("ctaPrimary")}
              <ArrowRight className="h-5 w-5" aria-hidden />
            </a>
            <a
              href="#products"
              className="inline-flex items-center gap-1.5 rounded-2xl border border-border-default bg-surface-base px-7 py-4 text-[15px] font-semibold text-ink-secondary transition-colors hover:border-brand-primary/40 hover:text-brand-primary"
            >
              {t("ctaSecondary")}
            </a>
          </div>

          {/* Value chips — consumer-relevant only */}
          <div className="animate-fade-up-delay-4 mt-8 flex flex-wrap gap-5 text-small font-medium text-ink-tertiary">
            <span className="inline-flex items-center gap-1.5">
              <span className="inline-block h-1.5 w-1.5 rounded-full bg-brand-primary" />
              {t("value1")}
            </span>
            <span className="inline-flex items-center gap-1.5">
              <span className="inline-block h-1.5 w-1.5 rounded-full bg-brand-primary" />
              {t("value2")}
            </span>
          </div>
        </div>

        {/* Right — AI recommendation preview */}
        <div className="mt-12 lg:mt-0 lg:w-[450px] lg:shrink-0 animate-fade-up-delay-2">
          <AdvisorPreviewCard />
        </div>
      </div>
    </section>
  );
}
