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

      // X Articles: /i/article/...
      if (/^\/i\/article\//i.test(path)) {
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
    // X Articles use article-specific DOM structure
    const articleEl = this._query(doc,
      '[data-testid="article"]',
      'article[role="article"]',
      'article'
    );

    // Try to get title
    const title = this._extractArticleTitle(doc);
    // Try to get body HTML
    const bodyHtml = this._extractArticleBody(doc, articleEl);
    if (!bodyHtml && !title) return null;

    // Author from the article or page context
    const authorEl = articleEl
      ? this._query(articleEl, '[data-testid="User-Name"]')
      : null;
    const author = authorEl
      ? this._parseAuthorElement(authorEl)
      : this._extractAuthorFromMeta(doc);

    // Published date
    const timeEl = articleEl
      ? articleEl.querySelector('time[datetime]')
      : doc.querySelector('time[datetime]');
    const publishedDate = timeEl ? timeEl.getAttribute('datetime') : null;

    return {
      author: author || { handle: '', displayName: '' },
      title: title || '',
      bodyHtml: bodyHtml || '',
      publishedDate
    };
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
