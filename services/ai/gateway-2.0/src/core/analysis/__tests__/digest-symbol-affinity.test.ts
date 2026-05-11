import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  computeSymbolAffinity,
  getAffinityMin,
} from "../digest-symbol-affinity.js";
import type { PrimaryTickerSource } from "../primary-ticker.js";

// ── Helpers ──────────────────────────────────────────────────────────

function score(opts: {
  theme?: string | null;
  newsOneLiner?: string | null;
  affectedTickers?: string[];
  symbolUpper: string;
  aliases?: string[];
  threshold?: number;
  primaryTicker?: string | null;
  primarySource?: PrimaryTickerSource;
}) {
  return computeSymbolAffinity({
    theme: opts.theme ?? null,
    newsOneLiner: opts.newsOneLiner ?? null,
    affectedTickers: opts.affectedTickers ?? [],
    symbolUpper: opts.symbolUpper,
    aliases: opts.aliases ?? [opts.symbolUpper],
    threshold: opts.threshold,
    primaryTicker: opts.primaryTicker,
    primarySource: opts.primarySource,
  });
}

// ── Verified contamination cases (mirror the prod findings in the plan) ─

describe("computeSymbolAffinity — verified contamination cases", () => {
  it("rejects 'Real-World Asset Tokenization' row tagged with BTC at position 2 (no BTC token, n=3 narrow does not save it)", () => {
    const r = score({
      theme:
        "Real-World Asset Tokenization Acceleration — Coinbase On-Chain Credit Fund and Tether's Twenty-One Capital Signal Regulated DeFi-TradFi Convergence",
      newsOneLiner:
        "Tether's $515M USDT freeze over 30 days confirms stablecoin compliance infrastructure is operating at institutional enforcement scale.",
      affectedTickers: ["COIN", "BTC", "USDT"],
      symbolUpper: "BTC/USD",
      aliases: ["BTC/USD", "BTC"],
      threshold: 2,
    });
    // No BTC/Bitcoin token; BTC at position 2; narrow bonus from n=3 only.
    // Score 1 < threshold 2 -> rejected. The exact contamination case the
    // plan §1 cites: a Coinbase/Tether-primary theme that lists BTC.
    expect(r.score).toBe(1);
    expect(r.passed).toBe(false);
    expect(r.reasons).toContain("text_token_miss");
    expect(r.reasons).toContain("position_primary_miss:position=2");
    expect(r.reasons).toContain("narrow_tag_bonus:n=3");
  });

  it("borderline-passes ETH-primary 'ETH/BTC Ratio' theme at default threshold (text token hit only)", () => {
    const r = score({
      theme:
        "Ethereum Relative Outperformance — ETH/BTC Ratio Improvement and Net Taker Volume Inflection Signal Demand Regime Shift",
      newsOneLiner:
        "Ethereum's $3,000 price target gains analyst consensus as crypto recovery sentiment aligns with equity risk-on.",
      affectedTickers: ["ETH", "BTC", "COIN", "IBIT"],
      symbolUpper: "BTC/USD",
      aliases: ["BTC/USD", "BTC"],
      threshold: 2,
    });
    // BTC appears in the theme as part of the metric name "ETH/BTC" — slash
    // is a non-word boundary so the regex tokenizes BTC as a whole word.
    // Score 2 (text only) lands exactly on the default threshold. This is
    // documented borderline behaviour: validation may show that a stricter
    // threshold (e.g. 3) is justified, in which case it is a one-env-var
    // change. Locking the numeric value here surfaces any future weight
    // tuning as an explicit diff in this test.
    expect(r.score).toBe(2);
    expect(r.passed).toBe(true);
    expect(r.reasons).toContain("position_primary_miss:position=2");
    expect(r.reasons).toContain("normal_tag:n=4");
    expect(r.reasons.some((x) => x.startsWith("text_token_hit:"))).toBe(true);

    // Same row at threshold 3 is rejected — confirms the env knob actually
    // does what the plan promises without any code change.
    const stricter = computeSymbolAffinity({
      theme:
        "Ethereum Relative Outperformance — ETH/BTC Ratio Improvement and Net Taker Volume Inflection Signal Demand Regime Shift",
      newsOneLiner:
        "Ethereum's $3,000 price target gains analyst consensus as crypto recovery sentiment aligns with equity risk-on.",
      affectedTickers: ["ETH", "BTC", "COIN", "IBIT"],
      symbolUpper: "BTC/USD",
      aliases: ["BTC/USD", "BTC"],
      threshold: 3,
    });
    expect(stricter.passed).toBe(false);
  });

  it("rejects PLA-purge geopolitical row that lists AAPL at position 5 with no Apple/AAPL token", () => {
    const r = score({
      theme:
        "PLA Leadership Purge Escalation — Suspended Death Sentences for Two Former Defense Ministers Signal Sustained Chinese Military Command Instability",
      newsOneLiner:
        "China's death sentences for two ex-defense ministers deepen PLA command uncertainty, raising tail-risk premiums for Taiwan-exposed tech and semiconductor names.",
      affectedTickers: ["FXI", "SPX500", "NSDQ100", "NVDA", "AAPL"],
      symbolUpper: "AAPL",
      aliases: ["AAPL"],
      threshold: 2,
    });
    expect(r.score).toBe(0);
    expect(r.passed).toBe(false);
    expect(r.reasons).toContain("text_token_miss");
    expect(r.reasons).toContain("position_primary_miss:position=5");
    expect(r.reasons).toContain("normal_tag:n=5");
  });

  it("accepts BTC-primary 'Bitcoin Custodial' row by position + text match", () => {
    const r = score({
      theme: "Bitcoin Custodial Censorship-Resistance Myth",
      newsOneLiner:
        "US seizure of Iranian crypto assets proves state actors can restrict BTC access at scale.",
      affectedTickers: ["BTC", "ETH", "COIN", "ZEC"],
      symbolUpper: "BTC/USD",
      aliases: ["BTC/USD", "BTC"],
      threshold: 2,
    });
    expect(r.passed).toBe(true);
    expect(r.score).toBeGreaterThanOrEqual(4);
    expect(r.reasons).toContain("text_token_hit:BTC");
    expect(r.reasons).toContain("position_primary_hit:BTC");
  });

  it("rejects an over-broad 14-ticker geopolitical theme even with a token", () => {
    const r = score({
      theme: "US-Iran War Escalation & Strait of Hormuz Blockade Threat",
      newsOneLiner: "Defense and energy names rip on tail-risk repricing.",
      affectedTickers: [
        "CL=F", "BNO", "XLE", "USO", "SPY", "QQQ", "DIA", "TLT", "GLD",
        "LMT", "RTX", "XOM", "CVX", "COP",
      ],
      symbolUpper: "AAPL",
      aliases: ["AAPL"],
      threshold: 2,
    });
    // No Apple/AAPL token, AAPL not in tickers at all (alias miss), n=14.
    expect(r.score).toBeLessThanOrEqual(0);
    expect(r.passed).toBe(false);
    expect(r.reasons).toContain("broad_tag_penalty:n=14");
    expect(r.reasons).toContain("position_primary_miss:not_in_tickers");
  });
});

