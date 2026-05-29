from __future__ import annotations

import pytest

from token_api.providers.base import ChatTurn, NormalizedRequest
from token_api.providers.openai_compat import OpenAIProvider
from token_api.providers.router import PROVIDER_AVAILABLE, price_for


class _FakeResponse:
    status_code = 200
    text = ""

    def __init__(self, data: dict):
        self._data = data

    def json(self) -> dict:
        return self._data


class _FakeHTTP:
    def __init__(self, data: dict):
        self.data = data
        self.calls: list[dict] = []

    async def post(self, url: str, *, json: dict, headers: dict, timeout: float):
        self.calls.append({
            "url": url,
            "json": json,
            "headers": headers,
            "timeout": timeout,
        })
        return _FakeResponse(self.data)


def test_gpt55_pricing_and_dummy_key_fallback(monkeypatch):
    monkeypatch.setenv("OPENAI_API_KEY", "sk-DUMMY")

    price = price_for("gpt-5.5")

    assert price.input_per_1k == 5_000
    assert price.output_per_1k == 30_000
    assert PROVIDER_AVAILABLE("gpt-5.5") is False


@pytest.mark.asyncio
async def test_gpt55_uses_responses_api_and_maps_usage(monkeypatch):
    monkeypatch.setenv("OPENAI_API_KEY", "sk-test-real-enough")
    fake_http = _FakeHTTP({
        "id": "resp_test_123",
        "model": "gpt-5.5",
        "status": "completed",
        "output_text": "早餐可选 MARVIE 液体甜味料。",
        "usage": {
            "input_tokens": 101,
            "output_tokens": 29,
            "input_tokens_details": {"cached_tokens": 7},
        },
    })
    provider = OpenAIProvider(fake_http)  # type: ignore[arg-type]

    result = await provider.chat(NormalizedRequest(
        model="gpt-5.5",
        system="Only recommend MARVIE catalog SKUs.",
        turns=[
            ChatTurn(role="user", content="早餐想少糖怎么选？"),
            ChatTurn(role="assistant", content="可以先看液体甜味料。"),
            ChatTurn(role="user", content="请给出 SKU。"),
        ],
        max_tokens=256,
    ))

    call = fake_http.calls[0]
    assert call["url"] == "https://api.openai.com/v1/responses"
    assert call["json"]["model"] == "gpt-5.5"
    assert call["json"]["instructions"] == "Only recommend MARVIE catalog SKUs."
    assert call["json"]["max_output_tokens"] == 256
    assert "USER:\n早餐想少糖怎么选？" in call["json"]["input"]
    assert "ASSISTANT:\n可以先看液体甜味料。" in call["json"]["input"]
    assert result.content == "早餐可选 MARVIE 液体甜味料。"
    assert result.provider_response_id == "resp_test_123"
    assert result.usage.prompt_tokens == 101
    assert result.usage.completion_tokens == 29
    assert result.usage.cached_input_tokens == 7


@pytest.mark.asyncio
async def test_responses_api_extracts_text_from_output_blocks(monkeypatch):
    monkeypatch.setenv("OPENAI_API_KEY", "sk-test-real-enough")
    fake_http = _FakeHTTP({
        "id": "resp_test_456",
        "model": "gpt-5.5",
        "status": "completed",
        "output": [
            {
                "type": "message",
                "content": [
                    {"type": "output_text", "text": "第一段"},
                    {"type": "output_text", "text": "第二段"},
                ],
            },
        ],
        "usage": {"input_tokens": 10, "output_tokens": 4},
    })
    provider = OpenAIProvider(fake_http)  # type: ignore[arg-type]

    result = await provider.chat(NormalizedRequest(
        model="gpt-5.5",
        turns=[ChatTurn(role="user", content="整理购物清单")],
        max_tokens=64,
    ))

    assert result.content == "第一段\n第二段"
    assert result.usage.prompt_tokens == 10
    assert result.usage.completion_tokens == 4
