"use client";

import { useCallback, useEffect, useState } from "react";
import {
  Activity, AlertOctagon, CheckCircle2, ChevronRight, Cpu, Cog,
  ExternalLink, Loader2, PlayCircle, RotateCcw, Shield, ShieldOff, Wifi,
} from "lucide-react";
import { cn } from "@/lib/cn";
import { ArchitectureCrumb } from "@/components/ArchitectureCrumb";

// ── Types matching x402-api /v1/_console/* shapes ────────────────────
type Event = {
  order_id: string;
  resource: string;
  amount_usdc_micro: number;
  network: string;
  status: string;
  status_reason: string | null;
  tx_hash: string | null;
  nonce: string;
  expires_at: string | null;
  created_at: string | null;
  confirmed_at: string | null;
  metadata: Record<string, unknown>;
  proofs: Array<{
    submitted_at: string | null;
    verified: boolean | null;
    reason: string | null;
    payer: string | null;
    signature: string | null;
    memo: string | null;
    had_user_verification: boolean;
  }>;
};

type Metrics = {
  challenges_issued: number;
  settlements_confirmed: number;
  proofs_submitted: number;
  proofs_rejected: number;
  config: {
    network: string;
    usdc_mint: string;
    deposit_recipient: string;
    facilitator: string;
    demo_payer: string;
  };
};

type Step = { name: string; status: "ok" | "fail"; detail?: unknown };
type Scenario = "normal" | "replay" | "expired" | "tamper-resource" | "tamper-network" | "malformed";
type ScenarioResult = {
  ok: boolean;
  scenario: Scenario;
  expected?: string;
  error?: string;
  steps: Step[];
  response?: unknown;
  x_payment_header?: string;
  requirements?: { extra?: { nonce?: string } };
};

