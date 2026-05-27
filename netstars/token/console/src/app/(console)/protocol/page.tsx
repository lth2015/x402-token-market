/**
 * Protocol Explorer page (UX-SPEC §5.7b).
 *
 * The "elevator pitch" page: a single play-able sequence diagram of the X402
 * loop, plus a live ticker of the actual recent payments hitting the system.
 * Borrows web4.ai's concrete-tx-list pattern.
 */
import { ProtocolExplorer } from "@/components/ProtocolExplorer";
import { LiveActivityTicker } from "@/components/LiveActivityTicker";
import { PageHeader } from "@/components/PageHeader";
import { api } from "@/lib/api";

export const dynamic = "force-dynamic";

export default async function ProtocolPage() {
  let initialActivity: Awaited<ReturnType<typeof api.recentActivity>> = { items: [] };
  try {
    initialActivity = await api.recentActivity(10);
  } catch {
    /* keep empty; ticker shows empty state */
  }
  // Filter to x402 payments only (matches "Recent real x402 actions" spec)
  const payments = initialActivity.items.filter(
    (it) => it.path === "api/v1/token-purchase" || it.amount_usdc != null,
  );

  return (
    <main className="mx-auto max-w-7xl px-6 py-8 lg:px-12">
      <PageHeader
        title="Protocol Explorer"
        subtitle="X402 in motion — press play to walk the protocol step by step"
      />

      <ProtocolExplorer />

      <section className="mt-8">
        <div className="mb-3 flex items-baseline justify-between">
          <h2 className="text-lg font-semibold text-ink-primary">
            Recent real X402 actions on Netstars
          </h2>
          <span className="text-caption text-ink-tertiary">
            Same ledger that powers Dashboard · auto-refreshes every 5s
          </span>
        </div>
        <LiveActivityTicker initial={payments} isMock={initialActivity.is_mock} />
      </section>

      <section className="mt-8 grid grid-cols-1 gap-4 lg:grid-cols-3">
        <Tip
          title="What X402 is"
          body="An HTTP-native payment protocol — same status-code shape as 401 Unauthorized, but for machine payments. Servers say 'show me USDC', clients sign, the call retries. Coinbase open standard."
        />
        <Tip
          title="Why it matters for Agents"
          body="Agents can't fill out billing forms. They CAN sign a transaction in 200ms. X402 turns 'pay per call' into a primitive that AI agents can negotiate inline, with no human in the loop."
        />
        <Tip
          title="Netstars' role"
          body="The gateway: HMAC-authenticated SDK on one side, Wea custodial settlement on the other. We own the ledger, idempotency, FSM, observability, and the 法人番号-compliant invoice that finance teams need."
        />
      </section>
    </main>
  );
}

function Tip({ title, body }: { title: string; body: string }) {
  return (
    <div className="rounded-lg border border-border-subtle bg-surface-base p-5 shadow-e1">
      <div className="text-small font-semibold text-ink-primary">{title}</div>
      <p className="mt-1.5 text-small text-ink-secondary">{body}</p>
    </div>
  );
}
