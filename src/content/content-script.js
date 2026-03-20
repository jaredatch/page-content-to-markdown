// Content script for browser extension
// Runs in the context of web pages — uses Turndown (via MarkdownConverter) as primary,
// with SimpleUniversalExtractor as fallback

console.log('🚀 [content-script] Content script loaded');

const MarkdownConverter = require('../utils/markdown-converter');
const SimpleUniversalExtractor = require('../utils/simple-universal-extractor');

class ContentScript {
  constructor() {
    this.converter = new MarkdownConverter();
    this.fallbackExtractor = new SimpleUniversalExtractor();
    this.setupMessageListener();
  }

  /**
   * Convert the current page to markdown.
   * Primary: Turndown-based HTML→Markdown conversion.
   * Fallback: SimpleUniversalExtractor text dump.
   * Emergency: Basic error markdown with page title/URL.
   */
  async convertPageToMarkdown() {
    const metadata = this.getPageMetadata();

    try {
      console.log('🔄 [content-script] Starting page conversion (Turndown primary)');

      // Primary path: pass full page HTML through MarkdownConverter
      const html = document.documentElement.outerHTML;
      const markdown = this.converter.convertToMarkdown(html);

      if (markdown && markdown.trim().length > 50) {
        console.log('✅ [content-script] Turndown conversion succeeded');
        const result = this.addMetadataHeader(markdown, metadata);
        return {
          success: true,
          markdown: result,
          metadata,
          extractionInfo: {
            method: 'turndown',
            note: 'Primary HTML-to-Markdown conversion via Turndown'
          }
        };
      }

      // Turndown returned empty/short content — fall through to fallback
      console.log('⚠️ [content-script] Turndown output too short, falling back to text extraction');
    } catch (error) {
      console.warn('⚠️ [content-script] Turndown conversion failed, falling back:', error.message);
    }

    // Fallback: SimpleUniversalExtractor (always returns something)
    try {
      console.log('🔄 [content-script] Using SimpleUniversalExtractor fallback');
      const extractionResult = await this.fallbackExtractor.extractContent();
      console.log(`✅ [content-script] Fallback extraction succeeded (${extractionResult.method})`);

      return {
        success: true,
        markdown: extractionResult.markdown,
        metadata,
        extractionInfo: {
          method: extractionResult.method,
          note: extractionResult.note
        }
      };
    } catch (error) {
      console.error('🚨 [content-script] Even fallback extraction failed:', error.message);
    }

    // Emergency: return basic markdown with page info
    const emergencyMarkdown = `# ${metadata.title}\n\n**Source:** ${metadata.url}  \n**Extracted:** ${metadata.timestamp}  \n**Method:** Emergency Fallback\n\n---\n\nContent extraction encountered an error. The page was accessible but content could not be extracted.\nError details have been logged to the browser console.`;

    return {
      success: true,
      markdown: emergencyMarkdown,
      metadata,
      extractionInfo: {
        method: 'emergency-fallback',
        note: 'Emergency fallback — both Turndown and text extraction failed'
      }
    };
  }

  /**
   * Prepend a metadata header to the converted markdown
   */
  addMetadataHeader(markdown, metadata) {
    const header = `# ${metadata.title}\n\n**Source:** ${metadata.url}  \n**Extracted:** ${metadata.timestamp}\n\n---\n\n`;
    return header + markdown;
  }

  /**
   * Get page metadata
   */
  getPageMetadata() {
    return {
      title: document.title || 'Untitled Page',
      url: window.location.href,
      timestamp: new Date().toISOString(),
      domain: window.location.hostname
    };
  }

  /**
   * Set up message listener for communication with background script
   */
  setupMessageListener() {
    chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
      console.log('📨 [content-script] Received message:', request);

      if (request.action === 'extractContent') {
        this.convertPageToMarkdown()
          .then(result => {
            console.log('📤 [content-script] Sending response');
            sendResponse(result);
          })
          .catch(error => {
            console.error('🚨 [content-script] Error in message handler:', error);
            sendResponse({
              success: true,
              markdown: `# Content Extraction\n\n**Error:** ${error.message}\n**URL:** ${window.location.href}\n**Time:** ${new Date().toISOString()}`,
              metadata: this.getPageMetadata(),
              extractionInfo: {
                method: 'ultimate-fallback',
                note: 'Ultimate fallback from message handler catch'
              }
            });
          });

        return true; // async response
      }

      return false;
    });

    console.log('👂 [content-script] Message listener set up');
  }
}

// Initialize content script
const contentScript = new ContentScript();

// Export for testing
if (typeof module !== 'undefined' && module.exports) {
  module.exports = ContentScript;
}
