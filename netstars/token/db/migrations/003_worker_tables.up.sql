-- Migration 003 · Add tables missing from 001_init that the worker and API need
--
-- Tables added:
--   users, merchant_users          — Console SSO login
--   model_rates                    — AI model pricing lookup
--   packages, merchant_subscriptions — subscription tiers
--   invoices, invoice_items        — monthly billing (worker: invoice_generator job)
--   webhook_subscriptions          — event webhooks
--   audit_log                      — append-only ops log (worker: anomaly_detector job)
--   usage_daily                    — materialized usage cache (worker: usage_aggregator job)
--
-- All DDL is idempotent (CREATE TABLE IF NOT EXISTS).
-- Seed rows use ON DUPLICATE KEY UPDATE to be re-run-safe.

-- ── users ─────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS users (
    id                  VARCHAR(40)    NOT NULL,
    sso_subject_id      VARCHAR(128)   NOT NULL,
    email_enc           VARBINARY(512) NOT NULL,
    display_name        VARCHAR(128)   NULL,
    created_at          DATETIME(6)    NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
    last_login_at       DATETIME(6)    NULL,
    PRIMARY KEY (id),
    UNIQUE KEY uq_users_sso (sso_subject_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- ── merchant_users ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS merchant_users (
    merchant_id     VARCHAR(40)  NOT NULL,
    user_id         VARCHAR(40)  NOT NULL,
    role            VARCHAR(16)  NOT NULL,
    invited_at      DATETIME(6)  NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
    accepted_at     DATETIME(6)  NULL,
    CONSTRAINT chk_merchant_users_role CHECK (role IN
        ('owner','admin','developer','finance','readonly')),
    PRIMARY KEY (merchant_id, user_id),
    KEY idx_merchant_users_user (user_id),
    CONSTRAINT fk_merchant_users_merchant FOREIGN KEY (merchant_id)
        REFERENCES merchants(id),
    CONSTRAINT fk_merchant_users_user FOREIGN KEY (user_id)
        REFERENCES users(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- ── model_rates ───────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS model_rates (
    id                          BIGINT         NOT NULL AUTO_INCREMENT,
    model                       VARCHAR(64)    NOT NULL,
    provider                    VARCHAR(24)    NOT NULL,
    rate_per_1k_input           DECIMAL(20,0)  NOT NULL,
    rate_per_1k_output          DECIMAL(20,0)  NOT NULL,
    rate_per_1k_cached_input    DECIMAL(20,0)  NULL,
    effective_from              DATETIME(6)    NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
    effective_to                DATETIME(6)    NULL,
    created_at                  DATETIME(6)    NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
    PRIMARY KEY (id),
    UNIQUE KEY uq_model_rates_eff (model, effective_from),
    KEY idx_model_rates_lookup    (model, effective_from)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- ── packages ──────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS packages (
    id                      VARCHAR(40)    NOT NULL,
    name                    VARCHAR(64)    NOT NULL,
    monthly_fee_jpy         BIGINT         NOT NULL DEFAULT 0,
    included_tokens         DECIMAL(30,0)  NOT NULL,
    overage_multiplier      DECIMAL(5,2)   NOT NULL DEFAULT 1.0,
    status                  VARCHAR(16)    NOT NULL DEFAULT 'active',
    created_at              DATETIME(6)    NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
    PRIMARY KEY (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- ── merchant_subscriptions ────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS merchant_subscriptions (
    merchant_id             VARCHAR(40)    NOT NULL,
    package_id              VARCHAR(40)    NOT NULL,
    started_at              DATETIME(6)    NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
    ended_at                DATETIME(6)    NULL,
    PRIMARY KEY (merchant_id, started_at),
    KEY idx_subscriptions_pkg (package_id),
    CONSTRAINT fk_subscriptions_merchant FOREIGN KEY (merchant_id) REFERENCES merchants(id),
    CONSTRAINT fk_subscriptions_package  FOREIGN KEY (package_id)  REFERENCES packages(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- ── invoices ─────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS invoices (
    id                      VARCHAR(40)    NOT NULL,
    merchant_id             VARCHAR(40)    NOT NULL,
    period_yyyymm           CHAR(6)        NOT NULL,
    subtotal_jpy            BIGINT         NOT NULL,
    tax_jpy                 BIGINT         NOT NULL,
    total_jpy               BIGINT         NOT NULL,
    fx_rate_usdc_to_jpy     DECIMAL(10,4)  NOT NULL,
    legacy_invoice_id       VARCHAR(64)    NULL,
    pdf_url                 VARCHAR(512)   NULL,
    csv_url                 VARCHAR(512)   NULL,
    status                  VARCHAR(16)    NOT NULL DEFAULT 'draft',
    issued_at               DATETIME(6)    NULL,
    paid_at                 DATETIME(6)    NULL,
    created_at              DATETIME(6)    NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
    CONSTRAINT chk_invoices_status CHECK (status IN ('draft','issued','paid','void')),
    PRIMARY KEY (id),
    UNIQUE KEY uq_invoices_merchant_period (merchant_id, period_yyyymm),
    CONSTRAINT fk_invoices_merchant FOREIGN KEY (merchant_id) REFERENCES merchants(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- ── invoice_items ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS invoice_items (
    id                      BIGINT         NOT NULL AUTO_INCREMENT,
    invoice_id              VARCHAR(40)    NOT NULL,
    item_type               VARCHAR(32)    NOT NULL,
    description             VARCHAR(255)   NOT NULL,
    quantity                DECIMAL(20,4)  NULL,
    unit_price_jpy          BIGINT         NULL,
    amount_jpy              BIGINT         NOT NULL,
    metadata                JSON           NULL,
    PRIMARY KEY (id),
    KEY idx_invoice_items_invoice (invoice_id),
    CONSTRAINT fk_invoice_items_invoice FOREIGN KEY (invoice_id) REFERENCES invoices(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- ── webhook_subscriptions ─────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS webhook_subscriptions (
    id                      VARCHAR(40)    NOT NULL,
    merchant_id             VARCHAR(40)    NOT NULL,
    url                     VARCHAR(512)   NOT NULL,
    events                  JSON           NOT NULL,
    secret_enc              VARBINARY(512) NOT NULL,
    status                  VARCHAR(16)    NOT NULL DEFAULT 'active',
    created_at              DATETIME(6)    NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
    PRIMARY KEY (id),
    KEY idx_webhook_sub_merchant (merchant_id),
    CONSTRAINT fk_webhook_sub_merchant FOREIGN KEY (merchant_id) REFERENCES merchants(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- ── audit_log (worker: anomaly_detector writes here) ─────────────────────────
-- Partitioned by month so the anomaly detector's inserts never cause table scans.
CREATE TABLE IF NOT EXISTS audit_log (
    id                  BIGINT         NOT NULL AUTO_INCREMENT,
    occurred_at         DATETIME(6)    NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
    actor_type          VARCHAR(16)    NOT NULL,
    actor_id            VARCHAR(64)    NULL,
    action              VARCHAR(64)    NOT NULL,
    resource_type       VARCHAR(40)    NOT NULL,
    resource_id         VARCHAR(64)    NULL,
    before_state        JSON           NULL,
    after_state         JSON           NULL,
    trace_id            VARCHAR(64)    NULL,
    client_ip           VARCHAR(45)    NULL,
    user_agent          VARCHAR(255)   NULL,
    metadata            JSON           NOT NULL,
    PRIMARY KEY (id, occurred_at),
    KEY idx_audit_actor    (actor_id, occurred_at),
    KEY idx_audit_resource (resource_type, resource_id, occurred_at)
)
ENGINE=InnoDB
DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci
PARTITION BY RANGE COLUMNS(occurred_at) (
    PARTITION p2026_05 VALUES LESS THAN ('2026-06-01'),
    PARTITION p2026_06 VALUES LESS THAN ('2026-07-01'),
    PARTITION p2026_07 VALUES LESS THAN ('2026-08-01'),
    PARTITION p2026_08 VALUES LESS THAN ('2026-09-01'),
    PARTITION p_future VALUES LESS THAN (MAXVALUE)
);

-- ── usage_daily (worker: usage_aggregator REPLACE INTO here) ─────────────────
CREATE TABLE IF NOT EXISTS usage_daily (
    merchant_id             VARCHAR(40)    NOT NULL,
    day                     DATE           NOT NULL,
    model                   VARCHAR(64)    NOT NULL,
    request_count           BIGINT         NOT NULL,
    prompt_tokens           BIGINT         NOT NULL,
    completion_tokens       BIGINT         NOT NULL,
    total_cost_token        DECIMAL(30,0)  NOT NULL,
    total_cost_usdc_micro   BIGINT         NOT NULL,
    refreshed_at            DATETIME(6)    NOT NULL DEFAULT CURRENT_TIMESTAMP(6)
                                              ON UPDATE CURRENT_TIMESTAMP(6),
    PRIMARY KEY (merchant_id, day, model)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- ── Seed: model_rates + packages ──────────────────────────────────────────────
INSERT INTO packages (id, name, monthly_fee_jpy, included_tokens) VALUES
    ('pkg_trial',      'Trial',      0,      1000000),
    ('pkg_growth',     'Growth',     50000,  50000000),
    ('pkg_enterprise', 'Enterprise', 0,      500000000)
ON DUPLICATE KEY UPDATE name = VALUES(name);

INSERT INTO model_rates (model, provider, rate_per_1k_input, rate_per_1k_output) VALUES
    ('claude-opus-4-7',     'anthropic', 15000, 75000),
    ('claude-sonnet-4-6',   'anthropic',  3000, 15000),
    ('claude-haiku-4-5',    'anthropic',   800,  4000),
    ('gpt-4.1',             'openai',    10000, 30000),
    ('gemini-2.5-pro',      'google',     8000, 24000)
ON DUPLICATE KEY UPDATE
    rate_per_1k_input  = VALUES(rate_per_1k_input),
    rate_per_1k_output = VALUES(rate_per_1k_output);
