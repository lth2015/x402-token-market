"use client";

/**
 * LiveMetricsBar — client component that fetches the live Token balance
 * from /api/payment/balance and shows it alongside two static metrics.
 *
 * Shows a skeleton during the initial fetch so the hero layout doesn't shift.
 * Listens to "haba:balance-refresh" so balance stays in sync after any
 * payment in the same session.
 */
import { useEffect, useState } from "react";
import { Coins, Package, Wifi } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

function formatBalance(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000)     return `${(n / 1_000).toFixed(0)}K`;
  return n.toLocaleString();
}

function MetricChip({
  icon: Icon,
  label,
  value,
  loading,
  accent,
}: {
  icon: LucideIcon;
  label: string;
  value: string;
  loading?: boolean;
  accent?: boolean;
}) {
  return (
    <div
      className={cn(
        "flex items-center gap-2 rounded-xl border px-3.5 py-2.5 transition-all",
        accent
          ? "border-brand-primary/25 bg-brand-primary/8"
          : "border-border-subtle bg-surface-base",
      )}
    >
      <Icon
        className={cn("h-3.5 w-3.5 shrink-0", accent ? "text-brand-primary" : "text-ink-tertiary")}
        aria-hidden
      />
      <div>
        <p className="text-[9px] uppercase tracking-wider text-ink-tertiary">{label}</p>
        {loading ? (
          <div className="skeleton mt-0.5 h-3.5 w-16 rounded" />
        ) : (
          <p className={cn("text-[13px] font-semibold tabular-nums", accent ? "text-brand-primary" : "text-brand-ink")}>
            {value}
          </p>
        )}
      </div>
    </div>
  );
}

export function LiveMetricsBar() {
  const [balance, setBalance] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);

  async function fetchBalance() {
    try {
      const res = await fetch("/api/payment/balance", { cache: "no-store" });
      if (!res.ok) return;
      const j = await res.json();
      if (typeof j?.balance === "number") setBalance(j.balance);
    } catch { /* silent — backend might be starting */ }
    finally { setLoading(false); }
  }

  useEffect(() => {
    fetchBalance();
    window.addEventListener("haba:balance-refresh", fetchBalance);
    return () => window.removeEventListener("haba:balance-refresh", fetchBalance);
  }, []);

  return (
    <div className="mt-7 flex flex-wrap gap-2.5 animate-fade-up-delay-3">
      <MetricChip
        icon={Coins}
        label="AI Token 余额"
        value={balance !== null ? formatBalance(balance) : "—"}
        loading={loading}
        accent
      />
      <MetricChip
        icon={Package}
        label="MARVIE SKU"
        value="7 件"
        loading={false}
      />
      <MetricChip
        icon={Wifi}
        label="Solana Devnet"
        value="实时就绪"
        loading={false}
      />
    </div>
  );
}
