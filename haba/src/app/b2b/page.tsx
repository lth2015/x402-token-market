/**
 * /b2b — 4 个 B2B Partner 画像 + 各自调用示例。
 */
import { getTranslations } from "next-intl/server";
import { ArrowLeft } from "lucide-react";
import Link from "next/link";
import { B2BPartnerSection } from "@/components/b2b/B2BPartnerSection";

export const dynamic = "force-dynamic";

export default async function B2BPage() {
  const t = await getTranslations("b2b");
  return (
    <main>
      <div className="mx-auto max-w-6xl px-6 pt-8 lg:px-12">
        <Link
          href="/"
          className="inline-flex items-center gap-1 text-caption text-ink-tertiary hover:text-brand-primary"
        >
          <ArrowLeft className="h-3 w-3" aria-hidden /> {t("backHome")}
        </Link>
      </div>
      <B2BPartnerSection />
    </main>
  );
}
