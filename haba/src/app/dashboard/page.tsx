"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import {
  Play, Terminal, CheckCircle2, Loader2, Circle,
  Zap, BotMessageSquare, RefreshCw, AlertCircle,
} from "lucide-react";
import { MOCK_KPI, MOCK_MODEL_STATS } from "@/lib/haba/enterprise";
import { KpiCard } from "@/components/enterprise/KpiCard";
import { ModelStatsCard } from "@/components/enterprise/ModelStatsCard";
import { ConsumptionTrendChart } from "@/components/enterprise/ConsumptionTrendChart";
import { cn } from "@/lib/utils";

// ── constants ──────────────────────────────────────────────────────
const TOKEN_LIMIT = 1_000_000_000;     // 1B default
const AUTO_TOPUP_THRESHOLD = 0.8;      // fire when 80 % of limit is used
const POLL_INTERVAL_MS = 3_000;

const AGENT_TASKS = [
  { id: "pricing",   label: "Competitor Pricing",  desc: "Analyze SKU pricing strategy, recommend adjustments",  est: "~8K tokens"  },
  { id: "copy",      label: "EN/JP Product Copy",  desc: "Generate English + Japanese new product descriptions",  est: "~15K tokens" },
  { id: "logistics", label: "Logistics Evaluation", desc: "Compare DHL/EMS/SAL delivery time and cost",           est: "~6K tokens"  },
] as const;

type TaskId = typeof AGENT_TASKS[number]["id"];
type StepState = "pending" | "active" | "done" | "error";

// ── helpers ────────────────────────────────────────────────────────
function fmt(n: number): string {
  if (n >= 1_000_000_000) return `${(n / 1_000_000_000).toFixed(2)}B`;
  if (n >= 1_000_000)     return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000)         return `${(n / 1_000).toFixed(0)}K`;
  return n.toLocaleString();
}

function usedPct(balance: number): number {
  return (TOKEN_LIMIT - balance) / TOKEN_LIMIT;
}

// ── sub-components ─────────────────────────────────────────────────
function TopupStepper({ steps }: { steps: StepState[] }) {
  const LABELS = ["Create Order", "x402 Sign", "Solana Settle"];
  return (
    <div className="flex items-center gap-2">
      {LABELS.map((label, i) => {
        const s = steps[i] ?? "pending";
        return (
          <div key={label} className="flex items-center gap-1.5">
            {s === "done"  && <CheckCircle2 className="h-4 w-4 text-semantic-success" aria-hidden />}
            {s === "active" && <Loader2 className="h-4 w-4 animate-spin text-brand-primary" aria-hidden />}
            {s === "error" && <AlertCircle className="h-4 w-4 text-semantic-danger" aria-hidden />}
            {s === "pending" && <Circle className="h-4 w-4 text-ink-tertiary" aria-hidden />}
            <span className={cn(
              "text-caption",
              s === "done"  ? "text-semantic-success font-medium" :
              s === "active" ? "text-brand-primary font-medium" :
              s === "error"  ? "text-semantic-danger" :
              "text-ink-tertiary",
            )}>{label}</span>
            {i < LABELS.length - 1 && (
              <span className="text-ink-tertiary mx-0.5">→</span>
            )}
          </div>
        );
      })}
    </div>
  );
}

function Toast({ message, onDismiss }: { message: string; onDismiss: () => void }) {
  useEffect(() => {
    const t = setTimeout(onDismiss, 4000);
    return () => clearTimeout(t);
  }, [onDismiss]);

  return (
    <div
      role="status"
      aria-live="polite"
      className="fixed bottom-6 right-6 z-50 flex items-center gap-2 rounded-xl bg-semantic-success/10 border border-semantic-success/30 px-4 py-3 shadow-e2 text-small font-medium text-semantic-success"
    >
      <CheckCircle2 className="h-4 w-4 shrink-0" aria-hidden />
      {message}
    </div>
  );
}

