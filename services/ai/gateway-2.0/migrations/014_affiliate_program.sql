-- Migration: 014_affiliate_program
-- Affiliate program tables for tracking promoters and their referrals.

CREATE TABLE IF NOT EXISTS affiliate_members (
    id              serial       PRIMARY KEY,
    user_id         int          NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    affiliate_code  varchar(8)   NOT NULL,
    status          varchar(20)  NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'suspended', 'inactive')),
    created_at      timestamptz  NOT NULL DEFAULT now(),
    updated_at      timestamptz  NOT NULL DEFAULT now(),
    CONSTRAINT uq_affiliate_members_user_id UNIQUE (user_id),
    CONSTRAINT uq_affiliate_members_code UNIQUE (affiliate_code)
);

CREATE INDEX IF NOT EXISTS idx_affiliate_members_code ON affiliate_members(affiliate_code);

CREATE TABLE IF NOT EXISTS affiliate_referrals (
    id                    serial       PRIMARY KEY,
    affiliate_member_id   int          NOT NULL REFERENCES affiliate_members(id),
    referred_user_id      int          NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    affiliate_code        varchar(8)   NOT NULL,
    status                varchar(20)  NOT NULL DEFAULT 'registered' CHECK (status IN ('registered', 'subscribed', 'churned')),
    created_at            timestamptz  NOT NULL DEFAULT now(),
    updated_at            timestamptz  NOT NULL DEFAULT now(),
    CONSTRAINT uq_affiliate_referrals_referred_user UNIQUE (referred_user_id)
);

CREATE INDEX IF NOT EXISTS idx_affiliate_referrals_member ON affiliate_referrals(affiliate_member_id);
CREATE INDEX IF NOT EXISTS idx_affiliate_referrals_code ON affiliate_referrals(affiliate_code);
