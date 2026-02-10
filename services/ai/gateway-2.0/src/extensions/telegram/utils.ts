const MAX_MESSAGE_LENGTH = 4000;

export function splitMessage(text: string): string[] {
  if (text.length <= MAX_MESSAGE_LENGTH) return [text];
  const chunks: string[] = [];
  let remaining = text;
  while (remaining.length > 0) {
    if (remaining.length <= MAX_MESSAGE_LENGTH) { chunks.push(remaining); break; }
    let splitIndex = remaining.lastIndexOf('\n', MAX_MESSAGE_LENGTH);
    if (splitIndex === -1 || splitIndex < MAX_MESSAGE_LENGTH / 2) {
      splitIndex = remaining.lastIndexOf(' ', MAX_MESSAGE_LENGTH);
    }
    if (splitIndex === -1 || splitIndex < MAX_MESSAGE_LENGTH / 2) {
      splitIndex = MAX_MESSAGE_LENGTH;
    }
    chunks.push(remaining.substring(0, splitIndex));
    remaining = remaining.substring(splitIndex).trim();
  }
  return chunks;
}
