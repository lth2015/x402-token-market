-- =====================================================================
-- Token System · Database Schema
-- Engine: Aurora MySQL 8.0
-- Charset: utf8mb4 / Collation: utf8mb4_0900_ai_ci
-- Timezone: UTC
-- App users:
--   token_app  (no UPDATE/DELETE on token_ledger_entries / audit_log)
--   token_ro   (SELECT only)
-- =====================================================================

SET sql_notes = 0;

-- =====================================================================
-- 1. merchants
-- =====================================================================
CREATE TABLE IF NOT EXISTS merchants (
    id                      VARCHAR(40)  NOT NULL,                    -- mch_<ULID>
    name                    VARCHAR(255) NOT NULL,
    legal_name              VARCHAR(255) NULL,
    tax_id                  VARCHAR(64)  NULL,                         -- 法人番号
    -- PII 字段：应用层 AES-256-GCM 加密，KMS data key envelope
    contact_email_enc       VARBINARY(512) NULL,
    contact_phone_enc       VARBINARY(256) NULL,
    billing_address_enc     VARBINARY(1024) NULL,
    currency_pref           VARCHAR(8)   NOT NULL DEFAULT 'JPY',
    status                  VARCHAR(16)  NOT NULL DEFAULT 'pending',
    crm_external_id         VARCHAR(64)  NULL,
    metadata                JSON         NOT NULL,
    created_at              DATETIME(6)  NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
    updated_at              DATETIME(6)  NOT NULL DEFAULT CURRENT_TIMESTAMP(6)
                                          ON UPDATE CURRENT_TIMESTAMP(6),
    CONSTRAINT chk_merchants_status CHECK (status IN
        ('pending','active','suspended','terminated')),
    PRIMARY KEY (id),
    UNIQUE KEY uq_merchants_crm (crm_external_id),
    KEY idx_merchants_status (status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- =====================================================================
-- 2. users : Console 登录用户（既有 SSO 同步）
-- =====================================================================
CREATE TABLE IF NOT EXISTS users (
    id                  VARCHAR(40)  NOT NULL,                        -- usr_<ULID>
    sso_subject_id      VARCHAR(128) NOT NULL,                        -- OIDC sub
    email_enc           VARBINARY(512) NOT NULL,
    display_name        VARCHAR(128) NULL,
    created_at          DATETIME(6)  NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
    last_login_at       DATETIME(6)  NULL,
    PRIMARY KEY (id),
    UNIQUE KEY uq_users_sso (sso_subject_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

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
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- =====================================================================
-- 3. projects (子账户/项目)
-- =====================================================================
CREATE TABLE IF NOT EXISTS projects (
    id                          VARCHAR(40)  NOT NULL,                -- prj_<ULID>
    merchant_id                 VARCHAR(40)  NOT NULL,
    name                        VARCHAR(128) NOT NULL,
    description                 VARCHAR(512) NULL,
    monthly_limit_usdc_micro    BIGINT       NULL,
    daily_limit_usdc_micro      BIGINT       NULL,
    status                      VARCHAR(16)  NOT NULL DEFAULT 'active',
    created_at                  DATETIME(6)  NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
    PRIMARY KEY (id),
    UNIQUE KEY uq_projects_merchant_name (merchant_id, name),
    KEY idx_projects_merchant (merchant_id),
    CONSTRAINT chk_projects_status CHECK (status IN ('active','suspended','archived')),
    CONSTRAINT fk_projects_merchant FOREIGN KEY (merchant_id) REFERENCES merchants(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- =====================================================================
-- 4. agent_keys (API Key)
-- =====================================================================
CREATE TABLE IF NOT EXISTS agent_keys (
    id                      VARCHAR(40)   NOT NULL,                   -- agk_<ULID>
    project_id              VARCHAR(40)   NOT NULL,
    key_public              VARCHAR(64)   NOT NULL,                   -- e.g. ak_abc1234...
    key_secret_hash         CHAR(64)      NOT NULL,                   -- HMAC-SHA256 hex
    label                   VARCHAR(128)  NULL,
    allowed_models          JSON          NOT NULL,                   -- ["claude-*","gpt-4.1"]
    rate_limit_rpm          INT           NOT NULL DEFAULT 600,
    rate_limit_tpm          BIGINT        NOT NULL DEFAULT 100000000,
    daily_limit_usdc_micro  BIGINT        NULL,
    status                  VARCHAR(16)   NOT NULL DEFAULT 'active',
    created_by_user_id      VARCHAR(40)   NULL,
    created_at              DATETIME(6)   NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
    last_used_at            DATETIME(6)   NULL,
    revoked_at              DATETIME(6)   NULL,
    CONSTRAINT chk_agent_keys_status CHECK (status IN ('active','revoked','frozen')),
    PRIMARY KEY (id),
    UNIQUE KEY uq_agent_keys_public (key_public),
    KEY idx_agent_keys_project (project_id),
    KEY idx_agent_keys_status  (status),
    CONSTRAINT fk_agent_keys_project FOREIGN KEY (project_id) REFERENCES projects(id),
    CONSTRAINT fk_agent_keys_user    FOREIGN KEY (created_by_user_id) REFERENCES users(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- =====================================================================
-- 5. balances : 物化余额缓存（真相在 token_ledger_entries）
-- =====================================================================
CREATE TABLE IF NOT EXISTS balances (
    merchant_id             VARCHAR(40)    NOT NULL,
    balance_token           DECIMAL(30,0)  NOT NULL DEFAULT 0,
    on_hold_token           DECIMAL(30,0)  NOT NULL DEFAULT 0,
    last_ledger_entry_id    BIGINT         NULL,
    last_updated_at         DATETIME(6)    NOT NULL DEFAULT CURRENT_TIMESTAMP(6)
                                              ON UPDATE CURRENT_TIMESTAMP(6),
    CONSTRAINT chk_balances_nonneg CHECK (balance_token >= 0 AND on_hold_token >= 0),
    PRIMARY KEY (merchant_id),
    CONSTRAINT fk_balances_merchant FOREIGN KEY (merchant_id) REFERENCES merchants(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- =====================================================================
-- 6. token_ledger_entries : 账本（append-only, partitioned by month）
-- =====================================================================
CREATE TABLE IF NOT EXISTS token_ledger_entries (
    id                  BIGINT         NOT NULL AUTO_INCREMENT,
    merchant_id         VARCHAR(40)    NOT NULL,
    project_id          VARCHAR(40)    NULL,
    agent_key_id        VARCHAR(40)    NULL,
    type                VARCHAR(16)    NOT NULL,
    amount_token        DECIMAL(30,0)  NOT NULL,
    balance_after       DECIMAL(30,0)  NOT NULL,
    source              VARCHAR(24)    NOT NULL,
    source_ref          VARCHAR(64)    NULL,
    request_id          VARCHAR(40)    NULL,
    description         VARCHAR(255)   NULL,
    trace_id            VARCHAR(64)    NULL,
    created_at          DATETIME(6)    NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
    CONSTRAINT chk_ledger_type CHECK (type IN ('credit','debit','refund','adjustment')),
    CONSTRAINT chk_ledger_source CHECK (source IN
        ('x402_payment','ai_call','refund','admin_adjust','promo','correction')),
    CONSTRAINT chk_ledger_amount CHECK (amount_token > 0),
    PRIMARY KEY (id, created_at),
    KEY idx_ledger_merchant_time (merchant_id, created_at),
    KEY idx_ledger_source        (source, source_ref),
    KEY idx_ledger_request       (request_id)
)
ENGINE=InnoDB
DEFAULT CHARSET=utf8mb4
PARTITION BY RANGE COLUMNS(created_at) (
    PARTITION p2026_05 VALUES LESS THAN ('2026-06-01'),
    PARTITION p2026_06 VALUES LESS THAN ('2026-07-01'),
    PARTITION p2026_07 VALUES LESS THAN ('2026-08-01'),
    PARTITION p2026_08 VALUES LESS THAN ('2026-09-01'),
    PARTITION p_future VALUES LESS THAN (MAXVALUE)
);

-- REVOKE UPDATE, DELETE ON token_qa.token_ledger_entries FROM 'token_app'@'%';

-- =====================================================================
-- 7. requests : AI 调用记录（每月分区）
-- =====================================================================
CREATE TABLE IF NOT EXISTS requests (
    id                          VARCHAR(40)    NOT NULL,               -- req_<ULID>
    agent_key_id                VARCHAR(40)    NOT NULL,
    merchant_id                 VARCHAR(40)    NOT NULL,
    project_id                  VARCHAR(40)    NULL,
    model                       VARCHAR(64)    NOT NULL,
    provider                    VARCHAR(24)    NOT NULL,                -- anthropic / openai / xai / google
    prompt_tokens               INT            NOT NULL DEFAULT 0,
    completion_tokens           INT            NOT NULL DEFAULT 0,
    cached_input_tokens         INT            NOT NULL DEFAULT 0,
    cost_token                  DECIMAL(30,0)  NOT NULL DEFAULT 0,
    cost_usdc_equiv_micro       BIGINT         NOT NULL DEFAULT 0,
    status                      VARCHAR(24)    NOT NULL,
    error_class                 VARCHAR(64)    NULL,
    error_message_truncated     VARCHAR(512)   NULL,
    latency_ms                  INT            NULL,
    trace_id                    VARCHAR(64)    NULL,
    request_hash                CHAR(64)       NULL,
    metadata                    JSON           NOT NULL,
    created_at                  DATETIME(6)    NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
    CONSTRAINT chk_requests_status CHECK (status IN
        ('succeeded','failed','timeout','rate_limited','insufficient_balance')),
    PRIMARY KEY (id, created_at),
    KEY idx_requests_agent_time    (agent_key_id, created_at),
    KEY idx_requests_merchant_time (merchant_id, created_at),
    KEY idx_requests_model_time    (model, created_at),
    KEY idx_requests_trace         (trace_id)
)
ENGINE=InnoDB
DEFAULT CHARSET=utf8mb4
PARTITION BY RANGE COLUMNS(created_at) (
    PARTITION p2026_05 VALUES LESS THAN ('2026-06-01'),
    PARTITION p2026_06 VALUES LESS THAN ('2026-07-01'),
    PARTITION p2026_07 VALUES LESS THAN ('2026-08-01'),
    PARTITION p_future VALUES LESS THAN (MAXVALUE)
);

-- =====================================================================
-- 8. payment_orders_mirror : 镜像 X402 订单（本地 JOIN）
-- =====================================================================
CREATE TABLE IF NOT EXISTS payment_orders_mirror (
    payment_order_id        VARCHAR(40)    NOT NULL,
    merchant_id             VARCHAR(40)    NOT NULL,
    amount_usdc_micro       BIGINT         NOT NULL,
    tokens_credited         DECIMAL(30,0)  NULL,
    tx_hash                 VARCHAR(96)    NULL,
    status                  VARCHAR(20)    NOT NULL,
    confirmed_at            DATETIME(6)    NULL,
    ledger_entry_id         BIGINT         NULL,
    created_at              DATETIME(6)    NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
    updated_at              DATETIME(6)    NOT NULL DEFAULT CURRENT_TIMESTAMP(6)
                                              ON UPDATE CURRENT_TIMESTAMP(6),
    PRIMARY KEY (payment_order_id),
    KEY idx_pomirror_merchant (merchant_id, created_at),
    KEY idx_pomirror_status   (status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- =====================================================================
-- 9. model_rates : 模型单价（time-versioned）
-- =====================================================================
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
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- =====================================================================
-- 10. packages & subscriptions
-- =====================================================================
CREATE TABLE IF NOT EXISTS packages (
    id                      VARCHAR(40)    NOT NULL,                    -- pkg_<ULID>
    name                    VARCHAR(64)    NOT NULL,
    monthly_fee_jpy         BIGINT         NOT NULL DEFAULT 0,
    included_tokens         DECIMAL(30,0)  NOT NULL,
    overage_multiplier      DECIMAL(5,2)   NOT NULL DEFAULT 1.0,
    status                  VARCHAR(16)    NOT NULL DEFAULT 'active',
    created_at              DATETIME(6)    NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
    PRIMARY KEY (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS merchant_subscriptions (
    merchant_id             VARCHAR(40)    NOT NULL,
    package_id              VARCHAR(40)    NOT NULL,
    started_at              DATETIME(6)    NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
    ended_at                DATETIME(6)    NULL,
    PRIMARY KEY (merchant_id, started_at),
    KEY idx_subscriptions_pkg (package_id),
    CONSTRAINT fk_subscriptions_merchant FOREIGN KEY (merchant_id) REFERENCES merchants(id),
    CONSTRAINT fk_subscriptions_package FOREIGN KEY (package_id) REFERENCES packages(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- =====================================================================
-- 11. invoices (PDF 由既有发票系统生成；本表只存 metadata + 引用)
-- =====================================================================
CREATE TABLE IF NOT EXISTS invoices (
    id                      VARCHAR(40)    NOT NULL,                    -- inv_YYYYMM_<seq>
    merchant_id             VARCHAR(40)    NOT NULL,
    period_yyyymm           CHAR(6)        NOT NULL,                    -- '202605'
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
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS invoice_items (
    id                      BIGINT         NOT NULL AUTO_INCREMENT,
    invoice_id              VARCHAR(40)    NOT NULL,
    item_type               VARCHAR(32)    NOT NULL,
    description             VARCHAR(255)   NOT NULL,
    quantity                DECIMAL(20,4)  NULL,
    unit_price_jpy          BIGINT         NULL,
    amount_jpy              BIGINT         NOT NULL,
    metadata                JSON           NULL,                         -- 链上 tx_hash 列表
    PRIMARY KEY (id),
    KEY idx_invoice_items_invoice (invoice_id),
    CONSTRAINT fk_invoice_items_invoice FOREIGN KEY (invoice_id) REFERENCES invoices(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- =====================================================================
-- 12. webhook_subscriptions
-- =====================================================================
CREATE TABLE IF NOT EXISTS webhook_subscriptions (
    id                      VARCHAR(40)    NOT NULL,
    merchant_id             VARCHAR(40)    NOT NULL,
    url                     VARCHAR(512)   NOT NULL,
    events                  JSON           NOT NULL,                     -- ["balance.low","payment.confirmed"]
    secret_enc              VARBINARY(512) NOT NULL,
    status                  VARCHAR(16)    NOT NULL DEFAULT 'active',
    created_at              DATETIME(6)    NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
    PRIMARY KEY (id),
    KEY idx_webhook_sub_merchant (merchant_id),
    CONSTRAINT fk_webhook_sub_merchant FOREIGN KEY (merchant_id) REFERENCES merchants(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- =====================================================================
-- 13. audit_log (append-only, partitioned)
-- =====================================================================
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
DEFAULT CHARSET=utf8mb4
PARTITION BY RANGE COLUMNS(occurred_at) (
    PARTITION p2026_05 VALUES LESS THAN ('2026-06-01'),
    PARTITION p2026_06 VALUES LESS THAN ('2026-07-01'),
    PARTITION p_future VALUES LESS THAN (MAXVALUE)
);

-- =====================================================================
-- 14. usage_daily : 汇总表（worker 每 5min REPLACE INTO）
-- 替代 PG 的 materialized view；MySQL 用普通表 + 定时刷新
-- =====================================================================
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
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- =====================================================================
-- 15. Seed
-- =====================================================================
INSERT INTO packages (id, name, monthly_fee_jpy, included_tokens) VALUES
    ('pkg_trial',      'Trial',      0,      1000000),
    ('pkg_growth',     'Growth',     50000,  50000000),
    ('pkg_enterprise', 'Enterprise', 0,      500000000)             -- 商谈定价
ON DUPLICATE KEY UPDATE name = VALUES(name);

INSERT INTO model_rates (model, provider, rate_per_1k_input, rate_per_1k_output) VALUES
    ('claude-opus-4-7',     'anthropic', 15000, 75000),
    ('claude-sonnet-4-6',   'anthropic',  3000, 15000),
    ('claude-haiku-4-5',    'anthropic',   800,  4000),
    ('gpt-4.1',             'openai',    10000, 30000),
    ('gemini-2.5-pro',      'google',     8000, 24000);

SET sql_notes = 1;
