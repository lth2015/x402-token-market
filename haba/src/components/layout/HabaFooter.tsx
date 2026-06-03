import { getTranslations } from "next-intl/server";

/**
 * Page footer — editorial clean, HABA disclaimer.
 * Matches warm cream design language.
 */
export async function HabaFooter() {
  const t = await getTranslations("footer");
  return (
    <footer className="mt-16 border-t border-border-subtle bg-surface-deep">
      <div className="mx-auto max-w-5xl px-5 py-10 lg:px-8">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between sm:gap-8">
          <p className="max-w-2xl font-sans text-[11px] leading-relaxed text-ink-tertiary/80">
            {t("disclaimer")}
          </p>
          <p className="shrink-0 font-sans text-[11px] tracking-wide text-ink-tertiary/60">
            © HABA Enterprise
          </p>
        </div>
      </div>
    </footer>
  );
}
