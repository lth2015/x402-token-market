/**
 * Revenue Dashboard — platform operator view.
 * Month-to-date KPIs + area chart trend + model breakdown pie.
 *
 * Data: deterministic mock (see lib/platform-mock.ts).
 * All client chart components are lazy-imported to avoid SSR issues.
 */

import { Suspense } from "react";
import { PageHeader, MockBadge } from "@/components/PageHeader";
import { KpiCard } from "@/components/KpiCard";
import { getPlatformMetrics, getRevenueTrend, getModelBreakdown } from "@/lib/platform-mock";
import { RevenueChartSection } from "./RevenueChartSection";

export const dynamic = "force-dynamic";

export default function RevenuePage() {
  const metrics     = getPlatformMetrics();
  const revenueTrend   = getRevenueTrend();
  const modelBreakdown = getModelBreakdown();

  return (
    <main className="mx-auto max-w-7xl px-6 py-8 lg:px-12">
      <PageHeader
        title="Revenue Dashboard"
        subtitle={
          <span className="inline-flex items-center gap-2">
            Month-to-Date · June 2026 <MockBadge />
          </span>
        }
      />

      {/* ── KPI Cards ──────────────────────────────────────────────── */}
      <section
        className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-5"
        aria-label="Key performance indicators"
      >
        <KpiCard
          label="Total Token Consumption"
          value="2.14T"
          unit="Tokens"
        />
        <KpiCard
          label="Total Cost"
          value="$14,280"
          delta={{ label: "MTD", tone: "neutral" }}
        />
        <KpiCard
          label="Total Revenue MTD"
          value="$17,136"
          delta={{ label: "+20% margin", tone: "good" }}
        />
        <KpiCard
          label="Active Merchants"
          value={metrics.activeMerchants.toString()}
        />
        <KpiCard
          label="Total Auto Topups"
          value={metrics.totalAutoTopups.toLocaleString()}
        />
      </section>

      {/* ── Charts Row ─────────────────────────────────────────────── */}
      <Suspense
        fallback={
          <div className="mt-8 grid grid-cols-1 gap-6 lg:grid-cols-3">
            <div className="lg:col-span-2 rounded-xl border bg-white p-6 shadow-sm animate-pulse">
              <div className="h-4 w-48 rounded bg-surface-muted mb-4" />
              <div className="h-[220px] rounded bg-surface-muted" />
            </div>
            <div className="rounded-xl border bg-white p-6 shadow-sm animate-pulse">
              <div className="h-4 w-36 rounded bg-surface-muted mb-4" />
              <div className="h-[200px] rounded bg-surface-muted" />
            </div>
          </div>
        }
      >
        <RevenueChartSection
          revenueTrend={revenueTrend}
          modelBreakdown={modelBreakdown}
        />
      </Suspense>
    </main>
  );
}
