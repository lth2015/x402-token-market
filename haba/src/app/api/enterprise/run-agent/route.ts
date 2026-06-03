import { NextRequest, NextResponse } from "next/server";
import { signRequest } from "@/lib/netstars/sign";

export const dynamic = "force-dynamic";

const TOKEN_API = process.env.NETSTARS_TOKEN_API_INTERNAL ?? "http://localhost:8080";
const KEY_ID    = process.env.NETSTARS_AGENT_KEY_ID     ?? "ak_localdev_test";
const KEY_SEC   = process.env.NETSTARS_AGENT_KEY_SECRET ?? "secret_localdev_test";

const SYSTEM_PROMPT =
  "You are a cross-border e-commerce operations agent specializing in Japan and Southeast Asia markets. " +
  "Provide concise, professional advice in English. Limit responses to 300 words.";

const TASKS: Record<string, string> = {
  pricing:
    "Analyze this pricing scenario: a competitor SKU (similar health supplement) is priced at ¥3,800 in Japan, " +
    "our production cost is ¥1,200, and our current selling price is ¥4,200. " +
    "Provide specific pricing adjustment recommendations with reasoning.",
  copy:
    "Generate both English (under 50 words) and Japanese (under 80 characters) product descriptions " +
    "for a new 'Organic Maca Capsules' product. Highlight: energy boost, improved sleep quality, and natural certification.",
  logistics:
    "Compare DHL Express, Japan EMS, and SAL mail for shipping a 1kg package from Shanghai to Tokyo. " +
    "Break down delivery time and cost for each option, then recommend the best choice for different priority scenarios (speed vs cost).",
};

export async function POST(req: NextRequest) {
  let taskId = "pricing";
  try {
    const body = await req.json();
    if (body.task && TASKS[body.task]) taskId = body.task;
  } catch { /* use default */ }

  const prompt = TASKS[taskId]!;
  const path = "/v1/messages";
  const payload = {
    model: "gpt-4.1",
    system: SYSTEM_PROMPT,
    messages: [{ role: "user", content: prompt }],
    max_tokens: 600,
    temperature: 0.7,
  };
  const bodyStr = JSON.stringify(payload);
  const hdrs = signRequest({ method: "POST", path, body: bodyStr, apiKeyId: KEY_ID, apiKeySecret: KEY_SEC });

  try {
    const res = await fetch(`${TOKEN_API}${path}`, {
      method: "POST",
      headers: { ...hdrs, "Content-Type": "application/json" } as HeadersInit,
      body: bodyStr,
      cache: "no-store",
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      return NextResponse.json({ error: "token-api error", detail: err }, { status: res.status });
    }

    const data = await res.json();
    // token-api returns OpenAI-compatible response
    const content: string =
      data?.choices?.[0]?.message?.content ??
      data?.content ??
      "(no content)";

    const usage = data?.usage ?? {};
    const is_stub = (data?.finish_reason === "stub") || content.startsWith("(stub");

    return NextResponse.json({
      content,
      task: taskId,
      model: data?.model ?? "gpt-4.1",
      is_stub,
      usage: {
        input_tokens:   usage.prompt_tokens     ?? 0,
        output_tokens:  usage.completion_tokens ?? 0,
        cost_token:     usage.tokens_consumed   ?? 0,
        balance_after:  usage.balance_after     ?? null,
      },
    });
  } catch (e) {
    return NextResponse.json({ error: "token-api unreachable", detail: String(e) }, { status: 503 });
  }
}
