'use strict';

/**
 * Extracts structured conversation data from Claude share pages (claude.ai/share/...).
 * Returns plain data objects — formatting is handled by ClaudeFormatter.
 *
 * Share page DOM structure:
 *   - Page header: [data-testid="page-header"] contains title + "Shared by {name}"
 *   - Conversation container: .flex-1.flex.flex-col.px-4.max-w-3xl
 *     - Child 0: disclaimer banner (border-0.5 class)
 *     - Children 1..N: alternating human/claude turns
 *       - Human turns: contain [data-testid="user-message"] with <p> elements
 *       - Claude turns: contain .font-claude-response with .standard-markdown content
 */
class ClaudeExtractor {
  /**
   * Unified extraction dispatch.
   * @param {string} contentType - 'conversation'
   * @param {Document} doc - The document
   * @param {string} [url] - Current page URL
   * @returns {object|null}
   */
  extract(contentType, doc, url) {
    switch (contentType) {
      case 'conversation': return this.extractConversation(doc, url);
      default: return null;
    }
  }

  /**
   * Extract a full conversation from a Claude share page.
   * @param {Document} doc
   * @param {string} [url]
   * @returns {ConversationData|null}
   */
  extractConversation(doc, url) {
    const container = this._findConversationContainer(doc);
    if (!container) return null;

    const title = this._extractTitle(doc);
    const sharedBy = this._extractSharedBy(doc);
    const turns = this._extractTurns(container);

    if (turns.length === 0) return null;

    return { title, sharedBy, url: url || '', turns };
  }

  /**
   * Find the conversation container element.
   */
  _findConversationContainer(doc) {
    // Primary: the conversation lives in a flex column container
    const container = doc.querySelector('.flex-1.flex.flex-col.px-4.max-w-3xl');
    if (container && container.children.length > 1) return container;

    return null;
  }

  /**
   * Extract the conversation title from the page header.
   */
  _extractTitle(doc) {
    const header = doc.querySelector('[data-testid="page-header"]');
    if (!header) return '';

    // Title is in a leaf element (div or span) — find the first one
    // that doesn't contain "Shared by"
    const allEls = header.querySelectorAll('*');
    for (const el of allEls) {
      if (el.children.length > 0) continue; // only leaf nodes
      const text = el.textContent.trim();
      if (text && text.length > 3 && !text.includes('Shared by')) {
        return text;
      }
    }

    // Fallback: try the document title (usually "Claude")
    const docTitle = doc.title || '';
    if (docTitle && docTitle !== 'Claude') return docTitle;

    return '';
  }

  /**
   * Extract who shared the conversation.
   */
  _extractSharedBy(doc) {
    const header = doc.querySelector('[data-testid="page-header"]');
    if (!header) return '';

    const text = header.textContent || '';
    const match = text.match(/Shared by\s+(.+)/);
    return match ? match[1].trim() : '';
  }

  /**
   * Extract all conversation turns from the container.
   * @returns {Array<{ role: 'human'|'assistant', content: string }>}
   */
  _extractTurns(container) {
    const turns = [];

    for (const child of container.children) {
      // Skip the disclaimer banner
      if ((child.className || '').includes('border-0.5')) continue;

      const userMsg = child.querySelector('[data-testid="user-message"]');
      const claudeResponse = child.querySelector('.font-claude-response');

      if (userMsg) {
        const content = this._extractHumanContent(userMsg);
        if (content) turns.push({ role: 'human', content });
      } else if (claudeResponse) {
        const contentHtml = this._extractClaudeContentHtml(claudeResponse);
        if (contentHtml) turns.push({ role: 'assistant', contentHtml });
      }
    }

    return turns;
  }

  /**
   * Extract text content from a human message.
   * Human messages are simple <p> tags with whitespace-pre-wrap.
   */
  _extractHumanContent(userMsgEl) {
    const paragraphs = userMsgEl.querySelectorAll('p');
    if (paragraphs.length > 0) {
      return Array.from(paragraphs)
        .map(p => p.textContent.trim())
        .filter(t => t)
        .join('\n\n');
    }
    return userMsgEl.textContent.trim();
  }

  /**
   * Extract HTML content from a Claude response, cleaning out UI elements.
   * Returns HTML string to be converted to markdown by the formatter.
   */
  _extractClaudeContentHtml(responseEl) {
    const clone = responseEl.cloneNode(true);

    // Remove "Searched the web" buttons and their row, but keep sibling content rows.
    // Structure: grid container > row-start-1 (search button) + row-start-2 (actual content)
    clone.querySelectorAll('button').forEach(btn => {
      const text = btn.textContent.trim();
      if (text.includes('Searched the web') || text.includes('Searched')) {
        // Remove just the row containing the search button, not the whole grid
        const row = btn.closest('[class*="row-start"]') ||
                    btn.closest('.min-w-0.pl-2');
        if (row) {
          row.remove();
        } else {
          btn.remove();
        }
      }
    });

    // Remove action bars (copy buttons, etc.)
    clone.querySelectorAll('[data-testid="action-bar-copy"]').forEach(el => {
      const actionBar = el.closest('[role="group"]') || el.closest('.flex.justify-start') || el.parentElement;
      if (actionBar) actionBar.remove();
    });

    // Remove sr-only elements
    clone.querySelectorAll('.sr-only, [role="status"]').forEach(el => el.remove());

    // Convert inline citations from <span class="inline-flex"><a href="...">Source</a></span>
    // into proper markdown-friendly links
    clone.querySelectorAll('span.inline-flex').forEach(span => {
      const link = span.querySelector('a[href]');
      if (link) {
        // Replace the span wrapper with just the link
        span.replaceWith(link);
      }
    });

    // Get the cleaned HTML from standard-markdown sections
    const markdownSections = clone.querySelectorAll('.standard-markdown');
    if (markdownSections.length > 0) {
      return Array.from(markdownSections)
        .map(section => section.innerHTML)
        .join('\n');
    }

    // Fallback: use the entire cleaned response
    return clone.innerHTML;
  }
}

module.exports = ClaudeExtractor;
