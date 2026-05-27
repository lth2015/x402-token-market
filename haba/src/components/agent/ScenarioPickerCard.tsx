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
        "group flex w-full items-start gap-3 rounded-xl border p-4 text-left transition-all",
        active
          ? "border-brand-primary bg-brand-primary/5 shadow-e2"
          : "border-border-subtle bg-surface-base hover:border-brand-primary/40 hover:shadow-e1",
      )}
    >
      <span
        aria-hidden
        className={cn(
          "mt-0.5 inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-caption font-semibold",
          active ? "bg-brand-primary text-white" : "bg-surface-muted text-ink-tertiary",
        )}
      >
        💬
      </span>
      <div className="flex-1">
        <p className={cn("text-small font-medium", active ? "text-brand-primary" : "text-brand-ink")}>
          {scenario.title}
        </p>
        <p className="mt-1 line-clamp-2 text-caption text-ink-tertiary">
          {scenario.userPrompt}
        </p>
      </div>
      <ChevronRight
        aria-hidden
        className={cn(
          "mt-0.5 h-4 w-4 shrink-0 transition-transform",
          active ? "translate-x-0.5 text-brand-primary" : "text-ink-tertiary",
        )}
      />
    </button>
  );
}
