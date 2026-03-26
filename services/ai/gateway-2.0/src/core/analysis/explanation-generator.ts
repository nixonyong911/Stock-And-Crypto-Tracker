import { spawn } from "node:child_process";
import type { FastifyBaseLogger } from "fastify";
import type { Redis } from "ioredis";
import type { TickerSignal, MacroContext } from "./recommendation-engine.js";

export interface Explanation {
  whatsHappening: string;
  whatToWatch: string;
  outlook: string;
  horizon: string;
  confidence: string;
  risk: string;
}

const DAILY_LLM_LIMIT = 50;
const LLM_TIMEOUT_MS = 30_000;
const ANSI_RE = /\x1b\[[0-9;]*[a-zA-Z]/g;

function todayKey(): string {
  return `digest:llm_calls:${new Date().toISOString().slice(0, 10)}`;
}

function fmt(n: number): string {
  if (n >= 1) return n.toFixed(2);
  if (n >= 0.01) return n.toFixed(4);
  return n.toPrecision(4);
}

function displaySymbol(symbol: string): string {
  const slash = symbol.indexOf("/");
  return slash !== -1 ? symbol.slice(0, slash) : symbol;
}

// ── Template fragments ──────────────────────────────────────────────────

function buildWhatsHappening(s: TickerSignal): string {
  const parts: string[] = [];
  const d = s.rawData;
  const sym = displaySymbol(s.symbol);

  switch (s.type) {
    case "entry_zone":
      if (d.entryLow != null && d.entryHigh != null) {
        parts.push(
          `${sym} has pulled back to $${fmt(d.close)}, near a support level ($${fmt(d.entryLow)}-$${fmt(d.entryHigh)}) that has held across the past ${d.lookbackDays ?? 20} trading sessions.`,
        );
      }
      break;
    case "target_reached":
      parts.push(
        `${sym} is trading at $${fmt(d.close)}, approaching its projected resistance range.`,
      );
      break;
    case "stop_loss_warning":
      if (d.stopLoss != null) {
        parts.push(
          `${sym} is testing $${fmt(d.stopLoss)}, a level that marks the lower boundary of its recent range.`,
        );
      }
      break;
    case "signal_change":
      if (d.currentSignal === "bullish") {
        parts.push(
          `${sym}'s technical picture has shifted from ${d.previousSignal ?? "neutral"} to bullish on the swing timeframe.`,
        );
      } else if (d.currentSignal === "bearish") {
        parts.push(
          `${sym}'s technical picture has shifted from ${d.previousSignal ?? "neutral"} to bearish.`,
        );
      } else {
        parts.push(
          `${sym}'s swing signal has shifted from ${d.previousSignal ?? "unknown"} to ${d.currentSignal ?? "neutral"}.`,
        );
      }
      break;
    case "momentum_shift":
      if (d.macdHistogram != null && d.macdHistogram > 0) {
        parts.push("Short-term momentum has shifted into positive territory.");
      } else {
        parts.push("Short-term momentum has turned negative.");
      }
      break;
    case "notable_pattern":
      if (d.patterns && d.patterns.length > 0) {
        const p = d.patterns[0]!;
        parts.push(
          `${sym} formed a ${p.pattern.replace(/_/g, " ")} pattern today, which is typically associated with potential ${p.signal} reversals.`,
        );
      }
      break;
    case "news_sentiment": {
      const label = d.newsSentimentLabel ?? "mixed";
      const count = d.newsArticleCount ?? 0;
      parts.push(
        `Recent news coverage of ${sym} has been predominantly ${label} across ${count} articles.`,
      );
      if (d.newsHeadlines && d.newsHeadlines.length > 0) {
        const headlineList = d.newsHeadlines.slice(0, 2).join("; ");
        parts.push(`Key headlines: ${headlineList}.`);
      }
      break;
    }
  }

  if (d.rsi != null) {
    if (d.rsi < 30) {
      parts.push("Momentum readings suggest selling pressure may be exhausted.");
    } else if (d.rsi > 70) {
      parts.push(
        "Momentum readings are extended. Rallies at this level have historically been followed by cooling periods.",
      );
    }
  }

  if (parts.length === 0) {
    parts.push(`${sym} is trading at $${fmt(d.close)}.`);
  }

  // Timeframe caveat
  if (s.timeframeAlignment === "full") {
    const dominant = d.swingSignal || "neutral";
    parts.push(`The technical outlook is ${dominant} across all timeframes.`);
  } else if (s.timeframeAlignment === "partial") {
    parts.push(
      `The short-term view is ${d.daySignal}, though the longer-term trend hasn't confirmed.`,
    );
  } else if (s.timeframeAlignment === "conflict") {
    parts.push(
      `However, the longer-term technical outlook remains ${d.longTermSignal}, suggesting this could be a temporary move.`,
    );
  }

  return parts.join(" ");
}

function buildWhatToWatch(s: TickerSignal): string {
  const parts: string[] = [];
  const d = s.rawData;

  switch (s.type) {
    case "entry_zone":
      if (d.entryLow != null) {
        const invalidation = d.periodLow ?? d.entryLow * 0.97;
        parts.push(
          `A hold above $${fmt(d.entryLow)} could confirm this as a floor. A break below $${fmt(invalidation)} would suggest further downside.`,
        );
      }
      break;
    case "target_reached":
      parts.push(
        "A break above this level on volume would signal continuation. Failure here could lead to a pullback.",
      );
      break;
    case "stop_loss_warning":
      parts.push(
        "A sustained break below this level would suggest the downtrend may continue.",
      );
      break;
    case "signal_change":
      parts.push("Watch for confirmation in the next few sessions.");
      break;
    case "momentum_shift":
      parts.push("Watch for follow-through in the next 1-2 sessions.");
      break;
    case "notable_pattern":
      if (d.ema20 != null) {
        parts.push(
          `This is a single-day signal and needs follow-through. A close back above $${fmt(d.ema20)} would suggest buyers are regaining control.`,
        );
      } else {
        parts.push(
          "This is a single-day signal and needs follow-through in subsequent sessions.",
        );
      }
      break;
    case "news_sentiment":
      parts.push(
        "Watch for a shift in news sentiment or whether the current narrative is already priced in. Cross-reference with technical levels for confirmation.",
      );
      break;
  }

  if (parts.length === 0) {
    parts.push("No immediate catalysts identified. Monitor for a break of the current range.");
  }

  return parts.join(" ");
}

export function deriveOutlook(s: TickerSignal): string {
  if (s.type === "news_sentiment") return capitalize(s.rawData.newsSentimentLabel ?? "neutral");
  if (s.timeframeAlignment === "full") return capitalize(s.rawData.swingSignal);
  if (s.timeframeAlignment === "partial") return capitalize(s.rawData.daySignal);
  return "Mixed";
}

export function deriveHorizon(s: TickerSignal): string {
  if (s.type === "news_sentiment") return "Short-term (days)";
  if (s.timeframeAlignment === "conflict") return "Uncertain";
  if (s.type === "notable_pattern") return "Short-term (days)";
  if (s.type === "signal_change") return "Position (2-4 weeks)";
  return "Swing (1-3 weeks)";
}

export function deriveConfidence(s: TickerSignal): string {
  if (s.type === "news_sentiment") {
    const count = s.rawData.newsArticleCount ?? 0;
    if (count >= 7) return "Medium";
    if (count >= 5) return "Low-Medium";
    return "Low";
  }
  const conf = s.rawData.confidence;
  if (s.timeframeAlignment === "conflict") return "Low";
  if (conf != null && conf < 0.4) return "Low";
  if (conf != null && conf >= 0.7 && s.timeframeAlignment === "full") return "High";
  if (conf != null && conf >= 0.7 && s.timeframeAlignment === "partial") return "Medium";
  return "Medium";
}

export function deriveRisk(s: TickerSignal): string {
  if (s.type === "news_sentiment") return "Medium";
  const d = s.rawData;
  const stopPct =
    d.stopLoss != null && d.close > 0
      ? ((d.close - d.stopLoss) / d.close) * 100
      : undefined;

  if (s.timeframeAlignment === "conflict") return "Higher";
  if (stopPct != null && stopPct > 5) return "Higher";
  if (stopPct != null && stopPct >= 3 && s.timeframeAlignment === "partial") return "Medium";
  if (stopPct != null && stopPct < 3 && s.timeframeAlignment === "full") return "Low-Medium";
  return "Medium";
}

function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

// ── Template engine ─────────────────────────────────────────────────────

export function templateForSignal(s: TickerSignal): Explanation {
  return {
    whatsHappening: buildWhatsHappening(s),
    whatToWatch: buildWhatToWatch(s),
    outlook: deriveOutlook(s),
    horizon: deriveHorizon(s),
    confidence: deriveConfidence(s),
    risk: deriveRisk(s),
  };
}

export function stackTemplates(signals: TickerSignal[], macroContext?: MacroContext): Explanation {
  const whats = signals.map(buildWhatsHappening);
  const watches = signals.map(buildWhatToWatch);
  const first = signals[0]!;

  if (macroContext && macroContext.headlines.length > 0) {
    const theme = macroContext.dominantTheme ?? "mixed";
    const sentiment = macroContext.overallSentiment >= 0.2 ? "positive" : macroContext.overallSentiment <= -0.2 ? "negative" : "cautious";
    whats.push(`Broader macro backdrop is ${sentiment}, dominated by ${theme} developments.`);
  }

  return {
    whatsHappening: whats.join(" "),
    whatToWatch: watches.join(" "),
    outlook: deriveOutlook(first),
    horizon: deriveHorizon(first),
    confidence: deriveConfidence(first),
    risk: deriveRisk(first),
  };
}

// ── LLM fallback ────────────────────────────────────────────────────────

async function tryLlmSynthesis(
  signals: TickerSignal[],
  logger: FastifyBaseLogger,
  redis: Redis,
  macroContext?: MacroContext,
): Promise<Explanation | null> {
  const key = todayKey();
  const count = await redis.incr(key);
  if (count === 1) await redis.expire(key, 86_400);

  if (count > DAILY_LLM_LIMIT) {
    logger.info({ count }, "Daily LLM limit reached, using templates");
    return null;
  }

  const sym = displaySymbol(signals[0]!.symbol);
  const signalData = signals.map((s) => ({
    type: s.type,
    rawData: s.rawData,
    timeframeAlignment: s.timeframeAlignment,
  }));

  const newsHeadlines = signals
    .filter((s) => s.rawData.newsHeadlines && s.rawData.newsHeadlines.length > 0)
    .flatMap((s) => s.rawData.newsHeadlines!);

  let newsContext = "";
  if (newsHeadlines.length > 0) {
    const unique = [...new Set(newsHeadlines)].slice(0, 3);
    newsContext = `\n\nRecent news headlines for ${sym}:\n${unique.map((h) => `- ${h}`).join("\n")}\nConsider how this news may impact the technical setup described above.`;
  }

  let macroSection = "";
  if (macroContext && macroContext.headlines.length > 0) {
    const macroHeadlines = macroContext.headlines.slice(0, 5);
    macroSection = `\n\nBroader market context (macro/geopolitical/policy news from the last 24h):\n${macroHeadlines.map((h) => `- ${h}`).join("\n")}\nOverall macro sentiment: ${macroContext.overallSentiment.toFixed(2)} (${macroContext.dominantTheme ?? "mixed"} theme)\nConsider how these macro factors may affect ${sym}'s outlook.`;
  }

  const prompt = `You are a stock analyst writing a brief for a retail investor.
Given this data for ${sym}, write two short paragraphs:
1. "What's happening" -- plain English, reference the data
2. "What to watch" -- what confirms and what invalidates

Data: ${JSON.stringify(signalData)}${newsContext}${macroSection}

Tone: cautious, data-driven. Use "appears to", "suggests", "historically". Never say BUY or SELL.
Return ONLY the two paragraphs, no headers.`;

  const args = ["cursor-agent", "-p", prompt, "--model", "sonnet-4.6"];
  const apiKey = process.env["CURSOR_API_KEY"];
  if (apiKey) args.push("--api-key", apiKey);

  try {
    const output = await new Promise<string>((resolve, reject) => {
      const child = spawn(args[0]!, args.slice(1), {
        stdio: ["ignore", "pipe", "pipe"],
        detached: true,
      });

      const chunks: Buffer[] = [];
      let settled = false;

      const timer = setTimeout(() => {
        if (settled) return;
        settled = true;
        try {
          if (child.pid !== undefined) process.kill(-child.pid, "SIGKILL");
        } catch {
          /* already dead */
        }
        reject(new Error("LLM call timed out"));
      }, LLM_TIMEOUT_MS);

      child.stdout?.on("data", (chunk: Buffer) => chunks.push(chunk));

      child.on("error", (err) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        reject(err);
      });

      child.on("close", (code) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        if (code !== 0) {
          reject(new Error(`cursor-agent exited with code ${code}`));
          return;
        }
        resolve(
          Buffer.concat(chunks).toString("utf-8").replace(ANSI_RE, "").trim(),
        );
      });
    });

    const paragraphs = output
      .split(/\n\n+/)
      .filter((p) => p.trim().length > 0);
    const first = signals[0]!;

    return {
      whatsHappening: paragraphs[0] ?? buildWhatsHappening(first),
      whatToWatch: paragraphs[1] ?? buildWhatToWatch(first),
      outlook: deriveOutlook(first),
      horizon: deriveHorizon(first),
      confidence: deriveConfidence(first),
      risk: deriveRisk(first),
    };
  } catch (err) {
    logger.warn({ err }, "LLM synthesis failed, falling back to templates");
    return null;
  }
}

// ── Public API ──────────────────────────────────────────────────────────

export async function generateExplanation(
  signals: TickerSignal[],
  logger: FastifyBaseLogger,
  redis: Redis,
  macroContext?: MacroContext,
): Promise<Explanation> {
  if (signals.length === 0) {
    return {
      whatsHappening: "No actionable signals detected.",
      whatToWatch: "Monitor for emerging technical patterns.",
      outlook: "Neutral",
      horizon: "Uncertain",
      confidence: "Low",
      risk: "Medium",
    };
  }

  if (signals.length === 1) {
    return templateForSignal(signals[0]!);
  }

  const llmResult = await tryLlmSynthesis(signals, logger, redis, macroContext);
  if (llmResult) return llmResult;

  return stackTemplates(signals, macroContext);
}
