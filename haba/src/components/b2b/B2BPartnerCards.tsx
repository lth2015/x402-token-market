"use client";

import { ChevronRight } from "lucide-react";
import { habaB2BPartners, tokenResalePlans, type B2BPartnerCase } from "@/lib/haba";
import { cn, formatTokenCount } from "@/lib/utils";
import { DemoBadge } from "@/components/shared/DemoBadge";

/**
 * 4 partner cards. Click a card → parent updates the selected partner so
 * the adjacent B2BPartnerDialogue can render that partner's sample call.
 */
export function B2BPartnerCards({
  selectedId,
  onSelect,
}: {
  selectedId: B2BPartnerCase["id"];
  onSelect: (id: B2BPartnerCase["id"]) => void;
}) {
  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
      {habaB2BPartners.map((p) => (
        <button
          key={p.id}
          type="button"
          onClick={() => onSelect(p.id)}
          aria-pressed={p.id === selectedId}
          className={cn(
            "group flex flex-col rounded-2xl border bg-surface-base p-5 text-left shadow-e1 transition-all",
            p.id === selectedId
              ? "border-brand-primary ring-2 ring-brand-primary/30 shadow-e2"
              : "border-border-subtle hover:border-brand-primary/40 hover:shadow-e2",
          )}
        >
          <div className="flex items-start justify-between">
            <span className="text-3xl leading-none" aria-hidden>
              {p.icon}
            </span>
            <DemoBadge />
          </div>
          <h3 className="mt-4 text-body font-semibold text-brand-ink">{p.partnerKind}</h3>
          <p className="mt-2 flex-1 text-small text-ink-secondary">{p.valueProp}</p>

          <dl className="mt-4 space-y-1.5 border-t border-border-subtle pt-3 text-caption">
            <Row label="嵌入方式" value={p.embedTechnique} />
            <Row label="月度调用" value={`${formatTokenCount(p.monthlyCallVolumeDemo)} 次`} />
            <Row label="推荐套餐" value={planLabel(p.recommendedPlanId)} />
          </dl>

          <div
            className={cn(
              "mt-4 flex items-center justify-end gap-1 text-caption font-medium",
              p.id === selectedId ? "text-brand-primary" : "text-ink-tertiary",
            )}
          >
            查看调用示例
            <ChevronRight className="h-3 w-3" aria-hidden />
          </div>
        </button>
      ))}
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between gap-2">
      <dt className="text-ink-tertiary">{label}</dt>
      <dd className="font-medium text-brand-ink">{value}</dd>
    </div>
  );
}

function planLabel(id: string): string {
  return tokenResalePlans.find((p) => p.id === id)?.displayName ?? id;
}
