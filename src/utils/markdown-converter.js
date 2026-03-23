const TurndownImport = require('turndown');
const TurndownService = TurndownImport.default || TurndownImport;

class MarkdownConverter {
  constructor() {
    this.turndownService = new TurndownService({
      headingStyle: 'atx',
      codeBlockStyle: 'fenced',
      fence: '```',
      emDelimiter: '*',
      strongDelimiter: '**',
      bulletListMarker: '-',
      linkStyle: 'inlined',
      linkReferenceStyle: 'full'
    });

    // Configure rules for clean conversion
    this.setupCustomRules();
  }

  /**
   * Apply user formatting preferences to both Turndown services.
   * Accepts an object with optional keys: headingStyle, bulletListMarker,
   * codeBlockStyle, linkStyle — matching Turndown option names.
   */
  applyFormattingOptions(options) {
    if (!options) return;

    const mapping = {
      headingStyle: 'headingStyle',
      bulletListMarker: 'bulletListMarker',
      codeBlockStyle: 'codeBlockStyle',
      linkStyle: 'linkStyle'
    };

    for (const [key, turndownKey] of Object.entries(mapping)) {
      if (options[key] !== undefined) {
        this.turndownService.options[turndownKey] = options[key];
        if (this._fragmentService) {
          this._fragmentService.options[turndownKey] = options[key];
        }
      }
    }
  }

  setupCustomRules() {
    // Remove script and style elements
    this.turndownService.remove(['script', 'style', 'iframe', 'object', 'embed', 'noscript']);
    
    // Remove navigation, ads, and other non-content elements.
    // Short patterns that could cause false positives (e.g. "ad" in "header")
    // use word-boundary regex. Longer patterns use a single combined regex
    // instead of iterating an array with .includes() for each node.
    const nonContentWordRegex = /(?:^|[\s_-])(?:ad|nav|menu|aside|header|footer|like|vote|rating)(?:[\s_-]|$)/i;
    const nonContentSubstringRegex = /navigation|sidebar|advertisement|banner|social|share|comment|related|recommended|popup|modal|overlay|cookie|gdpr|subscription|newsletter|signup|buy-now|purchase|cart|checkout|engagement|breadcrumb|pagination/i;
    const nonContentTags = new Set(['nav', 'aside', 'header', 'footer']);

    this.turndownService.addRule('removeNonContent', {
      filter: (node) => {
        const tagName = node.tagName?.toLowerCase();
        if (nonContentTags.has(tagName)) return true;

        const className = (node.className || '').toLowerCase();
        const id = (node.id || '').toLowerCase();
        const text = className + ' ' + id;

        return nonContentWordRegex.test(text) || nonContentSubstringRegex.test(text);
      },
      replacement: () => ''
    });

    // Clean up excessive line breaks
    this.turndownService.addRule('cleanLineBreaks', {
      filter: 'br',
      replacement: () => '\n'
    });

    // Handle images — resolve lazy-loaded src and keep images without alt text
    this.turndownService.addRule('betterImages', {
      filter: 'img',
      replacement: (content, node) => {
        const alt = node.getAttribute('alt') || '';
        const src = this._resolveImageSrc(node);
        if (!src) return '';
        return `![${alt}](${src})`;
      }
    });

    // Handle social media specific elements
    this.turndownService.addRule('socialElements', {
      filter: (node) => {
        const className = node.className || '';
        const socialPatterns = ['tweet', 'post', 'status', 'update'];
        return socialPatterns.some(pattern => className.toLowerCase().includes(pattern));
      },
      replacement: (content) => content
    });
  }

