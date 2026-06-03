"use client";

/**
 * Billing — detailed invoice / billing statement for the current period.
 * Includes line items per model, subtotal, tax, total, and download actions.
 *
 * Client component: download buttons need browser APIs (Blob, URL.createObjectURL).
 * Data: deterministic mock (see lib/platform-mock.ts).
 */

import { FileText, Download } from "lucide-react";
import { PageHeader, MockBadge } from "@/components/PageHeader";
import { getBillingStatement, type BillingLineItem } from "@/lib/platform-mock";

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

function DownloadPdfButton({ label, filename, content }: { label: string; filename: string; content: string }) {
  function handleClick() {
    // Minimal valid PDF placeholder (not renderable — real PDF generation is server-side Phase 2)
    const pdfContent = `%PDF-1.4\n1 0 obj\n<< /Type /Catalog >>\nendobj\n%% Billing statement placeholder\n%% ${content}\n%%EOF`;
    downloadBlob(pdfContent, "application/pdf", filename);
  }
  return (
    <button
      type="button"
      onClick={handleClick}
      aria-label={`Download billing statement as PDF — ${filename}`}
      className="inline-flex items-center gap-1.5 rounded-lg border border-border-default bg-white px-3 py-2 text-small text-ink-secondary hover:bg-surface-muted active:scale-95 transition-all focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-primary"
    >
      <FileText className="h-3.5 w-3.5" aria-hidden />
      {label}
    </button>
  );
}

function DownloadCsvButton({ label, filename, csvContent }: { label: string; filename: string; csvContent: string }) {
  function handleClick() {
    downloadBlob(csvContent, "text/csv;charset=utf-8", filename);
  }
  return (
    <button
      type="button"
      onClick={handleClick}
      aria-label={`Download billing statement as CSV — ${filename}`}
      className="inline-flex items-center gap-1.5 rounded-lg border border-border-default bg-white px-3 py-2 text-small text-ink-secondary hover:bg-surface-muted active:scale-95 transition-all focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-primary"
    >
      <Download className="h-3.5 w-3.5" aria-hidden />
      {label}
    </button>
  );
}

// ── Formatting ────────────────────────────────────────────────────────────────

