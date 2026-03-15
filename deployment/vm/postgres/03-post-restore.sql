-- ===========================================
-- Post-restore script: Run after any pg_restore to fix
-- Supabase-specific references and re-apply grants
-- Usage: docker exec postgres psql -U postgres -d stocktracker -f /docker-entrypoint-initdb.d/03-post-restore.sql
-- ===========================================

-- Re-apply schema-level grants (pg_restore --clean recreates public schema, losing USAGE)
GRANT USAGE ON SCHEMA public TO anon, service_role;
GRANT USAGE ON SCHEMA extensions TO anon, service_role;

-- Re-apply object-level grants (pg_restore creates tables before ALTER DEFAULT PRIVILEGES takes effect)
GRANT ALL ON ALL TABLES IN SCHEMA public TO service_role;
GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO service_role;
GRANT ALL ON ALL ROUTINES IN SCHEMA public TO service_role;
GRANT SELECT ON ALL TABLES IN SCHEMA public TO anon;
GRANT USAGE ON ALL SEQUENCES IN SCHEMA public TO anon;

-- Fix trigger: notify_gateway_tier_change (replace vault.decrypted_secrets with GUC variables)
CREATE OR REPLACE FUNCTION notify_gateway_tier_change()
RETURNS trigger AS $$
DECLARE
  gateway_url TEXT;
  api_key TEXT;
BEGIN
  IF OLD.tier IS DISTINCT FROM NEW.tier AND NEW.clerk_user_id IS NOT NULL THEN
    gateway_url := current_setting('app.gateway_api_url', true);
    api_key := current_setting('app.gateway_api_key', true);

    IF gateway_url IS NOT NULL AND api_key IS NOT NULL THEN
      PERFORM net.http_post(
        url := gateway_url || '/api/v1/sessions/invalidate-cache',
        headers := jsonb_build_object(
          'Content-Type', 'application/json',
          'x-api-key', api_key
        ),
        body := jsonb_build_object('clerk_user_id', NEW.clerk_user_id)
      );
    END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Fix trigger: trigger_backfill_on_new_ticker (use Docker-internal URL)
CREATE OR REPLACE FUNCTION trigger_backfill_on_new_ticker()
RETURNS trigger AS $$
BEGIN
    PERFORM net.http_post(
        url := 'http://data-fetcher-2.0:8080/api/alpaca/webhook/new-ticker',
        body := jsonb_build_object(
            'type', 'INSERT',
            'table', 'stock_tickers',
            'schema', 'public',
            'record', jsonb_build_object(
                'id', NEW.id,
                'symbol', NEW.symbol,
                'exchange', NEW.exchange,
                'currency', NEW.currency,
                'is_active', NEW.is_active,
                'created_at', NEW.created_at
            ),
            'old_record', NULL
        ),
        headers := '{"Content-Type": "application/json"}'::jsonb,
        timeout_milliseconds := 5000
    );
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Fix trigger: trigger_backfill_on_new_crypto_ticker (use Docker-internal URL)
CREATE OR REPLACE FUNCTION trigger_backfill_on_new_crypto_ticker()
RETURNS trigger AS $$
BEGIN
    PERFORM net.http_post(
        url := 'http://data-fetcher-2.0:8080/api/alpaca/webhook/new-crypto-ticker',
        body := jsonb_build_object(
            'type', 'INSERT',
            'table', 'crypto_tickers',
            'schema', 'public',
            'record', jsonb_build_object(
                'id', NEW.id,
                'symbol', NEW.symbol,
                'name', NEW.name,
                'is_active', NEW.is_active,
                'created_at', NEW.created_at
            ),
            'old_record', NULL
        ),
        headers := '{"Content-Type": "application/json"}'::jsonb,
        timeout_milliseconds := 5000
    );
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Notify PostgREST to reload schema cache
NOTIFY pgrst, 'reload schema';
