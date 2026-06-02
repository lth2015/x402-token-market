-- Migration 002: remove 'callback_pending' from chk_settlements_status
--
-- Rationale: 'callback_pending' was listed in the CHECK constraint but is
-- never written by any application code path (models::status has no such
-- constant, and the state machine goes confirmed → done, not via a
-- callback_pending intermediate).  It is a dead value that silently
-- diverges the DB contract from the code.  Removing it closes the gap
-- without touching any existing rows (no row has ever stored that value).
--
-- MySQL 8.0: you cannot ALTER a CHECK constraint in-place; the idiomatic
-- approach is DROP + ADD in one ALTER TABLE statement.
--
-- Idempotency note: mysql does not support "IF EXISTS" for named CHECK
-- constraints, so this migration is not re-runnable on its own.
-- golang-migrate tracks the version number to prevent double-application.

ALTER TABLE settlements
    DROP CONSTRAINT chk_settlements_status,
    ADD CONSTRAINT chk_settlements_status CHECK (status IN (
        'pending','broadcasting','confirmed',
        'done','failed','callback_failed'
    ));
