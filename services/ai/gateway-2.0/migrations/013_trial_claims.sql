-- Migration: 013_trial_claims
-- Phone-based trial tracking for no-credit-card Pro trial.
-- Phone hash collected via Telegram request_contact during pairing.

ALTER TABLE users
    ADD COLUMN IF NOT EXISTS phone_hash        text,
    ADD COLUMN IF NOT EXISTS phone_verified_at  timestamptz;

CREATE TABLE IF NOT EXISTS trial_claims (
    id                      serial       PRIMARY KEY,
    user_id                 int          NOT NULL REFERENCES users(id),
    phone_hash              text         NOT NULL,
    telegram_user_id        text,
    stripe_subscription_id  text,
    claimed_at              timestamptz  NOT NULL DEFAULT now(),
    trial_end_at            timestamptz,
    source                  text         NOT NULL CHECK (source IN ('web', 'telegram')),
    ip_address              inet,
    CONSTRAINT uq_trial_claims_phone_hash UNIQUE (phone_hash)
);

CREATE INDEX IF NOT EXISTS idx_trial_claims_user_id   ON trial_claims(user_id);
CREATE INDEX IF NOT EXISTS idx_trial_claims_telegram  ON trial_claims(telegram_user_id);
