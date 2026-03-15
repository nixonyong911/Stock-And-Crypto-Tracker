-- Extensions schema matches Supabase's layout so pg_restore works cleanly
CREATE SCHEMA IF NOT EXISTS extensions;

CREATE EXTENSION IF NOT EXISTS "uuid-ossp" SCHEMA extensions;
CREATE EXTENSION IF NOT EXISTS pgcrypto SCHEMA extensions;
CREATE EXTENSION IF NOT EXISTS pg_net SCHEMA extensions;
CREATE EXTENSION IF NOT EXISTS pg_stat_statements SCHEMA extensions;

ALTER DATABASE stocktracker SET search_path TO public, extensions;
