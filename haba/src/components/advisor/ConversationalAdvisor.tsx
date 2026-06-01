"use client";

import { useEffect, useRef, useState } from "react";
import { Loader2, RotateCcw, SendHorizontal, Sparkles } from "lucide-react";
import { getProductBySku, type MarvieProduct } from "@/lib/haba";
import { cn } from "@/lib/utils";
import { ChatProductCard } from "./ChatProductCard";

type Turn = {
  id: string;
  role: "user" | "assistant";
  content: string;
  products?: MarvieProduct[];
};

const QUICK_PROMPTS = [
  "给糖尿病家人买控糖甜味料",
  "烘焙替砂糖,不要怪味",
  "早餐配低卡果酱",
  "减脂期想要无负担零食",
  "给老人控糖,配方要简单",
];

const SKU_RE = /MARVIE-[A-Z]{2}-[A-Z0-9]{3,4}/g;

function detectProducts(text: string): MarvieProduct[] {
  const seen = new Set<string>();
  const out: MarvieProduct[] = [];
  for (const m of text.matchAll(SKU_RE)) {
    const sku = m[0];
    if (seen.has(sku)) continue;
    seen.add(sku);
    const p = getProductBySku(sku);
    if (p) out.push(p);
  }
  return out;
}

export function ConversationalAdvisor() {
  const [turns, setTurns] = useState<Turn[]>([]);
  const [input, setInput] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    el.scrollTo({ top: el.scrollHeight, behavior: "smooth" });
  }, [turns, pending]);

  async function send(text: string) {
    const prompt = text.trim();
    if (!prompt || pending) return;

    const userTurn: Turn = {
      id: `u-${Date.now()}`,
      role: "user",
      content: prompt,
    };
    const next = [...turns, userTurn];
    setTurns(next);
    setInput("");
    setError(null);
    setPending(true);

    try {
      const res = await fetch("/api/payment/advise", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          messages: next
            .filter((t) => t.role === "user" || t.role === "assistant")
            .slice(-10)
            .map((t) => ({ role: t.role, content: t.content })),
        }),
      });
      const data = await res.json();
      if (!res.ok || !data.ok || typeof data.content !== "string") {
        throw new Error("upstream");
      }
      const products = detectProducts(data.content);
      setTurns((cur) => [
        ...cur,
        {
          id: `a-${Date.now()}`,
          role: "assistant",
          content: data.content,
          products,
        },
      ]);
    } catch {
      setError(
        "AI 顾问这会儿有点忙,请稍后再试 —— 你也可以先看看下方 MARVIE 全系列商品。",
      );
    } finally {
      setPending(false);
    }
  }

  function reset() {
    setTurns([]);
    setInput("");
    setError(null);
  }

  const isEmpty = turns.length === 0;

  return (
    <section
      id="advisor"
      className="relative mx-auto max-w-5xl scroll-mt-20 px-4 pb-16 pt-12 lg:px-6 lg:pt-20"
    >
      {/* hero header */}
      <div className="text-center">
        <p className="inline-flex items-center gap-2 rounded-full border border-brand-primary/20 bg-brand-primary/6 px-3 py-1 text-small font-bold uppercase tracking-[0.18em] text-brand-primary">
          <Sparkles className="h-4 w-4" aria-hidden />
          HABA AI Advisor
        </p>
        <h1 className="mt-4 text-[40px] font-extrabold leading-[1.05] text-brand-ink lg:text-[56px]">
          想吃甜,告诉 HABA 顾问
        </h1>
        <p className="mt-3 text-body text-ink-secondary">
          控糖、低卡、料理搭配 —— 告诉我场景,我从 MARVIE 系列挑给你。
        </p>
      </div>

      {/* chat surface */}
      <div className="mt-8 overflow-hidden rounded-[28px] border border-border-subtle bg-surface-base shadow-e2">
        <div
          ref={scrollRef}
          className={cn(
            "overflow-y-auto p-5 lg:p-7 [scrollbar-width:thin]",
            isEmpty
              ? "min-h-[160px]"
              : "max-h-[620px] min-h-[420px]",
          )}
        >
          {isEmpty ? (
            <EmptyState />
          ) : (
            <div className="space-y-6">
              {turns.map((t) => (
                <ChatTurn key={t.id} turn={t} />
              ))}
              {pending && <TypingIndicator />}
            </div>
          )}
        </div>

        <div className="border-t border-border-subtle bg-surface-elevated p-4 lg:p-5">
          <form
            onSubmit={(e) => {
              e.preventDefault();
              void send(input);
            }}
            className="flex gap-2"
          >
            <input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="比如:给妈妈买控糖甜味料,料理饮料都能用"
              disabled={pending}
              className="min-h-12 min-w-0 flex-1 rounded-2xl border border-border-default bg-surface-base px-4 text-body text-brand-ink outline-none placeholder:text-ink-tertiary focus:border-brand-primary disabled:opacity-60"
            />
            <button
              type="submit"
              disabled={pending || !input.trim()}
              aria-label="发送"
              className="inline-flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-brand-primary text-white transition-colors hover:bg-brand-primary-hover disabled:cursor-not-allowed disabled:opacity-50"
            >
              {pending ? (
                <Loader2 className="h-5 w-5 animate-spin" aria-hidden />
              ) : (
                <SendHorizontal className="h-5 w-5" aria-hidden />
              )}
            </button>
            {!isEmpty && (
              <button
                type="button"
                onClick={reset}
                disabled={pending}
                aria-label="重置对话"
                title="重新开始"
                className="inline-flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl border border-border-default bg-surface-base text-ink-secondary transition-colors hover:border-brand-primary/40 hover:text-brand-primary disabled:opacity-50"
              >
                <RotateCcw className="h-5 w-5" aria-hidden />
              </button>
            )}
          </form>

          <div className="mt-3 flex flex-wrap gap-2">
            {QUICK_PROMPTS.map((p) => (
              <button
                key={p}
                type="button"
                onClick={() => send(p)}
                disabled={pending}
                className="rounded-full border border-border-default bg-surface-base px-3.5 py-1.5 text-small font-semibold text-ink-secondary transition-colors hover:border-brand-primary/40 hover:text-brand-primary disabled:opacity-50"
              >
                {p}
              </button>
            ))}
          </div>
        </div>
      </div>

      {error && (
        <p className="mt-4 rounded-xl border border-brand-accent/30 bg-brand-accent/5 px-4 py-3 text-small text-ink-secondary">
          {error}
        </p>
      )}
    </section>
  );
}

