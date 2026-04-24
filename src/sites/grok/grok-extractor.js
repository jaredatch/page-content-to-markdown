'use strict';

/**
 * Extracts structured conversation data from Grok share pages (grok.com/share/...).
 * Returns plain data objects — formatting is handled by GrokFormatter.
 *
 * Share page DOM structure:
 *   - document.title: "{conversation title} | Shared Grok Conversation"
 *   - Turns are matched by data-testid:
 *     - [data-testid="user-message"] — human turns (contain .response-content-markdown)
 *     - [data-testid="assistant-message"] — assistant turns
 *       - .thinking-container → reasoning collapse ("Thought for Ns" button)
 *       - .response-content-markdown → actual response content
 *   - Citation chips inside content: <a class="citation" href="..."> with U+2060 prefix in text
 */
class GrokExtractor {
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
   * Extract a full conversation from a Grok share page.
   * @param {Document} doc
   * @param {string} [url]
   * @returns {ConversationData|null}
   */
  extractConversation(doc, url) {
    const turns = this._extractTurns(doc);
    if (turns.length === 0) return null;

    const title = this._extractTitle(doc);

    return { title, url: url || '', turns };
  }

  /**
   * Extract the conversation title from document.title,
   * stripping the " | Shared Grok Conversation" suffix.
   */
  _extractTitle(doc) {
    const raw = (doc.title || '').trim();
    return raw.replace(/\s*\|\s*Shared Grok Conversation\s*$/i, '').trim();
  }

  /**
   * Extract all turns in document order by finding every user-message and
   * assistant-message testid. Preserves natural ordering.
   */
  _extractTurns(doc) {
    const turnEls = doc.querySelectorAll(
      '[data-testid="user-message"], [data-testid="assistant-message"]'
    );

    const turns = [];
    for (const el of turnEls) {
      const testid = el.getAttribute('data-testid');

      if (testid === 'user-message') {
        const content = this._extractUserContent(el);
        if (content) turns.push({ role: 'human', content });
      } else if (testid === 'assistant-message') {
        const thinking = this._extractThinking(el);
        const contentHtml = this._extractAssistantContentHtml(el);
        if (contentHtml) {
          turns.push({ role: 'assistant', contentHtml, thinking });
        }
      }
    }
    return turns;
  }

  /**
   * Extract plain text content from a user message.
   * User messages are short <p> elements, may contain inline <a> tags that
   * we preserve as raw text (the user's own text — keeping links inline).
   */
  _extractUserContent(userEl) {
    const content = userEl.querySelector('.response-content-markdown') || userEl;
    const paragraphs = content.querySelectorAll('p');
    if (paragraphs.length > 0) {
      return Array.from(paragraphs)
        .map(p => p.textContent.trim())
        .filter(Boolean)
        .join('\n\n');
    }
    return content.textContent.trim();
  }

  /**
   * Pull the "Thought for Ns" label from an assistant's thinking container,
   * if present. Returns null when there is no thinking block.
   */
  _extractThinking(assistantEl) {
    const container = assistantEl.querySelector('.thinking-container');
    if (!container) return null;
    const button = container.querySelector('button');
    if (!button) return null;
    const label = (button.textContent || '').trim();
    return label || null;
  }

  /**
   * Extract cleaned HTML for an assistant response.
   * Removes the thinking-container, normalizes citation chips, returns the
   * response-content-markdown innerHTML for the formatter to Turndown.
   */
  _extractAssistantContentHtml(assistantEl) {
    const content = assistantEl.querySelector('.response-content-markdown');
    if (!content) return '';

    const clone = content.cloneNode(true);

    // Strip U+2060 word-joiner prefix from citation chip text.
    // Chips are <a class="citation">⁠Source</a> — we keep the link but
    // normalize the visible text.
    clone.querySelectorAll('a.citation').forEach(a => {
      a.textContent = a.textContent.replace(/⁠/g, '');
    });

    // Remove multi-citation popover buttons like "⁠GitHub +2". These are
    // <button class="no-copy ..."> chips with no href, only a popover. They
    // render as dangling "Source +N" text in markdown since they have no
    // stable link to preserve. The inline citations elsewhere cover the
    // primary source; the extras would require clicking the popover.
    clone.querySelectorAll('button.no-copy').forEach(btn => btn.remove());

    // Default alt text for bare images so Turndown produces ![Image](url)
    // instead of ![](url). Grok's generated images have empty alt attrs.
    clone.querySelectorAll('img').forEach(img => {
      const alt = img.getAttribute('alt');
      if (!alt || !alt.trim()) img.setAttribute('alt', 'Image');
    });

    // Replace Grok's code-block wrappers with clean <pre><code> so Turndown
    // produces a proper fenced block. The native wrapper includes a language
    // header span and a "Copy" button row that would otherwise leak as text.
    clone.querySelectorAll('[data-testid="code-block"]').forEach(wrapper => {
      const lang = this._extractCodeBlockLang(wrapper);
      const text = this._extractCodeBlockText(wrapper);
      const pre = wrapper.ownerDocument.createElement('pre');
      const code = wrapper.ownerDocument.createElement('code');
      if (lang) code.className = `language-${lang}`;
      code.textContent = text;
      pre.appendChild(code);
      wrapper.replaceWith(pre);
    });

    return clone.innerHTML;
  }

  /**
   * Read the language label from a Grok code-block wrapper.
   * Looks for the small font-mono span in the header row.
   */
  _extractCodeBlockLang(wrapper) {
    const langSpan = wrapper.querySelector('.font-mono');
    if (!langSpan) return '';
    return (langSpan.textContent || '').trim().toLowerCase();
  }

  /**
   * Read the code text from a Grok code-block wrapper's <pre>, ignoring the
   * header/copy-button chrome. The <pre> contains syntax-highlighted <span>s
   * whose textContent is the clean source.
   */
  _extractCodeBlockText(wrapper) {
    const pre = wrapper.querySelector('pre');
    if (pre) return pre.textContent;
    const code = wrapper.querySelector('code');
    return code ? code.textContent : '';
  }
}

module.exports = GrokExtractor;
