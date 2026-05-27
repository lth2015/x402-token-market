"""
Lightweight ULID generator — Crockford base32 over 48-bit timestamp + 80-bit randomness.

Self-contained: no external `python-ulid` dependency so the slim service image
stays slim. ~30 lines of pure-stdlib.
"""
from __future__ import annotations

import secrets
import time

_ALPHA = "0123456789ABCDEFGHJKMNPQRSTVWXYZ"


def new_ulid() -> str:
    ts_ms = int(time.time() * 1000) & ((1 << 48) - 1)
    rand = secrets.randbits(80)
    # 48-bit ts → 10 chars; 80-bit rand → 16 chars; total 26 chars
    return _encode(ts_ms, 10) + _encode(rand, 16)


def _encode(n: int, length: int) -> str:
    out = []
    for _ in range(length):
        out.append(_ALPHA[n & 0x1F])
        n >>= 5
    return "".join(reversed(out))
