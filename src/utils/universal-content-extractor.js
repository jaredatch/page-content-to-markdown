/**
 * Universal Content Extractor
 * 
 * This extractor works on ANY website by reading what the user actually sees,
 * not by parsing HTML structure. It waits for dynamic content and extracts
 * visible text with intelligent filtering.
 */

class UniversalContentExtractor {
  constructor() {
    this.contentBlocks = [];
    this.isReady = false;
    this.dynamicContentTimeout = 3000; // Wait up to 3 seconds for dynamic content
  }

  /**
   * Extract content from any website
   * @returns {Promise<object>} Extracted content with metadata
   */
  async extractContent() {
    try {
      console.log('🚀 [universal-extractor] Starting universal content extraction');

      // Wait for page to be fully rendered (including dynamic content)
      await this.waitForContentReady();

      // Extract all visible text blocks
      const textBlocks = this.extractVisibleTextBlocks();

      // Analyze and score content blocks
      const analyzedBlocks = this.analyzeContentBlocks(textBlocks);

      // Filter and organize content
      const filteredContent = this.filterMainContent(analyzedBlocks);

      // Convert to markdown
      const markdown = this.convertToMarkdown(filteredContent);

      // If we didn't get enough content, use fallback strategy
      if (markdown.length < 200) {
        console.log('⚠️ [universal-extractor] Low content detected, using fallback extraction');
        return this.fallbackExtraction();
      }

      console.log('✅ [universal-extractor] Successfully extracted content');
      
      return {
        success: true,
        markdown: markdown,
        contentBlocks: filteredContent.length,
        extractionMethod: 'intelligent-filtering'
      };

    } catch (error) {
      console.error('🚨 [universal-extractor] Error in extraction:', error);
      return this.fallbackExtraction();
    }
  }

  /**
   * Wait for page to be fully rendered including dynamic content
   */
  async waitForContentReady() {
    return new Promise((resolve) => {
      console.log('⏳ [universal-extractor] Waiting for content to be ready');

      let readyChecks = 0;
      const maxChecks = 30; // 3 seconds max wait
      
      const checkReady = () => {
        readyChecks++;
        
        // Check if page is fully loaded
        const isDocumentReady = document.readyState === 'complete';
        const hasSubstantialContent = document.body && document.body.innerText.length > 100;
        
        if (isDocumentReady && hasSubstantialContent) {
          console.log('📄 [universal-extractor] Page content ready');
          resolve();
          return;
        }

        if (readyChecks >= maxChecks) {
          console.log('⏰ [universal-extractor] Timeout reached, proceeding with available content');
          resolve();
          return;
        }

        setTimeout(checkReady, 100);
      };

      // Start checking after a short delay to let dynamic content load
      setTimeout(checkReady, 100);
    });
  }

  /**
   * Extract all visible text blocks from the page
   */
  extractVisibleTextBlocks() {
    console.log('📖 [universal-extractor] Extracting visible text blocks');

    const textBlocks = [];
    const processedElements = new Set();

    // Get all elements that might contain text content
    const allElements = document.querySelectorAll('*');

    for (const element of allElements) {
      if (processedElements.has(element)) continue;

      // Skip elements that are not visible
      if (!this.isElementVisible(element)) continue;

      // Skip elements that are just containers (no direct text)
      const directText = this.getDirectText(element);
      if (directText.length < 10) continue;

      // Skip elements that are clearly navigation/UI
      if (this.isNavigationElement(element)) continue;

      const textBlock = {
        element: element,
        text: directText,
        tag: element.tagName.toLowerCase(),
        position: this.getElementPosition(element),
        size: this.getElementSize(element),
        fontSize: this.getFontSize(element),
        isHeading: this.isHeadingElement(element),
        isLink: element.tagName.toLowerCase() === 'a',
        wordCount: directText.split(/\s+/).length,
        className: element.className || '',
        id: element.id || ''
      };

      textBlocks.push(textBlock);
      processedElements.add(element);

      // Mark children as processed to avoid duplicates
      const children = element.querySelectorAll('*');
      children.forEach(child => processedElements.add(child));
    }

    console.log(`📊 [universal-extractor] Found ${textBlocks.length} text blocks`);
    return textBlocks;
  }

