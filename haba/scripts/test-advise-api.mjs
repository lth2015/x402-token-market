import assert from "node:assert/strict";

const baseUrl = process.env.HABA_ADVISOR_TEST_BASE_URL ?? "http://127.0.0.1:3002";
const expectedModel = process.env.HABA_ADVISOR_EXPECT_MODEL ?? "gpt-4.1";
const expectedProvider = process.env.HABA_ADVISOR_EXPECT_PROVIDER;

async function postAdvise(body) {
  const res = await fetch(`${baseUrl}/api/payment/advise`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  const text = await res.text();
  let data;
  try {
    data = JSON.parse(text);
  } catch (error) {
    throw new Error(`Expected JSON from ${res.status}: ${text.slice(0, 300)}`, { cause: error });
  }
  assert.equal(res.status, 200, JSON.stringify(data));
  assert.equal(data.ok, true, JSON.stringify(data));
  return data;
}

function assertAdvisorResponse(data, label) {
  assert.equal(data.model, expectedModel, `${label}: expected default model ${expectedModel}`);
  assert.equal(typeof data.content, "string", `${label}: content must be a string`);
  assert.ok(data.content.length > 0, `${label}: content must not be empty`);
  assert.equal(typeof data.tokens_consumed, "number", `${label}: tokens_consumed must be numeric`);
  assert.ok(data.tokens_consumed > 0, `${label}: expected Token debit`);
  assert.ok(
    data.provider === "stub" || data.provider === "openai",
    `${label}: provider must be stub or openai, got ${data.provider}`,
  );
  if (expectedProvider) {
    assert.equal(data.provider, expectedProvider, `${label}: provider mismatch`);
  }
  if (data.provider === "stub") {
    assert.match(data.content, /API key not configured|stub/i, `${label}: stub fallback copy missing`);
  }
}

const singleTurn = await postAdvise({
  scenarioId: "advise-test-default",
  userPrompt: "请推荐一款适合早餐的 MARVIE 商品，并说明依据。",
});
assertAdvisorResponse(singleTurn, "single-turn default model");

const multiTurn = await postAdvise({
  scenarioId: "advise-test-multiturn",
  messages: [
    { role: "user", content: "我想给糖尿病家人买低卡甜味料。" },
    { role: "assistant", content: "可以优先看 MARVIE 低卡甜味料。" },
    { role: "user", content: "请按早餐和料理两个场景整理。" },
  ],
});
assertAdvisorResponse(multiTurn, "multi-turn messages");

console.log(JSON.stringify({
  ok: true,
  baseUrl,
  defaultModel: singleTurn.model,
  providers: [singleTurn.provider, multiTurn.provider],
  debits: [singleTurn.tokens_consumed, multiTurn.tokens_consumed],
}, null, 2));
