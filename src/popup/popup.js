// Popup script for browser extension
// Handles user interactions in the popup interface

const Preferences = require('../utils/preferences');
const SiteDetector = require('../utils/site-detector');

console.log('🚀 [popup] Popup script loaded');

class PopupController {
  constructor() {
    this.elements = {
      extractBtn: document.getElementById('extractBtn'),
      selectBtn: document.getElementById('selectBtn'),
      cancelSelectBtn: document.getElementById('cancelSelectBtn'),
      selectionActive: document.getElementById('selectionActive'),
      status: document.getElementById('status'),
      progress: document.getElementById('progress'),
      statusIcon: document.querySelector('.status-icon'),
      statusMessage: document.querySelector('.status-message'),
      progressText: document.querySelector('.progress-text'),
      metadataToggle: document.getElementById('metadataToggle'),
      outputToggle: document.getElementById('outputToggle'),
      xPresets: document.getElementById('xPresets'),
      settingsBtn: document.getElementById('settingsBtn')
    };

    this.currentTab = null;
    this.init();
  }

  /**
   * Initialize the popup
   */
  async init() {
    console.log('🔧 [popup] Initializing popup controller');
    this.setupEventListeners();
    await this.checkCurrentTab();
    this.detectSitePresets();
    this.checkSelectionState();
    this.loadPreferences();
  }

  /**
   * Set up event listeners
   */
  setupEventListeners() {
    this.elements.extractBtn.addEventListener('click', () => {
      console.log('🖱️ [popup] Extract button clicked');
      this.handleExtractClick();
    });

    this.elements.selectBtn.addEventListener('click', () => {
      console.log('🖱️ [popup] Select button clicked');
      this.handleSelectClick();
    });

    this.elements.cancelSelectBtn.addEventListener('click', () => {
      console.log('🖱️ [popup] Cancel select button clicked');
      this.handleCancelSelectClick();
    });

    // Settings button
    if (this.elements.settingsBtn) {
      this.elements.settingsBtn.addEventListener('click', () => {
        chrome.runtime.openOptionsPage();
      });
    }

    // Handle keyboard shortcuts
    document.addEventListener('keydown', (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
        e.preventDefault();
        this.handleExtractClick();
      }
    });

    // Metadata toggle
    this.elements.metadataToggle.addEventListener('change', (e) => {
      Preferences.set({ includeMetadata: e.target.checked });
    });

    // Output mode toggle
    this.elements.outputToggle.addEventListener('click', (e) => {
      const btn = e.target.closest('.toggle-btn');
      if (!btn) return;
      const mode = btn.dataset.mode;

      this.elements.outputToggle.querySelectorAll('.toggle-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');

      Preferences.set({ outputMode: mode });
      this.updateButtonText(mode);
    });