  /**
   * Convert an HTML fragment directly to markdown — no content extraction heuristics.
   * The user already chose what they want, so we only strip universally junk elements
   * (ads, popups, consent banners, e-commerce CTAs) and leave everything else intact.
   */
  convertHtmlFragment(html) {
    if (!html || typeof html !== 'string') {
      return '';
    }

    try {
      if (!this._fragmentService) {
        this._fragmentService = new TurndownService({
          headingStyle: 'atx',
          codeBlockStyle: 'fenced',
          fence: '```',
          emDelimiter: '*',
          strongDelimiter: '**',
          bulletListMarker: '-',
          linkStyle: 'inlined',
          linkReferenceStyle: 'full'
        });
        // Strip truly unwanted elements
        this._fragmentService.remove(['script', 'style', 'iframe', 'noscript']);

        // Remove universally junk elements (ads, popups, consent banners, etc.)
        // but NOT content-level filtering (nav, header, social, comments, etc.)
        // since the user explicitly selected what they want.
        // Uses word-boundary regex to avoid false positives (e.g. "ad" in "header").
        const junkPatterns = [
          'advertisement',
          'popup', 'modal', 'overlay',
          'cookie', 'gdpr',
          'subscription', 'newsletter', 'signup',
          'buy-now', 'purchase', 'cart', 'checkout'
        ];
        // Short patterns that need word-boundary matching to avoid false positives
        const junkRegexes = [
          /(?:^|[\s_-])ad(?:[\s_-]|$)/,  // "ad" as a whole word/segment
          ...junkPatterns.map(p => new RegExp(p.replace(/-/g, '\\-'), 'i'))
        ];
        this._fragmentService.addRule('removeJunk', {
          filter: (node) => {
            const className = (node.className || '').toLowerCase();
            const id = (node.id || '').toLowerCase();
            const text = className + ' ' + id;
            return junkRegexes.some(re => re.test(text));
          },
          replacement: () => ''
        });

        // Handle lazy-loaded images (same rule as the full-page service)
        this._fragmentService.addRule('betterImages', {
          filter: 'img',
          replacement: (content, node) => {
            const alt = node.getAttribute('alt') || '';
            const src = this._resolveImageSrc(node);
            if (!src) return '';
            return `![${alt}](${src})`;
          }
        });

        // Clean up line breaks
        this._fragmentService.addRule('cleanLineBreaks', {
          filter: 'br',
          replacement: () => '\n'
        });
      }

      let markdown = this._fragmentService.turndown(html);
      markdown = this.cleanupMarkdown(markdown);
      return markdown;
    } catch (error) {
      console.error('🚨 [markdown-converter] Error converting HTML fragment:', error);
      return '';
    }
  }

  /**
   * Convert a live DOM element to markdown — browser-only fast path.
   * Skips the serialize→reparse round-trip by querying the live DOM directly
   * and passing DOM nodes to Turndown (which accepts Element/Document nodes).
   */
  convertFromDOM(rootElement) {
    if (!rootElement || typeof rootElement.querySelector !== 'function') {
      return '';
    }

    try {
      // Find the main content element directly in the live DOM
      const contentElement = this.extractMainContentFromDOM(rootElement);

      // Pass DOM node directly to Turndown (it clones internally)
      let markdown = this.turndownService.turndown(contentElement);

      markdown = this.cleanupMarkdown(markdown);
      return markdown;
    } catch (error) {
      console.error('🚨 [markdown-converter] Error in convertFromDOM:', error);
      return '';
    }
  }

  /**
   * Extract main content from a live DOM tree — returns a DOM Element (not HTML string).
   * Reuses the same selector strategy as extractMainContent but avoids serialization.
   */
  extractMainContentFromDOM(rootElement) {
    for (const selector of this._contentSelectors()) {
      const element = rootElement.querySelector(selector);
      if (element && this.hasSignificantContent(element)) {
        console.log(`🎯 [markdown-converter] Found main content using selector: ${selector}`);
        return element;
      }
    }

    // Fallback: largest text block (returns DOM node)
    const largest = this._findLargestTextBlockNode(rootElement);
    if (largest) return largest;

    // Fallback: framework content (returns DOM node)
    const framework = this._findFrameworkContentNode(rootElement);
    if (framework) return framework;

    // Last resort: return the root element itself.
    // Turndown's removeNonContent rule will handle filtering during traversal.
    console.log('📄 [markdown-converter] Using root element as fallback (Turndown will filter)');
    return rootElement;
  }