  /**
   * Check if element is visible to the user
   */
  isElementVisible(element) {
    const style = window.getComputedStyle(element);
    
    return (
      style.display !== 'none' &&
      style.visibility !== 'hidden' &&
      style.opacity !== '0' &&
      element.offsetWidth > 0 &&
      element.offsetHeight > 0
    );
  }

  /**
   * Get direct text content of element (not including children)
   */
  getDirectText(element) {
    // Get only the direct text nodes, not nested elements
    let text = '';
    for (const node of element.childNodes) {
      if (node.nodeType === Node.TEXT_NODE) {
        text += node.textContent;
      }
    }
    
    // If no direct text, but element has innerText and few children, use it
    if (text.trim().length < 10 && element.children.length <= 2) {
      text = element.innerText || '';
    }

    return text.trim();
  }

  /**
   * Check if element is likely navigation/UI rather than content
   */
  isNavigationElement(element) {
    const tag = element.tagName.toLowerCase();
    const className = (element.className || '').toLowerCase();
    const id = (element.id || '').toLowerCase();
    const text = element.innerText || '';

    // Navigation keywords
    const navKeywords = [
      'nav', 'menu', 'header', 'footer', 'sidebar', 'aside',
      'breadcrumb', 'pagination', 'toolbar', 'tab',
      'button', 'btn', 'link', 'social', 'share',
      'ad', 'advertisement', 'popup', 'modal',
      'cookie', 'gdpr', 'consent', 'subscribe'
    ];

    // Check element attributes
    const hasNavKeyword = navKeywords.some(keyword =>
      className.includes(keyword) || id.includes(keyword)
    );

    // Check if it's a navigation tag
    const isNavTag = ['nav', 'header', 'footer', 'aside'].includes(tag);

    // Check if text looks like navigation (short, button-like)
    const isShortUIText = text.length < 50 && (
      text.includes('Click') ||
      text.includes('Read more') ||
      text.includes('Continue') ||
      text.match(/^\s*(Home|About|Contact|Login|Sign|Menu)\s*$/i)
    );

    return hasNavKeyword || isNavTag || isShortUIText;
  }

  /**
   * Get element position information
   */
  getElementPosition(element) {
    const rect = element.getBoundingClientRect();
    return {
      top: rect.top,
      left: rect.left,
      width: rect.width,
      height: rect.height,
      centerX: rect.left + rect.width / 2,
      centerY: rect.top + rect.height / 2
    };
  }

  /**
   * Get element size information
   */
  getElementSize(element) {
    return {
      width: element.offsetWidth,
      height: element.offsetHeight,
      area: element.offsetWidth * element.offsetHeight
    };
  }

  /**
   * Get element font size
   */
  getFontSize(element) {
    const style = window.getComputedStyle(element);
    return parseFloat(style.fontSize) || 16;
  }

  /**
   * Check if element is a heading
   */
  isHeadingElement(element) {
    const tag = element.tagName.toLowerCase();
    const fontSize = this.getFontSize(element);
    
    return tag.match(/^h[1-6]$/) || fontSize > 18;
  }

  /**
   * Analyze and score content blocks
   */
  analyzeContentBlocks(textBlocks) {
    console.log('🔍 [universal-extractor] Analyzing content blocks');

    return textBlocks.map(block => {
      let score = 0;

      // Word count scoring (more words = more likely content)
      if (block.wordCount > 20) score += 3;
      if (block.wordCount > 50) score += 2;
      if (block.wordCount > 100) score += 2;

      // Position scoring (center content scores higher)
      const viewportWidth = window.innerWidth;
      const centerZone = viewportWidth * 0.3; // 30% from each side
      if (block.position.centerX > centerZone && block.position.centerX < viewportWidth - centerZone) {
        score += 2;
      }

      // Font size scoring (larger text = more important)
      if (block.fontSize > 16) score += 1;
      if (block.fontSize > 20) score += 1;

      // Heading scoring
      if (block.isHeading) score += 3;

      // Paragraph-like content
      if (block.tag === 'p') score += 2;
      if (block.tag === 'div' && block.wordCount > 30) score += 1;

      // Article/main content areas
      if (block.className.includes('content') || 
          block.className.includes('article') ||
          block.className.includes('post')) {
        score += 3;
      }

      // Penalize likely UI elements
      if (block.isLink) score -= 1;
      if (block.wordCount < 5) score -= 2;

      return {
        ...block,
        contentScore: score
      };
    });
  }

