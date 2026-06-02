import { cn } from "@/lib/utils";

/**
 * Section heading + eyebrow + optional kicker.
 * Editorial Calm: serif display + sans eyebrow/description.
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
          <p className="font-sans text-[11px] font-medium uppercase tracking-[0.18em] text-ink-tertiary">
            {eyebrow}
          </p>
        )}
        <h2 className="mt-2 font-serif text-[28px] font-normal leading-tight text-ink-primary lg:text-[36px]">
          {title}
        </h2>
        {description && (
          <p className="mt-3 max-w-3xl font-sans text-body leading-relaxed text-ink-secondary">
            {description}
          </p>
        )}
      </div>
      {right && <div className="shrink-0 whitespace-nowrap">{right}</div>}
    </header>
  );
}
