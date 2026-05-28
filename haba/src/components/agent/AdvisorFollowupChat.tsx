"use client";

import { useEffect, useMemo, useState } from "react";
import { Loader2, RotateCcw, SendHorizontal } from "lucide-react";
import type { HabaAgentScenario } from "@/lib/haba";
import { cn } from "@/lib/utils";

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
    content: "可以继续追问我：哪款适合早餐、烘焙怎么替糖、老人怎么控量，或者直接问某个商品的使用方法。",
  };
}

export function AdvisorFollowupChat({ scenario }: { scenario: HabaAgentScenario }) {
  const [turns, setTurns] = useState<ChatTurn[]>(() => [seedTurn(scenario)]);
  const [input, setInput] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const quickPrompts = useMemo(
    () => [
      "哪一款最适合早餐？",
      "如果要做烘焙怎么替代砂糖？",
      "老人控糖应该怎么选？",
    ],
    [],
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
    } catch (e) {
      setError(e instanceof Error ? e.message : "AI Advisor 暂时无法回复");
    } finally {
      setPending(false);
    }
  }

  return (
    <section className="mt-7 rounded-2xl border border-brand-primary/15 bg-brand-primary/[0.035] p-5">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-small font-bold uppercase tracking-widest text-brand-primary">Live chat</p>
          <h3 className="mt-1 text-[18px] font-bold text-brand-ink">继续和 HABA AI Advisor 对话</h3>
        </div>
        <button
          type="button"
          onClick={() => setTurns([seedTurn(scenario)])}
          className="inline-flex w-fit items-center gap-1.5 whitespace-nowrap rounded-xl border border-border-default bg-surface-base px-3.5 py-2 text-small font-semibold text-ink-secondary hover:border-brand-primary/40 hover:text-brand-primary"
        >
          <RotateCcw className="h-4 w-4" aria-hidden />
          重置对话
        </button>
      </div>

      <div className="mt-4 max-h-[360px] space-y-3 overflow-y-auto pr-1">
        {turns.map((turn) => (
          <div
            key={turn.id}
            className={cn(
              "flex",
              turn.role === "user" ? "justify-end" : "justify-start",
            )}
          >
            <div
              className={cn(
                "max-w-[88%] rounded-2xl px-4 py-3 text-[14px] leading-6",
                turn.role === "user"
                  ? "rounded-tr-sm bg-brand-primary text-white"
                  : "rounded-tl-sm border border-border-subtle bg-surface-base text-ink-primary",
              )}
            >
              <p className="whitespace-pre-wrap">{turn.content}</p>
              {turn.role === "assistant" && turn.metered && (
                <p className="mt-2 text-[11px] text-ink-tertiary">
                  AI Advisor 回答已生成
                </p>
              )}
            </div>
          </div>
        ))}
        {pending && (
          <div className="flex justify-start">
            <div className="inline-flex items-center gap-2 rounded-2xl rounded-tl-sm border border-border-subtle bg-surface-base px-4 py-3 text-small text-ink-secondary">
              <Loader2 className="h-4 w-4 animate-spin text-brand-primary" aria-hidden />
              正在生成回答
            </div>
          </div>
        )}
      </div>

      {error && (
        <p className="mt-3 rounded-xl border border-semantic-danger/30 bg-semantic-danger/5 px-3 py-2 text-small text-semantic-danger">
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
            className="whitespace-nowrap rounded-full border border-border-default bg-surface-base px-3 py-1.5 text-small font-medium text-ink-secondary hover:border-brand-primary/40 hover:text-brand-primary disabled:opacity-50"
          >
            {prompt}
          </button>
        ))}
      </div>

      <form
        className="mt-3 flex flex-col gap-2 sm:flex-row"
        onSubmit={(e) => {
          e.preventDefault();
          void send(input);
        }}
      >
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="继续提问，比如：这几款哪款更适合老人？"
          className="min-h-12 min-w-0 flex-1 rounded-xl border border-border-default bg-surface-base px-4 text-[15px] text-brand-ink outline-none placeholder:text-ink-tertiary focus:border-brand-primary"
          disabled={pending}
        />
        <button
          type="submit"
          disabled={pending || !input.trim()}
          className="inline-flex min-h-12 items-center justify-center gap-2 whitespace-nowrap rounded-xl bg-brand-primary px-5 text-[15px] font-bold text-white hover:bg-brand-primary-hover disabled:cursor-not-allowed disabled:opacity-50"
        >
          发送
          <SendHorizontal className="h-4 w-4" aria-hidden />
        </button>
      </form>
    </section>
  );
}
