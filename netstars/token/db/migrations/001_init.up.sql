-- Migration 001 · Token initial schema (v0.2.0)
-- Simplified for local dev / single-file migrate:
--   - No PARTITION BY (added in 002 when needed)
--   - Application-layer non-negative check in LedgerService;
--     DB still has chk_balances_nonneg as safety net
--   - Seed: 1 demo merchant + project + agent_key so SDK quickstart works immediately

CREATE TABLE IF NOT EXISTS merchants (
    id                      VARCHAR(40)    NOT NULL,
    name                    VARCHAR(255)   NOT NULL,
    legal_name              VARCHAR(255)   NULL,
    tax_id                  VARCHAR(64)    NULL,
    contact_email_enc       VARBINARY(512) NULL,
    contact_phone_enc       VARBINARY(256) NULL,
    billing_address_enc     VARBINARY(1024) NULL,
    currency_pref           VARCHAR(8)     NOT NULL DEFAULT 'JPY',
    status                  VARCHAR(16)    NOT NULL DEFAULT 'active',
    crm_external_id         VARCHAR(64)    NULL,
    metadata                JSON           NOT NULL,
    created_at              DATETIME(6)    NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
    updated_at              DATETIME(6)    NOT NULL DEFAULT CURRENT_TIMESTAMP(6)
                                            ON UPDATE CURRENT_TIMESTAMP(6),
    CONSTRAINT chk_merchants_status CHECK (status IN
        ('pending','active','suspended','terminated')),
    PRIMARY KEY (id),
    UNIQUE KEY uq_merchants_crm (crm_external_id),
    KEY idx_merchants_status (status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE IF NOT EXISTS projects (
    id                       VARCHAR(40)   NOT NULL,
    merchant_id              VARCHAR(40)   NOT NULL,
    name                     VARCHAR(128)  NOT NULL,
    description              VARCHAR(512)  NULL,
    monthly_limit_usdc_micro BIGINT        NULL,
    daily_limit_usdc_micro   BIGINT        NULL,
    status                   VARCHAR(16)   NOT NULL DEFAULT 'active',
    created_at               DATETIME(6)   NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
    PRIMARY KEY (id),
    UNIQUE KEY uq_projects_merchant_name (merchant_id, name),
    KEY idx_projects_merchant (merchant_id),
    CONSTRAINT fk_projects_merchant FOREIGN KEY (merchant_id) REFERENCES merchants(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE IF NOT EXISTS agent_keys (
    id                       VARCHAR(40)   NOT NULL,
    project_id               VARCHAR(40)   NOT NULL,
    key_public               VARCHAR(64)   NOT NULL,
    key_secret_hash          CHAR(64)      NOT NULL,
    label                    VARCHAR(128)  NULL,
    allowed_models           JSON          NOT NULL,
    rate_limit_rpm           INT           NOT NULL DEFAULT 600,
    rate_limit_tpm           BIGINT        NOT NULL DEFAULT 100000000,
    daily_limit_usdc_micro   BIGINT        NULL,
    status                   VARCHAR(16)   NOT NULL DEFAULT 'active',
    created_by_user_id       VARCHAR(40)   NULL,
    created_at               DATETIME(6)   NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
    last_used_at             DATETIME(6)   NULL,
    revoked_at               DATETIME(6)   NULL,
    PRIMARY KEY (id),
    UNIQUE KEY uq_agent_keys_public (key_public),
    KEY idx_agent_keys_project (project_id),
    KEY idx_agent_keys_status  (status),
    CONSTRAINT fk_agent_keys_project FOREIGN KEY (project_id) REFERENCES projects(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE IF NOT EXISTS balances (
    merchant_id              VARCHAR(40)    NOT NULL,
    balance_token            DECIMAL(30,0)  NOT NULL DEFAULT 0,
    on_hold_token            DECIMAL(30,0)  NOT NULL DEFAULT 0,
    last_ledger_entry_id     BIGINT         NULL,
    last_updated_at          DATETIME(6)    NOT NULL DEFAULT CURRENT_TIMESTAMP(6)
                                              ON UPDATE CURRENT_TIMESTAMP(6),
    CONSTRAINT chk_balances_nonneg CHECK (balance_token >= 0 AND on_hold_token >= 0),
    PRIMARY KEY (merchant_id),
    CONSTRAINT fk_balances_merchant FOREIGN KEY (merchant_id) REFERENCES merchants(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE IF NOT EXISTS token_ledger_entries (
    id                       BIGINT         NOT NULL AUTO_INCREMENT,
    merchant_id              VARCHAR(40)    NOT NULL,
    project_id               VARCHAR(40)    NULL,
    agent_key_id             VARCHAR(40)    NULL,
    type                     VARCHAR(16)    NOT NULL,
    amount_token             DECIMAL(30,0)  NOT NULL,
    balance_after            DECIMAL(30,0)  NOT NULL,
    source                   VARCHAR(24)    NOT NULL,
    source_ref               VARCHAR(64)    NULL,
    request_id               VARCHAR(40)    NULL,
    description              VARCHAR(255)   NULL,
    trace_id                 VARCHAR(64)    NULL,
    created_at               DATETIME(6)    NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
    CONSTRAINT chk_ledger_type   CHECK (type IN ('credit','debit','refund','adjustment')),
    CONSTRAINT chk_ledger_source CHECK (source IN
        ('x402_payment','ai_call','refund','admin_adjust','promo','correction')),
    CONSTRAINT chk_ledger_amount CHECK (amount_token > 0),
    PRIMARY KEY (id),
    KEY idx_ledger_merchant_time (merchant_id, created_at),
    KEY idx_ledger_source        (source, source_ref),
    KEY idx_ledger_request       (request_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE IF NOT EXISTS payment_orders_mirror (
    payment_order_id         VARCHAR(40)    NOT NULL,
    merchant_id              VARCHAR(40)    NOT NULL,
    amount_usdc_micro        BIGINT         NOT NULL,
    tokens_credited          DECIMAL(30,0)  NULL,
    tx_hash                  VARCHAR(96)    NULL,
    status                   VARCHAR(20)    NOT NULL,
    confirmed_at             DATETIME(6)    NULL,
    ledger_entry_id          BIGINT         NULL,
    created_at               DATETIME(6)    NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
    updated_at               DATETIME(6)    NOT NULL DEFAULT CURRENT_TIMESTAMP(6)
                                              ON UPDATE CURRENT_TIMESTAMP(6),
    PRIMARY KEY (payment_order_id),
    KEY idx_pomirror_merchant (merchant_id, created_at),
    KEY idx_pomirror_status   (status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE IF NOT EXISTS requests (
    id                       VARCHAR(40)    NOT NULL,
    agent_key_id             VARCHAR(40)    NOT NULL,
    merchant_id              VARCHAR(40)    NOT NULL,
    project_id               VARCHAR(40)    NULL,
    model                    VARCHAR(64)    NOT NULL,
    provider                 VARCHAR(24)    NOT NULL,
    prompt_tokens            INT            NOT NULL DEFAULT 0,
    completion_tokens        INT            NOT NULL DEFAULT 0,
    cached_input_tokens      INT            NOT NULL DEFAULT 0,
    cost_token               DECIMAL(30,0)  NOT NULL DEFAULT 0,
    cost_usdc_equiv_micro    BIGINT         NOT NULL DEFAULT 0,
    status                   VARCHAR(24)    NOT NULL,
    error_class              VARCHAR(64)    NULL,
    error_message_truncated  VARCHAR(512)   NULL,
    latency_ms               INT            NULL,
    trace_id                 VARCHAR(64)    NULL,
    request_hash             CHAR(64)       NULL,
    metadata                 JSON           NOT NULL,
    created_at               DATETIME(6)    NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
    PRIMARY KEY (id),
    KEY idx_requests_agent_time    (agent_key_id, created_at),
    KEY idx_requests_merchant_time (merchant_id, created_at),
    KEY idx_requests_model_time    (model, created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- ── Seed: 1 demo merchant + project + agent_key so SDK quickstart works
INSERT INTO merchants (id, name, status, metadata) VALUES
    ('mch_demo', 'Demo Merchant Co.', 'active', JSON_OBJECT())
ON DUPLICATE KEY UPDATE name = VALUES(name);

INSERT INTO projects (id, merchant_id, name, status) VALUES
    ('prj_demo', 'mch_demo', 'default', 'active')
ON DUPLICATE KEY UPDATE name = VALUES(name);

INSERT INTO agent_keys (id, project_id, key_public, key_secret_hash, label, allowed_models, status) VALUES
    ('agk_demo', 'prj_demo', 'ak_localdev_test',
     SHA2(CONCAT('netstars:', 'secret_localdev_test'), 256),
     'Local dev key', JSON_ARRAY('claude-*','gpt-*','grok-*','gemini-*'), 'active')
ON DUPLICATE KEY UPDATE label = VALUES(label);

INSERT INTO balances (merchant_id, balance_token) VALUES
    ('mch_demo', 0)
ON DUPLICATE KEY UPDATE last_updated_at = CURRENT_TIMESTAMP(6);
