import { Cpu } from "lucide-react";
import { type AiModelStats } from "@/lib/haba/enterprise";

function fmt(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000)     return `${(n / 1_000).toFixed(0)}K`;
  return n.toLocaleString();
}

export function ModelStatsCard({ stats }: { stats: AiModelStats }) {
  return (
    <div className="rounded-xl border border-border-default bg-surface-elevated p-6 shadow-e1">
      {/* Header */}
      <div className="flex items-center justify-between mb-5">
        <div className="flex items-center gap-2.5">
          <span className="inline-flex h-8 w-8 items-center justify-center rounded-lg bg-brand-subtle">
            <Cpu className="h-4 w-4 text-brand-primary" aria-hidden />
          </span>
          <div>
            <p className="text-small font-semibold text-ink-primary">AI Model</p>
            <p className="text-caption text-ink-tertiary">Month-to-date</p>
          </div>
        </div>
        <span className="inline-flex items-center gap-1.5 rounded-full bg-semantic-success/10 px-2.5 py-1 text-caption font-medium text-semantic-success">
          <span className="h-1.5 w-1.5 rounded-full bg-semantic-success" aria-hidden />
          Active
        </span>
      </div>

      {/* Model name */}
      <p className="mb-4 font-sans text-xl font-semibold tracking-tight text-ink-primary">
        GPT-4.1
      </p>

      {/* Stats grid */}
      <div className="grid grid-cols-3 gap-4 border-t border-border-default pt-4">
        <div>
          <p className="text-caption text-ink-tertiary">Requests</p>
          <p className="mt-0.5 font-sans text-lg font-semibold tabular-nums text-ink-primary">
            {fmt(stats.requestCount)}
          </p>
        </div>
        <div>
          <p className="text-caption text-ink-tertiary">Token Usage</p>
          <p className="mt-0.5 font-sans text-lg font-semibold tabular-nums text-ink-primary">
            {fmt(stats.tokenUsage)}
          </p>
        </div>
        <div>
          <p className="text-caption text-ink-tertiary">Est. Cost</p>
          <p className="mt-0.5 font-sans text-lg font-semibold tabular-nums text-ink-primary">
            ${stats.estimatedCost.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          </p>
        </div>
      </div>
    </div>
  );
}
