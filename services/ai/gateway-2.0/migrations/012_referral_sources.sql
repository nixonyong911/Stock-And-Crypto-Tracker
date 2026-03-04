-- Migration: 012_referral_sources
-- Tracks where users heard about us (collected on Stripe Checkout page).

CREATE TABLE IF NOT EXISTS lookup_referral_sources (
    id          serial       PRIMARY KEY,
    key         varchar(50)  NOT NULL UNIQUE,
    description text         NOT NULL
);

INSERT INTO lookup_referral_sources (key, description) VALUES
    ('google',        'Google'),
    ('social_media',  'Social Media'),
    ('word_of_mouth', 'Word of Mouth'),
    ('other',         'Other')
ON CONFLICT (key) DO NOTHING;

ALTER TABLE users
    ADD COLUMN IF NOT EXISTS referral_source_id    int  REFERENCES lookup_referral_sources(id),
    ADD COLUMN IF NOT EXISTS referral_source_other  text;
