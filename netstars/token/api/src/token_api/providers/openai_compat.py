"""
OpenAI-compatible /v1/chat/completions adapter.

Used directly for OpenAI; xAI exposes the identical schema at api.x.ai so
we subclass and only override the base URL.
"""
from __future__ import annotations

import os

import httpx

from .base import NormalizedRequest, NormalizedResponse, Provider, ProviderError, Usage


class OpenAIProvider(Provider):
    vendor = "openai"
    env_key_name = "OPENAI_API_KEY"
    base_url = "https://api.openai.com"

    async def chat(self, req: NormalizedRequest) -> NormalizedResponse:
        if req.model.lower().startswith("gpt-5"):
            return await self._responses(req)
        return await self._chat_completions(req)

    async def _chat_completions(self, req: NormalizedRequest) -> NormalizedResponse:
        key = self.api_key()
        if not key:
            raise ProviderError(f"{self.env_key_name} not configured", vendor=self.vendor)

        # OpenAI-style accepts system as a role on the message list.
        msgs = []
        if req.system:
            msgs.append({"role": "system", "content": req.system})
        msgs.extend({"role": t.role, "content": t.content} for t in req.turns)

        body = {
            "model": req.model,
            "messages": msgs,
            "max_tokens": req.max_tokens,
            "temperature": req.temperature,
        }

        try:
            r = await self._http.post(
                f"{self.base_url}/v1/chat/completions",
                json=body,
                headers={
                    "Authorization": f"Bearer {key}",
                    "content-type": "application/json",
                },
                timeout=60.0,
            )
        except httpx.HTTPError as e:
            raise ProviderError(f"{self.vendor} transport: {e}", vendor=self.vendor, retryable=True) from e

        if r.status_code >= 400:
            raise ProviderError(
                f"{self.vendor} HTTP {r.status_code}: {r.text[:300]}",
                status_code=r.status_code,
                vendor=self.vendor,
                retryable=r.status_code in (429, 500, 502, 503, 504),
            )

        try:
            data = r.json()
        except ValueError as e:
            raise ProviderError(f"{self.vendor} non-JSON response: {e}", vendor=self.vendor) from e

        choices = data.get("choices") or []
        if not choices:
            raise ProviderError(f"{self.vendor} returned no choices", vendor=self.vendor)
        first = choices[0]
        msg = first.get("message") or {}
        content_text = msg.get("content") or ""
        u = data.get("usage") or {}

        return NormalizedResponse(
            content=content_text,
            finish_reason=first.get("finish_reason"),
            usage=Usage(
                prompt_tokens=int(u.get("prompt_tokens") or 0),
                completion_tokens=int(u.get("completion_tokens") or 0),
                cached_input_tokens=int((u.get("prompt_tokens_details") or {}).get("cached_tokens") or 0),
            ),
            provider_response_id=data.get("id"),
            model_returned=data.get("model"),
        )

    async def _responses(self, req: NormalizedRequest) -> NormalizedResponse:
        key = self.api_key()
        if not key:
            raise ProviderError(f"{self.env_key_name} not configured", vendor=self.vendor)

        transcript = "\n\n".join(
            f"{turn.role.upper()}:\n{turn.content}" for turn in req.turns
        )
        body = {
            "model": req.model,
            "input": transcript,
            "max_output_tokens": req.max_tokens,
            "reasoning": {
                "effort": os.environ.get("OPENAI_REASONING_EFFORT", "low"),
            },
            "text": {
                "verbosity": os.environ.get("OPENAI_TEXT_VERBOSITY", "low"),
            },
        }
        if req.system:
            body["instructions"] = req.system

        try:
            r = await self._http.post(
                f"{self.base_url}/v1/responses",
                json=body,
                headers={
                    "Authorization": f"Bearer {key}",
                    "content-type": "application/json",
                },
                timeout=90.0,
            )
        except httpx.HTTPError as e:
            raise ProviderError(f"{self.vendor} transport: {e}", vendor=self.vendor, retryable=True) from e

        if r.status_code >= 400:
            raise ProviderError(
                f"{self.vendor} HTTP {r.status_code}: {r.text[:300]}",
                status_code=r.status_code,
                vendor=self.vendor,
                retryable=r.status_code in (429, 500, 502, 503, 504),
            )

        try:
            data = r.json()
        except ValueError as e:
            raise ProviderError(f"{self.vendor} non-JSON response: {e}", vendor=self.vendor) from e

        content_text = data.get("output_text") or _extract_responses_text(data)
        u = data.get("usage") or {}
        input_details = u.get("input_tokens_details") or {}

        return NormalizedResponse(
            content=content_text,
            finish_reason=data.get("status"),
            usage=Usage(
                prompt_tokens=int(u.get("input_tokens") or 0),
                completion_tokens=int(u.get("output_tokens") or 0),
                cached_input_tokens=int(input_details.get("cached_tokens") or 0),
            ),
            provider_response_id=data.get("id"),
            model_returned=data.get("model"),
        )


class XAIProvider(OpenAIProvider):
    """xAI exposes the same /v1/chat/completions schema as OpenAI."""
    vendor = "xai"
    env_key_name = "XAI_API_KEY"
    base_url = "https://api.x.ai"


def _extract_responses_text(data: dict) -> str:
    chunks: list[str] = []
    for item in data.get("output") or []:
        if not isinstance(item, dict):
            continue
        for content in item.get("content") or []:
            if not isinstance(content, dict):
                continue
            text = content.get("text")
            if isinstance(text, str) and text:
                chunks.append(text)
    return "\n".join(chunks).strip()
