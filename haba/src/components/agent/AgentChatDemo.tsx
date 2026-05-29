"use client";

import { useTranslations } from "next-intl";
import type { ReactNode } from "react";
import Link from "next/link";
import {
  ArrowRight,
  Bot,
  ClipboardCheck,
  MessageSquareText,
  ShieldCheck,
  Sparkles,
  UserRound,
} from "lucide-react";
import type { AgentCta, HabaAgentScenario, MarvieProduct } from "@/lib/haba";
import { cn } from "@/lib/utils";
import { RecommendationCard } from "./RecommendationCard";
import { AdvisorFollowupChat } from "./AdvisorFollowupChat";
import { AddAllToCartButton } from "@/components/cart/AddToCartButton";

export function AgentChatDemo({
  scenario,
  onAskMore,
}: {
  scenario: HabaAgentScenario;
  onAskMore?: () => void;
}) {
  const t = useTranslations("agent");
  const isConsumer = scenario.persona === "c_concierge";

  return (
    <div className="overflow-hidden rounded-[30px] border border-border-subtle bg-surface-base shadow-e3">
      <div className="grid min-h-[660px] lg:grid-cols-[minmax(0,1.08fr)_minmax(380px,0.92fr)]">
        <div className="p-6 lg:p-8">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <p className="inline-flex items-center gap-2 text-small font-bold uppercase tracking-[0.18em] text-brand-primary">
                <Bot className="h-4 w-4" aria-hidden />
                HABA AI Advisor
              </p>
              <h3 className="mt-3 text-[30px] font-extrabold leading-tight text-brand-ink">
                先理解需求，再给出可购买的推荐
              </h3>
            </div>
            <span className="w-fit whitespace-nowrap rounded-full border border-brand-primary/20 bg-brand-primary/6 px-3 py-1.5 text-small font-semibold text-brand-primary">
              {isConsumer ? "消费者咨询" : "合作方工作流"}
            </span>
          </div>

          <div className="mt-7 rounded-2xl border border-border-subtle bg-surface-muted p-5">
            <div className="flex items-start gap-3">
              <span className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-surface-base text-ink-tertiary">
                <UserRound className="h-5 w-5" aria-hidden />
              </span>
              <div>
                <p className="text-small font-bold text-ink-tertiary">{t("userLabel")}</p>
                <p className="mt-1.5 whitespace-pre-wrap text-[16px] leading-7 text-brand-ink">
                  {scenario.userPrompt}
                </p>
              </div>
            </div>
          </div>

          <div className="mt-5 flex gap-4">
            <span className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-brand-primary text-white shadow-e1">
              <Sparkles className="h-5 w-5" aria-hidden />
            </span>
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <p className="text-small font-bold text-brand-primary">{t("agentLabel")}</p>
                <span className="rounded-full bg-brand-accent/12 px-2.5 py-1 text-[11px] font-semibold uppercase tracking-wider text-brand-accent">
                  推荐依据
                </span>
              </div>
              <p className="mt-3 text-[16px] leading-7 text-ink-primary">{scenario.agentOpening}</p>
            </div>
          </div>

          <div className="mt-6 grid gap-3 sm:grid-cols-3">
            <ConsultSignal
              icon={<MessageSquareText className="h-4 w-4" />}
              label="需求理解"
              value="场景优先"
            />
            <ConsultSignal
              icon={<ClipboardCheck className="h-4 w-4" />}
              label="推荐依据"
              value="目录内 SKU"
            />
            <ConsultSignal
              icon={<ShieldCheck className="h-4 w-4" />}
              label="风控边界"
              value="不承诺疗效"
            />
          </div>

          <ul className="mt-6 flex snap-x gap-4 overflow-x-auto pb-3 [scrollbar-width:thin]">
            {scenario.recommendations.map((r) => (
              <RecommendationCard key={r.productId} recommendation={r} />
            ))}
          </ul>

          {scenario.warning && (
            <p className="mt-4 rounded-xl border border-semantic-warning/30 bg-semantic-warning/5 px-4 py-3 text-small text-semantic-warning">
              {scenario.warning.text}
            </p>
          )}

          <div className="mt-6 flex flex-wrap gap-2.5">
            {scenario.closingCtas.map((cta) => (
              <CtaButton
                key={cta.label}
                cta={cta}
                productIds={scenario.recommendations.map((r) => r.productId)}
                onAskMore={onAskMore}
              />
            ))}
            {isConsumer && (
              <Link
                href="#products"
                className="inline-flex items-center gap-1.5 whitespace-nowrap rounded-xl border border-border-default bg-surface-base px-5 py-3 text-body font-semibold text-ink-secondary transition-colors hover:border-brand-primary/40 hover:text-brand-primary"
              >
                查看全部商品
                <ArrowRight className="h-4 w-4" aria-hidden />
              </Link>
            )}
          </div>
        </div>

        {isConsumer ? (
          <AdvisorFollowupChat scenario={scenario} />
        ) : (
          <B2BAdvisorPanel scenario={scenario} />
        )}
      </div>
    </div>
  );
}

