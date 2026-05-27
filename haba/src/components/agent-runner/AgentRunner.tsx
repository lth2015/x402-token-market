"use client";

import { useEffect, useRef, useState } from "react";
import { Bot, Play, Square, Zap } from "lucide-react";
import { cn, formatTokenCount } from "@/lib/utils";

type Phase = "idle" | "running" | "done" | "stopped";

type LogLevel = "info" | "step" | "http" | "warn" | "ok" | "error";

type LogEntry = {
  id: string;
  ts: string; // HH:MM:SS.mmm
  level: LogLevel;
  text: string;
};

const SCENARIOS = [
  {
    id: "advise-burst",
    title: "5 连击 · 顾客咨询",
    description:
      "机器人连续问 5 个不同的健康食品问题。每问一次扣 Token，演示稳态调用 + 实时余额。",
  },
  {
    id: "advise-until-empty",
    title: "调到余额低 → 自动 topup → 继续",
    description:
      "重复调用直到 Token 余额跌破阈值，触发 /v1/token-purchase 自动补足，然后继续跑剩余调用 — 没有人工干预。",
  },
  {
    id: "b2b-multi-channel",
    title: "B2B 多渠道 · 4 频道轮流调用",
    description:
      "模拟药局、医院营养科、独立营养师、合作电商 4 个 B2B 渠道各发起 3 轮调用（共 12 次）。展示多租户高频场景下 Token 消耗模式，触发一次自动充值。",
  },
] as const;

type ScenarioId = (typeof SCENARIOS)[number]["id"];

const FIVE_PROMPTS = [
  "我妈刚查出糖尿病前期，想给她找一款低卡甜味料，每天加咖啡用。",
  "我做无糖饼干，需要 1:1 替换砂糖、烘焙 180°C 不焦化的代糖。",
  "早餐想吃低卡果酱涂吐司，希望不是粘稠的甜得发腻。",
  "减脂期间想吃零食，又不想全是蛋白棒，给我几个低卡糖果方案。",
  "我外公 72 岁，眼神不好。给他控糖的产品要简单好认。",
];

/** B2B 多渠道剧本 — 4 个 partner 频道的典型调用提示词 */
const B2B_CHANNEL_PROMPTS: Array<{ channel: string; label: string; prompt: string }> = [
  {
    channel: "pharmacy",
    label: "药局前台",
    prompt:
      "[context] store=ABC 药局梅田店, customer_age=60+\n" +
      "顾客：医生让少糖，老婆让来买代糖，家里要泡咖啡也要煮甜煮物。",
  },
  {
    channel: "hospital",
    label: "医院营养科",
    prompt:
      "[context] dept=营养指导科, client_profile={age:62, dx:糖尿病前期, goal:出院后控糖}\n" +
      "营养师：给患者出一周早餐与零食建议，避免砂糖、要可执行。",
  },
  {
    channel: "dietitian",
    label: "独立营养师",
    prompt:
      "[context] client_profile={age:45, goal:减脂5kg, restrictions:[乳糖不耐]}\n" +
      "营养师：给这位客户出一周早餐 + 下午茶建议，控糖、避乳制品。",
  },
  {
    channel: "ec_partner",
    label: "合作电商",
    prompt:
      "[context] surface=ecommerce_home, widget=health_advisor\n" +
      "访客：最近在减肥，但是早上还是想吃面包配果酱怎么办？",
  },
];

// In stub mode the per-call debit is ~150 Token, which against a 100M+
// balance never crosses any "real" topup threshold. For the demo we set
// the trigger relative to the starting balance — after a few hundred
// Token of cumulative burn the autopilot kicks in. Replace with an
// absolute number once real LLM keys are wired and per-call cost grows.
const DEMO_AUTOPILOT_BURN_TRIGGER_TOKEN = 500;

