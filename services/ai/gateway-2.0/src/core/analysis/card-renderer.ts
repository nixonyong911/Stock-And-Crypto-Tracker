/**
 * Reusable card renderer for Telegram morning briefs / Smart Digest.
 *
 * Uses Satori (JSX → SVG) + @resvg/resvg-js (SVG → PNG) to produce
 * a self-contained PNG buffer from structured signal data.
 *
 * Zero external API calls — everything runs locally in Node.js.
 */

import satori from "satori";
import { Resvg } from "@resvg/resvg-js";
import { readFile } from "node:fs/promises";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

// ── Types ─────────────────────────────────────────────────────────────

export interface CardData {
  ticker: string;
  price: number;
  changePercent: number;
  change5dPercent?: number;
  signalLabel: string;
  signalSentiment: "bullish" | "bearish" | "neutral";
  headline: string;
  narrative: string;
  confidence: "High" | "Medium" | "Low";
  risk: string;
  watchNext: string;
  timestamp: Date;
}

// ── Constants ─────────────────────────────────────────────────────────

const CARD_WIDTH = 600;

const COLORS = {
  cardBg: "#FFFFFF",
  headerBg: "#FAFAFA",
  border: "#E5E5E5",
  textPrimary: "#1A1A1A",
  textSecondary: "#6B7280",
  textMuted: "#9CA3AF",
  bullish: "#16A34A",
  bearish: "#DC2626",
  neutral: "#D97706",
  tickerBadgeBg: "#F3F4F6",
  gridSep: "#E5E5E5",
};

// ── Element helper (no JSX needed) ────────────────────────────────────

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
      children: flatChildren.length === 1 ? flatChildren[0] : flatChildren.length === 0 ? undefined : flatChildren,
    },
  };
}

// ── Fonts (loaded once) ───────────────────────────────────────────────

const __dirname = dirname(fileURLToPath(import.meta.url));
const FONTS_DIR = join(__dirname, "..", "..", "..", "assets", "fonts");

let fontsLoaded: { name: string; data: ArrayBuffer; weight: 400 | 700 }[] | null = null;

async function loadFonts() {
  if (fontsLoaded) return fontsLoaded;
  const [regular, bold] = await Promise.all([
    readFile(join(FONTS_DIR, "Inter-Regular.ttf")),
    readFile(join(FONTS_DIR, "Inter-Bold.ttf")),
  ]);
  fontsLoaded = [
    { name: "Inter", data: regular.buffer as ArrayBuffer, weight: 400 },
    { name: "Inter", data: bold.buffer as ArrayBuffer, weight: 700 },
  ];
  return fontsLoaded;
}

// ── Helpers ───────────────────────────────────────────────────────────

function sentimentColor(s: CardData["signalSentiment"]): string {
  return s === "bullish" ? COLORS.bullish : s === "bearish" ? COLORS.bearish : COLORS.neutral;
}

function changeColor(pct: number): string {
  return pct >= 0 ? COLORS.bullish : COLORS.bearish;
}

function fmtPrice(n: number): string {
  if (n >= 10000) return n.toLocaleString("en-US", { maximumFractionDigits: 0 });
  if (n >= 1) return n.toFixed(2);
  if (n >= 0.01) return n.toFixed(4);
  return n.toPrecision(4);
}

function fmtChange(pct: number): string {
  return `${pct >= 0 ? "+" : ""}${pct.toFixed(1)}%`;
}

function confidenceDots(level: CardData["confidence"]): SatoriNode {
  const filled = level === "High" ? 3 : level === "Medium" ? 2 : 1;
  const dots: SatoriNode[] = [];
  for (let i = 0; i < 3; i++) {
    dots.push(
      h("div", {
        key: String(i),
        style: {
          width: "8px",
          height: "8px",
          borderRadius: "50%",
          backgroundColor: i < filled ? COLORS.bullish : COLORS.border,
          marginRight: "3px",
        },
      }),
    );
  }
  return h("div", { style: { display: "flex", alignItems: "center" } }, ...dots);
}

function formatTimestamp(d: Date): string {
  const days = ["SUN", "MON", "TUE", "WED", "THU", "FRI", "SAT"];
  const months = ["JAN", "FEB", "MAR", "APR", "MAY", "JUN", "JUL", "AUG", "SEP", "OCT", "NOV", "DEC"];
  const day = days[d.getDay()]!;
  const month = months[d.getMonth()]!;
  const date = d.getDate();
  return `${day} \u00B7 ${month} ${date}`;
}

/**
 * Parse **bold** markers into Satori text elements.
 * Returns a single wrapping div with display:flex + flexWrap:wrap.
 */
function parseNarrative(text: string): SatoriNode {
  const parts = text.split(/(\*\*[^*]+\*\*)/g);
  const children = parts.map((part, i) => {
    if (part.startsWith("**") && part.endsWith("**")) {
      return h("span", { key: `b${i}`, style: { fontWeight: 700, color: COLORS.textPrimary } }, part.slice(2, -2));
    }
    return part;
  });
  return h("span", { style: { display: "flex", flexWrap: "wrap" } }, ...children);
}

// ── Card builder ──────────────────────────────────────────────────────

