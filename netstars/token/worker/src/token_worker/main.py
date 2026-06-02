"""
Token System worker · v0.2.0

Real APScheduler jobs implementing:
    reconciler        – hourly: sync x402 payment orders into payment_orders_mirror
                        and verify consistency against ledger credits.
    invoice_generator – 1st of month: aggregate prior month spend → draft invoice rows.
    usage_aggregator  – every 5 min: REPLACE INTO usage_daily aggregation table.
    anomaly_detector  – every 5 min: detect sudden spend spikes / low-balance alerts.

AP2: never touches x402's DB — all x402 data fetched via x402-api HTTP endpoints.
AP4: never touches Solana.
"""
from __future__ import annotations

import asyncio
import logging
import os
import signal
import time
import uuid
from datetime import datetime, timedelta, timezone
from decimal import Decimal
from typing import Optional

import httpx
import structlog
from apscheduler.schedulers.blocking import BlockingScheduler
from sqlalchemy import and_, func, insert, select, text, update
from sqlalchemy.dialects.mysql import insert as mysql_insert

from . import db as worker_db

structlog.configure(
    processors=[
        structlog.contextvars.merge_contextvars,
        structlog.processors.add_log_level,
        structlog.processors.TimeStamper(fmt="iso"),
        structlog.processors.JSONRenderer(),
    ],
    wrapper_class=structlog.make_filtering_bound_logger(logging.INFO),
)
log = structlog.get_logger("token-worker")

# ── Config ─────────────────────────────────────────────────────────────────────
WORKER_MODE = os.environ.get("WORKER_MODE", "all")
ENV = os.environ.get("ENV", "local")
DATABASE_URL = os.environ.get(
    "DATABASE_URL",
    "mysql+pymysql://token_app:token_app_dev@localhost:3306/token_qa",
)
X402_API_BASE_URL = os.environ.get("X402_API_BASE_URL", "http://x402-api:8080")
INTERNAL_AUTH_SECRET = os.environ.get("INTERNAL_AUTH_SECRET", "internal_localdev_token")

# FX (same env var as api, for consistency)
FX_JPY_PER_USDC: float = float(os.environ.get("FX_JPY_PER_USDC", "150"))

# Tax rate for Japan (10% consumption tax)
TAX_RATE = Decimal("0.10")

# Anomaly thresholds
ANOMALY_SPIKE_RATIO = float(os.environ.get("ANOMALY_SPIKE_RATIO", "3.0"))  # 3x baseline = alert
ANOMALY_LOW_BALANCE_USDC = float(os.environ.get("ANOMALY_LOW_BALANCE_USDC", "10.0"))  # < 10 USDC


# ── Shared HTTP client (module-level, reused across job runs) ─────────────────
_http: Optional[httpx.Client] = None


def _get_http() -> httpx.Client:
    global _http
    if _http is None or _http.is_closed:
        _http = httpx.Client(timeout=15.0)
    return _http


def _x402_headers() -> dict[str, str]:
    return {
        "X-Internal-Caller": "token-worker",
        "X-Internal-Auth": INTERNAL_AUTH_SECRET,
    }


# ── Job: reconciler ────────────────────────────────────────────────────────────

