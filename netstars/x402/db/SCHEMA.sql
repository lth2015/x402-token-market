-- =====================================================================
-- X402 Gateway · Database Schema
-- Engine: Aurora MySQL 8.0 (AWS RDS, MySQL-compatible)
-- Charset: utf8mb4 / Collation: utf8mb4_0900_ai_ci
-- Timezone: UTC (parameter group: time_zone='+00:00')
-- App user: x402_app (no DELETE on audit_log / payment_orders; no UPDATE on audit_log)
--
-- MySQL ⟷ PostgreSQL 关键差异处理：
--   - 用 VARCHAR + CHECK 替代 PG 的 ENUM type（CHECK 在 8.0.16+ 强制执行）
--   - 用 DATETIME(6) 替代 TIMESTAMPTZ（统一 UTC 存）
--   - JSON 替代 JSONB（注意：不能直接 index JSON 全字段，用 generated column）
--   - 应用层生成 ULID 主键（不用 UUID() / AUTO_INCREMENT 主键）
--   - 分区表不支持 FOREIGN KEY；以应用层完整性兜底
--   - 用 TRIGGER (BEFORE UPDATE) 强制状态机；语法不同于 PG plpgsql
-- =====================================================================

SET sql_notes = 0;

-- =====================================================================
-- 1. payment_orders : 主表 - 每笔 X402 支付订单（按月 RANGE 分区）
-- =====================================================================
CREATE TABLE IF NOT EXISTS payment_orders (
    id                      VARCHAR(40)  NOT NULL,                  -- pmt_<ULID>
    merchant_id             VARCHAR(40)  NOT NULL,                  -- mch_<ULID>
    api_key_id              VARCHAR(40)  NOT NULL,                  -- agk_<ULID>
    idempotency_key         VARCHAR(80)  NOT NULL,

    -- 支付要求
    amount_usdc_micro       BIGINT       NOT NULL,
    recipient               VARCHAR(64)  NOT NULL,                  -- Solana base58
    nonce                   CHAR(64)     NOT NULL,                  -- hex
    network                 VARCHAR(16)  NOT NULL DEFAULT 'solana',
    asset                   VARCHAR(16)  NOT NULL DEFAULT 'USDC',

    -- 状态机（用 VARCHAR + CHECK 替代 PG ENUM）
    status                  VARCHAR(20)  NOT NULL DEFAULT 'created',
    status_reason           VARCHAR(255) NULL,
    expires_at              DATETIME(6)  NOT NULL,

    -- 链上结果
    tx_hash                 VARCHAR(96)  NULL,                       -- base58 sig
    solana_slot             BIGINT       NULL,
    confirmed_at            DATETIME(6)  NULL,

    -- 跨模块关联
    wea_settlement_id       VARCHAR(40)  NULL,
    token_ledger_entry_id   BIGINT       NULL,

    -- 客户 metadata + webhook
    metadata                JSON         NOT NULL,
    webhook_url             VARCHAR(512) NULL,
    webhook_secret_enc      VARBINARY(512) NULL,                    -- 应用层 AES-256-GCM 加密

    -- 审计
    created_at              DATETIME(6)  NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
    updated_at              DATETIME(6)  NOT NULL DEFAULT CURRENT_TIMESTAMP(6)
                                          ON UPDATE CURRENT_TIMESTAMP(6),
    created_trace_id        VARCHAR(64)  NULL,
    merged_into_token_at    DATETIME(6)  NULL,                       -- Phase 3 合并标记

    -- amount > 0 校验
    CONSTRAINT chk_payment_orders_amount  CHECK (amount_usdc_micro > 0),
    CONSTRAINT chk_payment_orders_status  CHECK (status IN (
        'created','pending','broadcasting','confirmed','token_credited',
        'failed','expired','canceled','refunded'
    )),

    -- 主键必须包含分区列
    PRIMARY KEY (id, created_at),
    UNIQUE KEY uq_payment_orders_idempotency (api_key_id, idempotency_key, created_at),
    UNIQUE KEY uq_payment_orders_nonce      (recipient, nonce, created_at),

    KEY idx_payment_orders_merchant_time (merchant_id, created_at),
    KEY idx_payment_orders_status        (status, created_at),
    KEY idx_payment_orders_tx_hash       (tx_hash),
    KEY idx_payment_orders_expires       (expires_at, status)
)
ENGINE=InnoDB
DEFAULT CHARSET=utf8mb4
COLLATE=utf8mb4_0900_ai_ci
ROW_FORMAT=DYNAMIC
PARTITION BY RANGE COLUMNS(created_at) (
    PARTITION p2026_05 VALUES LESS THAN ('2026-06-01'),
    PARTITION p2026_06 VALUES LESS THAN ('2026-07-01'),
    PARTITION p2026_07 VALUES LESS THAN ('2026-08-01'),
    PARTITION p2026_08 VALUES LESS THAN ('2026-09-01'),
    PARTITION p_future VALUES LESS THAN (MAXVALUE)              -- catch-all；月度 cron 拆分
);

