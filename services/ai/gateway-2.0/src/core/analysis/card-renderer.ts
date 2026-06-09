/**
 * Reusable card renderer for Telegram Smart Digest briefs.
 *
 * Uses Satori (JSX-like → SVG) + @resvg/resvg-js (SVG → PNG) to produce
 * a self-contained PNG buffer from structured signal data.
 *
 * "At-a-glance" redesign: logo + ticker + company name, a 1-5 star
 * conviction row, a 5-level bull/bear stance pill, the price block, a
 * "Levels to Watch" gradient bar, a rule-based Action Guide, and the
 * analyst consensus. Prose (what's-happening / context) is dropped from the
 * visual but preserved for the Telegram caption.
 *
 * Zero external API calls — everything runs locally in Node.js.
 */

import satori from "satori";
import { Resvg } from "@resvg/resvg-js";
import { readFile } from "node:fs/promises";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import type { Stance5, Stance5Tone, LevelsBar } from "./smart-digest-score.js";

// ── Types ─────────────────────────────────────────────────────────────

export type StatusTone = "watch" | "trigger" | "neutral";

export type WatchCategory = "setup" | "breakout" | "defensive";

export interface CardData {
  ticker: string;
  /** Full company name (stocks). Absent for crypto / no coverage. */
  companyName?: string;
  /** Self-contained `data:` URI for the company logo. Absent = initials. */
  logoDataUri?: string;
  status: { label: string; tone: StatusTone };
  /**
   * 5-level bull/bear stance shown top-right. Optional so stale persisted
   * payloads (pre-redesign) still render via a Neutral default.
   */
  stance5?: Stance5;
  /** Conviction stars, integer 0-5. */
  stars?: number;
  /** "Levels to Watch" bar. Absent when range/entry/target data is missing. */
  levelsBar?: LevelsBar;
  /** Rule-based action sentence. */
  actionGuide?: string;
  price: number;
  changePercent: number;
  /** Absolute price move vs the session open, in quote currency. */
  changeAmount?: number;
  confidence: "High" | "Medium" | "Low";
  /**
   * Timestamp of the underlying DB truth (e.g. price targets analysis_date).
   * `null` means no source-derived timestamp was available; the renderer
   * shows `"data unavailable"` in that case rather than substituting wall
   * clock time.
   */
  updatedAt: Date | null;
  whatHappening: string;
  whatToWatch: {
    holdAbove: string;
    breakBelowTarget: string;
    watchCategory?: WatchCategory;
  };
  /**
   * Wall Street analyst Buy/Hold/Sell mix. Rendered as the Analyst Consensus
   * section. Percentages are integers summing to 100. Absent for
   * crypto/ETF/index or stocks without analyst coverage.
   */
  analystMix?: {
    buyPct: number;
    holdPct: number;
    sellPct: number;
    total: number;
    consensus: string | null;
  };
  context: string;
}

// ── Constants ─────────────────────────────────────────────────────────

const CARD_WIDTH = 600;

const COLORS = {
  cardBg: "#FFFFFF",
  border: "#E5E7EB",
  lineSoft: "#EEF0F2",
  ink: "#0E0E0C",
  ink2: "#3F4147",
  ink3: "#6B7280",
  ink4: "#9AA0A6",
  brand: "#16A34A",
  brandTintBg: "#ECFDF5",
  brandPillBg: "#DCFCE7",
  neutralBg: "#F3F4F6",
  red: "#DC2626",
  redPillBg: "#FEE2E2",
  // Star conviction row
  star: "#F59E0B",
  starEmpty: "#E5E7EB",
  // Levels-to-Watch zone gradients (depth of color = conviction).
  // Buy: deep green at the cheap end (strong buy) → pale green (weak buy).
  // Sell: pale red (weak sell) → deep red at the top (strong sell).
  gradGreen: "#22C55E",
  gradMid: "#E5E7EB",
  gradRed: "#EF4444",
  buyStrong: "#15803D",
  buyWeak: "#A7F3C8",
  sellWeak: "#FCA5A5",
  sellStrong: "#B91C1C",
  // Analyst consensus columns
  buy: "#16A34A",
  hold: "#CA8A04",
  sell: "#DC2626",
};

