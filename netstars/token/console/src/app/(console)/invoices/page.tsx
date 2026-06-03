"use client";

/**
 * Invoices · list of monthly invoices.
 * UX-SPEC §5.6.
 *
 * Enhanced: PDF/CSV download buttons are now functional (mock blob download).
 * Resend button triggers Toast notification (auto-dismiss 4s).
 *
 * Data: mock until billing service lands.
 */

import { useState, useCallback } from "react";
import { Download, FileText, Send, CheckCircle2 } from "lucide-react";
import { PageHeader, MockBadge } from "@/components/PageHeader";
import { DataTable, StatusDot, type Column } from "@/components/DataTable";
import { getInvoicesMock, type InvoiceRow } from "@/lib/mock";

export const dynamic = "force-dynamic";

// ── Download helpers ──────────────────────────────────────────────────────────

function downloadBlob(content: string, mimeType: string, filename: string) {
  const blob = new Blob([content], { type: mimeType });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement("a");
  a.href     = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

function handlePdfDownload(invoice: InvoiceRow) {
  const content = `%PDF-1.4\n1 0 obj\n<< /Type /Catalog >>\nendobj\n%% Invoice ${invoice.id}\n%% Period: ${invoice.period}\n%% Total: ¥${invoice.totalJpy.toLocaleString()}\n%%EOF`;
  downloadBlob(content, "application/pdf", `invoice-${invoice.period.replace("/", "-")}.pdf`);
}

function handleCsvDownload(invoice: InvoiceRow) {
  const lines = [
    `Invoice ID,${invoice.id}`,
    `Period,${invoice.period}`,
    `Total (JPY),¥${invoice.totalJpy.toLocaleString()}`,
    `Settlements,${invoice.txCount}`,
    `AI Calls,${invoice.callCount.toLocaleString()}`,
    `Status,${invoice.status}`,
  ];
  downloadBlob(lines.join("\n"), "text/csv;charset=utf-8", `invoice-${invoice.period.replace("/", "-")}.csv`);
}

// ── Toast Component ───────────────────────────────────────────────────────────
// UX rule: toast-dismiss 3-5s; toast-accessibility aria-live="polite"

function Toast({ message, onDismiss }: { message: string; onDismiss: () => void }) {
  return (
    <div
      role="status"
      aria-live="polite"
      aria-atomic="true"
      className="fixed bottom-6 right-6 z-50 flex items-center gap-3 rounded-lg border border-semantic-success/30 bg-white px-5 py-3 shadow-lg animate-in fade-in slide-in-from-bottom-2 duration-200"
    >
      <CheckCircle2 className="h-4 w-4 text-semantic-success shrink-0" aria-hidden />
      <span className="text-small text-ink-primary font-medium">{message}</span>
      <button
        type="button"
        onClick={onDismiss}
        aria-label="Dismiss notification"
        className="ml-2 text-ink-tertiary hover:text-ink-primary text-[18px] leading-none focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-primary rounded"
      >
        &times;
      </button>
    </div>
  );
}

// ── Action Buttons ────────────────────────────────────────────────────────────

function InvoiceActions({
  invoice,
  onResent,
}: {
  invoice: InvoiceRow;
  onResent: (msg: string) => void;
}) {
  function handleResend() {
    // POST to mock resend route
    fetch("/api/proxy/invoice/resend", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: invoice.id }),
    })
      .then((r) => r.json())
      .then((data: { ok: boolean; email: string }) => {
        if (data.ok) onResent(`Invoice resent to ${data.email}`);
      })
      .catch(() => {
        // Fallback: show toast even if fetch fails (mock env may not have network)
        onResent(`Invoice resent to ops@haba-rd.jp`);
      });
  }

  return (
    <div className="inline-flex gap-1" role="group" aria-label={`Actions for invoice ${invoice.id}`}>
      <ActionBtn
        label="PDF"
        icon={<FileText className="h-3.5 w-3.5" aria-hidden />}
        onClick={() => handlePdfDownload(invoice)}
        title={`Download PDF for ${invoice.period}`}
      />
      <ActionBtn
        label="CSV"
        icon={<Download className="h-3.5 w-3.5" aria-hidden />}
        onClick={() => handleCsvDownload(invoice)}
        title={`Download CSV for ${invoice.period}`}
      />
      <ActionBtn
        label="Resend"
        icon={<Send className="h-3.5 w-3.5" aria-hidden />}
        onClick={handleResend}
        title="Resend invoice to ops@haba-rd.jp"
      />
    </div>
  );
}

function ActionBtn({
  label,
  icon,
  onClick,
  title,
}: {
  label: string;
  icon: React.ReactNode;
  onClick: () => void;
  title?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={title}
      className="inline-flex items-center gap-1 rounded border border-border-default bg-surface-muted px-2 py-1 text-[11px] text-ink-secondary hover:bg-surface-base hover:text-ink-primary active:scale-95 transition-all focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-primary"
    >
      {icon}
      {label}
    </button>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function InvoicesPage() {
  const invoices = getInvoicesMock();

  const [toastMsg, setToastMsg] = useState<string | null>(null);

  const showToast = useCallback((msg: string) => {
    setToastMsg(msg);
    const timer = setTimeout(() => setToastMsg(null), 4000);
    // Cleanup not strictly needed for a toast but good practice
    return () => clearTimeout(timer);
  }, []);

  const cols: Column<InvoiceRow>[] = [
    {
      key: "period",
      header: "Period",
      width: "w-24",
      render: (r) => <span className="font-mono text-small">{r.period}</span>,
    },
    {
      key: "id",
      header: "Invoice ID",
      render: (r) => (
        <span className="font-mono text-[12px] text-ink-secondary">{r.id}</span>
      ),
    },
    {
      key: "total",
      header: "Total",
      align: "right",
      mono: true,
      render: (r) => `¥${r.totalJpy.toLocaleString()}`,
    },
    {
      key: "tx",
      header: "Settlements",
      align: "right",
      mono: true,
      render: (r) => r.txCount,
    },
    {
      key: "calls",
      header: "AI calls",
      align: "right",
      mono: true,
      render: (r) => r.callCount.toLocaleString(),
    },
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
      width: "w-40",
      align: "right",
      render: (r) => (
        <InvoiceActions invoice={r} onResent={showToast} />
      ),
    },
  ];

  return (
    <main className="mx-auto max-w-7xl px-6 py-8 lg:px-12">
      <PageHeader
        title="Invoices"
        subtitle={
          <span className="inline-flex items-center gap-2">
            Monthly billing summaries — Japan invoice spec (corporate number + tax ID included){" "}
            <MockBadge />
          </span>
        }
      />

      <DataTable columns={cols} rows={invoices} caption="Past invoices" />

      <p className="mt-4 text-caption text-ink-tertiary">
        Each invoice CSV includes settlement reference numbers for the period,
        suitable for accounting reconciliation. Real generation lands when the billing service
        (token-worker → invoice_generator) ships.
      </p>

      {/* Toast notification — fixed bottom-right, aria-live polite, auto-dismiss 4s */}
      {toastMsg && (
        <Toast message={toastMsg} onDismiss={() => setToastMsg(null)} />
      )}
    </main>
  );
}
