"use client";

import { useEffect, useState } from "react";
import { Zap, AlertCircle } from "lucide-react";
import { cn, formatTokenCount } from "@/lib/utils";

type BalanceState =
  | { kind: "loading" }
  | { kind: "ok"; balanceToken: number; usdcEquivalent: string }
  | { kind: "error"; message: string };

/**
 * Live HABA Token balance pill — fetched server-side via /api/payment/balance,
 * polled every 10s. Surfaces in HabaTopBar so every page sees the real
 * HABA Token balance.
 *
 * Refetch trigger: listens for window `haba:balance-refresh` events so any
 * other component (e.g. RealTopupButton on /topup success) can poke us
 * without waiting for the next poll tick.
 */
export function TokenBalancePill() {
  const [state, setState] = useState<BalanceState>({ kind: "loading" });

  async function load() {
    try {
      const res = await fetch("/api/payment/balance", { cache: "no-store" });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        setState({ kind: "error", message: body.error ?? `HTTP ${res.status}` });
        return;
      }
      const j = (await res.json()) as { balance_token: string; usdc_equivalent: string };
      setState({
        kind: "ok",
        balanceToken: Number(j.balance_token) || 0,
        usdcEquivalent: j.usdc_equivalent,
      });
    } catch (e) {
      setState({ kind: "error", message: e instanceof Error ? e.message : "fetch failed" });
    }
  }

  useEffect(() => {
    load();
    const id = setInterval(load, 10_000);
    const handler = () => load();
    window.addEventListener("haba:balance-refresh", handler);
    return () => {
      clearInterval(id);
      window.removeEventListener("haba:balance-refresh", handler);
    };
  }, []);

  return (
    <div
      className={cn(
        "hidden items-center gap-1.5 rounded-full border px-3 py-1 text-caption md:inline-flex",
        state.kind === "ok" && "border-brand-primary/30 bg-brand-primary/5 text-brand-primary",
        state.kind === "loading" && "border-border-subtle bg-surface-muted text-ink-tertiary",
        state.kind === "error" && "border-semantic-warning/30 bg-semantic-warning/5 text-semantic-warning",
      )}
      title="HABA Token 实时余额"
    >
      {state.kind === "error" ? (
        <AlertCircle className="h-3 w-3" aria-hidden />
      ) : (
        <Zap className={cn("h-3 w-3", state.kind === "loading" && "animate-pulse")} aria-hidden />
      )}
      {state.kind === "loading" && <span>读取中…</span>}
      {state.kind === "ok" && (
        <>
          <span className="font-semibold">{formatTokenCount(state.balanceToken)}</span>
          <span className="text-ink-tertiary">Token</span>
          <span className="text-ink-tertiary">·</span>
          <span className="text-ink-tertiary">{state.usdcEquivalent} USDC</span>
        </>
      )}
      {state.kind === "error" && (
        <span title={state.message}>后端不可达</span>
      )}
    </div>
  );
}
