/**
 * Settings · org info + team + webhooks + integrations + security.
 * UX-SPEC §5.7.
 *
 * Phase 1 is mostly read-only. Editing surfaces show a "contact support"
 * note in lieu of an actual form. Tabs are visual only (no client-side
 * routing) for now — query param ?tab=team can swap content.
 */
import Link from "next/link";
import { PageHeader, PhaseTwoBadge } from "@/components/PageHeader";

type Tab = "account" | "team" | "webhooks" | "integrations" | "security";
const TABS: { id: Tab; label: string }[] = [
  { id: "account",      label: "Account" },
  { id: "team",         label: "Team" },
  { id: "webhooks",     label: "Webhooks" },
  { id: "integrations", label: "Integrations" },
  { id: "security",     label: "Security" },
];

export const dynamic = "force-dynamic";

export default async function SettingsPage(props: {
  searchParams?: Promise<{ tab?: string }>;
}) {
  const sp = (await props.searchParams) ?? {};
  const active: Tab = (TABS.find((t) => t.id === sp.tab)?.id ?? "account") as Tab;

  return (
    <main className="mx-auto max-w-5xl px-6 py-8 lg:px-12">
      <PageHeader
        title="Settings"
        subtitle="Organization, team, webhooks, integrations, and security"
      />

      <div className="mb-6 flex gap-1 border-b border-border-subtle">
        {TABS.map((t) => (
          <Link
            key={t.id}
            href={`/settings?tab=${t.id}`}
            className={
              "border-b-2 px-3 py-2 text-small transition-colors " +
              (active === t.id
                ? "border-brand-primary text-brand-primary font-medium"
                : "border-transparent text-ink-secondary hover:text-ink-primary")
            }
          >
            {t.label}
          </Link>
        ))}
      </div>

      {active === "account" && <AccountPanel />}
      {active === "team" && <TeamPanel />}
      {active === "webhooks" && <WebhooksPanel />}
      {active === "integrations" && <IntegrationsPanel />}
      {active === "security" && <SecurityPanel />}

      <div className="mt-8 rounded-lg border border-border-subtle bg-surface-muted px-4 py-3 text-small text-ink-secondary">
        Need to change something here? Most editing is Phase 2. For now, contact{" "}
        <a className="text-brand-primary hover:underline" href="mailto:support@netstars.jp">
          support@netstars.jp
        </a>
        .
      </div>
    </main>
  );
}

function Card({ title, children, right }: { title: string; children: React.ReactNode; right?: React.ReactNode }) {
  return (
    <section className="rounded-lg border border-border-subtle bg-surface-base p-6 shadow-e1">
      <div className="mb-4 flex items-start justify-between">
        <h2 className="text-base font-semibold text-ink-primary">{title}</h2>
        {right}
      </div>
      {children}
    </section>
  );
}

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="grid grid-cols-1 gap-1 border-b border-border-subtle py-3 last:border-b-0 sm:grid-cols-[200px_1fr] sm:gap-4">
      <dt className="text-small text-ink-secondary">{label}</dt>
      <dd className="text-small text-ink-primary">{value}</dd>
    </div>
  );
}

// ── Panels ────────────────────────────────────────────────────────
function AccountPanel() {
  return (
    <Card title="Organization">
      <dl>
        <Row label="Organization name" value="HABA / ハーバー研究所" />
        <Row label="Legal name (社名)" value="株式会社ハーバー研究所" />
        <Row label="Tax ID (法人番号)" value={<code className="font-mono">1234567890123</code>} />
        <Row label="Billing email"   value={<a className="text-brand-primary hover:underline" href="mailto:finance@haba-rd.jp">finance@haba-rd.jp</a>} />
        <Row label="Country"         value="Japan" />
        <Row label="Created"         value={<span className="font-mono text-[12px]">2026-02-15</span>} />
        <Row label="Merchant ID"     value={<code className="font-mono text-[12px]">mch_haba_001</code>} />
      </dl>
    </Card>
  );
}

