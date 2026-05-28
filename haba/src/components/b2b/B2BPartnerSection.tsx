"use client";

import { useMemo, useState } from "react";
import { useTranslations } from "next-intl";
import {
  getPartnerById,
  getScenarioById,
  habaB2BPartners,
  type B2BPartnerCase,
} from "@/lib/haba";
import { SectionTitle } from "@/components/shared/SectionTitle";
import { AgentChatDemo } from "@/components/agent/AgentChatDemo";
import { EnterpriseAcceptancePanel } from "@/components/shared/EnterpriseAcceptancePanel";
import { B2BPartnerCards } from "./B2BPartnerCards";

/**
 * Combines the 4 partner cards with the selected partner's sample dialogue.
 *
 * AgentChatDemo is reused verbatim — it already styles per-persona via the
 * scenario.persona pill, so a "pharmacy" scenario renders with the right
 * voice for free.
 */
export function B2BPartnerSection() {
  const t = useTranslations("b2b");
  const [selectedId, setSelectedId] = useState<B2BPartnerCase["id"]>(habaB2BPartners[0]!.id);

  const { partner, scenario } = useMemo(() => {
    const p = getPartnerById(selectedId);
    const s = p ? getScenarioById(p.sampleScenarioId) : undefined;
    return { partner: p, scenario: s };
  }, [selectedId]);

  return (
    <section className="mx-auto max-w-6xl px-6 py-16 lg:px-12 lg:py-20">
      <SectionTitle
        eyebrow={t("eyebrow")}
        title={t("sectionTitle")}
        description={t("sectionDescription")}
      />

      <EnterpriseAcceptancePanel
        className="mb-8"
        title="B2B 合作可验收边界"
        description="面向药局、医院、营养师与合作电商的调用，不只是演示对话；每一类合作都需要可计费、可追踪、可停用、可合同化。"
        items={[
          {
            kind: "boundary",
            title: "品牌与责任分层",
            body: "消费者看到 HABA 顾问；Netstars 承接 Token、计费与结算底座，避免前台暴露复杂基础设施。",
          },
          {
            kind: "audit",
            title: "调用即流水",
            body: "每次 B2B Advisor 调用进入月度 Token 套餐，Console 可查余额、路径、trace 与审计记录。",
          },
          {
            kind: "control",
            title: "套餐与上限",
            body: "合作方按 Starter / Growth / Enterprise 预付配额，支持子账户、频控和超额策略。",
          },
          {
            kind: "commercial",
            title: "上市公司签约口径",
            body: "演示数据、商品目录、医疗免责声明与合作边界分开呈现，便于法务、合规和经营层分别审查。",
          },
        ]}
      />

      <B2BPartnerCards selectedId={selectedId} onSelect={setSelectedId} />

      {partner && scenario && (
        <div className="mt-10">
          <div className="mb-4 flex items-center gap-2 text-small text-ink-secondary">
            <span className="font-semibold text-brand-ink">{partner.icon}</span>
            <span className="font-semibold text-brand-ink">{partner.partnerKind}</span>
            <span className="text-ink-tertiary">— {partner.embedTechnique}</span>
          </div>
          <AgentChatDemo scenario={scenario} />
        </div>
      )}
    </section>
  );
}
