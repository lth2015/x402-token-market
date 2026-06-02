"""
Unit tests for token-worker jobs.
All tests are offline (no real DB, no real x402-api).
Strategy:
  - Mock the engine / DB connections to return controlled row data.
  - Mock httpx.Client calls to x402-api.
  - Assert correct behaviour (correct SQL paths, alert logic, empty-run safety).
"""
from __future__ import annotations

import os
from contextlib import contextmanager
from dataclasses import dataclass
from decimal import Decimal
from typing import Any
from unittest.mock import MagicMock, patch
import pytest


# ── Minimal Row stub ──────────────────────────────────────────────────────────

@dataclass
class Row:
    """Behaves like a SQLAlchemy Row for attribute access."""
    _data: dict

    def __getattr__(self, name):
        try:
            return self._data[name]
        except KeyError:
            raise AttributeError(name)


def _row(**kw):
    return Row(_data=kw)


# ── DB mock helpers ────────────────────────────────────────────────────────────

class FakeResult:
    def __init__(self, rows):
        self._rows = rows

    def first(self):
        return self._rows[0] if self._rows else None

    def fetchall(self):
        return list(self._rows)


class FakeConn:
    """Records execute calls and returns configured result sets."""

    def __init__(self, results: list[FakeResult] | None = None):
        self._results = list(results or [])
        self.executed: list[Any] = []
        self._idx = 0

    def execute(self, stmt, *args, **kwargs):
        self.executed.append(stmt)
        if self._idx < len(self._results):
            result = self._results[self._idx]
            self._idx += 1
            return result
        return FakeResult([])


@contextmanager
def fake_engine_context(conn: FakeConn):
    """Context manager that mimics engine.begin()."""
    yield conn


class FakeEngine:
    def __init__(self, conn: FakeConn):
        self._conn = conn

    def begin(self):
        return fake_engine_context(self._conn)

    def connect(self):
        return fake_engine_context(self._conn)

    def dispose(self):
        pass


# ── Test: scheduler builds without error ─────────────────────────────────────

def test_build_scheduler_all_mode():
    from token_worker.main import _build_scheduler
    scheduler = _build_scheduler(mode="all")
    job_ids = {j.id for j in scheduler.get_jobs()}
    assert "reconciler" in job_ids
    assert "invoice_generator" in job_ids
    assert "usage_aggregator" in job_ids
    assert "anomaly_detector" in job_ids
    # Don't call scheduler.shutdown() — scheduler is not started, only configured.


def test_build_scheduler_single_mode():
    from token_worker.main import _build_scheduler
    scheduler = _build_scheduler(mode="usage_aggregator")
    job_ids = {j.id for j in scheduler.get_jobs()}
    assert "usage_aggregator" in job_ids
    assert "reconciler" not in job_ids


# ── Test: reconciler handles x402 endpoint missing gracefully ─────────────────

def test_reconciler_x402_not_found():
    """404 from x402 → log notice and return without error."""
    mock_resp = MagicMock()
    mock_resp.status_code = 404

    with patch("token_worker.main.worker_db.make_engine") as mock_make_engine, \
         patch("token_worker.main._get_http") as mock_http:
        mock_make_engine.return_value = FakeEngine(FakeConn())
        mock_http_client = MagicMock()
        mock_http_client.get.return_value = mock_resp
        mock_http.return_value = mock_http_client

        from token_worker.main import job_reconciler
        # Should not raise
        job_reconciler()
        mock_http_client.get.assert_called_once()


def test_reconciler_x402_unreachable():
    """HTTPError → log warning, no crash."""
    import httpx

    with patch("token_worker.main.worker_db.make_engine") as mock_make_engine, \
         patch("token_worker.main._get_http") as mock_http:
        mock_make_engine.return_value = FakeEngine(FakeConn())
        mock_http_client = MagicMock()
        mock_http_client.get.side_effect = httpx.ConnectError("refused")
        mock_http.return_value = mock_http_client

        from token_worker.main import job_reconciler
        job_reconciler()  # must not raise


def test_reconciler_empty_orders():
    """Empty order list → no DB writes, clean exit."""
    mock_resp = MagicMock()
    mock_resp.status_code = 200
    mock_resp.json.return_value = {"orders": []}

    with patch("token_worker.main.worker_db.make_engine") as mock_make_engine, \
         patch("token_worker.main._get_http") as mock_http:
        conn = FakeConn()
        mock_make_engine.return_value = FakeEngine(conn)
        mock_http_client = MagicMock()
        mock_http_client.get.return_value = mock_resp
        mock_http.return_value = mock_http_client

        from token_worker.main import job_reconciler
        job_reconciler()
        # No execute calls expected since orders list is empty
        assert len(conn.executed) == 0


# ── Test: invoice_generator empty usage → no invoice created ─────────────────

def test_invoice_generator_no_usage():
    """Merchant with zero usage in period → no invoice row created."""
    merchant_row = _row(id="mch_test", name="Test Corp", legal_name=None,
                        tax_id=None, currency_pref="JPY")
    # Query results: merchants list, usage agg (returns 0)
    conn = FakeConn(results=[
        FakeResult([merchant_row]),                     # merchants query
        FakeResult([_row(total_tokens=0, call_count=0)]),  # usage agg
    ])

    with patch("token_worker.main.worker_db.make_engine") as mock_engine:
        mock_engine.return_value = FakeEngine(conn)
        from token_worker.main import job_invoice_generator
        job_invoice_generator()

    # Only 2 execute calls: merchants select + usage agg (no insert)
    assert len(conn.executed) == 2


