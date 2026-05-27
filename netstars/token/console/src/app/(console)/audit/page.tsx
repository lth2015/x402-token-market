/**
 * Audit Log · filterable table.
 * UX-SPEC §5.8.
 *
 * Supports query params for deep-linking from other pages:
 *   ?trace=<id>       highlight rows with that trace_id
 *   ?actor=<email>    filter by actor
 *   ?action=<verb>    filter by action
 *
 * Data: mock until /v1/audit lands.
 */
import Link from "next/link";
import { PageHeader, MockBadge } from "@/components/PageHeader";
import { DataTable, type Column } from "@/components/DataTable";
import { getAuditMock, type AuditRow } from "@/lib/mock";

export const dynamic = "force-dynamic";

export default async function AuditPage(props: {
  searchParams?: Promise<{ trace?: string; actor?: string; action?: string }>;
}) {
  const sp = (await props.searchParams) ?? {};
  const all = getAuditMock(60);

  // If a trace is passed, surface it first; otherwise filter
  let rows = all;
  if (sp.actor) rows = rows.filter((r) => r.actor === sp.actor);
  if (sp.action) rows = rows.filter((r) => r.action === sp.action);

  const cols: Column<AuditRow>[] = [
    {
      key: "ts",
      header: "Time",
      width: "w-44",
      render: (r) => (
        <span className="font-mono text-[12px] text-ink-tertiary">
          {r.ts.slice(0, 19).replace("T", " ")}
        </span>
      ),
    },
    {
      key: "actor",
      header: "Actor",
      render: (r) => (
        <div>
          <div className="text-small text-ink-primary">{r.actor}</div>
          <div className="text-caption text-ink-tertiary">{r.actorType}</div>
        </div>
      ),
    },
    {
      key: "action",
      header: "Action",
      width: "w-44",
      render: (r) => <span className="font-mono text-[12px] text-brand-primary">{r.action}</span>,
    },
    {
      key: "resource",
      header: "Resource",
      render: (r) => (
        <div>
          <div className="text-small text-ink-secondary">{r.resourceType}</div>
          <div className="font-mono text-[11px] text-ink-tertiary">{r.resourceId}</div>
        </div>
      ),
    },
    {
      key: "trace",
      header: "Trace",
      width: "w-28",
      render: (r) => (
        <a
          href={`#trace-${r.traceId}`}
          className="font-mono text-[11px] text-brand-primary hover:underline"
          title={r.traceId}
        >
          {r.traceId.slice(3, 11)}…
        </a>
      ),
    },
  ];

  return (
    <main className="mx-auto max-w-7xl px-6 py-8 lg:px-12">
      <PageHeader
        title="Audit Log"
        subtitle={<span className="inline-flex items-center gap-2">Every state-changing action across this org <MockBadge /></span>}
        right={
          <div className="text-caption text-ink-tertiary">
            Hot retention 90d · Cold 7 yrs (compliance)
          </div>
        }
      />

      {/* Filter chips */}
      <div className="mb-4 flex flex-wrap items-center gap-2 text-caption text-ink-tertiary">
        <span>Filters:</span>
        <FilterChip label="Last 7 days" disabled />
        <FilterChip label="All actions" disabled />
        <FilterChip label="All actors" disabled />
        {sp.trace && (
          <span className="rounded bg-brand-primary/10 px-2 py-1 font-mono text-[11px] text-brand-primary">
            trace: {sp.trace.slice(0, 16)}…
            <Link href="/audit" className="ml-2 text-ink-secondary hover:text-brand-primary">×</Link>
          </span>
        )}
      </div>

      <DataTable
        columns={cols}
        rows={rows}
        empty="No matching audit events."
      />

      <p className="mt-4 text-caption text-ink-tertiary">
        Click a row's trace ID to follow the full request span across services in Grafana Tempo.
        Audit rows are append-only at the DB level (UPDATE/DELETE revoked on the audit_log table).
      </p>
    </main>
  );
}

function FilterChip({ label, disabled }: { label: string; disabled?: boolean }) {
  return (
    <button
      type="button"
      disabled={disabled}
      className="rounded border border-border-subtle bg-surface-muted px-2.5 py-1 text-caption text-ink-secondary disabled:opacity-60"
    >
      {label} ▾
    </button>
  );
}
