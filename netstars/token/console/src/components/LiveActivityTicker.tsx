"use client";

/**
 * Live Activity Ticker · the "agent commerce, happening now" view.
 *
 * Inspired by web4.ai's concrete-tx-list visualization (see
 * netstars/token/ui/UX-SPEC.md §5.1 + §17 for the borrow rationale).
 *
 * Polls /v1/recent-activity every 5s. New events slide in from the top.
 * Respects prefers-reduced-motion (no slide-in, no pulse).
 */
import { useEffect, useState } from "react";
import { Brain, CreditCard, AlertTriangle, Key, Activity, ExternalLink } from "lucide-react";
import { cn, formatJPY, formatRelative, formatTokens, formatUSDC } from "@/lib/utils";
import type { ActivityEvent } from "@/lib/api";

const POLL_MS = 5000;

const iconFor = (kind: ActivityEvent["kind"], iconHint: string) => {
  if (iconHint === "🧠") return Brain;
  if (iconHint === "💳") return CreditCard;
  if (iconHint === "⚠")  return AlertTriangle;
  if (iconHint === "🔑") return Key;
  if (kind === "credit") return CreditCard;
  if (kind === "error")  return AlertTriangle;
  return Brain;
};

const colorFor = (kind: ActivityEvent["kind"]) =>
  kind === "credit" ? "text-semantic-success"
  : kind === "error" ? "text-semantic-danger"
  : "text-brand-primary";

export function LiveActivityTicker({
  initial,
  isMock,
}: { initial: ActivityEvent[]; isMock?: boolean }) {
  const [events, setEvents] = useState(initial);
  const [tick, setTick] = useState(0);

  // Re-render every 30s so "Xs ago" stays fresh
  useEffect(() => {
    const id = setInterval(() => setTick((n) => n + 1), 30000);
    return () => clearInterval(id);
  }, []);

  // Poll for new events
  useEffect(() => {
    const id = setInterval(async () => {
      try {
        const res = await fetch("/api/proxy/recent-activity?limit=20", { cache: "no-store" });
        if (!res.ok) return;
        const data = await res.json();
        setEvents(data.items ?? []);
      } catch {
        /* swallow; next tick will retry */
      }
    }, POLL_MS);
    return () => clearInterval(id);
  }, []);

  if (events.length === 0) {
    return (
      <div className="rounded-lg border border-border-subtle bg-surface-base p-8 text-center text-ink-secondary">
        <Activity className="mx-auto mb-2 h-5 w-5 text-ink-tertiary" />
        <p className="text-small">No events yet.</p>
      </div>
    );
  }

  return (
    <section className="rounded-lg border border-border-subtle bg-surface-base shadow-e1">
      <header className="flex items-center justify-between border-b border-border-subtle px-5 py-3">
        <div className="flex items-center gap-2 text-caption uppercase tracking-[1.5px] text-ink-secondary">
          <span
            className="block h-2 w-2 rounded-full bg-semantic-success animate-live-pulse"
            aria-hidden
          />
          Live Activity
        </div>
        <a
          href="/audit"
          className="text-caption text-ink-secondary hover:text-brand-primary"
        >
          View audit log →
        </a>
      </header>

      <ul className="divide-y divide-border-subtle" aria-live="polite">
        {events.map((evt, idx) => {
          const Icon = iconFor(evt.kind, evt.icon);
          return (
            <li
              key={evt.id}
              className={cn(
                "grid grid-cols-[24px_1fr_auto_72px] items-center gap-3 px-5 py-3",
                "hover:bg-surface-muted transition-colors duration-150",
                "animate-slide-in-down"
              )}
              style={{ animationDelay: `${Math.min(idx, 5) * 20}ms` }}
            >
              {/* Icon */}
              <Icon className={cn("h-4 w-4", colorFor(evt.kind))} aria-hidden />

              {/* Description + path */}
              <div className="min-w-0">
                <div className="truncate text-body text-ink-primary">{evt.description}</div>
                <div className="truncate font-mono text-[11px] text-ink-tertiary">
                  {evt.path}
                  <a
                    href={`/audit?trace=${encodeURIComponent(evt.trace_id)}`}
                    className="ml-2 inline-flex items-center gap-0.5 text-ink-tertiary hover:text-brand-primary"
                    title="View trace"
                  >
                    <ExternalLink className="h-3 w-3" />
                    <span className="sr-only">trace</span>
                  </a>
                </div>
              </div>

              {/* Amount (right-aligned, tabular-nums) */}
              <div className={cn("font-mono text-body font-semibold tabular-nums", colorFor(evt.kind))}>
                {evt.kind === "credit"
                  ? `+${formatTokens(evt.amount_token)}`
                  : evt.kind === "error"
                    ? "—"
                    : `−${formatTokens(evt.amount_token)}`}
                {evt.amount_jpy != null && (
                  <span className="ml-2 text-[11px] font-normal text-ink-tertiary">
                    {formatJPY(evt.amount_jpy)}
                  </span>
                )}
                {evt.amount_usdc != null && (
                  <span className="ml-2 text-[11px] font-normal text-ink-tertiary">
                    {formatUSDC(evt.amount_usdc)}
                  </span>
                )}
              </div>

              {/* Relative time */}
              <time
                dateTime={evt.ts}
                className="text-right text-caption text-ink-tertiary"
                /* eslint-disable-next-line react-hooks/exhaustive-deps */
                key={`${evt.id}-${tick}`}
              >
                {formatRelative(evt.ts, "en")}
              </time>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
