'use strict';

/**
 * Formats structured X/Twitter data into markdown.
 * Takes data objects from XExtractor, produces markdown strings.
 */
class XFormatter {
  /**
   * Unified format dispatch — called by the site registry system.
   * @param {string} contentType - 'single-tweet', 'thread', or 'article'
   * @param {object} data - Structured data from XExtractor
   * @param {object} [converter] - Optional MarkdownConverter instance
   * @returns {string} Markdown string
   */
  format(contentType, data, converter) {
    switch (contentType) {
      case 'single-tweet': return this.formatTweet(data);
      case 'thread': return this.formatThread(data);
      case 'article': return this.formatArticle(data, converter);
      default: return '';
    }
  }

  /**
   * Format a single tweet as markdown.
   * @param {TweetData} tweet
   * @returns {string}
   */
  formatTweet(tweet) {
    const parts = [];

    // Author heading
    const authorLine = this._formatAuthorHeading(tweet.author);
    if (authorLine) parts.push(authorLine);

    // Timestamp
    if (tweet.timestamp) {
      parts.push(`*Posted: ${this._formatDate(tweet.timestamp)}*`);
    }

    // Blank line before content
    parts.push('');

    // Tweet text
    if (tweet.text) {
      parts.push(tweet.text);
    }

    // Media
    for (const item of tweet.media || []) {
      parts.push('');
      if (item.type === 'video') {
        parts.push(`[Video](${item.url})`);
      } else {
        parts.push(`![Image](${item.url})`);
      }
    }

    // Quote tweet
    if (tweet.quoteTweet) {
      parts.push('');
      parts.push(this.formatQuoteTweet(tweet.quoteTweet));
    }

    // Engagement
    const engagementLine = this._formatEngagement(tweet.engagement);
    if (engagementLine) {
      parts.push('');
      parts.push(engagementLine);
    }

    parts.push('');
    parts.push('---');

    return parts.join('\n');
  }

  /**
   * Format a thread (main tweet + replies).
   * @param {ThreadData} thread
   * @returns {string}
   */
  formatThread(thread) {
    const parts = [this.formatTweet(thread.mainTweet)];

    for (const reply of thread.replies || []) {
      parts.push('');
      parts.push(this.formatTweet(reply));
    }

    return parts.join('\n');
  }

  /**
   * Format an X Article.
   * @param {ArticleData} article
   * @param {object} [converter] - Optional MarkdownConverter instance for HTML body conversion
   * @returns {string}
   */
  formatArticle(article, converter) {
    const parts = [];

    // Title
    if (article.title) {
      parts.push(`# ${article.title}`);
      parts.push('');
    }

    // Author
    const authorLine = this._formatAuthorHeading(article.author);
    if (authorLine) parts.push(authorLine);

    // Published date
    if (article.publishedDate) {
      parts.push(`*Published: ${this._formatDate(article.publishedDate)}*`);
    }

    parts.push('');
    parts.push('---');
    parts.push('');

    // Cover image (article header image — separate from inline body media)
    if (article.coverImage) {
      parts.push(`![Cover](${article.coverImage})`);
      parts.push('');
    }

    // Body
    if (article.bodyHtml) {
      if (converter && typeof converter.convertHtmlFragment === 'function') {
        const bodyMd = converter.convertHtmlFragment(article.bodyHtml);
        parts.push(bodyMd);
      } else {
        // Simple fallback: strip tags
        const text = article.bodyHtml.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
        parts.push(text);
      }
    }

    return parts.join('\n');
  }

  /**
   * Format a quote tweet as a blockquote.
   * @param {TweetData} tweet
   * @returns {string}
   */
  formatQuoteTweet(tweet) {
    const lines = [];

    const author = tweet.author;
    if (author && (author.handle || author.displayName)) {
      const handle = author.handle ? `@${author.handle}` : '';
      const name = author.displayName || '';
      if (handle && name) {
        lines.push(`**${handle}** (${name})`);
      } else {
        lines.push(`**${handle || name}**`);
      }
    }

    if (tweet.timestamp) {
      lines.push(`*${this._formatDate(tweet.timestamp)}*`);
    }

    lines.push('');

    if (tweet.text) {
      lines.push(tweet.text);
    }

    for (const item of tweet.media || []) {
      lines.push('');
      if (item.type === 'video') {
        lines.push(`[Video](${item.url})`);
      } else {
        lines.push(`![Image](${item.url})`);
      }
    }

    // Prefix all lines with >
    return lines.map(line => line ? `> ${line}` : '>').join('\n');
  }

  // ── Internal formatting helpers ──

  _formatAuthorHeading(author) {
    if (!author) return '';
    const handle = author.handle ? `@${author.handle}` : '';
    const name = author.displayName || '';

    if (handle && name) {
      return `## ${handle} (${name})`;
    } else if (handle || name) {
      return `## ${handle || name}`;
    }
    return '';
  }

  /**
   * Format an ISO date string to human-readable format.
   * @param {string} isoString
   * @returns {string}
   */
  _formatDate(isoString) {
    try {
      const date = new Date(isoString);
      if (isNaN(date.getTime())) return isoString;

      const months = [
        'January', 'February', 'March', 'April', 'May', 'June',
        'July', 'August', 'September', 'October', 'November', 'December'
      ];

      const month = months[date.getUTCMonth()];
      const day = date.getUTCDate();
      const year = date.getUTCFullYear();

      let hours = date.getUTCHours();
      const minutes = date.getUTCMinutes().toString().padStart(2, '0');
      const ampm = hours >= 12 ? 'PM' : 'AM';
      hours = hours % 12 || 12;

      return `${month} ${day}, ${year} at ${hours}:${minutes} ${ampm}`;
    } catch {
      return isoString;
    }
  }

  /**
   * Format engagement stats line.
   * @returns {string} Empty string if all counts are 0
   */
  _formatEngagement(engagement) {
    if (!engagement) return '';

    const parts = [];
    if (engagement.likes > 0) parts.push(`\u2764\ufe0f ${this._formatNumber(engagement.likes)}`);
    if (engagement.retweets > 0) parts.push(`\ud83d\udd01 ${this._formatNumber(engagement.retweets)}`);
    if (engagement.replies > 0) parts.push(`\ud83d\udcac ${this._formatNumber(engagement.replies)}`);
    if (engagement.views > 0) parts.push(`\ud83d\udc41 ${this._formatNumber(engagement.views)}`);

    return parts.join('  ');
  }

  /**
   * Format a number with K/M suffix for readability.
   */
  _formatNumber(n) {
    if (n >= 1000000) {
      const val = n / 1000000;
      return val % 1 === 0 ? `${val}M` : `${val.toFixed(1)}M`;
    }
    if (n >= 1000) {
      const val = n / 1000;
      return val % 1 === 0 ? `${val}K` : `${val.toFixed(1)}K`;
    }
    return String(n);
  }
}

module.exports = XFormatter;