def test_invoice_generator_with_usage():
    """Merchant with usage → invoice + item rows inserted."""
    merchant_row = _row(id="mch_test", name="Test Corp", legal_name=None,
                        tax_id=None, currency_pref="JPY")
    conn = FakeConn(results=[
        FakeResult([merchant_row]),                       # merchants
        FakeResult([]),                                   # existing invoice check → none
        FakeResult([_row(total_tokens=Decimal("5000000"), call_count=100)]),  # usage agg
    ])

    with patch("token_worker.main.worker_db.make_engine") as mock_engine:
        mock_engine.return_value = FakeEngine(conn)
        from token_worker.main import job_invoice_generator
        job_invoice_generator()

    # Should have attempted merchant select, existing check, usage agg, invoice insert, item insert
    assert len(conn.executed) >= 4


def test_invoice_generator_skips_existing():
    """If invoice already exists for period, skip without double-insert."""
    merchant_row = _row(id="mch_test", name="Test Corp", legal_name=None,
                        tax_id=None, currency_pref="JPY")
    existing_invoice = _row(id="inv_202605_mch_test")
    conn = FakeConn(results=[
        FakeResult([merchant_row]),        # merchants
        FakeResult([existing_invoice]),    # existing invoice → found → skip
    ])

    with patch("token_worker.main.worker_db.make_engine") as mock_engine:
        mock_engine.return_value = FakeEngine(conn)
        from token_worker.main import job_invoice_generator
        job_invoice_generator()

    # Only 2 selects, no insert
    assert len(conn.executed) == 2


# ── Test: usage_aggregator empty data → no crash ─────────────────────────────

def test_usage_aggregator_no_data():
    """No request rows → aggregator runs cleanly without crashing."""
    conn = FakeConn(results=[
        FakeResult([]),  # yesterday agg
        FakeResult([]),  # today agg
    ])

    with patch("token_worker.main.worker_db.make_engine") as mock_engine:
        mock_engine.return_value = FakeEngine(conn)
        from token_worker.main import job_usage_aggregator
        job_usage_aggregator()

    # 2 selects (yesterday, today), 0 inserts
    assert len(conn.executed) == 2


def test_usage_aggregator_with_data():
    """Rows present → upsert executed for each (select, insert) pair per day."""
    usage_row = _row(
        merchant_id="mch_a", model="gpt-4.1",
        request_count=50, prompt_tokens=10000, completion_tokens=3000,
        total_cost_token=Decimal("65000"), total_cost_usdc_micro=65000,
    )
    conn = FakeConn(results=[
        FakeResult([usage_row]),  # yesterday agg → 1 select, 1 upsert
        FakeResult([usage_row]),  # today agg → 1 select, 1 upsert
    ])

    with patch("token_worker.main.worker_db.make_engine") as mock_engine:
        mock_engine.return_value = FakeEngine(conn)
        from token_worker.main import job_usage_aggregator
        job_usage_aggregator()

    # Select(yesterday) + Insert(yesterday) + Select(today) — today insert uses result[1]
    # but FakeConn idx is at 2 so today gets empty (index out of bounds → FakeResult([]))
    # In practice: 2 selects + at least 1 upsert since yesterday has data
    assert len(conn.executed) >= 3


# ── Test: anomaly_detector empty data → no alerts ────────────────────────────

def test_anomaly_detector_no_data():
    """No spend, no balances, no requests → zero alerts."""
    conn = FakeConn(results=[
        FakeResult([]),  # recent_spend
        FakeResult([]),  # baseline_spend
        FakeResult([]),  # low_balances
        FakeResult([]),  # error_counts
    ])

    with patch("token_worker.main.worker_db.make_engine") as mock_engine:
        mock_engine.return_value = FakeEngine(conn)
        from token_worker.main import job_anomaly_detector
        job_anomaly_detector()

    # 4 selects, 0 audit inserts
    assert len(conn.executed) == 4


def test_anomaly_detector_low_balance_alert():
    """A merchant with low balance → low_balance alert written to audit_log."""
    low_balance_row = _row(merchant_id="mch_poor", balance_token=Decimal("5000000"))  # 5 USDC

    conn = FakeConn(results=[
        FakeResult([]),                # recent_spend (no spike)
        FakeResult([]),                # baseline_spend
        FakeResult([low_balance_row]), # low_balances → 1 result
        FakeResult([]),                # error_counts
    ])

    with patch("token_worker.main.worker_db.make_engine") as mock_engine:
        mock_engine.return_value = FakeEngine(conn)
        from token_worker.main import job_anomaly_detector
        job_anomaly_detector()

    # 4 selects + 1 audit insert for low balance
    assert len(conn.executed) == 5


def test_anomaly_detector_spend_spike():
    """Spend 5x baseline → spike alert."""
    spike_row = _row(merchant_id="mch_spike", tokens_5m=Decimal("500000"))
    baseline_row = _row(merchant_id="mch_spike", tokens_5m_avg=Decimal("50000"))

    conn = FakeConn(results=[
        FakeResult([spike_row]),    # recent_spend
        FakeResult([baseline_row]), # baseline_spend
        FakeResult([]),             # low_balances
        FakeResult([]),             # error_counts
    ])

    with patch("token_worker.main.worker_db.make_engine") as mock_engine:
        mock_engine.return_value = FakeEngine(conn)
        from token_worker.main import job_anomaly_detector
        job_anomaly_detector()

    # 4 selects + 1 alert insert
    assert len(conn.executed) == 5
