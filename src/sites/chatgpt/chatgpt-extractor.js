'use strict';

/**
 * Extracts structured conversation data from ChatGPT.
 * Works on share pages (chatgpt.com/share/{id}) and active chats
 * (chatgpt.com/c/{id}). Returns plain data objects — formatting is handled
 * by ChatGPTFormatter.
 *
 * DOM structure:
 *   - <section data-turn="user|assistant" data-testid="conversation-turn-N">
 *     wraps every turn. The data-turn attribute is locale-stable.
 *   - Inside each turn, an <h4 class="sr-only"> screen-reader label
 *     ("You said:" / "ChatGPT said:") sits as a sibling of the message body.
 *   - User messages: [data-message-author-role="user"] holds the prose inside
 *     a .user-message-bubble-color div. Attachments appear as repeated
 *     "Uploaded an image" labels (icon + sr-only text) above the bubble.
 *   - Assistant messages: [data-message-author-role="assistant"] holds a
 *     .markdown.prose div with the rendered markdown content.
 *   - Reasoning-only assistant turns: data-turn="assistant" with NO
 *     [data-message-author-role] inside — just a "Thought for Nm Ns" chip.
 *     Skipped entirely (no message body to extract).
 *   - Code blocks render via CodeMirror: <pre data-start data-end>
 *     ...<pre class="cm-content"><code><span>line</span><br>...</code></pre>.
 *     We replace these with clean <pre><code> nodes so Turndown produces a
 *     proper fenced block.
 */
class ChatGPTExtractor {
  extract(contentType, doc, url) {
    switch (contentType) {
      case 'conversation': return this.extractConversation(doc, url);
      default: return null;
    }
  }

  extractConversation(doc, url) {
    const turns = this._extractTurns(doc);
    if (turns.length === 0) return null;

    const title = this._extractTitle(doc);
    return { title, url: url || '', turns };
  }

  /**
   * Extract the conversation title from document.title, stripping any
   * page-context suffix ChatGPT appends. The brand suffix " | ChatGPT" only
   * appears on some routes; share pages typically render the bare title.
   *
   * i18n note: the " | ChatGPT" suffix uses a locale-stable brand name and
   * pipe separator, so this matcher works across languages.
   */
  _extractTitle(doc) {
    const raw = (doc.title || '').trim();
    return raw.replace(/\s*\|\s*ChatGPT\s*$/i, '').trim();
  }

  /**
   * Walk every turn section in document order. Assistant turns are unified:
   * every section with data-turn="assistant" produces one turn record with
   * any combination of thinking label, prose body, and generated images
   * present on that section. Without this, image-only or reasoning-only
   * turns (no [data-message-author-role] inside) silently disappear.
   */
  _extractTurns(doc) {
    const turnEls = doc.querySelectorAll('section[data-testid^="conversation-turn"]');
    const turns = [];

    for (const section of turnEls) {
      const turnRole = section.getAttribute('data-turn');

      if (turnRole === 'user') {
        const msg = section.querySelector('[data-message-author-role="user"]');
        if (!msg) continue;
        const userTurn = this._extractUserTurn(msg);
        if (userTurn) turns.push(userTurn);
      } else if (turnRole === 'assistant') {
        const asstTurn = this._extractAssistantTurnFromSection(section);
        if (asstTurn) turns.push(asstTurn);
      }
    }

    return turns;
  }

  /**
   * Build an assistant turn from a section, gathering whichever of
   * thinking-label, prose body, and generated images are present.
   *
   * A reasoning-model turn frequently contains MULTIPLE
   * [data-message-author-role="assistant"] siblings inside the section:
   * each is a streamed message (early "I'm checking..." preambles, then
   * the final answer). Iterating only the first silently dropped the rest,
   * including the actual response. Walk all of them in document order and
   * concatenate.
   *
   * Generated images live in their own [class*="imagegen-image"] wrapper
   * outside [data-message-author-role], so we always sweep the section for
   * them — even when the turn has prose.
   */
  _extractAssistantTurnFromSection(section) {
    const msgs = section.querySelectorAll('[data-message-author-role="assistant"]');
    const generatedImages = this._extractGeneratedImages(section);
    const thinking = this._extractThinkingLabel(section);

    const bodies = [];
    for (const msg of msgs) {
      const body = this._extractAssistantTurn(msg);
      if (body && body.contentHtml) bodies.push(body.contentHtml);
    }
    const contentHtml = bodies.length > 0 ? bodies.join('\n\n') : null;

    if (!contentHtml && generatedImages.length === 0 && !thinking) return null;

    return {
      role: 'assistant',
      thinking,
      contentHtml,
      generatedImages,
    };
  }

