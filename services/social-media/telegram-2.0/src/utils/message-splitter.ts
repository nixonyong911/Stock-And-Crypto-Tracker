/**
 * Split long messages into chunks that fit Telegram's 4096 character limit.
 */

const MAX_MESSAGE_LENGTH = 4000; // Leave some buffer below 4096

/**
 * Split a long message into chunks
 */
export function splitMessage(text: string): string[] {
  if (text.length <= MAX_MESSAGE_LENGTH) {
    return [text];
  }

  const chunks: string[] = [];
  let remaining = text;

  while (remaining.length > 0) {
    if (remaining.length <= MAX_MESSAGE_LENGTH) {
      chunks.push(remaining);
      break;
    }

    // Try to split at a newline or space
    let splitIndex = remaining.lastIndexOf('\n', MAX_MESSAGE_LENGTH);
    
    if (splitIndex === -1 || splitIndex < MAX_MESSAGE_LENGTH / 2) {
      splitIndex = remaining.lastIndexOf(' ', MAX_MESSAGE_LENGTH);
    }

    if (splitIndex === -1 || splitIndex < MAX_MESSAGE_LENGTH / 2) {
      // No good split point, just cut at max length
      splitIndex = MAX_MESSAGE_LENGTH;
    }

    chunks.push(remaining.substring(0, splitIndex));
    remaining = remaining.substring(splitIndex).trim();
  }

  return chunks;
}
