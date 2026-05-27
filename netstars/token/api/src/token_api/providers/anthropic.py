"""Anthropic /v1/messages adapter."""
from __future__ import annotations

import httpx

from .base import NormalizedRequest, NormalizedResponse, Provider, ProviderError, Usage


class AnthropicProvider(Provider):
    vendor = "anthropic"
    env_key_name = "ANTHROPIC_API_KEY"
    base_url = "https://api.anthropic.com"

    async def chat(self, req: NormalizedRequest) -> NormalizedResponse:
        key = self.api_key()
        if not key:
            raise ProviderError("ANTHROPIC_API_KEY not configured", vendor=self.vendor)

        # Anthropic takes `system` as a top-level field, not a message role.
        system = req.system
        msgs = [t for t in req.turns if t.role != "system"]
        if system is None:
            sys_turns = [t for t in req.turns if t.role == "system"]
            if sys_turns:
                system = "\n\n".join(t.content for t in sys_turns)

        body: dict = {
            "model": req.model,
            "max_tokens": req.max_tokens,
            "temperature": req.temperature,
            "messages": [{"role": t.role, "content": t.content} for t in msgs],
        }
        if system:
            body["system"] = system

        try:
            r = await self._http.post(
                f"{self.base_url}/v1/messages",
                json=body,
                headers={
                    "x-api-key": key,
                    "anthropic-version": "2023-06-01",
                    "content-type": "application/json",
                },
                timeout=60.0,
            )
        except httpx.HTTPError as e:
            raise ProviderError(f"Anthropic transport: {e}", vendor=self.vendor, retryable=True) from e

        if r.status_code >= 400:
            raise ProviderError(
                f"Anthropic HTTP {r.status_code}: {r.text[:300]}",
                status_code=r.status_code,
                vendor=self.vendor,
                retryable=r.status_code in (429, 500, 502, 503, 504),
            )

        try:
            data = r.json()
        except ValueError as e:
            raise ProviderError(f"Anthropic non-JSON response: {e}", vendor=self.vendor) from e

        # Concatenate all text blocks in content[]
        blocks = data.get("content") or []
        text_parts = [b.get("text", "") for b in blocks if isinstance(b, dict) and b.get("type") == "text"]
        content_text = "".join(text_parts)

        u = data.get("usage") or {}
        return NormalizedResponse(
            content=content_text,
            finish_reason=data.get("stop_reason"),
            usage=Usage(
                prompt_tokens=int(u.get("input_tokens") or 0),
                completion_tokens=int(u.get("output_tokens") or 0),
                cached_input_tokens=int(u.get("cache_read_input_tokens") or 0),
            ),
            provider_response_id=data.get("id"),
            model_returned=data.get("model"),
        )
