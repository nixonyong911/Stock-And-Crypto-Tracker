import { describe, it, expect } from "vitest";
import {
  classifyArtifactError,
  ARTIFACT_ERROR_CODES,
} from "../artifact-errors.js";

describe("classifyArtifactError", () => {
  it("classifies timeout errors", () => {
    expect(classifyArtifactError(new Error("cursor-agent timed out after 60s"))).toBe("llm_timeout");
  });

  it("classifies non-zero exit errors", () => {
    expect(classifyArtifactError(new Error("cursor-agent exited with code 1"))).toBe("llm_exit_nonzero");
  });

  it("classifies spawn failures", () => {
    expect(classifyArtifactError(new Error("ENOENT: spawn cursor-agent"))).toBe("llm_spawn_failed");
    expect(classifyArtifactError(new Error("spawn error"))).toBe("llm_spawn_failed");
  });

  it("classifies truth fetch failures for smart_digest", () => {
    expect(
      classifyArtifactError(new Error("truth fetch failed: no price_target"),
        { artifactType: "smart_digest" }),
    ).toBe("truth_fetch_failed");
  });

  it("classifies render failures for smart_digest", () => {
    expect(
      classifyArtifactError(new Error("render failed: sharp module error"),
        { artifactType: "smart_digest" }),
    ).toBe("render_failed");
  });

  it("does not use smart_digest-specific codes without the hint", () => {
    expect(classifyArtifactError(new Error("truth fetch failed"))).toBe("generation_failed");
  });

  it("classifies parse/JSON errors", () => {
    expect(classifyArtifactError(new Error("JSON parse error"))).toBe("parse_failed");
  });

  it("classifies snapshot empty", () => {
    expect(classifyArtifactError(new Error("snapshot is empty"))).toBe("snapshot_empty");
  });

  it("falls back to generation_failed for unknown errors", () => {
    expect(classifyArtifactError(new Error("something broke"))).toBe("generation_failed");
  });

  it("handles non-Error values", () => {
    expect(classifyArtifactError("just a string")).toBe("generation_failed");
    expect(classifyArtifactError(null)).toBe("generation_failed");
  });

  it("ARTIFACT_ERROR_CODES includes all known codes", () => {
    expect(ARTIFACT_ERROR_CODES).toContain("generation_failed");
    expect(ARTIFACT_ERROR_CODES).toContain("llm_timeout");
    expect(ARTIFACT_ERROR_CODES).toContain("unknown");
    expect(ARTIFACT_ERROR_CODES.length).toBeGreaterThanOrEqual(9);
  });
});
