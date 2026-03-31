'use strict';

/**
 * Formats structured Claude conversation data into markdown.
 * Takes data objects from ClaudeExtractor, produces markdown strings.
 */
class ClaudeFormatter {
  /**
   * Unified format dispatch.
   * @param {string} contentType - 'conversation'
   * @param {object} data - Structured data from ClaudeExtractor
   * @param {object} [converter] - Optional MarkdownConverter instance
   * @returns {string}
   */
  format(contentType, data, converter) {
    switch (contentType) {
      case 'conversation': return this.formatConversation(data, converter);
      default: return '';
    }
  }

  /**
   * Format a full conversation as markdown.
   * @param {ConversationData} conversation
   * @param {object} [converter] - MarkdownConverter for HTML→markdown on Claude responses
   * @returns {string}
   */
  formatConversation(conversation, converter) {
    const parts = [];

    // Title
    if (conversation.title) {
      parts.push(`# ${conversation.title}`);
      parts.push('');
    }

    // Shared by line
    if (conversation.sharedBy) {
      parts.push(`*Shared by ${conversation.sharedBy} via Claude*`);
      parts.push('');
    }

    parts.push('---');
    parts.push('');

    // Turns
    for (const turn of conversation.turns) {
      if (turn.role === 'human') {
        parts.push('**Human:**');
        parts.push('');
        parts.push(turn.content);
      } else if (turn.role === 'assistant') {
        parts.push('**Claude:**');
        parts.push('');
        if (turn.contentHtml && converter && typeof converter.convertHtmlFragment === 'function') {
          const md = converter.convertHtmlFragment(turn.contentHtml);
          parts.push(md);
        } else if (turn.contentHtml) {
          // Simple fallback: strip tags
          const text = turn.contentHtml.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
          parts.push(text);
        }
      }

      parts.push('');
      parts.push('---');
      parts.push('');
    }

    return parts.join('\n').replace(/\n{3,}/g, '\n\n').trim();
  }
}

module.exports = ClaudeFormatter;
