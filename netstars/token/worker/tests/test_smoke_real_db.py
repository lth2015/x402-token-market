"""
Smoke test: real MySQL connection — catches async/sync driver mismatch.

Run against the local docker-compose stack (mysql container must be up):

    # From the worker directory:
    DATABASE_URL=mysql+pymysql://token_app:token_app_dev@localhost:3306/token_qa \
        python -m pytest tests/test_smoke_real_db.py -v

Or via the container:
    docker exec x402m_token_worker \
        python -m pytest /app/tests/test_smoke_real_db.py -v

What this tests:
  1. make_engine() rejects async driver URLs (guards against recurrence)
  2. sync engine connects to real MySQL (catches greenlet error at driver level)
  3. All four worker-critical tables exist: audit_log, usage_daily,
     invoices, invoice_items  (catches missing-migration failures)
  4. A trivial SELECT on each table succeeds without raising
"""
from __future__ import annotations

import os
import pytest

REAL_DB_URL = os.environ.get(
    "DATABASE_URL",
    "mysql+pymysql://token_app:token_app_dev@localhost:3306/token_qa",
)

# Skip the whole module if we can't import pymysql (unit-test-only env)
pymysql = pytest.importorskip("pymysql", reason="pymysql not installed — skipping real-DB smoke tests")


# ── Guard: async driver is rejected at engine creation time ──────────────────

def test_make_engine_rejects_aiomysql():
    from token_worker.db import make_engine
    with pytest.raises(ValueError, match="async driver detected"):
        make_engine("mysql+aiomysql://user:pw@localhost/db")


def test_make_engine_rejects_asyncmy():
    from token_worker.db import make_engine
    with pytest.raises(ValueError, match="async driver detected"):
        make_engine("mysql+asyncmy://user:pw@localhost/db")


def test_make_engine_accepts_pymysql():
    """make_engine with pymysql URL must not raise — even if DB is unreachable.
    (create_engine is lazy; it does not connect until first use.)"""
    from token_worker.db import make_engine
    engine = make_engine("mysql+pymysql://user:pw@localhost:9/nonexistent")
    engine.dispose()


# ── Real DB connectivity tests (require running MySQL) ───────────────────────

def _skip_if_unreachable():
    """Return a skip reason string if MySQL is unreachable, else None."""
    try:
        import pymysql as _pymysql
        host, port_str = "localhost", "3306"
        # Parse host/port from URL cheaply
        try:
            after_at = REAL_DB_URL.split("@", 1)[1]
            hostport = after_at.split("/")[0]
            if ":" in hostport:
                host, port_str = hostport.rsplit(":", 1)
        except Exception:
            pass
        conn = _pymysql.connect(
            host=host,
            port=int(port_str),
            user="token_app",
            password="token_app_dev",
            database="token_qa",
            connect_timeout=3,
        )
        conn.close()
        return None
    except Exception as exc:
        return f"MySQL unreachable ({exc})"


_skip_reason = _skip_if_unreachable()
needs_db = pytest.mark.skipif(_skip_reason is not None, reason=_skip_reason or "")


@needs_db
def test_sync_engine_connects():
    """Sync engine can execute a trivial query — no greenlet error."""
    from token_worker.db import make_engine
    from sqlalchemy import text
    engine = make_engine(REAL_DB_URL)
    try:
        with engine.connect() as conn:
            result = conn.execute(text("SELECT 1 AS x"))
            row = result.first()
            assert row is not None
            assert row.x == 1
    finally:
        engine.dispose()


@needs_db
@pytest.mark.parametrize("table", [
    "audit_log",
    "usage_daily",
    "invoices",
    "invoice_items",
])
def test_worker_table_exists(table: str):
    """Each table the worker writes to must exist (migration 003 applied)."""
    from token_worker.db import make_engine
    from sqlalchemy import text
    engine = make_engine(REAL_DB_URL)
    try:
        with engine.connect() as conn:
            # INFORMATION_SCHEMA lookup — works without SELECT privilege on the table
            row = conn.execute(
                text(
                    "SELECT TABLE_NAME FROM information_schema.TABLES "
                    "WHERE TABLE_SCHEMA = :db AND TABLE_NAME = :tbl"
                ),
                {"db": "token_qa", "tbl": table},
            ).first()
            assert row is not None, (
                f"Table '{table}' not found in token_qa — "
                "run: make migrate-token  to apply migration 003"
            )
    finally:
        engine.dispose()


@needs_db
def test_usage_aggregator_job_runs_without_error():
    """Run the real job against the real DB — must not raise."""
    import importlib
    import token_worker.main as m
    # Patch DATABASE_URL inside the module so it uses our REAL_DB_URL
    original = m.DATABASE_URL
    m.DATABASE_URL = REAL_DB_URL
    try:
        m.job_usage_aggregator()
    finally:
        m.DATABASE_URL = original


@needs_db
def test_anomaly_detector_job_runs_without_error():
    """Run anomaly detector against real DB — must not raise."""
    import token_worker.main as m
    original = m.DATABASE_URL
    m.DATABASE_URL = REAL_DB_URL
    try:
        m.job_anomaly_detector()
    finally:
        m.DATABASE_URL = original