// ── main page ──────────────────────────────────────────────────────
export default function DashboardPage() {
  const kpi = MOCK_KPI;

  // live balance
  const [balance, setBalance]           = useState<number | null>(null);
  const [balanceErr, setBalanceErr]     = useState(false);

  // agent
  const [selectedTask, setSelectedTask] = useState<TaskId | null>(null);
  const [agentRunning, setAgentRunning] = useState(false);
  const [agentOutput, setAgentOutput]   = useState<string>("");
  const [agentMeta, setAgentMeta]       = useState<{
    inputTokens: number; outputTokens: number; costToken: number;
    balanceAfter: number | null; isStub: boolean;
  } | null>(null);

  // topup
  const [topupSteps, setTopupSteps]     = useState<StepState[]>(["pending", "pending", "pending"]);
  const [topupRunning, setTopupRunning] = useState(false);
  const [topupMode, setTopupMode]       = useState<"x402" | "direct" | null>(null);
  const autoTopupFired                  = useRef(false);

  // toast
  const [toast, setToast]               = useState<string | null>(null);

  // ── balance poll ─────────────────────────────────────────────────
  const fetchBalance = useCallback(async () => {
    try {
      const res = await fetch("/api/enterprise/balance");
      if (res.ok) {
        const d = await res.json();
        setBalance(parseInt(d.balance_token as string, 10));
        setBalanceErr(false);
      } else {
        setBalanceErr(true);
      }
    } catch { setBalanceErr(true); }
  }, []);

  useEffect(() => {
    fetchBalance();
    const id = setInterval(fetchBalance, POLL_INTERVAL_MS);
    return () => clearInterval(id);
  }, [fetchBalance]);

  // ── auto-topup check ─────────────────────────────────────────────
  const triggerTopup = useCallback(async () => {
    if (topupRunning) return;
    setTopupRunning(true);
    setTopupMode(null);
    setTopupSteps(["active", "pending", "pending"]);

    try {
      const res = await fetch("/api/enterprise/topup", { method: "POST" });
      const data = await res.json() as {
        ok: boolean; mode: "x402" | "direct";
        steps: { name: string; status: "done" | "error" }[];
        tokens_credited: number;
      };

      const newSteps: StepState[] = data.steps.map(s => s.status === "done" ? "done" : "error");
      while (newSteps.length < 3) newSteps.push("pending");
      setTopupSteps(newSteps);

      if (data.ok) {
        setTopupMode(data.mode);
        const modeLabel = data.mode === "x402" ? "x402 · Solana" : "Auto Topup";
        setToast(`+100,000,000 Tokens topped up (${modeLabel})`);
        await fetchBalance(); // immediate refresh
      }
    } catch {
      setTopupSteps(["error", "pending", "pending"]);
    } finally {
      setTopupRunning(false);
    }
  }, [topupRunning, fetchBalance]);

  useEffect(() => {
    if (balance === null || topupRunning || autoTopupFired.current) return;
    if (usedPct(balance) >= AUTO_TOPUP_THRESHOLD) {
      autoTopupFired.current = true;
      triggerTopup();
    }
  }, [balance, topupRunning, triggerTopup]);

  // reset the auto-topup gate after a successful topup so it can re-fire
  useEffect(() => {
    if (!topupRunning && topupMode !== null) {
      autoTopupFired.current = false;
    }
  }, [topupRunning, topupMode]);

  // ── run agent ─────────────────────────────────────────────────────
  const runAgent = useCallback(async (taskId: TaskId) => {
    if (agentRunning) return;
    setSelectedTask(taskId);
    setAgentRunning(true);
    setAgentOutput("");
    setAgentMeta(null);

    try {
      const res = await fetch("/api/enterprise/run-agent", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ task: taskId }),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({})) as { error?: string };
        setAgentOutput(`[Error] ${err.error ?? "Agent call failed"}`);
        return;
      }

      const data = await res.json() as {
        content: string; is_stub: boolean;
        usage: { input_tokens: number; output_tokens: number; cost_token: number; balance_after: number | null };
      };

      // typewriter effect
      const text = data.content;
      let i = 0;
      await new Promise<void>(resolve => {
        const tick = setInterval(() => {
          i = Math.min(i + 4, text.length);
          setAgentOutput(text.slice(0, i));
          if (i >= text.length) { clearInterval(tick); resolve(); }
        }, 18);
      });

      setAgentMeta({
        inputTokens:  data.usage.input_tokens,
        outputTokens: data.usage.output_tokens,
        costToken:    data.usage.cost_token,
        balanceAfter: data.usage.balance_after,
        isStub:       data.is_stub,
      });

      if (data.usage.balance_after !== null) {
        setBalance(data.usage.balance_after);
      } else {
        await fetchBalance();
      }
    } catch {
      setAgentOutput("[Error] Network error, please retry.");
    } finally {
      setAgentRunning(false);
    }
  }, [agentRunning, fetchBalance]);

  // ── derived display values ────────────────────────────────────────
  const liveBalance       = balance ?? kpi.monthlyTokenUsage;
  const liveUsed          = TOKEN_LIMIT - liveBalance;
  const liveUsedPct       = ((liveUsed / TOKEN_LIMIT) * 100).toFixed(1);
  const budgetPct         = ((kpi.currentBudgetUsed / kpi.budgetLimit) * 100).toFixed(0);
  const showTopupBanner   = topupRunning || topupMode !== null;

  return (
    <main className="mx-auto w-full max-w-7xl px-6 py-8 lg:px-10">

      {/* ── Header ─────────────────────────────────────────────── */}
      <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-lg font-semibold text-ink-primary">AI Usage Dashboard</h1>
          <p className="text-caption text-ink-tertiary">HABA Enterprise · GPT-4.1</p>
        </div>
        <div className="flex items-center gap-2">
          {/* live balance badge */}
          <div className={cn(
            "flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-small tabular-nums",
            balanceErr
              ? "border-semantic-danger/30 bg-semantic-danger/5 text-semantic-danger"
              : "border-border-default bg-surface-muted text-ink-secondary",
          )}>
            <Zap className="h-3.5 w-3.5 shrink-0 text-brand-primary" aria-hidden />
            <span className="font-semibold text-ink-primary">
              {balance === null ? "—" : fmt(liveBalance)}
            </span>
            <span>Tokens remaining</span>
            {balance === null && !balanceErr && (
              <Loader2 className="h-3 w-3 animate-spin" aria-hidden />
            )}
          </div>
          <span className="text-caption text-ink-tertiary">Month-to-date · June 2026</span>
        </div>
      </div>

      {/* ── Auto-topup banner ───────────────────────────────────── */}
      {showTopupBanner && (
        <div className={cn(
          "mb-5 flex flex-wrap items-center justify-between gap-3 rounded-xl border px-5 py-3.5",
          topupMode === null
            ? "border-brand-border bg-brand-primary/5"
            : topupMode === "x402"
              ? "border-semantic-success/30 bg-semantic-success/5"
              : "border-semantic-warning/30 bg-semantic-warning/5",
        )}>
          <div className="flex items-center gap-2">
            <RefreshCw className={cn(
              "h-4 w-4 shrink-0",
              topupRunning ? "animate-spin text-brand-primary" : "text-semantic-success",
            )} aria-hidden />
            <span className="text-small font-semibold text-ink-primary">
              {topupRunning ? "Auto Topup in progress…" : topupMode === "x402" ? "Auto Topup complete · x402 on Solana" : "Auto Topup complete"}
            </span>
          </div>
          <TopupStepper steps={topupSteps} />
        </div>
      )}

      {/* ── Run Agent card ──────────────────────────────────────── */}
      <section
        aria-label="Run Agent"
        className="mb-6 rounded-xl border border-border-default bg-surface-elevated p-5 shadow-e1"
      >
        <div className="mb-3 flex items-center gap-2">
          <BotMessageSquare className="h-4 w-4 text-brand-primary" aria-hidden />
          <h2 className="text-small font-semibold text-ink-primary">Cross-border E-commerce Agent</h2>
          <span className="ml-auto text-caption text-ink-tertiary">GPT-4.1 · Real Token Consumption</span>
        </div>

        {/* Task selector */}
        <div className="flex flex-wrap gap-2">
          {AGENT_TASKS.map((task) => (
            <button
              key={task.id}
              type="button"
              disabled={agentRunning}
              onClick={() => runAgent(task.id)}
              aria-pressed={selectedTask === task.id}
              className={cn(
                "group flex flex-col rounded-lg border px-4 py-2.5 text-left transition-all",
                "hover:border-brand-primary/50 hover:bg-brand-primary/5 cursor-pointer",
                "disabled:cursor-not-allowed disabled:opacity-50",
                selectedTask === task.id && !agentRunning
                  ? "border-brand-primary/60 bg-brand-primary/5"
                  : "border-border-default bg-surface-muted",
              )}
            >
              <span className="text-small font-medium text-ink-primary">{task.label}</span>
              <span className="mt-0.5 text-caption text-ink-tertiary">{task.desc}</span>
              <span className="mt-1 text-caption text-brand-primary tabular-nums">{task.est}</span>
            </button>
          ))}
          <button
            type="button"
            disabled={agentRunning || !selectedTask}
            onClick={() => selectedTask && runAgent(selectedTask)}
            className={cn(
              "ml-auto flex items-center gap-2 self-end rounded-lg px-4 py-2.5",
              "bg-brand-primary !text-white text-small font-medium shadow-e1",
              "hover:bg-brand-primary-hover hover:shadow-e2 transition-all active:scale-[0.98]",
              "disabled:opacity-60 disabled:cursor-not-allowed disabled:scale-100",
            )}
            aria-label="Run selected agent task"
          >
            {agentRunning
              ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
              : <Play className="h-4 w-4" aria-hidden />
            }
            {agentRunning ? "Running…" : "Run"}
          </button>
        </div>

        {/* Agent output */}
        {(agentOutput || agentRunning) && (
          <div className="mt-4 rounded-lg border border-border-default bg-surface-muted p-4">
            <div className="mb-2 flex items-center gap-1.5 text-caption text-ink-tertiary">
              <Terminal className="h-3.5 w-3.5" aria-hidden />
              <span>Agent Output</span>
              {agentRunning && <Loader2 className="ml-auto h-3 w-3 animate-spin" aria-hidden />}
            </div>
            <p className="whitespace-pre-wrap font-mono text-small text-ink-primary leading-relaxed min-h-[2rem]">
              {agentOutput}
              {agentRunning && <span className="inline-block w-1.5 h-4 bg-brand-primary ml-0.5 animate-pulse align-middle" aria-hidden />}
            </p>
            {agentMeta && (
              <div className="mt-3 flex flex-wrap gap-x-6 gap-y-1 border-t border-border-default pt-2.5 text-caption text-ink-tertiary">
                <span>Input <span className="tabular-nums font-medium text-ink-secondary">{agentMeta.inputTokens.toLocaleString()}</span></span>
                <span>Output <span className="tabular-nums font-medium text-ink-secondary">{agentMeta.outputTokens.toLocaleString()}</span></span>
                <span>Cost <span className="tabular-nums font-medium text-semantic-warning">{agentMeta.costToken.toLocaleString()}</span> Tokens</span>
                {agentMeta.balanceAfter !== null && (
                  <span className="ml-auto">Balance <span className="tabular-nums font-semibold text-ink-primary">{fmt(agentMeta.balanceAfter)}</span></span>
                )}

              </div>
            )}
          </div>
        )}
      </section>

      {/* ── KPI Grid ────────────────────────────────────────────── */}
      <section aria-label="Key metrics" className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <KpiCard
          label="Active Users Online"
          value={kpi.activeUsersOnline.toLocaleString()}
          delta={{ label: "live now", tone: "up" }}
        />
        <KpiCard
          label="Today Token Usage"
          value={fmt(kpi.todayTokenUsage)}
          unit="tokens"
        />
        <KpiCard
          label="Weekly Token Usage"
          value={fmt(kpi.weeklyTokenUsage)}
          unit="tokens"
          delta={{ label: "+6.3% vs last week", tone: "up" }}
        />
        <KpiCard
          label="Monthly Token Usage"
          value={fmt(liveUsed)}
          unit="tokens"
          delta={{ label: `${liveUsedPct}% of 1B limit`, tone: "neutral" }}
        />
        <KpiCard
          label="Current Budget Usage"
          value={`$${kpi.currentBudgetUsed.toLocaleString()}`}
          delta={{ label: `${budgetPct}% of $${kpi.budgetLimit.toLocaleString()}`, tone: "neutral" }}
        />
        <KpiCard
          label="Token Balance"
          value={balance === null ? "—" : fmt(liveBalance)}
          unit="tokens"
          delta={{ label: balance === null ? "loading…" : `${(100 - parseFloat(liveUsedPct)).toFixed(1)}% remaining`, tone: "up" }}
        />
      </section>

      {/* ── Model + Trend ───────────────────────────────────────── */}
      <section aria-label="AI model and consumption" className="mt-6 grid grid-cols-1 gap-6 lg:grid-cols-3">
        <div className="lg:col-span-1">
          <ModelStatsCard stats={MOCK_MODEL_STATS} />
        </div>
        <div className="lg:col-span-2">
          <ConsumptionTrendChart />
        </div>
      </section>

      {/* ── Toast ───────────────────────────────────────────────── */}
      {toast && <Toast message={toast} onDismiss={() => setToast(null)} />}
    </main>
  );
}
