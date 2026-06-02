/**
 * Merchant display config.
 *
 * Primary path (server-side RSC / SSR): call `getMerchantConfigFromApi()` which
 * fetches GET /v1/merchant/profile from token-api. On API failure it falls back
 * to the env-var values below so the console never shows a hard error for a
 * missing backend.
 *
 * Client components: use `getMerchantConfigClient()` (NEXT_PUBLIC_ env vars,
 * build-time baked). These are used only in purely client-side components where
 * an async server call is not possible.
 */

export interface MerchantConfig {
  /** Display name shown in TopBar org-switcher and Dashboard header. */
  displayName: string;
  /** Short alphanumeric abbreviation used for the avatar chip (≤4 chars). */
  displayAbbr: string;
  /** Environment label shown beside the name (e.g. "prod", "qa"). */
  envLabel: string;
  /** Merchant ID from the API (undefined when using env fallback). */
  merchantId?: string;
  /** Legal name for invoice rendering (undefined when using env fallback). */
  legalName?: string | null;
  /** Tax ID (undefined when using env fallback). */
  taxId?: string | null;
}

// ── Env fallback (used when API is unreachable) ───────────────────────────────

function _envFallback(): MerchantConfig {
  const displayName = process.env.CONSOLE_MERCHANT_NAME ?? "Your Organization";
  const displayAbbr =
    process.env.CONSOLE_MERCHANT_ABBR ?? displayName.slice(0, 4).toUpperCase();
  const envLabel = process.env.CONSOLE_ENV_LABEL ?? "prod";
  return { displayName, displayAbbr, envLabel };
}

// ── Server-side: API-first, env fallback ─────────────────────────────────────

/**
 * Server components / RSC: fetches /v1/merchant/profile from token-api.
 * Falls back to CONSOLE_* env vars if the API is unreachable.
 * Never throws.
 */
export async function getMerchantConfigFromApi(): Promise<MerchantConfig> {
  try {
    // Dynamic import so this is only bundled server-side (api.ts has "server-only")
    const { api } = await import("./api");
    const profile = await api.merchantProfile();
    return {
      displayName: profile.display_name,
      displayAbbr: profile.abbr,
      envLabel: profile.env_label,
      merchantId: profile.merchant_id,
      legalName: profile.legal_name,
      taxId: profile.tax_id,
    };
  } catch {
    // API unreachable (backend down, no key configured, etc.) — use env fallback.
    return _envFallback();
  }
}

/**
 * Synchronous env-based config for server components where async is unavailable.
 * Prefer `getMerchantConfigFromApi()` in async server components.
 */
export function getMerchantConfig(): MerchantConfig {
  return _envFallback();
}

/** Client-side: reads NEXT_PUBLIC_ variants (baked in at build time). */
export function getMerchantConfigClient(): MerchantConfig {
  const displayName = process.env.NEXT_PUBLIC_MERCHANT_NAME ?? "Your Organization";
  const displayAbbr =
    process.env.NEXT_PUBLIC_MERCHANT_ABBR ?? displayName.slice(0, 4).toUpperCase();
  const envLabel = process.env.NEXT_PUBLIC_ENV_LABEL ?? "prod";
  return { displayName, displayAbbr, envLabel };
}