function EmptyState() {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-2 text-center text-small text-ink-tertiary">
      <p>从下面挑一个起点,或者直接告诉我你想找什么。</p>
      <p className="text-caption">回答里出现的商品会自动整理成可购买的卡片。</p>
    </div>
  );
}

function ChatTurn({ turn }: { turn: Turn }) {
  if (turn.role === "user") {
    return (
      <div className="flex justify-end">
        <div className="max-w-[80%] rounded-2xl rounded-tr-sm bg-brand-primary px-4 py-3 text-body leading-7 text-white shadow-sm">
          <p className="whitespace-pre-wrap">{turn.content}</p>
        </div>
      </div>
    );
  }
  return (
    <div className="flex justify-start">
      <div className="w-full max-w-[92%]">
        <div className="flex items-start gap-3">
          <span
            className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-2xl bg-brand-primary text-white shadow-e1"
            aria-hidden
          >
            <Sparkles className="h-4 w-4" />
          </span>
          <div className="min-w-0 flex-1 rounded-2xl rounded-tl-sm border border-border-subtle bg-surface-elevated px-4 py-3 text-body leading-7 text-ink-primary shadow-sm">
            <p className="whitespace-pre-wrap">{turn.content}</p>
          </div>
        </div>
        {turn.products && turn.products.length > 0 && (
          <ul className="ml-12 mt-3 flex snap-x gap-3 overflow-x-auto pb-2 [scrollbar-width:thin]">
            {turn.products.map((p) => (
              <ChatProductCard key={p.id} product={p} />
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

function TypingIndicator() {
  return (
    <div className="flex justify-start">
      <div className="flex items-start gap-3">
        <span
          className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-2xl bg-brand-primary text-white shadow-e1"
          aria-hidden
        >
          <Sparkles className="h-4 w-4" />
        </span>
        <div className="inline-flex items-center gap-2 rounded-2xl rounded-tl-sm border border-border-subtle bg-surface-elevated px-4 py-3 text-small text-ink-secondary">
          <Loader2 className="h-4 w-4 animate-spin text-brand-primary" aria-hidden />
          正在为你挑商品
        </div>
      </div>
    </div>
  );
}
