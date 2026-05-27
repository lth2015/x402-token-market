import { getTranslations } from "next-intl/server";
import { Building2, Globe, Layers3 } from "lucide-react";

/**
 * Page footer — HABA disclaimer + tech-stack attribution row.
 * Shows the three technology partners as neutral entity chips so even
 * non-technical executives understand the infrastructure provenance.
 * Intentionally does NOT name upstream providers by company (vendor-neutral).
 */
export async function HabaFooter() {
  const t = await getTranslations("footer");
  return (
    <footer className="mt-24 border-t border-border-subtle bg-surface-base">
      <div className="mx-auto max-w-6xl px-6 py-10 lg:px-12">

        {/* Tech stack row */}
        <div className="flex flex-wrap items-center gap-3">
          <span className="text-[10px] uppercase tracking-wider text-ink-tertiary">
            基础设施
          </span>
          {[
            { Icon: Building2, label: "AI Commerce", sub: "HABA"       },
            { Icon: Layers3,   label: "x402 Protocol", sub: "支払協議" },
            { Icon: Globe,     label: "Solana USDC",  sub: "公链结算"  },
          ].map(({ Icon, label, sub }) => (
            <span
              key={label}
              className="inline-flex items-center gap-1.5 rounded-full border border-border-subtle bg-surface-muted px-3 py-1 text-[11px] text-ink-secondary"
            >
              <Icon className="h-3 w-3 text-ink-tertiary" aria-hidden />
              <span className="font-medium text-brand-ink">{label}</span>
              <span className="text-ink-tertiary">· {sub}</span>
            </span>
          ))}
        </div>

        {/* Divider */}
        <div className="my-5 border-t border-border-subtle" />

        {/* Disclaimer + copyright */}
        <div className="flex flex-col gap-1.5 sm:flex-row sm:items-start sm:justify-between sm:gap-6">
          <p className="max-w-2xl text-[11px] leading-relaxed text-ink-tertiary">
            {t("disclaimer")}
          </p>
          <p className="shrink-0 text-[11px] text-ink-tertiary">
            © HABA / ハーバー研究所
          </p>
        </div>

      </div>
    </footer>
  );
}
