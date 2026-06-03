"use client";

import { useState, useEffect } from "react";
import { Fingerprint, RefreshCw } from "lucide-react";
import { type AutoTopupRecord } from "@/lib/haba/enterprise";
import { TopupRuleCard } from "@/components/enterprise/TopupRuleCard";
import { TopupHistoryTable } from "@/components/enterprise/TopupHistoryTable";
import { PaymentAuthModal } from "@/components/enterprise/PaymentAuthModal";

export default function TopupPage() {
  const [modalOpen, setModalOpen] = useState(false);
  const [records, setRecords] = useState<AutoTopupRecord[]>([]);
  const [isMock, setIsMock] = useState(false);
  const [loading, setLoading] = useState(true);

  async function fetchHistory() {
    setLoading(true);
    try {
      const res = await fetch("/api/enterprise/topup-history", { cache: "no-store" });
      if (res.ok) {
        const json = await res.json() as { data: AutoTopupRecord[]; is_mock: boolean };
        setRecords(json.data);
        setIsMock(json.is_mock);
      }
    } catch { /* keep empty */ }
    finally { setLoading(false); }
  }

  useEffect(() => { fetchHistory(); }, []);

  return (
    <main className="mx-auto w-full max-w-7xl px-6 py-8 lg:px-10">
      <div className="mb-6">
        <h1 className="text-lg font-semibold text-ink-primary">Auto Topup History</h1>
        <p className="text-caption text-ink-tertiary">Automated AI Agent top-up records</p>
      </div>

      {/* Rule card */}
      <TopupRuleCard />

      {/* History table */}
      <section aria-label="Topup history" className="mt-6">
        <div className="mb-3 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <h2 className="text-small font-semibold text-ink-primary">Recent Topup Records</h2>
          </div>
          <div className="flex items-center gap-3">
            <span className="text-caption text-ink-tertiary tabular-nums">{records.length} records</span>
            <button
              type="button"
              onClick={fetchHistory}
              disabled={loading}
              className="inline-flex items-center gap-1 text-caption text-ink-tertiary hover:text-brand-primary transition-colors disabled:opacity-50"
              aria-label="Refresh topup history"
            >
              <RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} aria-hidden />
              Refresh
            </button>
          </div>
        </div>
        {loading ? (
          <div className="flex items-center justify-center rounded-xl border border-border-default bg-surface-elevated py-12 text-small text-ink-tertiary">
            Loading records…
          </div>
        ) : records.length === 0 ? (
          <div className="flex items-center justify-center rounded-xl border border-border-default bg-surface-elevated py-12 text-small text-ink-tertiary">
            No topup records yet.
          </div>
        ) : (
          <TopupHistoryTable records={records} />
        )}
      </section>

      {/* Payment authorization */}
      <section
        aria-label="Payment authorization"
        className="mt-8 rounded-xl border border-brand-border bg-surface-elevated p-6 shadow-e1"
      >
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 className="text-small font-semibold text-ink-primary">Payment Authorization</h2>
            <p className="mt-1 text-caption text-ink-secondary max-w-sm">
              Authorize a one-time top-up of 100M Tokens via x402 on Solana · USDC.
              Touch ID confirmation required.
            </p>
          </div>
          <button
            type="button"
            onClick={() => setModalOpen(true)}
            className="inline-flex shrink-0 items-center gap-2 rounded-xl bg-brand-primary px-5 py-2.5 text-small font-medium text-white shadow-e1 hover:bg-brand-primary-hover hover:shadow-e2 transition-all active:scale-[0.98]"
          >
            <Fingerprint className="h-4 w-4" aria-hidden />
            Authorize Topup
          </button>
        </div>
      </section>

      <PaymentAuthModal open={modalOpen} onClose={() => setModalOpen(false)} />
    </main>
  );
}
