import { getTranslations } from "next-intl/server";
import Link from "next/link";
import { habaMerchant } from "@/lib/haba";
import { HabaNav } from "./HabaNav";
import { TokenBalancePill } from "@/components/payment/TokenBalancePill";
import { CartIconLink } from "@/components/cart/CartIconLink";
import { LocaleSwitcher } from "./LocaleSwitcher";

/**
 * Top bar — HABA brand + main nav (Home / 充值 / Resale / B2B) + live
 * Token-balance pill on the right.
 *
 * The pill talks to /api/payment/balance (server-side proxy) so even
 * before any user action, the top bar proves HABA's payment backend
 * is wired and reachable.
 */
export async function HabaTopBar() {
  const t = await getTranslations("brand");
  return (
    <header className="sticky top-0 z-30 border-b border-border-subtle bg-surface-base/90 backdrop-blur-md">
      <div className="mx-auto flex max-w-6xl items-center justify-between gap-6 px-6 py-3 lg:px-12">
        <Link href="/" className="flex items-center gap-3 rounded-md outline-none focus-visible:ring-2 focus-visible:ring-brand-primary">
          {/* Logo mark: gradient background */}
          <span
            aria-hidden
            className="inline-flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-brand-primary to-emerald-700 text-[15px] font-bold text-white shadow-sm"
          >
            H
          </span>
          <div className="leading-tight">
            <div className="text-[14px] font-bold text-brand-ink">{habaMerchant.displayName}</div>
            <div className="text-[10px] uppercase tracking-wider text-ink-tertiary">{t("productLine")}</div>
          </div>
        </Link>
        <div className="flex items-center gap-3">
          <TokenBalancePill />
          <CartIconLink />
          <LocaleSwitcher />
          <HabaNav />
        </div>
      </div>
    </header>
  );
}
