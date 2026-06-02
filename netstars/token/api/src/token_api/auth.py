"""
Real HMAC-SHA256 request auth for token-api.

Wire shape (matches sdk/src/netstars/transport.py::sign_request):
    Authorization:         Bearer <api_key_id>
    X-Netstars-Timestamp:  <unix-seconds>
    X-Netstars-Nonce:      <hex-32>
    X-Netstars-Signature:  <hex-64>     # HMAC-SHA256

String-to-sign:
    "{METHOD}\n{path}\n{ts}\n{nonce}\n{sha256_hex(body)}"

Defences:
- Timestamp window ±5 min (rejects very-old or future-skewed requests)
- Nonce stored in Redis (TTL 600s) — same nonce within window = replay = 401
- Plaintext secret loaded from agent_keys.key_secret_enc; in KMS_MODE=dev
  the column is treated as raw bytes; KMS_MODE=kms (TODO) decrypts via
  boto3 KMS first
- In-process LRU cache of (key_id → (secret, merchant_id, project_id, status))
  with 60-second TTL — bounds load on the agent_keys table
- Per-key rate limiting: RPM via Redis sliding window; TPM accumulates in metering
  settle path. Limit of 0 = unlimited (backward-compatible default).

Internal-service shortcut: requests carrying X-Internal-Auth: <shared-secret>
match INTERNAL_AUTH_SECRET env → resolve as (DEMO_MERCHANT_ID, "agk_internal").
This is used by /internal/credit (called by x402-api).
"""
from __future__ import annotations

import asyncio
import hashlib
import hmac
import math
import os
import time
from dataclasses import dataclass, field
from typing import Optional

from fastapi import HTTPException, Request
from fastapi.responses import JSONResponse
from sqlalchemy import select, update

from . import db
from .kms import KmsError, get_kms_client

# ── Config ─────────────────────────────────────────────────────────
CLOCK_SKEW_SECS = int(os.environ.get("AUTH_CLOCK_SKEW_SECS", "300"))
NONCE_TTL_SECS = int(os.environ.get("AUTH_NONCE_TTL_SECS", "600"))
CACHE_TTL_SECS = 60
# KMS mode comes from KMS_MODE env (dev | aws); resolved by token_api.kms.make_kms_client

# Internal-service shared secret (for token-api ↔ x402-api). In QA/prod we'd
# rotate this via Secrets Manager + ESO; here we accept the env directly.
INTERNAL_AUTH_SECRET = os.environ.get("INTERNAL_AUTH_SECRET", "internal_localdev_token")


@dataclass(slots=True)
class AuthContext:
    merchant_id: str
    project_id: Optional[str]
    agent_key_id: str
    is_internal: bool = False
    rate_limit_rpm: int = 0
    rate_limit_tpm: int = 0


# ── Plaintext secret loader (KMS-pluggable) ───────────────────────
async def _decrypt_secret(blob: bytes) -> str:
    """Convert key_secret_enc bytes to plaintext secret string via configured KMS."""
    client = get_kms_client()
    plaintext = await client.decrypt(blob)
    return plaintext.decode("utf-8")


# ── In-process cache ──────────────────────────────────────────────
_cache: dict[str, tuple[float, "AgentKeyRecord"]] = {}


@dataclass(slots=True)
class AgentKeyRecord:
    id: str
    secret: str
    project_id: str
    merchant_id: str
    status: str
    rate_limit_rpm: int = 0   # 0 = unlimited
    rate_limit_tpm: int = 0   # 0 = unlimited; enforced in metering settle path


