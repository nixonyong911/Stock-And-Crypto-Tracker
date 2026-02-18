#!/usr/bin/env node
/**
 * Generate tier-homes/{tier}/.cursor/mcp.json from mcp-manifest.json.
 *
 * For each tier, includes only the MCP servers whose minTier <= that tier
 * (cumulative access). URLs get /{tier}/ appended so the MCP server can
 * filter tools per tier endpoint.
 *
 * Usage: node scripts/generate-tier-homes.js
 */

import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");

const manifest = JSON.parse(
  readFileSync(join(ROOT, "mcp-manifest.json"), "utf-8")
);

const tiers = manifest.tiers;
const servers = manifest.servers;

if (!Array.isArray(tiers) || tiers.length === 0) {
  console.error("ERROR: mcp-manifest.json must have a non-empty 'tiers' array");
  process.exit(1);
}

if (
  !servers ||
  typeof servers !== "object" ||
  Object.keys(servers).length === 0
) {
  console.error(
    "ERROR: mcp-manifest.json must have a non-empty 'servers' object"
  );
  process.exit(1);
}

for (const [name, cfg] of Object.entries(servers)) {
  if (!cfg.baseUrl) {
    console.error(`ERROR: Server '${name}' is missing required 'baseUrl'`);
    process.exit(1);
  }
  if (!cfg.minTier || !tiers.includes(cfg.minTier)) {
    console.error(
      `ERROR: Server '${name}' has invalid minTier='${
        cfg.minTier
      }'. Valid: ${tiers.join(", ")}`
    );
    process.exit(1);
  }
}

function tierIncludes(userTier, minTier) {
  return tiers.indexOf(userTier) >= tiers.indexOf(minTier);
}

for (const tier of tiers) {
  const mcpServers = {};

  for (const [name, cfg] of Object.entries(servers)) {
    if (!tierIncludes(tier, cfg.minTier)) continue;

    const base = cfg.baseUrl.replace(/\/+$/, "");
    const entry = { url: `${base}/${tier}/` };

    if (cfg.timeout !== undefined) entry.timeout = cfg.timeout;
    if (cfg.keepAlive !== undefined) entry.keepAlive = cfg.keepAlive;
    if (cfg.maxRetries !== undefined) entry.maxRetries = cfg.maxRetries;

    mcpServers[name] = entry;
  }

  const outDir = join(ROOT, "tier-homes", tier, ".cursor");
  mkdirSync(outDir, { recursive: true });

  const outPath = join(outDir, "mcp.json");
  writeFileSync(outPath, JSON.stringify({ mcpServers }, null, 2) + "\n");

  const serverCount = Object.keys(mcpServers).length;
  console.log(
    `  ${tier}/mcp.json -> ${serverCount} server(s): ${
      Object.keys(mcpServers).join(", ") || "(none)"
    }`
  );
}

console.log("tier-homes generation complete.");
