-- Migration 002: Expire all active sessions for per-tier MCP endpoint rollout
--
-- Context: cursor-agent does NOT support tools.allow in mcp.json. We've moved
-- to server-side per-tier MCP endpoints (/mcp/free, /mcp/pro, /mcp).
-- Existing sessions may have cached the old tool list (all 5 tools for every
-- tier). Expiring them forces all users to /login again, which creates a new
-- session with a fresh cliSessionId that will discover the correct tier's tools.
--
-- Run ONCE after deploying the MCP server and gateway changes.
-- Safe to run multiple times (idempotent).

UPDATE gateway_sessions
   SET expires_at = NOW()
 WHERE expires_at > NOW();
