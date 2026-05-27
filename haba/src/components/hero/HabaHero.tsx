/**
 * HabaHero — HABA AI Commerce hero section.
 *
 * Layout (desktop): two-column split
 *   Left  60% — brand headline + tagline + segment chips + LiveMetricsBar
 *   Right 40% — EcosystemFlowCard (dark, contrasting card)
 *
 * Layout (mobile): stacked, card below text.
 *
 * The left column is a pure server component; LiveMetricsBar is the only
 * client part (fetches balance on mount). The right card is pure server
 * with CSS-only animations.
 *
 * Background: soft radial glows from corners for depth; no heavy JS.
 */
import { getTranslations } from "next-intl/server";
import { Sparkles } from "lucide-react";
import { habaMerchant } from "@/lib/haba";
import { EcosystemFlowCard } from "./EcosystemFlowCard";
import { LiveMetricsBar } from "./LiveMetricsBar";

export async function HabaHero() {
  const t = await getTranslations();
  return (
    <section className="relative overflow-hidden border-b border-border-subtle bg-surface-page">

      {/* ── Decorative background glows (CSS-only, no JS) ───────────── */}
      {/* Top-left: brand green glow */}
      <div
        aria-hidden
        className="pointer-events-none absolute -top-40 -left-40 h-[560px] w-[560px] rounded-full bg-brand-primary/6 blur-[120px]"
      />
      {/* Bottom-right: warm amber accent glow */}
      <div
        aria-hidden
        className="pointer-events-none absolute -bottom-24 -right-24 h-[380px] w-[380px] rounded-full bg-brand-accent/5 blur-[100px]"
      />
      {/* Subtle dot-grid texture overlay */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 opacity-[0.025]"
        style={{
          backgroundImage:
            "radial-gradient(circle, #0B3D2E 1px, transparent 1px)",
          backgroundSize: "28px 28px",
        }}
      />

      {/* ── Content ──────────────────────────────────────────────────── */}
      <div className="relative mx-auto max-w-6xl px-6 py-16 lg:flex lg:items-center lg:gap-12 lg:px-12 lg:py-24">

        {/* Left — brand story */}
        <div className="lg:flex-1">

          {/* Eyebrow pill */}
          <div className="animate-fade-up inline-flex items-center gap-2 rounded-full border border-brand-primary/20 bg-brand-primary/8 px-4 py-1.5">
            <Sparkles className="h-3.5 w-3.5 text-brand-primary" aria-hidden />
            <span className="text-[11px] font-bold uppercase tracking-[0.15em] text-brand-primary">
              {t("brand.productLine")}
            </span>
          </div>

          {/* H1 — large display type for demo screens */}
          <h1 className="animate-fade-up-delay-1 mt-5 leading-[1.08] tracking-tight text-brand-ink">
            {/* English brand name — large */}
            <span className="block text-5xl font-extrabold lg:text-6xl">
              HABA
            </span>
            {/* Japanese name — medium, secondary emphasis */}
            <span className="block text-2xl font-normal text-ink-secondary lg:text-3xl">
              ハーバー研究所
            </span>
            {/* AI Commerce tagline — accent color split */}
            <span className="mt-1 block text-3xl font-bold text-brand-primary lg:text-4xl">
              AI Commerce
            </span>
          </h1>

          {/* Tagline */}
          <p className="animate-fade-up-delay-2 mt-5 max-w-xl text-[16px] leading-[1.7] text-ink-secondary">
            {t("brand.tagline")}
            <span className="mt-1 block text-[14px] text-ink-tertiary">
              x402 USDC 链上支付 · Token 经济体系 · Solana Devnet 真实结算
            </span>
          </p>

          {/* Consumer segment chips */}
          <div className="animate-fade-up-delay-2 mt-6 flex flex-wrap gap-2">
            {habaMerchant.consumerSegments.map((seg) => (
              <span
                key={seg}
                className="rounded-full border border-brand-primary/15 bg-brand-primary/6 px-3.5 py-1.5 text-[12px] font-medium text-brand-primary"
              >
                {seg}
              </span>
            ))}
          </div>

          {/* Live metrics — client component (fetches balance on mount) */}
          <LiveMetricsBar />

          {/* Bottom proof line */}
          <p className="animate-fade-up-delay-4 mt-5 text-[11px] text-ink-tertiary">
            <span className="font-medium text-ink-secondary">HABA</span>
            {" · "}
            <span className="font-medium text-ink-secondary">東証プライム上場</span>
            {" · "}
            MARVIE Medical Foods 全系列
          </p>
        </div>

        {/* Right — ecosystem flow card */}
        <div className="mt-12 lg:mt-0 lg:w-[380px] lg:shrink-0 xl:w-[420px] animate-fade-up-delay-2">
          <EcosystemFlowCard />
        </div>
      </div>
    </section>
  );
}
