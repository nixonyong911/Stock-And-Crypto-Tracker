-- Tier change cache invalidation trigger.
-- When users.tier changes, call gateway-2.0 to invalidate the Redis session cache.
-- Uses pg_net (async HTTP) and Supabase Vault for secrets.
-- Works alongside trigger 004 (sync_tier_to_sessions) which syncs tier to gateway_sessions table.

CREATE OR REPLACE FUNCTION notify_gateway_tier_change()
RETURNS TRIGGER AS $$
DECLARE
  gateway_url TEXT;
  api_key TEXT;
BEGIN
  IF OLD.tier IS DISTINCT FROM NEW.tier AND NEW.clerk_user_id IS NOT NULL THEN
    SELECT decrypted_secret INTO gateway_url
    FROM vault.decrypted_secrets WHERE name = 'gateway_api_url';

    SELECT decrypted_secret INTO api_key
    FROM vault.decrypted_secrets WHERE name = 'gateway_api_key';

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

CREATE TRIGGER trigger_notify_gateway_tier_change
AFTER UPDATE OF tier ON users
FOR EACH ROW
EXECUTE FUNCTION notify_gateway_tier_change();
