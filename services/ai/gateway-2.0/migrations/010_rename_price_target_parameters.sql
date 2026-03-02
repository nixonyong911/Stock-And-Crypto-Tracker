-- Migration 010: Rename price_target_parameters -> lookup_price_target_parameters

BEGIN;
ALTER TABLE price_target_parameters RENAME TO lookup_price_target_parameters;
COMMIT;
