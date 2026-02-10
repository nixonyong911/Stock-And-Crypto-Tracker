import type { Api } from "grammy";
import { config } from "../config.js";
import { logger } from "../middleware/index.js";
import { CircuitBreaker } from "./circuit-breaker.js";

/**
 * Gateway API response
 */
interface GatewayResponse {
  response: string;
  session_id?: string;
  metadata?: {
    processing_ms?: number;
    model?: string;
    tier?: string;
  };
}

/**
 * Gateway API error response
 */
interface GatewayErrorResponse {
  error: string;
  reason?: string;
  next_recharge_at?: string;
  full_recharge_at?: string;
}

/**
 * Gateway client with processing indicator, circuit breaker, and retry.
 * Replaces AIHubClient.
 */
export class GatewayClient {
  private readonly baseUrl: string;
  private readonly apiKey: string;
  private readonly timeout: number;
  private readonly circuitBreaker: CircuitBreaker;

  // Retry config
  private readonly maxRetries = 3;
  private readonly retryBaseMs = 2000;

  constructor() {
    this.baseUrl = config.gatewayUrl;
    this.apiKey = config.gatewayApiKey;
    this.timeout = config.gatewayTimeout;
    this.circuitBreaker = new CircuitBreaker("gateway");
  }

  /**
   * Send a message to Gateway with processing indicator.
   *
   * Flow:
   * 1. Send static "Processing..." message (1 API call)
   * 2. Call Gateway
   * 3. Delete processing message + return response (1 API call)
   * Total: 3 API calls per request (vs ~40+ with typing loop)
   */
  async chatWithProgress(
    api: Api,
    chatId: number,
    message: string,
    userId: string,
    tier: string,
    sessionId: string | null
  ): Promise<{ response: string; sessionId?: string }> {
    // Check circuit breaker
    if (this.circuitBreaker.isOpen()) {
      const retryAfter = this.circuitBreaker.getRetryAfterMs();
      logger.warn(
        {
          circuit_state: this.circuitBreaker.getState(),
          retry_after_ms: retryAfter,
        },
        "Gateway circuit breaker is open"
      );

      return {
        response:
          "⚠️ AI service is temporarily unavailable due to recent errors. Please try again in a moment.",
      };
    }

    // Send static processing message
    let processingMsgId: number | null = null;
    try {
      const processingMsg = await api.sendMessage(
        chatId,
        "⏳ Processing your request..."
      );
      processingMsgId = processingMsg.message_id;
    } catch {
      // Continue even if processing message fails
    }

    try {
      const result = await this.sendRequestWithRetry(
        message,
        userId,
        tier,
        sessionId
      );
      this.circuitBreaker.recordSuccess();
      return result;
    } catch (error) {
      this.circuitBreaker.recordFailure();
      throw error;
    } finally {
      // Always delete processing message
      if (processingMsgId) {
        api.deleteMessage(chatId, processingMsgId).catch(() => {});
      }
    }
  }

  /**
   * Send request with exponential backoff retry
   */
  private async sendRequestWithRetry(
    message: string,
    userId: string,
    tier: string,
    sessionId: string | null
  ): Promise<{ response: string; sessionId?: string }> {
    let lastError: Error | null = null;

    for (let attempt = 0; attempt <= this.maxRetries; attempt++) {
      try {
        return await this.sendRequest(message, userId, tier, sessionId);
      } catch (error) {
        lastError = error as Error;

        // Check if this error is retryable
        if (!this.isRetryable(error as Error) || attempt === this.maxRetries) {
          throw error;
        }

        // Exponential backoff: 2s, 4s, 8s
        const delay = this.retryBaseMs * Math.pow(2, attempt);
        logger.warn(
          {
            attempt: attempt + 1,
            max_retries: this.maxRetries,
            delay_ms: delay,
            error: (error as Error).message,
          },
          "Gateway request failed, retrying"
        );

        await new Promise((resolve) => setTimeout(resolve, delay));
      }
    }

    throw lastError || new Error("Gateway request failed");
  }

  /**
   * Check if an error is retryable
   */
  private isRetryable(error: Error): boolean {
    // Network errors are retryable
    if (
      error.message.includes("fetch") ||
      error.message.includes("ECONNREFUSED")
    ) {
      return true;
    }
    // Server errors (502, 503, 504) are retryable
    if (
      error.message.includes("Server error: 502") ||
      error.message.includes("Server error: 503") ||
      error.message.includes("Server error: 504")
    ) {
      return true;
    }
    return false;
  }

  /**
   * Send a single request to Gateway
   */
  private async sendRequest(
    message: string,
    userId: string,
    tier: string,
    sessionId: string | null
  ): Promise<{ response: string; sessionId?: string }> {
    const url = `${this.baseUrl}/api/v1/chat`;

    const payload: Record<string, string> = {
      message,
      user_id: userId,
      tier,
    };
    if (sessionId) {
      payload.session_id = sessionId;
    }

    logger.info(
      {
        url,
        user_id: userId,
        tier,
        message_length: message.length,
        has_session: !!sessionId,
      },
      "Sending request to Gateway"
    );

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), this.timeout);

    try {
      const response = await fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-API-Key": this.apiKey,
          "X-Channel-Type": "telegram",
        },
        body: JSON.stringify(payload),
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (response.ok) {
        const data = (await response.json()) as GatewayResponse;
        return {
          response: data.response || "No response from AI.",
          sessionId: data.session_id,
        };
      }

      // Handle specific error responses
      const errorData = (await response
        .json()
        .catch(() => null)) as GatewayErrorResponse | null;

      if (response.status === 401) {
        return { response: "⚠️ Authentication error. Please contact support." };
      }

      if (response.status === 403) {
        // Injection blocked
        return {
          response:
            "⚠️ Your message was blocked by our safety system. Please rephrase your request.",
        };
      }

      if (response.status === 429) {
        // Rate limit / usage exhausted
        const rechargeInfo = errorData?.next_recharge_at
          ? `\n\nNext message available at: ${new Date(
              errorData.next_recharge_at
            ).toLocaleTimeString()}`
          : "";
        return {
          response: `⚠️ ${
            errorData?.error || "No messages remaining."
          }${rechargeInfo}\n\nUpgrade to Pro for unlimited messages.`,
        };
      }

      if (response.status === 409) {
        // User lock conflict
        return {
          response:
            "⏳ Your previous message is still processing. Please wait...",
        };
      }

      if (response.status === 503) {
        // Server busy / queue full
        throw new Error(`Server error: ${response.status}`);
      }

      if (response.status >= 500) {
        throw new Error(`Server error: ${response.status}`);
      }

      return {
        response: `⚠️ Error: ${errorData?.error || `HTTP ${response.status}`}`,
      };
    } catch (error) {
      clearTimeout(timeoutId);

      if ((error as Error).name === "AbortError") {
        logger.error({ timeout_ms: this.timeout }, "Gateway request timed out");
        return {
          response:
            "⚠️ Request timed out. The AI is taking too long to respond. Please try a simpler question.",
        };
      }

      throw error;
    }
  }

  /**
   * Health check
   */
  async healthCheck(): Promise<boolean> {
    try {
      const response = await fetch(`${this.baseUrl}/health/live`, {
        method: "GET",
        signal: AbortSignal.timeout(5000),
      });
      return response.ok;
    } catch {
      return false;
    }
  }
}

// Singleton instance
let gatewayInstance: GatewayClient | null = null;

export function getGatewayClient(): GatewayClient {
  if (!gatewayInstance) {
    gatewayInstance = new GatewayClient();
  }
  return gatewayInstance;
}
