import { cn } from "@/lib/utils";

type Tone = "up" | "down" | "neutral";

interface KpiCardProps {
  label: string;
  value: string;
  unit?: string;
  delta?: { label: string; tone?: Tone };
  className?: string;
}

export function KpiCard({ label, value, unit, delta, className }: KpiCardProps) {
  return (
    <div className={cn(
      "rounded-xl border border-border-default bg-surface-elevated p-5 shadow-e1",
      className,
    )}>
      <p className="text-caption font-medium uppercase tracking-wider text-ink-tertiary">{label}</p>
      <p className="mt-2 font-sans text-2xl font-semibold tabular-nums text-ink-primary leading-none">
        {value}
        {unit && <span className="ml-1 text-sm font-normal text-ink-tertiary">{unit}</span>}
      </p>
      {delta && (
        <p className={cn(
          "mt-1.5 text-caption",
          delta.tone === "up"   && "text-semantic-success",
          delta.tone === "down" && "text-semantic-danger",
          (!delta.tone || delta.tone === "neutral") && "text-ink-tertiary",
        )}>
          {delta.label}
        </p>
      )}
    </div>
  );
}
