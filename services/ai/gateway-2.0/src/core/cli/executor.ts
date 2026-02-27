/**
 * CLI Executor – spawns cursor-agent as a child process with timeout and
 * process-group cleanup.
 *
 * Ported from the Go gateway executor (cursor-agent only).
 */

import { spawn, type ChildProcess } from "node:child_process";
import type { FastifyBaseLogger } from "fastify";
import type { GatewayConfig } from "../../config.js";

// ---------------------------------------------------------------------------
// Regex hoisted to module scope (avoids recreation per call)
// ---------------------------------------------------------------------------

const ANSI_RE = /\x1b\[[0-9;]*[a-zA-Z]/g;
const STDERR_NOISE_RE = /warning:|known_hosts|permanently added/i;

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

export interface ExecuteParams {
  readonly message: string;
  readonly contextPath: string;
  readonly model: string;
  readonly sessionId: string;
  readonly tier: string;
  readonly homePath: string;
  readonly timeoutMs: number;
}

export interface CLIResult {
  readonly success: boolean;
  readonly output: string;
  readonly error: string;
  readonly exitCode: number;
  readonly executionTimeMs: number;
}

// ---------------------------------------------------------------------------
// CLIExecutor
// ---------------------------------------------------------------------------

export class CLIExecutor {
  private readonly _config: GatewayConfig;
  private readonly logger: FastifyBaseLogger;

  constructor(config: GatewayConfig, logger: FastifyBaseLogger) {
    this._config = config;
    this.logger = logger;
  }

  /** Access config when needed by future extensions. */
  get config(): GatewayConfig {
    return this._config;
  }

  // -------------------------------------------------------------------------
  // execute
  // -------------------------------------------------------------------------

  async execute(params: ExecuteParams): Promise<CLIResult> {
    const startTime = Date.now();
    const args = this.buildArgs(params);

    this.logger.info(
      { cli: args[0], contextPath: params.contextPath, tier: params.tier },
      "Spawning CLI process"
    );

    return new Promise<CLIResult>((resolve) => {
      // Spawn cursor-agent in its own process group (detached).
      // stdin is ignored – the agent runs non-interactively.
      const child: ChildProcess = spawn(args[0]!, args.slice(1), {
        cwd: params.contextPath,
        env: { ...process.env, HOME: params.homePath },
        stdio: ["ignore", "pipe", "pipe"],
        detached: true,
      });

      const stdoutChunks: Buffer[] = [];
      const stderrChunks: Buffer[] = [];
      let settled = false;

      // -- Timeout -----------------------------------------------------------

      const timer = setTimeout(() => {
        if (settled) return;
        settled = true;

        this.logger.warn(
          { pid: child.pid, timeoutMs: params.timeoutMs },
          "CLI process timed out – killing process group"
        );

        this.killProcessGroup(child);

        resolve({
          success: false,
          output: "",
          error: `Process timed out after ${params.timeoutMs}ms`,
          exitCode: -1,
          executionTimeMs: Date.now() - startTime,
        });
      }, params.timeoutMs);

      // -- Stream collection -------------------------------------------------

      child.stdout?.on("data", (chunk: Buffer) => {
        stdoutChunks.push(chunk);
      });

      child.stderr?.on("data", (chunk: Buffer) => {
        stderrChunks.push(chunk);
      });

      // -- Spawn error (e.g. binary not found) -------------------------------

      child.on("error", (err: Error) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);

        this.logger.error({ err }, "CLI process failed to start");

        resolve({
          success: false,
          output: "",
          error: err.message,
          exitCode: -1,
          executionTimeMs: Date.now() - startTime,
        });
      });

      // -- Process exit ------------------------------------------------------

      child.on("close", (code: number | null) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);

        const exitCode = code ?? -1;
        const rawStdout = Buffer.concat(stdoutChunks).toString("utf-8");
        const rawStderr = Buffer.concat(stderrChunks).toString("utf-8");

        const output = CLIExecutor.cleanOutput(rawStdout);
        const errorOutput = CLIExecutor.cleanStderr(rawStderr);

        this.logger.info(
          { exitCode, executionTimeMs: Date.now() - startTime },
          "CLI process finished"
        );

        resolve({
          success: exitCode === 0,
          output,
          error: errorOutput,
          exitCode,
          executionTimeMs: Date.now() - startTime,
        });
      });
    });
  }

  // -------------------------------------------------------------------------
  // checkCLIAvailable
  // -------------------------------------------------------------------------

  /**
   * Returns `true` if `cursor-agent --version` exits successfully within 10 s.
   */
  async checkCLIAvailable(): Promise<boolean> {
    const TIMEOUT_MS = 10_000;

    return new Promise<boolean>((resolve) => {
      const child = spawn("cursor-agent", ["--version"], {
        stdio: ["ignore", "pipe", "pipe"],
      });

      let settled = false;

      const timer = setTimeout(() => {
        if (settled) return;
        settled = true;
        this.killProcessGroup(child);
        this.logger.warn("cursor-agent --version timed out");
        resolve(false);
      }, TIMEOUT_MS);

      child.on("error", () => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        resolve(false);
      });

      child.on("close", (code) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        resolve(code === 0);
      });
    });
  }

  // -------------------------------------------------------------------------
  // Private helpers
  // -------------------------------------------------------------------------

  /**
   * Build the argument array for cursor-agent.
   *
   * cursor-agent -p "<msg>" --approve-mcps --force [--model <model>] [--resume=<id>]
   */
  private buildArgs(params: ExecuteParams): string[] {
    // Last-resort guard: if the message starts with "/" it could be
    // interpreted as a Cursor CLI built-in command (/compress, /commands,
    // /max-mode, etc.).  Prefix with a space so cursor-agent treats it as
    // plain text.  Layers 1 (Telegram) and 2 (SecurityService) should
    // have already blocked this for non-DEV users, but defense-in-depth.
    let message = params.message;
    if (message.startsWith("/")) {
      this.logger.warn(
        { message: message.slice(0, 50) },
        "Slash-prefixed message reached CLI executor – sanitizing"
      );
      message = ` ${message}`;
    }

    const args: string[] = [
      "cursor-agent",
      "-p",
      message,
      "--approve-mcps",
      "--force",
    ];

    if (params.model) {
      args.push("--model", params.model);
    }

    if (params.sessionId) {
      args.push(`--resume=${params.sessionId}`);
    }

    const apiKey = process.env["CURSOR_API_KEY"];
    if (apiKey) {
      args.push("--api-key", apiKey);
    }

    return args;
  }

  /**
   * Kill the entire process group. Wrapped in try-catch because the process
   * may already have exited.
   */
  private killProcessGroup(child: ChildProcess): void {
    try {
      if (child.pid !== undefined) {
        // Negative PID sends the signal to the entire process group.
        process.kill(-child.pid, "SIGKILL");
      }
    } catch {
      // Process (group) already dead – ignore.
    }
  }

  // -------------------------------------------------------------------------
  // Static output cleaners
  // -------------------------------------------------------------------------

  /** Strip ANSI escape codes from stdout. */
  static cleanOutput(raw: string): string {
    return raw.replace(ANSI_RE, "").trim();
  }

  /** Filter noisy lines from stderr (warnings, ssh noise, etc.). */
  static cleanStderr(raw: string): string {
    return raw
      .split("\n")
      .filter((line) => line.trim() !== "" && !STDERR_NOISE_RE.test(line))
      .join("\n")
      .trim();
  }
}
