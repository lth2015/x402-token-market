"use client";

/**
 * B2BCallNotice — live monthly call counter for B2B scenarios.
 *
 * Replaces the static "(演示数据 18,432 / 100,000)" in AgentChatDemo.
 * Fetches /api/payment/b2b-stats on mount and re-fetches whenever the
 * "haba:balance-refresh" custom event fires (emitted by RealAdvisorPanel
 * and AgentRunner after every successful call).
 *
 * Gracefully falls back to a loading state or a "--" placeholder when the
 * backend is unavailable (e.g. cold local dev without docker).
 */
import { useEffect, useState } from "react";
import { Activity } from "lucide-react";

type StatsState =
  | { kind: "loading" }
  | { kind: "ok"; calls: number; cap: number; month: string }
  | { kind: "error" };

async function loadStats(): Promise<StatsState> {
  try {
    const res = await fetch("/api/payment/b2b-stats", { cache: "no-store" });
    const j = await res.json();
    if (j.ok && typeof j.monthly_calls === "number") {
      return { kind: "ok", calls: j.monthly_calls, cap: j.monthly_cap, month: j.month ?? "" };
    }
    return { kind: "error" };
  } catch {
    return { kind: "error" };
  }
}

export function B2BCallNotice() {
  const [stats, setStats] = useState<StatsState>({ kind: "loading" });

  useEffect(() => {
    loadStats().then(setStats);

    function onRefresh() {
      loadStats().then(setStats);
    }
    window.addEventListener("haba:balance-refresh", onRefresh);
    return () => window.removeEventListener("haba:balance-refresh", onRefresh);
  }, []);

  const callsStr =
    stats.kind === "loading"
      ? "…"
      : stats.kind === "error"
        ? "—"
        : stats.calls.toLocaleString("zh-CN");

  const capStr =
    stats.kind === "ok" ? stats.cap.toLocaleString("zh-CN") : "50,000";

  const monthStr = stats.kind === "ok" ? ` · ${stats.month}` : "";

  return (
    <p className="mt-4 flex items-start gap-1.5 rounded-lg bg-surface-muted px-3 py-2 text-caption text-ink-tertiary">
      <Activity className="mt-0.5 h-3 w-3 shrink-0 text-brand-primary" aria-hidden />
      <span>
        本次调用 1 次 → 计入 HABA 月度 Token 套餐{monthStr}
        <span className="ml-1 font-mono font-semibold text-brand-ink">
          {callsStr}
        </span>
        <span className="mx-0.5">/</span>
        <span className="font-mono">{capStr}</span>
        {stats.kind === "loading" && (
          <span className="ml-1 text-ink-tertiary">(加载中…)</span>
        )}
      </span>
    </p>
  );
}
