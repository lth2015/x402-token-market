import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatRelative(iso: string, locale: "ja" | "en" = "ja"): string {
  const now = Date.now();
  const t = new Date(iso).getTime();
  const diff = Math.max(0, Math.floor((now - t) / 1000));
  if (diff < 5) return locale === "ja" ? "たった今" : "just now";
  if (diff < 60) return locale === "ja" ? `${diff} 秒前` : `${diff}s ago`;
  if (diff < 3600) return locale === "ja" ? `${Math.floor(diff / 60)} 分前` : `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return locale === "ja" ? `${Math.floor(diff / 3600)} 時間前` : `${Math.floor(diff / 3600)}h ago`;
  return new Intl.DateTimeFormat(locale === "ja" ? "ja-JP" : "en-US", {
    dateStyle: "short", timeStyle: "short",
  }).format(t);
}

export function formatJPY(n: number): string {
  return new Intl.NumberFormat("ja-JP", { style: "currency", currency: "JPY", maximumFractionDigits: 0 }).format(n);
}

export function formatUSDC(n: number): string {
  return `${n.toFixed(2)} USDC`;
}

export function formatTokens(n: number): string {
  // Group with comma + use M / K abbreviation above 100K for readability
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(2)}M`;
  if (n >= 100_000) return `${(n / 1_000).toFixed(0)}K`;
  return new Intl.NumberFormat("en-US").format(n);
}
