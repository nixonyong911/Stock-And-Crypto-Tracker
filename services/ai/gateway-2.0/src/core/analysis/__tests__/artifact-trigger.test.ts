import { describe, it, expect } from "vitest";
import { buildTriggerReason } from "../artifact-trigger.js";
import type { ArtifactTriggerSource } from "../artifact-trigger.js";

describe("buildTriggerReason", () => {
  it("returns source only when no qualifier", () => {
    expect(buildTriggerReason("cron")).toBe("cron");
  });

  it("joins source and qualifier with colon", () => {
    expect(buildTriggerReason("cron", "pre_market")).toBe("cron:pre_market");
  });

  it("appends signal type when extra.signalType provided", () => {
    expect(
      buildTriggerReason("signal", "intraday", { signalType: "entry_zone" }),
    ).toBe("signal:intraday:entry_zone");
  });

  it("ignores empty extra.signalType", () => {
    expect(buildTriggerReason("signal", "intraday", {})).toBe("signal:intraday");
  });

  it("works for all known trigger sources", () => {
    const sources: ArtifactTriggerSource[] = [
      "cron", "rabbitmq", "http_trigger", "http_debug", "http_force_send", "signal",
    ];
    for (const src of sources) {
      const result = buildTriggerReason(src, "test");
      expect(result).toBe(`${src}:test`);
    }
  });
});
