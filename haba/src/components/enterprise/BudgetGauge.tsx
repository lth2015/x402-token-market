import { cn } from "@/lib/utils";

function fmtValue(n: number, unit: string): string {
  if (unit === "Tokens") {
    if (n >= 1_000_000_000) return `${(n / 1_000_000_000).toFixed(1)}B`;
    if (n >= 1_000_000)     return `${(n / 1_000_000).toFixed(0)}M`;
    return n.toLocaleString();
  }
  if (unit === "USD") return `$${n.toLocaleString("en-US", { minimumFractionDigits: 0 })}`;
  return String(n);
}

interface BudgetGaugeProps {
  label: string;
  used: number;
  limit: number;
  unit: string;
}

export function BudgetGauge({ label, used, limit, unit }: BudgetGaugeProps) {
  const pct = Math.min((used / limit) * 100, 100);
  const color =
    pct >= 80 ? "bg-semantic-danger"
    : pct >= 60 ? "bg-semantic-warning"
    : "bg-semantic-success";
  const textColor =
    pct >= 80 ? "text-semantic-danger"
    : pct >= 60 ? "text-semantic-warning"
    : "text-semantic-success";

  return (
    <div className="rounded-xl border border-border-default bg-surface-elevated p-5 shadow-e1">
      <div className="mb-3 flex items-center justify-between">
        <p className="text-small font-medium text-ink-primary">{label}</p>
        <p className={cn("text-small font-semibold tabular-nums", textColor)}>
          {pct.toFixed(1)}%
        </p>
      </div>

      {/* Progress bar */}
      <div className="relative h-2 overflow-hidden rounded-full bg-surface-muted">
        <div
          className={cn("h-full rounded-full transition-all duration-500", color)}
          style={{ width: `${pct}%` }}
          role="progressbar"
          aria-valuenow={Math.round(pct)}
          aria-valuemin={0}
          aria-valuemax={100}
        />
        {/* 80% threshold marker */}
        <div
          className="absolute top-0 h-full w-px bg-semantic-warning/60"
          style={{ left: "80%" }}
          title="Auto-topup trigger threshold (80%)"
        />
      </div>

      <div className="mt-2 flex items-center justify-between">
        <p className="text-caption tabular-nums text-ink-tertiary">
          {fmtValue(used, unit)} used
        </p>
        <p className="text-caption tabular-nums text-ink-tertiary">
          {fmtValue(limit, unit)} limit
        </p>
      </div>
    </div>
  );
}
