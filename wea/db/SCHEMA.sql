-- =====================================================================
-- Wea Settlement Connector · Database Schema
-- Engine: Aurora MySQL 8.0 (in wea-qa AWS account)
-- Charset: utf8mb4 / Collation: utf8mb4_0900_ai_ci
-- Timezone: UTC
-- App user: wea_app (no UPDATE/DELETE on audit_log, wallet_events)
-- =====================================================================

SET sql_notes = 0;

-- =====================================================================
-- 1. settlements : 主表（按月分区）
-- =====================================================================
CREATE TABLE IF NOT EXISTS settlements (
    id                          VARCHAR(40)    NOT NULL,                  -- stl_<ULID>
    payment_order_id            VARCHAR(40)    NOT NULL,                  -- X402 pmt_<ULID>

    -- 请求参数
    expected_amount_micro       BIGINT         NOT NULL,
    expected_recipient          VARCHAR(64)    NOT NULL,
    expected_asset              VARCHAR(16)    NOT NULL DEFAULT 'USDC',
    expected_network            VARCHAR(16)    NOT NULL DEFAULT 'solana',
    signed_tx_b64               MEDIUMTEXT     NOT NULL,
    parsed_tx                   JSON           NULL,
    confirmation_level          VARCHAR(16)    NOT NULL DEFAULT 'confirmed',

    -- 状态
    status                      VARCHAR(20)    NOT NULL DEFAULT 'pending',
    status_reason               VARCHAR(255)   NULL,

    -- 链上结果
    tx_hash                     VARCHAR(96)    NULL,
    rpc_node_used               VARCHAR(64)    NULL,
    solana_slot                 BIGINT         NULL,
    broadcast_at                DATETIME(6)    NULL,
    confirmed_at                DATETIME(6)    NULL,

    -- 回调
    callback_url                VARCHAR(512)   NOT NULL,
    callback_secret_enc         VARBINARY(512) NOT NULL,
    callback_status             VARCHAR(32)    NULL,
    callback_attempt_count      INT            NOT NULL DEFAULT 0,
    callback_last_attempt       DATETIME(6)    NULL,
    callback_next_retry         DATETIME(6)    NULL,

    -- 审计
    created_at                  DATETIME(6)    NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
    updated_at                  DATETIME(6)    NOT NULL DEFAULT CURRENT_TIMESTAMP(6)
                                                ON UPDATE CURRENT_TIMESTAMP(6),

    CONSTRAINT chk_settlements_amount CHECK (expected_amount_micro > 0),
    CONSTRAINT chk_settlements_status CHECK (status IN (
        'pending','broadcasting','confirmed',
        'done','failed','callback_failed'
    )),
    CONSTRAINT chk_settlements_conf_level CHECK (confirmation_level IN
        ('processed','confirmed','finalized')),

    PRIMARY KEY (id, created_at),
    UNIQUE KEY uq_settlements_tx_hash (tx_hash, created_at),
    KEY idx_settlements_payment      (payment_order_id),
    KEY idx_settlements_status       (status, created_at),
    KEY idx_settlements_callback_retry (callback_next_retry, callback_status)
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
-- 2. rpc_endpoints : Solana RPC 节点池
-- =====================================================================
CREATE TABLE IF NOT EXISTS rpc_endpoints (
    id                      VARCHAR(40)    NOT NULL,                      -- rpc_<name>
    name                    VARCHAR(64)    NOT NULL,
    url                     VARCHAR(512)   NOT NULL,
    provider                VARCHAR(32)    NULL,                          -- quicknode / helius / self
    priority                INT            NOT NULL DEFAULT 100,          -- 越小越优先
    purpose                 VARCHAR(24)    NOT NULL DEFAULT 'read_write', -- read_only / write_only / read_write
    active                  TINYINT(1)     NOT NULL DEFAULT 1,
    health_status           VARCHAR(16)    NOT NULL DEFAULT 'unknown',
    last_health_check       DATETIME(6)    NULL,
    consecutive_failures    INT            NOT NULL DEFAULT 0,
    consecutive_successes   INT            NOT NULL DEFAULT 0,
    avg_latency_ms          INT            NULL,
    created_at              DATETIME(6)    NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
    CONSTRAINT chk_rpc_purpose CHECK (purpose IN ('read_only','write_only','read_write')),
    CONSTRAINT chk_rpc_health  CHECK (health_status IN ('healthy','unhealthy','unknown')),
    PRIMARY KEY (id),
    KEY idx_rpc_priority (priority, active)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- =====================================================================
-- 3. price_history : USDC 价格历史（30 天 TTL）
-- =====================================================================
CREATE TABLE IF NOT EXISTS price_history (
    id                  BIGINT         NOT NULL AUTO_INCREMENT,
    fetched_at          DATETIME(6)    NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
    asset               VARCHAR(16)    NOT NULL,
    source              VARCHAR(32)    NOT NULL,                          -- coingecko / chainlink
    price_usd           DECIMAL(10,6)  NOT NULL,
    metadata            JSON           NULL,
    PRIMARY KEY (id),
    KEY idx_price_history_lookup (asset, fetched_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- =====================================================================
-- 4. system_flags
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
    ('accepting_new_settlements', JSON_OBJECT('value', true),  'bootstrap'),
    ('depeg_low_threshold',       JSON_OBJECT('value', 0.97),  'bootstrap'),
    ('depeg_high_threshold',      JSON_OBJECT('value', 1.03),  'bootstrap'),
    ('depeg_window_minutes',      JSON_OBJECT('value', 5),     'bootstrap'),
    ('priority_fee_max_lamports', JSON_OBJECT('value', 100000),'bootstrap');

-- =====================================================================
-- 5. wallet_events : 钱包事件（debug + 审计）
-- =====================================================================
CREATE TABLE IF NOT EXISTS wallet_events (
    id                          BIGINT          NOT NULL AUTO_INCREMENT,
    occurred_at                 DATETIME(6)     NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
    event_type                  VARCHAR(32)     NOT NULL,
    wallet_name                 VARCHAR(32)     NOT NULL,                 -- hot / warm / cold
    address                     VARCHAR(64)     NOT NULL,
    asset                       VARCHAR(16)     NOT NULL,
    amount                      DECIMAL(30,9)   NOT NULL,
    tx_hash                     VARCHAR(96)     NULL,
    related_settlement_id       VARCHAR(40)     NULL,
    actor                       VARCHAR(64)     NULL,                     -- system / admin:<user_id>
    notes                       VARCHAR(512)    NULL,
    metadata                    JSON            NULL,
    CONSTRAINT chk_wallet_event_type CHECK (event_type IN
        ('inbound_payment','cold_sweep','gas_topup','manual_admin_action')),
    PRIMARY KEY (id),
    KEY idx_wallet_events_occurred   (occurred_at),
    KEY idx_wallet_events_wallet     (wallet_name, occurred_at),
    KEY idx_wallet_events_settlement (related_settlement_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- =====================================================================
-- 6. audit_log
-- =====================================================================
CREATE TABLE IF NOT EXISTS audit_log (
    id                  BIGINT       NOT NULL AUTO_INCREMENT,
    occurred_at         DATETIME(6)  NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
    actor_type          VARCHAR(16)  NOT NULL,
    actor_id            VARCHAR(64)  NULL,
    action              VARCHAR(64)  NOT NULL,
    resource_type       VARCHAR(40)  NOT NULL,
    resource_id         VARCHAR(64)  NULL,
    before_state        JSON         NULL,
    after_state         JSON         NULL,
    trace_id            VARCHAR(64)  NULL,
    client_ip           VARCHAR(45)  NULL,
    metadata            JSON         NOT NULL,
    PRIMARY KEY (id, occurred_at)
)
ENGINE=InnoDB
DEFAULT CHARSET=utf8mb4
PARTITION BY RANGE COLUMNS(occurred_at) (
    PARTITION p2026_05 VALUES LESS THAN ('2026-06-01'),
    PARTITION p2026_06 VALUES LESS THAN ('2026-07-01'),
    PARTITION p_future VALUES LESS THAN (MAXVALUE)
);

-- =====================================================================
-- 7. Seed
-- =====================================================================
INSERT INTO rpc_endpoints (id, name, url, provider, priority, purpose) VALUES
    ('rpc_quicknode_1', 'quicknode-1',  'https://REPLACE.quiknode.pro', 'quicknode',   10, 'read_write'),
    ('rpc_helius_1',    'helius-1',     'https://REPLACE.helius.dev',   'helius',      20, 'read_write'),
    ('rpc_self_1',      'self-hosted-1','http://solana-rpc.internal',   'self-hosted', 30, 'read_only')
ON DUPLICATE KEY UPDATE url = VALUES(url);

SET sql_notes = 1;
