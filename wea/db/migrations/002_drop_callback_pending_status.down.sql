-- Migration 002 rollback: restore 'callback_pending' to the CHECK constraint.
-- Use only if rolling back migration 002 intentionally.

ALTER TABLE settlements
    DROP CONSTRAINT chk_settlements_status,
    ADD CONSTRAINT chk_settlements_status CHECK (status IN (
        'pending','broadcasting','confirmed','callback_pending',
        'done','failed','callback_failed'
    ));
