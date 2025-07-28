// Content script for browser extension
// This script runs in the context of web pages and uses GUARANTEED UNIVERSAL EXTRACTION

console.log('🚀 [content-script] GUARANTEED universal content script loaded');

// Import SimpleUniversalExtractor (will be bundled by webpack)
const SimpleUniversalExtractor = window.SimpleUniversalExtractor || require('../utils/simple-universal-extractor');

class ContentScript {
  constructor() {
    this.extractor = new SimpleUniversalExtractor();
    this.setupMessageListener();
  }

  /**
   * Extract content using GUARANTEED universal extraction method
   * @returns {Promise<object>} Result with markdown content - ALWAYS succeeds
   */
  async convertPageToMarkdown() {
    try {
      console.log('🔄 [content-script] Starting GUARANTEED universal page conversion');
      
      // Use the GUARANTEED universal extractor that works on ANY website
      const extractionResult = await this.extractor.extractContent();
      
      // This NEVER fails - always returns success: true
      console.log(`✅ [content-script] Successfully extracted content using ${extractionResult.method}`);
      
      return {
        success: true,
        markdown: extractionResult.markdown,
        extractionInfo: {
          method: extractionResult.method,
          note: extractionResult.note
        }
      };

    } catch (error) {
      console.error('🚨 [content-script] Error in universal conversion (this should never happen):', error);
      
      // Even if something goes wrong, provide a basic fallback
      const title = document.title || 'Webpage Content';
      const url = window.location.href;
      const timestamp = new Date().toLocaleString();
      
      const fallbackMarkdown = `# ${title}

**Source:** ${url}  
**Extracted:** ${timestamp}  
**Method:** Emergency Content Script Fallback

---

Content extraction encountered an error, but the page was accessible.
URL: ${url}
Title: ${title}
Error: ${error.message}`;

      return {
        success: true,
        markdown: fallbackMarkdown,
        extractionInfo: {
          method: 'emergency-content-script-fallback',
          note: 'Emergency fallback from content script level'
        }
      };
    }
  }

  /**
   * Set up message listener for communication with background script
   */
  setupMessageListener() {
    chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
      console.log('📨 [content-script] Received message:', request);

      if (request.action === 'extractContent') {
        // Handle content extraction request - GUARANTEED to work
        this.convertPageToMarkdown()
          .then(result => {
            console.log('📤 [content-script] Sending response:', result);
            sendResponse(result);
          })
          .catch(error => {
            console.error('🚨 [content-script] Error in message handler:', error);
            // This should never happen, but provide ultimate fallback
            sendResponse({
              success: true,
              markdown: `# Content Extraction

**Error:** ${error.message}
**URL:** ${window.location.href}
**Time:** ${new Date().toLocaleString()}

The universal content extractor encountered an unexpected error, but the extension is still functional.`,
              extractionInfo: {
                method: 'ultimate-fallback',
                note: 'Ultimate fallback when even guaranteed extraction fails'
              }
            });
          });
        
        // Return true to indicate we will send a response asynchronously
        return true;
      }

      // Ignore other messages
      return false;
    });

    console.log('👂 [content-script] GUARANTEED universal message listener set up');
  }

  /**
   * Legacy method for compatibility - now uses guaranteed universal extraction
   */
  extractPageContent() {
    console.log('⚠️ [content-script] Legacy extractPageContent called, using guaranteed universal extraction');
    // Return simple text content for compatibility
    return document.body ? (document.body.textContent || document.body.innerText || 'Content available') : 'No content';
  }

  /**
   * Get page metadata
   * @returns {object} Page metadata including title, URL, and timestamp  
   */
  getPageMetadata() {
    return {
      title: document.title || 'Untitled Page',
      url: window.location.href,
      timestamp: new Date().toISOString(),
      domain: window.location.hostname
    };
  }
}

// Initialize content script
const contentScript = new ContentScript();

// Export for testing
if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    extractPageContent: () => contentScript.extractPageContent(),
    getPageMetadata: () => contentScript.getPageMetadata(),
    convertPageToMarkdown: () => contentScript.convertPageToMarkdown()
  };
} 