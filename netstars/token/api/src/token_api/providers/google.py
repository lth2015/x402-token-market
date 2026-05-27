"""Google Gemini generateContent adapter."""
from __future__ import annotations

import httpx

from .base import NormalizedRequest, NormalizedResponse, Provider, ProviderError, Usage

# Map our role names to Gemini's
_ROLE_MAP = {"user": "user", "assistant": "model", "system": "user"}


class GoogleProvider(Provider):
    vendor = "google"
    env_key_name = "GOOGLE_API_KEY"
    base_url = "https://generativelanguage.googleapis.com"

    async def chat(self, req: NormalizedRequest) -> NormalizedResponse:
        key = self.api_key()
        if not key:
            raise ProviderError("GOOGLE_API_KEY not configured", vendor=self.vendor)

        # Gemini wants `systemInstruction` separately; merge any system turns into one.
        system_text = req.system
        sys_turns = [t.content for t in req.turns if t.role == "system"]
        if not system_text and sys_turns:
            system_text = "\n\n".join(sys_turns)

        contents = []
        for t in req.turns:
            if t.role == "system":
                continue
            contents.append({
                "role": _ROLE_MAP.get(t.role, "user"),
                "parts": [{"text": t.content}],
            })

        body: dict = {
            "contents": contents,
            "generationConfig": {
                "maxOutputTokens": req.max_tokens,
                "temperature": req.temperature,
            },
        }
        if system_text:
            body["systemInstruction"] = {"parts": [{"text": system_text}]}

        url = f"{self.base_url}/v1beta/models/{req.model}:generateContent"
        try:
            r = await self._http.post(
                url,
                json=body,
                headers={"x-goog-api-key": key, "content-type": "application/json"},
                timeout=60.0,
            )
        except httpx.HTTPError as e:
            raise ProviderError(f"Gemini transport: {e}", vendor=self.vendor, retryable=True) from e

        if r.status_code >= 400:
            raise ProviderError(
                f"Gemini HTTP {r.status_code}: {r.text[:300]}",
                status_code=r.status_code,
                vendor=self.vendor,
                retryable=r.status_code in (429, 500, 502, 503, 504),
            )

        try:
            data = r.json()
        except ValueError as e:
            raise ProviderError(f"Gemini non-JSON response: {e}", vendor=self.vendor) from e

        candidates = data.get("candidates") or []
        if not candidates:
            raise ProviderError("Gemini returned no candidates", vendor=self.vendor)
        cand = candidates[0]
        parts = (cand.get("content") or {}).get("parts") or []
        content_text = "".join(p.get("text", "") for p in parts if isinstance(p, dict))

        usage_meta = data.get("usageMetadata") or {}
        return NormalizedResponse(
            content=content_text,
            finish_reason=cand.get("finishReason"),
            usage=Usage(
                prompt_tokens=int(usage_meta.get("promptTokenCount") or 0),
                completion_tokens=int(usage_meta.get("candidatesTokenCount") or 0),
                cached_input_tokens=int(usage_meta.get("cachedContentTokenCount") or 0),
            ),
            provider_response_id=data.get("responseId"),
            model_returned=req.model,
        )
