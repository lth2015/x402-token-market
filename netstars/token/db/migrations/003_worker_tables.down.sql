-- Migration 003 rollback · Drop tables added in 003_worker_tables.up.sql
-- Order: FK dependents first, then parents.

DROP TABLE IF EXISTS invoice_items;
DROP TABLE IF EXISTS invoices;
DROP TABLE IF EXISTS webhook_subscriptions;
DROP TABLE IF EXISTS audit_log;
DROP TABLE IF EXISTS usage_daily;
DROP TABLE IF EXISTS merchant_subscriptions;
DROP TABLE IF EXISTS packages;
DROP TABLE IF EXISTS model_rates;
DROP TABLE IF EXISTS merchant_users;
DROP TABLE IF EXISTS users;