def job_reconciler() -> None:
    """
    Sync x402 payment orders into payment_orders_mirror (AP2: via API only).
    Then cross-check: every 'confirmed' mirror row should have a matching ledger
    credit (source='x402_payment', source_ref=payment_order_id).
    Discrepancies are logged as warnings for ops to investigate.

    x402-api endpoint needed: GET /v1/payments?since=<iso>&limit=<n>
    (Returns list of payment orders with id, merchant_id, amount_usdc_micro,
     status, tx_hash, confirmed_at.)

    If x402-api does not yet expose this endpoint, the reconciler logs a notice
    and exits gracefully — the framework and write logic is in place.
    """
    log.info("reconciler.start")
    engine = worker_db.make_engine(DATABASE_URL)
    http = _get_http()

    try:
        # Determine sync window: last 2 hours (overlapping to catch late updates)
        since = (datetime.now(timezone.utc) - timedelta(hours=2)).isoformat()

        try:
            resp = http.get(
                f"{X402_API_BASE_URL}/v1/payments",
                params={"since": since, "limit": 200},
                headers=_x402_headers(),
            )
        except httpx.HTTPError as e:
            log.warning("reconciler.x402_unreachable", err=str(e))
            return

        if resp.status_code == 404:
            # x402-api does not yet expose this endpoint — log and exit cleanly.
            log.info(
                "reconciler.x402_endpoint_missing",
                note=(
                    "x402-api GET /v1/payments not yet implemented. "
                    "Request x402-engineer to add a read-only payment list endpoint. "
                    "Reconciler framework is ready; will activate once endpoint exists."
                ),
            )
            return

        if resp.status_code != 200:
            log.warning("reconciler.x402_error", status=resp.status_code, body=resp.text[:200])
            return

        orders = resp.json().get("orders", resp.json() if isinstance(resp.json(), list) else [])
        if not orders:
            log.info("reconciler.no_orders")
            return

        upserted = 0
        discrepancies = 0
        with engine.begin() as conn:
            for order in orders:
                order_id = order.get("id") or order.get("payment_order_id")
                if not order_id:
                    continue

                # Upsert into mirror
                stmt = mysql_insert(worker_db.payment_orders_mirror).values(
                    payment_order_id=order_id,
                    merchant_id=order.get("merchant_id", "unknown"),
                    amount_usdc_micro=int(order.get("amount_usdc_micro", 0)),
                    tx_hash=order.get("tx_hash"),
                    status=order.get("status", "unknown"),
                    confirmed_at=order.get("confirmed_at"),
                    updated_at=datetime.now(timezone.utc),
                )
                stmt = stmt.on_duplicate_key_update(
                    status=stmt.inserted.status,
                    tx_hash=stmt.inserted.tx_hash,
                    confirmed_at=stmt.inserted.confirmed_at,
                    updated_at=stmt.inserted.updated_at,
                )
                conn.execute(stmt)
                upserted += 1

                # Consistency check: confirmed orders should have a ledger credit
                if order.get("status") == "confirmed":
                    ledger_row = conn.execute(
                        select(worker_db.token_ledger_entries.c.id)
                        .where(
                            and_(
                                worker_db.token_ledger_entries.c.source == "x402_payment",
                                worker_db.token_ledger_entries.c.source_ref == order_id,
                            )
                        )
                    ).first()

                    if ledger_row is None:
                        log.warning(
                            "reconciler.missing_credit",
                            payment_order_id=order_id,
                            merchant_id=order.get("merchant_id"),
                            amount_usdc_micro=order.get("amount_usdc_micro"),
                            note="x402 confirmed but no ledger credit found — investigate",
                        )
                        discrepancies += 1
                    else:
                        # Update ledger_entry_id on mirror if not set
                        conn.execute(
                            update(worker_db.payment_orders_mirror)
                            .where(
                                worker_db.payment_orders_mirror.c.payment_order_id == order_id
                            )
                            .values(ledger_entry_id=ledger_row.id)
                        )

        log.info(
            "reconciler.done",
            upserted=upserted,
            discrepancies=discrepancies,
        )
    except Exception as e:  # noqa: BLE001
        log.error("reconciler.error", err=str(e))
    finally:
        engine.dispose()


# ── Job: invoice_generator ─────────────────────────────────────────────────────

