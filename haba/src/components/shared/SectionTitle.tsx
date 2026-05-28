import { cn } from "@/lib/utils";

/**
 * Section heading + eyebrow + optional kicker on the right.
 * Used by every top-level section on the demo home page so the visual
 * rhythm stays consistent.
 */
export function SectionTitle({
  eyebrow,
  title,
  description,
  right,
  className,
}: {
  eyebrow?: string;
  title: string;
  description?: string;
  right?: React.ReactNode;
  className?: string;
}) {
  return (
    <header className={cn("mb-8 flex flex-col items-start justify-between gap-5 sm:flex-row sm:items-end", className)}>
      <div className="min-w-0 flex-1">
        {eyebrow && (
          <p className="text-small font-semibold uppercase tracking-widest text-brand-primary">{eyebrow}</p>
        )}
        <h2 className="mt-2 text-[30px] font-bold leading-tight text-brand-ink lg:text-[40px]">{title}</h2>
        {description && <p className="mt-3 max-w-3xl text-[16px] leading-7 text-ink-secondary">{description}</p>}
      </div>
      {right && <div className="shrink-0 whitespace-nowrap">{right}</div>}
    </header>
  );
}
