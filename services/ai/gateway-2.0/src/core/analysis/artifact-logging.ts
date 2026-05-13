import { randomUUID } from "node:crypto";
import type { FastifyBaseLogger } from "fastify";
import type { ArtifactType } from "./artifact-errors.js";

export interface RunContext {
  runId: string;
  artifactType: ArtifactType;
}

export function newRunId(): string {
  return randomUUID();
}

export function newRunContext(artifactType: ArtifactType): RunContext {
  return { runId: newRunId(), artifactType };
}

export function makeArtifactRunLogger(opts: {
  baseLog: FastifyBaseLogger;
  runCtx: RunContext;
  slotKey: Record<string, string>;
}): FastifyBaseLogger {
  return opts.baseLog.child({
    runId: opts.runCtx.runId,
    artifactType: opts.runCtx.artifactType,
    ...opts.slotKey,
  });
}