function TeamPanel() {
  const members = [
    { name: "鈴木 涼介",  email: "ops@haba-rd.jp",        role: "Admin" },
    { name: "高橋 美咲",  email: "dev@haba-rd.jp",        role: "Developer" },
    { name: "佐藤 健",    email: "finance@haba-rd.jp",    role: "Finance" },
  ];
  return (
    <Card
      title="Team"
      right={
        <button type="button" disabled className="inline-flex items-center gap-2 rounded border border-border-default bg-surface-muted px-3 py-1.5 text-small text-ink-tertiary">
          + Invite member <PhaseTwoBadge />
        </button>
      }
    >
      <ul className="divide-y divide-border-subtle">
        {members.map((m) => (
          <li key={m.email} className="flex items-center justify-between py-3">
            <div>
              <div className="text-small font-medium text-ink-primary">{m.name}</div>
              <div className="text-caption text-ink-tertiary">{m.email}</div>
            </div>
            <span className="rounded bg-surface-muted px-2 py-0.5 text-[11px] font-medium text-ink-secondary">
              {m.role}
            </span>
          </li>
        ))}
      </ul>
    </Card>
  );
}

function WebhooksPanel() {
  return (
    <Card
      title="Webhook endpoints"
      right={
        <button type="button" disabled className="inline-flex items-center gap-2 rounded border border-border-default bg-surface-muted px-3 py-1.5 text-small text-ink-tertiary">
          + Add endpoint <PhaseTwoBadge />
        </button>
      }
    >
      <p className="text-small text-ink-secondary">
        Per-merchant webhook delivery (event types: <code className="font-mono text-[12px]">payment.confirmed</code>, <code className="font-mono text-[12px]">payment.failed</code>, <code className="font-mono text-[12px]">token.credited</code>) ships in the next tier alongside the delivery + retry worker.
      </p>
      <div className="mt-4 rounded border border-dashed border-border-default bg-surface-muted/50 p-4 text-small text-ink-tertiary">
        No endpoints registered yet.
      </div>
    </Card>
  );
}

function IntegrationsPanel() {
  const items = [
    { name: "Anthropic Claude", note: "BYOK supported via ANTHROPIC_API_KEY",   ok: true  },
    { name: "OpenAI",           note: "BYOK supported via OPENAI_API_KEY",     ok: true  },
    { name: "xAI Grok",         note: "BYOK supported via XAI_API_KEY",        ok: true  },
    { name: "Google Gemini",    note: "BYOK supported via GOOGLE_API_KEY",     ok: false },
    { name: "Slack notifications", note: "Send daily spend summary to Slack",  ok: false },
  ];
  return (
    <Card title="Integrations">
      <ul className="divide-y divide-border-subtle">
        {items.map((i) => (
          <li key={i.name} className="flex items-center justify-between py-3">
            <div>
              <div className="text-small font-medium text-ink-primary">{i.name}</div>
              <div className="text-caption text-ink-tertiary">{i.note}</div>
            </div>
            <span
              className={
                "rounded px-2 py-0.5 text-[11px] font-medium " +
                (i.ok ? "bg-semantic-success/10 text-semantic-success"
                      : "bg-surface-muted text-ink-tertiary")
              }
            >
              {i.ok ? "Connected" : "Not connected"}
            </span>
          </li>
        ))}
      </ul>
    </Card>
  );
}

function SecurityPanel() {
  return (
    <div className="space-y-4">
      <Card title="Authentication">
        <dl>
          <Row label="SSO" value={<span className="text-ink-tertiary">Not configured · <PhaseTwoBadge text="SAML / OIDC Phase 2" /></span>} />
          <Row label="MFA enforcement" value={<span className="text-ink-tertiary">Recommended — per-user MFA in Phase 2</span>} />
          <Row label="Session timeout" value="24 hours" />
        </dl>
      </Card>
      <Card title="API request signing">
        <p className="text-small text-ink-secondary">
          All Netstars SDK requests carry an HMAC-SHA256 signature over
          {" "}<code className="font-mono text-[12px]">METHOD\npath\nts\nnonce\nsha256(body)</code>.
          The server enforces a ±5 minute timestamp window and a 10-minute Redis nonce cache for replay protection.
        </p>
        <div className="mt-3 grid grid-cols-2 gap-2 text-caption">
          <Row label="Clock skew window" value="±300 s" />
          <Row label="Nonce TTL" value="600 s" />
        </div>
      </Card>
      <Card title="Internal-service auth">
        <p className="text-small text-ink-secondary">
          Inter-service calls (token-api ↔ x402-api) use the
          {" "}<code className="font-mono text-[12px]">X-Internal-Auth</code> shared-secret header,
          rotated per environment via AWS Secrets Manager + External Secrets Operator (QA/prod).
        </p>
      </Card>
    </div>
  );
}
