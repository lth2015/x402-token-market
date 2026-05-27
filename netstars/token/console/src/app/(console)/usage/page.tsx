/**
 * Usage · spend analytics (UX-SPEC §5.2).
 *
 * Charts: a hand-rolled SVG line chart for per-day spend (no D3 / no Recharts;
 * a B2B SaaS chart this simple doesn't justify the bundle cost).
 * Table: per-model breakdown.
 *
 * Data: deterministic mock from lib/mock.getUsageMock until /v1/usage lands.
 */
import { PageHeader, MockBadge, PhaseTwoBadge } from "@/components/PageHeader";
import { DataTable, type Column } from "@/components/DataTable";
import { getUsageMock, type UsageRow } from "@/lib/mock";

export const dynamic = "force-dynamic";

export default function UsagePage() {
  const u = getUsageMock();

  const cols: Column<UsageRow>[] = [
    { key: "model",    header: "Model",     render: (r) => <span className="font-mono text-small">{r.model}</span> },
    { key: "provider", header: "Provider",  width: "w-28", render: (r) => <span className="text-small text-ink-secondary">{r.provider}</span> },
    { key: "req",      header: "Requests",  align: "right", mono: true, render: (r) => r.requests.toLocaleString() },
    { key: "in",       header: "Tokens In", align: "right", mono: true, render: (r) => formatBig(r.tokensIn) },
    { key: "out",      header: "Tokens Out",align: "right", mono: true, render: (r) => formatBig(r.tokensOut) },
    { key: "spend",    header: "Spend",     align: "right", mono: true, render: (r) => `¥${r.spendJpy.toLocaleString()}` },
  ];

  return (
    <main className="mx-auto max-w-7xl px-6 py-8 lg:px-12">
      <PageHeader
        title="Usage"
        subtitle={<span className="inline-flex items-center gap-2">Spend, requests, and token consumption <MockBadge /></span>}
        right={
          <>
            <div className="rounded border border-border-subtle bg-surface-muted px-3 py-1 text-small text-ink-secondary">
              Last 30 days
            </div>
            <button
              type="button"
              disabled
              className="inline-flex items-center gap-2 rounded border border-border-default bg-surface-muted px-3 py-1.5 text-small text-ink-tertiary"
            >
              Export CSV <PhaseTwoBadge />
            </button>
          </>
        }
      />

      {/* Tabs (visual only for now) */}
      <div className="mb-4 flex gap-1 border-b border-border-subtle">
        <Tab active>By Time</Tab>
        <Tab>By Model</Tab>
        <Tab>By Project</Tab>
        <Tab>By API Key</Tab>
      </div>

      {/* Top totals */}
      <section className="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-3">
        <Total label="Total spend" value={`¥${u.totalSpendJpy.toLocaleString()}`} />
        <Total label="Tokens consumed" value={formatBig(u.totalTokens)} />
        <Total label="Requests" value={u.totalRequests.toLocaleString()} />
      </section>

      {/* Chart */}
      <section className="mb-8 rounded-lg border border-border-subtle bg-surface-base p-6 shadow-e1">
        <div className="mb-3 flex items-baseline justify-between">
          <h2 className="text-lg font-semibold text-ink-primary">Spend by day</h2>
          <p className="text-caption text-ink-tertiary">JPY · last 30 days</p>
        </div>
        <SpendChart data={u.perDay} />
      </section>

      {/* Per-model table */}
      <section>
        <div className="mb-3 flex items-baseline justify-between">
          <h2 className="text-lg font-semibold text-ink-primary">By model</h2>
          <p className="text-caption text-ink-tertiary">{u.perModel.length} variants</p>
        </div>
        <DataTable columns={cols} rows={u.perModel} />
      </section>
    </main>
  );
}

function Tab({ children, active = false }: { children: React.ReactNode; active?: boolean }) {
  return (
    <button
      type="button"
      className={
        "border-b-2 px-3 py-2 text-small transition-colors " +
        (active
          ? "border-brand-primary text-brand-primary font-medium"
          : "border-transparent text-ink-secondary hover:text-ink-primary")
      }
    >
      {children}
    </button>
  );
}

function Total({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-border-subtle bg-surface-base p-5 shadow-e1">
      <div className="text-caption uppercase tracking-[1.2px] text-ink-secondary">{label}</div>
      <div className="mt-2 font-mono text-[28px] font-bold tabular-nums text-ink-primary">{value}</div>
    </div>
  );
}

function formatBig(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(0)}K`;
  return n.toLocaleString();
}

// ── SpendChart — pure-SVG, no JS deps ─────────────────────────────
function SpendChart({ data }: { data: { date: string; spendJpy: number }[] }) {
  const W = 720;
  const H = 200;
  const padL = 36;
  const padR = 12;
  const padT = 8;
  const padB = 24;

  const innerW = W - padL - padR;
  const innerH = H - padT - padB;

  const max = Math.max(...data.map((d) => d.spendJpy)) * 1.1 || 1;
  const stepX = innerW / Math.max(1, data.length - 1);

  const points = data.map((d, i) => {
    const x = padL + i * stepX;
    const y = padT + (innerH - (d.spendJpy / max) * innerH);
    return { x, y, d };
  });

  const pathLine = points.map((p, i) => `${i === 0 ? "M" : "L"} ${p.x.toFixed(1)} ${p.y.toFixed(1)}`).join(" ");
  const pathArea = pathLine + ` L ${points[points.length - 1].x} ${padT + innerH} L ${points[0].x} ${padT + innerH} Z`;

  // Y-axis ticks: 0 / 25% / 50% / 75% / 100% of max
  const yTicks = [0, 0.25, 0.5, 0.75, 1].map((p) => ({
    y: padT + innerH - p * innerH,
    label: `¥${Math.round((max * p) / 1000)}K`,
  }));

  return (
    <svg
      viewBox={`0 0 ${W} ${H}`}
      className="w-full h-auto"
      role="img"
      aria-label="Daily spend, last 30 days"
    >
      {/* Grid + Y labels */}
      {yTicks.map((t, i) => (
        <g key={i}>
          <line x1={padL} y1={t.y} x2={W - padR} y2={t.y} stroke="#E2E8F0" strokeWidth="1" />
          <text x={padL - 6} y={t.y + 4} textAnchor="end" fontSize="10" fill="#94A3B8" fontFamily="JetBrains Mono, monospace">
            {t.label}
          </text>
        </g>
      ))}
      {/* Area fill */}
      <path d={pathArea} fill="url(#spendGrad)" opacity="0.7" />
      {/* Line */}
      <path d={pathLine} fill="none" stroke="#2563EB" strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />
      {/* Dots */}
      {points.map((p, i) => (
        <circle key={i} cx={p.x} cy={p.y} r="2.5" fill="#2563EB" />
      ))}
      {/* X axis labels (first/middle/last) */}
      {[0, Math.floor(points.length / 2), points.length - 1].map((i) => (
        <text
          key={i}
          x={points[i].x}
          y={H - 6}
          textAnchor={i === 0 ? "start" : i === points.length - 1 ? "end" : "middle"}
          fontSize="10"
          fill="#94A3B8"
          fontFamily="JetBrains Mono, monospace"
        >
          {points[i].d.date.slice(5)}
        </text>
      ))}
      <defs>
        <linearGradient id="spendGrad" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%"   stopColor="#2563EB" stopOpacity="0.35" />
          <stop offset="100%" stopColor="#2563EB" stopOpacity="0" />
        </linearGradient>
      </defs>
    </svg>
  );
}