// ── Bonus / penalty in isolation ──────────────────────────────────────

describe("computeSymbolAffinity — bonus and penalty isolation", () => {
  it("text_token_hit alone yields +2 (no position, no narrow bonus)", () => {
    const r = score({
      theme: null,
      newsOneLiner: "AAPL guidance lifts services growth narrative.",
      affectedTickers: ["TSLA", "MSFT", "AAPL", "GOOGL", "AMZN"],
      symbolUpper: "AAPL",
      aliases: ["AAPL"],
      threshold: 2,
    });
    expect(r.score).toBe(2);
    expect(r.reasons).toContain("text_token_hit:AAPL");
    expect(r.reasons).toContain("position_primary_miss:position=3");
  });

  it("position_primary_hit alone yields +2 (no text, no narrow bonus)", () => {
    const r = score({
      theme: "Big Tech AI litigation wave",
      newsOneLiner: "Sector-wide compliance costs rise.",
      affectedTickers: ["AAPL", "MSFT", "GOOGL", "META", "NSDQ100"],
      symbolUpper: "AAPL",
      aliases: ["AAPL"],
      threshold: 2,
    });
    expect(r.score).toBe(2);
    expect(r.reasons).toContain("text_token_miss");
    expect(r.reasons).toContain("position_primary_hit:AAPL");
  });

  it("narrow_tag_bonus alone (n<=3) cannot pass threshold by itself", () => {
    const r = score({
      theme: "Sector rotation",
      newsOneLiner: "Capital rotates between defensives and growth.",
      affectedTickers: ["XLK", "XLP", "AAPL"],
      symbolUpper: "AAPL",
      aliases: ["AAPL"],
      threshold: 2,
    });
    expect(r.score).toBe(1);
    expect(r.reasons).toContain("narrow_tag_bonus:n=3");
    expect(r.passed).toBe(false);
  });

  it("position + narrow combine to clear threshold without any text token", () => {
    const r = score({
      theme: "Earnings preview",
      newsOneLiner: "Investors brace for results.",
      affectedTickers: ["AAPL", "MSFT"],
      symbolUpper: "AAPL",
      aliases: ["AAPL"],
      threshold: 2,
    });
    expect(r.score).toBe(3);
    expect(r.reasons).toContain("position_primary_hit:AAPL");
    expect(r.reasons).toContain("narrow_tag_bonus:n=2");
    expect(r.passed).toBe(true);
  });

  it("broad_tag_penalty (n>=8) docks one point even on a text hit", () => {
    const tickers = [
      "AAPL", "MSFT", "GOOGL", "META", "NVDA", "AMZN", "TSLA", "NFLX", "BRK.B",
    ];
    const r = score({
      theme: "Mega-cap basket rebalance",
      newsOneLiner: "Index funds reweight AAPL lower.",
      affectedTickers: tickers,
      symbolUpper: "AAPL",
      aliases: ["AAPL"],
      threshold: 2,
    });
    // text +2, position +2, broad -1 = 3.
    expect(r.score).toBe(3);
    expect(r.reasons).toContain("broad_tag_penalty:n=9");
  });
});

