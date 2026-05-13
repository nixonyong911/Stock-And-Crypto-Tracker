export type ArtifactType = "smart_digest" | "daily_overview";

export const ARTIFACT_ERROR_CODES = [
  "generation_failed",
  "truth_fetch_failed",
  "render_failed",
  "llm_timeout",
  "llm_exit_nonzero",
  "llm_spawn_failed",
  "snapshot_empty",
  "parse_failed",
  "unknown",
] as const;

export type ArtifactErrorCode = (typeof ARTIFACT_ERROR_CODES)[number];

export function classifyArtifactError(
  err: unknown,
  hints?: { artifactType?: ArtifactType },
): ArtifactErrorCode {
  const msg = err instanceof Error ? err.message : String(err);

  if (msg.includes("timed out")) return "llm_timeout";
  if (msg.includes("exited with code")) return "llm_exit_nonzero";
  if (msg.includes("ENOENT") || msg.includes("spawn")) return "llm_spawn_failed";

  if (hints?.artifactType === "smart_digest") {
    if (msg.includes("truth") || msg.includes("price_target")) return "truth_fetch_failed";
    if (msg.includes("render") || msg.includes("canvas") || msg.includes("sharp"))
      return "render_failed";
  }

  if (msg.includes("parse") || msg.includes("JSON")) return "parse_failed";
  if (msg.includes("snapshot") && msg.includes("empty")) return "snapshot_empty";

  return "generation_failed";
}
