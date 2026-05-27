"use client";

import { useState } from "react";
import { Bot, Loader2, Sparkles, AlertCircle, RotateCcw } from "lucide-react";
import { cn } from "@/lib/utils";

type RealAdvisorState =
  | { kind: "idle" }
  | { kind: "loading" }
  | {
      kind: "ok";
      content: string;
      provider: string;
      model: string;
      tokensConsumed: number;
      balanceAfter: number;
    }
  | { kind: "error"; code: "insufficient_balance" | "other"; message: string };

/**
 * One-click "real AI call" trigger. Sits inside AgentChatDemo so each
 * curated scenario also has a live LLM proof: click → POST
 * /api/payment/advise → token-api debits HABA's Token ledger by exact
 * usage → we fire `haba:balance-refresh` so the TopBar pill updates
 * within a tick, and the Console Live Activity Ticker picks up the event
 * on its next refresh.
 *
 * 402 INSUFFICIENT_BALANCE is rendered as a friendly "go top-up" prompt.
 */
export function RealAdvisorPanel({
  scenarioId,
  userPrompt,
  systemHint,
}: {
  scenarioId: string;
  userPrompt: string;
  systemHint?: string;
}) {
  const [state, setState] = useState<RealAdvisorState>({ kind: "idle" });

  async function run() {
    setState({ kind: "loading" });
    try {
      const res = await fetch("/api/payment/advise", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ scenarioId, userPrompt, systemHint }),
      });
      const j = await res.json();
      if (!res.ok || !j.ok) {
        const isInsufficient =
          res.status === 402 ||
          (j?.detail?.error_code === "INSUFFICIENT_BALANCE");
        setState({
          kind: "error",
          code: isInsufficient ? "insufficient_balance" : "other",
          message:
            typeof j?.detail?.detail === "string"
              ? j.detail.detail
              : typeof j?.error === "string"
                ? j.error
                : `HTTP ${res.status}`,
        });
        return;
      }
      setState({
        kind: "ok",
        content: j.content,
        provider: j.provider,
        model: j.model,
        tokensConsumed: j.tokens_consumed,
        balanceAfter: j.balance_after,
      });
      // Make the TopBar pill drop now, not 10s from now.
      window.dispatchEvent(new CustomEvent("haba:balance-refresh"));
    } catch (e) {
      setState({
        kind: "error",
        code: "other",
        message: e instanceof Error ? e.message : "网络异常",
      });
    }
  }

  return (
    <div className="mt-4 rounded-xl border border-dashed border-brand-primary/30 bg-brand-primary/[0.03] p-3">
      <div className="flex items-center justify-between gap-3">
        <p className="text-caption text-ink-secondary">
          <span className="font-semibold text-brand-ink">让 AI 真打一次</span>
          <span className="ml-1 text-ink-tertiary">
            · 调用一次 HABA AI Advisor，实际扣减 Token 余额
          </span>
        </p>
        <button
          type="button"
          onClick={run}
          disabled={state.kind === "loading"}
          className={cn(
            "inline-flex shrink-0 items-center gap-1.5 rounded-lg px-3 py-1.5 text-caption font-semibold transition-colors",
            state.kind === "loading"
              ? "bg-surface-muted text-ink-tertiary"
              : state.kind === "ok"
                ? "border border-brand-primary/40 bg-surface-base text-brand-primary"
                : "bg-brand-primary text-white hover:bg-brand-primary-hover",
          )}
        >
          {state.kind === "loading" ? (
            <>
              <Loader2 className="h-3 w-3 animate-spin" aria-hidden /> 调用中…
            </>
          ) : state.kind === "ok" ? (
            <>
              <RotateCcw className="h-3 w-3" aria-hidden /> 再打一次
            </>
          ) : (
            <>
              <Sparkles className="h-3 w-3" aria-hidden /> 真打一次
            </>
          )}
        </button>
      </div>

      {state.kind === "ok" && <OkPanel state={state} />}
      {state.kind === "error" && <ErrPanel state={state} />}
    </div>
  );
}

function OkPanel({ state }: { state: Extract<RealAdvisorState, { kind: "ok" }> }) {
  return (
    <div className="mt-3 rounded-lg bg-surface-base p-3 ring-1 ring-brand-primary/15">
      <div className="flex items-baseline justify-between gap-3 text-caption">
        <div className="flex items-center gap-2">
          <span className="inline-flex h-5 w-5 items-center justify-center rounded-full bg-brand-primary text-white">
            <Bot className="h-3 w-3" aria-hidden />
          </span>
          <span className="font-semibold text-brand-primary">HABA AI Advisor · 实时</span>
          <span className="text-[10px] uppercase tracking-wider text-ink-tertiary">
            {state.provider} / {state.model}
          </span>
        </div>
        <div className="flex items-baseline gap-1 font-mono text-[11px] text-ink-tertiary">
          <span className="text-semantic-danger">−{state.tokensConsumed.toLocaleString()}</span>
          <span>Token · 余额</span>
          <span className="font-semibold text-brand-ink">
            {state.balanceAfter.toLocaleString()}
          </span>
        </div>
      </div>
      <p className="mt-3 whitespace-pre-wrap text-small text-ink-primary">{state.content}</p>
    </div>
  );
}

function ErrPanel({ state }: { state: Extract<RealAdvisorState, { kind: "error" }> }) {
  if (state.code === "insufficient_balance") {
    return (
      <div className="mt-3 rounded-lg border border-semantic-warning/30 bg-semantic-warning/5 p-3">
        <div className="flex items-center gap-2 text-caption font-semibold text-semantic-warning">
          <AlertCircle className="h-3 w-3" aria-hidden /> Token 余额不足
        </div>
        <p className="mt-1.5 text-caption text-ink-secondary">
          请先去{" "}
          <a href="/topup" className="font-medium text-brand-primary underline">
            AI Token 充值
          </a>{" "}
          页给 HABA 钱包补一次，然后再试。
        </p>
      </div>
    );
  }
  return (
    <div className="mt-3 rounded-lg border border-semantic-danger/30 bg-semantic-danger/5 p-3">
      <div className="flex items-center gap-2 text-caption font-semibold text-semantic-danger">
        <AlertCircle className="h-3 w-3" aria-hidden /> 调用失败
      </div>
      <p className="mt-1 break-words text-caption text-ink-secondary">{state.message}</p>
    </div>
  );
}
