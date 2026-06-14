"use client";

import { useCallback, useEffect, useState } from "react";
import {
  Activity, ArrowDownToLine, ArrowUpFromLine, CheckCircle2, ChevronRight,
  CircleDollarSign, Cpu, ExternalLink, Fingerprint, Loader2, Network,
  PlayCircle, RefreshCw, ShieldAlert, ShieldCheck, Wifi,
} from "lucide-react";
import { cn } from "@/lib/cn";
import { ArchitectureCrumb } from "@/components/ArchitectureCrumb";

// ── Types matching wea-api console responses ────────────────────────
type Counters = { verify_ok: number; verify_fail: number; settle_ok: number; settle_fail: number };
type CallKind = "verify" | "settle";
type CallRecord = {
  kind: CallKind;
  started_at: string;
  took_ms: number;
  network: string;
  amount_usdc_micro: number;
  pay_to: string;
  payer: string | null;
  resource: string;
  nonce: string | null;
  ok: boolean;
  error_reason: string | null;
  tx_hash: string | null;
  had_user_verification: boolean;
};

type Metrics = {
  service: string;
  role: string;
  counters: Counters;
  config: {
    network_devnet: string;
    network_mainnet: string;
    x402_gateway: string;
    usdc_mint: string;
    ring_capacity: number;
  };
  wallet: {
    demo_payer:        { pubkey: string; usdc: string | null };
    deposit_recipient: { pubkey: string; usdc: string | null };
  };
};

type ScenarioStep = { name: string; status: "ok" | "fail"; http?: number; took_ms?: number; body?: unknown; payer?: string; nonce?: string };
type ScenarioResult = { ok: boolean; error?: string; expected?: string; steps: ScenarioStep[]; settlement?: unknown };
type Scenario = "trigger-payment" | "direct-verify";

export default function WeaConsole() {
  const [calls, setCalls] = useState<CallRecord[]>([]);
  const [metrics, setMetrics] = useState<Metrics | null>(null);
  const [weaOk, setWeaOk] = useState(true);
  const [running, setRunning] = useState<Scenario | null>(null);
  const [result, setResult] = useState<ScenarioResult | null>(null);

  const pollOnce = useCallback(async () => {
    try {
      const [cRes, mRes] = await Promise.all([
        fetch("/api/console/calls", { cache: "no-store" }),
        fetch("/api/console/metrics", { cache: "no-store" }),
      ]);
      if (cRes.ok) {
        const j = await cRes.json();
        setCalls((j.items ?? []).slice().reverse());     // newest first
      }
      if (mRes.ok) setMetrics(await mRes.json() as Metrics);
      setWeaOk(cRes.ok && mRes.ok);
    } catch { setWeaOk(false); }
  }, []);

  useEffect(() => {
    void pollOnce();
    const t = setInterval(pollOnce, 2000);
    return () => clearInterval(t);
  }, [pollOnce]);

  async function runScenario(s: Scenario) {
    if (running) return;
    setRunning(s);
    setResult(null);
    try {
      const r = await fetch(`/api/scenarios/${s}`, { method: "POST", cache: "no-store" });
      setResult(await r.json() as ScenarioResult);
    } catch (e) {
      setResult({ ok: false, error: e instanceof Error ? e.message : "network error", steps: [] });
    } finally {
      setRunning(null);
      void pollOnce();
    }
  }

  return (
    <div>
      <Header weaOk={weaOk} role={metrics?.role} />
      <ArchitectureCrumb current="facilitator" />
      <PulseStrip metrics={metrics} />
      <main className="mx-auto grid max-w-7xl gap-6 px-6 py-8 lg:grid-cols-[minmax(380px,1fr)_minmax(0,1.7fr)]">
        <LeftColumn metrics={metrics} running={running} onRun={runScenario} result={result} onRefresh={pollOnce} />
        <RightColumn calls={calls} network={metrics?.config?.network_devnet} />
      </main>
      <Footer />
    </div>
  );
}