// ── Element helper (avoids JSX dependency) ────────────────────────────

type SatoriNode =
  | { type: string; props: Record<string, unknown>; key?: string | null }
  | string;

function h(
  type: string,
  props: Record<string, unknown> | null,
  ...children: (SatoriNode | SatoriNode[] | string | number | null | undefined | false)[]
): SatoriNode {
  const flatChildren: unknown[] = [];
  for (const c of children) {
    if (c === null || c === undefined || c === false) continue;
    if (Array.isArray(c)) flatChildren.push(...c);
    else flatChildren.push(typeof c === "number" ? String(c) : c);
  }
  return {
    type,
    props: {
      ...(props ?? {}),
      children:
        flatChildren.length === 1 ? flatChildren[0] : flatChildren.length === 0 ? undefined : flatChildren,
    },
  };
}

// ── Fonts (loaded once) ───────────────────────────────────────────────

const __dirname = dirname(fileURLToPath(import.meta.url));
const FONTS_DIR = join(__dirname, "..", "..", "..", "assets", "fonts");

let fontsLoaded:
  | { name: string; data: ArrayBuffer; weight: 400 | 700 }[]
  | null = null;

async function loadFonts() {
  if (fontsLoaded) return fontsLoaded;
  try {
    const [regular, bold] = await Promise.all([
      readFile(join(FONTS_DIR, "Inter-Regular.ttf")),
      readFile(join(FONTS_DIR, "Inter-Bold.ttf")),
    ]);
    fontsLoaded = [
      { name: "Inter", data: regular.buffer as ArrayBuffer, weight: 400 },
      { name: "Inter", data: bold.buffer as ArrayBuffer, weight: 700 },
    ];
    return fontsLoaded;
  } catch (err) {
    throw new Error(
      `Failed to load Inter fonts from ${FONTS_DIR}: ${err instanceof Error ? err.message : String(err)}`,
    );
  }
}

// ── Formatting helpers ────────────────────────────────────────────────

function clamp(n: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, n));
}

function fmtPrice(n: number): string {
  if (n >= 10000) return n.toLocaleString("en-US", { maximumFractionDigits: 0 });
  if (n >= 1) return n.toFixed(2);
  if (n >= 0.01) return n.toFixed(4);
  return n.toPrecision(4);
}

function fmtChangePct(pct: number): string {
  return `${Math.abs(pct).toFixed(2)}%`;
}

/**
 * Format an absolute price move. Precision mirrors the *price* magnitude
 * (not the move's own size) so a $0.55 move on a $46 stock reads "$0.55"
 * rather than "$0.5500", while sub-dollar assets keep their finer precision.
 */
function fmtChangeAmount(amount: number, price: number): string {
  const a = Math.abs(amount);
  let s: string;
  if (price >= 10000) s = a.toLocaleString("en-US", { maximumFractionDigits: 2 });
  else if (price >= 1) s = a.toFixed(2);
  else if (price >= 0.01) s = a.toFixed(4);
  else s = a.toPrecision(4);
  return `$${s}`;
}

function hasChangeAmount(amount: number | undefined): amount is number {
  return typeof amount === "number" && Number.isFinite(amount) && Math.abs(amount) > 0;
}

function changeArrow(pct: number): string {
  return pct >= 0 ? "\u25B2" : "\u25BC";
}

function changeColor(pct: number): string {
  return pct >= 0 ? COLORS.brand : COLORS.red;
}

function truncate(s: string, max: number): string {
  return s.length > max ? `${s.slice(0, max - 1)}\u2026` : s;
}

/**
 * Produces "May 9, 7:32 AM ET" from a Date (interpreted in
 * America/New_York). Returns `"data unavailable"` when no source-derived
 * timestamp exists — the renderer never substitutes wall clock time.
 */