async def _load_agent_key(engine, key_public: str) -> Optional[AgentKeyRecord]:
    """Look up agent_key + project + merchant in one round-trip; cached 60s."""
    now = time.time()
    cached = _cache.get(key_public)
    if cached and cached[0] > now:
        return cached[1]

    async with engine.connect() as conn:
        row = (await conn.execute(
            select(
                db.agent_keys.c.id,
                db.agent_keys.c.project_id,
                db.agent_keys.c.key_secret_enc,
                db.agent_keys.c.status,
                db.agent_keys.c.rate_limit_rpm,
                db.agent_keys.c.rate_limit_tpm,
                db.projects.c.merchant_id,
            )
            .select_from(
                db.agent_keys.join(db.projects, db.agent_keys.c.project_id == db.projects.c.id)
            )
            .where(db.agent_keys.c.key_public == key_public)
        )).first()

    if row is None or row.key_secret_enc is None:
        return None
    try:
        secret = await _decrypt_secret(bytes(row.key_secret_enc))
    except (UnicodeDecodeError, KmsError) as e:
        # Log so ops can spot misconfigured KMS / bad ciphertext blobs; never
        # surface details to the caller (would leak whether the row exists).
        import logging as _logging
        _logging.getLogger("token-api.auth").warning(
            "auth.decrypt_failed key=%s err=%s", key_public, e,
        )
        return None
    rec = AgentKeyRecord(
        id=row.id,
        secret=secret,
        project_id=row.project_id,
        merchant_id=row.merchant_id,
        status=row.status,
        rate_limit_rpm=int(row.rate_limit_rpm or 0),
        rate_limit_tpm=int(row.rate_limit_tpm or 0),
    )
    _cache[key_public] = (now + CACHE_TTL_SECS, rec)
    return rec


def _evict_cache(key_public: str) -> None:
    _cache.pop(key_public, None)


async def _touch_last_used(engine, agent_key_id: str) -> None:
    # Best-effort; never fail the request because of this.
    try:
        async with engine.begin() as conn:
            await conn.execute(
                update(db.agent_keys)
                .where(db.agent_keys.c.id == agent_key_id)
                .values(last_used_at=time.strftime("%Y-%m-%d %H:%M:%S"))
            )
    except Exception:  # noqa: BLE001
        pass


async def _check_rpm_limit(redis, key_id: str, limit_rpm: int) -> tuple[bool, int]:
    """
    Sliding-window RPM check using Redis sorted set (score = unix timestamp).
    Returns (allowed: bool, current_count: int).
    Limit 0 = unlimited (always allowed).
    """
    if limit_rpm <= 0:
        return True, 0
    now = time.time()
    window_start = now - 60.0
    rkey = f"rl_rpm:{key_id}"
    pipe = redis.pipeline(transaction=False)
    # Remove entries older than the 60-second window
    pipe.zremrangebyscore(rkey, "-inf", window_start)
    # Add this request (score = timestamp, member = timestamp+random suffix)
    pipe.zadd(rkey, {f"{now:.6f}": now})
    # Count entries in window
    pipe.zcard(rkey)
    # Expire key after 120 s to avoid orphan keys
    pipe.expire(rkey, 120)
    results = await pipe.execute()
    current = int(results[2])  # zcard result
    return current <= limit_rpm, current


