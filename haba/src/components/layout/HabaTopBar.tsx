import { getTranslations } from "next-intl/server";
import Link from "next/link";
import { habaMerchant } from "@/lib/haba";
import { LocaleSwitcher } from "./LocaleSwitcher";

/**
 * Top bar — HABA brand editorial identity.
 * Warm cream base, forest green accents, Bodoni wordmark.
 */
export async function HabaTopBar() {
  const t = await getTranslations("brand");
  return (
    <header className="sticky top-0 z-30 border-b border-border-subtle bg-surface-base/95 backdrop-blur-md">
      <div className="mx-auto flex max-w-5xl items-center justify-between gap-3 px-5 py-4 lg:gap-6 lg:px-8">

        {/* Brand mark */}
        <Link
          href="/"
          className="flex min-w-0 items-center gap-3.5 rounded outline-none focus-visible:ring-2 focus-visible:ring-brand-primary"
        >
          {/* Logo: serif wordmark block */}
          <span
            aria-hidden
            className={[
              "inline-flex h-10 w-10 items-center justify-center rounded-xl",
              "bg-brand-primary text-white",
              "font-serif text-[18px] font-medium shadow-e1",
            ].join(" ")}
          >
            H
          </span>
          <div className="min-w-0 leading-tight">
            <div className="truncate font-serif text-[16px] font-medium tracking-tight text-ink-primary">
              {habaMerchant.displayName}
            </div>
            <div className="truncate font-sans text-[10px] uppercase tracking-[0.18em] text-ink-tertiary">
              {t("productLine")}
            </div>
          </div>
        </Link>

        {/* Actions */}
        <div className="flex shrink-0 items-center gap-2.5">
          <LocaleSwitcher />
        </div>
      </div>
    </header>
  );
}
