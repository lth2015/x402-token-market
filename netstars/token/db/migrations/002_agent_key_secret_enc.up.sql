-- Migration 002 · Add encrypted secret column to agent_keys.
--
-- Why: HMAC-SHA256 request signing (Stripe-style) requires the SERVER to
-- recompute the signature, which means it needs the plaintext secret — a
-- SHA-2 hash alone is not enough. In production this column holds an
-- AES-256-GCM ciphertext produced by KMS envelope encryption (see token/
-- DESIGN.md §5). For local/QA dev, we store the raw secret bytes; the
-- application reads `KMS_MODE` env to decide whether to decrypt.
--
-- The legacy `key_secret_hash` is kept for now as an integrity check
-- (server can SHA2(secret) and compare). It is dropped in a future
-- migration once all clients are on the new flow.

ALTER TABLE agent_keys
    ADD COLUMN key_secret_enc VARBINARY(512) NULL AFTER key_secret_hash;

-- Seed the demo key with the matching plaintext secret so SDK quickstart
-- works against the live HMAC verifier. KMS_MODE=dev in compose treats
-- this as plaintext bytes.
UPDATE agent_keys
   SET key_secret_enc = CAST('secret_localdev_test' AS BINARY)
 WHERE id = 'agk_demo';
