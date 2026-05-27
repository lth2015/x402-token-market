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
    <header className={cn("mb-6 flex items-end justify-between gap-4", className)}>
      <div>
        {eyebrow && (
          <p className="text-caption uppercase tracking-widest text-ink-tertiary">{eyebrow}</p>
        )}
        <h2 className="mt-1 text-2xl font-semibold text-brand-ink lg:text-3xl">{title}</h2>
        {description && <p className="mt-2 max-w-2xl text-body text-ink-secondary">{description}</p>}
      </div>
      {right && <div className="shrink-0">{right}</div>}
    </header>
  );
}
