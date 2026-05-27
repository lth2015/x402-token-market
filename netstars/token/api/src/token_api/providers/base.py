"""
Provider abstract base + normalized request/response dataclasses.

The router normalizes the incoming request into `NormalizedRequest`, picks a
concrete Provider, calls `Provider.chat(...)`, and normalizes back into a
`NormalizedResponse` that the API layer can hand straight to the SDK.

Each Provider subclass:
  - declares `vendor`        (e.g. "anthropic")  — for analytics + logs
  - declares `env_key_name`  (e.g. "ANTHROPIC_API_KEY") — for key sourcing
  - implements `chat(...)`   — real HTTP call, returns NormalizedResponse
  - raises ProviderError on any failure (4xx, 5xx, transport, parse)

We intentionally do not stream in v0.2 — buffered responses keep the wire
format simple and avoid SSE plumbing on the SDK. Streaming is a future
upgrade (see token/DESIGN.md §4).
"""
from __future__ import annotations

import os
from abc import ABC, abstractmethod
from dataclasses import dataclass, field
from typing import Optional

import httpx


@dataclass(slots=True)
class ChatTurn:
    role: str           # "system" | "user" | "assistant"
    content: str


@dataclass(slots=True)
class NormalizedRequest:
    model: str
    turns: list[ChatTurn]
    max_tokens: int = 4096
    temperature: float = 1.0
    system: Optional[str] = None  # surfaced separately for Anthropic shape


@dataclass(slots=True)
class Usage:
    prompt_tokens: int = 0
    completion_tokens: int = 0
    cached_input_tokens: int = 0


@dataclass(slots=True)
class NormalizedResponse:
    content: str
    finish_reason: Optional[str]
    usage: Usage
    provider_response_id: Optional[str] = None
    model_returned: Optional[str] = None
    extra: dict = field(default_factory=dict)


class ProviderError(RuntimeError):
    """Raised for any provider-side issue: HTTP error, timeout, parse failure."""

    def __init__(
        self,
        message: str,
        *,
        status_code: Optional[int] = None,
        vendor: Optional[str] = None,
        retryable: bool = False,
    ):
        super().__init__(message)
        self.status_code = status_code
        self.vendor = vendor
        self.retryable = retryable


class Provider(ABC):
    """Abstract base. Concrete subclasses live alongside this file."""

    vendor: str = ""
    env_key_name: str = ""
    base_url: str = ""

    def __init__(self, http: httpx.AsyncClient):
        self._http = http

    # ── Key handling ───────────────────────────────────────────────
    def api_key(self) -> Optional[str]:
        """Returns the configured API key, or None if missing/dummy."""
        v = os.environ.get(self.env_key_name, "")
        if not v or "DUMMY" in v.upper():
            return None
        return v

    def available(self) -> bool:
        return self.api_key() is not None

    # ── The contract ──────────────────────────────────────────────
    @abstractmethod
    async def chat(self, req: NormalizedRequest) -> NormalizedResponse:
        """Perform the chat completion. Raise ProviderError on any failure."""
        ...
