/**
 * Per-user message queue for Telegram.
 *
 * When a user sends multiple messages rapidly, they are queued FIFO
 * and processed one at a time. The user sees real-time position updates
 * in Telegram ("Queued 2 of 3", etc.).
 */

import type { Api } from "grammy";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface QueuedMessage {
  /** The user's text message */
  message: string;
  /** Telegram chat ID for sending replies */
  chatId: number;
  /** Telegram user ID */
  userId: number;
  /** Message ID of the queue status message (updated as position changes) */
  statusMsgId?: number;
  /** Callback to process the message and return response chunks */
  process: () => Promise<string[]>;
  /** Resolve the outer promise when done */
  resolve: (chunks: string[]) => void;
  /** Reject the outer promise on error */
  reject: (err: Error) => void;
}

interface UserQueue {
  /** Pending messages (FIFO) */
  items: QueuedMessage[];
  /** Whether the queue is currently processing */
  processing: boolean;
}

// ---------------------------------------------------------------------------
// UserMessageQueue
// ---------------------------------------------------------------------------

export class UserMessageQueue {
  private readonly queues = new Map<number, UserQueue>();
  private readonly api: Api;

  constructor(api: Api) {
    this.api = api;
  }

  /**
   * Get current queue depth for a user (including the one being processed).
   */
  depth(userId: number): number {
    return this.queues.get(userId)?.items.length ?? 0;
  }

  /**
   * Enqueue a message for processing. Returns a promise that resolves
   * with the response chunks when the message is processed.
   *
   * @param statusMsgId - Optional Telegram message ID of an already-sent
   *   "Processing..." indicator. If provided, the queue reuses (edits/deletes)
   *   it instead of creating new status messages.
   */
  async enqueue(
    chatId: number,
    userId: number,
    message: string,
    processFn: () => Promise<string[]>,
    statusMsgId?: number
  ): Promise<string[]> {
    let queue = this.queues.get(userId);
    if (!queue) {
      queue = { items: [], processing: false };
      this.queues.set(userId, queue);
    }

    return new Promise<string[]>((resolve, reject) => {
      const item: QueuedMessage = {
        message,
        chatId,
        userId,
        statusMsgId,
        process: processFn,
        resolve,
        reject,
      };

      queue!.items.push(item);
      const position = queue!.items.length;

      if (!queue!.processing) {
        this.processNext(userId);
      } else {
        this.sendQueueStatus(item, position, queue!.items.length);
      }
    });
  }

  // -------------------------------------------------------------------------
  // Internal
  // -------------------------------------------------------------------------

  private async processNext(userId: number): Promise<void> {
    const queue = this.queues.get(userId);
    if (!queue || queue.items.length === 0) {
      if (queue) {
        queue.processing = false;
      }
      return;
    }

    queue.processing = true;
    const item = queue.items[0]!;

    // Update status message to "Processing..." for the current item
    await this.updateToProcessing(item);

    // Update all waiting items with their new positions
    await this.updateQueuePositions(queue);

    try {
      const chunks = await item.process();
      item.resolve(chunks);
    } catch (err) {
      item.reject(err instanceof Error ? err : new Error(String(err)));
    } finally {
      // Remove completed item
      queue.items.shift();

      // Delete the status message for the completed item
      if (item.statusMsgId) {
        this.api.deleteMessage(item.chatId, item.statusMsgId).catch(() => {});
      }

      // Process next in queue (or clean up)
      if (queue.items.length > 0) {
        // Small delay to avoid rate limits
        setTimeout(() => this.processNext(userId), 200);
      } else {
        queue.processing = false;
        this.queues.delete(userId);
      }
    }
  }

  private async sendQueueStatus(
    item: QueuedMessage,
    position: number,
    total: number
  ): Promise<void> {
    const preview =
      item.message.length > 40
        ? item.message.slice(0, 40) + "..."
        : item.message;
    const text = `📋 *Queued (${position} of ${total})*\n_"${preview}"_\n\nYour message is in line. Please wait...`;

    try {
      if (item.statusMsgId) {
        await this.api.editMessageText(item.chatId, item.statusMsgId, text, {
          parse_mode: "Markdown",
        });
      } else {
        const msg = await this.api.sendMessage(item.chatId, text, {
          parse_mode: "Markdown",
        });
        item.statusMsgId = msg.message_id;
      }
    } catch {
      // Non-critical
    }
  }

  private async updateToProcessing(item: QueuedMessage): Promise<void> {
    if (item.statusMsgId) {
      // Update existing queue status to processing
      try {
        await this.api.editMessageText(
          item.chatId,
          item.statusMsgId,
          `⏳ *Processing your request...*\n_"${
            item.message.length > 40
              ? item.message.slice(0, 40) + "..."
              : item.message
          }"_`,
          { parse_mode: "Markdown" }
        );
      } catch {
        // Message may have been deleted
      }
    } else {
      // First message in queue — send a new processing status
      try {
        const msg = await this.api.sendMessage(
          item.chatId,
          "⏳ Processing your request..."
        );
        item.statusMsgId = msg.message_id;
      } catch {
        // Continue without status
      }
    }
  }

  private async updateQueuePositions(queue: UserQueue): Promise<void> {
    const total = queue.items.length;
    // Skip index 0 (currently processing), update positions for 1+
    for (let i = 1; i < queue.items.length; i++) {
      const waiting = queue.items[i]!;
      if (waiting.statusMsgId) {
        const preview =
          waiting.message.length > 40
            ? waiting.message.slice(0, 40) + "..."
            : waiting.message;
        try {
          await this.api.editMessageText(
            waiting.chatId,
            waiting.statusMsgId,
            `📋 *Queued (${i} of ${
              total - 1
            })*\n_"${preview}"_\n\nYour message is in line. Please wait...`,
            { parse_mode: "Markdown" }
          );
        } catch {
          // Telegram may reject if text hasn't changed
        }
      }
    }
  }

  /**
   * Clear all queues (for shutdown).
   */
  clear(): void {
    for (const [, queue] of this.queues) {
      for (const item of queue.items) {
        item.reject(new Error("Queue cleared"));
      }
    }
    this.queues.clear();
  }
}
