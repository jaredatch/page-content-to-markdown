'use strict';

/**
 * Extracts structured data from X/Twitter pages.
 * Returns plain data objects — formatting is handled by XFormatter.
 *
 * Selector strategy: data-testid (primary) → ARIA roles (fallback) → structural selectors (last resort).
 */
class XExtractor {
  /**
   * Unified extraction dispatch — called by the site registry system.
   * @param {string} contentType - 'single-tweet', 'thread', or 'article'
   * @param {Document} doc - The document
   * @param {string} [url] - Current page URL
   * @returns {object|null} Structured data or null on failure
   */
  extract(contentType, doc, url) {
    switch (contentType) {
      case 'single-tweet': return this.extractSingleTweet(doc, url);
      case 'thread': return this.extractThread(doc, url);
      case 'article': return this.extractArticle(doc);
      default: return null;
    }
  }

  /**
   * Detect what type of X content is on the page.
   * @param {string} url - Current page URL
   * @param {Document} doc - The document
   * @returns {'single-tweet' | 'thread' | 'article' | 'unknown'}
   */
  detectContentType(url, doc) {
    try {
      const path = new URL(url).pathname;

      // X Articles: /i/article/... OR a /status/ page that contains an article body.
      // (X Articles often live at /{user}/status/{id} URLs — only the DOM tells us.)
      if (/^\/i\/article\//i.test(path)) return 'article';
      if (doc && doc.querySelector && doc.querySelector('[data-testid="twitterArticleReadView"]')) {
        return 'article';
      }

      // Tweet pages: /{user}/status/{id}
      if (/^\/\w+\/status\/\d+/i.test(path)) {
        const tweets = this._findTweetElements(doc);
        if (tweets.length === 0) return 'unknown';

        // Check if it's a thread (multiple tweets from same author)
        const focalTweet = this._findFocalTweet(tweets, url);
        if (focalTweet) {
          const focalAuthor = this._extractAuthor(focalTweet);
          if (focalAuthor) {
            const sameAuthorCount = tweets.filter(t => {
              const author = this._extractAuthor(t);
              return author && author.handle === focalAuthor.handle;
            }).length;
            if (sameAuthorCount > 1) return 'thread';
          }
        }

        return 'single-tweet';
      }

      return 'unknown';
    } catch {
      return 'unknown';
    }
  }

  /**
   * Extract a single tweet from a /status/ page.
   * @param {Document} doc - The document
   * @param {string} [url] - Current page URL (used to identify focal tweet)
   * @returns {TweetData|null}
   */
  extractSingleTweet(doc, url) {
    const tweets = this._findTweetElements(doc);
    if (tweets.length === 0) return null;

    const pageUrl = url || (doc.location ? doc.location.href : '');
    const focal = this._findFocalTweet(tweets, pageUrl) || tweets[0];
    return this._parseTweet(focal);
  }

  /**
   * Extract a thread (main tweet + same-author replies).
   * @param {Document} doc - The document
   * @param {string} [url] - Current page URL (used to identify focal tweet)
   * @returns {ThreadData|null}
   */
  extractThread(doc, url) {
    const tweets = this._findTweetElements(doc);
    if (tweets.length === 0) return null;

    const pageUrl = url || (doc.location ? doc.location.href : '');
    const focal = this._findFocalTweet(tweets, pageUrl) || tweets[0];
    const focalData = this._parseTweet(focal);
    if (!focalData) return null;

    // Collect all tweets from the same author
    const threadTweets = [];
    for (const tweetEl of tweets) {
      const author = this._extractAuthor(tweetEl);
      if (author && author.handle === focalData.author.handle) {
        const parsed = this._parseTweet(tweetEl);
        if (parsed) threadTweets.push(parsed);
      }
    }

    if (threadTweets.length === 0) return null;

    return {
      mainTweet: threadTweets[0],
      replies: threadTweets.slice(1)
    };
  }

  /**
   * Extract an X Article/Notes page.
   * @param {Document} doc - The document
   * @returns {ArticleData|null}
   */
  extractArticle(doc) {
    // Page container: the tweet element that holds the author/timestamp chrome. Author and
    // <time> live HERE (not inside the article read view). Fall back to the doc itself.
    const pageContainer = this._query(doc,
      'article[role="article"]',
      'article'
    ) || doc;

    // Article read view: the X Article body container. Lives inside the page container.
    // May be absent on non-X-Article pages — fallback paths below still run.
    const readView = this._query(pageContainer,
      '[data-testid="twitterArticleReadView"]',
      '[data-testid="article"]'
    );

    // Title: dedicated testid > og:title > h1 > document.title.
    // The dedicated testid carries just the article title; the fallbacks all include
    // the "Author on X: \"...\" / X" page-chrome wrapper.
    const titleEl = readView ? this._query(readView, '[data-testid="twitter-article-title"]') : null;
    const title = (titleEl && titleEl.textContent.trim()) || this._extractArticleTitle(doc);

    // Body root: the rich text view excludes engagement chrome, avatar, and footer counts —
    // all of which sit inside the broader page container. Scoping here wipes out ~all the
    // noise the previous extraction was pulling in.
    const bodyEl = readView ? this._query(readView, '[data-testid="twitterArticleRichTextView"]') : null;
    const bodyHtml = bodyEl
      ? this._sanitizeArticleBody(bodyEl)
      : this._extractArticleBody(doc, readView || (pageContainer === doc ? null : pageContainer));

    if (!bodyHtml && !title) return null;

    // Author lives in the page container, OUTSIDE the read view.
    const authorEl = this._query(pageContainer, '[data-testid="User-Name"]');
    const author = authorEl
      ? this._parseAuthorElement(authorEl)
      : this._extractAuthorFromMeta(doc);

    // Published date — first <time> on the page container.
    const timeEl = pageContainer.querySelector
      ? pageContainer.querySelector('time[datetime]')
      : doc.querySelector('time[datetime]');
    const publishedDate = timeEl ? timeEl.getAttribute('datetime') : null;

    // Cover image — the first tweetPhoto inside the read view but outside the body.
    let coverImage = null;
    if (readView && bodyEl) {
      const photos = readView.querySelectorAll('[data-testid="tweetPhoto"] img');
      for (const img of photos) {
        if (bodyEl.contains(img)) continue;
        const src = img.getAttribute('src');
        if (src) { coverImage = src; break; }
      }
    }

    // Engagement (replies, reposts, likes, views) lives on the page container,
    // outside the read view. Same shape as a tweet's engagement so the formatter
    // can render them with the matching emoji-row convention.
    const engagement = this._extractEngagement(pageContainer);

    return {
      author: author || { handle: '', displayName: '' },
      title: title || '',
      bodyHtml: bodyHtml || '',
      coverImage,
      publishedDate,
      engagement
    };
  }

  /**
   * Clone the body element and prepare it for Turndown.
   * Hangs all article-body normalization off this single chokepoint:
   *   - flatten Draft.js heading wrappers (h1-h6 inner blocks)
   *   - (later) sanitize markdown-code-block containers
   *   - (later) clean mention URLs / unwrap media link wrappers / etc.
   */
  _sanitizeArticleBody(bodyEl) {
    const clone = bodyEl.cloneNode(true);
    this._promoteInlineBold(clone);
    this._promoteInlineItalic(clone);
    this._flattenHeadings(clone);
    this._sanitizeCodeBlocks(clone);
    this._replaceVideoWithPoster(clone);
    this._unwrapMediaLinks(clone);
    this._stripVideoLabels(clone);
    this._inlineMentionWrappers(clone);
    this._cleanMentionUrls(clone);
    return clone.innerHTML;
  }

  /**
   * X article bodies use `<span style="font-weight: bold;">…</span>` for inline bold
   * instead of `<strong>` / `<b>`. Turndown only honors the semantic tags, so without
   * this step every bold passage in an article silently drops to plain text.
   * We wrap each such element's children in `<strong>` so Turndown's default rule
   * picks them up. Skip nodes already inside a heading (those get flattened to
   * plain text anyway) or inside an existing strong/b ancestor.
   */
  _promoteInlineBold(root) {
    const candidates = root.querySelectorAll('[style*="font-weight"]');
    for (const el of candidates) {
      const fw = el.style && el.style.fontWeight;
      if (!fw) continue;
      const isBold = fw === 'bold' || fw === 'bolder' || parseInt(fw, 10) >= 600;
      if (!isBold) continue;
      if (el.closest && el.closest('h1, h2, h3, h4, h5, h6, strong, b')) continue;
      if (!el.firstChild) continue;

      const doc = el.ownerDocument;
      const strong = doc.createElement('strong');
      while (el.firstChild) strong.appendChild(el.firstChild);
      el.appendChild(strong);
    }
  }

  /**
   * Mirror of _promoteInlineBold for italic. X article bodies use
   * `<span style="font-style: italic;">…</span>` instead of `<em>` / `<i>`,
   * so without promotion every italic passage drops to plain text.
   */
  _promoteInlineItalic(root) {
    const candidates = root.querySelectorAll('[style*="font-style"]');
    for (const el of candidates) {
      const fs = el.style && el.style.fontStyle;
      if (fs !== 'italic' && fs !== 'oblique') continue;
      if (el.closest && el.closest('h1, h2, h3, h4, h5, h6, em, i')) continue;
      if (!el.firstChild) continue;

      const doc = el.ownerDocument;
      const em = doc.createElement('em');
      while (el.firstChild) em.appendChild(el.firstChild);
      el.appendChild(em);
    }
  }

  /**
   * X article headings come wrapped in Draft.js scaffolding:
   *   <h2><div><span style="font-weight: bold;"><span data-text="true">Text</span></span></div></h2>
   * The block-level <div> child makes Turndown emit `##\n\nText` (an empty heading line
   * followed by a paragraph). Replacing innerHTML with the plain text content collapses
   * the wrapper so Turndown emits `## Text` on a single line.
   * X article headings don't carry inline formatting, so dropping inline structure is safe.
   */
  _flattenHeadings(root) {
    const headings = root.querySelectorAll('h1, h2, h3, h4, h5, h6');
    for (const h of headings) {
      h.textContent = h.textContent.trim();
    }
  }

  /**
   * X wraps each code block in a container with a visible language-label span and a
   * "Copy to clipboard" button as siblings of the actual <pre>. Both leak into the
   * markdown output as bare text. Strip everything inside the container down to the
   * <pre> alone — the <code class="language-X"> survives, so the GFM fence keeps its
   * language tag.
   */
  _sanitizeCodeBlocks(root) {
    const blocks = root.querySelectorAll('[data-testid="markdown-code-block"]');
    for (const block of blocks) {
      const pre = block.querySelector('pre');
      if (!pre) continue;
      while (block.firstChild) block.removeChild(block.firstChild);
      block.appendChild(pre);
    }
  }

  /**
   * Turndown has no default rule for HTML5 <video>, so embedded videos and GIFs in
   * X articles drop out of the output entirely. Replace each <video> with an <img>
   * of its poster frame so the visual at least survives. We label as "GIF" since X's
   * embedded-video pattern in articles is overwhelmingly animated GIFs / short clips
   * (the bare "GIF" label span — see _stripVideoLabels — is X's own UI signal).
   */
  _replaceVideoWithPoster(root) {
    const videos = root.querySelectorAll('video');
    for (const video of videos) {
      const poster = video.getAttribute('poster');
      if (!poster || !video.ownerDocument) continue;

      // X renders GIFs/videos as both an <img> still preview AND a <video poster=...>
      // pointing at the same URL. Without this, the poster shows up twice in the
      // markdown (once with alt="GIF" from the swap below, once with alt="" from
      // the surviving preview img).
      const container = (video.closest && video.closest('[data-testid="videoComponent"], [data-testid="videoPlayer"]')) || video.parentElement;
      if (container) {
        container.querySelectorAll('img').forEach(img => {
          if (img.getAttribute('src') === poster) img.remove();
        });
      }

      const img = video.ownerDocument.createElement('img');
      img.setAttribute('src', poster);
      img.setAttribute('alt', 'GIF');
      video.replaceWith(img);
    }
  }

  /**
   * X wraps inline tweet photos and video components in <a> links pointing at the
   * in-app media viewer (`/{user}/article/{id}/media/{mediaId}`). The link adds no value
   * for a saved markdown — it points at a UI route that only works inside x.com — and
   * Turndown emits ugly `[ ![](url) ](mediaUrl)` image-in-link markdown. Unwrap the link
   * so just the media survives.
   */
  _unwrapMediaLinks(root) {
    const links = root.querySelectorAll('a[href*="/media/"], a[href*="/photo/"], a[href*="/video/"]');
    for (const link of links) {
      const hasMedia = !!link.querySelector('[data-testid="tweetPhoto"], [data-testid="videoComponent"], [data-testid="videoPlayer"], img');
      if (!hasMedia || !link.parentNode) continue;
      while (link.firstChild) link.parentNode.insertBefore(link.firstChild, link);
      link.remove();
    }
  }

  /**
   * X renders a small badge inside its video components as a bare <span> —
   * "GIF" in English, "Vídeo" in Spanish, "動画" in Japanese, etc. With the
   * media itself rendered as an image (the poster), the badge ends up in
   * markdown as a stray text line between paragraphs. Strip these label spans.
   *
   * Locale-stable rule: a label badge is a leaf <span> (no child elements)
   * with short text content, scoped strictly to videoComponent/videoPlayer
   * containers. The video components on X don't contain user-authored text,
   * so any short-leaf-span inside them is chrome — safe to drop in any locale.
   */
  _stripVideoLabels(root) {
    const videos = root.querySelectorAll('[data-testid="videoComponent"], [data-testid="videoPlayer"]');
    for (const v of videos) {
      v.querySelectorAll('span').forEach(span => {
        if (span.children.length > 0) return;
        const text = (span.textContent || '').trim();
        if (text.length > 0 && text.length <= 10) {
          span.remove();
        }
      });
    }
  }

  /**
   * X mentions in article body are anchors wrapped in a block-level <div>:
   *   …text… <div><a href="…">@user</a></div> …more text…
   * The block <div> makes Turndown treat the mention as its own paragraph, breaking
   * the surrounding sentence across three lines. Replacing the wrapper <div> with
   * the anchor itself restores inline flow.
   * Only applies when the wrapper has no other significant children — leaves
   * legitimate block divs alone.
   */
  _inlineMentionWrappers(root) {
    const anchors = root.querySelectorAll('a');
    for (const a of anchors) {
      const parent = a.parentElement;
      if (!parent || parent.tagName !== 'DIV') continue;
      const otherChildren = Array.from(parent.children).filter(c => c !== a);
      if (otherChildren.length > 0) continue;
      // Replace the wrapper div with just the anchor (preserves position in flow).
      parent.replaceWith(a);
    }
  }

  /**
   * X mention links carry an extra `@` in their path: `/@mercury` instead of `/mercury`.
   * Browsers tolerate the duplicate; markdown readers and link checkers don't.
   * Strip just that `@` from the URL — the displayed text stays as `@mercury`.
   */
  _cleanMentionUrls(root) {
    const anchors = root.querySelectorAll('a[href]');
    for (const a of anchors) {
      const href = a.getAttribute('href');
      const match = href.match(/^(https?:\/\/[^/]+)?\/@(\w+)(\/.*)?$/);
      if (match) {
        const base = match[1] || '';
        const trailing = match[3] || '';
        a.setAttribute('href', `${base}/${match[2]}${trailing}`);
      }
    }
  }

  // ── Internal: Tweet element finders ──

  /**
   * Find all tweet elements on the page.
   */
  _findTweetElements(container) {
    return this._queryAll(container,
      '[data-testid="tweet"]',
      'article[role="article"]',
      'article'
    );
  }

  /**
   * Find the focal tweet — the one whose permalink matches the current URL.
   */
  _findFocalTweet(tweetElements, url) {
    if (!url) return tweetElements[0] || null;

    try {
      const path = new URL(url).pathname;
      for (const tweet of tweetElements) {
        const timeLink = tweet.querySelector('a[href*="/status/"] time');
        if (timeLink) {
          const linkEl = timeLink.closest('a');
          if (linkEl && linkEl.getAttribute('href') === path) {
            return tweet;
          }
        }
      }
    } catch {
      // Fall through
    }

    return tweetElements[0] || null;
  }

  // ── Internal: Data extraction from tweet elements ──

  /**
   * Parse a tweet element into a TweetData object.
   */
  _parseTweet(tweetEl) {
    if (!tweetEl) return null;

    // Detect the quoted/embedded tweet container first, then exclude it from the
    // outer tweet's field extraction. Without this, quote tweets bleed: the outer
    // text/timestamp/media silently take on the quoted tweet's values when the
    // quote's DOM nodes appear first (as `<time>` always does — the quote is
    // rendered above the focal tweet's footer timestamp).
    const quoteContainer = this._findQuoteContainer(tweetEl);

    const author = this._extractAuthor(tweetEl, quoteContainer);
    const text = this._extractText(tweetEl, quoteContainer);
    const timestamp = this._extractTimestamp(tweetEl, quoteContainer);
    const media = this._extractMedia(tweetEl, quoteContainer);
    const engagement = this._extractEngagement(tweetEl);
    const quoteTweet = quoteContainer ? this._parseQuoteContainer(quoteContainer) : null;
    const communityNote = this._extractCommunityNote(tweetEl);

    if (!author && !text) return null;

    return {
      author: author || { handle: '', displayName: '' },
      timestamp,
      text: text || '',
      media,
      quoteTweet,
      communityNote,
      engagement
    };
  }

  /**
   * Find the quoted/embedded tweet container, if any.
   *
   * X wraps quoted tweets in `<div role="link" tabindex="0">` (the whole block
   * is a tappable card linking to the quoted tweet's permalink). Other
   * `[role="link"][tabindex="0"]` elements appear in tweet chrome (small icons,
   * subscribe affordances), so we filter to ones that contain a nested
   * `[data-testid="User-Name"]` — User-Name only renders inside tweet bodies, so
   * its presence inside a role=link wrapper uniquely identifies the embedded
   * tweet. Locale-stable: role + testid, no phrase matching.
   *
   * Returns the first match. Quote-of-quote chains aren't rendered by X
   * (only the immediate quote is shown), so first-match is correct.
   */
  _findQuoteContainer(tweetEl) {
    const candidates = tweetEl.querySelectorAll('[role="link"][tabindex="0"]');
    for (const c of candidates) {
      if (c.querySelector('[data-testid="User-Name"]')) return c;
    }
    return null;
  }

  /**
   * Parse the quote-tweet container into a TweetData-shaped object.
   * Mirrors `_parseTweet` but skips quote-of-quote detection (X doesn't
   * render nested quotes) and zero-fills engagement (the quoted card has
   * no engagement chrome).
   */
  _parseQuoteContainer(container) {
    if (!container) return null;

    const author = this._extractAuthor(container);
    const text = this._extractText(container);
    const timestamp = this._extractTimestamp(container);
    const media = this._extractMedia(container);

    if (!author && !text) return null;

    return {
      author: author || { handle: '', displayName: '' },
      timestamp,
      text: text || '',
      media,
      quoteTweet: null,
      engagement: { replies: 0, retweets: 0, likes: 0, bookmarks: 0, views: 0 }
    };
  }

  /**
   * Extract author info from a tweet element.
   * @param {Element} tweetEl
   * @param {Element} [excludeSubtree] - Optional subtree to skip (e.g., the
   *   quoted-tweet container, so the outer tweet doesn't pick up the quoted
   *   author when the outer's User-Name is missing).
   * @returns {{ handle: string, displayName: string } | null}
   */
  _extractAuthor(tweetEl, excludeSubtree) {
    const userNames = tweetEl.querySelectorAll('[data-testid="User-Name"]');
    for (const el of userNames) {
      if (excludeSubtree && excludeSubtree.contains(el)) continue;
      return this._parseAuthorElement(el);
    }

    // Fallback: look for link to user profile (skipping anything inside the
    // excluded subtree).
    const profileLinks = tweetEl.querySelectorAll('a[href^="/"]');
    for (const link of profileLinks) {
      if (excludeSubtree && excludeSubtree.contains(link)) continue;
      const href = link.getAttribute('href');
      if (href && /^\/\w+$/.test(href) && !href.includes('/status/')) {
        const handle = href.slice(1);
        const displayName = link.textContent.trim() || handle;
        return { handle, displayName };
      }
    }

    return null;
  }

  /**
   * Parse a User-Name container element into author data.
   */
  _parseAuthorElement(authorEl) {
    const text = authorEl.textContent || '';

    // Handle pattern: spans contain display name and @handle
    const handleMatch = text.match(/@(\w+)/);
    const handle = handleMatch ? handleMatch[1] : '';

    // Display name is usually the text before the @handle. Use the
    // emoji-aware walker so display names with twemoji (e.g. "Foo 🦄") survive.
    let displayName = '';
    const spans = authorEl.querySelectorAll('span');
    for (const span of spans) {
      const spanText = this._textWithEmoji(span).trim();
      if (spanText && !spanText.startsWith('@') && !spanText.includes('·')) {
        displayName = spanText;
        break;
      }
    }

    if (!displayName && handle) {
      displayName = handle;
    }

    // Verified badge: blue/gold/grey all share data-testid="icon-verified".
    // Distinguishing tier is a future polish; for now a single boolean is enough.
    const verified = !!authorEl.querySelector('[data-testid="icon-verified"]');

    return handle || displayName ? { handle, displayName, verified } : null;
  }

  /**
   * Extract tweet text content. Twemoji renders as <img alt="🔥"> inside the
   * text node; plain textContent skips those, dropping every emoji from the
   * post. Mentions/hashtags/URLs render as <a> tags; plain textContent
   * loses the link target. The walker preserves both.
   *
   * @param {Element} tweetEl
   * @param {Element} [excludeSubtree] - Skip any tweetText nodes inside this
   *   subtree (used to avoid pulling the quoted tweet's text into the outer
   *   tweet when the outer has no comment).
   */
  _extractText(tweetEl, excludeSubtree) {
    const candidates = tweetEl.querySelectorAll('[data-testid="tweetText"], div[lang]');
    let textEl = null;
    for (const el of candidates) {
      if (excludeSubtree && excludeSubtree.contains(el)) continue;
      textEl = el;
      break;
    }
    if (!textEl) return '';
    return this._textWithEmoji(textEl, { withLinks: true }).trim();
  }

  /**
   * Walk a node's descendants, returning textContent but with twemoji <img>
   * tags substituted for their `alt` (the actual emoji char). When
   * `withLinks: true`, also converts <a> elements to markdown links via
   * `_formatTweetLink` (mention/hashtag/URL handling).
   *
   * Twemoji src always sits under abs.twimg.com/emoji/v2/svg/. Also accepts
   * any <img> with a 1–2 char alt as a safety net for variant CDN paths.
   */
  _textWithEmoji(root, options = {}) {
    const withLinks = !!(options && options.withLinks);
    if (!root) return '';
    let out = '';
    const walk = (node) => {
      if (node.nodeType === 3) { // TEXT_NODE
        out += node.nodeValue || '';
        return;
      }
      if (node.nodeType !== 1) return; // not an element
      if (node.tagName === 'IMG') {
        const alt = node.getAttribute('alt') || '';
        const src = node.getAttribute('src') || '';
        if (alt && (src.includes('/emoji/') || alt.length <= 2)) {
          out += alt;
        }
        return;
      }
      if (node.tagName === 'A' && withLinks) {
        out += this._formatTweetLink(node);
        return; // don't recurse — link content is rendered as the link label
      }
      for (const child of node.childNodes) walk(child);
    };
    walk(root);
    return out;
  }

  /**
   * Convert an <a> element inside a tweet body to a markdown link.
   *
   * Three link kinds, three policies:
   * 1. Relative href (`/user`, `/hashtag/Foo`) — mention or hashtag — promoted
   *    to absolute https://x.com URL. Strips a leading `@` from the path so
   *    profile URLs are clean (X serves both /@user and /user; the latter is
   *    canonical).
   * 2. t.co masker href — display text is the real destination URL (X masks
   *    every posted URL through t.co for analytics). Use the display text as
   *    the link target. If the display is truncated (ends with … or three
   *    dots), the real URL is unrecoverable — fall back to the t.co href so
   *    the link at least round-trips through X's redirect.
   * 3. Other absolute URL — pass through href unchanged.
   *
   * Returns the inner text unwrapped if href is missing, so we don't emit
   * broken markdown like `[text]()`.
   */
  _formatTweetLink(anchor) {
    const text = this._textWithEmoji(anchor, { withLinks: false });
    const href = anchor.getAttribute('href') || '';
    if (!href || !text.trim()) return text;

    if (href.startsWith('/')) {
      const cleanPath = href.replace(/^\/@/, '/');
      return `[${text}](https://x.com${cleanPath})`;
    }

    if (/^https?:\/\/t\.co\//i.test(href)) {
      const trimmed = text.trim();
      const truncated = trimmed.includes('…') || /\.{3}$/.test(trimmed);
      if (truncated) {
        return `[${text}](${href})`;
      }
      const realUrl = /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
      return `[${text}](${realUrl})`;
    }

    return `[${text}](${href})`;
  }

  /**
   * Extract timestamp as ISO string.
   *
   * @param {Element} tweetEl
   * @param {Element} [excludeSubtree] - Skip times inside this subtree. Critical
   *   for quote tweets: the quoted tweet's `<time>` appears BEFORE the outer
   *   focal tweet's footer `<time>` in DOM order, so without exclusion the outer
   *   tweet silently inherits the quoted tweet's timestamp.
   */
  _extractTimestamp(tweetEl, excludeSubtree) {
    const times = tweetEl.querySelectorAll('time[datetime]');
    for (const t of times) {
      if (excludeSubtree && excludeSubtree.contains(t)) continue;
      return t.getAttribute('datetime');
    }
    return null;
  }

  /**
   * Extract media items (images, videos).
   *
   * @param {Element} tweetEl
   * @param {Element} [excludeSubtree] - Skip media inside this subtree (the
   *   quoted tweet, whose own media gets attached to its TweetData object so
   *   the outer tweet shouldn't double-list it).
   * @returns {Array<{ type: 'image' | 'video', url: string }>}
   */
  _extractMedia(tweetEl, excludeSubtree) {
    const media = [];
    const isExcluded = (el) => excludeSubtree && excludeSubtree.contains(el);

    // Images
    const photoContainers = tweetEl.querySelectorAll('[data-testid="tweetPhoto"]');
    for (const container of photoContainers) {
      if (isExcluded(container)) continue;
      const img = container.querySelector('img');
      if (img) {
        const url = img.getAttribute('src') || '';
        if (url) media.push({ type: 'image', url });
      }
    }

    // Fallback: if no data-testid photos, look for images in media containers
    if (media.length === 0) {
      const imgs = tweetEl.querySelectorAll('img[src*="pbs.twimg.com"]');
      for (const img of imgs) {
        if (isExcluded(img)) continue;
        const url = img.getAttribute('src') || '';
        // Skip profile pictures (small, in avatar containers)
        if (url && !url.includes('profile_images')) {
          media.push({ type: 'image', url });
        }
      }
    }

    // Videos
    const videoEls = tweetEl.querySelectorAll('video');
    for (const video of videoEls) {
      if (isExcluded(video)) continue;
      const url = video.getAttribute('src') || video.getAttribute('poster') || '';
      if (url) media.push({ type: 'video', url });
    }

    return media;
  }

  /**
   * Extract engagement stats. Two-tier strategy, designed to be locale-stable
   * for non-English X viewers (whose aria-labels say "3 respuestas" / "6 republicaciones"
   * / etc.).
   *
   * Tier 1 — testid-based per-button scan: each metric maps to a stable
   * data-testid (reply, retweet|unretweet, like|unlike, bookmark|removeBookmark).
   * Test-ids never localize; we just need the leading numeric count from the
   * button's aria-label.
   *
   * Tier 2 — focal-tweet summary div: a single non-interactive `<div aria-label>`
   * on the focal tweet of /status/ pages lists every metric in display order.
   * The metric *words* are localized but the *order* (replies → reposts → likes
   * → bookmarks → views) is stable, so we read by position. This is the only
   * source for `views` (no individual button carries it) and fills in any
   * metrics that Tier 1 missed.
   *
   * @returns {{ replies: number, retweets: number, likes: number, bookmarks: number, views: number }}
   */
  _extractEngagement(tweetEl) {
    const engagement = { replies: 0, retweets: 0, likes: 0, bookmarks: 0, views: 0 };

    // Tier 1: testid-based per-button extraction. Locale-stable.
    const buttonMap = [
      { key: 'replies', testids: ['reply'] },
      { key: 'retweets', testids: ['retweet', 'unretweet'] },
      { key: 'likes', testids: ['like', 'unlike'] },
      { key: 'bookmarks', testids: ['bookmark', 'removeBookmark'] }
    ];
    for (const { key, testids } of buttonMap) {
      for (const tid of testids) {
        const el = tweetEl.querySelector(`[data-testid="${tid}"]`);
        if (!el) continue;
        // Prefer the aria-label (exact count) over button text (may be abbreviated as "1.2K").
        const ariaLabel = el.getAttribute('aria-label') || '';
        const count = this._parseCount(ariaLabel) || this._parseCount(el.textContent || '');
        if (count > 0) {
          engagement[key] = count;
          break;
        }
      }
    }

    // Tier 2: focal-tweet summary, read by position.
    // Metric order is stable across locales: replies, reposts, likes, bookmarks, views.
    const summary = this._findEngagementSummary(tweetEl);
    if (summary) {
      const numbers = this._extractOrderedNumbers(summary);
      const keys = ['replies', 'retweets', 'likes', 'bookmarks', 'views'];
      for (let i = 0; i < keys.length && i < numbers.length; i++) {
        // Don't overwrite a Tier-1 testid value — testids are the more reliable
        // signal. But fill in any zero (especially `views`, which has no testid).
        if (engagement[keys[i]] === 0) {
          engagement[keys[i]] = numbers[i];
        }
      }
    }

    return engagement;
  }

  /**
   * Find the focal-tweet engagement summary div by shape only. The summary is
   * a `<div>` (not a button/link) whose aria-label contains 3+ numeric runs —
   * the multi-metric list. Per-button labels have a single numeric prefix and
   * are skipped. Locale-stable: we never look at the metric words themselves.
   */
  _findEngagementSummary(tweetEl) {
    const candidates = tweetEl.querySelectorAll('div[aria-label]');
    for (const el of candidates) {
      const label = el.getAttribute('aria-label') || '';
      const numbers = this._extractOrderedNumbers(label);
      if (numbers.length >= 3) return label;
    }
    return null;
  }

  /**
   * Parse the first numeric value from a string. Locale-stable: handles `,`,
   * `.`, and whitespace as thousand separators (US: `1,234`, ES: `1.234`,
   * FR: `1 234`). Stops at the first non-digit/non-separator. Returns 0 when
   * no numeric value is present.
   */
  _parseCount(s) {
    if (!s) return 0;
    const match = String(s).match(/\d[\d.,\s ]*/);
    if (!match) return 0;
    const digits = match[0].replace(/[^\d]/g, '');
    return digits ? parseInt(digits, 10) : 0;
  }

  /**
   * Extract every numeric value from a string in left-to-right order.
   * Used to read metric counts from the localized summary aria-label by
   * position rather than phrase.
   */
  _extractOrderedNumbers(s) {
    if (!s) return [];
    const out = [];
    const re = /\d[\d.,\s ]*\d|\d/g;
    let match;
    while ((match = re.exec(s)) !== null) {
      const digits = match[0].replace(/[^\d]/g, '');
      if (digits) out.push(parseInt(digits, 10));
    }
    return out;
  }

  /**
   * Extract a Community Note (birdwatch-pivot block) attached to the tweet.
   *
   * X structure: a `[data-testid="birdwatch-pivot"]` div lives inside the
   * focal tweet, with this child layout:
   *   [first] header div  — heading icon + heading text
   *   [...]    spacers/body — note body (text + t.co source links)
   *   [last]   footer div  — "rate it" UI (contains a tappable role=link)
   *
   * Strategy is structural, not phrase-based, so it works in any X locale:
   *   • Skip the FIRST non-empty child as the header.
   *   • Skip the LAST non-empty child if it contains a tappable
   *     (`[role="link"]` or `<button>`) — that's the "Rate it" UI, which is
   *     interactive in every locale.
   *   • Everything in between is the body. Run through the link-aware walker
   *     so t.co URLs get unmasked the same way as tweet bodies.
   *
   * @returns {string|null} The note body, or null if no note is present.
   */
  _extractCommunityNote(tweetEl) {
    const noteEl = tweetEl.querySelector('[data-testid="birdwatch-pivot"]');
    if (!noteEl) return null;

    const nonEmpty = Array.from(noteEl.children).filter(c =>
      (c.textContent || '').trim().length > 0
    );
    if (nonEmpty.length === 0) return null;

    // Last child is footer when it has interactive descendants ("Rate it" UI).
    const last = nonEmpty[nonEmpty.length - 1];
    const lastIsFooter = !!last.querySelector('[role="link"], button');

    const bodyChildren = nonEmpty.slice(
      1,
      lastIsFooter ? nonEmpty.length - 1 : nonEmpty.length
    );

    const parts = [];
    for (const child of bodyChildren) {
      const rendered = this._textWithEmoji(child, { withLinks: true }).trim();
      if (rendered) parts.push(rendered);
    }

    const body = parts.join(' ').trim();
    return body || null;
  }

  // ── Internal: Article extraction helpers ──

  _extractArticleTitle(doc) {
    // Try og:title meta, then page title, then first h1
    const ogTitle = doc.querySelector('meta[property="og:title"]');
    if (ogTitle) return ogTitle.getAttribute('content') || '';

    const h1 = doc.querySelector('h1');
    if (h1) return h1.textContent.trim();

    return doc.title || '';
  }

  _extractArticleBody(doc, articleEl) {
    if (articleEl) {
      // Clone to avoid mutating the DOM
      const clone = articleEl.cloneNode(true);
      // Remove nav, header elements from clone
      clone.querySelectorAll('nav, header, [data-testid="User-Name"]').forEach(el => el.remove());
      return clone.innerHTML;
    }

    // Fallback: look for main content area
    const main = doc.querySelector('main') || doc.querySelector('[role="main"]');
    if (main) return main.innerHTML;

    return null;
  }

  _extractAuthorFromMeta(doc) {
    // Try to get author from meta tags
    const authorMeta = doc.querySelector('meta[name="author"]') ||
                       doc.querySelector('meta[property="article:author"]');
    if (authorMeta) {
      const name = authorMeta.getAttribute('content') || '';
      return { handle: '', displayName: name };
    }
    return null;
  }

  // ── Internal: Selector helpers ──

  /**
   * Try selectors in order, return first match.
   */
  _query(container, ...selectors) {
    for (const selector of selectors) {
      try {
        const result = container.querySelector(selector);
        if (result) return result;
      } catch {
        // Invalid selector, try next
      }
    }
    return null;
  }

  /**
   * Try selectors in order, return array from first that yields results.
   */
  _queryAll(container, ...selectors) {
    for (const selector of selectors) {
      try {
        const results = container.querySelectorAll(selector);
        if (results.length > 0) return Array.from(results);
      } catch {
        // Invalid selector, try next
      }
    }
    return [];
  }
}

module.exports = XExtractor;
