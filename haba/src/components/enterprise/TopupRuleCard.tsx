import { Link2, Zap } from "lucide-react";

export function TopupRuleCard() {
  return (
    <div className="rounded-xl border border-brand-border bg-brand-subtle p-6">
      <div className="flex items-start gap-3">
        <span className="mt-0.5 inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-brand-primary text-white shadow-e1">
          <Zap className="h-4 w-4" aria-hidden />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-small font-semibold text-ink-primary">Auto Topup Rule</p>
          <p className="mt-0.5 text-caption text-ink-secondary">
            Trigger: budget usage ≥ 80% or balance below 20M Tokens
          </p>
        </div>
      </div>

      <div className="mt-5 grid grid-cols-1 gap-4 sm:grid-cols-3">
        <div className="rounded-lg border border-border-default bg-surface-elevated px-4 py-3">
          <p className="text-caption text-ink-tertiary">Amount per Topup</p>
          <p className="mt-1 font-sans text-lg font-bold tabular-nums text-ink-primary">100,000,000</p>
          <p className="text-caption text-ink-tertiary">Tokens / topup (fixed)</p>
        </div>
        <div className="rounded-lg border border-border-default bg-surface-elevated px-4 py-3">
          <p className="text-caption text-ink-tertiary">Payment Method</p>
          <div className="mt-1 flex items-center gap-1.5">
            <Link2 className="h-4 w-4 text-brand-primary" aria-hidden />
            <span className="font-sans text-small font-semibold text-ink-primary">x402 on Solana · USDC</span>
          </div>
          <p className="text-caption text-ink-tertiary">Devnet settlement</p>
        </div>
        <div className="rounded-lg border border-border-default bg-surface-elevated px-4 py-3">
          <p className="text-caption text-ink-tertiary">Unit Price</p>
          <p className="mt-1 font-sans text-xl font-bold tabular-nums text-ink-primary">$100.00</p>
          <p className="text-caption text-ink-tertiary">USDC / 100M Tokens</p>
        </div>
      </div>
    </div>
  );
}
