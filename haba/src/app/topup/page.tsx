/**
 * /topup — HABA AI Token 自动充值演示。
 *
 * 包含一个真发起的充值按钮（DEV 模式）和 8 步流程动画。动画展示
 * "下单 → 钱包签名 → 链上确认 → Token 入账" — 上游支付通道 / 结算
 * 层 / 公链以中性名称呈现，避免暴露第三方厂商身份。
 */
import { getTranslations } from "next-intl/server";
import { ArrowLeft } from "lucide-react";
import Link from "next/link";
import { x402TopupSteps } from "@/lib/haba";
import { SectionTitle } from "@/components/shared/SectionTitle";
import { X402TopupSteps } from "@/components/payment/X402TopupSteps";
import { RealTopupButton } from "@/components/payment/RealTopupButton";

export const dynamic = "force-dynamic";

export default async function TopupPage() {
  const t = await getTranslations("topup");
  return (
    <main className="mx-auto max-w-5xl px-6 py-16 lg:px-12 lg:py-20">
      <Link
        href="/"
        className="mb-4 inline-flex items-center gap-1 text-caption text-ink-tertiary hover:text-brand-primary"
      >
        <ArrowLeft className="h-3 w-3" aria-hidden /> {t("backHome")}
      </Link>

      <SectionTitle eyebrow={t("eyebrow")} title={t("sectionTitle")} description={t("sectionDescription")} />

      {/* Real backend call — fires token-api + x402-api in DEV mode. */}
      <RealTopupButton />

      {/* Visual narration of the 8-step flow (autoplay). */}
      <div className="mt-10">
        <X402TopupSteps
          steps={x402TopupSteps}
          title={t("flowTitle")}
          subtitle={t("flowSubtitle")}
        />
      </div>

      <section className="mt-10 grid grid-cols-1 gap-4 md:grid-cols-3">
        <Note title={t("noteAutopilotTitle")}      body={t("noteAutopilotBody")} />
        <Note title={t("noteNoKeyTitle")}          body={t("noteNoKeyBody")} />
        <Note title={t("noteWebhookTitle")}        body={t("noteWebhookBody")} />
      </section>
    </main>
  );
}

function Note({ title, body }: { title: string; body: string }) {
  return (
    <div className="rounded-xl border border-border-subtle bg-surface-base p-4">
      <p className="text-caption font-semibold uppercase tracking-widest text-brand-primary">
        {title}
      </p>
      <p className="mt-2 text-small text-ink-secondary">{body}</p>
    </div>
  );
}
