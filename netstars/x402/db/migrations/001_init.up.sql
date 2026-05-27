-- Migration 001 · X402 initial schema (v0.2.0)
-- Simplified from db/SCHEMA.sql for local dev / single-statement migrate:
--   - No PARTITION BY (we'll add 002_add_partitions.up.sql when traffic warrants)
--   - No trigger trg_payment_orders_fsm  (FSM enforced in OrderService.transition)
--   - Indexes / CHECK constraints kept as-is
-- Run via:  make migrate-x402

CREATE TABLE IF NOT EXISTS payment_orders (
    id                       VARCHAR(40)   NOT NULL,
    merchant_id              VARCHAR(40)   NOT NULL,
    api_key_id               VARCHAR(40)   NOT NULL,
    idempotency_key          VARCHAR(80)   NOT NULL,
    amount_usdc_micro        BIGINT        NOT NULL,
    recipient                VARCHAR(64)   NOT NULL,
    nonce                    CHAR(64)      NOT NULL,
    network                  VARCHAR(16)   NOT NULL DEFAULT 'solana',
    asset                    VARCHAR(16)   NOT NULL DEFAULT 'USDC',
    status                   VARCHAR(20)   NOT NULL DEFAULT 'created',
    status_reason            VARCHAR(255)  NULL,
    expires_at               DATETIME(6)   NOT NULL,
    tx_hash                  VARCHAR(96)   NULL,
    solana_slot              BIGINT        NULL,
    confirmed_at             DATETIME(6)   NULL,
    wea_settlement_id        VARCHAR(40)   NULL,
    token_ledger_entry_id    BIGINT        NULL,
    metadata                 JSON          NOT NULL,
    webhook_url              VARCHAR(512)  NULL,
    webhook_secret_enc       VARBINARY(512) NULL,
    created_at               DATETIME(6)   NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
    updated_at               DATETIME(6)   NOT NULL DEFAULT CURRENT_TIMESTAMP(6)
                                            ON UPDATE CURRENT_TIMESTAMP(6),
    created_trace_id         VARCHAR(64)   NULL,
    CONSTRAINT chk_payment_orders_amount CHECK (amount_usdc_micro > 0),
    CONSTRAINT chk_payment_orders_status CHECK (status IN (
        'created','pending','broadcasting','confirmed','token_credited',
        'failed','expired','canceled','refunded'
    )),
    PRIMARY KEY (id),
    UNIQUE KEY uq_payment_orders_idempotency (api_key_id, idempotency_key),
    UNIQUE KEY uq_payment_orders_nonce      (recipient, nonce),
    KEY idx_payment_orders_merchant_time (merchant_id, created_at),
    KEY idx_payment_orders_status        (status, created_at),
    KEY idx_payment_orders_tx_hash       (tx_hash),
    KEY idx_payment_orders_expires       (expires_at, status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE IF NOT EXISTS payment_proofs (
    id                       BIGINT        NOT NULL AUTO_INCREMENT,
    payment_order_id         VARCHAR(40)   NOT NULL,
    signed_tx_b64            MEDIUMTEXT    NOT NULL,
    parsed_tx                JSON          NULL,
    verification_result      JSON          NOT NULL,
    submitted_at             DATETIME(6)   NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
    submitter_trace_id       VARCHAR(64)   NULL,
    PRIMARY KEY (id),
    KEY idx_payment_proofs_order (payment_order_id, submitted_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE IF NOT EXISTS webhook_deliveries (
    id                       BIGINT        NOT NULL AUTO_INCREMENT,
    payment_order_id         VARCHAR(40)   NOT NULL,
    event_type               VARCHAR(40)   NOT NULL,
    target_url               VARCHAR(512)  NOT NULL,
    payload_json             JSON          NOT NULL,
    status                   VARCHAR(24)   NOT NULL DEFAULT 'pending',
    attempt_count            INT           NOT NULL DEFAULT 0,
    last_attempt_at          DATETIME(6)   NULL,
    last_response_code       INT           NULL,
    last_response_body       VARCHAR(1024) NULL,
    next_retry_at            DATETIME(6)   NULL,
    created_at               DATETIME(6)   NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
    delivered_at             DATETIME(6)   NULL,
    CONSTRAINT chk_webhook_status CHECK (status IN (
        'pending','delivered','failed_retrying','failed_dead_letter'
    )),
    PRIMARY KEY (id),
    KEY idx_webhook_payment (payment_order_id),
    KEY idx_webhook_retry   (next_retry_at, status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE IF NOT EXISTS idempotency_records (
    api_key_id               VARCHAR(40)   NOT NULL,
    idempotency_key          VARCHAR(80)   NOT NULL,
    request_hash             CHAR(64)      NOT NULL,
    response_status          SMALLINT      NOT NULL,
    response_body            JSON          NOT NULL,
    created_at               DATETIME(6)   NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
    expires_at               DATETIME(6)   NOT NULL,
    PRIMARY KEY (api_key_id, idempotency_key),
    KEY idx_idempotency_expires (expires_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE IF NOT EXISTS audit_log (
    id                       BIGINT        NOT NULL AUTO_INCREMENT,
    occurred_at              DATETIME(6)   NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
    actor_type               VARCHAR(16)   NOT NULL,
    actor_id                 VARCHAR(64)   NULL,
    action                   VARCHAR(64)   NOT NULL,
    resource_type            VARCHAR(40)   NOT NULL,
    resource_id              VARCHAR(64)   NULL,
    before_state             JSON          NULL,
    after_state              JSON          NULL,
    trace_id                 VARCHAR(64)   NULL,
    client_ip                VARCHAR(45)   NULL,
    user_agent               VARCHAR(255)  NULL,
    metadata                 JSON          NOT NULL,
    PRIMARY KEY (id),
    KEY idx_audit_actor    (actor_id, occurred_at),
    KEY idx_audit_resource (resource_type, resource_id, occurred_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE IF NOT EXISTS system_flags (
    `key`                    VARCHAR(64)   NOT NULL,
    value                    JSON          NOT NULL,
    updated_at               DATETIME(6)   NOT NULL DEFAULT CURRENT_TIMESTAMP(6)
                                            ON UPDATE CURRENT_TIMESTAMP(6),
    updated_by               VARCHAR(64)   NULL,
    PRIMARY KEY (`key`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

INSERT INTO system_flags (`key`, value, updated_by) VALUES
    ('accepting_new_payments',   JSON_OBJECT('value', true),  'bootstrap')
ON DUPLICATE KEY UPDATE updated_by = VALUES(updated_by);
