import { getTranslations } from "next-intl/server";
import Link from "next/link";
import { ArrowRight } from "lucide-react";
import {
  habaB2BPartners,
  resaleChainNarrative,
  tokenResalePlans,
  x402TopupSteps,
} from "@/lib/haba";
import { cn, formatTokenCount } from "@/lib/utils";
import { SectionTitle } from "@/components/shared/SectionTitle";
import { ResaleChainDiagramInline } from "@/components/resale/ResaleChainDiagram";

/**
 * Home-page summary band that points to the 3 subroutes built in M4.
 * Each tile shows a 1-line "what you'll see" + a numeric/visual proof
 * (8 step count / 3 plans / 4 partners).
 */
export async function SubpageTeaserGrid() {
  const t = await getTranslations("home.teaser");
  return (
    <section className="mx-auto max-w-6xl px-6 py-16 lg:px-12 lg:py-20">
      <SectionTitle eyebrow={t("eyebrow")} title={t("title")} description={t("description")} />
      <div className="grid grid-cols-1 gap-6 md:grid-cols-3">
        <Teaser
          href="/topup"
          tone="primary"
          eyebrow={t("topup.eyebrow")}
          title={t("topup.title")}
          desc={t("topup.desc")}
          cta={t("topup.cta")}
          metric={`${x402TopupSteps.length} 步`}
          metricCaption={t("topup.metricCaption")}
        />
        <Teaser
          href="/resale"
          tone="accent"
          eyebrow={t("resale.eyebrow")}
          title={t("resale.title")}
          desc={t("resale.desc")}
          cta={t("resale.cta")}
          metric={`${tokenResalePlans.length} 档`}
          metricCaption={`${formatTokenCount(resaleChainNarrative.thisMonthResaleCallsDemo)} 调用 / 月`}
        >
          <div className="mt-4">
            <ResaleChainDiagramInline />
          </div>
        </Teaser>
        <Teaser
          href="/b2b"
          tone="ink"
          eyebrow={t("b2b.eyebrow")}
          title={t("b2b.title")}
          desc={t("b2b.desc")}
          cta={t("b2b.cta")}
          metric={`${habaB2BPartners.length} 个画像`}
          metricCaption={habaB2BPartners.map((p) => p.icon).join(" ")}
        />
      </div>
    </section>
  );
}

function Teaser({
  href,
  eyebrow,
  title,
  desc,
  cta,
  metric,
  metricCaption,
  tone,
  children,
}: {
  href: string;
  eyebrow: string;
  title: string;
  desc: string;
  cta: string;
  metric: string;
  metricCaption: string;
  tone: "primary" | "accent" | "ink";
  children?: React.ReactNode;
}) {
  return (
    <Link
      href={href}
      className="group flex flex-col rounded-2xl border border-border-subtle bg-surface-base p-6 shadow-e1 transition-all hover:shadow-e2"
    >
      <div className="flex items-baseline justify-between gap-2">
        <span className="text-caption uppercase tracking-widest text-ink-tertiary">{eyebrow}</span>
        <span
          className={cn(
            "rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider",
            tone === "primary" && "bg-brand-primary/10 text-brand-primary",
            tone === "accent" && "bg-brand-accent/15 text-brand-accent",
            tone === "ink" && "bg-brand-ink/10 text-brand-ink",
          )}
        >
          {metric}
        </span>
      </div>
      <h3 className="mt-3 text-lg font-semibold text-brand-ink">{title}</h3>
      <p className="mt-2 flex-1 text-small text-ink-secondary">{desc}</p>
      {children}
      <div className="mt-5 flex items-center justify-between border-t border-border-subtle pt-4">
        <p className="text-caption text-ink-tertiary">{metricCaption}</p>
        <span className="inline-flex items-center gap-1 text-small font-medium text-brand-primary">
          {cta}
          <ArrowRight className="h-3.5 w-3.5 transition-transform group-hover:translate-x-0.5" aria-hidden />
        </span>
      </div>
    </Link>
  );
}
