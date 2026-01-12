import { config } from '../config.js';
import { logger } from '../middleware/index.js';

type CircuitState = 'CLOSED' | 'OPEN' | 'HALF_OPEN';

/**
 * Circuit breaker for fault tolerance.
 * 
 * States:
 * - CLOSED: Normal operation, requests pass through
 * - OPEN: Service is failing, requests are blocked
 * - HALF_OPEN: Testing if service recovered
 * 
 * Transitions:
 * - CLOSED -> OPEN: After failureThreshold consecutive failures
 * - OPEN -> HALF_OPEN: After resetTimeout
 * - HALF_OPEN -> CLOSED: On success
 * - HALF_OPEN -> OPEN: On failure
 */
export class CircuitBreaker {
  private state: CircuitState = 'CLOSED';
  private failureCount = 0;
  private lastFailureTime = 0;
  private readonly name: string;
  private readonly failureThreshold: number;
  private readonly resetTimeoutMs: number;

  constructor(name: string) {
    this.name = name;
    this.failureThreshold = config.circuitBreaker.failureThreshold;
    this.resetTimeoutMs = config.circuitBreaker.resetTimeoutMs;
  }

  /**
   * Check if the circuit allows requests
   */
  isOpen(): boolean {
    if (this.state === 'CLOSED') {
      return false;
    }

    if (this.state === 'OPEN') {
      // Check if reset timeout has passed
      const timeSinceFailure = Date.now() - this.lastFailureTime;
      if (timeSinceFailure >= this.resetTimeoutMs) {
        this.state = 'HALF_OPEN';
        logger.info({ circuit: this.name }, 'Circuit breaker entering HALF_OPEN state');
        return false;
      }
      return true;
    }

    // HALF_OPEN - allow one request through
    return false;
  }

  /**
   * Record a successful request
   */
  recordSuccess(): void {
    if (this.state === 'HALF_OPEN') {
      logger.info({ circuit: this.name }, 'Circuit breaker closing after successful test');
    }
    this.state = 'CLOSED';
    this.failureCount = 0;
  }

  /**
   * Record a failed request
   */
  recordFailure(): void {
    this.failureCount++;
    this.lastFailureTime = Date.now();

    if (this.state === 'HALF_OPEN') {
      // Failed during test - reopen circuit
      this.state = 'OPEN';
      logger.warn({ circuit: this.name }, 'Circuit breaker reopened after failed test');
      return;
    }

    if (this.failureCount >= this.failureThreshold) {
      this.state = 'OPEN';
      logger.warn({
        circuit: this.name,
        failure_count: this.failureCount,
        reset_timeout_ms: this.resetTimeoutMs,
      }, 'Circuit breaker opened');
    }
  }

  /**
   * Get current state
   */
  getState(): CircuitState {
    return this.state;
  }

  /**
   * Get time until circuit can be tested (if OPEN)
   */
  getRetryAfterMs(): number | null {
    if (this.state !== 'OPEN') {
      return null;
    }
    const elapsed = Date.now() - this.lastFailureTime;
    return Math.max(0, this.resetTimeoutMs - elapsed);
  }
}
