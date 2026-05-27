/**
 * Dashboard · single-page overview (UX-SPEC §5.1)
 * - 4 KPI cards (balance is real; other 3 are deterministic mock until usage endpoint lands)
 * - Live Activity Ticker (real ledger reads via /v1/recent-activity)
 */
import { getTranslations } from "next-intl/server";
import { KpiCard } from "@/components/KpiCard";
import { LiveActivityTicker } from "@/components/LiveActivityTicker";
import { PageHeader } from "@/components/PageHeader";
import { api } from "@/lib/api";
import { getUsageMock } from "@/lib/mock";

export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  const t = await getTranslations("dashboard");

  let balance: Awaited<ReturnType<typeof api.balance>> | null = null;
  let activity: Awaited<ReturnType<typeof api.recentActivity>> = { items: [] };
  let backendError: string | null = null;
  try {
    [balance, activity] = await Promise.all([api.balance(), api.recentActivity(20)]);
  } catch (e: unknown) {
    backendError = e instanceof Error ? e.message : "unknown";
  }
  const usage = getUsageMock();

  return (
    <main className="mx-auto max-w-7xl px-6 py-8 lg:px-12">
      <PageHeader
        title={t("title")}
        subtitle="HABA / ハーバー研究所 · Production"
        right={<div className="text-caption text-ink-tertiary">Last 30 days</div>}
      />

      {backendError && (
        <div className="mb-4 rounded-lg border border-semantic-warning/30 bg-semantic-warning/5 px-4 py-3 text-small text-semantic-warning">
          Backend unreachable ({backendError}). Some panels show skeleton data.
        </div>
      )}

      <section className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <KpiCard
          label={t("kpi.balance")}
          value={balance ? formatBalance(balance.balance_token) : "—"}
          unit="Token"
          delta={
            balance
              ? { label: `≈ ${balance.usdc_equivalent} USDC`, tone: "neutral" }
              : undefined
          }
        />
        <KpiCard
          label={t("kpi.spent_30d")}
          value={`¥${(usage.totalSpendJpy / 1000).toFixed(0)}K`}
          delta={{ label: "+12% vs prev. month", tone: "neutral" }}
        />
        <KpiCard
          label={t("kpi.requests_30d")}
          value={new Intl.NumberFormat("en-US").format(usage.totalRequests)}
          delta={{ label: "+8%", tone: "neutral" }}
        />
        <KpiCard
          label={t("kpi.active_keys")}
          value="3"
          unit="/ 4"
          delta={{ label: "1 revoked", tone: "bad" }}
        />
      </section>

      <section className="mt-8">
        <div className="mb-3 flex items-baseline justify-between">
          <h2 className="text-lg font-semibold text-ink-primary">{t("live_activity.title")}</h2>
          <p className="text-caption text-ink-tertiary">{t("live_activity.subtitle")}</p>
        </div>
        <LiveActivityTicker initial={activity.items} isMock={activity.is_mock} />
      </section>

      <footer className="mt-12 border-t border-border-subtle pt-4 text-caption text-ink-tertiary">
        {t("footer.powered_by")} · v0.2.0
      </footer>
    </main>
  );
}

function formatBalance(raw: string): string {
  const n = Number(raw);
  if (!Number.isFinite(n)) return raw;
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(0)}K`;
  return new Intl.NumberFormat("en-US").format(n);
}
