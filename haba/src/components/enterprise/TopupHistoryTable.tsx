import { type AutoTopupRecord } from "@/lib/haba/enterprise";
import { cn } from "@/lib/utils";

function fmtTime(iso: string): string {
  return new Date(iso).toLocaleString("en-US", {
    year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", hour12: false,
  });
}

function fmtToken(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000)     return `${(n / 1_000).toFixed(0)}K`;
  return n.toLocaleString();
}

const STATUS_STYLE: Record<AutoTopupRecord["status"], { label: string; cls: string }> = {
  completed: { label: "Completed", cls: "bg-semantic-success/10 text-semantic-success" },
  pending:   { label: "Pending",   cls: "bg-semantic-warning/10 text-semantic-warning" },
  failed:    { label: "Failed",    cls: "bg-semantic-danger/10  text-semantic-danger"  },
};

export function TopupHistoryTable({ records }: { records: AutoTopupRecord[] }) {
  return (
    <div className="overflow-x-auto rounded-xl border border-border-default bg-surface-elevated shadow-e1">
      <table className="w-full min-w-[720px] text-small" aria-label="Auto topup history">
        <thead>
          <tr className="border-b border-border-default bg-surface-muted text-caption font-medium text-ink-tertiary">
            <th className="px-4 py-3 text-left">Time</th>
            <th className="px-4 py-3 text-left">Trigger Reason</th>
            <th className="px-4 py-3 text-right tabular-nums">Remaining Token</th>
            <th className="px-4 py-3 text-right tabular-nums">Topup Amount</th>
            <th className="px-4 py-3 text-right tabular-nums">Cost</th>
            <th className="px-4 py-3 text-left">Status</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-border-default">
          {records.map((r) => {
            const s = STATUS_STYLE[r.status];
            return (
              <tr key={r.id} className="hover:bg-surface-muted transition-colors">
                <td className="px-4 py-3 font-mono text-[12px] text-ink-secondary whitespace-nowrap">
                  {fmtTime(r.time)}
                </td>
                <td className="px-4 py-3 text-ink-primary max-w-xs">
                  {r.triggerReason}
                </td>
                <td className="px-4 py-3 text-right font-mono tabular-nums text-ink-secondary">
                  {r.remainingTokenBefore !== null ? fmtToken(r.remainingTokenBefore) : "—"}
                </td>
                <td className="px-4 py-3 text-right font-mono tabular-nums text-ink-primary font-medium">
                  100,000,000 Tokens
                </td>
                <td className="px-4 py-3 text-right font-mono tabular-nums text-ink-primary">
                  ${r.usdCost.toFixed(2)} USDC
                </td>
                <td className="px-4 py-3">
                  <span className={cn("inline-flex rounded-full px-2 py-0.5 text-caption font-medium", s.cls)}>
                    {s.label}
                  </span>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