  /**
   * Collect generated images on an assistant turn. Each generated image
   * renders three <img> nodes (foreground + two backdrop copies) wrapped in
   * a single .group/imagegen-image container — we key off the wrapper to
   * dedupe and pick a representative src/alt per image.
   */
  _extractGeneratedImages(section) {
    const wrappers = section.querySelectorAll('[class*="imagegen-image"]');
    const seen = new Set();
    const out = [];
    for (const wrapper of wrappers) {
      const img = wrapper.querySelector('img[src]');
      if (!img) continue;
      const src = img.getAttribute('src');
      if (!src || seen.has(src)) continue;
      seen.add(src);
      let alt = (img.getAttribute('alt') || '').trim();
      if (!alt) alt = 'Generated image';
      out.push({ src, alt });
    }
    return out;
  }

  /**
   * Pull the "Thought for Nm Ns" label off a thinking-only assistant
   * section. The chip lives inside a small bordered box and has no testid
   * we can target directly — we look for any leaf text that matches the
   * recognizable "Thought for ..." shape.
   *
   * i18n note: the literal "Thought for" is English-only. Non-English
   * ChatGPT shares will surface a localized variant; in those cases we
   * return null and the formatter uses a generic placeholder. We keep this
   * matcher narrowly scoped so it informs cosmetics only — the placeholder
   * is rendered either way.
   */
  _extractThinkingLabel(section) {
    const candidates = section.querySelectorAll('div, span');
    for (const el of candidates) {
      if (el.children.length !== 0) continue;
      const t = (el.textContent || '').trim();
      if (/^Thought for\b/i.test(t) && t.length < 60) return t;
    }
    return null;
  }

  /**
   * User turns can contain attachment chrome (uploaded images, files) and
   * a prose bubble. We walk the bubble's prose div so that pasted code
   * blocks (rendered as inline <pre><code> children) are surfaced as fenced
   * blocks in the markdown rather than concatenated into a flat string.
   */
  _extractUserTurn(msgEl) {
    const attachments = this._countUserAttachments(msgEl);
    const bubble = msgEl.querySelector('.user-message-bubble-color');
    const proseEl = bubble || msgEl;
    const proseDiv = proseEl.querySelector('.whitespace-pre-wrap') || proseEl;

    let content = this._serializeUserProse(proseDiv);

    // Strip "Uploaded an image" labels that may bleed in if attachment chrome
    // shares an ancestor with the bubble (defensive — usually it doesn't).
    content = content.replace(/^(?:Uploaded an image\s*)+/i, '').trim();

    if (!content && attachments === 0) return null;

    return { role: 'human', content, attachments };
  }

  /**
   * Walk a user prose container and reconstruct markdown that preserves
   * embedded code blocks. The container has whitespace-pre-wrap CSS so plain
   * text is verbatim — but a flat textContent loses the fence boundaries
   * around any <pre><code> children, dumping pasted code as if it were
   * normal prose. We walk children explicitly to keep those fenced.
   */
  _serializeUserProse(root) {
    const out = [];
    for (const node of root.childNodes) {
      if (node.nodeType === 3) {
        out.push(node.textContent);
      } else if (node.nodeName === 'PRE') {
        const codeEl = node.querySelector('code');
        const code = (codeEl ? codeEl.textContent : node.textContent) || '';
        const lang = this._extractCodeLang(node);
        out.push('\n\n```' + (lang || '') + '\n' + code.replace(/\n+$/, '') + '\n```\n\n');
      } else if (node.nodeType === 1) {
        out.push(node.textContent || '');
      }
    }
    return out.join('').trim();
  }

