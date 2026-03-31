// Content script for browser extension
// Runs in the context of web pages — uses Turndown (via MarkdownConverter) as primary,
// with SimpleUniversalExtractor as fallback

console.log('🚀 [content-script] Content script loaded');

const MarkdownConverter = require('../utils/markdown-converter');
const SimpleUniversalExtractor = require('../utils/simple-universal-extractor');
const ElementPicker = require('./element-picker');
const SiteRegistry = require('../utils/site-registry');

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

    // Apply formatting preferences if provided
    this._applyFormattingOptions(options);

    // Size guard: skip full conversion for extremely large pages
    const MAX_ELEMENTS = 50000;
    const elementCount = document.body ? document.body.querySelectorAll('*').length : 0;
    if (elementCount > MAX_ELEMENTS) {
      console.warn(`⚠️ [content-script] Page has ${elementCount} elements (>${MAX_ELEMENTS}), using text extraction`);
      try {
        const extractionResult = await this.fallbackExtractor.extractContent();
        const markdown = includeMetadata
          ? this.addMetadataHeader(extractionResult.markdown, metadata)
          : extractionResult.markdown;
        return {
          success: true,
          markdown,
          metadata,
          extractionInfo: {
            method: extractionResult.method,
            note: `Page too large (${elementCount} elements) — used text extraction`
          }
        };
      } catch (e) {
        // Continue to normal path if fallback fails
      }
    }

    try {
      console.log('🔄 [content-script] Starting page conversion (Turndown primary)');

      // Primary path: pass live DOM directly to MarkdownConverter (no serialization)
      let markdown = '';
      let method = 'turndown';

      if (document.body && typeof this.converter.convertFromDOM === 'function') {
        markdown = this.converter.convertFromDOM(document.body);
        method = 'turndown-dom';
      }

      // Fallback to string path if DOM-direct returned empty
      if (!markdown || markdown.trim().length <= 50) {
        console.log('⚠️ [content-script] DOM-direct path returned insufficient output, trying string path');
        const html = document.documentElement.outerHTML;
        markdown = this.converter.convertToMarkdown(html);
        method = 'turndown';
      }

      if (markdown && markdown.trim().length > 50) {
        console.log(`✅ [content-script] Turndown conversion succeeded (${method})`);
        const result = includeMetadata ? this.addMetadataHeader(markdown, metadata) : markdown;
        return {
          success: true,
          markdown: result,
          metadata,
          extractionInfo: {
            method,
            note: method === 'turndown-dom'
              ? 'DOM-direct HTML-to-Markdown conversion via Turndown'
              : 'Primary HTML-to-Markdown conversion via Turndown'
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
   * Apply formatting preferences to the converter if present in options.
   */
  _applyFormattingOptions(options) {
    if (!options) return;
    const formattingKeys = ['headingStyle', 'bulletListMarker', 'codeBlockStyle', 'linkStyle'];
    const formatting = {};
    for (const key of formattingKeys) {
      if (options[key] !== undefined) formatting[key] = options[key];
    }
    if (Object.keys(formatting).length > 0) {
      this.converter.applyFormattingOptions(formatting);
    }
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
   * Extract site-specific content using the site extractor registry.
   * Falls back to generic convertPageToMarkdown on failure.
   */
  async extractSiteContent(siteId, contentType, options = {}) {
    const metadata = this.getPageMetadata();
    const includeMetadata = options.includeMetadata !== false;

    // Apply formatting preferences if provided
    this._applyFormattingOptions(options);

    try {
      const site = SiteRegistry.getById(siteId);
      if (!site) throw new Error(`Unknown site: ${siteId}`);

      console.log(`🔧 [content-script] Starting ${site.name} extraction: ${contentType}`);
      const extractor = new site.Extractor();
      const formatter = new site.Formatter();

      const data = extractor.extract(contentType, document, window.location.href);
      if (!data) throw new Error(`Could not extract ${contentType} from this page`);

      let markdown = formatter.format(contentType, data, this.converter);

      if (includeMetadata) {
        markdown = this.addMetadataHeader(markdown, metadata);
      }

      console.log(`✅ [content-script] ${site.name} extraction succeeded: ${contentType}`);
      return {
        success: true,
        markdown,
        metadata,
        extractionInfo: {
          method: `${siteId}-${contentType}`,
          note: `Extracted ${site.name} ${contentType} via site-specific extractor`
        }
      };
    } catch (error) {
      console.warn(`⚠️ [content-script] Site extraction failed for ${siteId}/${contentType}, falling back to generic:`, error.message);
      return this.convertPageToMarkdown(options);
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
      onConfirm: async (selectedElements) => {
        console.log(`🎯 [content-script] Selection confirmed: ${selectedElements.length} element(s)`);
        const result = await this.convertElementsToMarkdown(selectedElements);

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

      if (request.action === 'extractSiteContent') {
        this.extractSiteContent(request.siteId, request.contentType, request.options || {})
          .then(result => sendResponse(result))
          .catch(error => sendResponse({ success: false, error: error.message }));
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
new ContentScript();

// Export for testing
if (typeof module !== 'undefined' && module.exports) {
  module.exports = ContentScript;
}
