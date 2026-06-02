"use client";

import { useEffect, useRef, useState } from "react";
import { RotateCcw, SendHorizontal } from "lucide-react";
import { getProductBySku, type MarvieProduct } from "@/lib/haba";
import { cn } from "@/lib/utils";
import { ChatProductCard } from "./ChatProductCard";

type Turn = {
  id: string;
  role: "user" | "assistant";
  content: string;
  products?: MarvieProduct[];
};

// Quick-start suggestions — shown as refined underline chips
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

// Inline SVG botanical ornament — olive branch, editorial fine-line
// viewBox 120×72: central stem with 4 paired elliptical leaves + terminal berry cluster
function BotanicalMark({ className }: { className?: string }) {
  return (
    <svg
      aria-hidden
      viewBox="0 0 120 72"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={cn("text-brand-primary/40", className)}
    >
      {/* Main arching stem — curves from lower-left to upper-right */}
      <path d="M12 62 C28 52 50 38 72 26 C88 18 104 14 110 12" />

      {/* Leaf pair 1 — near base */}
      <path d="M22 56 C16 46 18 36 28 40 C30 46 28 54 22 56Z" />
      <path d="M32 50 C38 40 46 40 44 50 C40 56 34 54 32 50Z" />

      {/* Leaf pair 2 — mid-low */}
      <path d="M44 44 C36 34 38 24 48 28 C52 34 50 42 44 44Z" />
      <path d="M54 38 C62 28 70 28 68 38 C64 44 56 44 54 38Z" />

      {/* Leaf pair 3 — mid-high */}
      <path d="M66 30 C58 20 60 10 70 14 C74 20 72 28 66 30Z" />
      <path d="M76 24 C84 14 92 14 90 24 C86 30 78 30 76 24Z" />

      {/* Leaf pair 4 — near tip */}
      <path d="M88 18 C82 10 84 2 92 6 C95 11 92 17 88 18Z" />
      <path d="M97 14 C103 6 110 7 108 15 C105 20 99 19 97 14Z" />

      {/* Terminal berry cluster — 3 small circles */}
      <circle cx="111" cy="10" r="2" />
      <circle cx="115" cy="14" r="1.5" />
      <circle cx="108" cy="14" r="1.5" />
    </svg>
  );
}

export function ConversationalAdvisor() {
  const [turns, setTurns] = useState<Turn[]>([]);
  const [input, setInput] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

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

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      void send(input);
    }
  }

  const isEmpty = turns.length === 0;

  return (
    <section
      id="advisor"
      className={cn(
        "relative mx-auto max-w-3xl scroll-mt-20 px-5 pb-16 lg:px-6",
        // When empty: vertically center the hero within the viewport
        isEmpty
          ? "flex min-h-[calc(100dvh-72px)] flex-col justify-center pt-0"
          : "pt-10",
      )}
    >
      {/* ── Editorial hero header ──────────────────────────────────────── */}
      {isEmpty && (
        <div className="mb-12 text-center animate-fade-up">
          {/* Botanical accent above eyebrow */}
          <div className="flex justify-center mb-4">
            <BotanicalMark className="w-20 h-14" />
          </div>

          {/* Eyebrow — spaced small caps */}
          <p className="animate-fade-up-1 font-sans text-[11px] font-medium uppercase tracking-[0.22em] text-ink-tertiary">
            — あなたの甘味顾问 —
          </p>

          {/* Display title — Bodoni for "HABA", CJK flows naturally */}
          <h1 className="animate-fade-up-2 mt-5 font-serif text-display-md font-normal leading-[1.08] tracking-tightest text-ink-primary lg:text-display-lg">
            想吃甜,<br className="sm:hidden" />
            告诉&nbsp;<em className="not-italic font-medium">HABA</em>&nbsp;顾问
          </h1>

          {/* Subtitle — light weight, one line */}
          <p className="animate-fade-up-3 mt-5 font-sans text-body font-light leading-relaxed text-ink-secondary max-w-sm mx-auto">
            控糖 · 低卡 · 料理搭配 —— 告诉我你的场景
          </p>

          {/* Thin rule with breathing space */}
          <div className="animate-fade-up-4 mt-8 flex items-center justify-center gap-5">
            <span className="h-px w-12 bg-border-subtle" />
            <span className="font-serif text-[11px] italic text-ink-tertiary/70">MARVIE 系列</span>
            <span className="h-px w-12 bg-border-subtle" />
          </div>
        </div>
      )}

      {/* ── Chat area (shown once conversation starts) ─────────────────── */}
      {!isEmpty && (
        <div className="mb-6">
          <div
            ref={scrollRef}
            className="max-h-[580px] min-h-[320px] overflow-y-auto [scrollbar-width:thin] space-y-7"
          >
            {turns.map((t, i) => (
              <ChatTurn key={t.id} turn={t} index={i} />
            ))}
            {pending && <TypingIndicator />}
          </div>
        </div>
      )}

      {/* ── Input surface ──────────────────────────────────────────────── */}
      <div className={cn(isEmpty && "animate-fade-up-4")}>
        {/* Input card — textarea + inline send button, one cohesive unit */}
        <div
          className={cn(
            "rounded-2xl border bg-surface-elevated transition-shadow duration-300",
            "border-border-default shadow-e1",
            "focus-within:border-brand-primary/40 focus-within:shadow-e2",
          )}
        >
          <form
            onSubmit={(e) => {
              e.preventDefault();
              void send(input);
            }}
          >
            {/* Textarea row with inline send button */}
            <div className="flex items-end gap-2 px-4 pt-3 pb-3">
              <textarea
                ref={inputRef}
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="比如:给妈妈买控糖甜味料,料理饮料都能用…"
                disabled={pending}
                rows={2}
                aria-label="向 HABA 顾问提问"
                className={cn(
                  "min-w-0 flex-1 resize-none bg-transparent font-sans text-body text-ink-primary",
                  "outline-none placeholder:text-ink-tertiary placeholder:font-light",
                  "leading-relaxed disabled:opacity-60",
                  "[scrollbar-width:thin]",
                )}
              />
              {/* Inline send — embedded inside card, right of textarea */}
              <div className="flex shrink-0 items-center gap-1.5 pb-0.5">
                {!isEmpty && (
                  <button
                    type="button"
                    onClick={reset}
                    disabled={pending}
                    aria-label="重置对话"
                    className={cn(
                      "inline-flex h-8 w-8 items-center justify-center rounded-lg",
                      "text-ink-tertiary",
                      "transition-colors duration-150 hover:text-brand-primary",
                      "disabled:opacity-40",
                    )}
                  >
                    <RotateCcw className="h-3.5 w-3.5" aria-hidden />
                  </button>
                )}
                <button
                  type="submit"
                  disabled={pending || !input.trim()}
                  aria-label="发送"
                  className={cn(
                    "inline-flex h-9 w-9 items-center justify-center rounded-xl",
                    "bg-brand-primary text-white shadow-e1",
                    "transition-all duration-200 hover:bg-brand-primary-hover hover:shadow-e2",
                    "disabled:cursor-not-allowed disabled:opacity-40 disabled:shadow-none",
                  )}
                >
                  <SendHorizontal className="h-4 w-4" aria-hidden />
                </button>
              </div>
            </div>
          </form>
        </div>

        {/* Quick prompt chips — standalone row below input card */}
        <div className="mt-3 flex flex-wrap gap-x-4 gap-y-2 px-1">
          {QUICK_PROMPTS.slice(0, isEmpty ? 5 : 3).map((p) => (
            <button
              key={p}
              type="button"
              onClick={() => send(p)}
              disabled={pending}
              className={cn(
                "whitespace-nowrap font-sans text-[12px] text-ink-tertiary",
                "border-b border-border-subtle pb-px",
                "transition-colors duration-150 hover:border-brand-primary/50 hover:text-ink-secondary",
                "disabled:pointer-events-none disabled:opacity-40",
              )}
            >
              {p}
            </button>
          ))}
        </div>
      </div>

      {/* Error notice */}
      {error && (
        <p className="mt-4 rounded-xl border border-brand-accent/25 bg-brand-accent-subtle px-4 py-3 font-sans text-small text-ink-secondary animate-fade-in">
          {error}
        </p>
      )}
    </section>
  );
}

