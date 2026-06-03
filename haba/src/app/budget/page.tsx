"use client";

import { useState } from "react";
import { Zap } from "lucide-react";
import { MOCK_KPI } from "@/lib/haba/enterprise";
import { BudgetGauge } from "@/components/enterprise/BudgetGauge";
import { cn } from "@/lib/utils";

const TOKEN_LIMITS = [
  { label: "1B",  value: 1_000_000_000 },
  { label: "5B",  value: 5_000_000_000 },
  { label: "10B", value: 10_000_000_000 },
  { label: "50B", value: 50_000_000_000 },
];

const BUDGET_LIMITS = [
  { label: "$100",   value: 100 },
  { label: "$500",   value: 500 },
  { label: "$1,000", value: 1000 },
  { label: "$5,000", value: 5000 },
];

export default function BudgetPage() {
  const kpi = MOCK_KPI;
  const [tokenLimit, setTokenLimit] = useState(kpi.tokenLimit);
  const [budgetLimit, setBudgetLimit] = useState(kpi.budgetLimit);

  const budgetUsedPct = ((kpi.currentBudgetUsed / budgetLimit) * 100).toFixed(1);
  const nextTrigger = budgetLimit * 0.8;
  const remainingToTrigger = nextTrigger - kpi.currentBudgetUsed;

  return (
    <main className="mx-auto w-full max-w-7xl px-6 py-8 lg:px-10">
      <div className="mb-6">
        <h1 className="text-lg font-semibold text-ink-primary">Budget Monitoring</h1>
        <p className="text-caption text-ink-tertiary">Monthly limits and current utilization</p>
      </div>

      {/* Limit selectors */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        {/* Token Limit */}
        <div className="rounded-xl border border-border-default bg-surface-elevated p-5 shadow-e1">
          <p className="mb-3 text-small font-semibold text-ink-primary">Monthly Token Limit</p>
          <div className="flex overflow-hidden rounded-lg border border-border-default" role="group" aria-label="Monthly token limit">
            {TOKEN_LIMITS.map((opt) => (
              <button
                key={opt.value}
                type="button"
                onClick={() => setTokenLimit(opt.value)}
                aria-pressed={tokenLimit === opt.value}
                className={cn(
                  "flex-1 py-2 text-small font-medium transition-colors",
                  tokenLimit === opt.value
                    ? "bg-brand-primary text-white"
                    : "bg-surface-elevated text-ink-secondary hover:bg-surface-muted",
                )}
              >
                {opt.label}
              </button>
            ))}
          </div>
          <p className="mt-3 text-caption text-ink-tertiary">
            Current selection: <span className="font-semibold text-ink-primary tabular-nums">
              {(tokenLimit / 1_000_000_000).toFixed(0)}B Tokens / month
            </span>
          </p>
        </div>

        {/* Budget Limit */}
        <div className="rounded-xl border border-border-default bg-surface-elevated p-5 shadow-e1">
          <p className="mb-3 text-small font-semibold text-ink-primary">Monthly Budget Limit</p>
          <div className="flex overflow-hidden rounded-lg border border-border-default" role="group" aria-label="Monthly budget limit">
            {BUDGET_LIMITS.map((opt) => (
              <button
                key={opt.value}
                type="button"
                onClick={() => setBudgetLimit(opt.value)}
                aria-pressed={budgetLimit === opt.value}
                className={cn(
                  "flex-1 py-2 text-small font-medium transition-colors",
                  budgetLimit === opt.value
                    ? "bg-brand-primary text-white"
                    : "bg-surface-elevated text-ink-secondary hover:bg-surface-muted",
                )}
              >
                {opt.label}
              </button>
            ))}
          </div>
          <p className="mt-3 text-caption text-ink-tertiary">
            Current selection: <span className="font-semibold text-ink-primary tabular-nums">
              ${budgetLimit.toLocaleString()} / month
            </span>
          </p>
        </div>
      </div>

      {/* Progress gauges */}
      <div className="mt-6 grid grid-cols-1 gap-6 lg:grid-cols-2">
        <BudgetGauge
          label="Token Usage"
          used={kpi.monthlyTokenUsage}
          limit={tokenLimit}
          unit="Tokens"
        />
        <BudgetGauge
          label="Budget Usage"
          used={kpi.currentBudgetUsed}
          limit={budgetLimit}
          unit="USD"
        />
      </div>

      {/* Auto topup trigger info */}
      <div className="mt-6 rounded-xl border border-semantic-warning/30 bg-semantic-warning/5 px-5 py-4">
        <div className="flex items-start gap-3">
          <Zap className="mt-0.5 h-4 w-4 shrink-0 text-semantic-warning" aria-hidden />
          <div className="text-small text-ink-secondary">
            <span className="font-semibold text-ink-primary">Auto Topup trigger:</span>
            {" "}Budget usage reaches 80% (${nextTrigger.toLocaleString("en-US", { minimumFractionDigits: 0 })}).
            Currently at {budgetUsedPct}% —{" "}
            <span className="font-semibold tabular-nums text-ink-primary">
              ${remainingToTrigger > 0 ? remainingToTrigger.toLocaleString("en-US", { minimumFractionDigits: 0 }) : 0}
            </span>{" "}remaining until trigger.
          </div>
        </div>
      </div>
    </main>
  );
}
