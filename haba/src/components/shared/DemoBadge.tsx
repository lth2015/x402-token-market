import { cn } from "@/lib/utils";

/**
 * Inline "演示数据" pill — required by requirements §8 risk control on
 * every numerical mock. Use small / muted so it never competes with the
 * real numbers, just provides plausible deniability.
 */
export function DemoBadge({
  children = "演示数据",
  tone = "muted",
  className,
}: {
  children?: React.ReactNode;
  tone?: "muted" | "warning";
  className?: string;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-medium uppercase tracking-wider",
        tone === "muted" && "bg-surface-muted text-ink-tertiary",
        tone === "warning" && "bg-semantic-warning/10 text-semantic-warning",
        className,
      )}
    >
      {children}
    </span>
  );
}