function fmtUsd(n: number) {
  return `$${n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function fmtTokens(n: number) {
  if (n >= 1e6) return `${(n / 1e6).toFixed(1)}M`;
  if (n >= 1e3) return `${(n / 1e3).toFixed(0)}K`;
  return n.toString();
}

// ── Build CSV string from line items ─────────────────────────────────────────

function buildCsv(period: string, merchantName: string, items: BillingLineItem[], subtotal: number, taxRate: number, total: number): string {
  const lines = [
    `Billing Period,${period}`,
    `Merchant,${merchantName}`,
    ``,
    `Model,Tokens,Unit Rate (per 1M),Amount`,
    ...items.map((i) =>
      `${i.model},${i.tokens},${fmtUsd(i.unitRatePerMillion)},${fmtUsd(i.amount)}`
    ),
    ``,
    `Subtotal,,, ${fmtUsd(subtotal)}`,
    `Tax (${(taxRate * 100).toFixed(0)}%),,, ${fmtUsd(subtotal * taxRate)}`,
    `Total,,, ${fmtUsd(total)}`,
  ];
  return lines.join("\n");
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function BillingPage() {
  const stmt = getBillingStatement("2026-06");
  const csvContent = buildCsv(stmt.period, stmt.merchantName, stmt.lineItems, stmt.subtotal, stmt.taxRate, stmt.total);

  return (
    <main className="mx-auto max-w-7xl px-6 py-8 lg:px-12">
      <PageHeader
        title="Billing"
        subtitle={
          <span className="inline-flex items-center gap-2">
            June 2026 · {stmt.merchantName} <MockBadge />
          </span>
        }
      />

      {/* ── Statement Card ────────────────────────────────────────── */}
      <div className="mt-6 rounded-xl border border-border-subtle bg-white p-6 shadow-e1">

        {/* Header row: period + download buttons */}
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between mb-6">
          <div>
            <p className="text-caption uppercase tracking-[1px] text-ink-tertiary">Billing Period</p>
            <p className="mt-1 text-xl font-semibold text-ink-primary">June 2026</p>
            <p className="mt-0.5 text-small text-ink-secondary">{stmt.merchantName}</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <DownloadPdfButton
              label="Download PDF"
              filename="billing-2026-06.pdf"
              content={`Period: ${stmt.period} | Merchant: ${stmt.merchantName} | Total: ${fmtUsd(stmt.total)}`}
            />
            <DownloadCsvButton
              label="Download CSV"
              filename="billing-2026-06.csv"
              csvContent={csvContent}
            />
          </div>
        </div>

        {/* ── Line Items Table ───────────────────────────────────── */}
        <div className="overflow-x-auto rounded-lg border border-border-subtle">
          <table className="w-full text-small" aria-label="Billing line items for June 2026">
            <thead>
              <tr className="border-b border-border-subtle bg-surface-muted/50 text-caption uppercase tracking-[0.6px] text-ink-secondary">
                <th scope="col" className="px-4 py-2.5 font-medium text-left">Model</th>
                <th scope="col" className="px-4 py-2.5 font-medium text-right">Tokens</th>
                <th scope="col" className="px-4 py-2.5 font-medium text-right">Unit Rate&nbsp;<span className="normal-case">(per 1M)</span></th>
                <th scope="col" className="px-4 py-2.5 font-medium text-right">Amount</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border-subtle">
              {stmt.lineItems.map((item) => (
                <tr key={item.model} className="hover:bg-surface-muted/40">
                  <td className="px-4 py-3 font-medium text-ink-primary">{item.model}</td>
                  <td className="px-4 py-3 text-right font-mono tabular-nums text-ink-secondary">
                    {fmtTokens(item.tokens)}
                  </td>
                  <td className="px-4 py-3 text-right font-mono tabular-nums text-ink-secondary">
                    {fmtUsd(item.unitRatePerMillion)}
                  </td>
                  <td className="px-4 py-3 text-right font-mono tabular-nums text-ink-primary font-medium">
                    {fmtUsd(item.amount)}
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="border-t border-border-subtle bg-surface-muted/30">
                <td colSpan={3} className="px-4 py-3 text-right text-small text-ink-secondary">
                  Subtotal
                </td>
                <td className="px-4 py-3 text-right font-mono tabular-nums text-ink-primary font-medium">
                  {fmtUsd(stmt.subtotal)}
                </td>
              </tr>
              <tr className="border-t border-border-subtle bg-surface-muted/30">
                <td colSpan={3} className="px-4 py-3 text-right text-small text-ink-secondary">
                  Tax ({(stmt.taxRate * 100).toFixed(0)}%)
                </td>
                <td className="px-4 py-3 text-right font-mono tabular-nums text-ink-secondary">
                  {fmtUsd(stmt.subtotal * stmt.taxRate)}
                </td>
              </tr>
              <tr className="border-t-2 border-border-subtle bg-surface-muted/50">
                <td colSpan={3} className="px-4 py-3.5 text-right font-semibold text-ink-primary">
                  Total
                </td>
                <td className="px-4 py-3.5 text-right font-mono tabular-nums font-bold text-[16px] text-ink-primary">
                  {fmtUsd(stmt.total)}
                </td>
              </tr>
            </tfoot>
          </table>
        </div>

        {/* Footer note */}
        <p className="mt-4 text-caption text-ink-tertiary">
          All amounts in USD. Tax rate 10% (Consumption Tax) applied on subtotal.
          Real invoice generation (PDF with corporate registration number) available in Phase 2.
        </p>
      </div>
    </main>
  );
}