// ── Token regex rules ────────────────────────────────────────────────

describe("computeSymbolAffinity — token regex rules", () => {
  it("short-ticker match is uppercase-exact: \\bF\\b matches 'Ford F-150', not 'fedex'", () => {
    const hit = score({
      theme: "Ford F-150 recall hits earnings",
      newsOneLiner: null,
      affectedTickers: ["F"],
      symbolUpper: "F",
      aliases: ["F"],
      threshold: 2,
    });
    expect(hit.reasons).toContain("text_token_hit:F");

    const miss = score({
      theme: "fedex relax sequencing",
      newsOneLiner: null,
      affectedTickers: ["F"],
      symbolUpper: "F",
      aliases: ["F"],
      threshold: 2,
    });
    // No uppercase F whole-word in the prose -> text_token_miss.
    expect(miss.reasons).toContain("text_token_miss");
  });

  it("short-ticker match does not bleed into 'snapped' for ticker S", () => {
    const r = score({
      theme: "Stocks snapped a winning streak",
      newsOneLiner: "Markets paused.",
      affectedTickers: ["S"],
      symbolUpper: "S",
      aliases: ["S"],
      threshold: 2,
    });
    expect(r.reasons).toContain("text_token_miss");
  });

  it("long-ticker (>=5 chars) is case-insensitive", () => {
    const r = score({
      theme: "GOOGL ad-tech deal closes",
      newsOneLiner: "googl earnings beat.",
      affectedTickers: ["GOOGL"],
      symbolUpper: "GOOGL",
      aliases: ["GOOGL"],
      threshold: 2,
    });
    expect(r.reasons).toContain("text_token_hit:GOOGL");
  });

  it("crypto-pair alias hits 'BTC' as a whole word in prose", () => {
    const r = score({
      theme: "Spot BTC ETF flows",
      newsOneLiner: null,
      affectedTickers: ["BTC"],
      symbolUpper: "BTC/USD",
      aliases: ["BTC/USD", "BTC"],
      threshold: 2,
    });
    expect(r.reasons).toContain("text_token_hit:BTC");
  });

  it("symbol with no aliases passed in still matches itself", () => {
    const r = score({
      theme: "AAPL guidance update",
      newsOneLiner: null,
      affectedTickers: [],
      symbolUpper: "AAPL",
      aliases: [],
      threshold: 2,
    });
    expect(r.reasons).toContain("text_token_hit:AAPL");
  });
});

// ── Threshold + env reader ───────────────────────────────────────────

