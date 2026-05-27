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

Internal-service shortcut: requests carrying X-Internal-Auth: <shared-secret>
match INTERNAL_AUTH_SECRET env → resolve as (DEMO_MERCHANT_ID, "agk_internal").
This is used by /internal/credit (called by x402-api).
"""
from __future__ import annotations

import hashlib
import hmac
import os
import time
from dataclasses import dataclass
from typing import Optional

from fastapi import HTTPException, Request
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

    # Stamp last_used_at (fire-and-forget; we don't await it here to avoid latency)
    # Caller can schedule it as a background task if desired.
    return AuthContext(
        merchant_id=rec.merchant_id,
        project_id=rec.project_id,
        agent_key_id=rec.id,
        is_internal=False,
    )