  /**
   * Filter main content based on scores and heuristics
   */
  filterMainContent(analyzedBlocks) {
    console.log('🎯 [universal-extractor] Filtering main content');

    // Sort by content score
    const sortedBlocks = analyzedBlocks.sort((a, b) => b.contentScore - a.contentScore);

    // Take blocks with positive scores
    const contentBlocks = sortedBlocks.filter(block => block.contentScore > 0);

    // If we don't have enough content, lower the threshold
    if (contentBlocks.length < 3) {
      return sortedBlocks.slice(0, Math.max(10, sortedBlocks.length / 2));
    }

    return contentBlocks;
  }

  /**
   * Convert filtered content to markdown
   */
  convertToMarkdown(contentBlocks) {
    console.log('📝 [universal-extractor] Converting to markdown');

    let markdown = '';
    let lastWasHeading = false;

    for (const block of contentBlocks) {
      let blockText = block.text.trim();
      if (!blockText) continue;

      // Add appropriate spacing
      if (markdown && !lastWasHeading) {
        markdown += '\n\n';
      } else if (markdown) {
        markdown += '\n';
      }

      // Format as heading or paragraph
      if (block.isHeading || block.fontSize > 20) {
        const level = block.tag.match(/^h([1-6])$/) ? parseInt(block.tag[1]) : 1;
        const headingPrefix = '#'.repeat(Math.min(level, 6));
        markdown += `${headingPrefix} ${blockText}`;
        lastWasHeading = true;
      } else {
        markdown += blockText;
        lastWasHeading = false;
      }
    }

    return markdown.trim();
  }

  /**
   * Fallback extraction - get ALL visible text when smart filtering fails
   */
  fallbackExtraction() {
    console.log('🆘 [universal-extractor] Using fallback extraction - getting ALL visible text');

    try {
      // Get all visible text from the page
      const allText = document.body.innerText || '';
      
      // Basic cleanup
      const cleanedText = allText
        .replace(/\n{3,}/g, '\n\n')  // Remove excessive line breaks
        .replace(/[ \t]+/g, ' ')     // Normalize whitespace
        .trim();

      // Add basic structure
      const markdown = this.addBasicStructure(cleanedText);

      return {
        success: true,
        markdown: markdown,
        contentBlocks: 1,
        extractionMethod: 'fallback-all-text',
        warning: 'Smart filtering failed, extracted all visible text. You may need to clean this up.'
      };

    } catch (error) {
      console.error('🚨 [universal-extractor] Even fallback extraction failed:', error);
      return {
        success: false,
        error: 'Complete extraction failure',
        markdown: ''
      };
    }
  }

  /**
   * Add basic structure to raw text
   */
  addBasicStructure(text) {
    // Try to identify potential headings (lines that are short and followed by content)
    const lines = text.split('\n');
    let markdown = '';

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim();
      if (!line) continue;

      const nextLine = lines[i + 1]?.trim();
      
      // Potential heading: short line followed by longer content
      if (line.length < 100 && nextLine && nextLine.length > line.length) {
        markdown += `\n\n## ${line}\n\n`;
      } else {
        markdown += line + '\n';
      }
    }

    return markdown.trim();
  }
}

// Export for both Node.js and browser environments
if (typeof module !== 'undefined' && module.exports) {
  module.exports = UniversalContentExtractor;
} else if (typeof window !== 'undefined') {
  window.UniversalContentExtractor = UniversalContentExtractor;
} 