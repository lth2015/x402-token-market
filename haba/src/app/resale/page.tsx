/**
 * /resale — Token AI Resale 商业模式页。
 * HABA 转售其 AI Advisor 给 B2B：链路图 + 3 套餐 + KPI。
 */
import { getTranslations } from "next-intl/server";
import { ArrowLeft } from "lucide-react";
import Link from "next/link";
import { TokenResaleSection } from "@/components/resale/TokenResaleSection";

export const dynamic = "force-dynamic";

export default async function ResalePage() {
  const t = await getTranslations("resale");
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
      <TokenResaleSection />
    </main>
  );
}
