/**
 * Merchants — Top 10 merchants by monthly token usage.
 * Platform operator view — Netstars internal only.
 *
 * Data: deterministic mock (see lib/platform-mock.ts).
 */

import { PageHeader, MockBadge } from "@/components/PageHeader";
import { DataTable, StatusDot, type Column } from "@/components/DataTable";
import { getMerchantRanking, type MerchantRankingRow } from "@/lib/platform-mock";
import { cn } from "@/lib/utils";

export const dynamic = "force-dynamic";

/** Format token count as e.g. "312.4M" */
function fmtTokens(n: number): string {
  if (n >= 1e9) return `${(n / 1e9).toFixed(1)}B`;
  if (n >= 1e6) return `${(n / 1e6).toFixed(1)}M`;
  if (n >= 1e3) return `${(n / 1e3).toFixed(1)}K`;
  return n.toString();
}

export default function MerchantsPage() {
  const rows = getMerchantRanking();

  const cols: Column<MerchantRankingRow>[] = [
    {
      key: "rank",
      header: "#",
      width: "w-12",
      render: (r) => (
        <span
          className={cn(
            "font-mono tabular-nums text-small",
            r.rank <= 3 ? "font-semibold text-brand-primary" : "text-ink-secondary",
          )}
        >
          {r.rank}
        </span>
      ),
    },
    {
      key: "name",
      header: "Merchant",
      render: (r) => (
        <span className="font-medium text-ink-primary">{r.merchantName}</span>
      ),
    },
    {
      key: "merchantId",
      header: "Merchant ID",
      render: (r) => (
        <span className="font-mono text-[11px] text-ink-tertiary">{r.merchantId}</span>
      ),
    },
    {
      key: "tokens",
      header: "MTD Tokens",
      align: "right",
      mono: true,
      render: (r) => fmtTokens(r.monthlyTokenUsage),
    },
    {
      key: "cost",
      header: "MTD Cost",
      align: "right",
      mono: true,
      render: (r) => `$${r.monthlyCostUsd.toLocaleString()}`,
    },
    {
      key: "revenue",
      header: "Revenue",
      align: "right",
      mono: true,
      render: (r) => (
        <span className="text-semantic-success font-mono tabular-nums font-medium">
          ${r.revenueUsd.toLocaleString()}
        </span>
      ),
    },
    {
      key: "status",
      header: "Status",
      width: "w-28",
      render: (r) => (
        <StatusDot
          tone={
            r.status === "active"    ? "good" :
            r.status === "trial"     ? "warn" :
                                       "bad"
          }
          label={r.status}
        />
      ),
    },
  ];

  return (
    <main className="mx-auto max-w-7xl px-6 py-8 lg:px-12">
      <PageHeader
        title="Merchant Management"
        subtitle={
          <span className="inline-flex items-center gap-2">
            Top 10 by Monthly Token Usage <MockBadge />
          </span>
        }
        right={
          <button
            type="button"
            disabled
            title="Full merchant list available in Phase 2"
            className="inline-flex items-center gap-1.5 rounded-lg border border-border-default bg-surface-muted px-3 py-2 text-small text-ink-tertiary cursor-not-allowed"
          >
            View All
          </button>
        }
      />

      <DataTable
        columns={cols}
        rows={rows}
        caption="Top 10 merchants ranked by monthly token usage"
      />

      <p className="mt-4 text-caption text-ink-tertiary">
        Ranked by monthly token usage (month-to-date).
        Revenue = token cost &times; 1.20 platform margin.
        Full merchant list and filters available in Phase 2.
      </p>
    </main>
  );
}
