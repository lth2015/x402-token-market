import { getTranslations } from "next-intl/server";
import { resaleChainNarrative, tokenResalePlans } from "@/lib/haba";
import { SectionTitle } from "@/components/shared/SectionTitle";
import { DemoBadge } from "@/components/shared/DemoBadge";
import { EnterpriseAcceptancePanel } from "@/components/shared/EnterpriseAcceptancePanel";
import { formatJpy, formatTokenCount } from "@/lib/utils";
import { ResaleChainDiagram } from "./ResaleChainDiagram";
import { TokenResalePlanCard } from "./TokenResalePlanCard";

/**
 * Full "AI 能力转售" section.
 *   - SectionTitle + narrative
 *   - ResaleChainDiagram
 *   - 3 plan cards
 *   - This-month KPI strip (Token resold + revenue)
 */
export async function TokenResaleSection() {
  const t = await getTranslations("resale");
  return (
    <section className="mx-auto max-w-6xl px-6 py-16 lg:px-12 lg:py-20">
      <SectionTitle
        eyebrow={t("eyebrow")}
        title={resaleChainNarrative.headline}
        description={t("description")}
      />

      <EnterpriseAcceptancePanel
        className="mb-8"
        title="从 demo 到试点合同的验收线"
        description="这页把 HABA 的 AI 能力转售拆成可签约的商业模块：定价、计量、审计、风控和链上凭证各自独立，可逐项进入试点验收。"
        items={[
          {
            kind: "commercial",
            title: "收入流清楚",
            body: "Token 配额、月基础费、超额单价与 Enterprise 议价分开，避免把技术 PoC 误解成单次项目收入。",
          },
          {
            kind: "audit",
            title: "对账证据闭环",
            body: "Token 消耗、USDC 支付、订单号、trace 与发票口径对齐，支持月度报表和抽样核验。",
          },
          {
            kind: "control",
            title: "企业级治理",
            body: "子账户、API key、调用限额、停用与异常消耗冻结，是大客户上线前的必备控制面。",
          },
          {
            kind: "boundary",
            title: "生态叙事稳健",
            body: "HABA 卖 Advisor 能力，Netstars 提供支付与 Token 运营，Solana 只作为可验证结算层出现。",
          },
        ]}
      />

      {/* Narrative + chain */}
      <div className="grid gap-8 lg:grid-cols-12 lg:items-start">
        <div className="lg:col-span-5">
          <ol className="space-y-3 text-body text-ink-secondary">
            {resaleChainNarrative.pitch.map((p, i) => (
              <li key={i} className="flex gap-3">
                <span className="mt-0.5 inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-brand-primary/10 text-caption font-semibold text-brand-primary">
                  {i + 1}
                </span>
                <span>{p}</span>
              </li>
            ))}
          </ol>

          <div className="mt-6 grid grid-cols-2 gap-3 rounded-xl border border-border-subtle bg-surface-base p-4">
            <Kpi
              label="本月转售调用"
              value={formatTokenCount(resaleChainNarrative.thisMonthResaleCallsDemo)}
              unit="次"
            />
            <Kpi
              label="转售收入"
              value={formatJpy(resaleChainNarrative.thisMonthResaleRevenueJpyDemo)}
            />
          </div>
        </div>

        <div className="lg:col-span-7">
          <ResaleChainDiagram />
        </div>
      </div>

      {/* 3 plans */}
      <div className="mt-12">
        <h3 className="text-lg font-semibold text-brand-ink">{t("plansHeading")}</h3>
        <p className="mt-1 text-small text-ink-secondary">{t("plansSubtitle")}</p>

        <div className="mt-6 grid grid-cols-1 gap-6 md:grid-cols-3">
          {tokenResalePlans.map((plan) => (
            <TokenResalePlanCard key={plan.id} plan={plan} />
          ))}
        </div>
      </div>
    </section>
  );
}

function Kpi({ label, value, unit }: { label: string; value: string; unit?: string }) {
  return (
    <div>
      <div className="flex items-baseline gap-1.5">
        <p className="text-caption uppercase tracking-widest text-ink-tertiary">{label}</p>
        <DemoBadge />
      </div>
      <p className="mt-1 text-lg font-semibold text-brand-ink">
        {value}
        {unit && <span className="ml-1 text-caption font-normal text-ink-tertiary">{unit}</span>}
      </p>
    </div>
  );
}
