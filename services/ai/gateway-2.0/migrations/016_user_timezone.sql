-- Add timezone preference to users table.
-- Stores IANA timezone string (e.g., 'America/New_York', 'Pacific/Auckland').
-- Defaults to 'UTC' for existing and new users.
ALTER TABLE users ADD COLUMN IF NOT EXISTS timezone TEXT NOT NULL DEFAULT 'UTC';