function formatUpdatedAt(d: Date | null): string {
  if (d == null) return "data unavailable";
  try {
    const parts = new Intl.DateTimeFormat("en-US", {
      month: "short",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
      timeZone: "America/New_York",
      hour12: true,
    }).formatToParts(d);
    const month = parts.find((p) => p.type === "month")?.value ?? "";
    const day = parts.find((p) => p.type === "day")?.value ?? "";
    const hour = parts.find((p) => p.type === "hour")?.value ?? "";
    const minute = parts.find((p) => p.type === "minute")?.value ?? "";
    const dp = parts.find((p) => p.type === "dayPeriod")?.value ?? "";
    return `${month} ${day}, ${hour}:${minute} ${dp} ET`;
  } catch {
    return d.toUTCString();
  }
}

// ── Sub-components ────────────────────────────────────────────────────

function sectionLabel(text: string): SatoriNode {
  return h(
    "div",
    {
      style: {
        display: "flex",
        fontSize: "10px",
        fontWeight: 700,
        letterSpacing: "0.1em",
        textTransform: "uppercase",
        color: COLORS.ink4,
      },
    },
    text,
  );
}

// ── Header: logo / ticker / name / stars / stance ─────────────────────

function logoOrInitials(data: CardData): SatoriNode {
  if (data.logoDataUri) {
    return h("img", {
      src: data.logoDataUri,
      width: 44,
      height: 44,
      style: {
        width: "44px",
        height: "44px",
        borderRadius: "10px",
        objectFit: "contain",
        backgroundColor: COLORS.cardBg,
        border: `1px solid ${COLORS.border}`,
      },
    });
  }
  const initials = data.ticker.replace(/[^A-Za-z0-9]/g, "").slice(0, 2).toUpperCase();
  return h(
    "div",
    {
      style: {
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        width: "44px",
        height: "44px",
        borderRadius: "10px",
        backgroundColor: COLORS.neutralBg,
        border: `1px solid ${COLORS.border}`,
        fontSize: "16px",
        fontWeight: 700,
        color: COLORS.ink2,
      },
    },
    initials,
  );
}

const STAR_PATH =
  "M12 17.27L18.18 21l-1.64-7.03L22 9.24l-7.19-.61L12 2 9.19 8.63 2 9.24l5.46 4.73L5.82 21z";

function starSvg(filled: boolean): SatoriNode {
  return h(
    "svg",
    {
      width: 15,
      height: 15,
      viewBox: "0 0 24 24",
      fill: filled ? COLORS.star : "none",
      stroke: filled ? COLORS.star : COLORS.starEmpty,
      strokeWidth: 1.5,
    },
    h("path", { d: STAR_PATH, strokeLinejoin: "round" }),
  );
}

function starsRow(stars: number): SatoriNode {
  const n = clamp(Math.round(stars), 0, 5);
  return h(
    "div",
    { style: { display: "flex", alignItems: "center", gap: "2px", marginTop: "3px" } },
    ...[0, 1, 2, 3, 4].map((i) => starSvg(i < n)),
  );
}

function stance5Colors(tone: Stance5Tone): { fg: string; bg: string; arrow: string } {
  switch (tone) {
    case "bullish":
      return { fg: "#15803D", bg: COLORS.brandPillBg, arrow: "\u25B2" };
    case "lean_bullish":
      return { fg: "#16A34A", bg: COLORS.brandTintBg, arrow: "\u25B2" };
    case "lean_bearish":
      return { fg: "#C2410C", bg: "#FFEDD5", arrow: "\u25BC" };
    case "bearish":
      return { fg: "#B91C1C", bg: COLORS.redPillBg, arrow: "\u25BC" };
    default:
      return { fg: "#4B5563", bg: COLORS.neutralBg, arrow: "" };
  }
}

function stance5Pill(stance: Stance5): SatoriNode {
  const c = stance5Colors(stance.tone);
  return h(
    "div",
    {
      style: {
        display: "flex",
        alignItems: "center",
        gap: "5px",
        padding: "5px 12px",
        borderRadius: "999px",
        backgroundColor: c.bg,
        fontSize: "13px",
        fontWeight: 700,
        color: c.fg,
        letterSpacing: "0.01em",
      },
    },
    c.arrow ? h("div", { style: { display: "flex", fontSize: "10px", color: c.fg } }, c.arrow) : false,
    stance.label,
  );
}

