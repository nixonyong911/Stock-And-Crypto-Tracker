import type { CheckResult } from "./freshness-checker.js";
import type { MarketCalendarResult } from "./market-calendar.js";

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function formatAge(hours: number | null): string {
  if (hours === null) return "no data";
  if (hours < 1) return `${Math.round(hours * 60)}m`;
  if (hours >= 48) return `${Math.round(hours / 24)}d`;
  return `${hours}h`;
}

function formatThreshold(hours: number): string {
  if (hours >= 48) return `${Math.round(hours / 24)}d`;
  return `${hours}h`;
}

function formatTimestamp(now: Date): string {
  const m = String(now.getUTCMonth() + 1).padStart(2, "0");
  const d = String(now.getUTCDate()).padStart(2, "0");
  const h = String(now.getUTCHours()).padStart(2, "0");
  const min = String(now.getUTCMinutes()).padStart(2, "0");
  const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  return `${months[now.getUTCMonth()]} ${now.getUTCDate()} ${h}:${min} UTC`;
}

export function formatMessage(
  results: CheckResult[],
  market: MarketCalendarResult,
  now: Date,
): string {
  const stale = results.filter((r) => r.status === "stale");
  const ok = results.filter((r) => r.status === "ok");
  const skipped = results.filter((r) => r.status === "skipped");

  const timestamp = formatTimestamp(now);
  const marketLine = market.isTradingDay
    ? "Market: Open"
    : `Market: Closed (${escapeHtml(market.reason ?? "unknown")})`;

  const lines: string[] = [];
  lines.push(`<b>Data Freshness Check</b> (${timestamp})`);

  if (stale.length === 0) {
    const checkedCount = ok.length;
    if (checkedCount > 0) {
      lines.push(`\n\u2705 All ${checkedCount} table${checkedCount > 1 ? "s" : ""} up to date.`);
    }
    if (skipped.length > 0) {
      const reasons = [...new Set(skipped.map((s) => s.skipReason ?? "skipped"))];
      lines.push(`${skipped.length} skipped (${escapeHtml(reasons.join(", "))})`);
    }
    lines.push(marketLine);
    return lines.join("\n");
  }

  lines.push(`\n\u274C <b>${stale.length} issue${stale.length > 1 ? "s" : ""} found:</b>`);
  for (const s of stale) {
    const age = formatAge(s.ageHours);
    const limit = formatThreshold(s.thresholdHours);
    lines.push(`  \u{1F534} ${escapeHtml(s.label)}  (${age}, limit ${limit})`);
  }

  const summary: string[] = [];
  if (ok.length > 0) summary.push(`${ok.length} OK`);
  if (skipped.length > 0) {
    const reasons = [...new Set(skipped.map((s) => s.skipReason ?? "skipped"))];
    summary.push(`${skipped.length} skipped (${escapeHtml(reasons.join(", "))})`);
  }
  if (summary.length > 0) {
    lines.push(`\n${summary.join(", ")}`);
  }

  lines.push(marketLine);
  return lines.join("\n");
}
