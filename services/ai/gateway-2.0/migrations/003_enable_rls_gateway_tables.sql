-- Migration 003: Enable Row Level Security on gateway tables
--
-- These 5 tables were created in 001_schema_redesign.sql without RLS.
-- All backend services connect via postgres superuser (pg.Pool with DATABASE_URL)
-- or Supabase service_role key — both bypass RLS automatically.
--
-- Enabling RLS blocks anon/authenticated Supabase clients from accessing
-- these tables, which is the desired security posture.
--
-- Safe to run multiple times (ENABLE ROW LEVEL SECURITY is idempotent).

ALTER TABLE channel_accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE gateway_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE gateway_usage_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE gateway_security_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE gateway_request_log ENABLE ROW LEVEL SECURITY;