function deltaPill(pct: number, price: number, amount?: number): SatoriNode {
  const positive = pct >= 0;
  const text = hasChangeAmount(amount)
    ? `${fmtChangeAmount(amount, price)} \u00B7 ${fmtChangePct(pct)}`
    : fmtChangePct(pct);
  return h(
    "div",
    {
      style: {
        display: "flex",
        alignItems: "center",
        gap: "4px",
        padding: "2px 8px",
        borderRadius: "6px",
        backgroundColor: positive ? COLORS.brandPillBg : COLORS.redPillBg,
        fontSize: "12px",
        fontWeight: 500,
        color: changeColor(pct),
      },
    },
    changeArrow(pct),
    text,
  );
}

// ── Levels to Watch ───────────────────────────────────────────────────

function fmtZone(z?: { low: number; high: number }): string {
  if (!z) return "\u2014";
  if (Math.abs(z.high - z.low) < 1e-9) return `$${fmtPrice(z.low)}`;
  return `$${fmtPrice(z.low)}\u2013$${fmtPrice(z.high)}`;
}

function levelsTrack(bar: LevelsBar): SatoriNode {
  const span = bar.max - bar.min;
  const pos = (v: number) =>
    span > 0 ? clamp((v - bar.min) / span, 0, 1) * 100 : 50;
  const currentPct = pos(bar.current);

  // One continuous left→right gradient anchored to the zone positions, so the
  // colour softly transitions buy → no-action → sell instead of hard segment
  // edges. Depth of colour still conveys conviction (deep green = strong buy
  // at the cheap end, deep red = strong sell at the top); grey marks the
  // no-action band in the middle.
  const buyHigh = bar.buyZone ? pos(bar.buyZone.high) : 0;
  const sellLow = bar.sellZone ? pos(bar.sellZone.low) : 100;
  const stops: Array<[string, number]> = [];

  if (bar.buyZone) {
    stops.push([COLORS.buyStrong, pos(bar.buyZone.low)]);
    stops.push([COLORS.buyWeak, buyHigh]);
  } else {
    stops.push([COLORS.gradMid, 0]);
  }

  // Grey no-action plateau across the gap, with soft fades on both sides.
  const gap = sellLow - buyHigh;
  if (gap > 4) {
    const inset = gap * 0.35;
    stops.push([COLORS.gradMid, buyHigh + inset]);
    stops.push([COLORS.gradMid, sellLow - inset]);
  } else if (gap > 0) {
    stops.push([COLORS.gradMid, buyHigh + gap / 2]);
  }

  if (bar.sellZone) {
    stops.push([COLORS.sellWeak, sellLow]);
    stops.push([COLORS.sellStrong, pos(bar.sellZone.high)]);
  } else {
    stops.push([COLORS.gradMid, 100]);
  }

  // Keep stop positions monotonic non-decreasing (zones can abut/overlap).
  for (let i = 1; i < stops.length; i++) {
    if (stops[i]![1] < stops[i - 1]![1]) stops[i]![1] = stops[i - 1]![1];
  }

  const gradient = `linear-gradient(to right, ${stops
    .map(([c, p]) => `${c} ${clamp(p, 0, 100).toFixed(2)}%`)
    .join(", ")})`;

  return h(
    "div",
    {
      style: {
        position: "relative",
        display: "flex",
        width: "100%",
        height: "10px",
        borderRadius: "5px",
        backgroundImage: gradient,
        marginTop: "6px",
        marginBottom: "12px",
      },
    },
    h("div", {
      style: {
        position: "absolute",
        left: `${currentPct}%`,
        top: "-3px",
        width: "16px",
        height: "16px",
        borderRadius: "50%",
        backgroundColor: COLORS.ink,
        border: "3px solid #FFFFFF",
        transform: "translateX(-50%)",
      },
    }),
  );
}