export default function ConsolePage() {
  const [events, setEvents] = useState<Event[]>([]);
  const [metrics, setMetrics] = useState<Metrics | null>(null);
  const [gatewayOk, setGatewayOk] = useState(true);
  const [running, setRunning] = useState<Scenario | null>(null);
  const [lastResult, setLastResult] = useState<ScenarioResult | null>(null);
  const [lastHeader, setLastHeader] = useState<{ header: string; idem: string } | null>(null);

  const pollOnce = useCallback(async () => {
    try {
      const [evRes, mRes] = await Promise.all([
        fetch("/api/console/events?limit=20", { cache: "no-store" }),
        fetch("/api/console/metrics", { cache: "no-store" }),
      ]);
      if (evRes.ok) {
        const j = await evRes.json();
        setEvents((j.events ?? []) as Event[]);
      }
      if (mRes.ok) setMetrics(await mRes.json() as Metrics);
      setGatewayOk(evRes.ok && mRes.ok);
    } catch { setGatewayOk(false); }
  }, []);

  useEffect(() => {
    void pollOnce();
    const t = setInterval(pollOnce, 2000);
    return () => clearInterval(t);
  }, [pollOnce]);

  async function runScenario(s: Scenario) {
    if (running) return;
    setRunning(s);
    setLastResult(null);
    try {
      const body: Record<string, unknown> = {};
      if (s === "replay") {
        if (!lastHeader) {
          setLastResult({
            ok: false, scenario: "replay",
            error: "先按一次 “Normal payment” 让控制台记住一个真实的 X-PAYMENT,然后才能演示重放。",
            steps: [],
          });
          return;
        }
        body.x_payment_header = lastHeader.header;
        body.idempotency_key = lastHeader.idem;
      }
      const r = await fetch(`/api/scenarios/${s}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const j = await r.json() as ScenarioResult;
      setLastResult(j);
      if (s === "normal" && j.ok && j.x_payment_header) {
        const responseObj = j.response as { order_id?: string } | undefined;
        setLastHeader({ header: j.x_payment_header, idem: responseObj?.order_id ?? "unknown" });
      }
    } catch (e) {
      setLastResult({
        ok: false, scenario: s,
        error: e instanceof Error ? e.message : "network error",
        steps: [],
      });
    } finally {
      setRunning(null);
      void pollOnce();
    }
  }

  return (
    <div>
      <Header gatewayOk={gatewayOk} cfg={metrics?.config} />
      <ArchitectureCrumb current="gateway" />
      <MetricStrip metrics={metrics} />
      <main className="mx-auto grid max-w-7xl gap-6 px-6 py-8 lg:grid-cols-[minmax(380px,1fr)_minmax(0,1.7fr)]">
        <DemoColumn running={running} lastResult={lastResult} lastHeader={lastHeader} onRun={runScenario} />
        <EventColumn events={events} cfg={metrics?.config} />
      </main>
      <Footer />
    </div>
  );
}

// ──────────────────────────────────────────────────────────────────
function Header({ gatewayOk, cfg }: { gatewayOk: boolean; cfg?: Metrics["config"] }) {
  return (
    <header className="border-b border-slate-200 bg-white">
      <div className="mx-auto flex max-w-7xl items-center justify-between gap-4 px-6 py-4">
        <div className="flex items-center gap-3">
          <div className="grid h-10 w-10 place-items-center rounded-xl bg-gradient-to-br from-blue-500 to-indigo-600 text-white shadow-sm">
            <Cpu className="h-5 w-5" aria-hidden />
          </div>
          <div>
            <h1 className="text-[17px] font-bold tracking-tight text-slate-900">NetStars X402 Console</h1>
            <p className="text-[11px] uppercase tracking-widest text-slate-400">
              Standard x402 protocol · Solana USDC settlement
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Pill
            tone={gatewayOk ? "ok" : "danger"}
            icon={gatewayOk ? <Wifi className="h-3 w-3" /> : <ShieldOff className="h-3 w-3" />}
            label={gatewayOk ? "Gateway live" : "Gateway unreachable"}
          />
          {cfg?.facilitator && (
            <Pill
              tone="info"
              icon={<Shield className="h-3 w-3" />}
              label={`Facilitator · ${cfg.facilitator.replace(/^https?:\/\//, "")}`}
            />
          )}
        </div>
      </div>
    </header>
  );
}

function MetricStrip({ metrics }: { metrics: Metrics | null }) {
  return (
    <div className="border-b border-slate-200 bg-white">
      <div className="mx-auto grid max-w-7xl gap-3 px-6 py-4 sm:grid-cols-2 lg:grid-cols-5">
        <Metric label="402 challenges" value={metrics?.challenges_issued ?? "—"} icon={<AlertOctagon className="h-3.5 w-3.5 text-amber-600" />} tint="amber" />
        <Metric label="Settled on chain" value={metrics?.settlements_confirmed ?? "—"} icon={<CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" />} tint="emerald" />
        <Metric label="Proofs submitted" value={metrics?.proofs_submitted ?? "—"} icon={<Activity className="h-3.5 w-3.5 text-sky-600" />} tint="sky" />
        <Metric label="Proofs rejected" value={metrics?.proofs_rejected ?? "—"} icon={<ShieldOff className="h-3.5 w-3.5 text-rose-600" />} tint="rose" />
        <Metric label="Network" value={metrics?.config?.network ?? "—"} icon={<Cog className="h-3.5 w-3.5 text-violet-600" />} tint="violet" small />
      </div>
    </div>
  );
}

function Metric({ label, value, icon, tint, small }: {
  label: string; value: string | number; icon: React.ReactNode;
  tint: "amber" | "emerald" | "sky" | "rose" | "violet"; small?: boolean;
}) {
  const tintBg = ({ amber: "bg-amber-50", emerald: "bg-emerald-50", sky: "bg-sky-50", rose: "bg-rose-50", violet: "bg-violet-50" } as const)[tint];
  return (
    <div className="flex items-center gap-3 rounded-xl border border-slate-200 bg-white px-4 py-2.5 shadow-e1">
      <div className={cn("grid h-8 w-8 place-items-center rounded-lg", tintBg)}>{icon}</div>
      <div className="min-w-0">
        <p className="text-[10px] font-semibold uppercase tracking-widest text-slate-400">{label}</p>
        <p className={cn(
          "font-bold leading-tight text-slate-900",
          small ? "text-[13px]" : "text-[20px]",
        )}>{value}</p>
      </div>
    </div>
  );
}

function Pill({ tone, icon, label }: { tone: "ok" | "warn" | "danger" | "info"; icon: React.ReactNode; label: string }) {
  return (
    <span className={cn(
      "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-semibold",
      tone === "ok"     && "border-emerald-200 bg-emerald-50 text-emerald-700",
      tone === "warn"   && "border-amber-200  bg-amber-50  text-amber-700",
      tone === "danger" && "border-rose-200   bg-rose-50   text-rose-700",
      tone === "info"   && "border-sky-200    bg-sky-50    text-sky-700",
    )}>{icon}{label}</span>
  );
}

// ──────────────────────────────────────────────────────────────────
function DemoColumn({
  running, lastResult, lastHeader, onRun,
}: {
  running: Scenario | null;
  lastResult: ScenarioResult | null;
  lastHeader: { header: string; idem: string } | null;
  onRun: (s: Scenario) => void;
}) {
  return (
    <section className="space-y-4">
      <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-e1">
        <div className="flex items-baseline justify-between">
          <h2 className="text-[12px] font-bold uppercase tracking-widest text-slate-500">Demo scenarios</h2>
          <p className="text-[11px] text-slate-400">点一下,看协议如何反应</p>
        </div>

        <div className="mt-5 space-y-2.5">
          <ScenarioButton
            running={running === "normal"} disabled={!!running}
            onClick={() => onRun("normal")} tone="primary"
            icon={<PlayCircle className="h-4 w-4" />}
            title="Normal payment(真扣 USDC)"
            subtitle="402 → 客户端签名 → X-PAYMENT → verify → Solana settle → 200"
          />
          <ScenarioButton
            running={running === "replay"} disabled={!!running || !lastHeader}
            onClick={() => onRun("replay")} tone="danger"
            icon={<RotateCcw className="h-4 w-4" />}
            title={lastHeader ? "Replay attack(重发刚才那笔 X-PAYMENT)" : "Replay attack(先按上面 Normal 再来)"}
            subtitle="期望:Gateway 用 signed_tx_hash UNIQUE 挡掉,409 REPLAY"
          />
          <ScenarioButton
            running={running === "expired"} disabled={!!running}
            onClick={() => onRun("expired")} tone="danger"
            icon={<AlertOctagon className="h-4 w-4" />}
            title="Expired order(过期后再付款)"
            subtitle="期望:requirements.expiresAt 过期后 retry,410 EXPIRED"
          />
          <ScenarioButton
            running={running === "tamper-resource"} disabled={!!running}
            onClick={() => onRun("tamper-resource")} tone="danger"
            icon={<ShieldOff className="h-4 w-4" />}
            title="Tamper resource(改 payload.resource)"
            subtitle="期望:Resource binding 失败,402 REQUIREMENTS_MISMATCH"
          />
          <ScenarioButton
            running={running === "tamper-network"} disabled={!!running}
            onClick={() => onRun("tamper-network")} tone="danger"
            icon={<ShieldOff className="h-4 w-4" />}
            title="Tamper network(devnet → mainnet)"
            subtitle="期望:Network 字段对不上,402 REQUIREMENTS_MISMATCH"
          />
          <ScenarioButton
            running={running === "malformed"} disabled={!!running}
            onClick={() => onRun("malformed")} tone="danger"
            icon={<AlertOctagon className="h-4 w-4" />}
            title="Malformed X-PAYMENT(随便塞 base64)"
            subtitle="期望:解码失败,402 X_PAYMENT_INVALID"
          />
        </div>

        {lastHeader && (
          <p className="mt-4 truncate text-[11px] text-slate-400">
            <span className="font-mono text-slate-500">last X-PAYMENT:</span> {lastHeader.header.slice(0, 30)}…
          </p>
        )}
      </div>

      {lastResult && <ResultPanel result={lastResult} />}
    </section>
  );
}

function ScenarioButton({
  onClick, running, disabled, icon, title, subtitle, tone,
}: {
  onClick: () => void; running: boolean; disabled: boolean;
  icon: React.ReactNode; title: string; subtitle: string;
  tone: "primary" | "danger";
}) {
  return (
    <button
      type="button" onClick={onClick} disabled={disabled}
      className={cn(
        "group flex w-full items-start gap-3 rounded-xl border px-4 py-3 text-left transition-colors",
        "disabled:opacity-50 disabled:cursor-not-allowed",
        tone === "primary" && "border-blue-200 bg-blue-50/50 hover:bg-blue-50 hover:border-blue-300",
        tone === "danger"  && "border-slate-200 bg-white hover:border-rose-200 hover:bg-rose-50/40",
      )}
    >
      <span className={cn(
        "mt-0.5 grid h-8 w-8 shrink-0 place-items-center rounded-lg",
        tone === "primary" ? "bg-blue-600 text-white" : "bg-rose-100 text-rose-600 group-hover:bg-rose-200",
      )}>{running ? <Loader2 className="h-4 w-4 animate-spin" /> : icon}</span>
      <span className="min-w-0 flex-1">
        <p className="text-[14px] font-semibold text-slate-900">{title}</p>
        <p className="mt-0.5 text-[11px] leading-relaxed text-slate-500">{subtitle}</p>
      </span>
      <ChevronRight className="mt-2 h-4 w-4 shrink-0 text-slate-300 group-hover:text-slate-500" aria-hidden />
    </button>
  );
}

function ResultPanel({ result }: { result: ScenarioResult }) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-e1 animate-flow-in">
      <div className="flex items-center justify-between">
        <h3 className="text-[12px] font-bold uppercase tracking-widest text-slate-500">最近一次场景结果</h3>
        <Pill
          tone={result.ok ? "ok" : "danger"}
          icon={result.ok ? <CheckCircle2 className="h-3 w-3" /> : <ShieldOff className="h-3 w-3" />}
          label={result.ok ? "符合预期" : "未达成预期"}
        />
      </div>
      <p className="mt-2 text-[12px] text-slate-500">
        scenario · <span className="font-semibold text-slate-700">{result.scenario}</span>
        {result.expected && <> · 期望 <span className="text-slate-600">{result.expected}</span></>}
      </p>
      {result.error && <p className="mt-2 rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-[12px] text-rose-700">{result.error}</p>}

      <ol className="mt-4 space-y-3">
        {result.steps.map((s, i) => (
          <li key={i} className={cn(
            "rounded-xl border px-4 py-3",
            s.status === "ok"  ? "border-emerald-200 bg-emerald-50/60" : "border-rose-200 bg-rose-50/60",
          )}>
            <div className="flex items-start gap-2">
              <span className={cn(
                "mt-0.5 inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[11px] font-bold",
                s.status === "ok" ? "bg-emerald-600 text-white" : "bg-rose-600 text-white",
              )}>{s.status === "ok" ? "✓" : "!"}</span>
              <p className="text-[13px] font-semibold text-slate-900">{s.name}</p>
            </div>
            {s.detail !== undefined && (
              <pre className="mt-2 max-h-48 overflow-auto rounded-md bg-slate-900 p-3 text-[11px] leading-5 text-slate-100">
                {JSON.stringify(s.detail, null, 2)}
              </pre>
            )}
          </li>
        ))}
      </ol>
    </div>
  );
}

// ──────────────────────────────────────────────────────────────────
function EventColumn({ events, cfg }: { events: Event[]; cfg?: Metrics["config"] }) {
  return (
    <section className="space-y-3">
      <div className="flex items-baseline justify-between">
        <h2 className="text-[12px] font-bold uppercase tracking-widest text-slate-500">Live protocol timeline</h2>
        <p className="text-[11px] text-slate-400">每 2 秒刷新 · x402-api /v1/_console/events</p>
      </div>
      {events.length === 0 ? (
        <div className="grid-bg rounded-2xl border border-dashed border-slate-200 bg-white p-12 text-center">
          <Activity className="mx-auto h-8 w-8 text-slate-300" aria-hidden />
          <p className="mt-3 text-[13px] text-slate-600">还没有 402 协议事件</p>
          <p className="mt-1 text-[11px] text-slate-400">按左边 “Normal payment” 触发一次,timeline 会立刻出现</p>
        </div>
      ) : (
        <div className="space-y-3">{events.map(e => <EventCard key={e.order_id} ev={e} cfg={cfg} />)}</div>
      )}
    </section>
  );
}

function EventCard({ ev, cfg }: { ev: Event; cfg?: Metrics["config"] }) {
  const isConfirmed = ev.status === "confirmed";
  const isFailed = ev.status === "failed" || ev.status === "expired" || ev.status === "canceled";
  const proofs = ev.proofs ?? [];
  const isDevnet = (cfg?.network ?? ev.network ?? "").includes("devnet");
  const explorer = ev.tx_hash
    ? `https://explorer.solana.com/tx/${ev.tx_hash}?cluster=${isDevnet ? "devnet" : "mainnet-beta"}`
    : undefined;

  return (
    <article className={cn(
      "rounded-2xl border bg-white p-5 shadow-e1 transition",
      isConfirmed ? "border-emerald-200" : isFailed ? "border-rose-200" : "border-amber-200",
    )}>
      <header className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <code className="font-mono text-[12px] text-slate-700">{ev.order_id}</code>
          <span className={cn(
            "rounded-full border px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide",
            isConfirmed ? "border-emerald-300 bg-emerald-50 text-emerald-700"
                        : isFailed ? "border-rose-300 bg-rose-50 text-rose-700"
                        : "border-amber-300 bg-amber-50 text-amber-700",
          )}>{ev.status}</span>
        </div>
        <div className="text-[11px] text-slate-500">
          {(ev.amount_usdc_micro / 1_000_000).toFixed(4)} USDC · {ev.network}
        </div>
      </header>

      <ol className="mt-4 space-y-1.5 text-[12px]">
        <TimelineStep tone="amber" label="① 402 challenge issued"
          extra={`resource ${truncate(ev.resource, 36)} · nonce ${ev.nonce.slice(0, 12)}…`} />
        {proofs.map((p, i) => (
          <TimelineStep
            key={i}
            tone={p.verified ? "emerald" : "rose"}
            label={p.verified ? `② proof verified · payer ${p.payer?.slice(0, 8)}…${p.payer?.slice(-6)}` : `② proof REJECTED`}
            extra={p.reason ?? (p.had_user_verification ? "carries WebAuthn attestation" : "no user-verification attached")}
          />
        ))}
        {ev.tx_hash && (
          <TimelineStep
            tone="emerald" label="③ Solana settled"
            extra={`tx ${ev.tx_hash.slice(0, 10)}…${ev.tx_hash.slice(-8)} · ${ev.confirmed_at?.slice(11, 19) ?? ""}`}
          />
        )}
        {ev.status_reason && !ev.tx_hash && (
          <TimelineStep tone="rose" label="③ Settlement failed" extra={ev.status_reason} />
        )}
        {proofs.length === 0 && (
          <TimelineStep tone="slate" label="② 等待 X-PAYMENT 重试…" extra="客户端尚未带 proof 重新请求" />
        )}
      </ol>

      {explorer && (
        <a href={explorer} target="_blank" rel="noreferrer"
           className="mt-4 inline-flex items-center gap-1.5 text-[12px] font-semibold text-blue-600 hover:text-blue-700 hover:underline">
          打开 Solana Explorer <ExternalLink className="h-3 w-3" />
        </a>
      )}
    </article>
  );
}

function TimelineStep({ tone, label, extra }: {
  tone: "amber" | "emerald" | "rose" | "slate";
  label: string; extra?: string;
}) {
  return (
    <li className="flex items-start gap-2">
      <span className={cn(
        "mt-1.5 h-2 w-2 shrink-0 rounded-full",
        tone === "amber"   && "bg-amber-500",
        tone === "emerald" && "bg-emerald-500",
        tone === "rose"    && "bg-rose-500",
        tone === "slate"   && "bg-slate-300",
      )} />
      <div className="min-w-0">
        <p className="text-slate-800">{label}</p>
        {extra && <p className="text-[11px] text-slate-500">{extra}</p>}
      </div>
    </li>
  );
}

function Footer() {
  return (
    <footer className="mt-8 border-t border-slate-200 bg-white">
      <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-2 px-6 py-3 text-[11px] text-slate-400">
        <span>NetStars X402 Console · v0.2.0</span>
        <span>HABA :3001 · Gateway :8081 · Facilitator :8082 · Token :8080</span>
      </div>
    </footer>
  );
}

function truncate(s: string, n: number): string {
  return s.length <= n ? s : s.slice(0, n - 1) + "…";
}
