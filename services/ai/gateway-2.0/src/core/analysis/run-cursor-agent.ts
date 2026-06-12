/**
 * Shared cursor-agent subprocess runner.
 *
 * Extracted from the spawn logic used by `news-processor.ts` and
 * `memory-curator.ts` (same semantics: detached process group, hard
 * SIGKILL on timeout, ANSI-stripped stdout/stderr, stderr preview in
 * errors). New LLM call sites should use this instead of copying the
 * ~50-line spawn block again.
 */

import { spawn } from "node:child_process";
import type { FastifyBaseLogger } from "fastify";

const ANSI_RE = /\x1b\[[0-9;]*[a-zA-Z]/g;

export interface RunCursorAgentOpts {
  prompt: string;
  model: string;
  timeoutMs: number;
  log: FastifyBaseLogger;
  /** Label used in log lines so concurrent call sites stay tellable apart. */
  label: string;
}

/**
 * Runs `cursor-agent -p <prompt> --model <model> --trust` and resolves with
 * ANSI-stripped stdout. Rejects on timeout, spawn error, or non-zero exit
 * (with a stderr preview in the message).
 */
export function runCursorAgent(opts: RunCursorAgentOpts): Promise<string> {
  const { prompt, model, timeoutMs, log, label } = opts;

  const args = ["cursor-agent", "-p", prompt, "--model", model, "--trust"];
  const apiKey = process.env["CURSOR_API_KEY"];
  if (apiKey) args.push("--api-key", apiKey);

  return new Promise<string>((resolve, reject) => {
    const child = spawn(args[0]!, args.slice(1), {
      stdio: ["ignore", "pipe", "pipe"],
      detached: true,
    });

    const stdoutChunks: Buffer[] = [];
    const stderrChunks: Buffer[] = [];
    let settled = false;

    const getStderr = () =>
      Buffer.concat(stderrChunks).toString("utf-8").replace(ANSI_RE, "").trim().slice(0, 500);

    const timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      try {
        if (child.pid !== undefined) process.kill(-child.pid, "SIGKILL");
      } catch {
        /* already dead */
      }
      const stderr = getStderr();
      log.error({ label, stderr }, "cursor-agent timed out — stderr captured");
      reject(new Error(`${label}: LLM call timed out${stderr ? ` | stderr: ${stderr}` : ""}`));
    }, timeoutMs);

    child.stdout?.on("data", (chunk: Buffer) => stdoutChunks.push(chunk));
    child.stderr?.on("data", (chunk: Buffer) => stderrChunks.push(chunk));

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
        const stderr = getStderr();
        log.error({ label, code, stderr }, "cursor-agent exited with non-zero code");
        reject(
          new Error(
            `${label}: cursor-agent exited with code ${code}${stderr ? ` | stderr: ${stderr}` : ""}`,
          ),
        );
        return;
      }
      resolve(Buffer.concat(stdoutChunks).toString("utf-8").replace(ANSI_RE, "").trim());
    });
  });
}
