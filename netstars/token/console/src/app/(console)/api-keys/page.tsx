/**
 * API Keys · list + selected key detail (UX-SPEC §5.4).
 *
 * Query param: ?selected=<id>  picks the active row.
 * Data: all mock for now (no /v1/console/api-keys endpoint yet).
 */
import Link from "next/link";
import { PageHeader, MockBadge, PhaseTwoBadge } from "@/components/PageHeader";
import { DataTable, StatusDot, type Column } from "@/components/DataTable";
import { getApiKeysMock, getKeyCallsMock, type ApiKeyRow, type KeyCallRow } from "@/lib/mock";
import { formatRelative } from "@/lib/utils";

export const dynamic = "force-dynamic";

export default async function ApiKeysPage(props: {
  searchParams?: Promise<{ selected?: string }>;
}) {
  const sp = (await props.searchParams) ?? {};
  const keys = getApiKeysMock();
  const selected = keys.find((k) => k.id === sp.selected) ?? keys[0];
  const calls = getKeyCallsMock();

  const keyCols: Column<ApiKeyRow>[] = [
    {
      key: "prefix",
      header: "Key",
      width: "w-32",
      render: (r) => (
        <Link
          href={`/api-keys?selected=${encodeURIComponent(r.id)}`}
          className="font-mono text-small text-brand-primary hover:underline"
        >
          {r.prefix}…
        </Link>
      ),
    },
    { key: "label", header: "Label", render: (r) => r.label },
    {
      key: "project",
      header: "Project",
      width: "w-24",
      render: (r) => <span className="text-small text-ink-secondary">{r.project}</span>,
    },
    {
      key: "status",
      header: "Status",
      width: "w-28",
      render: (r) => (
        <StatusDot
          tone={r.status === "active" ? "good" : "bad"}
          label={r.status}
        />
      ),
    },
    {
      key: "last_used",
      header: "Last used",
      width: "w-32",
      render: (r) => (
        <span className="text-caption text-ink-tertiary">{formatRelative(r.lastUsed, "en")}</span>
      ),
    },
  ];

  const callCols: Column<KeyCallRow>[] = [
    {
      key: "ts",
      header: "Time",
      width: "w-24",
      render: (r) => (
        <span className="font-mono text-[11px] text-ink-tertiary">
          {r.ts.slice(11, 19)}
        </span>
      ),
    },
    { key: "model", header: "Model", render: (r) => <span className="font-mono text-small">{r.model}</span> },
    {
      key: "tokens",
      header: "Tokens",
      align: "right",
      mono: true,
      render: (r) => (r.tokens != null ? r.tokens.toLocaleString() : "—"),
    },
    {
      key: "cost",
      header: "Cost",
      align: "right",
      mono: true,
      render: (r) => (r.costJpy != null ? `¥${r.costJpy}` : "—"),
    },
    {
      key: "status",
      header: "Status",
      width: "w-24",
      render: (r) => (
        <StatusDot
          tone={r.status === "succeed" ? "good" : r.status === "timeout" ? "warn" : "bad"}
          label={r.status}
        />
      ),
    },
    {
      key: "trace",
      header: "Trace",
      width: "w-28",
      render: (r) => (
        <Link
          href={`/audit?trace=${encodeURIComponent(r.traceId)}`}
          className="font-mono text-[11px] text-brand-primary hover:underline"
        >
          {r.traceId.slice(3, 11)}…
        </Link>
      ),
    },
  ];

  return (
    <main className="mx-auto max-w-7xl px-6 py-8 lg:px-12">
      <PageHeader
        title="API Keys"
        subtitle={
          <span className="inline-flex items-center gap-2">
            One agent_key per project / per environment. Click a row to inspect. <MockBadge />
          </span>
        }
        right={
          <button
            type="button"
            disabled
            className="inline-flex items-center gap-2 rounded border border-border-default bg-surface-muted px-3 py-1.5 text-small text-ink-tertiary"
          >
            + Create new key <PhaseTwoBadge />
          </button>
        }
      />

      <DataTable columns={keyCols} rows={keys} caption="API keys for this org" />

      <section className="mt-8 space-y-4">
        <h2 className="text-lg font-semibold text-ink-primary">
          <span className="font-mono text-base text-brand-primary">{selected.prefix}…</span>
          <span className="ml-2 text-ink-secondary">· {selected.label}</span>
        </h2>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <Stat label="Rate limit"        value={`${selected.ratePerMin} req/min`} />
          <Stat label="Token quota"       value={`${(selected.tokensPerMin / 1_000_000).toFixed(0)}M / min`} />
          <Stat label="Daily spend cap"   value={`¥${selected.dailyLimitJpy.toLocaleString()}`} />
        </div>

        <div className="rounded-lg border border-border-subtle bg-surface-base p-4 shadow-e1">
          <div className="text-caption uppercase tracking-[1.2px] text-ink-secondary">
            Allowed models
          </div>
          <div className="mt-2 flex flex-wrap gap-1.5">
            {selected.allowedModels.map((m) => (
              <span
                key={m}
                className="rounded bg-brand-primary/10 px-2 py-0.5 font-mono text-[12px] text-brand-primary"
              >
                {m}
              </span>
            ))}
          </div>
        </div>

        <div>
          <div className="mb-2 text-caption uppercase tracking-[1.2px] text-ink-secondary">
            Last 100 requests
          </div>
          <DataTable columns={callCols} rows={calls} />
        </div>
      </section>
    </main>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-border-subtle bg-surface-base p-4 shadow-e1">
      <div className="text-caption uppercase tracking-[1.2px] text-ink-secondary">{label}</div>
      <div className="mt-1 font-mono text-[18px] font-semibold tabular-nums text-ink-primary">
        {value}
      </div>
    </div>
  );
}
