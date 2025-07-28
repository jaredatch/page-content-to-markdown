// Background script for browser extension
// This script runs in the background and coordinates the extension functionality

console.log('🚀 [background] Background script loaded');

class BackgroundScript {
  constructor() {
    this.setupEventListeners();
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

      return false; // Let other handlers process the message
    });

    console.log('👂 [background] Event listeners set up');
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
        this.showNotification(
          'Success', 
          `Page "${extractResult.metadata.title}" copied as markdown!`,
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
    handleExtractAndCopy: (sendResponse) => backgroundScript.handleExtractAndCopy(sendResponse)
  };
} 