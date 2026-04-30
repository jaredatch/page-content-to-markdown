'use strict';

/**
 * Formats structured ChatGPT conversation data into markdown.
 * Takes data objects from ChatGPTExtractor, produces markdown strings.
 */
class ChatGPTFormatter {
  format(contentType, data, converter) {
    switch (contentType) {
      case 'conversation': return this.formatConversation(data, converter);
      default: return '';
    }
  }

  filenameTitle(contentType, data) {
    if (contentType !== 'conversation' || !data) return null;
    const title = data.title && data.title.trim();
    return title ? `ChatGPT — ${title}` : 'ChatGPT Conversation';
  }

  formatConversation(conversation, converter) {
    const parts = [];

    if (conversation.title) {
      parts.push(`# ${conversation.title}`);
      parts.push('');
    }

    parts.push('*Shared via ChatGPT*');
    parts.push('');
    parts.push('---');
    parts.push('');

    for (const turn of conversation.turns) {
      if (turn.role === 'human') {
        parts.push('**Human:**');
        parts.push('');
        if (turn.attachments > 0) {
          const noun = turn.attachments === 1 ? 'attachment' : 'attachments';
          parts.push(`*[${turn.attachments} ${noun} uploaded]*`);
          parts.push('');
        }
        if (turn.content) {
          parts.push(turn.content);
        }
      } else if (turn.role === 'assistant') {
        parts.push('**ChatGPT:**');
        parts.push('');

        if (turn.thinking) {
          parts.push(`*[${turn.thinking}]*`);
          parts.push('');
        }

        if (turn.contentHtml && converter && typeof converter.convertHtmlFragment === 'function') {
          parts.push(converter.convertHtmlFragment(turn.contentHtml));
        } else if (turn.contentHtml) {
          const text = turn.contentHtml.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
          parts.push(text);
        }

        if (Array.isArray(turn.generatedImages) && turn.generatedImages.length > 0) {
          if (turn.contentHtml) parts.push('');
          for (const img of turn.generatedImages) {
            parts.push(`![${img.alt}](${img.src})`);
          }
        }

        // Defensive: if the assistant turn has none of thinking, body, or
        // images, surface a placeholder so the role label isn't orphaned.
        if (!turn.thinking && !turn.contentHtml && (!turn.generatedImages || turn.generatedImages.length === 0)) {
          parts.push('*[Response not included in shared view]*');
        }
      }

      parts.push('');
      parts.push('---');
      parts.push('');
    }

    let md = parts.join('\n').replace(/\n{3,}/g, '\n\n').trim();

    // Tighten nested lists. Turndown emits a blank line between a parent
    // list item and its indented child sublist, which is valid markdown but
    // visually noisy. Drop the blank when the next non-blank line is an
    // indented bullet/number — covers both bullet and ordered parents.
    md = md.replace(/^([\-*+] [^\n]*)\n\n( {2,}[\-*+] )/gm, '$1\n$2');
    md = md.replace(/^(\d+\. [^\n]*)\n\n( {2,}(?:[\-*+]|\d+\.) )/gm, '$1\n$2');

    return md;
  }
}

module.exports = ChatGPTFormatter;