  /**
   * Count attachments on a user turn. ChatGPT renders attachments in two
   * shapes depending on the page route:
   *
   *   - `/share/{id}` view: one `div.text-token-text-secondary` chip per
   *     attachment, with an icon and a label ("Uploaded an image" /
   *     "Uploaded a file"). Counted by chip presence.
   *   - `/c/{id}` active-conversation view: each attachment renders as a
   *     `<button aria-label="Open image in full view">` wrapping an
   *     `<img alt="Uploaded image">` thumbnail. No chip; the bubble has the
   *     prose only and attachment buttons sit above it.
   *
   * Try the chip path first (cheaper and unambiguous), then fall back to the
   * thumbnail-button path. They're alternative renderings, not additive.
   *
   * i18n note: the "Uploaded" prefix and the "Uploaded image" alt are
   * English-only. Non-English ChatGPT will localize both, in which case
   * attachment counts return 0 and the marker doesn't render — graceful
   * degradation, not a hard break. Conversation prose still extracts cleanly.
   */
  _countUserAttachments(msgEl) {
    const chips = msgEl.querySelectorAll('div.text-token-text-secondary');
    let count = 0;
    for (const chip of chips) {
      const txt = (chip.textContent || '').trim();
      if (/^Uploaded\b/i.test(txt)) count++;
    }
    if (count > 0) return count;

    const thumbnails = msgEl.querySelectorAll('button img[alt="Uploaded image"]');
    return thumbnails.length;
  }

  /**
   * Extract cleaned HTML for an assistant response. Reasoning models stream
   * multiple `.markdown` blocks per turn — short preambles ("I'm checking
   * which species...", "The likely pattern is...") followed by the final
   * answer body. The naive `querySelector('.markdown')` only grabs the
   * first, which on those turns is the scaffolding and the actual answer
   * silently disappears. Gather all of them, run sanitize on each, and
   * concatenate so the full reasoning + response flow comes through.
   *
   * Filter out nested `.markdown` blocks: writing-block UI (canvas, email,
   * chat, social-post previews) wraps an inner ProseMirror editor that now
   * also carries the `markdown` class, so the naive query returns one outer
   * body plus one inner body per writing block. The outer already serializes
   * the writing-block content inline, so re-emitting the inner duplicates
   * every draft. Keep only top-level blocks (no `.markdown` ancestor inside
   * msgEl) — the standalone reasoning-model streams remain top-level too.
   */
  _extractAssistantTurn(msgEl) {
    const all = Array.from(msgEl.querySelectorAll('.markdown'));
    const blocks = all.filter(el => !el.parentElement || !el.parentElement.closest('.markdown'));
    if (blocks.length === 0) return null;

    const parts = [];
    for (const block of blocks) {
      const clone = block.cloneNode(true);
      this._sanitizeAssistantContent(clone);
      const inner = clone.innerHTML.trim();
      if (inner) parts.push(inner);
    }

    if (parts.length === 0) return null;

    return {
      role: 'assistant',
      contentHtml: parts.join('\n\n')
    };
  }

  /**
   * Order matters in places — code blocks first since they have nested chrome
   * we don't want other passes touching, then KaTeX (replaces large subtrees),
   * then writing-block chrome (canvas/email/social previews), then task lists,
   * then citations (drop the inline pill chrome before transition stripping
   * has nothing left to do), then defensive image-alt defaults.
   */
  _sanitizeAssistantContent(clone) {
    this._replaceCodeBlocks(clone);
    this._replaceKatexBlocks(clone);
    this._stripWritingBlockChrome(clone);
    this._unwrapTaskListItems(clone);
    this._stripCitations(clone);
    this._stripTransitionDuplicates(clone);
    this._defaultImageAlts(clone);
  }

  /**
   * Drop ChatGPT's web-search citation chrome — the inline `[Source +N]`
   * pills sprinkled through search-grounded answers and the "Sources"
   * footnote button at the bottom. Keeping them turns a saved conversation
   * into a forwarded RAG payload: a downstream agent reading the markdown
   * is liable to chase 30+ source URLs that the human asker has no use for.
   *
   * Future: a "Citation handling" pref (inline | footnotes | strip) will
   * make this opt-in across all sites; for now we strip uniformly.
   */
  _stripCitations(clone) {
    clone.querySelectorAll('[data-testid="webpage-citation-pill"]').forEach(el => el.remove());
    // The "Sources" footnote button at the end of search-grounded answers —
    // a flex row of source-favicon avatars + a "Sources" label.
    clone.querySelectorAll('button[aria-label="Sources"]').forEach(el => el.remove());
  }

