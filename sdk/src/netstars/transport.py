"""
HTTP transport for the Netstars SDK.

Responsibilities:
- Build HMAC-SHA256 request signatures (Stripe-style)
- Inject W3C traceparent header
- Retry on transient errors (5xx / 429 / network) with exp-backoff + jitter
- Map non-2xx responses to typed exceptions
"""
from __future__ import annotations

import hashlib
import hmac
import json
import logging
import secrets
import time
from typing import Any, Optional

import httpx

from . import errors

log = logging.getLogger(__name__)

DEFAULT_BASE_URLS = {
    "devnet":  "http://localhost:8080",          # local docker-compose: token-api
    "mainnet": "https://api.netstars.jp",
}

RETRY_STATUSES = {408, 425, 429, 500, 502, 503, 504}
RETRY_EXCEPTIONS = (
    httpx.ConnectError,
    httpx.ReadTimeout,
    httpx.WriteTimeout,
    httpx.RemoteProtocolError,
)


def sign_request(
    *,
    method: str,
    path: str,
    body: bytes,
    api_key_id: str,
    api_key_secret: str,
) -> dict[str, str]:
    """Compute HMAC-SHA256 headers for one request."""
    ts = str(int(time.time()))
    nonce = secrets.token_hex(16)
    body_sha = hashlib.sha256(body).hexdigest()
    string_to_sign = f"{method.upper()}\n{path}\n{ts}\n{nonce}\n{body_sha}"
    sig = hmac.new(
        api_key_secret.encode("utf-8"),
        string_to_sign.encode("utf-8"),
        hashlib.sha256,
    ).hexdigest()
    return {
        "Authorization":         f"Bearer {api_key_id}",
        "X-Netstars-Timestamp":  ts,
        "X-Netstars-Nonce":      nonce,
        "X-Netstars-Signature":  sig,
    }


def new_traceparent() -> str:
    """Return a fresh W3C traceparent header value."""
    trace_id = secrets.token_hex(16)
    span_id = secrets.token_hex(8)
    return f"00-{trace_id}-{span_id}-01"


def compute_backoff(attempt: int, response: Optional[httpx.Response]) -> float:
    """Exponential backoff with jitter; honour Retry-After if present."""
    if response is not None:
        ra = response.headers.get("Retry-After")
        if ra is not None:
            try:
                return float(ra)
            except ValueError:
                pass
    base_ms = 100 * (2 ** attempt)
    jitter_ms = secrets.randbelow(50)
    return min((base_ms + jitter_ms) / 1000.0, 30.0)


class Transport:
    """Thin wrapper around httpx.Client adding signing, retries, and error mapping."""

    def __init__(
        self,
        *,
        base_url: str,
        api_key: str,
        api_key_secret: str,
        timeout: float = 30.0,
        max_retries: int = 5,
        http: Optional[httpx.Client] = None,
    ):
        self._base_url = base_url.rstrip("/")
        self._api_key = api_key
        self._api_key_secret = api_key_secret
        self._max_retries = max_retries
        self._http = http or httpx.Client(
            timeout=httpx.Timeout(timeout, connect=min(5.0, timeout)),
            headers={"User-Agent": "netstars-sdk-python/0.1"},
        )

    # ── Public API ──────────────────────────────────────────────────
    def request(
        self,
        method: str,
        path: str,
        *,
        json_body: Optional[Any] = None,
        extra_headers: Optional[dict[str, str]] = None,
        trace_id: Optional[str] = None,
    ) -> httpx.Response:
        body = json.dumps(json_body, separators=(",", ":"), sort_keys=False).encode() if json_body is not None else b""
        traceparent = trace_id or new_traceparent()
        url = f"{self._base_url}{path}"
        # The server signs `request.url.path` which excludes the query string,
        # so we have to strip it here too — otherwise GETs that carry filters
        # (e.g. /v1/recent-activity?limit=5) fail with "Bad signature".
        sign_path = path.split("?", 1)[0]

        attempt = 0
        last_exc: Optional[BaseException] = None
        while True:
            # Re-sign on every attempt: HMAC nonce is single-use, so reusing
            # the same headers across retries trips the server's replay guard
            # and turns a transient 5xx into a fatal 401.
            sig_headers = sign_request(
                method=method, path=sign_path, body=body,
                api_key_id=self._api_key, api_key_secret=self._api_key_secret,
            )
            headers = {
                **sig_headers,
                "Content-Type": "application/json",
                "Accept": "application/json",
                "traceparent": traceparent,
            }
            if extra_headers:
                headers.update(extra_headers)
            try:
                resp = self._http.request(method, url, content=body, headers=headers)
                if resp.status_code < 300:
                    return resp
                # Retryable status?
                if resp.status_code in RETRY_STATUSES and attempt < self._max_retries:
                    log.debug("retry: status=%s attempt=%s", resp.status_code, attempt)
                    time.sleep(compute_backoff(attempt, resp))
                    attempt += 1
                    continue
                # Not retryable → map to exception
                raise _map_response(resp)
            except RETRY_EXCEPTIONS as e:
                last_exc = e
                if attempt >= self._max_retries:
                    raise errors.NetstarsError(
                        f"Network error after {attempt} retries: {e!s}", code="NETWORK_ERROR"
                    ) from e
                time.sleep(compute_backoff(attempt, None))
                attempt += 1

    def get(self, path: str, **kw) -> httpx.Response:
        return self.request("GET", path, **kw)

    def post(self, path: str, **kw) -> httpx.Response:
        return self.request("POST", path, **kw)

    def close(self) -> None:
        self._http.close()


def _map_response(resp: httpx.Response) -> errors.NetstarsError:
    """Convert a non-2xx httpx.Response into the right NetstarsError subclass."""
    try:
        body = resp.json()
    except Exception:
        body = {}
    code = body.get("error_code") or "UNKNOWN"
    trace_id = body.get("trace_id") or resp.headers.get("X-Trace-Id")
    detail = body.get("detail") or body.get("title") or resp.text[:300]
    meta = body.get("metadata") or {}
    status = resp.status_code

    base_kwargs = dict(
        message=detail, code=code, trace_id=trace_id,
        status_code=status, metadata=meta,
    )

    if status == 401:
        return errors.AuthenticationError(**base_kwargs)
    if status == 403:
        return errors.AuthorizationError(**base_kwargs)
    if status == 402:
        from .models import PaymentIntent
        intent = None
        intent_payload = body.get("payment_intent") or body.get("payment_required")
        if intent_payload:
            try:
                intent = PaymentIntent.model_validate(intent_payload)
            except Exception:  # noqa: BLE001
                pass
        cls = errors.InsufficientBalanceError if code == "INSUFFICIENT_BALANCE" else errors.PaymentRequiredError
        return cls(intent=intent, **base_kwargs)
    if status == 429:
        retry_after = resp.headers.get("Retry-After", "60")
        try:
            ra = int(float(retry_after))
        except ValueError:
            ra = 60
        return errors.RateLimitError(retry_after=ra, **base_kwargs)
    if 400 <= status < 500:
        return errors.ValidationError(**base_kwargs)
    return errors.ServerError(**base_kwargs)
