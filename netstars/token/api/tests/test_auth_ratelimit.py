"""
Unit tests for per-key RPM/TPM rate limiting and _touch_last_used wiring.
No real Redis or DB required — uses async mocks.
"""
from __future__ import annotations

import time

import pytest


# ── Helpers: fake Redis ───────────────────────────────────────────────────────

class FakePipeline:
    """Minimal async pipeline mock for the sliding-window RPM test."""

    def __init__(self, zcard_result: int):
        self._zcard = zcard_result
        self.commands: list[str] = []

    def zremrangebyscore(self, key, min_, max_):
        self.commands.append("zremrangebyscore")

    def zadd(self, key, mapping):
        self.commands.append("zadd")

    def zcard(self, key):
        self.commands.append("zcard")

    def expire(self, key, ttl):
        self.commands.append("expire")

    async def execute(self):
        # (zremrangebyscore result, zadd result, zcard result, expire result)
        return [0, 1, self._zcard, True]


class FakeRedisRPM:
    """Fake Redis that tracks requests within the window via FakePipeline."""

    def __init__(self, current_count: int):
        self._count = current_count

    def pipeline(self, transaction=False):
        return FakePipeline(zcard_result=self._count)

    async def get(self, key):
        return None


class FakeRedisTMP:
    """Fake Redis for the TPM bucket check."""

    def __init__(self, current_tokens: int):
        self._val = str(current_tokens) if current_tokens else None

    async def get(self, key):
        return self._val

    async def incrby(self, key, amount):
        pass

    async def expire(self, key, ttl):
        pass


# ── RPM tests ─────────────────────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_rpm_unlimited_when_limit_zero():
    from token_api.auth import _check_rpm_limit
    redis = FakeRedisRPM(current_count=9999)
    allowed, count = await _check_rpm_limit(redis, "agk_test", limit_rpm=0)
    assert allowed is True


@pytest.mark.asyncio
async def test_rpm_allowed_below_limit():
    from token_api.auth import _check_rpm_limit
    redis = FakeRedisRPM(current_count=5)
    allowed, count = await _check_rpm_limit(redis, "agk_test", limit_rpm=10)
    assert allowed is True
    assert count == 5


@pytest.mark.asyncio
async def test_rpm_blocked_at_limit():
    from token_api.auth import _check_rpm_limit
    # current_count is already at limit — should be blocked
    redis = FakeRedisRPM(current_count=11)
    allowed, count = await _check_rpm_limit(redis, "agk_test", limit_rpm=10)
    assert allowed is False
    assert count == 11


# ── TPM tests ─────────────────────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_tpm_unlimited_when_limit_zero():
    from token_api.auth import _check_tpm_limit
    redis = FakeRedisTMP(current_tokens=999_999_999)
    allowed, _ = await _check_tpm_limit(redis, "agk_test", limit_tpm=0)
    assert allowed is True


@pytest.mark.asyncio
async def test_tpm_allowed_below_limit():
    from token_api.auth import _check_tpm_limit
    redis = FakeRedisTMP(current_tokens=50_000)
    allowed, current = await _check_tpm_limit(redis, "agk_test", limit_tpm=100_000)
    assert allowed is True
    assert current == 50_000


@pytest.mark.asyncio
async def test_tpm_blocked_at_limit():
    from token_api.auth import _check_tpm_limit
    redis = FakeRedisTMP(current_tokens=100_001)
    allowed, current = await _check_tpm_limit(redis, "agk_test", limit_tpm=100_000)
    assert allowed is False


@pytest.mark.asyncio
async def test_tpm_increment_no_crash():
    from token_api.auth import _increment_tpm
    redis = FakeRedisTMP(current_tokens=0)
    # Should not raise anything
    await _increment_tpm(redis, "agk_test", tokens=1000)


@pytest.mark.asyncio
async def test_tpm_increment_skips_zero_tokens():
    from token_api.auth import _increment_tpm
    redis = FakeRedisTMP(current_tokens=0)
    await _increment_tpm(redis, "agk_test", tokens=0)  # should be a no-op


# ── _touch_last_used: best-effort, never raises ───────────────────────────────

@pytest.mark.asyncio
async def test_touch_last_used_swallows_exceptions():
    """_touch_last_used must never propagate exceptions."""
    from token_api.auth import _touch_last_used

    class BrokenEngine:
        def begin(self):
            raise RuntimeError("DB is down")

    # Should complete without raising
    await _touch_last_used(BrokenEngine(), "agk_whatever")