-- 状态机强制 trigger（MySQL syntax）
DELIMITER $$
CREATE TRIGGER trg_payment_orders_fsm
BEFORE UPDATE ON payment_orders
FOR EACH ROW
BEGIN
    IF NEW.status <> OLD.status THEN
        IF NOT (
            (OLD.status = 'created'        AND NEW.status IN ('pending','expired','canceled'))
         OR (OLD.status = 'pending'        AND NEW.status IN ('broadcasting','failed','expired'))
         OR (OLD.status = 'broadcasting'   AND NEW.status IN ('confirmed','failed'))
         OR (OLD.status = 'confirmed'      AND NEW.status = 'token_credited')
         OR (OLD.status = 'token_credited' AND NEW.status = 'refunded')
        ) THEN
            SIGNAL SQLSTATE '45000'
              SET MESSAGE_TEXT = 'Illegal payment_orders status transition';
        END IF;
    END IF;
END$$
DELIMITER ;

-- =====================================================================
-- 2. payment_proofs : 支付证明历史（保留全部尝试，不分区，量小）
-- =====================================================================
CREATE TABLE IF NOT EXISTS payment_proofs (
    id                      BIGINT       NOT NULL AUTO_INCREMENT,
    payment_order_id        VARCHAR(40)  NOT NULL,                   -- 应用层关联 payment_orders.id
    signed_tx_b64           MEDIUMTEXT   NOT NULL,
    parsed_tx               JSON         NOT NULL,
    verification_result     JSON         NOT NULL,
    submitted_at            DATETIME(6)  NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
    submitter_trace_id      VARCHAR(64)  NULL,
    PRIMARY KEY (id),
    KEY idx_payment_proofs_order (payment_order_id, submitted_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- =====================================================================
-- 3. webhook_deliveries : 出站 webhook log
-- =====================================================================
CREATE TABLE IF NOT EXISTS webhook_deliveries (
    id                      BIGINT       NOT NULL AUTO_INCREMENT,
    payment_order_id        VARCHAR(40)  NOT NULL,
    event_type              VARCHAR(40)  NOT NULL,
    target_url              VARCHAR(512) NOT NULL,
    payload_json            JSON         NOT NULL,
    status                  VARCHAR(24)  NOT NULL DEFAULT 'pending',
    attempt_count           INT          NOT NULL DEFAULT 0,
    last_attempt_at         DATETIME(6)  NULL,
    last_response_code      INT          NULL,
    last_response_body      VARCHAR(1024) NULL,
    next_retry_at           DATETIME(6)  NULL,
    created_at              DATETIME(6)  NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
    delivered_at            DATETIME(6)  NULL,
    CONSTRAINT chk_webhook_status CHECK (status IN (
        'pending','delivered','failed_retrying','failed_dead_letter'
    )),
    PRIMARY KEY (id),
    KEY idx_webhook_payment   (payment_order_id),
    KEY idx_webhook_retry     (next_retry_at, status),
    KEY idx_webhook_created   (created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- =====================================================================
-- 4. idempotency_records : DB 兜底层（24h TTL，由 worker 清理）
-- =====================================================================
CREATE TABLE IF NOT EXISTS idempotency_records (
    api_key_id              VARCHAR(40)  NOT NULL,
    idempotency_key         VARCHAR(80)  NOT NULL,
    request_hash            CHAR(64)     NOT NULL,                   -- sha256 hex
    response_status         SMALLINT     NOT NULL,
    response_body           JSON         NOT NULL,
    created_at              DATETIME(6)  NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
    expires_at              DATETIME(6)  NOT NULL,
    PRIMARY KEY (api_key_id, idempotency_key),
    KEY idx_idempotency_expires (expires_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- =====================================================================
-- 5. audit_log : append-only 审计（按月分区）
-- =====================================================================
CREATE TABLE IF NOT EXISTS audit_log (
    id                  BIGINT       NOT NULL AUTO_INCREMENT,
    occurred_at         DATETIME(6)  NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
    actor_type          VARCHAR(16)  NOT NULL,                       -- client / system / admin
    actor_id            VARCHAR(64)  NULL,
    action              VARCHAR(64)  NOT NULL,                       -- e.g. payment.create
    resource_type       VARCHAR(40)  NOT NULL,
    resource_id         VARCHAR(64)  NULL,
    before_state        JSON         NULL,
    after_state         JSON         NULL,
    trace_id            VARCHAR(64)  NULL,
    client_ip           VARCHAR(45)  NULL,                            -- IPv4/IPv6
    user_agent          VARCHAR(255) NULL,
    metadata            JSON         NOT NULL,
    PRIMARY KEY (id, occurred_at),
    KEY idx_audit_actor    (actor_id, occurred_at),
    KEY idx_audit_resource (resource_type, resource_id, occurred_at)
)
ENGINE=InnoDB
DEFAULT CHARSET=utf8mb4
COLLATE=utf8mb4_0900_ai_ci
PARTITION BY RANGE COLUMNS(occurred_at) (
    PARTITION p2026_05 VALUES LESS THAN ('2026-06-01'),
    PARTITION p2026_06 VALUES LESS THAN ('2026-07-01'),
    PARTITION p2026_07 VALUES LESS THAN ('2026-08-01'),
    PARTITION p_future VALUES LESS THAN (MAXVALUE)
);

-- 应用账号必须 REVOKE：
-- REVOKE UPDATE, DELETE ON x402_qa.audit_log FROM 'x402_app'@'%';

-- =====================================================================
-- 6. wea_callbacks_log : Wea 回调原始记录（debug）
-- =====================================================================
CREATE TABLE IF NOT EXISTS wea_callbacks_log (
    id                  BIGINT       NOT NULL AUTO_INCREMENT,
    received_at         DATETIME(6)  NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
    settlement_id       VARCHAR(40)  NOT NULL,
    payment_order_id    VARCHAR(40)  NULL,
    payload_json        JSON         NOT NULL,
    signature           VARCHAR(255) NULL,
    verified            TINYINT(1)   NOT NULL,
    processed_status    VARCHAR(32)  NULL,                            -- ok / replay / verify_fail
    PRIMARY KEY (id),
    KEY idx_wea_callbacks_payment  (payment_order_id),
    KEY idx_wea_callbacks_received (received_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- =====================================================================
-- 7. system_flags : 运维开关
-- =====================================================================
CREATE TABLE IF NOT EXISTS system_flags (
    `key`               VARCHAR(64)  NOT NULL,
    value               JSON         NOT NULL,
    updated_at          DATETIME(6)  NOT NULL DEFAULT CURRENT_TIMESTAMP(6)
                                       ON UPDATE CURRENT_TIMESTAMP(6),
    updated_by          VARCHAR(64)  NULL,
    PRIMARY KEY (`key`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

INSERT INTO system_flags (`key`, value, updated_by) VALUES
    ('accepting_new_payments',     JSON_OBJECT('value', true),  'bootstrap'),
    ('usdc_depeg_threshold_low',   JSON_OBJECT('value', 0.97),  'bootstrap'),
    ('usdc_depeg_threshold_high',  JSON_OBJECT('value', 1.03),  'bootstrap');

-- =====================================================================
-- 8. Views（替代 PG 的物化视图；用普通 view + 应用层缓存）
-- =====================================================================
CREATE OR REPLACE VIEW v_payment_order_summary AS
SELECT
    DATE(created_at)        AS day,
    status,
    COUNT(*)                AS cnt,
    SUM(amount_usdc_micro) / 1000000.0 AS sum_usdc
FROM payment_orders
GROUP BY DATE(created_at), status;

SET sql_notes = 1;
