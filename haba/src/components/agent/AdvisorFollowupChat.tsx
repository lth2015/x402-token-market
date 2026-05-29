"use client";

import { useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";
import {
  ClipboardList,
  Loader2,
  MessageCircle,
  RotateCcw,
  SendHorizontal,
  ShieldCheck,
  Sparkles,
} from "lucide-react";
import {
  getProductById,
  type HabaAgentScenario,
  type MarvieProduct,
} from "@/lib/haba";
import { formatJpy, cn } from "@/lib/utils";

type ChatRole = "user" | "assistant";

type ChatTurn = {
  id: string;
  role: ChatRole;
  content: string;
  metered?: boolean;
};

function seedTurn(scenario: HabaAgentScenario): ChatTurn {
  return {
    id: `${scenario.id}-seed`,
    role: "assistant",
    content: `我会先围绕「${scenario.title}」来判断：适合的使用场景、卡路里负担、换算是否容易，以及是否有适合全家使用的搭配。你可以继续追问，我会只基于 MARVIE 目录回答。`,
  };
}

export function AdvisorFollowupChat({ scenario }: { scenario: HabaAgentScenario }) {
  const [turns, setTurns] = useState<ChatTurn[]>(() => [seedTurn(scenario)]);
  const [input, setInput] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const quickPrompts = useMemo(
    () => [
      "按早餐、料理、零食分开推荐",
      "给老人使用时怎么控量？",
      "把推荐整理成购物清单",
    ],
    [],
  );

  const referencedProducts = useMemo(
    () => scenario.recommendations
      .map((r) => getProductById(r.productId))
      .filter((p): p is MarvieProduct => Boolean(p)),
    [scenario],
  );

  useEffect(() => {
    setTurns([seedTurn(scenario)]);
    setInput("");
    setError(null);
  }, [scenario]);

  async function send(text: string) {
    const prompt = text.trim();
    if (!prompt || pending) return;

    const userTurn: ChatTurn = {
      id: `user-${Date.now()}`,
      role: "user",
      content: prompt,
    };
    const nextTurns = [...turns, userTurn];
    setTurns(nextTurns);
    setInput("");
    setError(null);
    setPending(true);

    try {
      const res = await fetch("/api/payment/advise", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          scenarioId: scenario.id,
          systemHint: `${scenario.title}\n${scenario.userPrompt}`,
          messages: nextTurns
            .filter((t) => t.role === "user" || t.role === "assistant")
            .slice(-8)
            .map((t) => ({ role: t.role, content: t.content })),
        }),
      });
      const data = await res.json();
      if (!res.ok || !data.ok) {
        throw new Error(typeof data?.error === "string" ? data.error : `HTTP ${res.status}`);
      }
      setTurns((current) => [
        ...current,
        {
          id: `assistant-${Date.now()}`,
          role: "assistant",
          content: data.content,
          metered: typeof data.tokens_consumed === "number",
        },
      ]);
    } catch {
      setError("AI 顾问暂时无法继续生成。你仍可以先参考左侧已整理好的 MARVIE 推荐，并稍后继续追问。");
    } finally {
      setPending(false);
    }
  }

  return (
    <aside className="flex h-full min-h-[620px] flex-col bg-[linear-gradient(180deg,rgba(11,61,46,0.055),rgba(246,177,68,0.075))] p-5 lg:p-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="inline-flex items-center gap-1.5 text-small font-bold uppercase tracking-[0.18em] text-brand-primary">
            <MessageCircle className="h-4 w-4" aria-hidden />
            Advisor Desk
          </p>
          <h3 className="mt-2 text-[22px] font-extrabold leading-tight text-brand-ink">
            像和营养顾问坐下来聊
          </h3>
        </div>
        <button
          type="button"
          onClick={() => setTurns([seedTurn(scenario)])}
          className="inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-xl border border-border-default bg-surface-base px-3.5 py-2 text-small font-semibold text-ink-secondary hover:border-brand-primary/40 hover:text-brand-primary"
        >
          <RotateCcw className="h-4 w-4" aria-hidden />
          重置
        </button>
      </div>

      <div className="mt-5 grid grid-cols-3 gap-2">
        <Signal icon={<Sparkles className="h-4 w-4" />} label="多轮追问" value="连续上下文" />
        <Signal icon={<ClipboardList className="h-4 w-4" />} label="商品依据" value={`${referencedProducts.length} 款`} />
        <Signal icon={<ShieldCheck className="h-4 w-4" />} label="安全边界" value="不做诊断" />
      </div>

      <div className="mt-4 rounded-2xl border border-border-subtle bg-surface-base p-4">
        <p className="text-caption font-semibold uppercase tracking-widest text-ink-tertiary">当前参考商品</p>
        <div className="mt-3 space-y-2">
          {referencedProducts.slice(0, 3).map((product) => (
            <div key={product.id} className="flex items-center gap-3">
              <span className="text-2xl leading-none" aria-hidden>{product.imageEmoji}</span>
              <div className="min-w-0 flex-1">
                <p className="truncate text-small font-semibold text-brand-ink">{product.shortName}</p>
                <p className="truncate text-caption text-ink-tertiary">{product.shortPitch}</p>
              </div>
              <span className="shrink-0 text-small font-bold text-brand-ink">{formatJpy(product.priceJpy)}</span>
            </div>
          ))}
        </div>
      </div>

      <div className="mt-4 min-h-0 flex-1 overflow-y-auto rounded-2xl border border-border-subtle bg-surface-base p-4 [scrollbar-width:thin]">
        <div className="space-y-3">
          {turns.map((turn) => (
            <div
              key={turn.id}
              className={cn("flex", turn.role === "user" ? "justify-end" : "justify-start")}
            >
              <div
                className={cn(
                  "max-w-[92%] rounded-2xl px-4 py-3 text-[14px] leading-6 shadow-sm",
                  turn.role === "user"
                    ? "rounded-tr-sm bg-brand-primary text-white"
                    : "rounded-tl-sm border border-border-subtle bg-surface-elevated text-ink-primary",
                )}
              >
                <p className="whitespace-pre-wrap">{turn.content}</p>
                {turn.role === "assistant" && turn.metered && (
                  <p className="mt-2 text-[11px] text-ink-tertiary">回答已生成</p>
                )}
              </div>
            </div>
          ))}
          {pending && (
            <div className="flex justify-start">
              <div className="inline-flex items-center gap-2 rounded-2xl rounded-tl-sm border border-border-subtle bg-surface-elevated px-4 py-3 text-small text-ink-secondary">
                <Loader2 className="h-4 w-4 animate-spin text-brand-primary" aria-hidden />
                正在整理商品依据
              </div>
            </div>
          )}
        </div>
      </div>

      {error && (
        <p className="mt-3 rounded-xl border border-brand-accent/30 bg-brand-accent/5 px-3 py-2 text-small text-ink-secondary">
          {error}
        </p>
      )}

      <div className="mt-4 flex flex-wrap gap-2">
        {quickPrompts.map((prompt) => (
          <button
            key={prompt}
            type="button"
            onClick={() => send(prompt)}
            disabled={pending}
            className="rounded-full border border-border-default bg-surface-base px-3.5 py-2 text-small font-semibold text-ink-secondary transition-colors hover:border-brand-primary/40 hover:text-brand-primary disabled:opacity-50"
          >
            {prompt}
          </button>
        ))}
      </div>

      <form
        className="mt-3 flex gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          void send(input);
        }}
      >
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="继续问：适合谁、怎么吃、要买哪几款"
          className="min-h-12 min-w-0 flex-1 rounded-xl border border-border-default bg-surface-base px-4 text-[15px] text-brand-ink outline-none placeholder:text-ink-tertiary focus:border-brand-primary"
          disabled={pending}
        />
        <button
          type="submit"
          aria-label="发送"
          disabled={pending || !input.trim()}
          className="inline-flex min-h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-brand-primary text-white transition-colors hover:bg-brand-primary-hover disabled:cursor-not-allowed disabled:opacity-50"
        >
          <SendHorizontal className="h-5 w-5" aria-hidden />
        </button>
      </form>
    </aside>
  );
}

function Signal({
  icon,
  label,
  value,
}: {
  icon: ReactNode;
  label: string;
  value: string;
}) {
  return (
    <div className="rounded-2xl border border-brand-primary/10 bg-surface-base/80 p-3">
      <div className="text-brand-primary">{icon}</div>
      <p className="mt-2 text-[11px] font-semibold text-ink-tertiary">{label}</p>
      <p className="mt-0.5 whitespace-nowrap text-[12px] font-bold text-brand-ink">{value}</p>
    </div>
  );
}