function zoneColumn(
  label: string,
  value: string,
  color: string,
  align: "flex-start" | "center" | "flex-end",
): SatoriNode {
  return h(
    "div",
    { style: { display: "flex", flexDirection: "column", alignItems: align, gap: "2px" } },
    h(
      "div",
      {
        style: {
          display: "flex",
          fontSize: "9.5px",
          fontWeight: 700,
          letterSpacing: "0.08em",
          textTransform: "uppercase",
          color,
        },
      },
      label,
    ),
    h(
      "div",
      { style: { display: "flex", fontSize: "13.5px", fontWeight: 700, color: COLORS.ink } },
      value,
    ),
  );
}

function buildLevelsSection(data: CardData): SatoriNode {
  const bar = data.levelsBar;
  return h(
    "div",
    {
      style: {
        display: "flex",
        flexDirection: "column",
        gap: "2px",
        marginBottom: "16px",
      },
    },
    sectionLabel("Levels to Watch"),
    bar
      ? h(
          "div",
          { style: { display: "flex", flexDirection: "column", width: "100%" } },
          levelsTrack(bar),
          h(
            "div",
            {
              style: {
                display: "flex",
                alignItems: "flex-start",
                justifyContent: "space-between",
                width: "100%",
              },
            },
            zoneColumn("Buy Zone", fmtZone(bar.buyZone), COLORS.buy, "flex-start"),
            zoneColumn("Sell Zone", fmtZone(bar.sellZone), COLORS.sell, "flex-end"),
          ),
        )
      : h(
          "div",
          { style: { display: "flex", marginTop: "6px" } },
          buildWatchSentence(data),
        ),
  );
}

// ── Watch sentence (fallback when no levels bar) ──────────────────────

function levelChip(value: string): SatoriNode {
  return h(
    "div",
    {
      style: {
        display: "flex",
        alignItems: "center",
        backgroundColor: COLORS.cardBg,
        border: `1px solid ${COLORS.border}`,
        borderRadius: "5px",
        padding: "1px 7px",
        margin: "0 4px",
        fontSize: "13px",
        color: COLORS.ink,
        letterSpacing: "0.02em",
        whiteSpace: "nowrap",
      },
    },
    value,
  );
}

function dollarChip(value: string): SatoriNode {
  const display = value === "\u2014" ? value : `$${value}`;
  return levelChip(display);
}

function buildWatchSentence(data: CardData): SatoriNode {
  const cat = data.whatToWatch.watchCategory ?? "setup";
  const hold = data.whatToWatch.holdAbove;
  const brk = data.whatToWatch.breakBelowTarget;
  const hasBreak = brk !== "\u2014";

  const watchStyle = {
    display: "flex" as const,
    flexWrap: "wrap" as const,
    alignItems: "baseline" as const,
    fontSize: "14px",
    lineHeight: 1.7,
    color: COLORS.ink2,
  };

  if (!hasBreak) {
    return h("div", { style: watchStyle }, "Key level to watch: ", dollarChip(hold), ".");
  }

  switch (cat) {
    case "breakout":
      return h(
        "div",
        { style: watchStyle },
        "Holding above ",
        dollarChip(hold),
        " keeps the breakout intact. Losing ",
        dollarChip(brk),
        " reopens the prior range.",
      );
    case "defensive":
      return h(
        "div",
        { style: watchStyle },
        "Reclaiming ",
        dollarChip(hold),
        " would stabilize the setup. Below ",
        dollarChip(brk),
        ", further downside opens up.",
      );
    default:
      return h(
        "div",
        { style: watchStyle },
        "Hold above ",
        dollarChip(hold),
        " — a daily close below ",
        dollarChip(brk),
        " opens room to the downside.",
      );
  }
}

// ── Action Guide ──────────────────────────────────────────────────────

function bulbIcon(): SatoriNode {
  return h(
    "svg",
    {
      width: 18,
      height: 18,
      viewBox: "0 0 24 24",
      fill: "none",
      stroke: COLORS.brand,
      strokeWidth: 2,
      strokeLinecap: "round",
      strokeLinejoin: "round",
    },
    h("path", { d: "M9 18h6" }),
    h("path", { d: "M10 22h4" }),
    h("path", {
      d: "M12 2a7 7 0 0 0-4 12.7c.6.5 1 1.3 1 2.1h6c0-.8.4-1.6 1-2.1A7 7 0 0 0 12 2z",
    }),
  );
}

