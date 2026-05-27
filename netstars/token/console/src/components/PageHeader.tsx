/**
 * PageHeader — UX-SPEC §3.
 * Title + optional subtitle + optional right-side actions (tabs/buttons).
 */
import { cn } from "@/lib/utils";

export function PageHeader({
  title,
  subtitle,
  right,
  className,
}: {
  title: string;
  subtitle?: React.ReactNode;
  right?: React.ReactNode;
  className?: string;
}) {
  return (
    <header className={cn("mb-6 flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between", className)}>
      <div>
        <h1 className="text-[28px] font-bold leading-tight text-ink-primary">{title}</h1>
        {subtitle && <p className="mt-1 text-body text-ink-secondary">{subtitle}</p>}
      </div>
      {right && <div className="flex items-center gap-2">{right}</div>}
    </header>
  );
}

export function PhaseTwoBadge({ text = "Phase 2" }: { text?: string }) {
  return (
    <span
      className="rounded bg-surface-muted px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-[1px] text-ink-tertiary"
      title="Planned for a later release"
    >
      {text}
    </span>
  );
}

export function MockBadge() {
  return (
    <span
      className="rounded bg-semantic-warning/10 px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-[1px] text-semantic-warning"
      title="Backend endpoint not yet implemented; values are deterministic mock"
    >
      mock data
    </span>
  );
}
