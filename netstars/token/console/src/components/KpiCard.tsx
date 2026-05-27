import { cn } from "@/lib/utils";

export function KpiCard({
  label,
  value,
  unit,
  delta,
  hint,
}: {
  label: string;
  value: string;
  unit?: string;
  delta?: { label: string; tone: "good" | "bad" | "neutral" };
  hint?: string;
}) {
  return (
    <div className="rounded-lg border border-border-subtle bg-surface-base p-5 shadow-e1">
      <div className="text-caption uppercase tracking-[1.2px] text-ink-secondary">{label}</div>
      <div className="mt-2 flex items-baseline gap-2">
        <span className="font-mono text-[28px] font-bold tabular-nums text-ink-primary">{value}</span>
        {unit && <span className="text-small text-ink-secondary">{unit}</span>}
      </div>
      {delta && (
        <div
          className={cn(
            "mt-1 text-caption font-medium",
            delta.tone === "good" && "text-semantic-success",
            delta.tone === "bad" && "text-semantic-danger",
            delta.tone === "neutral" && "text-ink-tertiary",
          )}
        >
          {delta.label}
        </div>
      )}
      {hint && <div className="mt-2 text-caption text-ink-tertiary">{hint}</div>}
    </div>
  );
}
