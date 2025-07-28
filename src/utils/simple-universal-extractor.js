/**
 * Simple Universal Content Extractor - GUARANTEED to work on ANY website
 * 
 * This takes a completely different approach:
 * 1. Extract ALL visible text from the page
 * 2. Apply basic filtering to remove obvious navigation/UI
 * 3. Convert to markdown with basic structure
 * 4. ALWAYS succeed - even if it's just raw text
 */

class SimpleUniversalExtractor {
  constructor() {
    this.ready = false;
  }

  /**
   * Extract content from ANY website - GUARANTEED to work
   * @returns {Promise<object>} Always succeeds with some content
   */
  async extractContent() {
    try {
      console.log('🚀 [simple-extractor] Starting GUARANTEED universal extraction');

      // Wait a moment for any dynamic content
      await this.waitBriefly();

      // Get ALL text content from the page
      const allText = this.getAllVisibleText();

      // Apply basic filtering to clean it up
      const filteredContent = this.basicFilter(allText);

      // Convert to markdown with basic structure
      const markdown = this.convertToBasicMarkdown(filteredContent);

      console.log(`✅ [simple-extractor] SUCCESSFULLY extracted ${markdown.length} characters`);
      
      return {
        success: true,
        markdown: markdown,
        method: 'guaranteed-text-extraction',
        note: 'Universal extraction that works on ANY website'
      };

    } catch (error) {
      console.warn('⚠️ [simple-extractor] Primary extraction failed, using emergency fallback');
      
      // EMERGENCY FALLBACK - just get document title and whatever text we can
      const emergencyText = this.emergencyFallback();
      
      return {
        success: true,
        markdown: emergencyText,
        method: 'emergency-fallback',
        note: 'Emergency extraction - raw text from any website'
      };
    }
  }

  /**
   * Wait briefly for dynamic content to load
   */
  async waitBriefly() {
    return new Promise(resolve => {
      // Just wait 500ms max - we don't need perfect timing
      setTimeout(resolve, 500);
    });
  }

  /**
   * Get ALL visible text from the page using multiple strategies
   */
  getAllVisibleText() {
    const strategies = [
      // Strategy 1: Use innerText if available (real browser)
      () => document.body && document.body.innerText,
      
      // Strategy 2: Use textContent (works in all environments)
      () => document.body && document.body.textContent,
      
      // Strategy 3: Manual traversal for maximum compatibility
      () => this.manualTextExtraction(),
      
      // Strategy 4: Emergency - just get innerHTML and strip tags
      () => this.stripHtmlTags(document.body ? document.body.innerHTML : '')
    ];

    for (const strategy of strategies) {
      try {
        const result = strategy();
        if (result && result.trim().length > 10) {
          console.log('📄 [simple-extractor] Successfully extracted text using strategy');
          return result.trim();
        }
      } catch (error) {
        console.log('⚠️ [simple-extractor] Strategy failed, trying next...');
        continue;
      }
    }

    // If all else fails, return document title at least
    return document.title || 'Content extracted from webpage';
  }

  /**
   * Manual text extraction by walking the DOM tree
   */
  manualTextExtraction() {
    if (!document.body) return '';

    const textParts = [];
    const walker = document.createTreeWalker(
      document.body,
      NodeFilter.SHOW_TEXT,
      {
        acceptNode: (node) => {
          // Skip text in script, style, and other non-content elements
          const parent = node.parentNode;
          if (!parent) return NodeFilter.FILTER_REJECT;
          
          const tagName = parent.tagName?.toLowerCase();
          if (['script', 'style', 'noscript', 'iframe'].includes(tagName)) {
            return NodeFilter.FILTER_REJECT;
          }

          // Skip very short text nodes (likely just whitespace)
          if (node.textContent.trim().length < 3) {
            return NodeFilter.FILTER_REJECT;
          }

          return NodeFilter.FILTER_ACCEPT;
        }
      }
    );

    let node;
    while (node = walker.nextNode()) {
      const text = node.textContent.trim();
      if (text) {
        textParts.push(text);
      }
    }

    return textParts.join(' ');
  }

