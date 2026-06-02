/**
 * TopBar — UX-SPEC §3.
 *
 * Logo + org switcher placeholder + ⌘K hint + lang switcher placeholder + avatar.
 * Real auth + multi-org switching: Phase 2. For now this is a thin display.
 */
import Link from "next/link";
import { Search, Globe } from "lucide-react";
import { getMerchantConfigClient } from "@/lib/merchant-config";

export function TopBar() {
  const merchant = getMerchantConfigClient();
  return (
    <header className="sticky top-0 z-30 flex h-14 items-center justify-between border-b border-border-subtle bg-surface-base px-4 lg:px-6">
      {/* Logo */}
      <Link href="/dashboard" className="flex items-center gap-2">
        <div className="flex h-7 w-7 items-center justify-center rounded bg-brand-primary text-[12px] font-bold text-white">
          N★
        </div>
        <div className="flex flex-col leading-none">
          <span className="text-small font-semibold text-ink-primary">Netstars</span>
          <span className="text-[10px] uppercase tracking-[1.2px] text-ink-tertiary">Token Console</span>
        </div>
      </Link>

      <div className="hidden md:flex items-center gap-3">
        {/* Org switcher (stub — Phase 2 will call GET /v1/merchant/profile) */}
        <div className="rounded border border-border-subtle bg-surface-muted px-3 py-1 text-small text-ink-secondary">
          {merchant.displayName} · <span className="text-ink-tertiary">{merchant.envLabel}</span>
        </div>

        {/* ⌘K (stub — wire up Phase 2) */}
        <button
          type="button"
          className="flex items-center gap-2 rounded border border-border-subtle bg-surface-muted px-3 py-1 text-small text-ink-tertiary hover:text-ink-secondary"
          aria-label="Search (Phase 2)"
          disabled
        >
          <Search className="h-3.5 w-3.5" />
          <span>Search</span>
          <kbd className="rounded bg-surface-base px-1 font-mono text-[11px]">⌘K</kbd>
        </button>
      </div>

      <div className="flex items-center gap-2">
        {/* Lang (stub) */}
        <button
          type="button"
          className="flex items-center gap-1 rounded px-2 py-1 text-small text-ink-secondary hover:text-brand-primary"
          aria-label="Language"
        >
          <Globe className="h-3.5 w-3.5" />
          JA · EN
        </button>

        {/* Avatar (stub) */}
        <div
          className="flex h-7 w-7 items-center justify-center rounded-full bg-brand-primary/15 text-[11px] font-semibold text-brand-primary"
          aria-label="Account"
        >
          {merchant.displayAbbr}
        </div>
      </div>
    </header>
  );
}