def job_invoice_generator() -> None:
    """
    Run on the 1st of each month. Aggregates prior-month usage from the ledger
    and requests tables, generates draft invoice rows in the invoices /
    invoice_items tables.

    The token system owns the data model (subtotals, tax, line items). The
    actual PDF rendering and tax filing is delegated to the existing invoice
    system via legacy_invoice_id field (TOK-Q5: data handed to existing system).

    Idempotent: uses ON DUPLICATE KEY UPDATE so re-runs are safe.
    """
    log.info("invoice_generator.start")
    engine = worker_db.make_engine(DATABASE_URL)

    try:
        # Calculate the billing period: previous month
        today = datetime.now(timezone.utc).date()
        first_of_this_month = today.replace(day=1)
        first_of_prev_month = (first_of_this_month - timedelta(days=1)).replace(day=1)
        period_str = first_of_prev_month.strftime("%Y%m")
        period_start = datetime(
            first_of_prev_month.year, first_of_prev_month.month, 1, tzinfo=timezone.utc
        )
        period_end = datetime(
            first_of_this_month.year, first_of_this_month.month, 1, tzinfo=timezone.utc
        )

        log.info("invoice_generator.period", period=period_str)

        with engine.begin() as conn:
            # Get all active merchants
            merchants = conn.execute(
                select(worker_db.merchants.c.id, worker_db.merchants.c.name,
                       worker_db.merchants.c.legal_name, worker_db.merchants.c.tax_id,
                       worker_db.merchants.c.currency_pref)
                .where(worker_db.merchants.c.status == "active")
            ).fetchall()

            generated = 0
            for merchant in merchants:
                merchant_id = merchant.id

                # Check if invoice already exists for this period
                existing = conn.execute(
                    select(worker_db.invoices.c.id)
                    .where(
                        and_(
                            worker_db.invoices.c.merchant_id == merchant_id,
                            worker_db.invoices.c.period_yyyymm == period_str,
                        )
                    )
                ).first()
                if existing:
                    log.info("invoice_generator.skip_existing",
                             merchant_id=merchant_id, period=period_str)
                    continue

                # Aggregate AI usage cost from ledger (debit entries, source=ai_call)
                usage_agg = conn.execute(
                    select(
                        func.sum(worker_db.token_ledger_entries.c.amount_token).label("total_tokens"),
                        func.count(worker_db.token_ledger_entries.c.id).label("call_count"),
                    )
                    .where(
                        and_(
                            worker_db.token_ledger_entries.c.merchant_id == merchant_id,
                            worker_db.token_ledger_entries.c.type == "debit",
                            worker_db.token_ledger_entries.c.source == "ai_call",
                            worker_db.token_ledger_entries.c.created_at >= period_start,
                            worker_db.token_ledger_entries.c.created_at < period_end,
                        )
                    )
                ).first()

                total_tokens = int(usage_agg.total_tokens or 0)
                call_count = int(usage_agg.call_count or 0)

                if total_tokens == 0 and call_count == 0:
                    # No usage — skip (no invoice needed)
                    continue

                # Convert token cost to JPY via FX
                # 1 Token = 1 micro-USDC = 0.000001 USDC
                total_usdc = total_tokens / 1_000_000
                subtotal_jpy = int(round(total_usdc * FX_JPY_PER_USDC))
                tax_jpy = int(round(subtotal_jpy * float(TAX_RATE)))
                total_jpy = subtotal_jpy + tax_jpy

                # Generate invoice ID
                invoice_id = f"inv_{period_str}_{merchant_id[:8]}"

                conn.execute(
                    insert(worker_db.invoices).values(
                        id=invoice_id,
                        merchant_id=merchant_id,
                        period_yyyymm=period_str,
                        subtotal_jpy=subtotal_jpy,
                        tax_jpy=tax_jpy,
                        total_jpy=total_jpy,
                        fx_rate_usdc_to_jpy=Decimal(str(round(FX_JPY_PER_USDC, 4))),
                        status="draft",
                        created_at=datetime.now(timezone.utc),
                    )
                )

                # Line items: one for AI usage
                conn.execute(
                    insert(worker_db.invoice_items).values(
                        invoice_id=invoice_id,
                        item_type="ai_usage",
                        description=f"AI API usage ({call_count} calls, {total_tokens:,} tokens)",
                        quantity=Decimal(str(total_tokens)),
                        unit_price_jpy=None,
                        amount_jpy=subtotal_jpy,
                        metadata={"total_tokens": total_tokens, "call_count": call_count,
                                  "total_usdc": round(total_usdc, 6)},
                    )
                )

                generated += 1
                log.info(
                    "invoice_generator.created",
                    invoice_id=invoice_id,
                    merchant_id=merchant_id,
                    period=period_str,
                    total_jpy=total_jpy,
                    total_tokens=total_tokens,
                    note="PDF rendering delegated to existing invoice system via legacy_invoice_id",
                )

        log.info("invoice_generator.done", generated=generated, period=period_str)

    except Exception as e:  # noqa: BLE001
        log.error("invoice_generator.error", err=str(e))
    finally:
        engine.dispose()


