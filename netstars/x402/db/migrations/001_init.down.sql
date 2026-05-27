-- Migration 001 DOWN: drop all tables created by 001_init.up.sql
SET FOREIGN_KEY_CHECKS=0;

DROP TRIGGER IF EXISTS trg_payment_orders_fsm;

DROP VIEW  IF EXISTS v_payment_order_summary;

DROP TABLE IF EXISTS system_flags;
DROP TABLE IF EXISTS wea_callbacks_log;
DROP TABLE IF EXISTS audit_log;
DROP TABLE IF EXISTS idempotency_records;
DROP TABLE IF EXISTS webhook_deliveries;
DROP TABLE IF EXISTS payment_proofs;
DROP TABLE IF EXISTS payment_orders;

SET FOREIGN_KEY_CHECKS=1;
