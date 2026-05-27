/**
 * Models · static pricing table.
 * UX-SPEC §5.5.
 *
 * Catalog comes from lib/mock.MODELS; real /v1/models endpoint is Phase 2.
 * Pricing is in AI Token units (1 USDC = 1,000,000 Token).
 */
import { ExternalLink } from "lucide-react";
import { PageHeader } from "@/components/PageHeader";
import { DataTable, StatusDot, type Column } from "@/components/DataTable";
import { MODELS, type ModelRow } from "@/lib/mock";

export default function ModelsPage() {
  const allOk = MODELS.every((m) => m.ok);

  const columns: Column<ModelRow>[] = [
    {
      key: "id",
      header: "Model",
      render: (r) => <span className="font-mono text-small">{r.id}</span>,
    },
    {
      key: "provider",
      header: "Provider",
      width: "w-28",
      render: (r) => <span className="text-small text-ink-secondary">{r.provider}</span>,
    },
    {
      key: "in",
      header: "Input / 1K",
      align: "right",
      mono: true,
      render: (r) => new Intl.NumberFormat("en-US").format(r.inputPer1K),
    },
    {
      key: "out",
      header: "Output / 1K",
      align: "right",
      mono: true,
      render: (r) => new Intl.NumberFormat("en-US").format(r.outputPer1K),
    },
    {
      key: "status",
      header: "Status",
      width: "w-24",
      render: (r) => (
        <StatusDot tone={r.ok ? "good" : "warn"} label={r.ok ? "healthy" : "degraded"} />
      ),
    },
    {
      key: "docs",
      header: "Docs",
      width: "w-20",
      render: (r) => (
        <a
          href={r.docsUrl}
          target="_blank"
          rel="noreferrer"
          className="inline-flex items-center gap-1 text-small text-brand-primary hover:underline"
        >
          docs <ExternalLink className="h-3 w-3" />
        </a>
      ),
    },
  ];

  return (
    <main className="mx-auto max-w-7xl px-6 py-8 lg:px-12">
      <PageHeader
        title="Models"
        subtitle="All AI models callable through the Netstars Token API. Pricing in AI Token units (1 USDC = 1,000,000 Token)."
        right={
          <div className="text-caption text-ink-tertiary">
            <StatusDot
              tone={allOk ? "good" : "warn"}
              label={allOk ? "All providers healthy" : "Some providers degraded"}
            />
          </div>
        }
      />

      <DataTable columns={columns} rows={MODELS} caption="Pricing table" />

      <p className="mt-4 text-caption text-ink-tertiary">
        Prices are denominated in Token-per-1K (e.g. 15,000 = 0.015 USDC per 1K tokens).
        The Provider Router will pick the cheapest healthy provider when multiple options exist.
      </p>
    </main>
  );
}
