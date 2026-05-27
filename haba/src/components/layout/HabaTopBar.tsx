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
    <header className="sticky top-0 z-30 border-b border-border-subtle bg-surface-base/85 backdrop-blur">
      <div className="mx-auto flex max-w-6xl items-center justify-between gap-6 px-6 py-3 lg:px-12">
        <Link href="/" className="flex items-baseline gap-3 outline-none focus-visible:ring-2 focus-visible:ring-brand-primary rounded-md">
          <span
            aria-hidden
            className="inline-flex h-8 w-8 items-center justify-center rounded-lg bg-brand-primary text-base font-semibold text-white"
          >
            H
          </span>
          <div className="leading-tight">
            <div className="text-body font-semibold text-brand-ink">{habaMerchant.displayName}</div>
            <div className="text-caption text-ink-tertiary">{t("productLine")}</div>
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
