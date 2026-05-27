"use client";

import { useMemo, useState } from "react";
import { useTranslations } from "next-intl";
import { getConsumerScenarios } from "@/lib/haba";
import { SectionTitle } from "@/components/shared/SectionTitle";
import { ScenarioPickerCard } from "./ScenarioPickerCard";
import { AgentChatDemo } from "./AgentChatDemo";

/**
 * Combines the 5 consumer scenario teaser cards with the selected
 * scenario's chat thread. State lives here (`useState`); ScenarioPickerCard
 * and AgentChatDemo only receive props.
 *
 * This is the demo's "AI 帮买什么 → 点一下就跑" core. Per requirements §6.2,
 * at least 3 of 5 must render a full recommendation flow — all 5 do.
 */
export function ConsumerScenarioSection() {
  const t = useTranslations("agent");
  // The data is static; memoize so React doesn't re-derive every render.
  const scenarios = useMemo(() => getConsumerScenarios(), []);
  const [selectedId, setSelectedId] = useState(scenarios[0]?.id ?? "");
  const selected = scenarios.find((s) => s.id === selectedId) ?? scenarios[0];

  return (
    <section className="mx-auto max-w-6xl px-6 py-16 lg:px-12 lg:py-20">
      <SectionTitle
        eyebrow={t("eyebrow")}
        title={t("sectionTitle")}
        description={t("sectionDescription")}
      />

      <div className="grid gap-8 lg:grid-cols-12">
        <div className="space-y-2 lg:col-span-5">
          {scenarios.map((s) => (
            <ScenarioPickerCard
              key={s.id}
              scenario={s}
              active={s.id === selectedId}
              onSelect={setSelectedId}
            />
          ))}
        </div>

        <div className="lg:col-span-7">{selected && <AgentChatDemo scenario={selected} />}</div>
      </div>
    </section>
  );
}
