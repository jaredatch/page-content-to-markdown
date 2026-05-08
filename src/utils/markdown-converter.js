const TurndownImport = require('turndown');
const TurndownService = TurndownImport.default || TurndownImport;
const TurndownPluginGfmImport = require('turndown-plugin-gfm');
const turndownPluginGfm = TurndownPluginGfmImport.gfm || TurndownPluginGfmImport;
const UrlCleaner = require('./url-cleaner');
const ExtractionTrace = require('./extraction-trace');

// Allowlists for emitted URL schemes. Anything outside these gets textified
// (links — drop the href but keep the visible text) or dropped (images —
// emit nothing). Keeps `javascript:`, `data:`, `file:`, `vbscript:`, and
// any other exotic scheme out of the markdown output. Trust assumption:
// the converter is the boundary at which scheme safety is enforced;
// downstream renderers don't need to re-validate emitted URLs.
const ALLOWED_LINK_SCHEMES = new Set(['http', 'https', 'mailto']);
const ALLOWED_IMAGE_SCHEMES = new Set(['http', 'https']);

// Empty scheme means a relative URL (e.g. `/page`, `subpage`, `#anchor`) —
// safe to keep, since it inherits the host page's scheme on resolve.
//
// Normalize the way the WHATWG URL parser does *before* scheme detection,
// otherwise embedded control characters bypass the allowlist:
//   1. Strip leading/trailing C0 controls + ASCII space (U+0000–U+0020).
//   2. Strip all internal ASCII tab / LF / CR (U+0009, U+000A, U+000D).
// Browsers apply both passes during href resolution, so without this an
// attribute like `java\tscript:alert(1)` or `javascript:…` parses as
// scheme="" here (treated as relative → allowed) but resolves to
// `javascript:` on click. Match the parser's view, not the raw string.
function _hrefScheme(href) {
  if (typeof href !== 'string') return '';
  const normalized = href
    .replace(/^[\u0000-\u0020]+|[\u0000-\u0020]+$/g, '')
    .replace(/[\u0009\u000A\u000D]/g, '');
  const m = /^([a-zA-Z][a-zA-Z0-9+\-.]*):/.exec(normalized);
  return m ? m[1].toLowerCase() : '';
}

function _isLinkSchemeAllowed(href) {
  const scheme = _hrefScheme(href);
  return scheme === '' || ALLOWED_LINK_SCHEMES.has(scheme);
}

function _isImageSchemeAllowed(src) {
  const scheme = _hrefScheme(src);
  return scheme === '' || ALLOWED_IMAGE_SCHEMES.has(scheme);
}

class MarkdownConverter {
  constructor(options = {}) {
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

    // Enable GFM: tables, strikethrough, task lists
    this.turndownService.use(turndownPluginGfm);

    // Extraction-time options. Defaults match Preferences.DEFAULTS so the
    // converter behaves correctly when used without applyFormattingOptions
    // (e.g. fragment conversions before formatting prefs are applied).
    this._stripTrackingParams = true;
    this._linkMode = 'keep';
    this._imageMode = 'keep';

    // Per-conversion image URL collection (populated by the image rule when
    // mode is 'url-list'). The list is the ordered output; the Set backs
    // O(1) membership checks. Both reset at the top of each conversion entry.
    this._pendingImageUrls = [];
    this._pendingImageUrlSet = new Set();

    // Optional dev-tool trace. Defaults to a disabled tracer whose methods
    // are all early-returns, so production extraction pays nothing for
    // trace support. Callers swap in a real target via setTrace.
    this._trace = ExtractionTrace.from(options.trace);

    // Configure rules for clean conversion
    this.setupCustomRules();
  }

  /**
   * Attach (or detach) a trace target. Accepts an ExtractionTrace instance,
   * a plain JSON-serializable target object, or null to disable. Used by
   * ContentScript to scope tracing to a single extraction call without
   * recreating the converter.
   */
  setTrace(traceOrTarget) {
    this._trace = ExtractionTrace.from(traceOrTarget);
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

    // Extraction-time toggles (not Turndown options)
    if (options.stripTrackingParams !== undefined) {
      this._stripTrackingParams = !!options.stripTrackingParams;
    }
    if (options.linkMode !== undefined) {
      this._linkMode = options.linkMode;
    }
    if (options.imageMode !== undefined) {
      this._imageMode = options.imageMode;
    }
  }

