export interface HistoryMessage {
  role: 'user' | 'assistant' | string;
  content: string;
}

/**
 * Format conversation history into a "Conversation so far:" block.
 * - Enforces a maximum window of the last 6 messages.
 * - Truncates assistant answers to ~1200 characters.
 */
export function formatConversationHistory(
  messages: HistoryMessage[],
  maxWindow = 6,
  maxAssistantChars = 1200
): string {
  if (!messages || messages.length === 0) {
    return '';
  }

  // Load the last 6 messages
  const windowMessages = messages.slice(-maxWindow);

  const lines = windowMessages.map((msg) => {
    const roleLabel = msg.role === 'user' ? 'User' : 'Assistant';
    let text = (msg.content || '').trim();

    if (msg.role === 'assistant' && text.length > maxAssistantChars) {
      text = `${text.slice(0, maxAssistantChars)}... [truncated]`;
    }

    return `${roleLabel}: ${text}`;
  });

  return `Conversation so far:\n${lines.join('\n')}`;
}
