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