# ── Job: usage_aggregator ──────────────────────────────────────────────────────

def job_usage_aggregator() -> None:
    """
    Every 5 minutes: aggregate requests table into usage_daily
    (REPLACE INTO — idempotent).
    Covers today and yesterday (to catch late-arriving rows).
    Supply data for Console /usage page.
    """
    log.info("usage_aggregator.start")
    engine = worker_db.make_engine(DATABASE_URL)

    try:
        today = datetime.now(timezone.utc).date()
        yesterday = today - timedelta(days=1)

        with engine.begin() as conn:
            for day in (yesterday, today):
                day_start = datetime(day.year, day.month, day.day, tzinfo=timezone.utc)
                day_end = day_start + timedelta(days=1)

                rows = conn.execute(
                    select(
                        worker_db.requests.c.merchant_id,
                        worker_db.requests.c.model,
                        func.count(worker_db.requests.c.id).label("request_count"),
                        func.sum(worker_db.requests.c.prompt_tokens).label("prompt_tokens"),
                        func.sum(worker_db.requests.c.completion_tokens).label("completion_tokens"),
                        func.sum(worker_db.requests.c.cost_token).label("total_cost_token"),
                        func.sum(worker_db.requests.c.cost_usdc_equiv_micro).label("total_cost_usdc_micro"),
                    )
                    .where(
                        and_(
                            worker_db.requests.c.created_at >= day_start,
                            worker_db.requests.c.created_at < day_end,
                        )
                    )
                    .group_by(
                        worker_db.requests.c.merchant_id,
                        worker_db.requests.c.model,
                    )
                ).fetchall()

                refreshed_at = datetime.now(timezone.utc)
                for row in rows:
                    stmt = mysql_insert(worker_db.usage_daily).values(
                        merchant_id=row.merchant_id,
                        day=day,
                        model=row.model,
                        request_count=int(row.request_count or 0),
                        prompt_tokens=int(row.prompt_tokens or 0),
                        completion_tokens=int(row.completion_tokens or 0),
                        total_cost_token=Decimal(str(row.total_cost_token or 0)),
                        total_cost_usdc_micro=int(row.total_cost_usdc_micro or 0),
                        refreshed_at=refreshed_at,
                    )
                    stmt = stmt.on_duplicate_key_update(
                        request_count=stmt.inserted.request_count,
                        prompt_tokens=stmt.inserted.prompt_tokens,
                        completion_tokens=stmt.inserted.completion_tokens,
                        total_cost_token=stmt.inserted.total_cost_token,
                        total_cost_usdc_micro=stmt.inserted.total_cost_usdc_micro,
                        refreshed_at=stmt.inserted.refreshed_at,
                    )
                    conn.execute(stmt)

        log.info("usage_aggregator.done")

    except Exception as e:  # noqa: BLE001
        log.error("usage_aggregator.error", err=str(e))
    finally:
        engine.dispose()


# ── Job: anomaly_detector ──────────────────────────────────────────────────────

