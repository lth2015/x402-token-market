"use client";

import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts";
import { useState } from "react";
import {
  MOCK_TREND_TODAY,
  MOCK_TREND_WEEK,
  MOCK_TREND_MONTH,
  type ConsumptionDataPoint,
} from "@/lib/haba/enterprise";
import { cn } from "@/lib/utils";

type Period = "today" | "week" | "month";

const DATA: Record<Period, ConsumptionDataPoint[]> = {
  today: MOCK_TREND_TODAY,
  week: MOCK_TREND_WEEK,
  month: MOCK_TREND_MONTH,
};

function fmtTokenAxis(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(0)}M`;
  if (n >= 1_000)     return `${(n / 1_000).toFixed(0)}K`;
  return String(n);
}

function fmtTokenTooltip(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(2)}M tokens`;
  if (n >= 1_000)     return `${(n / 1_000).toFixed(0)}K tokens`;
  return `${n} tokens`;
}

const TABS: { key: Period; label: string }[] = [
  { key: "today", label: "Today" },
  { key: "week",  label: "Week" },
  { key: "month", label: "Month" },
];

export function ConsumptionTrendChart() {
  const [period, setPeriod] = useState<Period>("today");
  const data = DATA[period];

  return (
    <div className="rounded-xl border border-border-default bg-surface-elevated p-6 shadow-e1">
      <div className="mb-5 flex items-center justify-between">
        <h2 className="text-small font-semibold text-ink-primary">Token Consumption Trend</h2>
        <div className="flex rounded-lg border border-border-default overflow-hidden" role="group" aria-label="Time period">
          {TABS.map((tab) => (
            <button
              key={tab.key}
              type="button"
              onClick={() => setPeriod(tab.key)}
              aria-pressed={period === tab.key}
              className={cn(
                "px-3 py-1.5 text-caption font-medium transition-colors",
                period === tab.key
                  ? "bg-brand-primary text-white"
                  : "bg-surface-elevated text-ink-secondary hover:bg-surface-muted",
              )}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>
      <ResponsiveContainer width="100%" height={220}>
        <AreaChart data={data} margin={{ top: 4, right: 4, bottom: 0, left: 0 }}>
          <defs>
            <linearGradient id="tokenGrad" x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%"  stopColor="#2F5D45" stopOpacity={0.15} />
              <stop offset="95%" stopColor="#2F5D45" stopOpacity={0} />
            </linearGradient>
          </defs>
          <CartesianGrid strokeDasharray="3 3" stroke="#E8EAE7" vertical={false} />
          <XAxis
            dataKey="label"
            tick={{ fontSize: 11, fill: "#7A8880" }}
            tickLine={false}
            axisLine={false}
            interval="preserveStartEnd"
          />
          <YAxis
            tickFormatter={fmtTokenAxis}
            tick={{ fontSize: 11, fill: "#7A8880" }}
            tickLine={false}
            axisLine={false}
            width={42}
          />
          <Tooltip
            formatter={(v) => [fmtTokenTooltip(Number(v)), "Tokens"]}
            contentStyle={{
              fontSize: 12,
              borderRadius: 8,
              border: "1px solid #D8DDD9",
              boxShadow: "0 4px 12px rgba(27,45,36,.08)",
            }}
          />
          <Area
            type="monotone"
            dataKey="tokens"
            stroke="#2F5D45"
            strokeWidth={2}
            fill="url(#tokenGrad)"
            dot={false}
            activeDot={{ r: 4, fill: "#2F5D45" }}
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}
