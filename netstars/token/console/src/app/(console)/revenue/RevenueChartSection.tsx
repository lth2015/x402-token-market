"use client";

/**
 * RevenueChartSection — client boundary for recharts components.
 * Receives serialised data from the server page to avoid client/server split.
 */

import { RevenueAreaChart } from "@/components/RevenueAreaChart";
import { ModelPieChart }    from "@/components/ModelPieChart";
import type { RevenueTrendPoint, ModelBreakdownItem } from "@/lib/platform-mock";

export function RevenueChartSection({
  revenueTrend,
  modelBreakdown,
}: {
  revenueTrend:    RevenueTrendPoint[];
  modelBreakdown:  ModelBreakdownItem[];
}) {
  return (
    <div className="mt-8 grid grid-cols-1 gap-6 lg:grid-cols-3">
      {/* Revenue Trend — 2/3 width */}
      <section
        className="lg:col-span-2 rounded-xl border border-border-subtle bg-white p-6 shadow-e1"
        aria-labelledby="revenue-trend-heading"
      >
        <h2
          id="revenue-trend-heading"
          className="mb-4 text-base font-semibold text-ink-primary"
        >
          Month-to-Date Revenue
          <span className="ml-2 text-small font-normal text-ink-tertiary">
            Cumulative · USD
          </span>
        </h2>
        <RevenueAreaChart data={revenueTrend} />
      </section>

      {/* Model Breakdown — 1/3 width */}
      <section
        className="rounded-xl border border-border-subtle bg-white p-6 shadow-e1"
        aria-labelledby="model-breakdown-heading"
      >
        <h2
          id="model-breakdown-heading"
          className="mb-2 text-base font-semibold text-ink-primary"
        >
          Token Usage by Model
        </h2>
        <ModelPieChart data={modelBreakdown} />
      </section>
    </div>
  );
}
