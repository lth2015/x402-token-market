-- reset-ledger.sql — 演示前重置 token 账本到干净初始状态
-- 保留：merchants / projects / agent_keys / model_rates（身份与配置）
-- 清除：activity, balance, ledger entries, requests, invoices, usage_daily, audit_log
-- 用法：make reset-ledger   (需要 MySQL 服务运行)

USE token_qa;

SET FOREIGN_KEY_CHECKS = 0;

-- 清除所有活动数据
TRUNCATE TABLE token_ledger_entries;
TRUNCATE TABLE payment_orders_mirror;
TRUNCATE TABLE requests;
TRUNCATE TABLE usage_daily;
TRUNCATE TABLE invoices;
TRUNCATE TABLE invoice_items;
TRUNCATE TABLE audit_log;

-- 重置余额到演示初始值（500M tokens ≈ $500 USDC）
UPDATE balances SET
    balance_token  = 500000000,
    on_hold_token  = 0,
    last_updated_at = NOW(6);

SET FOREIGN_KEY_CHECKS = 1;

SELECT 'ledger reset complete' AS status,
       balance_token AS reset_balance,
       merchant_id
FROM balances;