export function AgentRunner() {
  const [phase, setPhase] = useState<Phase>("idle");
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [startedBalance, setStartedBalance] = useState<number | null>(null);
  const [currentBalance, setCurrentBalance] = useState<number | null>(null);
  const stopRef = useRef(false);
  const seqRef = useRef(0);

  const logEnd = useRef<HTMLDivElement>(null);
  useEffect(() => {
    logEnd.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [logs]);

  function appendLog(level: LogLevel, text: string) {
    const now = new Date();
    const pad = (n: number, w = 2) => String(n).padStart(w, "0");
    const ts = `${pad(now.getHours())}:${pad(now.getMinutes())}:${pad(now.getSeconds())}.${pad(now.getMilliseconds(), 3)}`;
    seqRef.current += 1;
    setLogs((prev) => [...prev, { id: `${seqRef.current}-${now.getTime()}`, ts, level, text }]);
  }

  function reset() {
    stopRef.current = false;
    seqRef.current = 0;
    setLogs([]);
    setStartedBalance(null);
    setCurrentBalance(null);
  }

  async function sleep(ms: number) {
    return new Promise<void>((r) => setTimeout(r, ms));
  }

  async function fetchBalance(): Promise<number> {
    const res = await fetch("/api/payment/balance", { cache: "no-store" });
    if (!res.ok) throw new Error(`balance ${res.status}`);
    const j = (await res.json()) as { balance_token: string };
    return Number(j.balance_token) || 0;
  }

  async function fireAdvise(prompt: string): Promise<{ tokensConsumed: number; balanceAfter: number; content: string }> {
    const res = await fetch("/api/payment/advise", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        scenarioId: "agent-runner",
        userPrompt: prompt,
        systemHint: "Persona: machine_user (B2B-billed).",
      }),
    });
    const j = await res.json();
    if (!res.ok || !j.ok) {
      throw new Error(typeof j?.error === "string" ? j.error : `advise ${res.status}`);
    }
    return { tokensConsumed: j.tokens_consumed, balanceAfter: j.balance_after, content: String(j.content ?? "") };
  }

  async function fireTopup(amountUsdc = 10): Promise<{ txHash: string | null; balanceAfter: number }> {
    const res = await fetch("/api/payment/topup", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ amount_usdc: amountUsdc }),
    });
    const j = await res.json();
    if (!res.ok || !j.ok) {
      throw new Error(typeof j?.error === "string" ? j.error : `topup ${res.status}`);
    }
    // re-read balance because topup response carries credit summary not balance directly
    const after = await fetchBalance();
    return { txHash: j.tx_hash, balanceAfter: after };
  }

  async function runScenario(id: ScenarioId) {
    reset();
    setPhase("running");
    try {
      appendLog("info", `▶ scenario: ${id}`);
      appendLog("http", "GET /v1/balance");
      const start = await fetchBalance();
      setStartedBalance(start);
      setCurrentBalance(start);
      appendLog("ok", `balance = ${formatTokenCount(start)} Token`);

      if (id === "advise-burst") {
        for (let i = 0; i < FIVE_PROMPTS.length; i++) {
          if (stopRef.current) break;
          await sleep(280);
          appendLog("step", `→ call ${i + 1}/${FIVE_PROMPTS.length}`);
          appendLog("http", `POST /v1/messages   "${FIVE_PROMPTS[i].slice(0, 38)}…"`);
          const r = await fireAdvise(FIVE_PROMPTS[i]);
          setCurrentBalance(r.balanceAfter);
          appendLog("ok", `−${r.tokensConsumed} Token · balance = ${formatTokenCount(r.balanceAfter)}`);
          window.dispatchEvent(new CustomEvent("haba:balance-refresh"));
        }
        appendLog("info", "✓ done");
        setPhase("done");
        return;
      }

      // ── b2b-multi-channel ──────────────────────────────────────────
      if (id === "b2b-multi-channel") {
        const ROUNDS = 3;
        const total = ROUNDS * B2B_CHANNEL_PROMPTS.length; // 12
        let callNum = 0;
        let topupFired = false;
        for (let round = 0; round < ROUNDS; round++) {
          if (stopRef.current) break;
          appendLog("info", `── Round ${round + 1}/${ROUNDS} ──`);
          for (const ch of B2B_CHANNEL_PROMPTS) {
            if (stopRef.current) break;
            callNum += 1;
            await sleep(320);
            appendLog("step", `→ [${ch.label}] call ${callNum}/${total}`);
            appendLog(
              "http",
              `POST /v1/messages   system=b2b_${ch.channel}  "${ch.prompt.slice(0, 36)}…"`,
            );
            try {
              const r = await fireAdvise(ch.prompt);
              setCurrentBalance(r.balanceAfter);
              appendLog(
                "ok",
                `−${r.tokensConsumed} Token · balance = ${formatTokenCount(r.balanceAfter)}`,
              );
              window.dispatchEvent(new CustomEvent("haba:balance-refresh"));

              const cumulativeBurn = start - r.balanceAfter;
              if (!topupFired && cumulativeBurn >= DEMO_AUTOPILOT_BURN_TRIGGER_TOKEN) {
                topupFired = true;
                appendLog(
                  "warn",
                  `⚠ 累计消耗 ${cumulativeBurn} Token ≥ 阈值 (${DEMO_AUTOPILOT_BURN_TRIGGER_TOKEN}) — 触发自动充值`,
                );
                await sleep(420);
                appendLog("http", "POST /v1/token-purchase  amount=10 USDC  [autopilot]");
                appendLog("http", "POST /v1/admin/payments/.../confirm  (DEV)");
                const t = await fireTopup(10);
                setCurrentBalance(t.balanceAfter);
                appendLog(
                  "ok",
                  `+10,000,000 Token · tx=${t.txHash ?? "?"} · balance = ${formatTokenCount(t.balanceAfter)}`,
                );
                window.dispatchEvent(new CustomEvent("haba:balance-refresh"));
              }
            } catch (e) {
              appendLog("error", `call failed: ${e instanceof Error ? e.message : String(e)}`);
              break;
            }
          }
        }
        appendLog("info", `✓ B2B 多渠道场景完成  total=${callNum} 次调用`);
        setPhase("done");
        return;
      }

      // ── advise-until-empty ─────────────────────────────────────────
      const MAX_CALLS = 12;
      let topupFired = false;
      for (let i = 0; i < MAX_CALLS; i++) {
        if (stopRef.current) break;
        await sleep(220);
        const prompt = FIVE_PROMPTS[i % FIVE_PROMPTS.length];
        appendLog("step", `→ call ${i + 1}/${MAX_CALLS}`);
        appendLog("http", `POST /v1/messages   "${prompt.slice(0, 38)}…"`);
        try {
          const r = await fireAdvise(prompt);
          setCurrentBalance(r.balanceAfter);
          appendLog("ok", `−${r.tokensConsumed} Token · balance = ${formatTokenCount(r.balanceAfter)}`);
          window.dispatchEvent(new CustomEvent("haba:balance-refresh"));

          const cumulativeBurn = start - r.balanceAfter;
          if (!topupFired && cumulativeBurn >= DEMO_AUTOPILOT_BURN_TRIGGER_TOKEN) {
            topupFired = true;
            appendLog(
              "warn",
              `⚠ cumulative burn ${cumulativeBurn} Token ≥ trigger (${DEMO_AUTOPILOT_BURN_TRIGGER_TOKEN}) — triggering autopilot top-up`,
            );
            await sleep(400);
            appendLog("http", "POST /v1/token-purchase  amount=10 USDC");
            appendLog("http", "POST /v1/admin/payments/.../confirm  (DEV)");
            const t = await fireTopup(10);
            setCurrentBalance(t.balanceAfter);
            appendLog(
              "ok",
              `+10,000,000 Token · tx=${t.txHash ?? "?"} · balance = ${formatTokenCount(t.balanceAfter)}`,
            );
            window.dispatchEvent(new CustomEvent("haba:balance-refresh"));
          }
        } catch (e) {
          appendLog("error", `call failed: ${e instanceof Error ? e.message : String(e)}`);
          // try a topup once if it was a balance error
          break;
        }
      }
      appendLog("info", "✓ done");
      setPhase("done");
    } catch (e) {
      appendLog("error", e instanceof Error ? e.message : String(e));
      setPhase("done");
    }
  }

  function stop() {
    stopRef.current = true;
    appendLog("warn", "■ stop requested by user");
    setPhase("stopped");
  }

  return (
    <div className="mt-8 grid grid-cols-1 gap-6 lg:grid-cols-12">
      {/* scenarios */}
      <aside className="space-y-3 lg:col-span-5">
        {SCENARIOS.map((s) => (
          <ScenarioCard
            key={s.id}
            title={s.title}
            description={s.description}
            running={phase === "running"}
            onRun={() => runScenario(s.id)}
          />
        ))}
        {phase === "running" && (
          <button
            type="button"
            onClick={stop}
            className="inline-flex items-center gap-1.5 rounded-lg border border-semantic-danger/40 bg-semantic-danger/5 px-3 py-1.5 text-caption font-semibold text-semantic-danger hover:bg-semantic-danger/10"
          >
            <Square className="h-3 w-3" aria-hidden /> 停止
          </button>
        )}
        <BalanceSummary
          started={startedBalance}
          current={currentBalance}
        />
      </aside>

      {/* terminal */}
      <div className="rounded-2xl border border-border-subtle bg-[#0F1115] text-[#E5E7EB] shadow-e2 lg:col-span-7">
        <div className="flex items-center justify-between border-b border-white/5 px-4 py-2 text-caption">
          <div className="flex items-center gap-2 text-white/60">
            <Bot className="h-3.5 w-3.5" aria-hidden />
            <span className="font-mono">agent-runner@haba</span>
          </div>
          <span
            className={cn(
              "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider",
              phase === "running"
                ? "bg-brand-primary/20 text-brand-primary"
                : phase === "done"
                  ? "bg-semantic-success/20 text-semantic-success"
                  : phase === "stopped"
                    ? "bg-semantic-danger/20 text-semantic-danger"
                    : "bg-white/10 text-white/50",
            )}
          >
            <span
              className={cn(
                "inline-block h-1.5 w-1.5 rounded-full",
                phase === "running" && "animate-pulse bg-brand-primary",
                phase === "done" && "bg-semantic-success",
                phase === "stopped" && "bg-semantic-danger",
                phase === "idle" && "bg-white/40",
              )}
            />
            {phase}
          </span>
        </div>
        <div className="h-[420px] overflow-y-auto px-4 py-3 font-mono text-[12px] leading-relaxed">
          {logs.length === 0 && (
            <p className="text-white/40">$ idle — pick a scenario on the left and click Run.</p>
          )}
          {logs.map((line) => (
            <LogLine key={line.id} entry={line} />
          ))}
          <div ref={logEnd} />
        </div>
      </div>
    </div>
  );
}

