/**
 * /b2b — 4 个 B2B Partner 画像 + 各自调用示例。
 */
import { getTranslations } from "next-intl/server";
import { ArrowLeft, ArrowRight, Bot } from "lucide-react";
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
      <section className="mx-auto mt-4 max-w-6xl px-6 pb-16 lg:px-12">
        <Link
          href="/agent"
          className="group block rounded-2xl border border-dashed border-brand-primary/40 bg-brand-primary/5 p-6 transition-colors hover:bg-brand-primary/10"
        >
          <div className="flex items-center gap-4">
            <span className="inline-flex h-10 w-10 items-center justify-center rounded-full bg-brand-primary text-white">
              <Bot className="h-5 w-5" aria-hidden />
            </span>
            <div className="flex-1">
              <h3 className="text-body font-semibold text-brand-ink">
                看一台终端 Agent 真跑一遍
              </h3>
              <p className="mt-1 text-caption text-ink-secondary">
                同样的 4 个 persona，但这次由机器人自动连续触发，Token 实时扣减 + 余额低时自动充值。
              </p>
            </div>
            <ArrowRight className="h-4 w-4 text-brand-primary transition-transform group-hover:translate-x-0.5" aria-hidden />
          </div>
        </Link>
      </section>
    </main>
  );
}
