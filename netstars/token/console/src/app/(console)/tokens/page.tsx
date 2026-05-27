/**
 * Tokens · Balance card + Subscription card + Ledger table.
 * UX-SPEC §5.3.
 *
 * Data sources:
 *   Balance — real, /v1/balance
 *   Ledger  — real, /v1/recent-activity (server caps at 100; we ask for 50)
 *   Subscription — placeholder (no /v1/subscription endpoint yet)
 */
import Link from "next/link";
import { ExternalLink } from "lucide-react";
import { PageHeader, MockBadge, PhaseTwoBadge } from "@/components/PageHeader";
import { DataTable, type Column } from "@/components/DataTable";
import { api, type ActivityEvent } from "@/lib/api";
import { formatTokens } from "@/lib/utils";

export const dynamic = "force-dynamic";

export default async function TokensPage() {
  let balance: Awaited<ReturnType<typeof api.balance>> | null = null;
  let ledger: ActivityEvent[] = [];
  let backendError: string | null = null;
  try {
    const [b, l] = await Promise.all([api.balance(), api.recentActivity(50)]);
    balance = b;
    ledger = l.items;
  } catch (e) {
    backendError = e instanceof Error ? e.message : "unknown";
  }

  const columns: Column<ActivityEvent>[] = [
    {
      key: "ts",
      header: "Time",
      width: "w-44",
      render: (r) => (
        <span className="font-mono text-[12px] text-ink-tertiary">
          {r.ts ? r.ts.slice(0, 19).replace("T", " ") : "—"}
        </span>
      ),
    },
    {
      key: "type",
      header: "Type",
      width: "w-20",
      render: (r) => (
        <span
          className={
            r.kind === "credit"
              ? "rounded bg-semantic-success/10 px-1.5 py-0.5 text-[11px] font-medium text-semantic-success"
              : "rounded bg-brand-primary/10 px-1.5 py-0.5 text-[11px] font-medium text-brand-primary"
          }
        >
          {r.kind}
        </span>
      ),
    },
    {
      key: "amount",
      header: "Amount",
      align: "right",
      mono: true,
      render: (r) => (
        <span className={r.kind === "credit" ? "text-semantic-success" : "text-ink-primary"}>
          {r.kind === "credit" ? "+" : "−"}
          {formatTokens(r.amount_token)}
        </span>
      ),
    },
    {
      key: "source",
      header: "Source",
      render: (r) => (
        <div className="min-w-0">
          <div className="truncate text-small text-ink-primary">{r.description}</div>
          <div className="truncate font-mono text-[11px] text-ink-tertiary">
            {r.path} ·{" "}
            <Link
              href={`/audit?trace=${encodeURIComponent(r.trace_id)}`}
              className="text-ink-tertiary hover:text-brand-primary"
            >
              trace
            </Link>
          </div>
        </div>
      ),
    },
  ];

  return (
    <main className="mx-auto max-w-7xl px-6 py-8 lg:px-12">
      <PageHeader title="Tokens" subtitle="Balance, ledger, and subscription" />

      {backendError && (
        <div className="mb-4 rounded-lg border border-semantic-warning/30 bg-semantic-warning/5 px-4 py-3 text-small text-semantic-warning">
          Backend unreachable ({backendError}).
        </div>
      )}

      <section className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        {/* Balance card */}
        <div className="lg:col-span-2 rounded-lg border border-border-subtle bg-surface-base p-6 shadow-e1">
          <div className="text-caption uppercase tracking-[1.2px] text-ink-secondary">
            Current balance
          </div>
          <div className="mt-2 flex items-baseline gap-3">
            <span className="font-mono text-[40px] font-bold tabular-nums text-ink-primary">
              {balance ? formatTokens(Number(balance.balance_token)) : "—"}
            </span>
            <span className="text-body text-ink-secondary">AI Token</span>
          </div>
          <div className="mt-1 text-small text-ink-tertiary">
            {balance
              ? `≈ ${balance.usdc_equivalent} USDC · ≈ ¥${balance.jpy_equivalent ?? "—"}`
              : "—"}
          </div>
          <div className="mt-4 flex items-center gap-3 text-caption text-ink-tertiary">
            <span>On hold: {balance ? balance.on_hold_token : "0"}</span>
            <span>·</span>
            <span>Last updated: {balance?.as_of?.slice(0, 19).replace("T", " ") ?? "—"}</span>
          </div>
          <div className="mt-5 inline-flex items-center gap-2 rounded border border-dashed border-border-default px-3 py-2 text-small text-ink-tertiary">
            <span>Top up via API</span>
            <code className="rounded bg-surface-muted px-1.5 py-0.5 font-mono text-[12px]">
              POST /v1/token-purchase
            </code>
            <PhaseTwoBadge text="UI Phase 2" />
          </div>
        </div>

        {/* Subscription card */}
        <div className="rounded-lg border border-border-subtle bg-surface-base p-6 shadow-e1">
          <div className="flex items-center gap-2 text-caption uppercase tracking-[1.2px] text-ink-secondary">
            Subscription <MockBadge />
          </div>
          <div className="mt-2 text-[20px] font-semibold text-ink-primary">Growth</div>
          <div className="mt-1 font-mono text-body tabular-nums text-ink-secondary">
            ¥50,000 / month
          </div>
          <ul className="mt-3 space-y-1 text-small text-ink-secondary">
            <li>50M tokens included</li>
            <li>Overage @ ¥1.0 / 1K token</li>
            <li>Renews 2026/06/01</li>
          </ul>
          <button
            type="button"
            disabled
            className="mt-5 w-full rounded border border-border-default bg-surface-muted px-3 py-2 text-small text-ink-tertiary"
          >
            Manage subscription
          </button>
        </div>
      </section>

      <section className="mt-8">
        <div className="mb-3 flex items-baseline justify-between">
          <h2 className="text-lg font-semibold text-ink-primary">Ledger</h2>
          <a
            href="/audit"
            className="inline-flex items-center gap-1 text-caption text-ink-secondary hover:text-brand-primary"
          >
            Full audit log <ExternalLink className="h-3 w-3" />
          </a>
        </div>
        <DataTable
          columns={columns}
          rows={ledger}
          empty="No ledger entries yet. Make a token purchase or AI call via the SDK."
          caption="Most recent ledger entries"
        />
      </section>
    </main>
  );
}
