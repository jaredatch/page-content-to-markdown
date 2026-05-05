// Background script for browser extension
// This script runs in the background and coordinates the extension functionality

const Preferences = require('../utils/preferences');
const FilenameTemplate = require('../utils/filename-template');
const SiteRegistry = require('../utils/site-registry');

console.log('🚀 [background] Background script loaded');

// Mirrors popup.js — URLs the extension can't extract from (browser chrome,
// extension pages, local files). Used to short-circuit the quick-extract
// keyboard shortcut with a clear notification instead of a cryptic
// tabs.sendMessage error.
const RESTRICTED_URL_PATTERNS = [
  /^chrome:\/\//,
  /^chrome-extension:\/\//,
  /^moz-extension:\/\//,
  /^edge:\/\//,
  /^about:/,
  /^file:\/\//
];

class BackgroundScript {
  constructor() {
    // Fast cache, not source of truth. The MV3 service worker can be evicted
    // mid-selection — when the user's picker is still alive in the page but
    // this Map is gone, getSelectionState would return false and the popup
    // would show the wrong UI. We treat the Map as a hint and confirm via a
    // ping to the active tab's content script when the popup asks.
    this.selectionState = new Map(); // tabId → { active: boolean }
    this.setupEventListeners();
    this.setupContextMenu();
    this.setupTabCleanup();
  }

