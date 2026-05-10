/**
 * Reusable card renderer for Telegram Smart Digest briefs.
 *
 * Uses Satori (JSX-like → SVG) + @resvg/resvg-js (SVG → PNG) to produce
 * a self-contained PNG buffer from structured signal data.
 *
 * Visual reference: services/frontend/src/components/sections/home/anatomy-section.tsx
 * (.ana-* classes in services/frontend/src/app/globals.css).
 *
 * Zero external API calls — everything runs locally in Node.js.
 */

import satori from "satori";
import { Resvg } from "@resvg/resvg-js";
import { readFile } from "node:fs/promises";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

// ── Types ─────────────────────────────────────────────────────────────

export type StatusTone = "watch" | "trigger" | "neutral";

export interface CardData {
  ticker: string;
  status: { label: string; tone: StatusTone };
  price: number;
  changePercent: number;
  confidence: "High" | "Medium" | "Low";
  /**
   * Timestamp of the underlying DB truth (e.g. price targets analysis_date).
   * `null` means no source-derived timestamp was available; the renderer
   * shows `"data unavailable"` in that case rather than substituting wall
   * clock time.
   */
  updatedAt: Date | null;
  whatHappening: string;
  whatToWatch: { holdAbove: string; breakBelowTarget: string };
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
  watchYellow: "#EAB308",
  watchYellowBg: "rgba(234,179,8,0.16)",
  watchYellowBorder: "rgba(234,179,8,0.28)",
  neutralBg: "#F3F4F6",
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

function fmtPrice(n: number): string {
  if (n >= 10000) return n.toLocaleString("en-US", { maximumFractionDigits: 0 });
  if (n >= 1) return n.toFixed(2);
  if (n >= 0.01) return n.toFixed(4);
  return n.toPrecision(4);
}

function fmtChangePct(pct: number): string {
  return `${Math.abs(pct).toFixed(2)}%`;
}

function changeArrow(pct: number): string {
  return pct >= 0 ? "\u25B2" : "\u25BC";
}

function changeColor(pct: number): string {
  return pct >= 0 ? COLORS.brand : "#DC2626";
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

function watchPillColors(tone: StatusTone): { bg: string; border: string; dot: string } {
  if (tone === "watch") {
    return { bg: COLORS.watchYellowBg, border: COLORS.watchYellowBorder, dot: COLORS.watchYellow };
  }
  if (tone === "trigger") {
    return { bg: COLORS.brandPillBg, border: "rgba(22,163,74,0.36)", dot: COLORS.brand };
  }
  return { bg: COLORS.neutralBg, border: COLORS.border, dot: COLORS.ink4 };
}

function statusPill(status: CardData["status"]): SatoriNode {
  const c = watchPillColors(status.tone);
  return h(
    "div",
    {
      style: {
        display: "flex",
        alignItems: "center",
        gap: "6px",
        padding: "2px 10px 3px",
        borderRadius: "999px",
        backgroundColor: c.bg,
        border: `1px solid ${c.border}`,
        fontSize: "12px",
        fontWeight: 500,
        color: COLORS.ink2,
        lineHeight: 1.5,
      },
    },
    h("div", {
      style: {
        width: "6px",
        height: "6px",
        borderRadius: "50%",
        backgroundColor: c.dot,
      },
    }),
    status.label,
  );
}

function confidenceBars(level: CardData["confidence"]): SatoriNode {
  const filled = level === "High" ? 3 : level === "Medium" ? 2 : 1;
  const heights = [5, 8, 12];
  const bars: SatoriNode[] = [];
  for (let i = 0; i < 3; i++) {
    bars.push(
      h("div", {
        key: String(i),
        style: {
          width: "3px",
          height: `${heights[i]}px`,
          backgroundColor: i < filled ? COLORS.brand : COLORS.border,
          borderRadius: "1px",
        },
      }),
    );
  }
  return h(
    "div",
    {
      style: { display: "flex", alignItems: "flex-end", gap: "2px", height: "12px" },
    },
    ...bars,
  );
}

function deltaPill(pct: number): SatoriNode {
  const positive = pct >= 0;
  return h(
    "div",
    {
      style: {
        display: "flex",
        alignItems: "center",
        gap: "4px",
        padding: "2px 8px",
        borderRadius: "6px",
        backgroundColor: positive ? COLORS.brandPillBg : "#FEE2E2",
        fontSize: "12px",
        fontWeight: 500,
        color: changeColor(pct),
      },
    },
    changeArrow(pct),
    fmtChangePct(pct),
  );
}

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

function clockIcon(): SatoriNode {
  return h(
    "svg",
    {
      width: 12,
      height: 12,
      viewBox: "0 0 24 24",
      fill: "none",
      stroke: COLORS.brand,
      strokeWidth: 2.5,
      strokeLinecap: "round",
      strokeLinejoin: "round",
    },
    h("circle", { cx: 12, cy: 12, r: 10 }),
    h("polyline", { points: "12 6 12 12 16 14" }),
  );
}

function sectionLabel(text: string, accent = false): SatoriNode {
  return h(
    "div",
    {
      style: {
        display: "flex",
        alignItems: "center",
        gap: "6px",
        fontSize: "10px",
        fontWeight: 700,
        letterSpacing: "0.1em",
        textTransform: "uppercase",
        color: accent ? COLORS.brand : COLORS.ink4,
      },
    },
    accent ? clockIcon() : null,
    text,
  );
}

function paragraph(text: string, opts?: { color?: string }): SatoriNode {
  return h(
    "div",
    {
      style: {
        display: "flex",
        fontSize: "14px",
        lineHeight: 1.55,
        color: opts?.color ?? COLORS.ink2,
      },
    },
    text,
  );
}

// ── Main builder ──────────────────────────────────────────────────────

function buildCard(data: CardData): SatoriNode {
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
        padding: "28px 28px 22px",
        fontFamily: "Inter",
        color: COLORS.ink,
      },
    },