  convertToMarkdown(html) {
    if (!html || typeof html !== 'string') {
      return '';
    }

    // Size guard: truncate very large HTML to prevent browser hangs
    const MAX_HTML_LENGTH = 5 * 1024 * 1024; // 5MB
    if (html.length > MAX_HTML_LENGTH) {
      console.warn(`⚠️ [markdown-converter] HTML too large (${(html.length / 1024 / 1024).toFixed(1)}MB), truncating to ${MAX_HTML_LENGTH / 1024 / 1024}MB`);
      html = html.substring(0, MAX_HTML_LENGTH);
    }

    try {
      // Extract main content first
      const mainContent = this.extractMainContent(html);

      // Convert to markdown
      let markdown = this.turndownService.turndown(mainContent);

      // Clean up the result
      markdown = this.cleanupMarkdown(markdown);

      return markdown;
    } catch (error) {
      console.error('🚨 [markdown-converter] Error converting HTML to markdown:', error);
      return '';
    }
  }

  /**
   * Shared list of content selectors used by both string and DOM extraction paths.
   */
  _contentSelectors() {
    return [
      // Semantic HTML
      'article',
      'main',
      '[role="main"]',
      // Common CMS patterns
      '.content',
      '.post-content',
      '.entry-content',
      '.article-content',
      '.article-body',
      '.post-body',
      '.entry-body',
      '#content',
      // News/Blog patterns
      '.article',
      '.story',
      '.news-content',
      '.blog-post',
      '.post',
      // E-commerce patterns
      '.product-description',
      '.product-details',
      '.product-info',
      // Documentation patterns
      '.documentation',
      '.docs-content',
      '.readme',
      // Social media patterns
      '.post-content',
      '.tweet-text',
      '.status-text',
      // Framework-specific patterns
      '[data-testid="article"]',
      '[data-content="true"]',
      '.prose',
      '.rich-text',
      // Generic content containers
      '.container .content',
      '.main-content',
      '.primary-content',
      '.page-content'
    ];
  }

  extractMainContent(html) {
    // Create a DOM parser in Node.js environment or browser
    let doc;
    if (typeof document !== 'undefined') {
      // Browser environment
      const parser = new DOMParser();
      doc = parser.parseFromString(html, 'text/html');
    } else {
      // Node.js environment (for testing)
      const { JSDOM } = require('jsdom');
      const dom = new JSDOM(html);
      doc = dom.window.document;
    }

    for (const selector of this._contentSelectors()) {
      const element = doc.querySelector(selector);
      if (element && this.hasSignificantContent(element)) {
        console.log(`🎯 [markdown-converter] Found main content using selector: ${selector}`);
        return element.innerHTML;
      }
    }

    // Enhanced fallback strategy for complex sites
    const fallbackStrategies = [
      // Look for the largest text block
      () => this.findLargestTextBlock(doc),
      
      // Look for content in common framework containers
      () => this.findFrameworkContent(doc),
      
      // Clean body content as last resort
      () => this.getCleanedBodyContent(doc)
    ];

    for (const strategy of fallbackStrategies) {
      const content = strategy();
      if (content && content.trim()) {
        return content;
      }
    }

    console.warn('⚠️ [markdown-converter] No suitable content found, returning original HTML');
    return html;
  }

  hasSignificantContent(element) {
    if (!element) return false;
    
    const text = element.textContent || '';
    const trimmedText = text.trim();
    
    // Must have substantial text content
    if (trimmedText.length < 50) return false;
    
    // Must have more text than just navigation/UI elements
    const words = trimmedText.split(/\s+/).length;
    if (words < 10) return false;
    
    // Check for presence of paragraph-like content
    const hasStructuredContent = element.querySelector('p, h1, h2, h3, h4, h5, h6, li, blockquote');
    
    return hasStructuredContent;
  }