function buildActionGuidePanel(text: string): SatoriNode {
  return h(
    "div",
    {
      style: {
        display: "flex",
        alignItems: "flex-start",
        gap: "10px",
        padding: "12px 14px",
        backgroundColor: COLORS.brandTintBg,
        borderRadius: "10px",
        borderLeft: `3px solid ${COLORS.brand}`,
        marginBottom: "16px",
      },
    },
    h("div", { style: { display: "flex", paddingTop: "1px" } }, bulbIcon()),
    h(
      "div",
      { style: { display: "flex", flexDirection: "column", gap: "4px", flex: 1 } },
      sectionLabel("Action Guide"),
      h(
        "div",
        { style: { display: "flex", fontSize: "14px", lineHeight: 1.5, color: COLORS.ink2 } },
        text,
      ),
    ),
  );
}

// ── Analyst Consensus ─────────────────────────────────────────────────

type AnalystMixData = NonNullable<CardData["analystMix"]>;

function consensusColumn(label: string, pct: number, color: string): SatoriNode {
  return h(
    "div",
    { style: { display: "flex", flexDirection: "column", alignItems: "center", gap: "2px", flex: 1 } },
    h(
      "div",
      { style: { display: "flex", fontSize: "22px", fontWeight: 700, color, lineHeight: 1 } },
      `${pct}%`,
    ),
    h(
      "div",
      {
        style: {
          display: "flex",
          fontSize: "10px",
          fontWeight: 700,
          letterSpacing: "0.08em",
          textTransform: "uppercase",
          color: COLORS.ink3,
        },
      },
      label,
    ),
  );
}

function buildConsensusPanel(mix: AnalystMixData): SatoriNode {
  return h(
    "div",
    {
      style: {
        display: "flex",
        flexDirection: "column",
        gap: "10px",
        marginBottom: "16px",
      },
    },
    h(
      "div",
      { style: { display: "flex", alignItems: "center", justifyContent: "space-between" } },
      sectionLabel("Analyst Consensus"),
      h(
        "div",
        {
          style: {
            display: "flex",
            fontSize: "10px",
            fontWeight: 700,
            letterSpacing: "0.1em",
            textTransform: "uppercase",
            color: COLORS.ink4,
          },
        },
        `${mix.total} ${mix.total === 1 ? "firm" : "firms"}`,
      ),
    ),
    h(
      "div",
      {
        style: {
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "10px 0",
          borderTop: `1px solid ${COLORS.lineSoft}`,
          borderBottom: `1px solid ${COLORS.lineSoft}`,
        },
      },
      consensusColumn("Buy", mix.buyPct, COLORS.buy),
      consensusColumn("Hold", mix.holdPct, COLORS.hold),
      consensusColumn("Sell", mix.sellPct, COLORS.sell),
    ),
  );
}

// ── Main builder ──────────────────────────────────────────────────────

