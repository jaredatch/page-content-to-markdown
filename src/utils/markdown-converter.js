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
      linkStyle: 'inlined',
      linkReferenceStyle: 'full'
    });

    // Configure rules for clean conversion
    this.setupCustomRules();
  }

  setupCustomRules() {
    // Remove script and style elements
    this.turndownService.remove(['script', 'style', 'iframe', 'object', 'embed', 'noscript']);
    
    // Remove navigation, ads, and other non-content elements
    this.turndownService.addRule('removeNonContent', {
      filter: (node) => {
        const className = node.className || '';
        const id = node.id || '';
        const tagName = node.tagName?.toLowerCase();
        
        // Remove common non-content elements
        const nonContentPatterns = [
          'nav', 'navigation', 'menu', 'sidebar', 'aside',
          'ad', 'advertisement', 'banner', 'header', 'footer',
          'social', 'share', 'comment', 'related', 'recommended',
          'popup', 'modal', 'overlay', 'cookie', 'gdpr',
          'subscription', 'newsletter', 'signup',
          'buy-now', 'purchase', 'cart', 'checkout',
          'like', 'vote', 'rating', 'engagement',
          'breadcrumb', 'pagination'
        ];
        
        return nonContentPatterns.some(pattern => 
          className.toLowerCase().includes(pattern) ||
          id.toLowerCase().includes(pattern) ||
          tagName === pattern
        );
      },
      replacement: () => ''
    });

    // Clean up excessive line breaks
    this.turndownService.addRule('cleanLineBreaks', {
      filter: 'br',
      replacement: () => '\n'
    });

    // Handle images better
    this.turndownService.addRule('betterImages', {
      filter: 'img',
      replacement: (content, node) => {
        const alt = node.getAttribute('alt') || '';
        const src = node.getAttribute('src') || '';
        return alt ? `![${alt}](${src})` : '';
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

  convertToMarkdown(html) {
    if (!html || typeof html !== 'string') {
      return '';
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

    // Enhanced content selectors for real-world sites
    const contentSelectors = [
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

    for (const selector of contentSelectors) {
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
    const candidates = doc.querySelectorAll('div, section, article, main');
    let largestElement = null;
    let maxTextLength = 0;

    for (const candidate of candidates) {
      if (this.isLikelyContent(candidate)) {
        const textLength = (candidate.textContent || '').trim().length;
        if (textLength > maxTextLength) {
          maxTextLength = textLength;
          largestElement = candidate;
        }
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

  cleanupMarkdown(markdown) {
    if (!markdown) return '';

    return markdown
      // Remove excessive line breaks (more than 2 consecutive)
      .replace(/\n{3,}/g, '\n\n')
      // Remove leading and trailing whitespace
      .trim()
      // Remove trailing spaces on lines
      .replace(/ +$/gm, '')
      // Fix list formatting inconsistencies
      .replace(/^\* /gm, '- ')
      // Ensure single line breaks between list items
      .replace(/(\n- .+?)(\n{2,})(- )/g, '$1\n$3')
      // Clean up around headings
      .replace(/\n{2,}(#{1,6} )/g, '\n\n$1')
      .replace(/(#{1,6} .+?)\n{3,}/g, '$1\n\n')
      // Remove empty list items
      .replace(/\n- \s*\n/g, '\n')
      // Clean up excessive spacing around blockquotes
      .replace(/\n{2,}(> )/g, '\n\n$1')
      // Remove empty blockquotes
      .replace(/\n> \s*\n/g, '\n')
      // Clean up code blocks
      .replace(/```\n\n/g, '```\n')
      .replace(/\n\n```/g, '\n```')
      // Final cleanup
      .replace(/\n{3,}/g, '\n\n');
  }
}

// Support both CommonJS and ES modules
if (typeof module !== 'undefined' && module.exports) {
  module.exports = MarkdownConverter;
} else if (typeof window !== 'undefined') {
  window.MarkdownConverter = MarkdownConverter;
} 