#!/bin/bash
set -e

psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname "$POSTGRES_DB" <<-EOSQL

  -- PostgREST roles (replicates Supabase's internal role structure)
  CREATE ROLE authenticator NOINHERIT LOGIN PASSWORD '${POSTGRES_PASSWORD}';
  CREATE ROLE anon NOLOGIN;
  CREATE ROLE service_role NOLOGIN BYPASSRLS;

  GRANT anon TO authenticator;
  GRANT service_role TO authenticator;

  -- Schema access
  GRANT USAGE ON SCHEMA public TO anon, service_role;
  GRANT USAGE ON SCHEMA extensions TO anon, service_role;

  -- service_role: full access (BYPASSRLS skips all RLS policies)
  GRANT ALL ON ALL TABLES IN SCHEMA public TO service_role;
  GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO service_role;
  GRANT ALL ON ALL ROUTINES IN SCHEMA public TO service_role;

  -- anon: read access (RLS policies control actual row-level access)
  GRANT SELECT ON ALL TABLES IN SCHEMA public TO anon;
  GRANT USAGE ON ALL SEQUENCES IN SCHEMA public TO anon;

  -- Future tables inherit the same grants
  ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO service_role;
  ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON SEQUENCES TO service_role;
  ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON ROUTINES TO service_role;
  ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT ON TABLES TO anon;
  ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT USAGE ON SEQUENCES TO anon;

  -- GUC variables for trigger functions (replaces Supabase Vault)
  -- Docker-internal URLs: faster, no TLS overhead, no internet round-trip
  ALTER SYSTEM SET app.gateway_api_url = 'http://gateway-2.0:8080';
  ALTER SYSTEM SET app.gateway_api_key = '${INTERNAL_SERVICE_KEY}';
  SELECT pg_reload_conf();

EOSQL