  findLargestTextBlock(doc) {
    // Only check top-level and second-level containers to avoid O(n*m) cost
    // of reading .textContent on thousands of deeply nested divs
    const candidates = doc.querySelectorAll(
      'body > div, body > section, body > article, body > main, ' +
      'body > div > div, body > div > section, body > div > article, body > div > main'
    );
    let largestElement = null;
    let maxTextLength = 0;

    for (const candidate of candidates) {
      if (!this.isLikelyContent(candidate)) continue;

      const textLength = (candidate.textContent || '').trim().length;
      if (textLength > maxTextLength) {
        maxTextLength = textLength;
        largestElement = candidate;
      }
    }

    if (largestElement && maxTextLength > 200) {
      console.log('📊 [markdown-converter] Found content using largest text block strategy');
      return largestElement.innerHTML;
    }

    return null;
  }

  findFrameworkContent(doc) {
    // Common framework patterns
    const frameworkSelectors = [
      '#root article',      // React apps
      '#root main',
      '#__next main',       // Next.js
      '#__nuxt main',       // Nuxt.js
      '.v-application main', // Vue.js with Vuetify
      'ion-content',        // Ionic
      '[data-reactroot] main'
    ];

    for (const selector of frameworkSelectors) {
      const element = doc.querySelector(selector);
      if (element && this.hasSignificantContent(element)) {
        console.log(`🎯 [markdown-converter] Found framework content using: ${selector}`);
        return element.innerHTML;
      }
    }

    return null;
  }

  getCleanedBodyContent(doc) {
    const body = doc.body || doc.documentElement;
    if (!body) return null;

    // Clone the body to avoid modifying the original
    const bodyClone = body.cloneNode(true);
    
    // Remove non-content elements more aggressively
    const elementsToRemove = bodyClone.querySelectorAll(`
      nav, header, footer, aside, 
      .nav, .navigation, .menu, .sidebar,
      .ad, .ads, .advertisement, .banner,
      .social, .share, .related, .recommended,
      .comments, .comment-section,
      .popup, .modal, .overlay, .lightbox,
      .cookie-notice, .gdpr-notice,
      .subscription, .newsletter, .signup,
      .breadcrumb, .pagination,
      [class*="ad-"], [id*="ad-"],
      [class*="popup"], [id*="popup"],
      script, style, noscript
    `);
    
    elementsToRemove.forEach(el => el.remove());
    
    console.log('📄 [markdown-converter] Using cleaned body content as fallback');
    return bodyClone.innerHTML;
  }

  /**
   * DOM-node variant of findLargestTextBlock — returns the element itself.
   */
  _findLargestTextBlockNode(root) {
    const candidates = root.querySelectorAll(
      'body > div, body > section, body > article, body > main, ' +
      'body > div > div, body > div > section, body > div > article, body > div > main'
    );
    let largestElement = null;
    let maxTextLength = 0;

    for (const candidate of candidates) {
      if (!this.isLikelyContent(candidate)) continue;
      const textLength = (candidate.textContent || '').trim().length;
      if (textLength > maxTextLength) {
        maxTextLength = textLength;
        largestElement = candidate;
      }
    }

    if (largestElement && maxTextLength > 200) {
      console.log('📊 [markdown-converter] Found content using largest text block strategy');
      return largestElement;
    }
    return null;
  }

  /**
   * DOM-node variant of findFrameworkContent — returns the element itself.
   */
  _findFrameworkContentNode(root) {
    const frameworkSelectors = [
      '#root article', '#root main',
      '#__next main', '#__nuxt main',
      '.v-application main', 'ion-content',
      '[data-reactroot] main'
    ];

    for (const selector of frameworkSelectors) {
      const element = root.querySelector(selector);
      if (element && this.hasSignificantContent(element)) {
        console.log(`🎯 [markdown-converter] Found framework content using: ${selector}`);
        return element;
      }
    }
    return null;
  }