  /**
   * Image rule body shared by both the full-page and fragment Turndown
   * services. Returns the markdown replacement based on the current mode
   * and (for 'url-list') records the URL into the pending collection.
   */
  _imageReplacement(node) {
    const alt = node.getAttribute('alt') || '';
    const src = this._resolveImageSrc(node);
    if (!src) return '';

    // Drop images whose URL scheme isn't allowlisted (javascript:, file:,
    // vbscript:, …). data: URIs are normally caught earlier in
    // _resolveImageSrc (treated as placeholders for lazy-load attributes),
    // but the allowlist belt-and-suspenders the case where data: is the
    // only attribute set.
    if (!_isImageSchemeAllowed(src)) return '';

    switch (this._imageMode) {
      case 'strip':
        return '';
      case 'alt':
        return alt || '';
      case 'url-list':
        if (!this._pendingImageUrlSet.has(src)) {
          this._pendingImageUrlSet.add(src);
          this._pendingImageUrls.push(src);
        }
        return '';
      case 'keep':
      default:
        return `![${alt}](${src})`;
    }
  }

  /**
   * Reset the per-conversion image URL collection. Call at the top of every
   * top-level conversion entry point.
   */
  _resetConversionState() {
    this._pendingImageUrls = [];
    this._pendingImageUrlSet = new Set();
  }

  /**
   * Append the collected image URLs as a section to the markdown if the
   * current mode is 'url-list' and any URLs were collected. Called after
   * Turndown but before cleanupMarkdown so the URLs go through the same
   * tracking-strip pass as inline links.
   */
  _appendImageUrlList(markdown) {
    if (this._imageMode !== 'url-list' || this._pendingImageUrls.length === 0) {
      return markdown;
    }
    const list = this._pendingImageUrls.map(u => `- ${u}`).join('\n');
    const sep = markdown.endsWith('\n') ? '\n' : '\n\n';
    return `${markdown}${sep}## Images\n\n${list}`;
  }

  /**
   * Register the Turndown rule that overrides <a> handling for strip / bare
   * modes plus the keep-mode scheme allowlist. The filter returns true for:
   *   - any link in strip / bare mode (textify or append URL)
   *   - keep-mode links with a non-allowlisted scheme (textify so
   *     `javascript:`, `file:`, `vbscript:`, etc. never reach output)
   * Otherwise the filter returns false and Turndown's default inline/
   * reference link rules handle the node — preserving normal http(s) /
   * mailto links unchanged.
   */
  _registerLinkModeRule(service) {
    const converter = this;
    service.addRule('linkModeOverride', {
      filter: function (node) {
        if (node.nodeName !== 'A') return false;
        const href = node.getAttribute('href');
        if (!href) return false;
        if (converter._linkMode === 'strip' || converter._linkMode === 'bare') return true;
        // keep mode: intervene only when scheme is not allowlisted.
        return !_isLinkSchemeAllowed(href);
      },
      replacement: function (content, node) {
        const href = node.getAttribute('href') || '';
        if (converter._linkMode === 'strip') return content;
        if (converter._linkMode === 'bare') {
          // bare: append URL in parens, but only for allowlisted schemes —
          // otherwise textify. Tracking-param strip happens later in
          // cleanupMarkdown so the URL emitted here may still contain
          // trackers; they get stripped at the post-processing step.
          if (_isLinkSchemeAllowed(href) && href) {
            return `${content} (${href})`;
          }
          // bare-mode non-allowlisted scheme is a security-relevant drop —
          // user-mode strip/bare on allowed schemes is *not* recorded
          // since that's intentional formatting, not a content rejection.
          converter._trace.recordRejected('linkModeOverride', `non-allowlisted scheme dropped: ${_hrefScheme(href) || '(empty)'}`, node);
          return content;
        }
        // keep mode with non-allowlisted scheme: textify (drop the URL).
        converter._trace.recordRejected('linkModeOverride', `non-allowlisted scheme dropped: ${_hrefScheme(href) || '(empty)'}`, node);
        return content;
      }
    });
  }

