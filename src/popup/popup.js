// Popup script for browser extension
// Handles user interactions in the popup interface

console.log('🚀 [popup] Popup script loaded');

class PopupController {
  constructor() {
    this.elements = {
      extractBtn: document.getElementById('extractBtn'),
      status: document.getElementById('status'),
      progress: document.getElementById('progress'),
      statusIcon: document.querySelector('.status-icon'),
      statusMessage: document.querySelector('.status-message'),
      progressText: document.querySelector('.progress-text')
    };

    this.init();
  }

  /**
   * Initialize the popup
   */
  init() {
    console.log('🔧 [popup] Initializing popup controller');
    this.setupEventListeners();
    this.checkCurrentTab();
  }

  /**
   * Set up event listeners
   */
  setupEventListeners() {
    this.elements.extractBtn.addEventListener('click', () => {
      console.log('🖱️ [popup] Extract button clicked');
      this.handleExtractClick();
    });

    // Handle keyboard shortcuts
    document.addEventListener('keydown', (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
        e.preventDefault();
        this.handleExtractClick();
      }
    });

    console.log('👂 [popup] Event listeners set up');
  }

  /**
   * Check if current tab is valid for content extraction
   */
  async checkCurrentTab() {
    try {
      const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
      
      if (tabs.length === 0) {
        this.showError('No active tab found');
        this.disableExtraction();
        return;
      }

      const currentTab = tabs[0];
      const url = currentTab.url;

      // Check if the URL is valid for content extraction
      if (this.isRestrictedUrl(url)) {
        this.showError('Cannot extract content from this page');
        this.disableExtraction();
        return;
      }

      console.log(`✅ [popup] Current tab is valid: ${url}`);
      this.enableExtraction();

    } catch (error) {
      console.error('🚨 [popup] Error checking current tab:', error);
      this.showError('Error accessing current tab');
      this.disableExtraction();
    }
  }

  /**
   * Check if URL is restricted for content extraction
   * @param {string} url - The URL to check
   * @returns {boolean} True if URL is restricted
   */
  isRestrictedUrl(url) {
    const restrictedPatterns = [
      /^chrome:\/\//,
      /^chrome-extension:\/\//,
      /^moz-extension:\/\//,
      /^edge:\/\//,
      /^about:/,
      /^file:\/\//
    ];

    return restrictedPatterns.some(pattern => pattern.test(url));
  }

  /**
   * Handle extract button click
   */
  async handleExtractClick() {
    if (this.elements.extractBtn.disabled) {
      return;
    }

    try {
      console.log('🔄 [popup] Starting content extraction');
      
      this.showProgress('Extracting content...');
      this.disableExtraction();

      // Send message to background script to extract and copy content
      const response = await this.sendMessageToBackground({
        action: 'extractAndCopy'
      });

      this.hideProgress();

      if (response.success) {
        console.log('✅ [popup] Content extraction successful');
        this.showSuccess(response.message || 'Content copied to clipboard!');
        
        // Auto-close popup after successful extraction
        setTimeout(() => {
          window.close();
        }, 1500);
      } else {
        console.error('🚨 [popup] Content extraction failed:', response.error);
        this.showError(response.error || 'Failed to extract content');
        this.enableExtraction();
      }

    } catch (error) {
      console.error('🚨 [popup] Unexpected error:', error);
      this.hideProgress();
      this.showError('Unexpected error occurred');
      this.enableExtraction();
    }
  }

  /**
   * Send message to background script
   * @param {object} message - Message to send
   * @returns {Promise<object>} Response from background script
   */
  sendMessageToBackground(message) {
    return new Promise((resolve, reject) => {
      chrome.runtime.sendMessage(message, (response) => {
        if (chrome.runtime.lastError) {
          reject(new Error(chrome.runtime.lastError.message));
        } else {
          resolve(response);
        }
      });
    });
  }

  /**
   * Show progress indicator
   * @param {string} text - Progress text to display
   */
  showProgress(text = 'Processing...') {
    this.elements.progressText.textContent = text;
    this.elements.progress.classList.remove('hidden');
    this.hideStatus();
  }

  /**
   * Hide progress indicator
   */
  hideProgress() {
    this.elements.progress.classList.add('hidden');
  }

  /**
   * Show success message
   * @param {string} message - Success message to display
   */
  showSuccess(message) {
    this.elements.statusMessage.textContent = message;
    this.elements.status.className = 'status success';
    this.elements.status.classList.remove('hidden');
  }

  /**
   * Show error message
   * @param {string} message - Error message to display
   */
  showError(message) {
    this.elements.statusMessage.textContent = message;
    this.elements.status.className = 'status error';
    this.elements.status.classList.remove('hidden');
  }

  /**
   * Hide status message
   */
  hideStatus() {
    this.elements.status.classList.add('hidden');
  }

  /**
   * Enable content extraction
   */
  enableExtraction() {
    this.elements.extractBtn.disabled = false;
    this.elements.extractBtn.querySelector('.btn-text').textContent = 'Copy Page as Markdown';
  }

  /**
   * Disable content extraction
   */
  disableExtraction() {
    this.elements.extractBtn.disabled = true;
    this.elements.extractBtn.querySelector('.btn-text').textContent = 'Cannot Extract from This Page';
  }
}

// Initialize popup when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
  console.log('📄 [popup] DOM loaded, initializing popup');
  new PopupController();
});

// Export for testing
if (typeof module !== 'undefined' && module.exports) {
  module.exports = PopupController;
} 