"use client";

import { ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";
import type { HabaAgentScenario } from "@/lib/haba";

/**
 * One clickable card representing a Consumer scenario teaser.
 * Click → parent updates its "selected scenario" state.
 */
export function ScenarioPickerCard({
  scenario,
  active,
  onSelect,
}: {
  scenario: HabaAgentScenario;
  active: boolean;
  onSelect: (id: string) => void;
}) {
  return (
    <button
      type="button"
      onClick={() => onSelect(scenario.id)}
      aria-pressed={active}
      className={cn(
        "group flex w-full items-start gap-4 rounded-2xl border p-5 text-left transition-all",
        active
          ? "border-brand-primary bg-brand-primary/6 shadow-e3"
          : "border-border-subtle bg-surface-base hover:border-brand-primary/40 hover:shadow-e2",
      )}
    >
      <span
        aria-hidden
        className={cn(
          "mt-0.5 inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-xl font-semibold",
          active ? "bg-brand-primary text-white" : "bg-surface-muted text-ink-tertiary",
        )}
      >
        💬
      </span>
      <div className="flex-1">
        <p className={cn("text-[15px] font-semibold leading-6", active ? "text-brand-primary" : "text-brand-ink")}>
          {scenario.title}
        </p>
        <p className="mt-1.5 line-clamp-2 text-small leading-5 text-ink-tertiary">
          {scenario.userPrompt}
        </p>
      </div>
      <ChevronRight
        aria-hidden
        className={cn(
          "mt-1 h-5 w-5 shrink-0 transition-transform",
          active ? "translate-x-0.5 text-brand-primary" : "text-ink-tertiary",
        )}
      />
    </button>
  );
}
