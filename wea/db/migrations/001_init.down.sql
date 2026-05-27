-- Migration 001 DOWN: drop all tables created by 001_init.up.sql (wea)
SET FOREIGN_KEY_CHECKS=0;

DROP TABLE IF EXISTS audit_log;
DROP TABLE IF EXISTS wallet_events;
DROP TABLE IF EXISTS system_flags;
DROP TABLE IF EXISTS price_history;
DROP TABLE IF EXISTS rpc_endpoints;
DROP TABLE IF EXISTS settlements;

SET FOREIGN_KEY_CHECKS=1;