async def _increment_tpm(redis, key_id: str, tokens: int) -> None:
    """
    Increment the per-key TPM counter in a 60-second rolling bucket.
    Called from the metering settle path (fire-and-forget).
    Uses a simple per-minute bucket key so it resets automatically.
    """
    if tokens <= 0:
        return
    bucket = int(time.time() // 60)  # 1-minute bucket
    rkey = f"rl_tpm:{key_id}:{bucket}"
    try:
        await redis.incrby(rkey, tokens)
        await redis.expire(rkey, 120)  # keep for 2 buckets
    except Exception:  # noqa: BLE001
        pass


async def _check_tpm_limit(redis, key_id: str, limit_tpm: int) -> tuple[bool, int]:
    """
    Check if the current-minute TPM counter would exceed the limit.
    Returns (allowed: bool, current_count: int). Limit 0 = unlimited.
    """
    if limit_tpm <= 0:
        return True, 0
    bucket = int(time.time() // 60)
    rkey = f"rl_tpm:{key_id}:{bucket}"
    try:
        val = await redis.get(rkey)
        current = int(val) if val else 0
    except Exception:  # noqa: BLE001
        return True, 0  # fail-open on Redis error
    return current < limit_tpm, current


# ── Signature verification ────────────────────────────────────────
def _string_to_sign(method: str, path: str, ts: str, nonce: str, body_sha: str) -> bytes:
    return f"{method.upper()}\n{path}\n{ts}\n{nonce}\n{body_sha}".encode("utf-8")


def _expected_sig(secret: str, payload: bytes) -> str:
    return hmac.new(secret.encode("utf-8"), payload, hashlib.sha256).hexdigest()


async def _seen_nonce(redis, key_public: str, nonce: str) -> bool:
    """Return True if we have seen this nonce within the TTL window."""
    redis_key = f"hmac_nonce:{key_public}:{nonce}"
    # SET NX EX — atomic "claim this nonce or report it taken"
    claimed = await redis.set(redis_key, "1", ex=NONCE_TTL_SECS, nx=True)
    return not bool(claimed)


# ── FastAPI dependency ────────────────────────────────────────────
async def verify_request(request: Request) -> AuthContext:
    """
    FastAPI dependency: validates HMAC signature on the request and returns
    an AuthContext. Raises HTTPException(401) on any failure.

    Reads body via request.body() (FastAPI caches it, safe to call multiple
    times within a single request lifecycle).
    """
    # ── Internal-service shortcut ─────────────────────────────────
    internal = request.headers.get("X-Internal-Auth")
    if internal:
        if hmac.compare_digest(internal, INTERNAL_AUTH_SECRET):
            return AuthContext(
                merchant_id="*", project_id=None,
                agent_key_id="agk_internal", is_internal=True,
            )
        raise HTTPException(401, "Invalid X-Internal-Auth")

    # ── HMAC client auth ──────────────────────────────────────────
    auth_h = request.headers.get("Authorization", "")
    if not auth_h.startswith("Bearer "):
        raise HTTPException(401, "Missing or malformed Authorization header")
    key_public = auth_h[len("Bearer "):].strip()
    if not key_public:
        raise HTTPException(401, "Empty Bearer token")

    ts = request.headers.get("X-Netstars-Timestamp", "")
    nonce = request.headers.get("X-Netstars-Nonce", "")
    sig = request.headers.get("X-Netstars-Signature", "")
    if not (ts and nonce and sig):
        raise HTTPException(401, "Missing X-Netstars-Timestamp/Nonce/Signature header")

    # Timestamp window
    try:
        ts_int = int(ts)
    except ValueError as e:
        raise HTTPException(401, "Bad timestamp") from e
    now = int(time.time())
    if abs(now - ts_int) > CLOCK_SKEW_SECS:
        raise HTTPException(401, f"Timestamp out of window (|Δ|>{CLOCK_SKEW_SECS}s)")

    # Look up the key
    engine = request.app.state.db
    rec = await _load_agent_key(engine, key_public)
    if rec is None:
        raise HTTPException(401, "Unknown or unconfigured API key")
    if rec.status != "active":
        raise HTTPException(401, f"API key status={rec.status!r}, not active")

    # Compute expected signature
    body = await request.body()
    body_sha = hashlib.sha256(body).hexdigest()
    expected = _expected_sig(
        rec.secret,
        _string_to_sign(request.method, request.url.path, ts, nonce, body_sha),
    )
    if not hmac.compare_digest(expected, sig):
        # In case of secret rotation: evict and reject; client retry will reload.
        _evict_cache(key_public)
        raise HTTPException(401, "Bad signature")

    # Replay protection
    redis = request.app.state.redis
    if await _seen_nonce(redis, key_public, nonce):
        raise HTTPException(401, "Nonce replay detected")

    # Per-key RPM rate limit (sliding window via Redis sorted set).
    # Checked after auth to avoid counting rejected requests.
    allowed, current_rpm = await _check_rpm_limit(redis, rec.id, rec.rate_limit_rpm)
    if not allowed:
        retry_after = 60 - int(time.time() % 60) + 1
        raise HTTPException(
            429,
            detail={
                "error_code": "RATE_LIMIT_EXCEEDED",
                "detail": f"RPM limit {rec.rate_limit_rpm} exceeded (current {current_rpm})",
                "retry_after": retry_after,
            },
            headers={"Retry-After": str(retry_after)},
        )

    # Stamp last_used_at — fire-and-forget; never block the request path.
    asyncio.ensure_future(_touch_last_used(request.app.state.db, rec.id))

    return AuthContext(
        merchant_id=rec.merchant_id,
        project_id=rec.project_id,
        agent_key_id=rec.id,
        is_internal=False,
        rate_limit_rpm=rec.rate_limit_rpm,
        rate_limit_tpm=rec.rate_limit_tpm,
    )