describe("getAffinityMin — env reader and clamps", () => {
  const ENV = "SMART_DIGEST_MEMORY_AFFINITY_MIN";
  const original = process.env[ENV];

  beforeEach(() => {
    delete process.env[ENV];
  });

  afterEach(() => {
    if (original === undefined) delete process.env[ENV];
    else process.env[ENV] = original;
  });

  it("defaults to 2 when env is unset", () => {
    expect(getAffinityMin()).toBe(2);
  });

  it("defaults to 2 when env is empty", () => {
    process.env[ENV] = "";
    expect(getAffinityMin()).toBe(2);
  });

  it("defaults to 2 when env is non-numeric", () => {
    process.env[ENV] = "lol";
    expect(getAffinityMin()).toBe(2);
  });

  it("respects a numeric value", () => {
    process.env[ENV] = "4";
    expect(getAffinityMin()).toBe(4);
  });

  it("clamps a too-large value to 10", () => {
    process.env[ENV] = "999";
    expect(getAffinityMin()).toBe(10);
  });

  it("clamps a negative value to 0", () => {
    process.env[ENV] = "-3";
    expect(getAffinityMin()).toBe(0);
  });
});

// ── Edge cases ───────────────────────────────────────────────────────

describe("computeSymbolAffinity — edge cases", () => {
  it("empty affected_tickers reports not_in_tickers and n=0", () => {
    const r = score({
      theme: "AAPL guidance",
      newsOneLiner: null,
      affectedTickers: [],
      symbolUpper: "AAPL",
      aliases: ["AAPL"],
      threshold: 2,
    });
    expect(r.reasons).toContain("position_primary_miss:not_in_tickers");
    expect(r.reasons).toContain("normal_tag:n=0");
  });

  it("null theme + null one-liner produces text_token_miss (not a crash)", () => {
    const r = score({
      theme: null,
      newsOneLiner: null,
      affectedTickers: ["AAPL"],
      symbolUpper: "AAPL",
      aliases: ["AAPL"],
      threshold: 2,
    });
    expect(r.reasons).toContain("text_token_miss");
    expect(r.score).toBe(3);
  });

  it("threshold override on the call wins over env-derived default", () => {
    // Construct a row that scores exactly +2 (text only): one-liner mentions
    // AAPL, but AAPL sits at position 3/5 (no position bonus) and n=5 (no
    // narrow / no broad). At threshold 2 it passes; at threshold 4 it fails
    // — the override is the only thing that flips the decision.
    const baseArgs = {
      theme: null,
      newsOneLiner: "AAPL guidance update late session.",
      affectedTickers: ["TSLA", "MSFT", "AAPL", "GOOGL", "AMZN"],
      symbolUpper: "AAPL",
      aliases: ["AAPL"],
    };
    const lenient = score({ ...baseArgs, threshold: 2 });
    expect(lenient.score).toBe(2);
    expect(lenient.passed).toBe(true);

    const strict = score({ ...baseArgs, threshold: 4 });
    expect(strict.score).toBe(2);
    expect(strict.threshold).toBe(4);
    expect(strict.passed).toBe(false);
  });

  it("identical inputs always produce identical reasons (determinism)", () => {
    const args = {
      theme: "AAPL near support",
      newsOneLiner: "Apple narrative steady.",
      affectedTickers: ["AAPL", "MSFT"],
      symbolUpper: "AAPL",
      aliases: ["AAPL"],
    };
    const a = computeSymbolAffinity({ ...args, threshold: 2 });
    const b = computeSymbolAffinity({ ...args, threshold: 2 });
    expect(a).toEqual(b);
  });
});

// ── Slice 3: primary_ticker adoption ─────────────────────────────────