  /**
   * Strip elements with inline opacity:0 styling. Citation pills inside
   * search-grounded answers render their label twice (or more) — one
   * visible copy with opacity:1, plus one or more transition copies with
   * opacity:0 used to animate label changes. textContent flattens all
   * copies, producing "[PetMD+2PetMD+2](url)" or worse triple-printed
   * variants. Removing the opacity:0 copies leaves just the visible label.
   *
   * Scoped to inline-style "opacity: 0" so we don't accidentally strip
   * elements that hide via class — those tend to be more deliberate UI.
   */
  _stripTransitionDuplicates(clone) {
    clone.querySelectorAll('[style*="opacity: 0"], [style*="opacity:0"]').forEach(el => el.remove());
  }

  /**
   * Replace CodeMirror-rendered code blocks with clean <pre><code> nodes.
   * The outer <pre> has data-start/data-end attributes; inside, the actual
   * code lives in <pre class="cm-content"><code><span>line</span><br>...
   * The outer <pre> also wraps a sticky language-label header which
   * `_extractCodeLang` reads from.
   */
  _replaceCodeBlocks(clone) {
    clone.querySelectorAll('pre').forEach(outerPre => {
      const cm = outerPre.querySelector('.cm-content');
      if (!cm) return;
      const lang = this._extractCodeLang(outerPre);
      const text = this._extractCodeText(cm);
      const newPre = outerPre.ownerDocument.createElement('pre');
      const newCode = outerPre.ownerDocument.createElement('code');
      if (lang) newCode.className = `language-${lang}`;
      newCode.textContent = text.replace(/\n+$/, '');
      newPre.appendChild(newCode);
      outerPre.replaceWith(newPre);
    });
  }

  /**
   * Replace KaTeX-rendered math with markdown math markers. KaTeX renders
   * three parallel representations into the DOM (a MathML semantic tree, a
   * styled HTML tree for visual layout, and an <annotation> with the
   * original LaTeX source). textContent flattens all three, producing
   * "E=mc2E = mc^2E=mc2"-style triple-printed garbage. We pull just the
   * annotation and surround it with $/$$ markers so the formatter emits
   * proper markdown math.
   *
   * Order: replace block (.katex-display) first since they wrap inline
   * .katex elements; using .replaceWith on the display container removes
   * the inline ones from the live tree before the inline pass runs.
   */
  _replaceKatexBlocks(clone) {
    // Block math first — the display container wraps an inline .katex inside
    // it, so replacing the wrapper detaches the inner. The second query
    // re-runs against the mutated tree and finds only the still-attached
    // inline math elements. (Don't use Element.isConnected to gate iteration;
    // it returns false for everything inside a cloned-but-not-inserted
    // subtree, which is exactly our case.)
    clone.querySelectorAll('.katex-display').forEach(el => {
      const tex = this._readKatexAnnotation(el);
      if (!tex) { el.remove(); return; }
      const repl = el.ownerDocument.createElement('p');
      repl.textContent = `$$${tex}$$`;
      el.replaceWith(repl);
    });
    clone.querySelectorAll('.katex').forEach(el => {
      const tex = this._readKatexAnnotation(el);
      if (!tex) return;
      const repl = el.ownerDocument.createElement('span');
      repl.textContent = `$${tex}$`;
      el.replaceWith(repl);
    });
  }

  _readKatexAnnotation(el) {
    const ann = el.querySelector('annotation[encoding="application/x-tex"]');
    return ann ? ann.textContent.trim() : '';
  }

  /**
   * Remove ChatGPT writing-block chrome — the canvas/email/chat/social-post
   * preview blocks. Each block wraps an editable input pattern (textarea
   * stacked with an invisible auto-resize span carrying the same text),
   * plus a header with an "Edit" button. Without stripping:
   *   - The Edit button label leaks as plain text "Edit"
   *   - The visible textarea + invisible sizing span double the text
   *     ("Following up on our conversationFollowing up on our conversation")
   *
   * Strategy:
   *   1. Drop the entire sticky header (carries the Edit button + chrome).
   *   2. Drop any aria-hidden/invisible auto-resize spans whose text matches
   *      a sibling textarea — keeps the textarea content as the canonical
   *      copy.
   */
  _stripWritingBlockChrome(clone) {
    clone.querySelectorAll('[data-testid="writing-block-header-sticky-container"]').forEach(el => el.remove());
    clone.querySelectorAll('[data-testid="writing-block-header-magic-edit-button"]').forEach(el => el.remove());
    clone.querySelectorAll('span.invisible').forEach(el => el.remove());
  }

