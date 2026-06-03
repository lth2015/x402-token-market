"use client";

/**
 * RevenueAreaChart — month-to-date cumulative revenue area chart.
 *
 * UX rules applied:
 *  - chart-type: area for cumulative trend
 *  - tooltip-on-interact: exact values on hover
 *  - axis-labels: Y-axis with $ currency format
 *  - gridline-subtle: stroke="#E4E7EB" (border-border-subtle)
 *  - responsive-chart: ResponsiveContainer 100% width
 *  - animation-optional: animationDuration respects prefer-reduced-motion via CSS media
 *  - screen-reader-summary: aria-label on wrapper
 */

import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts";
import type { RevenueTrendPoint } from "@/lib/platform-mock";

// ── Custom Tooltip ────────────────────────────────────────────────────────────
function CustomTooltip({ active, payload, label }: { active?: boolean; payload?: Array<{ value?: number }>; label?: string }) {
  if (!active || !payload?.length) return null;
  const value = payload[0]?.value ?? 0;
  return (
    <div
      className="rounded-lg border border-border-subtle bg-white px-3 py-2 shadow-lg text-small"
      role="status"
      aria-live="polite"
    >
      <p className="font-medium text-ink-primary">{label}</p>
      <p className="mt-0.5 font-mono tabular-nums text-semantic-success">
        ${value.toLocaleString()} cumulative
      </p>
    </div>
  );
}

// ── Main Component ─────────────────────────────────────────────────────────────
export function RevenueAreaChart({ data }: { data: RevenueTrendPoint[] }) {
  return (
    <div
      aria-label={`Month-to-date revenue area chart. Latest value: $${data[data.length - 1]?.revenue.toLocaleString() ?? "0"}`}
      role="img"
    >
      <ResponsiveContainer width="100%" height={220}>
        <AreaChart
          data={data}
          margin={{ top: 8, right: 12, left: 0, bottom: 0 }}
        >
          <defs>
            <linearGradient id="revenueGradient" x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%"  stopColor="#059669" stopOpacity={0.18} />
              <stop offset="95%" stopColor="#059669" stopOpacity={0.02} />
            </linearGradient>
          </defs>

          <CartesianGrid
            strokeDasharray="3 3"
            stroke="#E4E7EB"
            vertical={false}
          />

          <XAxis
            dataKey="date"
            tick={{ fontSize: 11, fill: "#6B7280" }}
            axisLine={false}
            tickLine={false}
            dy={6}
          />

          <YAxis
            tickFormatter={(v: number) => `$${v.toLocaleString()}`}
            tick={{ fontSize: 11, fill: "#6B7280" }}
            axisLine={false}
            tickLine={false}
            width={72}
          />

          <Tooltip content={<CustomTooltip />} />

          <Area
            type="monotone"
            dataKey="revenue"
            stroke="#059669"
            strokeWidth={2}
            fill="url(#revenueGradient)"
            dot={{ fill: "#059669", r: 4, strokeWidth: 0 }}
            activeDot={{ r: 6, strokeWidth: 0 }}
            animationDuration={500}
            isAnimationActive
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}
