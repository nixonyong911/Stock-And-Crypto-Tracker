import { describe, it, expect } from "vitest";
import {
  computeTruthHash,
  computeContextHash,
  CURRENT_DIGEST_BRIEF_SCHEMA_VERSION,
  CURRENT_GENERATOR_VERSION,
  CURRENT_PROMPT_VERSION,
  CURRENT_CODE_VERSION,
  type TruthFingerprintInput,
  type ContextFingerprintInput,
} from "../smart-digest-fingerprint.js";

// ── Version constants ─────────────────────────────────────────────────

describe("version constants", () => {
  it("CURRENT_DIGEST_BRIEF_SCHEMA_VERSION is a positive integer", () => {
    expect(typeof CURRENT_DIGEST_BRIEF_SCHEMA_VERSION).toBe("number");
    expect(CURRENT_DIGEST_BRIEF_SCHEMA_VERSION).toBeGreaterThan(0);
    expect(Number.isInteger(CURRENT_DIGEST_BRIEF_SCHEMA_VERSION)).toBe(true);
  });

  it("CURRENT_GENERATOR_VERSION is a non-empty string", () => {
    expect(typeof CURRENT_GENERATOR_VERSION).toBe("string");
    expect(CURRENT_GENERATOR_VERSION.length).toBeGreaterThan(0);
  });

  it("CURRENT_PROMPT_VERSION is null (no LLM in per-ticker brief today)", () => {
    expect(CURRENT_PROMPT_VERSION).toBeNull();
  });

  it("CURRENT_CODE_VERSION is a non-empty string", () => {
    expect(typeof CURRENT_CODE_VERSION).toBe("string");
    expect(CURRENT_CODE_VERSION.length).toBeGreaterThan(0);
  });
});

// ── computeTruthHash stability ────────────────────────────────────────

describe("computeTruthHash", () => {
  const baseInput: TruthFingerprintInput = {
    priceTargetId: 42,
    priceTargetUpdatedAt: "2026-05-13T10:00:00Z",
    analysisDate: "2026-05-13",
    newsOneLiner: "AAPL beats earnings estimates",
    macroSignature: null,
    trendSignature: "2026-05-13:201.45:189.30",
  };

  it("produces a 64-char hex string", () => {
    const hash = computeTruthHash(baseInput);
    expect(hash).toMatch(/^[a-f0-9]{64}$/);
  });

  it("is stable across repeated calls with same input", () => {
    const h1 = computeTruthHash(baseInput);
    const h2 = computeTruthHash(baseInput);
    expect(h1).toBe(h2);
  });

  it("is stable regardless of property order in the input object", () => {
    const reversed: TruthFingerprintInput = {
      trendSignature: "2026-05-13:201.45:189.30",
      macroSignature: null,
      newsOneLiner: "AAPL beats earnings estimates",
      analysisDate: "2026-05-13",
      priceTargetUpdatedAt: "2026-05-13T10:00:00Z",
      priceTargetId: 42,
    };
    expect(computeTruthHash(baseInput)).toBe(computeTruthHash(reversed));
  });

  it("changes when trendSignature changes (regime move regenerates)", () => {
    const moved = { ...baseInput, trendSignature: "2026-05-14:205.00:189.30" };
    expect(computeTruthHash(baseInput)).not.toBe(computeTruthHash(moved));
  });

  it("changes between absent and present trendSignature", () => {
    const absent = { ...baseInput, trendSignature: null };
    expect(computeTruthHash(baseInput)).not.toBe(computeTruthHash(absent));
  });

  it("changes when priceTargetId changes", () => {
    const modified = { ...baseInput, priceTargetId: 99 };
    expect(computeTruthHash(baseInput)).not.toBe(computeTruthHash(modified));
  });

  it("changes when newsOneLiner changes", () => {
    const modified = { ...baseInput, newsOneLiner: "different" };
    expect(computeTruthHash(baseInput)).not.toBe(computeTruthHash(modified));
  });

  it("trims newsOneLiner whitespace", () => {
    const withSpaces = { ...baseInput, newsOneLiner: "  AAPL beats earnings estimates  " };
    expect(computeTruthHash(baseInput)).toBe(computeTruthHash(withSpaces));
  });

  it("treats empty string newsOneLiner as null", () => {
    const empty = { ...baseInput, newsOneLiner: "" };
    const nulled = { ...baseInput, newsOneLiner: null };
    expect(computeTruthHash(empty)).toBe(computeTruthHash(nulled));
  });
});

// ── computeContextHash stability ──────────────────────────────────────

describe("computeContextHash", () => {
  const baseInput: ContextFingerprintInput = {
    memoryThemes: [
      {
        theme_id: "aaa-bbb",
        last_updated: "2026-05-13T10:00:00Z",
        prompt_version: "memory-curator.v2",
      },
    ],
    newsHeadlines: [
      {
        batch_id: "ccc-ddd",
        processed_at: "2026-05-13T09:00:00Z",
      },
    ],
  };

  it("produces a 64-char hex string", () => {
    const hash = computeContextHash(baseInput);
    expect(hash).toMatch(/^[a-f0-9]{64}$/);
  });

  it("is stable across repeated calls", () => {
    const h1 = computeContextHash(baseInput);
    const h2 = computeContextHash(baseInput);
    expect(h1).toBe(h2);
  });

  it("changes when a memory theme's last_updated changes", () => {
    const modified: ContextFingerprintInput = {
      ...baseInput,
      memoryThemes: [
        { ...baseInput.memoryThemes[0]!, last_updated: "2026-05-14T10:00:00Z" },
      ],
    };
    expect(computeContextHash(baseInput)).not.toBe(
      computeContextHash(modified),
    );
  });

  it("changes when a news headline is added", () => {
    const modified: ContextFingerprintInput = {
      ...baseInput,
      newsHeadlines: [
        ...baseInput.newsHeadlines,
        { batch_id: "eee-fff", processed_at: "2026-05-13T11:00:00Z" },
      ],
    };
    expect(computeContextHash(baseInput)).not.toBe(
      computeContextHash(modified),
    );
  });

  it("is stable with empty arrays", () => {
    const empty: ContextFingerprintInput = {
      memoryThemes: [],
      newsHeadlines: [],
    };
    const h1 = computeContextHash(empty);
    const h2 = computeContextHash(empty);
    expect(h1).toBe(h2);
  });
});