  /**
   * Set up event listeners for extension actions and messages
   */
  setupEventListeners() {
    // No `chrome.action.onClicked` listener: with `default_popup` declared in
    // manifest.json, the toolbar click opens the popup and `onClicked` never
    // fires. The popup drives extraction via `extractAndCopy` messages.

    // Handle messages from popup or content scripts
    chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
      console.log('📨 [background] Received message:', request && request.action);

      if (request.action === 'extractAndCopy') {
        this.handleExtractAndCopy(sendResponse, request.mode);
        return true; // Indicates async response
      }

      if (request.action === 'startSelectionMode') {
        this.handleStartSelectionMode(sendResponse);
        return true;
      }

      if (request.action === 'cancelSelectionMode') {
        this.handleCancelSelectionMode(sendResponse);
        return true;
      }

      if (request.action === 'getSelectionState') {
        this.handleGetSelectionState(sendResponse);
        return true;
      }

      if (request.action === 'extractSiteContent') {
        this.handleExtractSiteContent(request.siteId, request.contentType, sendResponse, request.mode);
        return true;
      }

      if (request.action === 'probeContentTypes') {
        this.handleProbeContentTypes(request.siteId, sendResponse);
        return true;
      }

      if (request.action === 'selectionComplete') {
        // Async response — picker awaits this so it only flashes "success"
        // after the markdown has actually landed on the clipboard / disk.
        this.handleSelectionComplete(request.result, sender)
          .then(outputResult => sendResponse(outputResult))
          .catch(error => sendResponse({ success: false, error: error.message }));
        return true;
      }

      if (request.action === 'selectionCancelled') {
        this.handleSelectionCancelled(sender);
        return false;
      }

      return false; // Let other handlers process the message
    });

    // Handle keyboard commands
    if (chrome.commands && chrome.commands.onCommand) {
      chrome.commands.onCommand.addListener((command) => {
        console.log('⌨️ [background] Command received:', command);
        if (command === 'toggle-selection-mode') {
          this.toggleSelectionMode();
        } else if (command === 'quick-extract') {
          this.handleQuickExtract();
        }
      });
    }

    console.log('👂 [background] Event listeners set up');
  }

  /**
   * Set up context menu for "Copy selection as Markdown"
   */
  setupContextMenu() {
    if (!chrome.contextMenus) return;

    chrome.runtime.onInstalled.addListener(() => {
      chrome.contextMenus.create({
        id: 'convert-selection',
        title: 'Copy selection as Markdown',
        contexts: ['selection']
      });
      chrome.contextMenus.create({
        id: 'select-element',
        title: 'Select element for Markdown',
        contexts: ['page', 'image', 'link']
      });
      console.log('📋 [background] Context menus created');
    });

    chrome.contextMenus.onClicked.addListener((info, tab) => {
      if (info.menuItemId === 'convert-selection') {
        this.handleConvertTextSelection(tab);
      }
      if (info.menuItemId === 'select-element') {
        this.handleSelectElement(tab);
      }
    });
  }

  /**
   * Set up tab lifecycle cleanup for selection state
   */
  setupTabCleanup() {
    if (chrome.tabs.onRemoved) {
      chrome.tabs.onRemoved.addListener((tabId) => {
        this.selectionState.delete(tabId);
      });
    }

    if (chrome.tabs.onUpdated) {
      chrome.tabs.onUpdated.addListener((tabId, changeInfo) => {
        // Clear selection state on navigation
        if (changeInfo.status === 'loading') {
          this.selectionState.delete(tabId);
        }
      });
    }
  }

  /**
   * Handle extractAndCopy message from popup
   * @param {function} sendResponse - Response callback
   * @param {string} [mode] - Optional output mode override ('clipboard' | 'file'). Falls through to outputMode pref when omitted.
   */
  async handleExtractAndCopy(sendResponse, mode) {
    try {
      console.log('🔄 [background] Handling extractAndCopy message');

      const extractResult = await this.extractContentFromActiveTab();
      if (!extractResult.success) {
        sendResponse(extractResult);
        return;
      }

      const result = await this.dispatchOutput(
        extractResult.markdown,
        extractResult.metadata,
        mode,
        extractResult.tabId
      );
      sendResponse(result);

    } catch (error) {
      console.error('🚨 [background] Error in handleExtractAndCopy:', error);
      sendResponse({
        success: false,
        error: `Unexpected error: ${error.message}`
      });
    }
  }

  /**
   * Handle startSelectionMode message from popup
   */
  async handleStartSelectionMode(sendResponse) {
    try {
      const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
      if (tabs.length === 0) {
        sendResponse({ success: false, error: 'No active tab found' });
        return;
      }

      const tabId = tabs[0].id;
      await chrome.tabs.sendMessage(tabId, { action: 'startSelectionMode' });
      this.selectionState.set(tabId, { active: true });
      console.log(`🎯 [background] Selection mode started for tab ${tabId}`);
      sendResponse({ success: true });
    } catch (error) {
      console.error('🚨 [background] Error starting selection mode:', error);
      sendResponse({ success: false, error: error.message });
    }
  }

  /**
   * Handle cancelSelectionMode message from popup
   */
  async handleCancelSelectionMode(sendResponse) {
    try {
      const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
      if (tabs.length === 0) {
        sendResponse({ success: false, error: 'No active tab found' });
        return;
      }

      const tabId = tabs[0].id;
      await chrome.tabs.sendMessage(tabId, { action: 'cancelSelectionMode' });
      this.selectionState.delete(tabId);
      console.log(`🎯 [background] Selection mode cancelled for tab ${tabId}`);
      sendResponse({ success: true });
    } catch (error) {
      console.error('🚨 [background] Error cancelling selection mode:', error);
      sendResponse({ success: false, error: error.message });
    }
  }

  /**
   * Handle getSelectionState message from popup. Confirms picker liveness by
   * pinging the content script — the in-memory Map can desync from reality
   * after a service-worker eviction or content-script reload, and the picker
   * itself is the only authoritative source for "is the overlay on screen?".
   * Falls back to the cached Map if the ping fails (page not injectable, no
   * content script yet on a freshly loaded tab, etc.).
   */
  async handleGetSelectionState(sendResponse) {
    try {
      const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
      if (tabs.length === 0) {
        sendResponse({ active: false });
        return;
      }

      const tabId = tabs[0].id;
      let active = false;
      try {
        const status = await chrome.tabs.sendMessage(tabId, { action: 'getPickerStatus' });
        if (status && typeof status.active === 'boolean') {
          active = status.active;
          // Refresh cache so toggle-selection-mode and other in-SW paths
          // don't fight the picker's truth.
          if (active) {
            this.selectionState.set(tabId, { active: true });
          } else {
            this.selectionState.delete(tabId);
          }
        } else {
          // Ping returned nothing — fall back to cache.
          const cached = this.selectionState.get(tabId);
          active = !!(cached && cached.active);
        }
      } catch (e) {
        // Content script not reachable (restricted page, not yet injected,
        // tab navigated). Defer to the cache; if it's empty we report
        // inactive, which is the safe default.
        const cached = this.selectionState.get(tabId);
        active = !!(cached && cached.active);
      }
      sendResponse({ active });
    } catch (error) {
      sendResponse({ active: false });
    }
  }

  /**
   * Handle selectionComplete message from content script.
   *
   * The picker stays active across copy/save now (each action keeps the
   * selection so the user can fire the other one on the same set), so we
   * no longer clear selectionState here — only the picker's own X/Esc
   * (selectionCancelled) or tab navigation flips it off.
   *
   * `result.mode` ('clipboard' | 'file') comes from whichever button the
   * user clicked, mirroring the popup pattern: we pass it as the dispatch
   * override so a per-action click never rewrites prefs.outputMode.
   */
  async handleSelectionComplete(result, sender) {
    const tabId = sender && sender.tab ? sender.tab.id : null;
    if (result && result.success && result.markdown) {
      const outputResult = await this.dispatchOutput(result.markdown, result.metadata, result.mode, tabId);
      if (outputResult.success) {
        const count = result.extractionInfo ? result.extractionInfo.note : '';
        const verb = outputResult.method === 'file' ? 'saved' : 'copied';
        this.showNotification('Success', `Selected content ${verb} as markdown! ${count}`, 'success');
      } else {
        this.showNotification('Error', outputResult.error, 'error');
      }
      return outputResult;
    }
    const error = (result && result.error) || 'Selection conversion failed';
    this.showNotification('Error', error, 'error');
    return { success: false, error };
  }

  /**
   * Handle selectionCancelled message from content script
   */
  handleSelectionCancelled(sender) {
    const tabId = sender.tab ? sender.tab.id : null;
    if (tabId) {
      this.selectionState.delete(tabId);
    }
    console.log('🎯 [background] Selection cancelled by user');
  }

  /**
   * Toggle selection mode for the active tab (keyboard shortcut)
   */
  async toggleSelectionMode() {
    try {
      const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
      if (tabs.length === 0) return;

      const tabId = tabs[0].id;
      const state = this.selectionState.get(tabId);

      if (state && state.active) {
        await chrome.tabs.sendMessage(tabId, { action: 'cancelSelectionMode' });
        this.selectionState.delete(tabId);
        console.log(`🎯 [background] Selection mode toggled OFF for tab ${tabId}`);
      } else {
        await chrome.tabs.sendMessage(tabId, { action: 'startSelectionMode' });
        this.selectionState.set(tabId, { active: true });
        console.log(`🎯 [background] Selection mode toggled ON for tab ${tabId}`);
      }
    } catch (error) {
      console.error('🚨 [background] Error toggling selection mode:', error);
    }
  }

  /**
   * Handle context menu "Copy selection as Markdown"
   */
  async handleConvertTextSelection(tab) {
    try {
      const response = await chrome.tabs.sendMessage(tab.id, {
        action: 'convertTextSelection'
      });

      if (response && response.success && response.markdown) {
        const outputResult = await this.dispatchOutput(response.markdown, response.metadata, undefined, tab.id);
        if (outputResult.success) {
          const verb = outputResult.method === 'file' ? 'saved' : 'copied';
          this.showNotification('Success', `Selection ${verb} as markdown!`, 'success');
        } else {
          this.showNotification('Error', outputResult.error, 'error');
        }
      } else {
        this.showNotification('Error', (response && response.error) || 'Failed to convert selection', 'error');
      }
    } catch (error) {
      console.error('🚨 [background] Error converting text selection:', error);
      this.showNotification('Error', 'Failed to convert selection', 'error');
    }
  }

  /**
   * Handle context menu "Select element for Markdown"
   * Starts selection mode with the right-clicked element pre-selected.
   */
  async handleSelectElement(tab) {
    try {
      await chrome.tabs.sendMessage(tab.id, { action: 'startSelectionWithElement' });
      this.selectionState.set(tab.id, { active: true });
      console.log(`🎯 [background] Selection mode started with element for tab ${tab.id}`);
    } catch (error) {
      console.error('🚨 [background] Error starting selection with element:', error);
      this.showNotification('Error', 'Failed to start element selection', 'error');
    }
  }

  /**
   * Handle site-specific content extraction
   * @param {string} siteId - Site module id
   * @param {string} contentType - Content type id within the site module
   * @param {function} sendResponse - Response callback
   * @param {string} [mode] - Optional output mode override ('clipboard' | 'file'). Falls through to outputMode pref when omitted.
   */
  async handleExtractSiteContent(siteId, contentType, sendResponse, mode) {
    try {
      console.log(`🔧 [background] Extracting site content: ${siteId}/${contentType}`);

      const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
      if (tabs.length === 0) {
        sendResponse({ success: false, error: 'No active tab found' });
        return;
      }

      const tabId = tabs[0].id;
      const prefs = await Preferences.get();

      const response = await chrome.tabs.sendMessage(tabId, {
        action: 'extractSiteContent',
        siteId,
        contentType,
        options: {
          includeMetadata: prefs.includeMetadata,
          headingStyle: prefs.headingStyle,
          bulletListMarker: prefs.bulletListMarker,
          codeBlockStyle: prefs.codeBlockStyle,
          linkStyle: prefs.linkStyle,
          stripTrackingParams: prefs.stripTrackingParams,
          linkMode: prefs.linkMode,
          imageMode: prefs.imageMode,
          metadataFormat: prefs.metadataFormat
        }
      });

      if (!response || !response.success) {
        sendResponse(response || { success: false, error: 'Site extraction failed' });
        return;
      }

      const result = await this.dispatchOutput(response.markdown, response.metadata, mode, tabId);
      if (result.success) {
        const verb = result.method === 'file' ? 'saved' : 'copied';
        this.showNotification('Success', `${contentType} ${verb} as markdown`, 'success');
      } else {
        this.showNotification('Error', result.error || 'Output dispatch failed', 'error');
      }
      sendResponse(result);
    } catch (error) {
      console.error(`🚨 [background] Error extracting site content (${siteId}/${contentType}):`, error);
      sendResponse({ success: false, error: error.message });
    }
  }

  /**
   * Quick-extract keyboard command: resolve the right action for the current
   * tab and fire it without UI. Mirrors what would happen if the user opened
   * the popup and clicked their preferred default button — uses URL detection
   * + DOM probe + lastUsedPerSite memory to pick the smartest content type,
   * then dispatches via the existing extract handlers using the outputMode
   * preference (Copy vs Save). User feedback is via system notifications.
   */
  async handleQuickExtract() {
    try {
      const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
      if (tabs.length === 0) {
        this.showNotification('No active tab', 'No tab in focus to extract from', 'error');
        return;
      }
      const tab = tabs[0];
      const url = tab.url || '';

      if (RESTRICTED_URL_PATTERNS.some(p => p.test(url))) {
        this.showNotification("Can't extract", "This page can't be extracted", 'error');
        return;
      }

      const prefs = await Preferences.get();
      const mode = prefs.outputMode === 'file' ? 'file' : 'clipboard';

      const site = SiteRegistry.detect(url);
      const applicable = site ? SiteRegistry.applicableContentTypes(site, url) : [];

      let resolvedSiteId = null;
      let resolvedContentType = null;

      if (site && applicable.length > 0) {
        // DOM probe — same one the popup uses. Filters rows on URLs where
        // multiple URL-applicable content types exist but only some are
        // actually present (e.g. /status/ with no thread → drops Thread).
        let filtered = applicable;
        try {
          const probe = await chrome.tabs.sendMessage(tab.id, {
            action: 'probeContentTypes',
            siteId: site.id
          });
          if (probe && probe.success && probe.available) {
            const anyTrue = Object.values(probe.available).some(Boolean);
            if (anyTrue) {
              filtered = applicable.filter(ct => probe.available[ct.id] === true);
            }
          }
        } catch (probeError) {
          console.log('⌨️ [background] Quick-extract probe failed, using URL-applicable:', probeError.message);
        }

        if (filtered.length > 0) {
          // Prefer last-used content type when it's still applicable. Falls
          // back to the first applicable so a stale memory entry can't
          // strand the user on Page content unnecessarily.
          const lastUsed = (prefs.lastUsedPerSite || {})[site.id];
          const useLastUsed = lastUsed && filtered.some(ct => ct.id === lastUsed);
          resolvedSiteId = site.id;
          resolvedContentType = useLastUsed ? lastUsed : filtered[0].id;
        }
      }

      // handleExtractSiteContent already notifies on success (line shows
      // contentType saved/copied). Our callback only handles the failure
      // path so the user gets feedback either way.
      const onSiteResult = (result) => {
        if (!result || !result.success) {
          this.showNotification('Quick-extract failed', (result && result.error) || 'Extract failed', 'error');
        }
      };

      // handleExtractAndCopy doesn't notify on its own — we own both paths.
      const onPageResult = (result) => {
        if (result && result.success) {
          const verb = (result.method === 'file') ? 'saved' : 'copied';
          this.showNotification('Success', `Page content ${verb} as markdown`, 'success');
        } else {
          this.showNotification('Quick-extract failed', (result && result.error) || 'Extract failed', 'error');
        }
      };

      if (resolvedSiteId && resolvedContentType) {
        console.log(`⌨️ [background] Quick-extract: ${resolvedSiteId}/${resolvedContentType} → ${mode}`);
        await this.handleExtractSiteContent(resolvedSiteId, resolvedContentType, onSiteResult, mode);
      } else {
        console.log(`⌨️ [background] Quick-extract: page content → ${mode}`);
        await this.handleExtractAndCopy(onPageResult, mode);
      }
    } catch (error) {
      console.error('🚨 [background] Error in handleQuickExtract:', error);
      this.showNotification('Error', `Quick-extract failed: ${error.message}`, 'error');
    }
  }

  /**
   * Relay a content-type DOM probe to the active tab's content script. Used by
   * the popup to filter rows on URLs where multiple content types match the
   * URL pattern (e.g. /status/ on X) but only some apply in the current DOM.
   * Returns `{ success: true, available: { 'single-tweet': bool, ... } | null }`.
   * `null` = the site module doesn't expose a probe → popup falls back to URL-applicable rows.
   * @param {string} siteId
   * @param {function} sendResponse
   */
  async handleProbeContentTypes(siteId, sendResponse) {
    try {
      const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
      if (tabs.length === 0) {
        console.warn('🔍 [background] probeContentTypes: no active tab');
        sendResponse({ success: false, error: 'No active tab' });
        return;
      }
      console.log(`🔍 [background] Relaying probe to tab ${tabs[0].id} for siteId=${siteId}`);
      const response = await chrome.tabs.sendMessage(tabs[0].id, {
        action: 'probeContentTypes',
        siteId
      });
      console.log('🔍 [background] Probe response from content script:', response);
      sendResponse(response || { success: true, available: null });
    } catch (error) {
      console.warn('🔍 [background] probeContentTypes failed:', error.message);
      sendResponse({ success: false, error: error.message });
    }
  }

  /**
   * Extract content from the currently active tab
   * @returns {Promise<object>} Result object with success status and content/error
   */
  async extractContentFromActiveTab() {
    try {
      console.log('🔍 [background] Finding active tab');

      // Get the active tab
      const tabs = await chrome.tabs.query({ active: true, currentWindow: true });

      if (tabs.length === 0) {
        return {
          success: false,
          error: 'No active tab found'
        };
      }

      const activeTab = tabs[0];
      const tabId = activeTab.id;
      console.log(`📋 [background] Active tab found: ${activeTab.url}`);

      // Read preferences to pass includeMetadata option
      const prefs = await Preferences.get();

      // Send message to content script to extract content
      console.log('📤 [background] Sending extraction request to content script');

      const response = await chrome.tabs.sendMessage(tabId, {
        action: 'extractContent',
        options: {
          includeMetadata: prefs.includeMetadata,
          headingStyle: prefs.headingStyle,
          bulletListMarker: prefs.bulletListMarker,
          codeBlockStyle: prefs.codeBlockStyle,
          linkStyle: prefs.linkStyle,
          stripTrackingParams: prefs.stripTrackingParams,
          linkMode: prefs.linkMode,
          imageMode: prefs.imageMode,
          metadataFormat: prefs.metadataFormat
        }
      });

      console.log(
        '📨 [background] Received response from content script: success=',
        response && response.success,
        'len=',
        (response && response.markdown && response.markdown.length) || 0
      );

      // Bind the response to the tab it came from. Downstream dispatch uses
      // this tabId so a tab switch between extract and dispatch can't make us
      // copy Tab A's content into Tab B's clipboard or save Tab B's filename.
      return { ...response, tabId };

    } catch (error) {
      console.error('🚨 [background] Error extracting content from active tab:', error);
      return {
        success: false,
        error: `Failed to communicate with content script: ${error.message}`
      };
    }
  }

  /**
   * Copy text to clipboard using the clipboard API. The fallback path needs
   * a content script to delegate to, so callers must pass the originating
   * tabId — re-querying for the active tab here would silently retarget if
   * the user switched tabs between extract and dispatch.
   * @param {string} text - Text to copy to clipboard
   * @param {number} [tabId] - Tab to delegate clipboard write to when the SW path fails
   * @returns {Promise<object>} Result object with success status
   */
  async copyToClipboard(text, tabId) {
    try {
      if (!text || text.trim() === '') {
        return {
          success: false,
          error: 'No content to copy'
        };
      }

      console.log('📋 [background] Copying to clipboard...');

      try {
        if (!navigator.clipboard) throw new Error('Clipboard API not available');
        await navigator.clipboard.writeText(text);
      } catch (clipboardError) {
        // Fallback: ask content script to write to clipboard (needed in Firefox service worker)
        console.log('📋 [background] SW clipboard failed, trying content script fallback. SW error:', clipboardError && clipboardError.message);
        if (!tabId) {
          throw new Error(`SW clipboard failed (${clipboardError.message}); no source tab available for content-script fallback`);
        }

        let response;
        try {
          response = await chrome.tabs.sendMessage(tabId, {
            action: 'writeToClipboard',
            text
          });
        } catch (msgError) {
          throw new Error(`SW clipboard failed (${clipboardError.message}); content-script message failed (${msgError.message}) — is the page injectable?`);
        }

        if (!response) {
          throw new Error(`SW clipboard failed (${clipboardError.message}); content script returned no response (page may not have content script injected)`);
        }
        if (!response.success) {
          console.error('🚨 [background] Content-script fallback failed. diag=', response.diag, 'errorName=', response.errorName);
          throw new Error(`SW: ${clipboardError.message} | CS: ${response.error}`);
        }
      }

      console.log('✅ [background] Successfully copied to clipboard');

      return {
        success: true,
        message: 'Content copied to clipboard'
      };

    } catch (error) {
      console.error('🚨 [background] Error copying to clipboard:', error);
      return {
        success: false,
        error: `Failed to copy to clipboard: ${error.message}`
      };
    }
  }

  /**
   * Generate a sanitized filename from page metadata using the user's
   * configured template + style.
   */
  generateFilename(metadata, prefs) {
    return FilenameTemplate.formatFilename(
      prefs.filenameTemplate,
      prefs.filenameStyle,
      {
        title: metadata && metadata.title,
        url: metadata && metadata.url,
        date: new Date()
      }
    );
  }

  /**
   * Save markdown as a file download.
   * Delegates to content script which has access to Blob/URL.createObjectURL.
   * Caller must pass the originating tabId so a tab switch between extract
   * and dispatch can't redirect the download to a different page's context.
   */
  async saveAsFile(markdown, filename, tabId) {
    try {
      if (!tabId) {
        return { success: false, error: 'No source tab available for file save' };
      }

      const response = await chrome.tabs.sendMessage(tabId, {
        action: 'saveAsFile',
        markdown,
        filename
      });

      if (response && response.success) {
        return { success: true, message: 'File saved', method: 'file' };
      }

      return { success: false, error: (response && response.error) || 'Failed to save file' };
    } catch (error) {
      console.error('🚨 [background] Error saving file:', error);
      return { success: false, error: `Failed to save file: ${error.message}` };
    }
  }

  /**
   * Dispatch output based on user preferences (clipboard or file).
   * @param {string} markdown - Markdown content to output
   * @param {object} metadata - Metadata object (used for filename generation)
   * @param {string} [modeOverride] - Optional explicit mode ('clipboard' | 'file'). When provided, takes precedence over the outputMode preference. Used by the popup to make Copy/Save explicit per click without rewriting the user's preferred default.
   * @param {number} [tabId] - Originating tab for the markdown — threaded into clipboard fallback / file save so a tab switch mid-dispatch can't retarget output to the wrong tab.
   */
  async dispatchOutput(markdown, metadata, modeOverride, tabId) {
    const prefs = await Preferences.get();
    const mode = modeOverride || prefs.outputMode;

    if (mode === 'file') {
      const filename = this.generateFilename(metadata, prefs);
      return this.saveAsFile(markdown, filename, tabId);
    }

    const result = await this.copyToClipboard(markdown, tabId);
    return { ...result, method: 'clipboard' };
  }

  /**
   * Show notification to user. Logs always; fires a system notification when
   * `chrome.notifications` is available (the `notifications` permission is
   * declared in manifest, but the API may still throw if the user has muted
   * the channel or on platforms that haven't loaded the namespace).
   * @param {string} title - Notification title
   * @param {string} message - Notification message
   * @param {string} type - Notification type (success, error, info)
   */
  showNotification(title, message, type = 'info') {
    const icon = type === 'success' ? '✅' : type === 'error' ? '🚨' : 'ℹ️';
    console.log(`${icon} [background] ${title}: ${message}`);

    if (!chrome.notifications || typeof chrome.notifications.create !== 'function') return;

    const handleError = (err) => {
      console.warn('🔔 [background] notifications.create failed:', err && err.message);
    };

    try {
      // Chrome MV3 / Firefox both accept a callback; Firefox also returns a
      // Promise. Cover both so a thrown rejection or chrome.runtime.lastError
      // doesn't crash the SW.
      const ret = chrome.notifications.create(
        {
          type: 'basic',
          iconUrl: 'icons/icon48.png',
          title: title,
          message: message
        },
        () => {
          if (chrome.runtime && chrome.runtime.lastError) {
            handleError(chrome.runtime.lastError);
          }
        }
      );
      if (ret && typeof ret.then === 'function') {
        ret.catch(handleError);
      }
    } catch (err) {
      handleError(err);
    }
  }
}

// Initialize background script
const backgroundScript = new BackgroundScript();

// Export for testing
if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    extractContentFromActiveTab: () => backgroundScript.extractContentFromActiveTab(),
    copyToClipboard: (text, tabId) => backgroundScript.copyToClipboard(text, tabId),
    handleExtractAndCopy: (sendResponse) => backgroundScript.handleExtractAndCopy(sendResponse),
    getSelectionState: () => backgroundScript.selectionState,
    toggleSelectionMode: () => backgroundScript.toggleSelectionMode(),
    generateFilename: (metadata, prefs) => backgroundScript.generateFilename(metadata, prefs),
    saveAsFile: (markdown, filename, tabId) => backgroundScript.saveAsFile(markdown, filename, tabId),
    dispatchOutput: (markdown, metadata, mode, tabId) => backgroundScript.dispatchOutput(markdown, metadata, mode, tabId)
  };
}