  /**
   * GFM's task-list rule expects `<li><input type="checkbox"> text</li>`,
   * but ChatGPT renders `<li class="task-list-item"><p><input ...> text</p></li>`.
   * The wrapping <p> hides the input from GFM's matcher, so checkboxes fall
   * through to plain text. Unwrap the single <p> child so the checkbox sits
   * directly under the <li>.
   */
  _unwrapTaskListItems(clone) {
    clone.querySelectorAll('li.task-list-item > p').forEach(p => {
      // Only unwrap when the <p> is the sole child — otherwise we'd merge
      // multi-paragraph list items into one inline run.
      if (p.parentElement.children.length !== 1) return;
      while (p.firstChild) p.parentNode.insertBefore(p.firstChild, p);
      p.remove();
    });
    // ChatGPT's task-list HTML inserts a leading space in the text node
    // immediately after the input checkbox (`<input ...> Done`). Turndown's
    // GFM rule emits its own space after `[ ]`, so the source space doubles
    // up as `- [ ]  Done`. Strip the leading space from that text node.
    clone.querySelectorAll('li.task-list-item > input[type="checkbox"]').forEach(input => {
      const next = input.nextSibling;
      if (next && next.nodeType === 3 && /^\s/.test(next.textContent)) {
        next.textContent = next.textContent.replace(/^\s+/, '');
      }
    });
  }

  /**
   * Default alt text for bare or URL-shaped image alts. ChatGPT's
   * search-result thumbnails copy the image URL into the alt attribute,
   * which would otherwise render as `![https://…](https://…)` — visually
   * useless and noisy. Replace anything URL-shaped with "Search result image"
   * (or just "Image" for bare empty alts) so the markdown stays legible.
   */
  _defaultImageAlts(clone) {
    clone.querySelectorAll('img').forEach(img => {
      const alt = (img.getAttribute('alt') || '').trim();
      if (!alt) {
        img.setAttribute('alt', 'Image');
      } else if (/^https?:\/\//i.test(alt)) {
        img.setAttribute('alt', 'Search result image');
      }
    });
  }

  /**
   * Try to read a language label from a code-block wrapper. Assistant code
   * blocks render a sticky header above the CodeMirror viewer that names the
   * language ("Python", "HTML", "JavaScript"); user-pasted code blocks have
   * no chrome and we return '' so Turndown emits a plain fence.
   *
   * The previous implementation scanned for any short text leaf inside the
   * <pre>, which would happily pick up the first syntax-highlighted token
   * ("print", "<!doctype") as the "language" — wrong. Reading from the
   * sticky header sidesteps that entirely and tolerates the icon/Copy chrome
   * that lives in the same strip.
   */
  _extractCodeLang(outerPre) {
    const sticky = outerPre.querySelector('[class*="sticky"]');
    if (!sticky) return '';
    // Clone the sticky and strip the Copy button so its textContent gives us
    // just the language label. Walking children doesn't work cleanly because
    // the label DIV holds a leading SVG icon as a sibling of the text node;
    // child-element checks would skip it.
    const clone = sticky.cloneNode(true);
    clone.querySelectorAll('button').forEach(b => b.remove());
    const text = (clone.textContent || '').trim();
    if (!text || text.length > 24) return '';
    if (!/^[a-zA-Z][a-zA-Z0-9+\-#.\s]*$/.test(text)) return '';
    return text.toLowerCase();
  }

  /**
   * Reconstruct code text from a CodeMirror .cm-content block. Each line is
   * a <span> with text (possibly nested for syntax highlighting), separated
   * by <br>. textContent alone loses the line breaks since <br> isn't a
   * text-producing node, so we walk children and inject \n at <br> boundaries.
   */
  _extractCodeText(cm) {
    const code = cm.querySelector('code') || cm;
    let out = '';
    const walk = (node) => {
      for (const child of node.childNodes) {
        if (child.nodeType === 3) {
          out += child.textContent;
        } else if (child.nodeName === 'BR') {
          out += '\n';
        } else if (child.nodeType === 1) {
          walk(child);
        }
      }
    };
    walk(code);
    return out;
  }
}

module.exports = ChatGPTExtractor;
