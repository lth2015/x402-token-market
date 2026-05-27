/**
 * Invoices · list of monthly invoices.
 * UX-SPEC §5.6.
 *
 * Data: mock until billing service lands. CSV/PDF buttons are disabled.
 */
import { Download, FileText } from "lucide-react";
import { PageHeader, MockBadge } from "@/components/PageHeader";
import { DataTable, StatusDot, type Column } from "@/components/DataTable";
import { getInvoicesMock, type InvoiceRow } from "@/lib/mock";

export const dynamic = "force-dynamic";

export default function InvoicesPage() {
  const invoices = getInvoicesMock();

  const cols: Column<InvoiceRow>[] = [
    { key: "period", header: "Period", width: "w-24", render: (r) => <span className="font-mono text-small">{r.period}</span> },
    { key: "id",     header: "Invoice ID",   render: (r) => <span className="font-mono text-[12px] text-ink-secondary">{r.id}</span> },
    { key: "total",  header: "Total",  align: "right", mono: true, render: (r) => `¥${r.totalJpy.toLocaleString()}` },
    { key: "tx",     header: "On-chain tx", align: "right", mono: true, render: (r) => r.txCount },
    { key: "calls",  header: "AI calls",    align: "right", mono: true, render: (r) => r.callCount.toLocaleString() },
    {
      key: "status",
      header: "Status",
      width: "w-24",
      render: (r) => (
        <StatusDot
          tone={r.status === "paid" ? "good" : r.status === "issued" ? "warn" : "bad"}
          label={r.status}
        />
      ),
    },
    {
      key: "actions",
      header: "",
      width: "w-32",
      align: "right",
      render: () => (
        <div className="inline-flex gap-1">
          <Btn label="PDF" icon={<FileText className="h-3.5 w-3.5" />} />
          <Btn label="CSV" icon={<Download className="h-3.5 w-3.5" />} />
        </div>
      ),
    },
  ];

  return (
    <main className="mx-auto max-w-7xl px-6 py-8 lg:px-12">
      <PageHeader
        title="Invoices"
        subtitle={<span className="inline-flex items-center gap-2">Monthly billing summaries — Japan invoice spec (法人番号 + tax ID included) <MockBadge /></span>}
      />

      <DataTable columns={cols} rows={invoices} caption="Past invoices" />

      <p className="mt-4 text-caption text-ink-tertiary">
        Each invoice CSV includes all on-chain Solana tx hashes for the period, suitable
        for accounting reconciliation. Real generation lands when the billing service
        (token-worker → invoice_generator) ships.
      </p>
    </main>
  );
}

function Btn({ label, icon }: { label: string; icon: React.ReactNode }) {
  return (
    <button
      type="button"
      disabled
      className="inline-flex items-center gap-1 rounded border border-border-default bg-surface-muted px-2 py-1 text-[11px] text-ink-tertiary"
    >
      {icon}
      {label}
    </button>
  );
}
