import { getTranslations } from "next-intl/server";
import { Sparkles } from "lucide-react";
import { habaMerchant } from "@/lib/haba";

/**
 * HABA AI Commerce hero — brand block + tagline + 3 consumer-segment chips.
 *
 * The interactive "5 一键场景" cards live in ConsumerScenarioSection (M3
 * client component), not here — keeps Hero pure-server.
 */
export async function HabaHero() {
  const t = await getTranslations();
  return (
    <section className="relative overflow-hidden border-b border-border-subtle bg-gradient-to-br from-surface-base via-surface-muted to-surface-base">
      <div className="mx-auto max-w-6xl px-6 py-16 lg:px-12 lg:py-24">
        <div className="flex items-center gap-2 text-caption font-medium uppercase tracking-widest text-brand-primary">
          <Sparkles className="h-3.5 w-3.5" aria-hidden />
          {t("brand.productLine")}
        </div>
        <h1 className="mt-4 text-4xl font-semibold leading-tight text-brand-ink lg:text-6xl">
          {t("brand.fullName")}
        </h1>
        <p className="mt-5 max-w-3xl text-lg text-ink-secondary lg:text-xl">
          {t("brand.tagline")}
        </p>

        {/* consumer segments */}
        <div className="mt-8 flex flex-wrap gap-2">
          {habaMerchant.consumerSegments.map((seg) => (
            <span
              key={seg}
              className="rounded-full border border-brand-primary/20 bg-brand-primary/5 px-3 py-1 text-small text-brand-primary"
            >
              {seg}
            </span>
          ))}
        </div>
      </div>
    </section>
  );
}
