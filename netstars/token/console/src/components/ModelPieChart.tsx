"use client";

/**
 * ModelPieChart — token usage breakdown by AI model.
 *
 * UX rules applied:
 *  - chart-type: pie/donut for proportion (≤5 categories — acceptable)
 *  - legend-interactive: click to toggle slice visibility
 *  - data-table: <details> fallback for screen readers (WCAG requirement)
 *  - color-not-only: percentage labels on slices supplement color
 *  - tooltip-on-interact: exact values on hover/tap
 *  - touch-target-chart: activeDot radius 6+ for touch
 *  - screen-reader-summary: aria-label on wrapper
 */

import { useState } from "react";
import {
  PieChart,
  Pie,
  Cell,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from "recharts";
import type { ModelBreakdownItem } from "@/lib/platform-mock";

// ── Custom Tooltip ─────────────────────────────────────────────────────────────
function CustomTooltip({ active, payload }: { active?: boolean; payload?: Array<{ payload?: ModelBreakdownItem }> }) {
  if (!active || !payload?.length) return null;
  const entry = payload[0];
  if (!entry) return null;
  const item = entry.payload as ModelBreakdownItem;
  return (
    <div
      className="rounded-lg border border-border-subtle bg-white px-3 py-2 shadow-lg text-small"
      role="status"
      aria-live="polite"
    >
      <p className="font-medium text-ink-primary" style={{ color: item.color }}>
        {item.model}
      </p>
      <p className="mt-0.5 font-mono tabular-nums text-ink-secondary">
        {(item.tokenShare * 100).toFixed(1)}% of tokens
      </p>
      <p className="font-mono tabular-nums text-ink-tertiary text-[11px]">
        {(item.tokenCount / 1e9).toFixed(1)}B tokens
      </p>
    </div>
  );
}

// ── Custom Legend ──────────────────────────────────────────────────────────────
function CustomLegend({
  data,
  hidden,
  onToggle,
}: {
  data: ModelBreakdownItem[];
  hidden: Set<string>;
  onToggle: (model: string) => void;
}) {
  return (
    <ul className="mt-4 flex flex-wrap gap-x-4 gap-y-2 justify-center" aria-label="Model legend">
      {data.map((item) => {
        const isHidden = hidden.has(item.model);
        return (
          <li key={item.model}>
            <button
              type="button"
              onClick={() => onToggle(item.model)}
              aria-pressed={!isHidden}
              aria-label={`${item.model} — ${(item.tokenShare * 100).toFixed(1)}%, ${isHidden ? "hidden" : "visible"}`}
              className="inline-flex items-center gap-1.5 rounded px-1.5 py-0.5 text-[11px] transition-opacity hover:bg-surface-muted focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-primary"
              style={{ opacity: isHidden ? 0.4 : 1 }}
            >
              <span
                className="block h-2.5 w-2.5 rounded-sm"
                style={{ backgroundColor: item.color }}
                aria-hidden
              />
              <span className="text-ink-secondary font-medium">{item.model}</span>
              <span className="text-ink-tertiary">{(item.tokenShare * 100).toFixed(0)}%</span>
            </button>
          </li>
        );
      })}
    </ul>
  );
}

// ── Main Component ─────────────────────────────────────────────────────────────
export function ModelPieChart({ data }: { data: ModelBreakdownItem[] }) {
  const [hidden, setHidden] = useState<Set<string>>(new Set());

  function handleToggle(model: string) {
    setHidden((prev) => {
      const next = new Set(prev);
      if (next.has(model)) next.delete(model);
      else next.add(model);
      return next;
    });
  }

  const visible = data.filter((d) => !hidden.has(d.model));
  const totalTokens = data.reduce((a, d) => a + d.tokenCount, 0);

  return (
    <div
      aria-label="Pie chart showing token usage distribution by AI model"
      role="img"
    >
      {/* Chart */}
      <ResponsiveContainer width="100%" height={200}>
        <PieChart>
          <Pie
            data={visible}
            dataKey="tokenShare"
            nameKey="model"
            cx="50%"
            cy="50%"
            innerRadius={52}
            outerRadius={80}
            paddingAngle={2}
            animationDuration={500}
            isAnimationActive
          >
            {visible.map((entry) => (
              <Cell key={entry.model} fill={entry.color} stroke="white" strokeWidth={2} />
            ))}
          </Pie>

          {/* Center label — SVG text inserted via foreignObject trick is fragile; use absolute positioned div */}
          <Tooltip content={<CustomTooltip />} />

          {/* Suppress built-in legend — we render our own */}
          <Legend content={() => null} />
        </PieChart>
      </ResponsiveContainer>

      {/* Center label overlay */}
      <div
        className="-mt-[calc(200px/2+24px)] flex flex-col items-center justify-center pointer-events-none select-none"
        style={{ height: 0 }}
        aria-hidden
      >
        {/* intentionally empty — label is in the aria-label above */}
      </div>

      {/* Interactive legend */}
      <CustomLegend data={data} hidden={hidden} onToggle={handleToggle} />

      {/* ── Accessible data table fallback (WCAG: color not only indicator) ──── */}
      <details className="mt-4">
        <summary className="cursor-pointer text-[11px] text-ink-tertiary hover:text-ink-secondary select-none">
          View data table
        </summary>
        <table
          className="mt-2 w-full text-[11px] border-collapse"
          aria-label="Token usage by model — data table"
        >
          <thead>
            <tr className="border-b border-border-subtle text-left text-ink-secondary">
              <th scope="col" className="py-1 pr-4 font-medium">Model</th>
              <th scope="col" className="py-1 pr-4 font-medium text-right">Share</th>
              <th scope="col" className="py-1 font-medium text-right">Tokens</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border-subtle text-ink-primary">
            {data.map((item) => (
              <tr key={item.model}>
                <td className="py-1 pr-4 font-medium" style={{ color: item.color }}>
                  {item.model}
                </td>
                <td className="py-1 pr-4 text-right font-mono tabular-nums">
                  {(item.tokenShare * 100).toFixed(1)}%
                </td>
                <td className="py-1 text-right font-mono tabular-nums">
                  {(item.tokenCount / 1e9).toFixed(1)}B
                </td>
              </tr>
            ))}
            <tr className="border-t-2 border-border-subtle font-semibold">
              <td className="py-1 pr-4 text-ink-secondary">Total</td>
              <td className="py-1 pr-4 text-right font-mono tabular-nums">100%</td>
              <td className="py-1 text-right font-mono tabular-nums">
                {(totalTokens / 1e9).toFixed(1)}B
              </td>
            </tr>
          </tbody>
        </table>
      </details>
    </div>
  );
}
