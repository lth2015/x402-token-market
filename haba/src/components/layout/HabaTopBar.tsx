import { getTranslations } from "next-intl/server";
import Link from "next/link";
import { habaMerchant } from "@/lib/haba";
import { HabaNav } from "./HabaNav";
import { CartIconLink } from "@/components/cart/CartIconLink";
import { LocaleSwitcher } from "./LocaleSwitcher";

/**
 * Top bar — HABA brand + main nav + cart + locale switcher.
 */
export async function HabaTopBar() {
  const t = await getTranslations("brand");
  return (
    <header className="sticky top-0 z-30 border-b border-border-subtle bg-surface-base/90 backdrop-blur-md">
      <div className="mx-auto flex max-w-6xl items-center justify-between gap-6 px-6 py-4 lg:px-12">
        <Link href="/" className="flex shrink-0 items-center gap-3 rounded-md outline-none focus-visible:ring-2 focus-visible:ring-brand-primary">
          {/* Logo mark: gradient background */}
          <span
            aria-hidden
            className="inline-flex h-11 w-11 items-center justify-center rounded-2xl bg-gradient-to-br from-brand-primary to-emerald-700 text-[18px] font-bold text-white shadow-e1"
          >
            H
          </span>
          <div className="leading-tight">
            <div className="text-[17px] font-bold text-brand-ink">{habaMerchant.displayName}</div>
            <div className="text-[11px] uppercase tracking-wider text-ink-tertiary">{t("productLine")}</div>
          </div>
        </Link>
        <div className="flex min-w-0 items-center gap-3">
          <CartIconLink />
          <LocaleSwitcher />
          <HabaNav />
        </div>
      </div>
    </header>
  );
}
