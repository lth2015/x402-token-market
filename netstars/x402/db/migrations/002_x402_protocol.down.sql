-- Reverse of 002 — drop the protocol-layer additions.

ALTER TABLE payment_proofs
    DROP INDEX uq_payment_proofs_signed_tx_hash,
    DROP COLUMN signed_tx_hash;

ALTER TABLE payment_orders
    DROP INDEX uq_payment_orders_tx_hash;

ALTER TABLE payment_orders
    ADD KEY idx_payment_orders_tx_hash (tx_hash);

ALTER TABLE payment_orders
    DROP INDEX idx_payment_orders_resource,
    DROP COLUMN resource;