describe("computeSymbolAffinity — primary_ticker adoption", () => {
  it("strong hit beats position miss: recovers +3 for a BTC-subject row at position 2", () => {
    const r = score({
      theme: "Ethereum Relative Outperformance — ETH/BTC Ratio",
      newsOneLiner: "Ethereum's $3,000 target gains analyst consensus.",
      affectedTickers: ["ETH", "BTC", "COIN", "IBIT"],
      symbolUpper: "BTC/USD",
      aliases: ["BTC/USD", "BTC"],
      primaryTicker: "BTC",
      primarySource: "marketaux_entities",
      threshold: 2,
    });
    expect(r.reasons).toContain("primary_ticker_hit:strong:BTC");
    expect(r.reasons.some((x) => x.startsWith("position_primary"))).toBe(false);
    expect(r.score).toBeGreaterThanOrEqual(5);
  });

  it("strong miss disables position bonus even when alias is at position 1", () => {
    const r = score({
      theme: "Big Tech AI litigation wave",
      newsOneLiner: "Sector compliance costs rise.",
      affectedTickers: ["BTC", "ETH", "COIN", "IBIT", "NVDA"],
      symbolUpper: "BTC/USD",
      aliases: ["BTC/USD", "BTC"],
      primaryTicker: "ETH",
      primarySource: "marketaux_entities",
      threshold: 2,
    });
    expect(r.reasons).toContain("primary_ticker_miss:strong:ETH");
    expect(r.reasons.some((x) => x.startsWith("position_primary"))).toBe(false);
    // text miss (0) + strong miss (0) + normal_tag n=5 (0) = 0
    expect(r.score).toBe(0);
    expect(r.passed).toBe(false);
  });

  it("heuristic hit yields +2", () => {
    const r = score({
      theme: "Earnings preview",
      newsOneLiner: "Investors brace for results.",
      affectedTickers: ["AAPL", "MSFT"],
      symbolUpper: "AAPL",
      aliases: ["AAPL"],
      primaryTicker: "AAPL",
      primarySource: "batch_heuristic",
      threshold: 2,
    });
    expect(r.reasons).toContain("primary_ticker_hit:heuristic:AAPL");
    expect(r.reasons.some((x) => x.startsWith("position_primary"))).toBe(false);
    expect(r.score).toBe(3);
  });

  it("heuristic miss = 0, no fall-through to position-primary", () => {
    const r = score({
      theme: "Big Tech AI litigation wave",
      newsOneLiner: "Sector compliance costs rise.",
      affectedTickers: ["AAPL", "MSFT", "GOOGL", "META", "NVDA"],
      symbolUpper: "AAPL",
      aliases: ["AAPL"],
      primaryTicker: "NVDA",
      primarySource: "batch_heuristic",
      threshold: 2,
    });
    expect(r.reasons).toContain("primary_ticker_miss:heuristic:NVDA");
    expect(r.reasons.some((x) => x.startsWith("position_primary"))).toBe(false);
    // text miss (0) + heuristic miss (0) + normal_tag n=5 (0) = 0
    expect(r.score).toBe(0);
    expect(r.passed).toBe(false);
  });

  it("NULL source = legacy position-primary behavior unchanged", () => {
    const r = score({
      theme: "Earnings preview",
      newsOneLiner: "Investors brace for results.",
      affectedTickers: ["AAPL", "MSFT"],
      symbolUpper: "AAPL",
      aliases: ["AAPL"],
      primaryTicker: null,
      primarySource: null,
      threshold: 2,
    });
    expect(r.reasons).toContain("position_primary_hit:AAPL");
    expect(r.reasons.some((x) => x.startsWith("primary_ticker"))).toBe(false);
  });

  it("omitted primaryTicker/primarySource = legacy behavior (backward compat)", () => {
    const r = score({
      theme: "Earnings preview",
      newsOneLiner: "Investors brace for results.",
      affectedTickers: ["AAPL", "MSFT"],
      symbolUpper: "AAPL",
      aliases: ["AAPL"],
      threshold: 2,
    });
    expect(r.reasons).toContain("position_primary_hit:AAPL");
    expect(r.reasons.some((x) => x.startsWith("primary_ticker"))).toBe(false);
  });

  it("strong source with null primaryTicker records miss:strong:null", () => {
    const r = score({
      theme: "AAPL guidance",
      newsOneLiner: null,
      affectedTickers: ["AAPL"],
      symbolUpper: "AAPL",
      aliases: ["AAPL"],
      primaryTicker: null,
      primarySource: "marketaux_entities",
      threshold: 2,
    });
    expect(r.reasons).toContain("primary_ticker_miss:strong:null");
  });

  it("determinism holds with primary_ticker fields", () => {
    const args = {
      theme: "AAPL near support",
      newsOneLiner: "Apple narrative steady.",
      affectedTickers: ["AAPL", "MSFT"],
      symbolUpper: "AAPL",
      aliases: ["AAPL"],
      primaryTicker: "AAPL",
      primarySource: "batch_heuristic" as PrimaryTickerSource,
      threshold: 2,
    };
    const a = computeSymbolAffinity(args);
    const b = computeSymbolAffinity(args);
    expect(a).toEqual(b);
  });
});