// ──────────────────────────────────────────────────────────────────
function Header({ weaOk, role }: { weaOk: boolean; role?: string }) {
  return (
    <header className="border-b border-slate-200 bg-white">
      <div className="mx-auto flex max-w-7xl items-center justify-between gap-4 px-6 py-4">
        <div className="flex items-center gap-3">
          <div className="grid h-10 w-10 place-items-center rounded-xl bg-gradient-to-br from-indigo-600 to-violet-700 text-white shadow-sm">
            <Network className="h-5 w-5" aria-hidden />
          </div>
          <div>
            <h1 className="text-[17px] font-bold tracking-tight text-slate-900">Wea Facilitator Console</h1>
            <p className="text-[11px] uppercase tracking-widest text-slate-400">
              x402 Action · Web3 Payment Provider · {role ?? "—"}
            </p>
          </div>
        </div>
        <Pill
          tone={weaOk ? "ok" : "danger"}
          icon={weaOk ? <Wifi className="h-3 w-3" /> : <ShieldAlert className="h-3 w-3" />}
          label={weaOk ? "facilitator live" : "facilitator unreachable"}
        />
      </div>
    </header>
  );
}

function PulseStrip({ metrics }: { metrics: Metrics | null }) {
  const c = metrics?.counters;
  return (
    <div className="border-b border-slate-200 bg-white">
      <div className="mx-auto grid max-w-7xl gap-3 px-6 py-4 sm:grid-cols-2 lg:grid-cols-5">
        <Metric label="Verify · pass" value={c?.verify_ok   ?? "—"} icon={<ShieldCheck  className="h-3.5 w-3.5 text-emerald-600" />} tint="emerald" />
        <Metric label="Verify · fail" value={c?.verify_fail ?? "—"} icon={<ShieldAlert  className="h-3.5 w-3.5 text-rose-600"    />} tint="rose" />
        <Metric label="Settle · ok"   value={c?.settle_ok   ?? "—"} icon={<CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" />} tint="emerald" />
        <Metric label="Settle · fail" value={c?.settle_fail ?? "—"} icon={<ShieldAlert  className="h-3.5 w-3.5 text-rose-600"    />} tint="rose" />
        <Metric label="RPC · devnet"
                value={(metrics?.config?.network_devnet ?? "").replace(/^https?:\/\//, "") || "—"}
                icon={<CircleDollarSign className="h-3.5 w-3.5 text-cyan-600" />} tint="cyan" small />
      </div>
    </div>
  );
}

function Metric({ label, value, icon, tint, small }: {
  label: string; value: string | number; icon: React.ReactNode;
  tint: "emerald" | "rose" | "cyan" | "violet"; small?: boolean;
}) {
  const tintBg = ({ emerald: "bg-emerald-50", rose: "bg-rose-50", cyan: "bg-cyan-50", violet: "bg-violet-50" } as const)[tint];
  return (
    <div className="flex items-center gap-3 rounded-xl border border-slate-200 bg-white px-4 py-2.5 shadow-e1">
      <div className={cn("grid h-8 w-8 place-items-center rounded-lg", tintBg)}>{icon}</div>
      <div className="min-w-0">
        <p className="text-[10px] font-semibold uppercase tracking-widest text-slate-400">{label}</p>
        <p className={cn(
          "font-bold leading-tight text-slate-900",
          small ? "text-[12px]" : "text-[20px]",
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
function LeftColumn({
  metrics, running, onRun, result, onRefresh,
}: {
  metrics: Metrics | null;
  running: Scenario | null;
  onRun: (s: Scenario) => void;
  result: ScenarioResult | null;
  onRefresh: () => void;
}) {
  return (
    <section className="space-y-4">
      <WalletCard metrics={metrics} onRefresh={onRefresh} />

      <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-e1">
        <div className="flex items-baseline justify-between">
          <h2 className="text-[12px] font-bold uppercase tracking-widest text-slate-500">Operations</h2>
          <p className="text-[11px] text-slate-400">reflected in the activity log on the right</p>
        </div>
        <div className="mt-5 space-y-2.5">
          <ScenarioBtn
            running={running === "trigger-payment"} disabled={!!running}
            onClick={() => onRun("trigger-payment")} tone="primary"
            icon={<PlayCircle className="h-4 w-4" />}
            title="Process payment via gateway"
            subtitle="Full flow: WEA called once for verify, once for settle · real on-chain"
          />
          <ScenarioBtn
            running={running === "direct-verify"} disabled={!!running}
            onClick={() => onRun("direct-verify")} tone="danger"
            icon={<ShieldAlert className="h-4 w-4" />}
            title="Security validation: invalid payload"
            subtitle="Directly call the verify endpoint with an invalid payload · expects isValid=false"
          />
        </div>
      </div>

      {result && <ResultPanel result={result} />}
    </section>
  );
}

function WalletCard({ metrics, onRefresh }: { metrics: Metrics | null; onRefresh: () => void }) {
  const w = metrics?.wallet;
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-e1">
      <div className="flex items-center justify-between">
        <h2 className="text-[12px] font-bold uppercase tracking-widest text-slate-500">Solana wallet status</h2>
        <button type="button" onClick={onRefresh}
                className="inline-flex items-center gap-1 rounded-md border border-slate-200 bg-slate-50 px-2 py-1 text-[11px] font-medium text-slate-600 hover:bg-slate-100">
          <RefreshCw className="h-3 w-3" /> refresh
        </button>
      </div>
      <div className="mt-4 space-y-2.5">
        <WalletRow
          icon={<ArrowUpFromLine className="h-3.5 w-3.5 text-amber-600" />}
          role="Payment signer"
          pubkey={w?.demo_payer?.pubkey ?? "—"}
          usdc={w?.demo_payer?.usdc ?? null}
        />
        <WalletRow
          icon={<ArrowDownToLine className="h-3.5 w-3.5 text-emerald-600" />}
          role="Deposit recipient · merchant"
          pubkey={w?.deposit_recipient?.pubkey ?? "—"}
          usdc={w?.deposit_recipient?.usdc ?? null}
        />
      </div>
      <p className="mt-4 text-[11px] text-slate-400">
        USDC mint:{" "}
        <a href={`https://explorer.solana.com/address/${metrics?.config?.usdc_mint ?? ""}?cluster=devnet`}
           target="_blank" rel="noreferrer"
           className="text-violet-600 hover:underline">
          {metrics?.config?.usdc_mint?.slice(0, 10) ?? "—"}…
        </a>
      </p>
    </div>
  );
}

function WalletRow({ icon, role, pubkey, usdc }: { icon: React.ReactNode; role: string; pubkey: string; usdc: string | null }) {
  const explorer = pubkey && pubkey !== "—" ? `https://explorer.solana.com/address/${pubkey}?cluster=devnet` : null;
  return (
    <div className="flex items-start gap-3 rounded-xl border border-slate-200 bg-slate-50/60 p-3">
      <div className="mt-0.5 grid h-6 w-6 place-items-center rounded-md bg-white">{icon}</div>
      <div className="min-w-0 flex-1">
        <p className="text-[11px] text-slate-500">{role}</p>
        {explorer ? (
          <a href={explorer} target="_blank" rel="noreferrer"
             className="block truncate font-mono text-[12px] text-slate-700 hover:text-violet-700 hover:underline">
            {pubkey}
          </a>
        ) : (
          <p className="truncate font-mono text-[12px] text-slate-500">{pubkey}</p>
        )}
      </div>
      <div className="text-right shrink-0">
        <p className="text-[10px] font-semibold uppercase tracking-widest text-slate-400">USDC</p>
        <p className="font-mono text-[14px] font-bold text-slate-900">{usdc ?? "—"}</p>
      </div>
    </div>
  );
}

function ScenarioBtn({
  running, disabled, onClick, icon, title, subtitle, tone,
}: {
  running: boolean; disabled: boolean; onClick: () => void;
  icon: React.ReactNode; title: string; subtitle: string;
  tone: "primary" | "danger";
}) {
  return (
    <button type="button" onClick={onClick} disabled={disabled}
      className={cn(
        "group flex w-full items-start gap-3 rounded-xl border px-4 py-3 text-left transition-colors",
        "disabled:opacity-50 disabled:cursor-not-allowed",
        tone === "primary" && "border-violet-200 bg-violet-50/50 hover:bg-violet-50 hover:border-violet-300",
        tone === "danger"  && "border-slate-200 bg-white hover:border-rose-200 hover:bg-rose-50/40",
      )}>
      <span className={cn(
        "mt-0.5 grid h-8 w-8 shrink-0 place-items-center rounded-lg",
        tone === "primary" ? "bg-violet-600 text-white" : "bg-rose-100 text-rose-600 group-hover:bg-rose-200",
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
        <h3 className="text-[12px] font-bold uppercase tracking-widest text-slate-500">Operation result</h3>
        <Pill tone={result.ok ? "ok" : "danger"}
              icon={result.ok ? <CheckCircle2 className="h-3 w-3" /> : <ShieldAlert className="h-3 w-3" />}
              label={result.ok ? "Success" : "Failed"} />
      </div>
      {result.expected && <p className="mt-2 text-[12px] text-slate-500">{"Expected: "}<span className="text-slate-700">{result.expected}</span></p>}
      {result.error && <p className="mt-2 rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-[12px] text-rose-700">{result.error}</p>}
      <ol className="mt-4 space-y-3">
        {result.steps.map((s, i) => (
          <li key={i} className={cn(
            "rounded-xl border px-4 py-3",
            s.status === "ok" ? "border-emerald-200 bg-emerald-50/60" : "border-rose-200 bg-rose-50/60",
          )}>
            <div className="flex items-start gap-2">
              <span className={cn(
                "mt-0.5 inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[11px] font-bold",
                s.status === "ok" ? "bg-emerald-600 text-white" : "bg-rose-600 text-white",
              )}>{s.status === "ok" ? "✓" : "!"}</span>
              <div className="min-w-0 flex-1">
                <p className="text-[13px] font-semibold text-slate-900">{s.name}</p>
                <p className="mt-0.5 text-[11px] text-slate-500">
                  {[
                    s.http     !== undefined && `HTTP ${s.http}`,
                    s.took_ms  !== undefined && `${s.took_ms} ms`,
                    s.payer    && `payer ${s.payer.slice(0, 8)}…`,
                    s.nonce    && `nonce ${s.nonce.slice(0, 12)}…`,
                  ].filter(Boolean).join(" · ")}
                </p>
              </div>
            </div>
            {s.body !== undefined && (
              <pre className="mt-2 max-h-44 overflow-auto rounded-md bg-slate-900 p-3 text-[11px] leading-5 text-slate-100">
                {JSON.stringify(s.body, null, 2)}
              </pre>
            )}
          </li>
        ))}
      </ol>
    </div>
  );
}

// ──────────────────────────────────────────────────────────────────
function RightColumn({ calls, network }: { calls: CallRecord[]; network?: string }) {
  const isDevnet = (network ?? "").includes("devnet");
  return (
    <section className="space-y-3">
      <div className="flex items-baseline justify-between">
        <h2 className="text-[12px] font-bold uppercase tracking-widest text-slate-500">Live facilitator activity</h2>
        <p className="text-[11px] text-slate-400">Refreshes every 2s · ring buffer · 200</p>
      </div>
      {calls.length === 0 ? (
        <div className="grid-bg rounded-2xl border border-dashed border-slate-200 bg-white p-12 text-center">
          <Activity className="mx-auto h-8 w-8 text-slate-300" aria-hidden />
          <p className="mt-3 text-[13px] text-slate-600">No facilitator calls yet</p>
          <p className="mt-1 text-[11px] text-slate-400">Use the controls on the left to process a payment</p>
        </div>
      ) : (
        <div className="space-y-2.5">{calls.map((c, i) => <CallCard key={i} c={c} isDevnet={isDevnet} />)}</div>
      )}
    </section>
  );
}

function CallCard({ c, isDevnet }: { c: CallRecord; isDevnet: boolean }) {
  const explorer = c.tx_hash ? `https://explorer.solana.com/tx/${c.tx_hash}?cluster=${isDevnet ? "devnet" : "mainnet-beta"}` : null;
  return (
    <article className={cn(
      "rounded-2xl border bg-white p-4 shadow-e1 transition",
      c.ok ? "border-emerald-200" : "border-rose-200",
    )}>
      <header className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <span className={cn(
            "inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider",
            c.kind === "verify" ? "border-cyan-300 bg-cyan-50 text-cyan-700"
                                : "border-violet-300 bg-violet-50 text-violet-700",
          )}>
            {c.kind === "verify" ? <ShieldCheck className="h-3 w-3" /> : <Cpu className="h-3 w-3" />}
            {c.kind}
          </span>
          <span className={cn(
            "rounded-full border px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider",
            c.ok ? "border-emerald-300 bg-emerald-50 text-emerald-700"
                 : "border-rose-300 bg-rose-50 text-rose-700",
          )}>{c.ok ? "ok" : "fail"}</span>
          {c.had_user_verification && (
            <span className="inline-flex items-center gap-1 rounded-full border border-amber-300 bg-amber-50 px-2 py-0.5 text-[10px] font-bold text-amber-700">
              <Fingerprint className="h-3 w-3" /> WebAuthn
            </span>
          )}
        </div>
        <div className="flex items-center gap-3 text-[11px] text-slate-500">
          <span>{c.took_ms} ms</span>
          <span>{new Date(c.started_at).toLocaleTimeString("en-US", { hour12: false })}</span>
        </div>
      </header>

      <div className="mt-2.5 grid grid-cols-1 gap-1.5 text-[12px] sm:grid-cols-2">
        <KV k="amount" v={`${(c.amount_usdc_micro / 1_000_000).toFixed(4)} USDC`} />
        <KV k="network" v={c.network} />
        <KV k="payer" v={c.payer ? `${c.payer.slice(0, 6)}…${c.payer.slice(-6)}` : "—"} />
        <KV k="payTo" v={`${c.pay_to.slice(0, 6)}…${c.pay_to.slice(-6)}`} />
        {c.nonce && <KV k="nonce" v={`${c.nonce.slice(0, 16)}…`} />}
        <KV k="resource" v={c.resource.replace(/^https?:\/\/[^/]+/, "")} />
      </div>

      {!c.ok && c.error_reason && (
        <p className="mt-2 rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-[11px] text-rose-700">
          ✗ {c.error_reason}
        </p>
      )}
      {c.tx_hash && (
        <div className="mt-2 flex items-center justify-between rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2">
          <code className="truncate font-mono text-[11px] text-emerald-800">{c.tx_hash}</code>
          {explorer && (
            <a href={explorer} target="_blank" rel="noreferrer"
               className="inline-flex shrink-0 items-center gap-1 text-[11px] font-semibold text-emerald-700 hover:underline">
              Explorer <ExternalLink className="h-3 w-3" />
            </a>
          )}
        </div>
      )}
    </article>
  );
}

function KV({ k, v }: { k: string; v: string }) {
  return (
    <div className="flex items-baseline gap-2">
      <span className="text-[10px] font-semibold uppercase tracking-widest text-slate-400">{k}</span>
      <span className="truncate font-mono text-slate-700">{v}</span>
    </div>
  );
}

function Footer() {
  return (
    <footer className="mt-8 border-t border-slate-200 bg-white">
      <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-2 px-6 py-3 text-[11px] text-slate-400">
        <span>Wea Facilitator Console · v0.2.0</span>
        <span>HABA :3001 · Gateway :8081 · NetStars Console :3002 · Wea Console :3003</span>
      </div>
    </footer>
  );
}
