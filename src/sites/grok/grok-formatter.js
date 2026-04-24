'use strict';

/**
 * Formats structured Grok conversation data into markdown.
 * Takes data objects from GrokExtractor, produces markdown strings.
 */
class GrokFormatter {
  /**
   * Unified format dispatch.
   * @param {string} contentType - 'conversation'
   * @param {object} data - Structured data from GrokExtractor
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
   * @param {object} [converter] - MarkdownConverter for HTML→markdown on Grok responses
   * @returns {string}
   */
  formatConversation(conversation, converter) {
    const parts = [];

    if (conversation.title) {
      parts.push(`# ${conversation.title}`);
      parts.push('');
    }

    parts.push('*Shared via Grok*');
    parts.push('');
    parts.push('---');
    parts.push('');

    for (const turn of conversation.turns) {
      if (turn.role === 'human') {
        parts.push('**Human:**');
        parts.push('');
        parts.push(turn.content);
      } else if (turn.role === 'assistant') {
        parts.push('**Grok:**');
        parts.push('');
        if (turn.thinking) {
          parts.push(`*${turn.thinking}*`);
          parts.push('');
        }
        if (turn.contentHtml && converter && typeof converter.convertHtmlFragment === 'function') {
          parts.push(converter.convertHtmlFragment(turn.contentHtml));
        } else if (turn.contentHtml) {
          const text = turn.contentHtml.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
          parts.push(text);
        }
      }

      parts.push('');
      parts.push('---');
      parts.push('');
    }

    let md = parts.join('\n').replace(/\n{3,}/g, '\n\n').trim();

    // Turndown occasionally emits a fenced code block flush against the
    // preceding paragraph (no blank line). Force one for readability.
    md = md.replace(/([^\n])\n(```)/g, '$1\n\n$2');

    return md;
  }
}

module.exports = GrokFormatter;
