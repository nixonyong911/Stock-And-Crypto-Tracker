import { describe, it, expect } from "vitest";
import { evaluateTriggers } from "../digest-trigger.js";

const stockEntry = { symbol: "AAPL", assetType: "stock" };
const cryptoEntry = { symbol: "BTC/USD", assetType: "crypto" };

describe("evaluateTriggers", () => {
  describe("pre_open mode", () => {
    it("produces a slot for stock on a weekday", () => {
      const tuesday = new Date("2026-05-12T14:00:00Z");
      const slots = evaluateTriggers({
        now: tuesday,
        modes: ["pre_open"],
        triggerReason: "cron:pre_open",
        demand: [stockEntry],
      });
      expect(slots).toHaveLength(1);
      expect(slots[0]!.mode).toBe("pre_open");
      expect(slots[0]!.symbol).toBe("AAPL");
      expect(slots[0]!.windowStart.getUTCHours()).toBe(13);
    });

    it("returns no slot for crypto", () => {
      const tuesday = new Date("2026-05-12T14:00:00Z");
      const slots = evaluateTriggers({
        now: tuesday,
        modes: ["pre_open"],
        triggerReason: "cron:pre_open",
        demand: [cryptoEntry],
      });
      expect(slots).toHaveLength(0);
    });

    it("returns no slot on weekends", () => {
      const saturday = new Date("2026-05-16T14:00:00Z");
      const slots = evaluateTriggers({
        now: saturday,
        modes: ["pre_open"],
        triggerReason: "cron:pre_open",
        demand: [stockEntry],
      });
      expect(slots).toHaveLength(0);
    });
  });

  describe("post_close mode", () => {
    it("produces a slot for stock on a weekday", () => {
      const wednesday = new Date("2026-05-13T22:00:00Z");
      const slots = evaluateTriggers({
        now: wednesday,
        modes: ["post_close"],
        triggerReason: "cron:post_close",
        demand: [stockEntry],
      });
      expect(slots).toHaveLength(1);
      expect(slots[0]!.mode).toBe("post_close");
      expect(slots[0]!.windowStart.getUTCHours()).toBe(21);
    });

    it("returns no slot for crypto", () => {
      const wednesday = new Date("2026-05-13T22:00:00Z");
      const slots = evaluateTriggers({
        now: wednesday,
        modes: ["post_close"],
        triggerReason: "cron:post_close",
        demand: [cryptoEntry],
      });
      expect(slots).toHaveLength(0);
    });
  });

  describe("intraday mode", () => {
    it("produces a slot for stock", () => {
      const now = new Date("2026-05-13T15:30:45Z");
      const slots = evaluateTriggers({
        now,
        modes: ["intraday"],
        triggerReason: "signal:target_reached",
        demand: [stockEntry],
      });
      expect(slots).toHaveLength(1);
      expect(slots[0]!.mode).toBe("intraday");
      expect(slots[0]!.windowStart.getUTCSeconds()).toBe(0);
      expect(slots[0]!.windowStart.getUTCMinutes()).toBe(30);
    });

    it("produces a slot for crypto (24h market)", () => {
      const now = new Date("2026-05-13T03:15:00Z");
      const slots = evaluateTriggers({
        now,
        modes: ["intraday"],
        triggerReason: "signal:momentum_shift",
        demand: [cryptoEntry],
      });
      expect(slots).toHaveLength(1);
      expect(slots[0]!.symbol).toBe("BTC/USD");
    });

    it("buckets windowStart to the nearest minute", () => {
      const now = new Date("2026-05-13T15:30:45.123Z");
      const slots = evaluateTriggers({
        now,
        modes: ["intraday"],
        triggerReason: "signal:entry_zone",
        demand: [stockEntry],
      });
      expect(slots[0]!.windowStart.getUTCSeconds()).toBe(0);
      expect(slots[0]!.windowStart.getUTCMilliseconds()).toBe(0);
    });
  });

  describe("on_demand mode", () => {
    it("produces a slot for any asset type", () => {
      const now = new Date("2026-05-13T10:00:00Z");
      const slots = evaluateTriggers({
        now,
        modes: ["on_demand"],
        triggerReason: "http:force_send",
        demand: [stockEntry, cryptoEntry],
      });
      expect(slots).toHaveLength(2);
    });
  });

  describe("multiple modes", () => {
    it("produces slots for each requested mode", () => {
      const wednesday = new Date("2026-05-13T14:00:00Z");
      const slots = evaluateTriggers({
        now: wednesday,
        modes: ["pre_open", "intraday"],
        triggerReason: "cron:pre_open",
        demand: [stockEntry],
      });
      expect(slots).toHaveLength(2);
      const modes = slots.map((s) => s.mode);
      expect(modes).toContain("pre_open");
      expect(modes).toContain("intraday");
    });
  });

  describe("digestDate", () => {
    it("uses UTC date string", () => {
      const now = new Date("2026-05-13T23:59:00Z");
      const slots = evaluateTriggers({
        now,
        modes: ["intraday"],
        triggerReason: "signal:entry_zone",
        demand: [stockEntry],
      });
      expect(slots[0]!.digestDate).toBe("2026-05-13");
    });
  });

  describe("briefMode", () => {
    it("defaults to strict", () => {
      const now = new Date("2026-05-13T14:00:00Z");
      const slots = evaluateTriggers({
        now,
        modes: ["intraday"],
        triggerReason: "signal:entry_zone",
        demand: [stockEntry],
      });
      expect(slots[0]!.briefMode).toBe("strict");
    });

    it("uses provided briefMode", () => {
      const now = new Date("2026-05-13T14:00:00Z");
      const slots = evaluateTriggers({
        now,
        modes: ["intraday"],
        triggerReason: "signal:entry_zone",
        demand: [stockEntry],
        briefMode: "blended",
      });
      expect(slots[0]!.briefMode).toBe("blended");
    });
  });
});