function ChatTurn({ turn, index }: { turn: Turn; index: number }) {
  const delay = Math.min(index * 0.03, 0.18);
  const style = { animationDelay: `${delay}s` } as React.CSSProperties;

  if (turn.role === "user") {
    return (
      <div className="flex justify-end animate-fade-up" style={style}>
        <div
          className={cn(
            "max-w-[78%] rounded-2xl rounded-tr-md",
            "bg-brand-primary px-5 py-3",
            "font-sans text-body leading-relaxed text-white shadow-e1",
          )}
        >
          <p className="whitespace-pre-wrap">{turn.content}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex justify-start animate-fade-up" style={style}>
      <div className="w-full max-w-[92%]">
        <div className="flex items-start gap-3.5">
          {/* Advisor avatar — refined monogram */}
          <span
            aria-hidden
            className={cn(
              "inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full",
              "border border-brand-primary/30 bg-surface-elevated shadow-e1",
              "font-serif text-[13px] font-medium text-brand-primary",
            )}
          >
            H
          </span>
          {/* Message bubble */}
          <div
            className={cn(
              "min-w-0 flex-1 rounded-2xl rounded-tl-md",
              "border border-border-subtle bg-surface-elevated px-5 py-3.5 shadow-e1",
              "font-sans text-body leading-relaxed text-ink-primary",
            )}
          >
            <p className="whitespace-pre-wrap">{turn.content}</p>
          </div>
        </div>

        {/* Product cards */}
        {turn.products && turn.products.length > 0 && (
          <ul
            aria-label="推荐商品"
            className={cn(
              "ml-11 mt-3 flex snap-x gap-3 overflow-x-auto pb-1",
              "[scrollbar-width:thin]",
            )}
          >
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
      <div className="flex items-start gap-3.5">
        <span
          aria-hidden
          className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-brand-primary/30 bg-surface-elevated font-serif text-[13px] font-medium text-brand-primary shadow-e1"
        >
          H
        </span>
        <div
          aria-label="正在思考"
          className="inline-flex items-center gap-1.5 rounded-2xl rounded-tl-md border border-border-subtle bg-surface-elevated px-5 py-4 shadow-e1"
        >
          <span className="h-1.5 w-1.5 rounded-full bg-brand-primary/50 dot-bounce-1" />
          <span className="h-1.5 w-1.5 rounded-full bg-brand-primary/50 dot-bounce-2" />
          <span className="h-1.5 w-1.5 rounded-full bg-brand-primary/50 dot-bounce-3" />
        </div>
      </div>
    </div>
  );
}