def job_anomaly_detector() -> None:
    """
    Every 5 minutes: scan for anomalies and log structured alerts.

    Checks:
    1. Sudden spend spike: last-5-min token spend > ANOMALY_SPIKE_RATIO × hourly average.
    2. Low balance: any merchant with balance < ANOMALY_LOW_BALANCE_USDC equivalent.
    3. Unusual error rate: > 50% of recent requests in error state.

    Alerts are written to the audit_log table for visibility and to structured
    logs for ingestion by ops tooling (Datadog / CloudWatch).
    """
    log.info("anomaly_detector.start")
    engine = worker_db.make_engine(DATABASE_URL)

    try:
        now = datetime.now(timezone.utc)
        window_5min = now - timedelta(minutes=5)
        window_1h = now - timedelta(hours=1)
        low_balance_threshold_token = int(ANOMALY_LOW_BALANCE_USDC * 1_000_000)

        alerts: list[dict] = []

        with engine.begin() as conn:
            # ── Check 1: Spend spike per merchant ─────────────────────────
            # 5-minute spend
            recent_spend = conn.execute(
                select(
                    worker_db.token_ledger_entries.c.merchant_id,
                    func.sum(worker_db.token_ledger_entries.c.amount_token).label("tokens_5m"),
                )
                .where(
                    and_(
                        worker_db.token_ledger_entries.c.type == "debit",
                        worker_db.token_ledger_entries.c.created_at >= window_5min,
                    )
                )
                .group_by(worker_db.token_ledger_entries.c.merchant_id)
            ).fetchall()

            # Hourly baseline (per-minute average × 5 = expected 5-min spend)
            baseline_spend = conn.execute(
                select(
                    worker_db.token_ledger_entries.c.merchant_id,
                    (func.sum(worker_db.token_ledger_entries.c.amount_token) / 12).label("tokens_5m_avg"),
                )
                .where(
                    and_(
                        worker_db.token_ledger_entries.c.type == "debit",
                        worker_db.token_ledger_entries.c.created_at >= window_1h,
                        worker_db.token_ledger_entries.c.created_at < window_5min,
                    )
                )
                .group_by(worker_db.token_ledger_entries.c.merchant_id)
            ).fetchall()

            baseline_map = {r.merchant_id: float(r.tokens_5m_avg or 0) for r in baseline_spend}

            for row in recent_spend:
                tokens_5m = float(row.tokens_5m or 0)
                baseline = baseline_map.get(row.merchant_id, 0)
                if baseline > 0 and tokens_5m > ANOMALY_SPIKE_RATIO * baseline:
                    alert = {
                        "type": "spend_spike",
                        "merchant_id": row.merchant_id,
                        "tokens_5m": tokens_5m,
                        "baseline_5m": baseline,
                        "ratio": round(tokens_5m / baseline, 2),
                    }
                    alerts.append(alert)
                    log.warning("anomaly.spend_spike", **alert)

            # ── Check 2: Low balance ──────────────────────────────────────
            low_balances = conn.execute(
                select(
                    worker_db.balances.c.merchant_id,
                    worker_db.balances.c.balance_token,
                )
                .where(
                    and_(
                        worker_db.balances.c.balance_token < low_balance_threshold_token,
                        worker_db.balances.c.balance_token >= 0,
                    )
                )
            ).fetchall()

            for row in low_balances:
                usdc_equiv = float(row.balance_token) / 1_000_000
                alert = {
                    "type": "low_balance",
                    "merchant_id": row.merchant_id,
                    "balance_token": int(row.balance_token),
                    "usdc_equivalent": round(usdc_equiv, 4),
                    "threshold_usdc": ANOMALY_LOW_BALANCE_USDC,
                }
                alerts.append(alert)
                log.warning("anomaly.low_balance", **alert)

            # ── Check 3: High error rate ──────────────────────────────────
            error_counts = conn.execute(
                select(
                    worker_db.requests.c.merchant_id,
                    func.count(worker_db.requests.c.id).label("total"),
                    func.sum(
                        func.if_(
                            worker_db.requests.c.status.in_(
                                ["failed", "timeout", "rate_limited"]
                            ),
                            1, 0,
                        )
                    ).label("errors"),
                )
                .where(worker_db.requests.c.created_at >= window_5min)
                .group_by(worker_db.requests.c.merchant_id)
                .having(func.count(worker_db.requests.c.id) >= 5)  # only flag if ≥5 requests
            ).fetchall()

            for row in error_counts:
                total = int(row.total or 0)
                errors = int(row.errors or 0)
                if total > 0 and errors / total > 0.5:
                    alert = {
                        "type": "high_error_rate",
                        "merchant_id": row.merchant_id,
                        "total_requests": total,
                        "error_count": errors,
                        "error_rate": round(errors / total, 3),
                    }
                    alerts.append(alert)
                    log.warning("anomaly.high_error_rate", **alert)

            # Write alerts to audit_log
            for alert in alerts:
                conn.execute(
                    insert(worker_db.audit_log).values(
                        occurred_at=now,
                        actor_type="worker",
                        actor_id="anomaly_detector",
                        action="anomaly_detected",
                        resource_type="merchant",
                        resource_id=alert.get("merchant_id"),
                        after_state=alert,
                        metadata={"job": "anomaly_detector", "env": ENV},
                    )
                )

        log.info("anomaly_detector.done", alerts=len(alerts))

    except Exception as e:  # noqa: BLE001
        log.error("anomaly_detector.error", err=str(e))
    finally:
        engine.dispose()