  /**
   * Custom listItem rule replacing Turndown's default. Two changes:
   *   1. Single space after the marker (`- text`, `1. text`) instead of Turndown's
   *      3-space `-   ` / 2-space `1.  ` padding.
   *   2. Tight by default — single-paragraph items emit no trailing blank line.
   *      Turndown's default emits a 4-space-indented blank line between every
   *      item when an `<li>` wraps a `<p>` (X articles, Notion exports, GitHub
   *      issue bodies, etc.), making every list look "loose". Multi-paragraph
   *      items still keep a paragraph break, indented to align under the marker.
   */
  _registerListItemRule(service) {
    service.addRule('tightListItem', {
      filter: 'li',
      replacement: function (content, node, options) {
        // Strip leading newlines from <p> wrap; collapse trailing whitespace
        // (including the indent spaces a nested rule may have added).
        content = content
          .replace(/^\n+/, '')
          .replace(/\s+$/, '')
          .replace(/\n/g, '\n  ');

        let prefix = (options.bulletListMarker || '-') + ' ';
        const parent = node.parentNode;
        if (parent && parent.nodeName === 'OL') {
          const start = parent.getAttribute('start');
          const index = Array.prototype.indexOf.call(parent.children, node);
          prefix = (start ? Number(start) + index : index + 1) + '. ';
        }

        return prefix + content + (node.nextSibling ? '\n' : '');
      }
    });
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
        if (nonContentTags.has(tagName)) {
          this._trace.recordRejected('removeNonContent', `tag in nonContentTags set: ${tagName}`, node);
          return true;
        }

        const className = (node.className || '').toLowerCase();
        const id = (node.id || '').toLowerCase();
        const text = className + ' ' + id;

        const wordMatch = nonContentWordRegex.exec(text);
        if (wordMatch) {
          this._trace.recordRejected('removeNonContent', `matched word pattern: ${wordMatch[0].trim()}`, node);
          return true;
        }
        const substrMatch = nonContentSubstringRegex.exec(text);
        if (substrMatch) {
          this._trace.recordRejected('removeNonContent', `matched substring pattern: ${substrMatch[0]}`, node);
          return true;
        }

        this._trace.recordKept();
        return false;
      },
      replacement: () => ''
    });

    // Clean up excessive line breaks
    this.turndownService.addRule('cleanLineBreaks', {
      filter: 'br',
      replacement: () => '\n'
    });

    // Handle images — resolve lazy-loaded src and honor the user's
    // imageMode preference (keep / alt / strip / url-list).
    this.turndownService.addRule('betterImages', {
      filter: 'img',
      replacement: (content, node) => this._imageReplacement(node)
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

    this._registerLinkModeRule(this.turndownService);
    this._registerListItemRule(this.turndownService);
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
        // Enable GFM: tables, strikethrough, task lists
        this._fragmentService.use(turndownPluginGfm);

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
          replacement: (content, node) => this._imageReplacement(node)
        });

        // Clean up line breaks
        this._fragmentService.addRule('cleanLineBreaks', {
          filter: 'br',
          replacement: () => '\n'
        });

        this._registerLinkModeRule(this._fragmentService);
        this._registerListItemRule(this._fragmentService);
      }

      this._resetConversionState();
      let markdown = this._fragmentService.turndown(html);
      markdown = this._appendImageUrlList(markdown);
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

      this._resetConversionState();
      // Pass DOM node directly to Turndown (it clones internally)
      let markdown = this.turndownService.turndown(contentElement);

      markdown = this._appendImageUrlList(markdown);
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
    const selectors = this._contentSelectors();
    const tried = [];
    for (let i = 0; i < selectors.length; i++) {
      const selector = selectors[i];
      const element = rootElement.querySelector(selector);
      if (!element) {
        tried.push({ selector, result: 'no-match' });
        continue;
      }
      if (!this.hasSignificantContent(element)) {
        tried.push({ selector, result: 'no-significant-content' });
        continue;
      }
      tried.push({ selector, result: 'matched-significant' });
      for (let j = i + 1; j < selectors.length; j++) {
        tried.push({ selector: selectors[j], result: 'skipped-not-yet-tried' });
      }
      this._trace.setContentDiscovery('content-selector', selector, tried);
      console.log(`🎯 [markdown-converter] Found main content using selector: ${selector}`);
      return element;
    }

    // Fallback: largest text block (returns DOM node)
    const largest = this._findLargestTextBlockNode(rootElement);
    if (largest) {
      this._trace.setContentDiscovery('largest-text-block', null, tried);
      return largest;
    }

    // Fallback: framework content (returns DOM node)
    const framework = this._findFrameworkContentNode(rootElement);
    if (framework) {
      this._trace.setContentDiscovery('framework-content', null, tried);
      return framework;
    }

    // Last resort: return the root element itself.
    // Turndown's removeNonContent rule will handle filtering during traversal.
    console.log('📄 [markdown-converter] Using root element as fallback (Turndown will filter)');
    this._trace.setContentDiscovery('body-fallback', null, tried);
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

      this._resetConversionState();
      // Convert to markdown
      let markdown = this.turndownService.turndown(mainContent);

      markdown = this._appendImageUrlList(markdown);

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
      // General content containers
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

    const selectors = this._contentSelectors();
    const tried = [];
    for (let i = 0; i < selectors.length; i++) {
      const selector = selectors[i];
      const element = doc.querySelector(selector);
      if (!element) {
        tried.push({ selector, result: 'no-match' });
        continue;
      }
      if (!this.hasSignificantContent(element)) {
        tried.push({ selector, result: 'no-significant-content' });
        continue;
      }
      tried.push({ selector, result: 'matched-significant' });
      for (let j = i + 1; j < selectors.length; j++) {
        tried.push({ selector: selectors[j], result: 'skipped-not-yet-tried' });
      }
      this._trace.setContentDiscovery('content-selector', selector, tried);
      console.log(`🎯 [markdown-converter] Found main content using selector: ${selector}`);
      return element.innerHTML;
    }

    // Enhanced fallback strategy for complex sites — same application order
    // as before, restructured so each tier can be named in the trace.
    const largest = this.findLargestTextBlock(doc);
    if (largest && largest.trim()) {
      this._trace.setContentDiscovery('largest-text-block', null, tried);
      return largest;
    }
    const framework = this.findFrameworkContent(doc);
    if (framework && framework.trim()) {
      this._trace.setContentDiscovery('framework-content', null, tried);
      return framework;
    }
    const body = this.getCleanedBodyContent(doc);
    if (body && body.trim()) {
      this._trace.setContentDiscovery('body-fallback', null, tried);
      return body;
    }

    console.warn('⚠️ [markdown-converter] No suitable content found, returning original HTML');
    this._trace.setContentDiscovery('body-fallback', null, tried);
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

    const bullet = this.turndownService.options.bulletListMarker || '-';
    const escapedBullet = bullet.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const emptyListItem = new RegExp(`\\n(?:${escapedBullet} \\s*|> \\s*)\\n`, 'g');

    let result = markdown
      // Remove empty list items and empty blockquotes
      .replace(emptyListItem, '\n')
      // Clean up around headings
      .replace(/\n{2,}(#{1,6} )/g, '\n\n$1')
      .replace(/(#{1,6} .+?)\n{3,}/g, '$1\n\n')
      // Clean up around blockquotes
      .replace(/\n{2,}(> )/g, '\n\n$1')
      // Final cleanup: collapse excess newlines, strip trailing spaces
      .replace(/\n{3,}/g, '\n\n')
      .replace(/ +$/gm, '')
      // Trim blank lines from start/end without stripping leading spaces on content lines
      .replace(/^\n+/, '')
      .replace(/\n+$/, '');

    if (this._stripTrackingParams) {
      result = UrlCleaner.cleanUrlsInMarkdown(result);
    }

    return result;
  }
}

// Support both CommonJS and ES modules
if (typeof module !== 'undefined' && module.exports) {
  module.exports = MarkdownConverter;
} else if (typeof window !== 'undefined') {
  window.MarkdownConverter = MarkdownConverter;
} 