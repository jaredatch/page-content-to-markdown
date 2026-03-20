// Background script for browser extension
// This script runs in the background and coordinates the extension functionality

console.log('🚀 [background] Background script loaded');

class BackgroundScript {
  constructor() {
    this.selectionState = new Map(); // tabId → { active: boolean }
    this.setupEventListeners();
    this.setupContextMenu();
    this.setupTabCleanup();
  }

  /**
   * Set up event listeners for extension actions and messages
   */
  setupEventListeners() {
    // Handle extension icon click
    chrome.action.onClicked.addListener((tab) => {
      console.log('🖱️ [background] Extension icon clicked, tab:', tab.id);
      this.handleActionClick(tab);
    });

    // Handle messages from popup or content scripts
    chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
      console.log('📨 [background] Received message:', request);

      if (request.action === 'extractAndCopy') {
        this.handleExtractAndCopy(sendResponse);
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

      if (request.action === 'selectionComplete') {
        this.handleSelectionComplete(request.result, sender);
        return false;
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
   * Handle extension icon click - extract content and copy to clipboard
   * @param {object} tab - The active tab object
   */
  async handleActionClick(tab) {
    try {
      console.log('🔄 [background] Starting content extraction for tab:', tab.id);

      // Extract content from the active tab
      const extractResult = await this.extractContentFromActiveTab();

      if (!extractResult.success) {
        console.error('🚨 [background] Failed to extract content:', extractResult.error);
        this.showNotification('Error', extractResult.error, 'error');
        return;
      }

      // Copy to clipboard
      const copyResult = await this.copyToClipboard(extractResult.markdown);

      if (copyResult.success) {
        console.log('✅ [background] Content successfully copied to clipboard');
        const pageTitle = (extractResult.metadata && extractResult.metadata.title) || 'page';
        this.showNotification(
          'Success',
          `Page "${pageTitle}" copied as markdown!`,
          'success'
        );
      } else {
        console.error('🚨 [background] Failed to copy to clipboard:', copyResult.error);
        this.showNotification('Error', copyResult.error, 'error');
      }

    } catch (error) {
      console.error('🚨 [background] Unexpected error in handleActionClick:', error);
      this.showNotification('Error', 'Unexpected error occurred', 'error');
    }
  }

  /**
   * Handle extractAndCopy message from popup
   * @param {function} sendResponse - Response callback
   */
  async handleExtractAndCopy(sendResponse) {
    try {
      console.log('🔄 [background] Handling extractAndCopy message');

      // Extract content
      const extractResult = await this.extractContentFromActiveTab();
      if (!extractResult.success) {
        sendResponse(extractResult);
        return;
      }

      // Copy to clipboard
      const copyResult = await this.copyToClipboard(extractResult.markdown);
      sendResponse(copyResult);

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
   * Handle getSelectionState message from popup
   */
  async handleGetSelectionState(sendResponse) {
    try {
      const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
      if (tabs.length === 0) {
        sendResponse({ active: false });
        return;
      }

      const tabId = tabs[0].id;
      const state = this.selectionState.get(tabId);
      sendResponse({ active: !!(state && state.active) });
    } catch (error) {
      sendResponse({ active: false });
    }
  }

  /**
   * Handle selectionComplete message from content script
   */
  async handleSelectionComplete(result, sender) {
    const tabId = sender.tab ? sender.tab.id : null;
    if (tabId) {
      this.selectionState.delete(tabId);
    }

    if (result && result.success && result.markdown) {
      const copyResult = await this.copyToClipboard(result.markdown);
      if (copyResult.success) {
        const count = result.extractionInfo ? result.extractionInfo.note : '';
        this.showNotification('Success', `Selected content copied as markdown! ${count}`, 'success');
      } else {
        this.showNotification('Error', copyResult.error, 'error');
      }
    } else {
      this.showNotification('Error', (result && result.error) || 'Selection conversion failed', 'error');
    }
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
        const copyResult = await this.copyToClipboard(response.markdown);
        if (copyResult.success) {
          this.showNotification('Success', 'Selection copied as markdown!', 'success');
        } else {
          this.showNotification('Error', copyResult.error, 'error');
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
      console.log(`📋 [background] Active tab found: ${activeTab.url}`);

      // Send message to content script to extract content
      console.log('📤 [background] Sending extraction request to content script');

      const response = await chrome.tabs.sendMessage(activeTab.id, {
        action: 'extractContent'
      });

      console.log('📨 [background] Received response from content script:', response);

      return response;

    } catch (error) {
      console.error('🚨 [background] Error extracting content from active tab:', error);
      return {
        success: false,
        error: `Failed to communicate with content script: ${error.message}`
      };
    }
  }

  /**
   * Copy text to clipboard using the clipboard API
   * @param {string} text - Text to copy to clipboard
   * @returns {Promise<object>} Result object with success status
   */
  async copyToClipboard(text) {
    try {
      if (!text || text.trim() === '') {
        return {
          success: false,
          error: 'No content to copy'
        };
      }

      console.log('📋 [background] Copying to clipboard...');

      await navigator.clipboard.writeText(text);

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
   * Show notification to user (for Chrome extensions)
   * @param {string} title - Notification title
   * @param {string} message - Notification message
   * @param {string} type - Notification type (success, error, info)
   */
  showNotification(title, message, type = 'info') {
    // For now, just log the notification
    // In a full implementation, you might use chrome.notifications API
    const icon = type === 'success' ? '✅' : type === 'error' ? '🚨' : 'ℹ️';
    console.log(`${icon} [background] ${title}: ${message}`);

    // If notifications permission is available, create a notification
    if (chrome.notifications) {
      chrome.notifications.create({
        type: 'basic',
        iconUrl: 'icons/icon48.png',
        title: title,
        message: message
      });
    }
  }
}

// Initialize background script
const backgroundScript = new BackgroundScript();

// Export for testing
if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    extractContentFromActiveTab: () => backgroundScript.extractContentFromActiveTab(),
    copyToClipboard: (text) => backgroundScript.copyToClipboard(text),
    handleActionClick: (tab) => backgroundScript.handleActionClick(tab),
    handleExtractAndCopy: (sendResponse) => backgroundScript.handleExtractAndCopy(sendResponse),
    getSelectionState: () => backgroundScript.selectionState,
    toggleSelectionMode: () => backgroundScript.toggleSelectionMode()
  };
}