# ── Scheduler setup ────────────────────────────────────────────────────────────

def _build_scheduler(mode: Optional[str] = None) -> BlockingScheduler:
    scheduler = BlockingScheduler(timezone="UTC")
    _mode = mode or os.environ.get("WORKER_MODE", "all")

    def _enabled(name: str) -> bool:
        if _mode == "all":
            return True
        return name in _mode.split(",")

    if _enabled("reconciler"):
        scheduler.add_job(
            job_reconciler,
            trigger="cron",
            minute=0,       # top of every hour
            id="reconciler",
            max_instances=1,
            coalesce=True,
            misfire_grace_time=300,
        )

    if _enabled("invoice_generator"):
        scheduler.add_job(
            job_invoice_generator,
            trigger="cron",
            day=1, hour=1, minute=0,  # 1st of month at 01:00 UTC
            id="invoice_generator",
            max_instances=1,
            coalesce=True,
            misfire_grace_time=3600,
        )

    if _enabled("usage_aggregator"):
        scheduler.add_job(
            job_usage_aggregator,
            trigger="interval",
            seconds=300,  # every 5 minutes
            id="usage_aggregator",
            max_instances=1,
            coalesce=True,
            misfire_grace_time=120,
        )

    if _enabled("anomaly_detector"):
        scheduler.add_job(
            job_anomaly_detector,
            trigger="interval",
            seconds=300,  # every 5 minutes
            id="anomaly_detector",
            max_instances=1,
            coalesce=True,
            misfire_grace_time=120,
        )

    return scheduler


def main() -> None:
    log.info("startup", env=ENV, mode=WORKER_MODE, db=DATABASE_URL.split("@")[-1])

    scheduler = _build_scheduler()
    log.info("scheduler.jobs", count=len(scheduler.get_jobs()),
             job_ids=[j.id for j in scheduler.get_jobs()])

    def _handle_signal(signum, frame):
        log.info("shutdown", signal=signum)
        scheduler.shutdown(wait=False)

    import signal as _signal
    _signal.signal(_signal.SIGTERM, _handle_signal)
    _signal.signal(_signal.SIGINT, _handle_signal)

    try:
        scheduler.start()
    except (KeyboardInterrupt, SystemExit):
        log.info("worker.exited")


if __name__ == "__main__":
    main()
