import type { Api } from 'grammy';
import { config } from '../config.js';
import { logger } from '../middleware/index.js';
import { CircuitBreaker } from './circuit-breaker.js';

/**
 * AI Hub 2.0 client with progress indicator and circuit breaker.
 */
export class AIHubClient {
  private readonly baseUrl: string;
  private readonly apiKey: string;
  private readonly endpoint: string;
  private readonly timeout: number;
  private readonly circuitBreaker: CircuitBreaker;

  constructor() {
    this.baseUrl = config.aiHubUrl;
    this.apiKey = config.aiHubApiKey;
    this.endpoint = config.aiHubEndpoint;
    this.timeout = config.aiHubTimeout;
    this.circuitBreaker = new CircuitBreaker('ai-hub');
  }

  /**
   * Send a message to AI Hub with progress indicator.
   * Sends "typing" action every 4 seconds while waiting for response.
   */
  async chatWithProgress(
    api: Api,
    chatId: number,
    message: string,
    sessionId: string | null
  ): Promise<string> {
    // Check circuit breaker
    if (this.circuitBreaker.isOpen()) {
      const retryAfter = this.circuitBreaker.getRetryAfterMs();
      logger.warn({
        circuit_state: this.circuitBreaker.getState(),
        retry_after_ms: retryAfter,
      }, 'AI Hub circuit breaker is open');
      
      return '⚠️ AI service is temporarily unavailable due to recent errors. Please try again in a moment.';
    }

    // Start typing indicator
    const typingInterval = setInterval(() => {
      api.sendChatAction(chatId, 'typing').catch(() => {
        // Ignore typing errors
      });
    }, 4000);

    // Send initial typing
    await api.sendChatAction(chatId, 'typing').catch(() => {});

    try {
      const response = await this.sendRequest(message, sessionId);
      this.circuitBreaker.recordSuccess();
      return response;
    } catch (error) {
      this.circuitBreaker.recordFailure();
      throw error;
    } finally {
      clearInterval(typingInterval);
    }
  }

  /**
   * Send request to AI Hub
   */
  private async sendRequest(message: string, sessionId: string | null): Promise<string> {
    const url = `${this.baseUrl}${this.endpoint}`;
    
    const payload: { message: string; session_id?: string } = { message };
    if (sessionId) {
      payload.session_id = sessionId;
    }

    logger.info({
      url,
      message_length: message.length,
      has_session: !!sessionId,
    }, 'Sending request to AI Hub');

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), this.timeout);

    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-API-Key': this.apiKey,
        },
        body: JSON.stringify(payload),
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (response.ok) {
        const contentType = response.headers.get('content-type') || '';
        
        if (contentType.includes('application/json')) {
          const data = await response.json() as Record<string, unknown>;
          // Handle various response formats
          if (typeof data === 'string') {
            return data;
          }
          const result = (data.response || data.output || data.data || data) as unknown;
          return typeof result === 'string' ? result : JSON.stringify(result);
        }
        
        return await response.text();
      }

      // Handle error responses
      if (response.status === 401) {
        return '⚠️ Authentication error. Please contact support.';
      }

      if (response.status === 429) {
        return '⚠️ Too many requests. Please wait a moment and try again.';
      }

      if (response.status >= 500) {
        throw new Error(`Server error: ${response.status}`);
      }

      const errorText = await response.text();
      return `⚠️ Error: ${response.status} - ${errorText.substring(0, 200)}`;
    } catch (error) {
      if ((error as Error).name === 'AbortError') {
        logger.error({
          timeout_ms: this.timeout,
        }, 'AI Hub request timed out');
        return '⚠️ Request timed out. The AI is taking too long to respond. Please try a simpler question.';
      }

      if ((error as Error).message.includes('fetch')) {
        logger.error({
          error: (error as Error).message,
        }, 'Cannot connect to AI Hub');
        return '⚠️ Cannot connect to AI service. Please try again later.';
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
        method: 'GET',
        signal: AbortSignal.timeout(5000),
      });
      return response.ok;
    } catch {
      return false;
    }
  }
}

// Singleton instance
let aiHubInstance: AIHubClient | null = null;

export function getAIHubClient(): AIHubClient {
  if (!aiHubInstance) {
    aiHubInstance = new AIHubClient();
  }
  return aiHubInstance;
}
