// Content script for browser extension
// Runs in the context of web pages — uses Turndown (via MarkdownConverter) as primary,
// with SimpleUniversalExtractor as fallback

console.log('🚀 [content-script] Content script loaded');

const MarkdownConverter = require('../utils/markdown-converter');
const SimpleUniversalExtractor = require('../utils/simple-universal-extractor');
const ElementPicker = require('./element-picker');

class ContentScript {
  constructor() {
    this.converter = new MarkdownConverter();
    this.fallbackExtractor = new SimpleUniversalExtractor();
    this.elementPicker = null;
    this.lastRightClickedElement = null;
    this.setupMessageListener();
    this.setupContextMenuTracker();
  }

  /**
   * Convert the current page to markdown.
   * Primary: Turndown-based HTML→Markdown conversion.
   * Fallback: SimpleUniversalExtractor text dump.
   * Emergency: Basic error markdown with page title/URL.
   */
  async convertPageToMarkdown(options = {}) {
    const metadata = this.getPageMetadata();
    const includeMetadata = options.includeMetadata !== false;

    try {
      console.log('🔄 [content-script] Starting page conversion (Turndown primary)');

      // Primary path: pass full page HTML through MarkdownConverter
      const html = document.documentElement.outerHTML;
      const markdown = this.converter.convertToMarkdown(html);

      if (markdown && markdown.trim().length > 50) {
        console.log('✅ [content-script] Turndown conversion succeeded');
        const result = includeMetadata ? this.addMetadataHeader(markdown, metadata) : markdown;
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
   * Convert user-selected elements to markdown.
   */
  async convertElementsToMarkdown(elements, options = {}) {
    const metadata = this.getPageMetadata();
    let includeMetadata = options.includeMetadata;

    // If not explicitly provided, read from storage
    if (includeMetadata === undefined) {
      try {
        const stored = await chrome.storage.local.get(['includeMetadata']);
        includeMetadata = stored.includeMetadata !== false;
      } catch (e) {
        includeMetadata = true;
      }
    }

    try {
      const htmlParts = elements.map(el => el.outerHTML);
      const markdownParts = htmlParts.map(html => this.converter.convertHtmlFragment(html));
      let markdown = markdownParts.join('\n\n---\n\n');

      if (!markdown || markdown.trim().length === 0) {
        // Fallback: extract text content directly
        markdown = elements.map(el => el.textContent.trim()).join('\n\n---\n\n');
      }

      if (includeMetadata) {
        markdown = this.addMetadataHeader(markdown, metadata);
      }

      return {
        success: true,
        markdown,
        metadata,
        extractionInfo: {
          method: 'selective-turndown',
          note: `Converted ${elements.length} selected element(s) via Turndown`
        }
      };
    } catch (error) {
      console.error('🚨 [content-script] Error converting selected elements:', error);
      return {
        success: false,
        error: error.message
      };
    }
  }

  /**
   * Convert the current text selection (from context menu) to markdown.
   */
  async convertTextSelection() {
    const selection = window.getSelection();
    if (!selection || selection.rangeCount === 0 || selection.isCollapsed) {
      return { success: false, error: 'No text selected' };
    }

    const metadata = this.getPageMetadata();

    let includeMetadata = true;
    try {
      const stored = await chrome.storage.local.get(['includeMetadata']);
      includeMetadata = stored.includeMetadata !== false;
    } catch (e) {
      // default true
    }

    try {
      const range = selection.getRangeAt(0);
      const fragment = range.cloneContents();
      const tempDiv = document.createElement('div');
      tempDiv.appendChild(fragment);
      const html = tempDiv.innerHTML;

      let markdown = this.converter.convertHtmlFragment(html);
      if (!markdown || markdown.trim().length === 0) {
        markdown = selection.toString().trim();
      }

      if (includeMetadata) {
        markdown = this.addMetadataHeader(markdown, metadata);
      }

      return {
        success: true,
        markdown,
        metadata,
        extractionInfo: {
          method: 'text-selection',
          note: 'Converted text selection via Turndown'
        }
      };
    } catch (error) {
      console.error('🚨 [content-script] Error converting text selection:', error);
      return { success: false, error: error.message };
    }
  }

  /**
   * Start element selection mode.
   */
  startSelectionMode() {
    if (this.elementPicker) {
      this.elementPicker.deactivate();
    }

    this.elementPicker = new ElementPicker({
      onConfirm: (selectedElements) => {
        console.log(`🎯 [content-script] Selection confirmed: ${selectedElements.length} element(s)`);
        const result = this.convertElementsToMarkdown(selectedElements);

        chrome.runtime.sendMessage({
          action: 'selectionComplete',
          result
        });

        this.elementPicker.deactivate();
        this.elementPicker = null;
      },
      onCancel: () => {
        console.log('🎯 [content-script] Selection cancelled');
        chrome.runtime.sendMessage({ action: 'selectionCancelled' });
        this.elementPicker = null;
      }
    });

    this.elementPicker.activate();
    console.log('🎯 [content-script] Selection mode started');
  }

  /**
   * Cancel element selection mode.
   */
  cancelSelectionMode() {
    if (this.elementPicker) {
      this.elementPicker.deactivate();
      this.elementPicker = null;
      console.log('🎯 [content-script] Selection mode cancelled');
    }
  }

  /**
   * Track the last right-clicked element so we can pre-select it
   * when "Select element for Markdown" is chosen from the context menu.
   */
  setupContextMenuTracker() {
    document.addEventListener('contextmenu', (e) => {
      this.lastRightClickedElement = e.target;
    }, true);
  }

  /**
   * Start selection mode with the last right-clicked element pre-selected.
   */
  startSelectionWithElement() {
    this.startSelectionMode();

    if (this.lastRightClickedElement && this.elementPicker) {
      this.elementPicker.preselectElement(this.lastRightClickedElement);
      console.log('🎯 [content-script] Pre-selected right-clicked element');
    }
  }

  /**
   * Set up message listener for communication with background script
   */
  setupMessageListener() {
    chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
      console.log('📨 [content-script] Received message:', request);

      if (request.action === 'extractContent') {
        this.convertPageToMarkdown(request.options || {})
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

      if (request.action === 'startSelectionMode') {
        this.startSelectionMode();
        sendResponse({ success: true });
        return false;
      }

      if (request.action === 'startSelectionWithElement') {
        this.startSelectionWithElement();
        sendResponse({ success: true });
        return false;
      }

      if (request.action === 'cancelSelectionMode') {
        this.cancelSelectionMode();
        sendResponse({ success: true });
        return false;
      }

      if (request.action === 'convertTextSelection') {
        this.convertTextSelection()
          .then(result => sendResponse(result))
          .catch(error => sendResponse({ success: false, error: error.message }));
        return true; // async response
      }

      if (request.action === 'writeToClipboard') {
        navigator.clipboard.writeText(request.text)
          .then(() => sendResponse({ success: true }))
          .catch(error => sendResponse({ success: false, error: error.message }));
        return true; // async response
      }

      if (request.action === 'saveAsFile') {
        try {
          const blob = new Blob([request.markdown], { type: 'text/markdown;charset=utf-8' });
          const url = URL.createObjectURL(blob);
          const a = document.createElement('a');
          a.href = url;
          a.download = request.filename || 'page.md';
          document.body.appendChild(a);
          a.click();
          document.body.removeChild(a);
          URL.revokeObjectURL(url);
          sendResponse({ success: true });
        } catch (error) {
          sendResponse({ success: false, error: error.message });
        }
        return false;
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
