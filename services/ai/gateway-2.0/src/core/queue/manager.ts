/**
 * Priority queue manager for gateway request scheduling.
 *
 * Ported from the Go implementation that uses container/heap + sync.Mutex.
 * In Node.js (single-threaded), we replace mutexes with synchronous code
 * and Go channels with Promises.
 */

import { Heap } from "heap-js";
import type { FastifyBaseLogger } from "fastify";
import type { GatewayConfig } from "../../config.js";
import { type Tier, getTierConfig } from "../../config.js";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface QueueItem {
  tier: Tier;
  priority: number;
  timestamp: number; // Date.now()
  resolve: () => void;
  reject: (reason: Error) => void;
  settled: boolean;
}

export interface QueueStats {
  queueDepth: number;
  running: number;
  maxConcurrent: number;
}

// ---------------------------------------------------------------------------
// QueueManager
// ---------------------------------------------------------------------------

export class QueueManager {
  private readonly heap: Heap<QueueItem>;
  private readonly maxConcurrent: number;
  private readonly logger: FastifyBaseLogger;
  private running = 0;
  private stopped = false;

  constructor(config: GatewayConfig, logger: FastifyBaseLogger) {
    this.maxConcurrent = config.maxConcurrent;
    this.logger = logger;

    // Higher priority first (descending); ties broken by earliest timestamp (FIFO).
    this.heap = new Heap<QueueItem>((a, b) => {
      if (a.priority !== b.priority) return b.priority - a.priority;
      return a.timestamp - b.timestamp;
    });
  }

  // -------------------------------------------------------------------------
  // enqueue
  // -------------------------------------------------------------------------

  /**
   * Enqueue a request for a given tier. Resolves once a concurrency slot is
   * available. The returned function **must** be called to release the slot.
   *
   * @param tier    - The subscription tier of the caller.
   * @param signal  - Optional AbortSignal for cancellation.
   * @returns A release function that frees the concurrency slot.
   */
  async enqueue(tier: Tier, signal?: AbortSignal): Promise<() => void> {
    if (this.stopped) {
      throw new Error("queue is stopped");
    }

    const tierConfig = getTierConfig(tier);

    // Check per-tier queue depth.
    const tierDepth = this.heap
      .toArray()
      .filter((item) => item.tier === tier).length;

    if (tierDepth >= tierConfig.maxQueueDepth) {
      throw new Error(`queue full for tier ${tier}`);
    }

    // Build the queue item with a Promise that resolves when dispatched.
    let itemResolve!: () => void;
    let itemReject!: (reason: Error) => void;

    const gate = new Promise<void>((resolve, reject) => {
      itemResolve = resolve;
      itemReject = reject;
    });

    const item: QueueItem = {
      tier,
      priority: tierConfig.priority,
      timestamp: Date.now(),
      resolve: itemResolve,
      reject: itemReject,
      settled: false,
    };

    this.heap.push(item);
    this.logger.debug(
      { tier, priority: item.priority, queueDepth: this.heap.size() },
      "enqueued request",
    );

    // Attempt to dispatch immediately (synchronous).
    this.tryDispatch();

    // 60-second timeout guard.
    const timeout = setTimeout(() => {
      if (!item.settled) {
        item.settled = true;
        this.heap.remove(item);
        item.reject(new Error("queue timeout"));
      }
    }, 60_000);

    // Optional abort signal handling.
    const onAbort = (): void => {
      if (!item.settled) {
        item.settled = true;
        this.heap.remove(item);
        item.reject(new Error("queue aborted"));
      }
    };

    if (signal) {
      if (signal.aborted) {
        // Already aborted before we even enqueued – clean up immediately.
        if (!item.settled) {
          item.settled = true;
          this.heap.remove(item);
          clearTimeout(timeout);
          throw new Error("queue aborted");
        }
      }
      signal.addEventListener("abort", onAbort, { once: true });
    }

    try {
      await gate;
    } finally {
      clearTimeout(timeout);
      if (signal) {
        signal.removeEventListener("abort", onAbort);
      }
    }

    // Return an idempotent release function.
    let released = false;
    return () => {
      if (released) return;
      released = true;
      this.running--;
      this.logger.debug(
        { tier, running: this.running },
        "released concurrency slot",
      );
      this.tryDispatch();
    };
  }

  // -------------------------------------------------------------------------
  // tryDispatch
  // -------------------------------------------------------------------------

  /**
   * Dispatch as many queued items as available concurrency slots allow.
   * Because Node.js is single-threaded this is purely synchronous.
   */
  private tryDispatch(): void {
    while (this.running < this.maxConcurrent && this.heap.size() > 0) {
      const item = this.heap.pop();
      if (!item) break;

      // Skip already-settled items (timed-out / aborted).
      if (item.settled) continue;

      item.settled = true;
      this.running++;
      this.logger.debug(
        { tier: item.tier, running: this.running },
        "dispatched request",
      );
      item.resolve();
    }
  }

  // -------------------------------------------------------------------------
  // stats
  // -------------------------------------------------------------------------

  stats(): QueueStats {
    return {
      queueDepth: this.heap.size(),
      running: this.running,
      maxConcurrent: this.maxConcurrent,
    };
  }

  // -------------------------------------------------------------------------
  // stop
  // -------------------------------------------------------------------------

  /**
   * Gracefully stop the queue, rejecting all pending items.
   */
  stop(): void {
    this.stopped = true;
    const pending = this.heap.toArray();
    for (const item of pending) {
      if (!item.settled) {
        item.settled = true;
        item.reject(new Error("queue stopped"));
      }
    }
    this.heap.clear();
    this.logger.info("queue manager stopped");
  }
}
