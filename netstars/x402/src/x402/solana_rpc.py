"""
Thin async wrapper around the Solana JSON-RPC endpoints we actually use.

We deliberately use raw httpx (not solana-py) to keep dependencies minimal
and avoid version churn. The 4 RPCs needed for v0.2.0:

    getLatestBlockhash    — to bake into payment intents (clients use it as `recent_blockhash`)
    sendTransaction       — to broadcast the client's signed tx
    getSignatureStatuses  — to poll for confirmation
    getHealth             — readiness probe

All methods return parsed JSON dicts and raise SolanaRpcError on any
non-200, JSON-RPC error, or schema mismatch.
"""
from __future__ import annotations

from typing import Any, Optional

import httpx


class SolanaRpcError(RuntimeError):
    def __init__(self, message: str, *, code: Optional[int] = None, data: Any = None):
        super().__init__(message)
        self.code = code
        self.data = data


class SolanaRpc:
    """Minimal JSON-RPC client. One instance per service process; shares the lifespan httpx.AsyncClient."""

    def __init__(self, url: str, http: httpx.AsyncClient):
        self._url = url.rstrip("/")
        self._http = http
        self._id = 0

    async def _call(self, method: str, params: list[Any]) -> Any:
        self._id += 1
        payload = {"jsonrpc": "2.0", "id": self._id, "method": method, "params": params}
        try:
            r = await self._http.post(self._url, json=payload, timeout=10.0)
        except httpx.HTTPError as e:
            raise SolanaRpcError(f"RPC transport error: {e}") from e
        if r.status_code >= 400:
            raise SolanaRpcError(f"RPC HTTP {r.status_code}: {r.text[:200]}")
        try:
            body = r.json()
        except ValueError as e:
            raise SolanaRpcError(f"RPC non-JSON body: {e}") from e
        if "error" in body:
            err = body["error"]
            raise SolanaRpcError(
                f"RPC error: {err.get('message', '?')}",
                code=err.get("code"),
                data=err.get("data"),
            )
        if "result" not in body:
            raise SolanaRpcError(f"RPC missing result: {body!r}")
        return body["result"]

    # ── Concrete RPCs ──────────────────────────────────────────────
    async def get_health(self) -> bool:
        """True if RPC is healthy. Some validators return string 'ok'."""
        try:
            res = await self._call("getHealth", [])
            return res in (True, "ok", None)  # None on some forks
        except SolanaRpcError:
            return False

    async def get_latest_blockhash(self, commitment: str = "finalized") -> dict:
        """Returns {'blockhash': base58, 'lastValidBlockHeight': int}."""
        res = await self._call("getLatestBlockhash", [{"commitment": commitment}])
        value = res.get("value") or {}
        if not value.get("blockhash"):
            raise SolanaRpcError(f"getLatestBlockhash missing blockhash: {res!r}")
        return value

    async def send_transaction(self, signed_tx_b64: str, *, skip_preflight: bool = False) -> str:
        """Broadcast a base64-encoded signed transaction. Returns the tx signature (base58)."""
        res = await self._call(
            "sendTransaction",
            [
                signed_tx_b64,
                {
                    "encoding": "base64",
                    "skipPreflight": skip_preflight,
                    "preflightCommitment": "processed",
                    "maxRetries": 0,  # we'll manage retries ourselves
                },
            ],
        )
        if not isinstance(res, str):
            raise SolanaRpcError(f"sendTransaction non-string: {res!r}")
        return res

    async def get_signature_status(self, signature: str) -> Optional[dict]:
        """
        Returns:
          None                  if signature not yet seen (null in JSON)
          {confirmationStatus, slot, err, confirmations}
        """
        res = await self._call(
            "getSignatureStatuses",
            [[signature], {"searchTransactionHistory": False}],
        )
        value = res.get("value") or []
        if not value:
            return None
        return value[0]  # may be None if unseen
