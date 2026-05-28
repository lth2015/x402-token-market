import { getTranslations } from "next-intl/server";

/**
 * Page footer — HABA disclaimer + copyright. Clean consumer footer.
 */
export async function HabaFooter() {
  const t = await getTranslations("footer");
  return (
    <footer className="mt-24 border-t border-border-subtle bg-surface-base">
      <div className="mx-auto max-w-6xl px-6 py-10 lg:px-12">
        <div className="flex flex-col gap-1.5 sm:flex-row sm:items-start sm:justify-between sm:gap-6">
          <p className="max-w-2xl text-[11px] leading-relaxed text-ink-tertiary">
            {t("disclaimer")}
          </p>
          <p className="shrink-0 text-[11px] text-ink-tertiary">
            © HABA / ハーバー研究所
          </p>
        </div>
      </div>
    </footer>
  );
}
