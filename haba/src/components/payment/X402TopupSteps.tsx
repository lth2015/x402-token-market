"use client";

import { useEffect, useMemo, useState } from "react";
import { ArrowRight, Pause, Play, RotateCcw } from "lucide-react";
import type { PaymentActorKind, X402PaymentStep } from "@/lib/haba";
import { cn } from "@/lib/utils";
import { ActorAvatar } from "./ActorAvatar";

/**
 * 8-step payment flow visualizer with autoplay.
 *
 * - Auto-advances 1 → 8 → loop, 1.6s per step.
 * - Click a row to pin (toggles pause).
 * - "Highlighted" step shows: bold border + ring + detail panel below.
 *
 * Header derives the actor lane sequence from the step list, so the same
 * component can render both 场景 A (HABA top-up) and 场景 B (consumer
 * checkout) without hardcoding actor names.
 */
function deriveLanes(steps: readonly X402PaymentStep[]): PaymentActorKind[] {
  const seen = new Set<PaymentActorKind>();
  const ordered: PaymentActorKind[] = [];
  for (const s of steps) {
    for (const a of [s.fromActor, s.toActor]) {
      if (!seen.has(a)) {
        seen.add(a);
        ordered.push(a);
      }
    }
  }
  return ordered;
}
export function X402TopupSteps({
  steps,
  title,
  subtitle,
  intervalMs = 1600,
}: {
  steps: readonly X402PaymentStep[];
  title?: string;
  subtitle?: string;
  intervalMs?: number;
}) {
  const [activeIdx, setActiveIdx] = useState(0);
  const [paused, setPaused] = useState(false);
  const lanes = useMemo(() => deriveLanes(steps), [steps]);

  useEffect(() => {
    if (paused) return;
    const id = setInterval(() => {
      setActiveIdx((i) => (i + 1) % steps.length);
    }, intervalMs);
    return () => clearInterval(id);
  }, [paused, steps.length, intervalMs]);

  const active = steps[activeIdx];

  return (
    <div className="overflow-hidden rounded-2xl border border-border-subtle bg-surface-base shadow-e2">
      {/* header — actor lanes */}
      <div className="flex flex-col gap-3 border-b border-border-subtle bg-surface-muted px-6 py-5 sm:flex-row sm:items-center sm:justify-between">
        <div>
          {title && <h3 className="text-body font-semibold text-brand-ink">{title}</h3>}
          {subtitle && <p className="mt-0.5 text-caption text-ink-secondary">{subtitle}</p>}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {lanes.map((a, i) => (
            <span key={a} className="flex items-center gap-2">
              <ActorAvatar actor={a} size="sm" emphasized />
              {i < lanes.length - 1 && (
                <ArrowRight className="h-3 w-3 text-ink-tertiary" aria-hidden />
              )}
            </span>
          ))}
        </div>
      </div>

      {/* step rows */}
      <ol className="divide-y divide-border-subtle">
        {steps.map((s, i) => {
          const isActive = i === activeIdx;
          return (
            <li key={s.n}>
              <button
                type="button"
                onClick={() => {
                  setActiveIdx(i);
                  setPaused(true);
                }}
                aria-current={isActive ? "step" : undefined}
                className={cn(
                  "flex w-full items-start gap-4 px-6 py-4 text-left transition-colors",
                  isActive
                    ? "bg-brand-primary/5 ring-1 ring-inset ring-brand-primary/30"
                    : "hover:bg-surface-muted/40",
                )}
              >
                <span
                  className={cn(
                    "mt-0.5 inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-caption font-semibold",
                    isActive
                      ? "bg-brand-primary text-white"
                      : "bg-surface-muted text-ink-tertiary",
                  )}
                >
                  {s.n}
                </span>
                <div className="flex-1">
                  <div className="flex flex-wrap items-center gap-2 text-small">
                    <ActorAvatar actor={s.fromActor} size="sm" emphasized={isActive} />
                    <ArrowRight className="h-3.5 w-3.5 text-ink-tertiary" aria-hidden />
                    <ActorAvatar actor={s.toActor} size="sm" emphasized={isActive} />
                  </div>
                  <p
                    className={cn(
                      "mt-1.5 font-medium",
                      isActive ? "text-brand-ink" : "text-ink-primary",
                    )}
                  >
                    {s.label}
                  </p>
                  <p className="mt-0.5 text-caption text-ink-secondary">{s.note}</p>
                </div>
              </button>
            </li>
          );
        })}
      </ol>

      {/* control + active detail */}
      <div className="border-t border-border-subtle bg-surface-muted px-6 py-4">
        <div className="flex items-center justify-between gap-4">
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setPaused((p) => !p)}
              className="inline-flex items-center gap-1.5 rounded-lg border border-border-default bg-surface-base px-3 py-1.5 text-caption font-medium text-ink-secondary hover:text-brand-primary"
            >
              {paused ? (
                <>
                  <Play className="h-3 w-3" aria-hidden />
                  播放
                </>
              ) : (
                <>
                  <Pause className="h-3 w-3" aria-hidden />
                  暂停
                </>
              )}
            </button>
            <button
              type="button"
              onClick={() => {
                setActiveIdx(0);
                setPaused(false);
              }}
              className="inline-flex items-center gap-1.5 rounded-lg border border-border-default bg-surface-base px-3 py-1.5 text-caption font-medium text-ink-secondary hover:text-brand-primary"
            >
              <RotateCcw className="h-3 w-3" aria-hidden />
              重播
            </button>
          </div>
          <p className="text-caption text-ink-tertiary">
            正在执行 <span className="font-semibold text-brand-ink">{active.n} / {steps.length}</span>
          </p>
        </div>
        {active.detailZh && (
          <p className="mt-3 rounded-lg bg-surface-base px-3 py-2 text-caption text-ink-secondary">
            {active.detailZh}
          </p>
        )}
      </div>
    </div>
  );
}