    // ── Eyebrow bar: "Smart Digest" left, Confidence right ──────
    h(
      "div",
      {
        style: {
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          marginBottom: "14px",
        },
      },
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
      h(
        "div",
        {
          style: {
            display: "flex",
            alignItems: "center",
            gap: "5px",
            fontSize: "10px",
            fontWeight: 700,
            letterSpacing: "0.1em",
            textTransform: "uppercase",
            color: COLORS.ink4,
          },
        },
        confidenceBars(data.confidence),
        h(
          "div",
          {
            style: {
              fontSize: "10px",
              fontWeight: 700,
              color: COLORS.ink3,
              letterSpacing: "0.08em",
            },
          },
          data.confidence.toUpperCase(),
        ),
      ),
    ),

    // ── Ticker row ──────────────────────────────────────────────
    h(
      "div",
      {
        style: {
          display: "flex",
          alignItems: "center",
          gap: "10px",
          marginBottom: "6px",
        },
      },
      h(
        "div",
        {
          style: {
            fontSize: "14px",
            fontWeight: 700,
            color: COLORS.ink,
            letterSpacing: "0.04em",
          },
        },
        data.ticker,
      ),
      statusPill(data.status),
    ),

    // ── Price row ───────────────────────────────────────────────
    h(
      "div",
      {
        style: {
          display: "flex",
          alignItems: "baseline",
          gap: "14px",
          marginBottom: "22px",
        },
      },
      h(
        "div",
        {
          style: {
            fontSize: "44px",
            fontWeight: 700,
            color: COLORS.ink,
            letterSpacing: "-0.02em",
            lineHeight: 1,
          },
        },
        `$${fmtPrice(data.price)}`,
      ),
      deltaPill(data.changePercent),
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

    // ── What's happening ────────────────────────────────────────
    h(
      "div",
      {
        style: { display: "flex", flexDirection: "column", gap: "8px", marginBottom: "18px" },
      },
      sectionLabel("What's happening"),
      paragraph(data.whatHappening),
    ),

    // ── What to watch (accent panel) ────────────────────────────
    h(
      "div",
      {
        style: {
          display: "flex",
          flexDirection: "column",
          gap: "8px",
          padding: "12px 14px",
          backgroundColor: COLORS.brandTintBg,
          borderRadius: "10px",
          borderLeft: `3px solid ${COLORS.brand}`,
          marginBottom: "18px",
        },
      },
      sectionLabel("What to watch", true),
      h(
        "div",
        {
          style: {
            display: "flex",
            flexWrap: "wrap",
            alignItems: "baseline",
            fontSize: "14px",
            lineHeight: 1.7,
            color: COLORS.ink2,
          },
        },
        "Hold above ",
        levelChip(data.whatToWatch.holdAbove),
        " keeps the setup constructive. A daily close below opens room toward ",
        levelChip(data.whatToWatch.breakBelowTarget),
        ".",
      ),
    ),

    // ── Context (only if present) ───────────────────────────────
    data.context
      ? h(
          "div",
          {
            style: { display: "flex", flexDirection: "column", gap: "8px", marginBottom: "18px" },
          },
          sectionLabel("Context"),
          paragraph(data.context),
        )
      : false,

    // ── Footer ──────────────────────────────────────────────────
    h(
      "div",
      {
        style: {
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          paddingTop: "14px",
          borderTop: `1px solid ${COLORS.lineSoft}`,
        },
      },
      h(
        "div",
        {
          style: {
            fontSize: "11px",
            color: COLORS.ink4,
            letterSpacing: "0.02em",
          },
        },
        `Updated ${formatUpdatedAt(data.updatedAt)}`,
      ),
      h(
        "div",
        {
          style: {
            fontSize: "11px",
            color: COLORS.ink4,
            letterSpacing: "0.02em",
          },
        },
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
  return `${data.ticker} \u00B7 $${fmtPrice(data.price)} (${arrow} ${fmtChangePct(data.changePercent)}) \u2014 ${data.status.label}`;
}