function buildCard(data: CardData): SatoriNode {
  const stance: Stance5 = data.stance5 ?? { label: "Neutral", tone: "neutral" };
  const stars = data.stars ?? 0;
  const actionGuide = data.actionGuide ?? "";

  return h(
    "div",
    {
      style: {
        display: "flex",
        flexDirection: "column",
        width: `${CARD_WIDTH}px`,
        backgroundColor: COLORS.cardBg,
        border: `1px solid ${COLORS.border}`,
        borderRadius: "16px",
        padding: "26px 28px 20px",
        fontFamily: "Inter",
        color: COLORS.ink,
      },
    },

    // ── Eyebrow bar: "Smart Digest" ─────────────────────────────
    h(
      "div",
      { style: { display: "flex", alignItems: "center", marginBottom: "14px" } },
      h(
        "div",
        {
          style: {
            fontSize: "11.5px",
            fontWeight: 700,
            letterSpacing: "0.12em",
            textTransform: "uppercase",
            color: COLORS.brand,
          },
        },
        "Smart Digest",
      ),
    ),

    // ── Header: logo + ticker/name/stars (left), stance pill (right)
    h(
      "div",
      {
        style: {
          display: "flex",
          alignItems: "flex-start",
          justifyContent: "space-between",
          marginBottom: "16px",
        },
      },
      h(
        "div",
        { style: { display: "flex", alignItems: "center", gap: "12px" } },
        logoOrInitials(data),
        h(
          "div",
          { style: { display: "flex", flexDirection: "column" } },
          h(
            "div",
            {
              style: {
                display: "flex",
                fontSize: "22px",
                fontWeight: 700,
                color: COLORS.ink,
                letterSpacing: "-0.01em",
                lineHeight: 1.1,
              },
            },
            data.ticker,
          ),
          data.companyName
            ? h(
                "div",
                { style: { display: "flex", fontSize: "12px", color: COLORS.ink3, marginTop: "1px" } },
                truncate(data.companyName, 38),
              )
            : false,
          starsRow(stars),
        ),
      ),
      stance5Pill(stance),
    ),

    // ── Price row ───────────────────────────────────────────────
    h(
      "div",
      {
        style: {
          display: "flex",
          alignItems: "baseline",
          gap: "14px",
          marginBottom: "18px",
        },
      },
      h(
        "div",
        {
          style: {
            fontSize: "42px",
            fontWeight: 700,
            color: COLORS.ink,
            letterSpacing: "-0.02em",
            lineHeight: 1,
          },
        },
        `$${fmtPrice(data.price)}`,
      ),
      deltaPill(data.changePercent, data.price, data.changeAmount),
      h(
        "div",
        {
          style: {
            fontSize: "10.5px",
            fontWeight: 500,
            letterSpacing: "0.08em",
            textTransform: "uppercase",
            color: COLORS.ink4,
          },
        },
        "Today",
      ),
    ),

    // ── Divider ─────────────────────────────────────────────────
    h("div", {
      style: { display: "flex", height: "1px", backgroundColor: COLORS.lineSoft, marginBottom: "14px" },
    }),

    // ── Levels to Watch ─────────────────────────────────────────
    buildLevelsSection(data),

    // ── Action Guide ────────────────────────────────────────────
    actionGuide ? buildActionGuidePanel(actionGuide) : false,

    // ── Analyst Consensus (stocks with coverage) ────────────────
    data.analystMix ? buildConsensusPanel(data.analystMix) : false,

    // ── Footer ──────────────────────────────────────────────────
    h(
      "div",
      {
        style: {
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          paddingTop: "12px",
          borderTop: `1px solid ${COLORS.lineSoft}`,
        },
      },
      h(
        "div",
        { style: { fontSize: "11px", color: COLORS.ink4, letterSpacing: "0.02em" } },
        `Updated ${formatUpdatedAt(data.updatedAt)}`,
      ),
      h(
        "div",
        { style: { fontSize: "11px", color: COLORS.ink4, letterSpacing: "0.02em" } },
        "/watchlist",
      ),
    ),
  );
}

// ── Public API ────────────────────────────────────────────────────────

export async function renderCard(data: CardData): Promise<Buffer> {
  try {
    const fonts = await loadFonts();
    const element = buildCard(data);

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const svg = await satori(element as any, {
      width: CARD_WIDTH,
      fonts,
    });

    const resvg = new Resvg(svg, {
      fitTo: { mode: "width", value: CARD_WIDTH * 2 },
    });
    return Buffer.from(resvg.render().asPng());
  } catch (err) {
    throw new Error(
      `Failed to render card for ${data.ticker}: ${err instanceof Error ? err.message : String(err)}`,
    );
  }
}

export function buildCardCaption(data: CardData): string {
  const arrow = changeArrow(data.changePercent);
  const label = data.stance5?.label ?? data.status.label;
  const amt = hasChangeAmount(data.changeAmount)
    ? `${fmtChangeAmount(data.changeAmount, data.price)} \u00B7 `
    : "";
  return `${data.ticker} \u00B7 $${fmtPrice(data.price)} (${arrow} ${amt}${fmtChangePct(data.changePercent)}) \u2014 ${label}`;
}
