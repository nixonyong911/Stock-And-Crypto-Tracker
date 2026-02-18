-- Tier sync trigger: propagate users.tier changes to active gateway_sessions.
-- Makes users.tier the single source of truth for subscription tier.
-- gateway_sessions.tier becomes a DB-managed mirror (read-only from app perspective).

CREATE OR REPLACE FUNCTION sync_tier_to_sessions()
RETURNS TRIGGER AS $$
BEGIN
  IF OLD.tier IS DISTINCT FROM NEW.tier THEN
    UPDATE gateway_sessions
    SET tier = NEW.tier
    WHERE clerk_user_id = NEW.clerk_user_id
      AND expires_at > NOW();
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_sync_tier_to_sessions
AFTER UPDATE OF tier ON users
FOR EACH ROW
EXECUTE FUNCTION sync_tier_to_sessions();
