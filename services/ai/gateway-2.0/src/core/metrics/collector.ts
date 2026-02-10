/**
 * Metrics collector – ported from Go.
 *
 * Node.js is single-threaded so we don't need atomic operations or mutexes;
 * plain numeric fields and object properties are sufficient.
 */

export interface MetricsSnapshot {
  uptimeSeconds: number;
  totalRequests: number;
  successRequests: number;
  failedRequests: number;
  blockedInjections: number;
  queueEnqueues: number;
  queueTimeouts: number;
  queueFullErrors: number;
  cliExecutions: number;
  cliTimeouts: number;
  cliErrors: number;
  cliAvgMs: number;
  sessionsPruned: number;
  usageRejections: number;
  requestsByTier: Record<string, number>;
}

export class MetricsCollector {
  private readonly startTime = Date.now();
  private totalRequests = 0;
  private successRequests = 0;
  private failedRequests = 0;
  private blockedInjections = 0;
  private queueEnqueues = 0;
  private queueTimeouts = 0;
  private queueFullErrors = 0;
  private cliExecutions = 0;
  private cliTimeouts = 0;
  private cliErrors = 0;
  private cliTotalMs = 0;
  private sessionsPruned = 0;
  private usageRejections = 0;
  private readonly requestsByTier: Record<string, number> = {};

  // Increment methods
  incTotalRequests(): void { this.totalRequests++; }
  incSuccessRequests(): void { this.successRequests++; }
  incFailedRequests(): void { this.failedRequests++; }
  incBlockedInjections(): void { this.blockedInjections++; }
  incQueueEnqueues(): void { this.queueEnqueues++; }
  incQueueTimeouts(): void { this.queueTimeouts++; }
  incQueueFullErrors(): void { this.queueFullErrors++; }
  incCLIExecutions(): void { this.cliExecutions++; }
  incCLITimeouts(): void { this.cliTimeouts++; }
  incCLIErrors(): void { this.cliErrors++; }
  incSessionsPruned(n: number): void { this.sessionsPruned += n; }
  incUsageRejections(): void { this.usageRejections++; }
  addCLIDuration(ms: number): void { this.cliTotalMs += ms; }
  incTierRequest(tier: string): void { this.requestsByTier[tier] = (this.requestsByTier[tier] ?? 0) + 1; }

  snapshot(): MetricsSnapshot {
    const avgMs = this.cliExecutions > 0 ? this.cliTotalMs / this.cliExecutions : 0;
    return {
      uptimeSeconds: (Date.now() - this.startTime) / 1000,
      totalRequests: this.totalRequests,
      successRequests: this.successRequests,
      failedRequests: this.failedRequests,
      blockedInjections: this.blockedInjections,
      queueEnqueues: this.queueEnqueues,
      queueTimeouts: this.queueTimeouts,
      queueFullErrors: this.queueFullErrors,
      cliExecutions: this.cliExecutions,
      cliTimeouts: this.cliTimeouts,
      cliErrors: this.cliErrors,
      cliAvgMs: Math.round(avgMs * 100) / 100,
      sessionsPruned: this.sessionsPruned,
      usageRejections: this.usageRejections,
      requestsByTier: { ...this.requestsByTier },
    };
  }
}
