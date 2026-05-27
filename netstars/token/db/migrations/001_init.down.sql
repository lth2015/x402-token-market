-- Migration 001 DOWN: drop all tables created by 001_init.up.sql (token system)
SET FOREIGN_KEY_CHECKS=0;

DROP TABLE IF EXISTS usage_daily;
DROP TABLE IF EXISTS audit_log;
DROP TABLE IF EXISTS webhook_subscriptions;
DROP TABLE IF EXISTS invoice_items;
DROP TABLE IF EXISTS invoices;
DROP TABLE IF EXISTS merchant_subscriptions;
DROP TABLE IF EXISTS packages;
DROP TABLE IF EXISTS model_rates;
DROP TABLE IF EXISTS payment_orders_mirror;
DROP TABLE IF EXISTS requests;
DROP TABLE IF EXISTS token_ledger_entries;
DROP TABLE IF EXISTS balances;
DROP TABLE IF EXISTS agent_keys;
DROP TABLE IF EXISTS projects;
DROP TABLE IF EXISTS merchant_users;
DROP TABLE IF EXISTS users;
DROP TABLE IF EXISTS merchants;

SET FOREIGN_KEY_CHECKS=1;
