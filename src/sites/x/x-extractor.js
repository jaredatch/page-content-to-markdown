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

    return {
      author: author || { handle: '', displayName: '' },
      title: title || '',
      bodyHtml: bodyHtml || '',
      coverImage,
      publishedDate
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
   * X renders a small "GIF" / "Video" badge inside its video components as a bare
   * <span>. With the media itself rendered as an image (the poster), the badge ends
   * up in markdown as a stray text line ("GIF") between paragraphs. Strip these
   * label spans — the markdown reader can see the media URL and infer.
   */
  _stripVideoLabels(root) {
    const videos = root.querySelectorAll('[data-testid="videoComponent"], [data-testid="videoPlayer"]');
    for (const v of videos) {
      v.querySelectorAll('span').forEach(span => {
        const text = (span.textContent || '').trim();
        if ((text === 'GIF' || text === 'Video') && span.children.length === 0) {
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

    const author = this._extractAuthor(tweetEl);
    const text = this._extractText(tweetEl);
    const timestamp = this._extractTimestamp(tweetEl);
    const media = this._extractMedia(tweetEl);
    const engagement = this._extractEngagement(tweetEl);
    const quoteTweet = this._extractQuoteTweet(tweetEl);

    if (!author && !text) return null;

    return {
      author: author || { handle: '', displayName: '' },
      timestamp,
      text: text || '',
      media,
      quoteTweet,
      engagement
    };
  }

  /**
   * Extract author info from a tweet element.
   * @returns {{ handle: string, displayName: string } | null}
   */
  _extractAuthor(tweetEl) {
    const authorEl = this._query(tweetEl, '[data-testid="User-Name"]');
    if (authorEl) {
      return this._parseAuthorElement(authorEl);
    }

    // Fallback: look for link to user profile
    const profileLinks = tweetEl.querySelectorAll('a[href^="/"]');
    for (const link of profileLinks) {
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

    // Display name is usually the text before the @handle
    let displayName = '';
    const spans = authorEl.querySelectorAll('span');
    for (const span of spans) {
      const spanText = span.textContent.trim();
      if (spanText && !spanText.startsWith('@') && !spanText.includes('·')) {
        displayName = spanText;
        break;
      }
    }

    if (!displayName && handle) {
      displayName = handle;
    }

    return handle || displayName ? { handle, displayName } : null;
  }

  /**
   * Extract tweet text content.
   */
  _extractText(tweetEl) {
    const textEl = this._query(tweetEl,
      '[data-testid="tweetText"]',
      'div[lang]'
    );
    if (!textEl) return '';
    return textEl.textContent.trim();
  }

  /**
   * Extract timestamp as ISO string.
   */
  _extractTimestamp(tweetEl) {
    const timeEl = tweetEl.querySelector('time[datetime]');
    return timeEl ? timeEl.getAttribute('datetime') : null;
  }

  /**
   * Extract media items (images, videos).
   * @returns {Array<{ type: 'image' | 'video', url: string }>}
   */
  _extractMedia(tweetEl) {
    const media = [];

    // Images
    const photoContainers = tweetEl.querySelectorAll('[data-testid="tweetPhoto"]');
    for (const container of photoContainers) {
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
      const url = video.getAttribute('src') || video.getAttribute('poster') || '';
      if (url) media.push({ type: 'video', url });
    }

    return media;
  }

  /**
   * Extract engagement stats from aria-labels on buttons.
   * @returns {{ likes: number, retweets: number, replies: number, views: number }}
   */
  _extractEngagement(tweetEl) {
    const engagement = { likes: 0, retweets: 0, replies: 0, views: 0 };

    // Strategy: find buttons/links with aria-labels containing counts
    const interactives = tweetEl.querySelectorAll('[aria-label]');
    for (const el of interactives) {
      const label = (el.getAttribute('aria-label') || '').toLowerCase();
      const countMatch = label.match(/^(\d[\d,]*)/);
      if (!countMatch) continue;
      const count = parseInt(countMatch[1].replace(/,/g, ''), 10);
      if (isNaN(count)) continue;

      if (label.includes('like')) {
        engagement.likes = count;
      } else if (label.includes('repost') || label.includes('retweet')) {
        engagement.retweets = count;
      } else if (label.includes('repl') || label.includes('comment')) {
        engagement.replies = count;
      } else if (label.includes('view')) {
        engagement.views = count;
      }
    }

    return engagement;
  }

  /**
   * Extract a quote tweet if present.
   * @returns {TweetData|null}
   */
  _extractQuoteTweet(tweetEl) {
    // Quote tweets are nested — look for an inner tweet-like structure
    // that is NOT the main tweet itself
    const quoteContainer = this._query(tweetEl,
      '[data-testid="quoteTweet"]',
      '[role="link"][tabindex="0"]'
    );
    if (!quoteContainer) return null;

    // Extract quote tweet data from the container
    const author = this._extractAuthor(quoteContainer);
    const text = this._extractText(quoteContainer);
    const timestamp = this._extractTimestamp(quoteContainer);
    const media = this._extractMedia(quoteContainer);

    if (!author && !text) return null;

    return {
      author: author || { handle: '', displayName: '' },
      timestamp,
      text: text || '',
      media,
      quoteTweet: null, // No recursive nesting
      engagement: { likes: 0, retweets: 0, replies: 0, views: 0 }
    };
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
