/**
 * DataTable — small typed table primitive used by Usage / Tokens / API Keys /
 * Models / Invoices / Audit pages. Server-renderable (no client deps).
 *
 * Doesn't try to be a generic grid: just structured rows, monospaced numeric
 * columns, and consistent zebra striping. Sorting / pagination handled by
 * caller (typically a Server Component reading URL params).
 */
import { cn } from "@/lib/utils";

export type Column<T> = {
  key: string;
  header: React.ReactNode;
  /** alignment for both header and cell */
  align?: "left" | "right";
  /** mono + tabular-nums; use for numeric/id columns */
  mono?: boolean;
  /** cell renderer; receives the row */
  render: (row: T) => React.ReactNode;
  /** explicit width (tailwind class, e.g. "w-32") */
  width?: string;
};

export function DataTable<T>({
  columns,
  rows,
  empty = "No rows.",
  caption,
}: {
  columns: Column<T>[];
  rows: T[];
  empty?: React.ReactNode;
  caption?: React.ReactNode;
}) {
  if (rows.length === 0) {
    return (
      <div className="rounded-lg border border-border-subtle bg-surface-base px-6 py-10 text-center text-small text-ink-tertiary">
        {empty}
      </div>
    );
  }

  return (
    <div className="overflow-x-auto rounded-lg border border-border-subtle bg-surface-base shadow-e1">
      <table className="w-full text-small">
        {caption && <caption className="sr-only">{caption}</caption>}
        <thead>
          <tr className="border-b border-border-subtle bg-surface-muted/50 text-caption uppercase tracking-[0.6px] text-ink-secondary">
            {columns.map((c) => (
              <th
                key={c.key}
                scope="col"
                className={cn(
                  "px-4 py-2.5 font-medium",
                  c.align === "right" ? "text-right" : "text-left",
                  c.width,
                )}
              >
                {c.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-border-subtle">
          {rows.map((row, i) => (
            <tr key={i} className="hover:bg-surface-muted/40">
              {columns.map((c) => (
                <td
                  key={c.key}
                  className={cn(
                    "px-4 py-3 text-ink-primary",
                    c.align === "right" ? "text-right" : "text-left",
                    c.mono && "font-mono tabular-nums",
                  )}
                >
                  {c.render(row)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/**
 * StatusDot — colored dot + label, for status columns.
 */
export function StatusDot({
  tone,
  label,
}: {
  tone: "good" | "warn" | "bad" | "neutral";
  label: React.ReactNode;
}) {
  const cls =
    tone === "good"    ? "bg-semantic-success" :
    tone === "warn"    ? "bg-semantic-warning" :
    tone === "bad"     ? "bg-semantic-danger"  :
                         "bg-ink-tertiary";
  return (
    <span className="inline-flex items-center gap-1.5 text-small">
      <span className={cn("block h-1.5 w-1.5 rounded-full", cls)} aria-hidden />
      {label}
    </span>
  );
}