function CtaButton({
  cta,
  productIds,
  onAskMore,
}: {
  cta: AgentCta;
  productIds: MarvieProduct["id"][];
  onAskMore?: () => void;
}) {
  if (cta.kind === "add_to_cart" || cta.kind === "recommend_to_client") {
    return <AddAllToCartButton productIds={productIds} label={cta.label} />;
  }
  if (cta.kind === "ask_more") {
    return (
      <button
        type="button"
        onClick={onAskMore}
        className="inline-flex items-center gap-1.5 whitespace-nowrap rounded-xl border border-border-default bg-surface-base px-5 py-3 text-body font-semibold text-ink-secondary transition-colors hover:border-brand-primary/40 hover:text-brand-primary"
      >
        {cta.label}
        <ArrowRight className="h-4 w-4" aria-hidden />
      </button>
    );
  }
  return (
    <button
      type="button"
      onClick={onAskMore}
      className={cn(
        "whitespace-nowrap rounded-xl border px-5 py-3 text-body font-semibold transition-colors",
        "border-border-default bg-surface-base text-ink-secondary hover:border-brand-primary/40 hover:text-brand-primary",
      )}
    >
      {cta.label}
    </button>
  );
}

function ConsultSignal({
  icon,
  label,
  value,
}: {
  icon: ReactNode;
  label: string;
  value: string;
}) {
  return (
    <div className="rounded-2xl border border-border-subtle bg-surface-elevated p-4">
      <div className="text-brand-primary">{icon}</div>
      <p className="mt-2 text-caption font-semibold text-ink-tertiary">{label}</p>
      <p className="mt-0.5 text-small font-bold text-brand-ink">{value}</p>
    </div>
  );
}

function B2BAdvisorPanel({ scenario }: { scenario: HabaAgentScenario }) {
  return (
    <aside className="bg-brand-ink p-6 text-white lg:p-8">
      <p className="text-small font-bold uppercase tracking-[0.18em] text-emerald-200">
        Partner Console
      </p>
      <h3 className="mt-3 text-[24px] font-extrabold leading-tight">
        同一个 Advisor，换成合作方工作流
      </h3>
      <div className="mt-6 space-y-3">
        <WorkflowStep n="01" label="接入方式" value={scenario.title} />
        <WorkflowStep n="02" label="调用内容" value="prompt + 商品目录 + 合规边界" />
        <WorkflowStep n="03" label="商户证据" value="调用量、trace、月度对账进入 Console" />
      </div>
      <p className="mt-6 rounded-2xl border border-white/15 bg-white/8 p-4 text-small leading-6 text-emerald-50">
        B2B 页面展示的是同一套 HABA AI Advisor 能力如何嵌入药局、医院、营养师与电商渠道。
        消费者只看到 HABA 顾问体验，运营团队在 Netstars Console 里做计量和对账。
      </p>
    </aside>
  );
}

function WorkflowStep({ n, label, value }: { n: string; label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-white/12 bg-white/8 p-4">
      <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-emerald-200">{n} · {label}</p>
      <p className="mt-2 text-small leading-6 text-white/90">{value}</p>
    </div>
  );
}
