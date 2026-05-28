import { FileCheck2, KeyRound, ReceiptText, ShieldCheck } from "lucide-react";
import { cn } from "@/lib/utils";

type AcceptanceItem = {
  title: string;
  body: string;
  kind: "boundary" | "audit" | "commercial" | "control";
};

const iconByKind = {
  boundary: ShieldCheck,
  audit: ReceiptText,
  commercial: FileCheck2,
  control: KeyRound,
} satisfies Record<AcceptanceItem["kind"], typeof ShieldCheck>;

export function EnterpriseAcceptancePanel({
  title,
  description,
  items,
  className,
}: {
  title: string;
  description: string;
  items: AcceptanceItem[];
  className?: string;
}) {
  return (
    <section
      className={cn(
        "rounded-2xl border border-brand-primary/15 bg-brand-primary/[0.035] p-5 shadow-e1",
        className,
      )}
      aria-label={title}
    >
      <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-caption uppercase tracking-widest text-brand-primary">Enterprise acceptance</p>
          <h3 className="mt-1 text-lg font-semibold text-brand-ink">{title}</h3>
        </div>
        <p className="max-w-xl text-small leading-6 text-ink-secondary">{description}</p>
      </div>

      <div className="mt-5 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        {items.map((item) => {
          const Icon = iconByKind[item.kind];
          return (
            <article
              key={item.title}
              className="rounded-xl border border-border-subtle bg-surface-base p-4"
            >
              <Icon className="h-4 w-4 text-brand-primary" aria-hidden />
              <h4 className="mt-3 text-small font-semibold text-brand-ink">{item.title}</h4>
              <p className="mt-1 text-caption leading-5 text-ink-secondary">{item.body}</p>
            </article>
          );
        })}
      </div>
    </section>
  );
}
