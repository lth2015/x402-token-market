-- Migration 002 · standard x402 protocol layer (v0.4.0)
--
-- Adds the columns/indexes the 402 + X-PAYMENT retry flow needs:
--   - payment_orders.resource    — resource binding (which URL this proof unlocks)
--   - payment_orders.tx_hash UNIQUE — prevent two orders settling with the same tx
--   - payment_proofs.signed_tx_hash UNIQUE — prevent the same signed tx being
--     submitted as a proof twice (replay protection at proof-submission time)
--
-- The existing tx_hash index is non-unique; we drop and re-add as UNIQUE. Any
-- existing rows where tx_hash is NULL are fine (UNIQUE allows multiple NULLs
-- on InnoDB). If a duplicate tx_hash already exists in a dev database, this
-- migration will fail with a constraint violation — drop the dev DB and re-run
-- migrations (this is a demo, not a prod migration).

ALTER TABLE payment_orders
    ADD COLUMN resource VARCHAR(512) NULL AFTER asset,
    ADD KEY idx_payment_orders_resource (resource);

ALTER TABLE payment_orders
    DROP INDEX idx_payment_orders_tx_hash;

ALTER TABLE payment_orders
    ADD UNIQUE KEY uq_payment_orders_tx_hash (tx_hash);

ALTER TABLE payment_proofs
    ADD COLUMN signed_tx_hash CHAR(64) NULL AFTER signed_tx_b64,
    ADD UNIQUE KEY uq_payment_proofs_signed_tx_hash (signed_tx_hash);
