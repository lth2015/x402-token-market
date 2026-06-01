/**
 * POST /api/payment/advise — server-side proxy that fires one real
 * AI Advisor call against the upstream LLM provider.
 *
 * Each call: pre-flight balance check, dispatch to provider (or stub), then
 * debit HABA's Netstars Token ledger by exact usage.
 *
 * The HABA consumer UI intentionally does not expose Token balance or per-call
 * cost; those details belong in Netstars Console / merchant operations.
 *
 * Body:
 *   - single turn: { scenarioId, userPrompt, systemHint?, model? }
 *   - multi turn:  { scenarioId, messages: ChatMessage[], systemHint?, model? }
 */
import { NextResponse } from "next/server";
import { chatCompletion, NetstarsError, type ChatMessage } from "@/lib/netstars/client";
import { marvieProducts } from "@/lib/haba";

export const dynamic = "force-dynamic";

const DEFAULT_MODEL = process.env.HABA_ADVISOR_MODEL ?? "gpt-4.1";

const MARVIE_CATALOG_FOR_LLM = marvieProducts
  .map((p) => {
    const sweetness = p.sweetnessRatioToSugar
      ? `sweetness=${p.sweetnessRatioToSugar}x sugar`
      : "sweetness=n/a";
    return [
      `- ${p.sku} | ${p.name} | shortName=${p.shortName}`,
      `  category=${p.category}; priceJPY=${p.priceJpy}; calories=${p.caloriesPerServing.value}${p.caloriesPerServing.unit}/${p.caloriesPerServing.servingLabel}; ${sweetness}`,
      `  ingredients=${p.ingredients.join(", ")}; usage=${p.shortPitch}`,
    ].join("\n");
  })
  .join("\n");

const HABA_SYSTEM_PROMPT = [
  "You are HABA AI Advisor — a polite, data-grounded assistant for HABA's MARVIE Medical Foods line.",
  "Always answer in the user's language (Simplified Chinese unless prompted otherwise).",
  "You may recommend ONLY the catalog SKUs listed below. Never invent product names, ingredients, prices, stock, disease claims, or medical efficacy.",
  "",
  "IMPORTANT — product card rendering:",
  "When recommending a product, you MUST write its full SKU code (e.g., MARVIE-LQ-200) somewhere in that recommendation. The UI parses these SKU codes from your reply and renders an in-line product card with price and an 'add to cart' button. If you mention a product by name but omit its SKU code, the user sees NO card and cannot buy it. Always include the SKU.",
  "",
  "Each recommendation must cite at least 2 catalog facts from: calorie count, sweetness ratio, suitable usage scene, ingredient, or category.",
  "Do not diagnose, treat, or promise blood-sugar outcomes. For medical decisions, suggest consulting a clinician or dietitian.",
  "Keep the answer short — at most 4 short paragraphs or one bullet list. Be conversational, not a sales pitch.",
  "If the request is outside HABA's low-cal sweetener/jam/candy/cooking-aid range, say so politely instead of inventing products.",
  "",
  "Allowed MARVIE catalog:",
  MARVIE_CATALOG_FOR_LLM,
].join("\n");

type RequestBody = {
  scenarioId?: string;
  userPrompt?: string;
  messages?: unknown;
  systemHint?: string;
  model?: string;
};

function normalizeMessages(input: unknown): ChatMessage[] {
  if (!Array.isArray(input)) return [];
  return input
    .slice(-10)
    .map((m): ChatMessage | null => {
      if (!m || typeof m !== "object") return null;
      const role = (m as { role?: unknown }).role;
      const content = (m as { content?: unknown }).content;
      if ((role !== "user" && role !== "assistant") || typeof content !== "string") return null;
      const trimmed = content.trim();
      if (!trimmed) return null;
      return { role, content: trimmed.slice(0, 1200) };
    })
    .filter((m): m is ChatMessage => m !== null);
}

export async function POST(req: Request) {
  let body: RequestBody = {};
  try {
    body = (await req.json()) as RequestBody;
  } catch {
    return NextResponse.json({ ok: false, error: "invalid JSON body" }, { status: 400 });
  }

  const messageHistory = normalizeMessages(body.messages);
  const userPrompt = (body.userPrompt ?? "").trim();
  const messages: ChatMessage[] = messageHistory.length > 0
    ? messageHistory
    : userPrompt
      ? [{ role: "user", content: userPrompt }]
      : [];

  if (messages.length === 0 || messages[messages.length - 1]?.role !== "user") {
    return NextResponse.json({ ok: false, error: "user message required" }, { status: 400 });
  }

  const system = body.systemHint
    ? `${HABA_SYSTEM_PROMPT}\n\nScenario context: ${body.systemHint}`
    : HABA_SYSTEM_PROMPT;

  try {
    const r = await chatCompletion({
      model: body.model ?? DEFAULT_MODEL,
      system,
      messages,
      maxTokens: 512,
    });
    return NextResponse.json({
      ok: true,
      scenarioId: body.scenarioId ?? null,
      content: r.content,
      finish_reason: r.finish_reason,
      provider: r.provider,
      model: r.model,
      tokens_consumed: r.usage.tokens_consumed,
      balance_after: r.usage.balance_after,
    });
  } catch (e) {
    if (e instanceof NetstarsError) {
      // 402 INSUFFICIENT_BALANCE bubbles through with the upstream detail
      let detail: unknown = e.raw;
      try { if (e.raw) detail = JSON.parse(e.raw); } catch { /* keep raw */ }
      return NextResponse.json(
        { ok: false, status: e.status, error: e.message, detail },
        { status: e.status === 402 ? 402 : 502 },
      );
    }
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : "unknown" },
      { status: 500 },
    );
  }
}