function buildCard(data: CardData): SatoriNode {
  const color = sentimentColor(data.signalSentiment);

  return h("div", {
    style: {
      display: "flex",
      flexDirection: "column",
      width: `${CARD_WIDTH}px`,
      backgroundColor: COLORS.cardBg,
      border: `1px solid ${COLORS.border}`,
      borderRadius: "16px",
      overflow: "hidden",
      fontFamily: "Inter",
    },
  },
    // ── Header ──
    h("div", {
      style: {
        display: "flex",
        justifyContent: "space-between",
        alignItems: "center",
        padding: "14px 24px",
        backgroundColor: COLORS.headerBg,
        borderBottom: `1px solid ${COLORS.border}`,
      },
    },
      h("div", {
        style: {
          display: "flex",
          alignItems: "center",
          fontSize: "13px",
          fontWeight: 700,
          color: COLORS.textPrimary,
        },
      },
        h("div", {
          style: {
            width: "4px",
            height: "20px",
            backgroundColor: color,
            borderRadius: "2px",
            marginRight: "10px",
          },
        }),
        `Morning brief \u00B7 ${data.ticker}`,
      ),
      h("span", {
        style: {
          fontSize: "11px",
          color: COLORS.textMuted,
          letterSpacing: "0.5px",
        },
      }, formatTimestamp(data.timestamp)),
    ),

    // ── Body ──
    h("div", {
      style: {
        display: "flex",
        flexDirection: "column",
        padding: "20px 24px",
      },
    },
      // Ticker + price
      h("div", {
        style: {
          display: "flex",
          alignItems: "center",
          gap: "12px",
          marginBottom: "12px",
        },
      },
        h("span", {
          style: {
            padding: "4px 10px",
            backgroundColor: COLORS.tickerBadgeBg,
            border: `1px solid ${COLORS.border}`,
            borderRadius: "6px",
            fontSize: "13px",
            fontWeight: 700,
            color: COLORS.textPrimary,
          },
        }, data.ticker),
        h("span", {
          style: { fontSize: "22px", fontWeight: 600, color: COLORS.textPrimary },
        }, `$${fmtPrice(data.price)}`),
        h("span", {
          style: { fontSize: "14px", fontWeight: 500, color: changeColor(data.changePercent) },
        }, fmtChange(data.changePercent)),
        data.change5dPercent !== undefined
          ? h("span", {
              style: { fontSize: "13px", color: COLORS.textSecondary },
            }, `\u00B7 5d ${fmtChange(data.change5dPercent)}`)
          : null,
      ),

      // Signal tag: "AAPL — MOMENTUM CONTINUATION"
      h("div", {
        style: {
          display: "flex",
          alignItems: "center",
          gap: "6px",
          marginBottom: "16px",
        },
      },
        h("div", {
          style: {
            width: "8px",
            height: "8px",
            borderRadius: "50%",
            backgroundColor: color,
          },
        }),
        h("span", {
          style: {
            fontSize: "11px",
            fontWeight: 700,
            color: color,
            letterSpacing: "1px",
            textTransform: "uppercase" as const,
          },
        }, `${data.ticker} \u2014 ${data.signalLabel}`),
      ),

      // Headline
      h("div", {
        style: {
          fontSize: "18px",
          fontWeight: 700,
          color: COLORS.textPrimary,
          lineHeight: "1.35",
          marginBottom: "12px",
        },
      }, data.headline),

      // Narrative
      h("div", {
        style: {
          display: "flex",
          fontSize: "14px",
          lineHeight: "1.55",
          color: COLORS.textSecondary,
          marginBottom: "20px",
        },
      }, parseNarrative(data.narrative)),
    ),

    // ── 2x2 Grid ──
    h("div", {
      style: {
        display: "flex",
        flexWrap: "wrap",
        borderTop: `1px solid ${COLORS.gridSep}`,
        borderBottom: `1px solid ${COLORS.gridSep}`,
      },
    },
      ...[
        { label: "SIGNAL", value: data.signalLabel.split(/\s*[\u00B7\u2014]\s*/).map(s => s.charAt(0).toUpperCase() + s.slice(1).toLowerCase()).join(" ") },
        { label: "CONFIDENCE", value: data.confidence, dots: true },
        { label: "RISK", value: data.risk },
        { label: "WATCH NEXT", value: data.watchNext },
      ].map((cell, i) =>
        h("div", {
          key: String(i),
          style: {
            display: "flex",
            flexDirection: "column",
            width: "50%",
            padding: "14px 24px",
            borderRight: i % 2 === 0 ? `1px solid ${COLORS.gridSep}` : "none",
            borderBottom: i < 2 ? `1px solid ${COLORS.gridSep}` : "none",
          },
        },
          h("span", {
            style: {
              fontSize: "10px",
              fontWeight: 700,
              color: COLORS.textMuted,
              letterSpacing: "1px",
              textTransform: "uppercase" as const,
              marginBottom: "4px",
            },
          }, cell.label),
          h("div", {
            style: {
              display: "flex",
              alignItems: "center",
              gap: "6px",
              fontSize: "14px",
              color: COLORS.textPrimary,
              lineHeight: "1.4",
            },
          },
            cell.dots ? confidenceDots(data.confidence) : null,
            cell.value,
          ),
        ),
      ),
    ),

  );
}

// ── Public API ─────────────────────────────────────────────────────────

export async function renderCard(data: CardData): Promise<Buffer> {
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
  const pngData = resvg.render();
  return Buffer.from(pngData.asPng());
}

export function buildCardCaption(data: CardData): string {
  return `Morning brief \u00B7 ${data.ticker} \u00B7 $${fmtPrice(data.price)} (${fmtChange(data.changePercent)})`;
}
