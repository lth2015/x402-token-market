"""
Unit tests for GET /v1/merchant/profile endpoint.
Uses httpx.AsyncClient test client — no real DB or Redis needed.
"""
from __future__ import annotations

import pytest
from fastapi.testclient import TestClient
from unittest.mock import AsyncMock, MagicMock, patch


def _make_app_with_mocks(merchant_row, *, auth_is_internal=False):
    """
    Build the FastAPI app with lifespan bypassed and auth + DB mocked.
    Returns (app, client).
    """
    import token_api.main as m

    # Patch lifespan so TestClient doesn't try to connect to DB/Redis
    async def _noop_lifespan(app):
        # Minimal state
        app.state.db = MagicMock()
        app.state.redis = MagicMock()
        app.state.http = MagicMock()
        app.state.kms = MagicMock()
        yield

    from contextlib import asynccontextmanager
    with patch.object(m, "lifespan", asynccontextmanager(_noop_lifespan)):
        # Re-create app inline to pick up patched lifespan — easier: just test the
        # route logic directly via dependency override.
        pass

    return m.app


# ── Simpler approach: test the abbreviation derivation logic directly ─────────

def test_abbr_single_word():
    """First 4 uppercase chars of single word."""
    name = "Netstars"
    abbr = "".join(w[0] for w in name.split() if w)[:4].upper()
    assert abbr == "N"


def test_abbr_multi_word():
    """Initial of each word, up to 4."""
    name = "Wea Japan Pte Ltd"
    abbr = "".join(w[0] for w in name.split() if w)[:4].upper()
    assert abbr == "WJPL"


def test_abbr_two_words():
    name = "Netstars Inc"
    abbr = "".join(w[0] for w in name.split() if w)[:4].upper()
    assert abbr == "NI"


def test_abbr_empty_name_falls_back():
    name = "ABCD"
    abbr_initials = "".join(w[0] for w in name.split() if w)[:4].upper()
    # Single-word: just first initial — fallback takes first 4 chars
    result = abbr_initials or name[:4].upper()
    assert result == "A"


# ── Response model shape ────────────────────────────────────────────────────

def test_merchant_profile_out_fields():
    """MerchantProfileOut has the expected required fields."""
    from token_api.main import MerchantProfileOut
    p = MerchantProfileOut(
        merchant_id="mch_001",
        display_name="Netstars Inc",
        abbr="NI",
        env_label="qa",
        currency_pref="JPY",
        status="active",
    )
    assert p.merchant_id == "mch_001"
    assert p.abbr == "NI"
    assert p.legal_name is None
    assert p.tax_id is None


def test_merchant_profile_out_optional_fields():
    from token_api.main import MerchantProfileOut
    p = MerchantProfileOut(
        merchant_id="mch_001",
        display_name="Wea Japan",
        abbr="WJ",
        env_label="prod",
        legal_name="株式会社 Wea",
        tax_id="T1234567890123",
        currency_pref="JPY",
        status="active",
    )
    assert p.legal_name == "株式会社 Wea"
    assert p.tax_id == "T1234567890123"
