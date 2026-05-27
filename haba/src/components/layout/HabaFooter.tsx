import { getTranslations } from "next-intl/server";

/**
 * Page footer — HABA disclaimer only. Intentionally does not link to any
 * upstream-provider surface; this is HABA's consumer site.
 */
export async function HabaFooter() {
  const t = await getTranslations("footer");
  return (
    <footer className="mt-24 border-t border-border-subtle bg-surface-base">
      <div className="mx-auto max-w-6xl px-6 py-8 lg:px-12">
        <p className="text-caption text-ink-tertiary">{t("disclaimer")}</p>
        <p className="mt-2 text-caption text-ink-tertiary">© HABA / ハーバー研究所</p>
      </div>
    </footer>
  );
}
