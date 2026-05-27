import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

/**
 * Class-name helper: clsx for conditionals, twMerge to dedupe tailwind classes.
 * Same shape as Netstars Console's cn() but lives independently — see
 * docs/haba-technical-plan §5.1 (HABA does not import Console code).
 */
export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}

/** Format a JPY price with the ¥ prefix and thousands separators. */
export function formatJpy(value: number): string {
  return `¥${value.toLocaleString("ja-JP")}`;
}

/** Format a Token count with K/M suffix at ≥1,000. */
export function formatTokenCount(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(0)}K`;
  return n.toLocaleString("en-US");
}
