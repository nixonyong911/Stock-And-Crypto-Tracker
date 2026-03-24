import { describe, it, expect, vi, beforeEach } from "vitest";
import { fallbackCheck, isWeekend, toDateKey, checkTradingDay } from "../src/market-calendar.js";

function utcDate(dateStr: string): Date {
  const [y, m, d] = dateStr.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d));
}

describe("toDateKey", () => {
  it("formats date as YYYY-MM-DD", () => {
    expect(toDateKey(utcDate("2026-03-24"))).toBe("2026-03-24");
    expect(toDateKey(utcDate("2026-01-05"))).toBe("2026-01-05");
  });
});

describe("isWeekend", () => {
  it("returns true for Saturday", () => {
    expect(isWeekend(utcDate("2026-03-28"))).toBe(true);
  });

  it("returns true for Sunday", () => {
    expect(isWeekend(utcDate("2026-03-29"))).toBe(true);
  });

  it("returns false for weekdays", () => {
    expect(isWeekend(utcDate("2026-03-24"))).toBe(false); // Tuesday
    expect(isWeekend(utcDate("2026-03-27"))).toBe(false); // Friday
  });
});

describe("fallbackCheck", () => {
  it("detects weekends", () => {
    const result = fallbackCheck(utcDate("2026-03-28")); // Saturday
    expect(result.isTradingDay).toBe(false);
    expect(result.reason).toContain("Saturday");
    expect(result.source).toBe("fallback");
  });

  it("detects Sunday", () => {
    const result = fallbackCheck(utcDate("2026-03-29"));
    expect(result.isTradingDay).toBe(false);
    expect(result.reason).toContain("Sunday");
  });

  it("detects NYSE holidays", () => {
    const goodFriday = fallbackCheck(utcDate("2026-04-03"));
    expect(goodFriday.isTradingDay).toBe(false);
    expect(goodFriday.reason).toBe("Good Friday");

    const thanksgiving = fallbackCheck(utcDate("2026-11-26"));
    expect(thanksgiving.isTradingDay).toBe(false);
    expect(thanksgiving.reason).toBe("Thanksgiving");

    const christmas = fallbackCheck(utcDate("2026-12-25"));
    expect(christmas.isTradingDay).toBe(false);
    expect(christmas.reason).toBe("Christmas Day");
  });

  it("returns trading day for regular weekday", () => {
    const result = fallbackCheck(utcDate("2026-03-24")); // Tuesday
    expect(result.isTradingDay).toBe(true);
    expect(result.reason).toBeUndefined();
    expect(result.source).toBe("fallback");
  });

  it("detects 2027 holidays", () => {
    const mlk = fallbackCheck(utcDate("2027-01-18"));
    expect(mlk.isTradingDay).toBe(false);
    expect(mlk.reason).toBe("MLK Day");
  });
});

describe("checkTradingDay", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("uses fallback when no credentials provided", async () => {
    const result = await checkTradingDay(utcDate("2026-03-28"));
    expect(result.source).toBe("fallback");
    expect(result.isTradingDay).toBe(false);
  });

  it("uses fallback when credentials are empty", async () => {
    const result = await checkTradingDay(utcDate("2026-03-24"), {
      apiKeyId: "",
      apiSecretKey: "",
    });
    expect(result.source).toBe("fallback");
  });

  it("calls Alpaca API and returns trading day", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve([{ date: "2026-03-24", open: "09:30", close: "16:00" }]),
      }),
    );

    const result = await checkTradingDay(utcDate("2026-03-24"), {
      apiKeyId: "test-key",
      apiSecretKey: "test-secret",
    });

    expect(result.isTradingDay).toBe(true);
    expect(result.source).toBe("alpaca");
  });

  it("calls Alpaca API and returns non-trading day", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve([]),
      }),
    );

    const result = await checkTradingDay(utcDate("2026-03-28"), {
      apiKeyId: "test-key",
      apiSecretKey: "test-secret",
    });

    expect(result.isTradingDay).toBe(false);
    expect(result.source).toBe("alpaca");
  });

  it("falls back on API error", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({ ok: false, status: 500 }),
    );

    const result = await checkTradingDay(utcDate("2026-03-24"), {
      apiKeyId: "test-key",
      apiSecretKey: "test-secret",
    });

    expect(result.source).toBe("fallback");
    expect(result.isTradingDay).toBe(true);
  });

  it("falls back on network failure", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockRejectedValue(new Error("Network error")),
    );

    const result = await checkTradingDay(utcDate("2026-03-24"), {
      apiKeyId: "test-key",
      apiSecretKey: "test-secret",
    });

    expect(result.source).toBe("fallback");
    expect(result.isTradingDay).toBe(true);
  });
});