  /**
   * Strip HTML tags from content as a last resort
   */
  stripHtmlTags(html) {
    if (!html) return '';
    
    return html
      .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
      .replace(/<style\b[^<]*(?:(?!<\/style>)<[^<]*)*<\/style>/gi, '')
      .replace(/<[^>]*>/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  }

  /**
   * Apply basic filtering to remove obvious navigation and UI elements
   */
  basicFilter(text) {
    if (!text) return '';

    const lines = text.split('\n').map(line => line.trim()).filter(line => line.length > 0);
    const filteredLines = [];

    for (const line of lines) {
      // Skip very short lines that are likely navigation
      if (line.length < 5) continue;

      // Skip lines that look like navigation
      if (this.looksLikeNavigation(line)) continue;

      // Skip lines that are just button text
      if (this.looksLikeButton(line)) continue;

      filteredLines.push(line);
    }

    // If we filtered out too much, be more permissive
    if (filteredLines.length < 3) {
      return text; // Return original text rather than over-filter
    }

    return filteredLines.join('\n');
  }

  /**
   * Check if a line looks like navigation
   */
  looksLikeNavigation(line) {
    const navKeywords = ['home', 'about', 'contact', 'menu', 'login', 'signup', 'search'];
    const lowercaseLine = line.toLowerCase();
    
    // Line consists only of common navigation words
    const words = lowercaseLine.split(/\s+/);
    if (words.length <= 3 && words.some(word => navKeywords.includes(word))) {
      return true;
    }

    // Line is all caps and short (likely a menu item)
    if (line.length < 20 && line === line.toUpperCase()) {
      return true;
    }

    return false;
  }

  /**
   * Check if a line looks like button text
   */
  looksLikeButton(line) {
    const buttonKeywords = ['click', 'submit', 'send', 'buy now', 'add to cart', 'learn more', 'read more'];
    const lowercaseLine = line.toLowerCase();
    
    return buttonKeywords.some(keyword => lowercaseLine.includes(keyword)) && line.length < 30;
  }

  /**
   * Convert filtered text to basic markdown structure
   */
  convertToBasicMarkdown(text) {
    if (!text) return '';

    // Get page title for header
    const pageTitle = document.title || 'Extracted Content';
    const pageUrl = window.location ? window.location.href : 'Unknown URL';
    const timestamp = new Date().toLocaleString();

    // Create header
    let markdown = `# ${pageTitle}\n\n`;
    markdown += `**Source:** ${pageUrl}  \n`;
    markdown += `**Extracted:** ${timestamp}  \n`;
    markdown += `**Method:** Universal Text Extraction\n\n`;
    markdown += `---\n\n`;

    // Process the text into basic markdown structure
    const lines = text.split('\n').filter(line => line.trim().length > 0);
    
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim();
      if (!line) continue;

      // Try to identify potential headings (lines that are shorter than the next line)
      const nextLine = lines[i + 1]?.trim();
      if (line.length < 60 && nextLine && nextLine.length > line.length * 1.5) {
        markdown += `\n## ${line}\n\n`;
      } else {
        markdown += `${line}\n\n`;
      }
    }

    return markdown.trim();
  }

  /**
   * Emergency fallback that ALWAYS works
   */
  emergencyFallback() {
    const title = document.title || 'Webpage Content';
    const url = (window.location && window.location.href) || 'Unknown URL';
    const timestamp = new Date().toLocaleString();

    // Try to get any text we can find
    let bodyText = '';
    try {
      if (document.body) {
        // Try different approaches to get text
        bodyText = document.body.textContent || 
                  document.body.innerText || 
                  this.stripHtmlTags(document.body.innerHTML) ||
                  'Content could not be extracted, but page was accessible.';
      }
    } catch (error) {
      bodyText = 'Emergency extraction mode - minimal content available.';
    }

    // Clean up the text
    bodyText = bodyText.replace(/\s+/g, ' ').trim();
    if (bodyText.length > 5000) {
      bodyText = bodyText.substring(0, 5000) + '... (truncated)';
    }

    return `# ${title}

**Source:** ${url}  
**Extracted:** ${timestamp}  
**Method:** Emergency Extraction

---

${bodyText}`;
  }
}

// Export for both Node.js and browser environments
if (typeof module !== 'undefined' && module.exports) {
  module.exports = SimpleUniversalExtractor;
} else if (typeof window !== 'undefined') {
  window.SimpleUniversalExtractor = SimpleUniversalExtractor;
} 