  isLikelyContent(element) {
    const text = (element.textContent || '').trim();
    if (text.length < 100) return false;

    const className = element.className || '';
    const id = element.id || '';

    // Exclude elements that are likely not content
    const excludePatterns = [
      'nav', 'menu', 'sidebar', 'footer', 'header',
      'ad', 'popup', 'modal', 'overlay'
    ];

    const isExcluded = excludePatterns.some(pattern =>
      className.toLowerCase().includes(pattern) ||
      id.toLowerCase().includes(pattern)
    );

    return !isExcluded;
  }

  /**
   * Resolve the best image URL from an <img> element, handling lazy-loading
   * patterns where the real URL lives in data-src, data-lazy-src, srcset, etc.
   * and src holds a placeholder (data URI or tiny SVG).
   */
  _resolveImageSrc(node) {
    const src = node.getAttribute('src') || '';
    const dataSrc = node.getAttribute('data-src') || '';
    const dataLazySrc = node.getAttribute('data-lazy-src') || '';
    const srcset = node.getAttribute('srcset') || '';
    const dataSrcset = node.getAttribute('data-srcset') || '';

    const isPlaceholder = !src || src.startsWith('data:');

    // If src is a placeholder, prefer lazy-load attributes
    if (isPlaceholder) {
      if (dataSrc) return dataSrc;
      if (dataLazySrc) return dataLazySrc;

      // Parse srcset/data-srcset for the best URL
      const resolved = this._parseSrcsetBest(dataSrcset || srcset);
      if (resolved) return resolved;

      return ''; // no real URL found
    }

    return src;
  }

  /**
   * Extract the highest-resolution URL from a srcset string.
   * Format: "url1 100w, url2 200w" or "url1 1x, url2 2x"
   */
  _parseSrcsetBest(srcset) {
    if (!srcset) return '';

    const candidates = srcset.split(',').map(s => {
      const parts = s.trim().split(/\s+/);
      const url = parts[0];
      const descriptor = parts[1] || '0w';
      const value = parseFloat(descriptor) || 0;
      return { url, value };
    }).filter(c => c.url);

    if (candidates.length === 0) return '';

    // Pick the highest resolution
    candidates.sort((a, b) => b.value - a.value);
    return candidates[0].url;
  }

  cleanupMarkdown(markdown) {
    if (!markdown) return '';

    // Use the configured bullet marker for list normalization
    const bullet = this.turndownService.options.bulletListMarker || '-';
    const escapedBullet = bullet.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    // Normalize list markers to the configured bullet
    const otherBullet = bullet === '-' ? '\\*' : '-';
    const bulletNormalize = new RegExp(`^${otherBullet} `, 'gm');
    const emptyListItem = new RegExp(`\\n(?:${escapedBullet} \\s*|> \\s*)\\n`, 'g');
    const listSpacing = new RegExp(`(\\n${escapedBullet} .+?)(\\n{2,})(${escapedBullet} )`, 'g');

    return markdown
      // Normalize list markers to configured bullet
      .replace(bulletNormalize, `${bullet} `)
      // Remove empty list items and empty blockquotes
      .replace(emptyListItem, '\n')
      // Ensure single line breaks between list items
      .replace(listSpacing, '$1\n$3')
      // Clean up around headings
      .replace(/\n{2,}(#{1,6} )/g, '\n\n$1')
      .replace(/(#{1,6} .+?)\n{3,}/g, '$1\n\n')
      // Clean up around blockquotes
      .replace(/\n{2,}(> )/g, '\n\n$1')
      // Clean up code blocks
      .replace(/```\n\n/g, '```\n')
      .replace(/\n\n```/g, '\n```')
      // Final cleanup: collapse excess newlines, strip trailing spaces
      .replace(/\n{3,}/g, '\n\n')
      .replace(/ +$/gm, '')
      // Trim blank lines from start/end without stripping leading spaces on content lines
      .replace(/^\n+/, '')
      .replace(/\n+$/, '');
  }
}

// Support both CommonJS and ES modules
if (typeof module !== 'undefined' && module.exports) {
  module.exports = MarkdownConverter;
} else if (typeof window !== 'undefined') {
  window.MarkdownConverter = MarkdownConverter;
} 