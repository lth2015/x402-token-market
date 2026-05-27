/**
 * POST /api/payment/advise — server-side proxy that fires one real
 * AI Advisor call against the upstream LLM provider.
 *
 * Each call: pre-flight balance check, dispatch to provider (or stub),
 * debit HABA's Token ledger by exact usage, return content + balance_after.
 *
 * The HABA consumer scenario buttons hit this route so every click
 * actually moves the Token balance (visible in TopBar's pill within a
 * second, and in Console's Live Activity Ticker on its next refresh).
 *
 * Body: { scenarioId: string, userPrompt: string, systemHint?: string,
 *         model?: string }
 */
import { NextResponse } from "next/server";
import { chatCompletion, NetstarsError, type ChatMessage } from "@/lib/netstars/client";

export const dynamic = "force-dynamic";

const DEFAULT_MODEL = process.env.HABA_ADVISOR_MODEL ?? "claude-haiku-4-5";

const HABA_SYSTEM_PROMPT = [
  "You are HABA AI Advisor — a polite, data-grounded assistant for HABA's MARVIE Medical Foods line.",
  "Always answer in the user's language (Simplified Chinese unless prompted otherwise).",
  "Recommend specific MARVIE SKUs by full name when possible.",
  "Each recommendation must cite at least 2 of: calorie count, sweetness ratio, suitable usage scene, or ingredient.",
  "Keep the answer short — at most 4 short paragraphs or one bullet list.",
  "If the request is outside HABA's low-cal sweetener/jam/candy/cooking-aid range, say so politely instead of inventing products.",
].join(" ");

type RequestBody = {
  scenarioId?: string;
  userPrompt?: string;
  systemHint?: string;
  model?: string;
};

export async function POST(req: Request) {
  let body: RequestBody = {};
  try {
    body = (await req.json()) as RequestBody;
  } catch {
    return NextResponse.json({ ok: false, error: "invalid JSON body" }, { status: 400 });
  }

  const userPrompt = (body.userPrompt ?? "").trim();
  if (!userPrompt) {
    return NextResponse.json({ ok: false, error: "userPrompt required" }, { status: 400 });
  }

  const messages: ChatMessage[] = [{ role: "user", content: userPrompt }];
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