function ScenarioCard({
  title,
  description,
  running,
  onRun,
}: {
  title: string;
  description: string;
  running: boolean;
  onRun: () => void;
}) {
  return (
    <div className="rounded-2xl border border-border-subtle bg-surface-base p-4 shadow-e1">
      <h3 className="text-small font-semibold text-brand-ink">{title}</h3>
      <p className="mt-1 text-caption text-ink-secondary">{description}</p>
      <button
        type="button"
        disabled={running}
        onClick={onRun}
        className={cn(
          "mt-3 inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-caption font-semibold transition-colors",
          running
            ? "bg-surface-muted text-ink-tertiary"
            : "bg-brand-primary text-white hover:bg-brand-primary-hover",
        )}
      >
        <Play className="h-3 w-3" aria-hidden /> Run
      </button>
    </div>
  );
}

function BalanceSummary({ started, current }: { started: number | null; current: number | null }) {
  if (started === null && current === null) {
    return (
      <div className="rounded-2xl border border-dashed border-border-default bg-surface-base p-4 text-caption text-ink-tertiary">
        Run a scenario to watch the Token balance move.
      </div>
    );
  }
  const delta = current !== null && started !== null ? current - started : null;
  return (
    <div className="rounded-2xl border border-border-subtle bg-surface-base p-4 shadow-e1">
      <h4 className="flex items-center gap-2 text-small font-semibold text-brand-ink">
        <Zap className="h-3.5 w-3.5 text-brand-primary" aria-hidden /> Token 余额
      </h4>
      <dl className="mt-3 grid grid-cols-3 gap-2 text-caption">
        <Stat label="开始" value={started !== null ? formatTokenCount(started) : "—"} />
        <Stat label="当前" value={current !== null ? formatTokenCount(current) : "—"} accent />
        <Stat
          label="净变化"
          value={
            delta === null
              ? "—"
              : delta === 0
                ? "0"
                : delta > 0
                  ? `+${formatTokenCount(delta)}`
                  : `−${formatTokenCount(-delta)}`
          }
          tone={delta === null ? "neutral" : delta >= 0 ? "ok" : "warn"}
        />
      </dl>
    </div>
  );
}

function Stat({
  label,
  value,
  accent,
  tone,
}: {
  label: string;
  value: string;
  accent?: boolean;
  tone?: "neutral" | "ok" | "warn";
}) {
  return (
    <div className="rounded-lg bg-surface-muted/60 px-2 py-1.5 text-center">
      <dt className="text-[10px] uppercase tracking-wider text-ink-tertiary">{label}</dt>
      <dd
        className={cn(
          "mt-0.5 font-mono text-small font-medium",
          accent && "text-brand-primary",
          tone === "ok" && "text-semantic-success",
          tone === "warn" && "text-semantic-warning",
          !accent && !tone && "text-brand-ink",
        )}
      >
        {value}
      </dd>
    </div>
  );
}

function LogLine({ entry }: { entry: LogEntry }) {
  const color: Record<LogLevel, string> = {
    info: "text-white/70",
    step: "text-cyan-300",
    http: "text-amber-300",
    warn: "text-orange-300",
    ok: "text-emerald-300",
    error: "text-rose-300",
  };
  return (
    <p className="whitespace-pre-wrap">
      <span className="text-white/40">{entry.ts} </span>
      <span className={color[entry.level]}>{entry.text}</span>
    </p>
  );
}