    console.log('👂 [popup] Event listeners set up');
  }

  /**
   * Check if selection mode is active for the current tab
   */
  async checkSelectionState() {
    try {
      const response = await this.sendMessageToBackground({
        action: 'getSelectionState'
      });

      if (response && response.active) {
        this.showSelectionActive();
      }
    } catch (error) {
      console.log('📋 [popup] Could not check selection state:', error.message);
    }
  }

  /**
   * Load preferences and set UI state
   */
  async loadPreferences() {
    try {
      const prefs = await Preferences.get();

      this.elements.metadataToggle.checked = prefs.includeMetadata;

      // Set output toggle active state
      this.elements.outputToggle.querySelectorAll('.toggle-btn').forEach(btn => {
        btn.classList.toggle('active', btn.dataset.mode === prefs.outputMode);
      });

      this.updateButtonText(prefs.outputMode);
    } catch (error) {
      console.log('📋 [popup] Could not load preferences:', error.message);
    }
  }

  /**
   * Detect site-specific presets based on current tab URL
   */
  detectSitePresets() {
    if (!this.currentTab || !this.currentTab.url) return;

    const detection = SiteDetector.detect(this.currentTab.url);
    if (detection.site === 'x') {
      this.showXPresets();
    }
  }

  /**
   * Show X/Twitter preset buttons and attach handlers
   */
  showXPresets() {
    if (!this.elements.xPresets) return;

    this.elements.xPresets.classList.remove('hidden');

    // Event delegation for preset buttons
    this.elements.xPresets.addEventListener('click', (e) => {
      const btn = e.target.closest('.btn-preset');
      if (!btn) return;
      const contentType = btn.dataset.xType;
      if (contentType) {
        this.handleXExtract(contentType);
      }
    });

    console.log('🐦 [popup] X/Twitter presets shown');
  }

  /**
   * Handle X-specific extraction
   */
  async handleXExtract(contentType) {
    try {
      console.log(`🐦 [popup] Extracting X content: ${contentType}`);

      this.showProgress('Extracting X content...');
      this.elements.extractBtn.disabled = true;
      this.elements.selectBtn.disabled = true;
      this.elements.xPresets.querySelectorAll('.btn-preset').forEach(b => b.disabled = true);

      const progressTimers = this._startProgressTimers();

      const response = await this.sendMessageToBackground({
        action: 'extractXContent',
        contentType
      });

      this._clearProgressTimers(progressTimers);
      this.hideProgress();

      if (response && response.success) {
        console.log('✅ [popup] X extraction successful');
        this.showSuccess(response.message || 'X content processed!');
        setTimeout(() => { window.close(); }, 1500);
      } else {
        console.error('🚨 [popup] X extraction failed:', response && response.error);
        this.showError((response && response.error) || 'Failed to extract X content');
        this.enableExtraction();
      }
    } catch (error) {
      console.error('🚨 [popup] Unexpected error in X extraction:', error);
      this.hideProgress();
      this.showError('Unexpected error occurred');
      this.enableExtraction();
    }
  }

  /**
   * Update the primary action button text based on output mode
   */
  updateButtonText(mode) {
    const btnText = this.elements.extractBtn.querySelector('.btn-text');
    if (mode === 'file') {
      btnText.textContent = 'Save Page as Markdown';
    } else {
      btnText.textContent = 'Copy Page as Markdown';
    }

    // Also update X preset button text
    if (this.elements.xPresets) {
      const verb = mode === 'file' ? 'Save' : 'Copy';
      this.elements.xPresets.querySelectorAll('.btn-preset').forEach(btn => {
        const textEl = btn.querySelector('.btn-text');
        if (!textEl) return;
        const type = btn.dataset.xType;
        if (type === 'single-tweet') textEl.textContent = `${verb} Tweet`;
        else if (type === 'thread') textEl.textContent = `${verb} Thread`;
        else if (type === 'article') textEl.textContent = `${verb} Article`;
      });
    }
  }

  /**
   * Show selection-active UI (hide buttons, show cancel option)
   */
  showSelectionActive() {
    this.elements.extractBtn.classList.add('hidden');
    this.elements.selectBtn.classList.add('hidden');
    this.elements.selectionActive.classList.remove('hidden');
  }

  /**
   * Hide selection-active UI (show buttons again)
   */
  hideSelectionActive() {
    this.elements.extractBtn.classList.remove('hidden');
    this.elements.selectBtn.classList.remove('hidden');
    this.elements.selectionActive.classList.add('hidden');
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

      this.currentTab = tabs[0];
      const url = this.currentTab.url;

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

      // Escalating progress messages for large pages
      const progressTimers = this._startProgressTimers();

      // Send message to background script to extract and copy content
      const response = await this.sendMessageToBackground({
        action: 'extractAndCopy'
      });

      this._clearProgressTimers(progressTimers);
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
   * Handle select elements button click
   */
  async handleSelectClick() {
    try {
      console.log('🎯 [popup] Starting selection mode');

      const response = await this.sendMessageToBackground({
        action: 'startSelectionMode'
      });

      if (response && response.success) {
        // Close popup so user can interact with the page
        window.close();
      } else {
        this.showError((response && response.error) || 'Failed to start selection mode');
      }
    } catch (error) {
      console.error('🚨 [popup] Error starting selection mode:', error);
      this.showError('Failed to start selection mode');
    }
  }

  /**
   * Handle cancel selection button click
   */
  async handleCancelSelectClick() {
    try {
      await this.sendMessageToBackground({
        action: 'cancelSelectionMode'
      });

      this.hideSelectionActive();
    } catch (error) {
      console.error('🚨 [popup] Error cancelling selection:', error);
      this.hideSelectionActive();
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
   * Start escalating progress message timers for long-running conversions.
   * Returns an array of timer IDs to be cleared on completion.
   */
  _startProgressTimers() {
    return [
      setTimeout(() => this._updateProgressText('Processing page content...'), 2000),
      setTimeout(() => this._updateProgressText('Converting to markdown...'), 5000),
      setTimeout(() => this._updateProgressText('Large page — still working...'), 10000),
      setTimeout(() => this._updateProgressText('Very large page — almost done...'), 20000),
    ];
  }

  /**
   * Clear all progress timers.
   */
  _clearProgressTimers(timers) {
    if (timers) timers.forEach(t => clearTimeout(t));
  }

  /**
   * Update only the progress text (without showing/hiding the container).
   */
  _updateProgressText(text) {
    if (this.elements.progressText) {
      this.elements.progressText.textContent = text;
    }
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
    // Restore button text based on current toggle state
    const activeToggle = this.elements.outputToggle.querySelector('.toggle-btn.active');
    const mode = activeToggle ? activeToggle.dataset.mode : 'clipboard';
    this.updateButtonText(mode);
    this.elements.selectBtn.disabled = false;

    // Re-enable X preset buttons if present
    if (this.elements.xPresets) {
      this.elements.xPresets.querySelectorAll('.btn-preset').forEach(b => b.disabled = false);
    }
  }

  /**
   * Disable content extraction
   */
  disableExtraction() {
    this.elements.extractBtn.disabled = true;
    this.elements.extractBtn.querySelector('.btn-text').textContent = 'Cannot Extract from This Page';
    this.elements.selectBtn.disabled = true;
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
