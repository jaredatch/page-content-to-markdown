// Content script for browser extension
// Runs in the context of web pages — uses Turndown (via MarkdownConverter) as primary,
// with SimpleUniversalExtractor as fallback

console.log('🚀 [content-script] Content script loaded');

const MarkdownConverter = require('../utils/markdown-converter');
const SimpleUniversalExtractor = require('../utils/simple-universal-extractor');
const ElementPicker = require('./element-picker');
const SiteRegistry = require('../utils/site-registry');
const UrlCleaner = require('../utils/url-cleaner');

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
    // Apply formatting preferences if provided
    this._applyFormattingOptions(options);

    const metadata = this._getMetadata(options);
    const includeMetadata = options.includeMetadata !== false;

    // Size guard: skip full conversion for extremely large pages
    const MAX_ELEMENTS = 50000;
    const elementCount = document.body ? document.body.querySelectorAll('*').length : 0;
    if (elementCount > MAX_ELEMENTS) {
      console.warn(`⚠️ [content-script] Page has ${elementCount} elements (>${MAX_ELEMENTS}), using text extraction`);
      try {
        const extractionResult = await this.fallbackExtractor.extractContent();
        const markdown = includeMetadata
          ? this.addMetadataHeader(extractionResult.markdown, metadata, options.metadataFormat)
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
        const result = includeMetadata ? this.addMetadataHeader(markdown, metadata, options.metadataFormat) : markdown;
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
    const emergencyMarkdown = `**Title:** ${metadata.title}  \n**URL:** ${metadata.url}  \n**Date:** ${this._formatLocalDateTime(metadata.timestamp)}  \n**Method:** Emergency Fallback\n\n---\n\nContent extraction encountered an error. The page was accessible but content could not be extracted.\nError details have been logged to the browser console.`;

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
   * Forwards both Turndown formatting options and extraction-time toggles
   * (tracking strip, link mode, image mode).
   */
  _applyFormattingOptions(options) {
    if (!options) return;
    const passthroughKeys = [
      'headingStyle', 'bulletListMarker', 'codeBlockStyle', 'linkStyle',
      'stripTrackingParams', 'linkMode', 'imageMode'
    ];
    const formatting = {};
    for (const key of passthroughKeys) {
      if (options[key] !== undefined) formatting[key] = options[key];
    }
    if (Object.keys(formatting).length > 0) {
      this.converter.applyFormattingOptions(formatting);
    }
  }

  /**
   * Get page metadata, applying any extraction-time options (e.g. cleaning
   * tracking params from the URL).
   */
  _getMetadata(options) {
    const metadata = this.getPageMetadata();
    if (options && options.stripTrackingParams) {
      metadata.url = UrlCleaner.cleanUrl(metadata.url);
    }
    return metadata;
  }

  /**
   * Fill any options not passed by the caller from chrome.storage.local.
   * Used by paths that aren't invoked through the background's pref-reading
   * pipeline (text selection, element selection from page).
   */
  async _fillOptionsFromStorage(options) {
    const keys = [
      'includeMetadata', 'stripTrackingParams', 'linkMode', 'imageMode',
      'headingStyle', 'bulletListMarker', 'codeBlockStyle', 'linkStyle',
      'metadataFormat'
    ];
    const missing = keys.filter(k => options[k] === undefined);
    if (missing.length === 0) return options;
    try {
      const stored = await chrome.storage.local.get(missing);
      // Caller-passed options take precedence over stored values.
      return { ...stored, ...options };
    } catch (e) {
      return options;
    }
  }

  /**
   * Prepend a metadata header to the converted markdown. Two formats:
   * 'inline' (bold key-value lines) or 'yaml' (frontmatter, compatible
   * with Obsidian, Logseq, Hugo, Jekyll, …). Both emit the same field
   * set (title, url, domain, date) so consumers can grep by key.
   *
   * Inline mode deliberately avoids an H1 title — pages typically already
   * carry their own H1, and site-action formatters emit one too. A bold
   * key-value block sits cleanly above any content H1 instead of
   * competing with it.
   */
  addMetadataHeader(markdown, metadata, format) {
    if (format === 'yaml') {
      return this._buildYamlFrontmatter(metadata) + markdown;
    }
    return this._buildInlineHeader(metadata) + markdown;
  }

  _buildInlineHeader(metadata) {
    // Two-space line endings are markdown hard breaks — keeps each
    // key-value on its own line when the file is rendered. The last
    // line skips them since the blank line + `---` already separate.
    return [
      `**Title:** ${metadata.title || ''}  `,
      `**URL:** ${metadata.url || ''}  `,
      `**Date:** ${this._formatLocalDateTime(metadata.timestamp)}`,
      '',
      '---',
      '',
      ''
    ].join('\n');
  }

  /**
   * Build a YAML frontmatter block from page metadata.
   * Title is double-quoted with backslash and quote escaping; URL/date
   * are emitted unquoted because their values are tame in standard form.
   */
  _buildYamlFrontmatter(metadata) {
    const safeTitle = String(metadata.title || '')
      .replace(/[\r\n]+/g, ' ')
      .replace(/\\/g, '\\\\')
      .replace(/"/g, '\\"');
    return [
      '---',
      `title: "${safeTitle}"`,
      `url: ${metadata.url || ''}`,
      `date: ${this._formatLocalDateTime(metadata.timestamp)}`,
      '---',
      '',
      ''
    ].join('\n');
  }

  /**
   * Format an ISO UTC timestamp as local `YYYY-MM-DD HH:mm`. Local time
   * matches the user's mental model — the alternative (UTC date via
   * timestamp.split('T')[0]) showed the wrong day for evenings west of
   * UTC. Falls back to "now" if the timestamp is missing or invalid.
   */
  _formatLocalDateTime(timestamp) {
    let d = timestamp ? new Date(timestamp) : new Date();
    if (Number.isNaN(d.getTime())) d = new Date();
    const pad = n => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
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
    options = await this._fillOptionsFromStorage(options);
    this._applyFormattingOptions(options);

    const metadata = this._getMetadata(options);
    const includeMetadata = options.includeMetadata !== false;

    try {
      const htmlParts = elements.map(el => el.outerHTML);
      const markdownParts = htmlParts.map(html => this.converter.convertHtmlFragment(html));
      let markdown = markdownParts.join('\n\n---\n\n');

      if (!markdown || markdown.trim().length === 0) {
        // Fallback: extract text content directly
        markdown = elements.map(el => el.textContent.trim()).join('\n\n---\n\n');
      }

      if (includeMetadata) {
        markdown = this.addMetadataHeader(markdown, metadata, options.metadataFormat);
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

    const options = await this._fillOptionsFromStorage({});
    this._applyFormattingOptions(options);

    const metadata = this._getMetadata(options);
    const includeMetadata = options.includeMetadata !== false;

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
        markdown = this.addMetadataHeader(markdown, metadata, options.metadataFormat);
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
   * Extract content for a site action using the site module registry.
   * Falls back to the general convertPageToMarkdown path on failure.
   */
  async extractSiteContent(siteId, contentType, options = {}) {
    // Apply formatting preferences if provided
    this._applyFormattingOptions(options);

    const metadata = this._getMetadata(options);
    const includeMetadata = options.includeMetadata !== false;

    try {
      const site = SiteRegistry.getById(siteId);
      if (!site) throw new Error(`Unknown site: ${siteId}`);

      console.log(`🔧 [content-script] Starting ${site.name} extraction: ${contentType}`);
      const extractor = new site.Extractor();
      const formatter = new site.Formatter();

      const data = extractor.extract(contentType, document, window.location.href);
      if (!data) throw new Error(`Could not extract ${contentType} from this page`);

      let markdown = formatter.format(contentType, data, this.converter);

      // Override metadata.title with a clean, filename-safe title from the
      // formatter. Without this, X tweet pages save as "Riley Brown on X-
      // {280 chars of post text} - 2026-04-29.md" because document.title
      // stuffs the post body into the OG title. Each formatter knows what
      // a sensible title looks like for its content type.
      if (typeof formatter.filenameTitle === 'function') {
        const cleanTitle = formatter.filenameTitle(contentType, data);
        if (cleanTitle) metadata.title = cleanTitle;
      }

      if (includeMetadata) {
        markdown = this.addMetadataHeader(markdown, metadata, options.metadataFormat);
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
      console.warn(`⚠️ [content-script] Site action extraction failed for ${siteId}/${contentType}, falling back to general conversion:`, error.message);
      return this.convertPageToMarkdown(options);
    }
  }

  /**
   * Start element selection mode.
   *
   * Reads outputMode from storage so the picker's "Default: Copy / Save"
   * segmented control reflects the user's preferred default. Flipping it
   * inside the picker is session-local — the popup remains the canonical
   * place to change the persistent pref.
   */
  async startSelectionMode() {
    if (this.elementPicker) {
      this.elementPicker.deactivate();
    }

    let initialOutputMode = 'clipboard';
    try {
      const stored = await chrome.storage.local.get(['outputMode']);
      if (stored && stored.outputMode === 'file') initialOutputMode = 'file';
    } catch (e) {
      // Default to clipboard on storage failure.
    }

    this.elementPicker = new ElementPicker({
      initialOutputMode,
      onCopy: (els) => this._completeSelection(els, 'clipboard'),
      onSave: (els) => this._completeSelection(els, 'file'),
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
   * Convert the user's selection and forward to the background for output
   * dispatch. Returns `{ success }` so the picker can flash the button green
   * on success and stay quiet on failure (background surfaces errors via
   * its own notification path). Picker stays active afterwards — the user
   * can keep refining the selection or fire the other action on the same set.
   */
  async _completeSelection(elements, mode) {
    console.log(`🎯 [content-script] Selection ${mode}: ${elements.length} element(s)`);
    const result = await this.convertElementsToMarkdown(elements);

    if (!result || result.success === false) {
      return { success: false, error: result && result.error };
    }

    result.mode = mode;
    try {
      chrome.runtime.sendMessage({ action: 'selectionComplete', result });
    } catch (e) {
      return { success: false, error: e.message };
    }
    return { success: true };
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
  async startSelectionWithElement() {
    await this.startSelectionMode();

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
        // Clipboard write has two paths:
        //   1. navigator.clipboard.writeText — preferred, but requires document focus
        //      (fails with NotAllowedError when popup is open and page loses focus)
        //   2. document.execCommand('copy') via temp textarea — deprecated but works
        //      without focus; used as fallback for the popup-open case
        const writeViaExecCommand = (text) => {
          const selection = document.getSelection();
          const savedRanges = [];
          if (selection) {
            for (let i = 0; i < selection.rangeCount; i++) {
              savedRanges.push(selection.getRangeAt(i).cloneRange());
            }
          }
          const ta = document.createElement('textarea');
          ta.value = text;
          ta.setAttribute('readonly', '');
          ta.style.cssText = 'position:fixed;top:-1000px;left:-1000px;opacity:0;';
          document.body.appendChild(ta);
          ta.select();
          let ok = false;
          try {
            ok = document.execCommand('copy');
          } catch (e) {
            console.error('🚨 [content] execCommand threw:', e);
          }
          ta.remove();
          if (selection && savedRanges.length) {
            selection.removeAllRanges();
            savedRanges.forEach(r => selection.addRange(r));
          }
          return ok;
        };
        const tryFallback = (primaryErr) => {
          const ok = writeViaExecCommand(request.text);
          if (ok) {
            sendResponse({ success: true, method: 'execCommand' });
          } else {
            const primary = primaryErr
              ? `${primaryErr.name || 'Error'}: ${primaryErr.message}`
              : 'clipboard API unavailable';
            sendResponse({ success: false, error: `${primary}; execCommand fallback also failed` });
          }
        };
        if (navigator.clipboard && typeof navigator.clipboard.writeText === 'function') {
          navigator.clipboard.writeText(request.text)
            .then(() => sendResponse({ success: true, method: 'clipboardApi' }))
            .catch(primaryErr => tryFallback(primaryErr));
        } else {
          tryFallback(null);
        }
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
