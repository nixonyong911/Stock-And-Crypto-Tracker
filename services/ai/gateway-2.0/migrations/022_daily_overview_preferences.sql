-- Migration: Add daily overview preference column
-- Date: 2026-03-26

ALTER TABLE user_digest_preferences
  ADD COLUMN IF NOT EXISTS daily_overview_enabled BOOLEAN NOT NULL DEFAULT true;
