jest.mock('../../src/utils/preferences', () => ({
  get: jest.fn().mockResolvedValue({
    outputMode: 'clipboard',
    includeMetadata: true
  }),
  set: jest.fn().mockResolvedValue()
}));

jest.mock('../../src/utils/site-registry', () => ({
  detect: jest.fn().mockReturnValue(null)
}));

// Re-acquired in beforeEach after jest.resetModules()
let Preferences, SiteRegistry;

// Minimal popup DOM matching src/popup/popup.html structure
const POPUP_HTML = `
  <div class="container">
    <header class="header">
      <h1 class="title">Markdown</h1>
      <button id="settingsBtn" class="settings-btn" title="Settings"></button>
    </header>
    <main class="main">
      <div class="options">
        <label class="checkbox-label" for="metadataToggle">
          <input type="checkbox" id="metadataToggle" checked>
          <span>Include page info</span>
        </label>
        <div class="output-toggle" id="outputToggle">
          <button class="toggle-btn active" data-mode="clipboard">Copy</button>
          <button class="toggle-btn" data-mode="file">Save</button>
        </div>
      </div>
      <div id="siteActions" class="site-actions hidden"></div>
      <div class="actions">
        <button id="extractBtn" class="btn btn-primary">
          <span class="btn-text">Copy Page as Markdown</span>
        </button>
        <button id="selectBtn" class="btn btn-secondary">
          <span class="btn-text">Select Elements</span>
        </button>
      </div>
      <div id="selectionActive" class="selection-active hidden">
        <p>Selection mode is active on this page.</p>
        <button id="cancelSelectBtn" class="btn btn-outline">Cancel Selection</button>
      </div>
      <div id="status" class="status hidden">
        <div class="status-icon"></div>
        <div class="status-message"></div>
      </div>
      <div id="progress" class="progress hidden">
        <div class="progress-bar"><div class="progress-fill"></div></div>
        <div class="progress-text">Extracting content...</div>
      </div>
    </main>
  </div>
`;

/**
 * Helper: create a PopupController with all mocks pre-configured.
 * By default, chrome.tabs.query returns a valid tab and sendMessage returns {}.
 */
async function createPopup(opts = {}) {
  const tabUrl = opts.tabUrl || 'https://example.com';

  chrome.tabs.query.mockResolvedValue([{ id: 1, url: tabUrl }]);

  // Default: sendMessage calls callback with empty object (no error)
  if (!opts.skipSendMessageMock) {
    chrome.runtime.sendMessage.mockImplementation((msg, callback) => {
      if (callback) callback(opts.sendMessageResponse || {});
    });
  }

  const PopupController = require('../../src/popup/popup');
  const controller = new PopupController();
  await flushPromises();
  return controller;
}

describe('PopupController', () => {
  let consoleLogSpy, consoleErrorSpy;

  beforeEach(() => {
    jest.resetModules();
    document.body.innerHTML = POPUP_HTML;
    window.close = jest.fn();

    // Re-acquire mock references after resetModules
    Preferences = require('../../src/utils/preferences');
    SiteRegistry = require('../../src/utils/site-registry');

    // Reset chrome mocks
    chrome.tabs.query.mockReset();
    chrome.runtime.sendMessage.mockReset();
    chrome.runtime.openOptionsPage.mockReset();
    chrome.runtime.lastError = null;

    // Set up module mock defaults
    Preferences.get.mockResolvedValue({ outputMode: 'clipboard', includeMetadata: true });
    Preferences.set.mockResolvedValue();
    SiteRegistry.detect.mockReturnValue(null);

    consoleLogSpy = jest.spyOn(console, 'log').mockImplementation();
    consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation();
  });

  afterEach(() => {
    consoleLogSpy.mockRestore();
    consoleErrorSpy.mockRestore();
    jest.useRealTimers();
  });

  // -------------------------------------------------------
  // Constructor / init
  // -------------------------------------------------------
  describe('constructor and init', () => {
    test('binds all expected DOM elements', async () => {
      const popup = await createPopup();
      expect(popup.elements.extractBtn).toBeTruthy();
      expect(popup.elements.selectBtn).toBeTruthy();
      expect(popup.elements.cancelSelectBtn).toBeTruthy();
      expect(popup.elements.selectionActive).toBeTruthy();
      expect(popup.elements.status).toBeTruthy();
      expect(popup.elements.progress).toBeTruthy();
      expect(popup.elements.statusIcon).toBeTruthy();
      expect(popup.elements.statusMessage).toBeTruthy();
      expect(popup.elements.progressText).toBeTruthy();
      expect(popup.elements.metadataToggle).toBeTruthy();
      expect(popup.elements.outputToggle).toBeTruthy();
      expect(popup.elements.siteActions).toBeTruthy();
      expect(popup.elements.settingsBtn).toBeTruthy();
    });

    test('checks current tab on init', async () => {
      await createPopup();
      expect(chrome.tabs.query).toHaveBeenCalledWith({ active: true, currentWindow: true });
    });
  });

  // -------------------------------------------------------
  // isRestrictedUrl
  // -------------------------------------------------------
  describe('isRestrictedUrl', () => {
    let popup;

    beforeEach(async () => {
      popup = await createPopup();
    });

    test.each([
      ['chrome://extensions', true],
      ['chrome-extension://abc123/popup.html', true],
      ['moz-extension://abc/popup.html', true],
      ['edge://settings', true],
      ['about:blank', true],
      ['file:///home/user/doc.html', true],
      ['https://example.com', false],
      ['http://localhost:3000', false],
    ])('isRestrictedUrl(%s) = %s', (url, expected) => {
      expect(popup.isRestrictedUrl(url)).toBe(expected);
    });
  });

  // -------------------------------------------------------
  // checkCurrentTab
  // -------------------------------------------------------
  describe('checkCurrentTab', () => {
    test('enables extraction for valid http tab', async () => {
      const popup = await createPopup({ tabUrl: 'https://example.com' });
      expect(popup.elements.extractBtn.disabled).toBe(false);
      expect(popup.elements.selectBtn.disabled).toBe(false);
    });

    test('disables extraction for restricted URL', async () => {
      const popup = await createPopup({ tabUrl: 'chrome://extensions' });
      expect(popup.elements.extractBtn.disabled).toBe(true);
      expect(popup.elements.selectBtn.disabled).toBe(true);
    });

    test('shows error when no active tab found', async () => {
      chrome.tabs.query.mockResolvedValue([]);
      chrome.runtime.sendMessage.mockImplementation((msg, callback) => {
        if (callback) callback({});
      });
      const PopupController = require('../../src/popup/popup');
      const popup = new PopupController();
      await flushPromises();

      expect(popup.elements.status.classList.contains('hidden')).toBe(false);
      expect(popup.elements.statusMessage.textContent).toBe('No active tab found');
    });

    test('shows error on query failure', async () => {
      chrome.tabs.query.mockRejectedValue(new Error('Query failed'));
      chrome.runtime.sendMessage.mockImplementation((msg, callback) => {
        if (callback) callback({});
      });
      const PopupController = require('../../src/popup/popup');
      const popup = new PopupController();
      await flushPromises();

      expect(popup.elements.statusMessage.textContent).toBe('Error accessing current tab');
    });
  });

  // -------------------------------------------------------
  // handleExtractClick
  // -------------------------------------------------------
  describe('handleExtractClick', () => {
    test('does nothing when button is disabled', async () => {
      const popup = await createPopup();
      popup.elements.extractBtn.disabled = true;
      chrome.runtime.sendMessage.mockClear();

      await popup.handleExtractClick();

      // sendMessage should not have been called for extractAndCopy
      const extractCalls = chrome.runtime.sendMessage.mock.calls.filter(
        c => c[0] && c[0].action === 'extractAndCopy'
      );
      expect(extractCalls).toHaveLength(0);
    });

    test('shows progress and disables buttons on click', async () => {
      chrome.runtime.sendMessage.mockImplementation((msg, callback) => {
        // Don't call callback immediately so we can inspect intermediate state
        if (msg.action === 'extractAndCopy') {
          // Delay response
          Promise.resolve().then(() => callback({ success: true, message: 'Done' }));
        } else if (callback) {
          callback({});
        }
      });
      const popup = await createPopup();

      // Start extraction but don't await yet
      const extractPromise = popup.handleExtractClick();

      expect(popup.elements.progress.classList.contains('hidden')).toBe(false);
      expect(popup.elements.extractBtn.disabled).toBe(true);

      await extractPromise;
      await flushPromises();
    });

    test('sends extractAndCopy message', async () => {
      chrome.runtime.sendMessage.mockImplementation((msg, callback) => {
        if (callback) callback({ success: true, message: 'Copied!' });
      });
      const popup = await createPopup();
      chrome.runtime.sendMessage.mockClear();

      chrome.runtime.sendMessage.mockImplementation((msg, callback) => {
        if (callback) callback({ success: true, message: 'Copied!' });
      });
      await popup.handleExtractClick();

      expect(chrome.runtime.sendMessage).toHaveBeenCalledWith(
        { action: 'extractAndCopy' },
        expect.any(Function)
      );
    });

    test('shows success and schedules auto-close on success', async () => {
      const popup = await createPopup();

      chrome.runtime.sendMessage.mockImplementation((msg, callback) => {
        if (callback) callback({ success: true, message: 'Copied!' });
      });
      jest.useFakeTimers();
      await popup.handleExtractClick();

      expect(popup.elements.statusMessage.textContent).toBe('Copied!');
      expect(popup.elements.status.className).toContain('success');

      jest.advanceTimersByTime(1500);
      expect(window.close).toHaveBeenCalled();
    });

    test('shows error and re-enables on failure response', async () => {
      const popup = await createPopup();

      chrome.runtime.sendMessage.mockImplementation((msg, callback) => {
        if (callback) callback({ success: false, error: 'Extraction failed' });
      });
      await popup.handleExtractClick();

      expect(popup.elements.statusMessage.textContent).toBe('Extraction failed');
      expect(popup.elements.status.className).toContain('error');
      expect(popup.elements.extractBtn.disabled).toBe(false);
    });

    test('shows error on sendMessage rejection', async () => {
      const popup = await createPopup();

      chrome.runtime.sendMessage.mockImplementation((msg, callback) => {
        chrome.runtime.lastError = { message: 'Extension context invalidated' };
        if (callback) callback(undefined);
        chrome.runtime.lastError = null;
      });
      await popup.handleExtractClick();

      expect(popup.elements.statusMessage.textContent).toBe('Unexpected error occurred');
      expect(popup.elements.extractBtn.disabled).toBe(false);
    });
  });

  // -------------------------------------------------------
  // handleSelectClick
  // -------------------------------------------------------
  describe('handleSelectClick', () => {
    test('sends startSelectionMode and closes window on success', async () => {
      const popup = await createPopup();

      chrome.runtime.sendMessage.mockImplementation((msg, callback) => {
        if (callback) callback({ success: true });
      });
      await popup.handleSelectClick();

      expect(window.close).toHaveBeenCalled();
    });

    test('shows error on failure response', async () => {
      const popup = await createPopup();

      chrome.runtime.sendMessage.mockImplementation((msg, callback) => {
        if (callback) callback({ success: false, error: 'No tab' });
      });
      await popup.handleSelectClick();

      expect(popup.elements.statusMessage.textContent).toBe('No tab');
    });

    test('shows error on rejection', async () => {
      chrome.runtime.sendMessage.mockImplementation((msg, callback) => {
        chrome.runtime.lastError = { message: 'Failed' };
        if (callback) callback(undefined);
        chrome.runtime.lastError = null;
      });
      const popup = await createPopup();

      await popup.handleSelectClick();

      expect(popup.elements.statusMessage.textContent).toBe('Failed to start selection mode');
    });
  });

  // -------------------------------------------------------
  // handleCancelSelectClick
  // -------------------------------------------------------
  describe('handleCancelSelectClick', () => {
    test('sends cancelSelectionMode and hides selection UI', async () => {
      chrome.runtime.sendMessage.mockImplementation((msg, callback) => {
        if (callback) callback({});
      });
      const popup = await createPopup();
      popup.showSelectionActive();

      await popup.handleCancelSelectClick();

      expect(popup.elements.selectionActive.classList.contains('hidden')).toBe(true);
      expect(popup.elements.extractBtn.classList.contains('hidden')).toBe(false);
    });

    test('hides selection UI even on error', async () => {
      chrome.runtime.sendMessage.mockImplementation((msg, callback) => {
        chrome.runtime.lastError = { message: 'Failed' };
        if (callback) callback(undefined);
        chrome.runtime.lastError = null;
      });
      const popup = await createPopup();
      popup.showSelectionActive();

      await popup.handleCancelSelectClick();

      expect(popup.elements.selectionActive.classList.contains('hidden')).toBe(true);
    });
  });

  // -------------------------------------------------------
  // loadPreferences
  // -------------------------------------------------------
  describe('loadPreferences', () => {
    test('sets metadata toggle from preferences', async () => {
      Preferences.get.mockResolvedValue({ outputMode: 'clipboard', includeMetadata: false });
      const popup = await createPopup();

      expect(popup.elements.metadataToggle.checked).toBe(false);
    });

    test('sets output toggle active state from preferences', async () => {
      Preferences.get.mockResolvedValue({ outputMode: 'file', includeMetadata: true });
      const popup = await createPopup();

      const fileBtn = popup.elements.outputToggle.querySelector('[data-mode="file"]');
      const clipboardBtn = popup.elements.outputToggle.querySelector('[data-mode="clipboard"]');
      expect(fileBtn.classList.contains('active')).toBe(true);
      expect(clipboardBtn.classList.contains('active')).toBe(false);
    });

    test('updates button text based on output mode', async () => {
      Preferences.get.mockResolvedValue({ outputMode: 'file', includeMetadata: true });
      const popup = await createPopup();

      const btnText = popup.elements.extractBtn.querySelector('.btn-text');
      expect(btnText.textContent).toBe('Save Page as Markdown');
    });

    test('handles preference load error gracefully', async () => {
      Preferences.get.mockRejectedValue(new Error('Storage error'));
      const popup = await createPopup();

      // Should not throw — just logs
      expect(popup.elements.extractBtn).toBeTruthy();
    });
  });

  // -------------------------------------------------------
  // detectSiteActions
  // -------------------------------------------------------
  describe('detectSiteActions', () => {
    test('shows site actions when on x.com', async () => {
      SiteRegistry.detect.mockReturnValue({
        id: 'x',
        name: 'X / Twitter',
        contentTypes: [
          { id: 'single-tweet', label: 'Tweet', icon: '<svg></svg>' },
          { id: 'thread', label: 'Thread', icon: '<svg></svg>' },
          { id: 'article', label: 'Article', icon: '<svg></svg>' }
        ],
        Extractor: jest.fn(),
        Formatter: jest.fn()
      });
      const popup = await createPopup({ tabUrl: 'https://x.com/user/status/123' });

      expect(popup.elements.siteActions.classList.contains('hidden')).toBe(false);
      // Buttons should have been dynamically generated
      const buttons = popup.elements.siteActions.querySelectorAll('[data-site-id]');
      expect(buttons.length).toBe(3);
      expect(buttons[0].dataset.siteId).toBe('x');
      expect(buttons[0].dataset.contentType).toBe('single-tweet');
    });

    test('does not show site actions for non-matching site', async () => {
      SiteRegistry.detect.mockReturnValue(null);
      const popup = await createPopup({ tabUrl: 'https://example.com' });

      expect(popup.elements.siteActions.classList.contains('hidden')).toBe(true);
    });

    test('does nothing when currentTab is null', async () => {
      chrome.tabs.query.mockResolvedValue([]);
      chrome.runtime.sendMessage.mockImplementation((msg, callback) => {
        if (callback) callback({});
      });
      const PopupController = require('../../src/popup/popup');
      const popup = new PopupController();
      await flushPromises();

      // siteActions should remain hidden (no crash)
      expect(popup.elements.siteActions.classList.contains('hidden')).toBe(true);
    });
  });

  // -------------------------------------------------------
  // handleSiteExtract
  // -------------------------------------------------------
  describe('handleSiteExtract', () => {
    test('sends extractSiteContent with correct siteId and contentType', async () => {
      const popup = await createPopup();

      chrome.runtime.sendMessage.mockClear();
      chrome.runtime.sendMessage.mockImplementation((msg, callback) => {
        if (callback) callback({ success: true, message: 'Done' });
      });
      await popup.handleSiteExtract('x', 'single-tweet');

      expect(chrome.runtime.sendMessage).toHaveBeenCalledWith(
        { action: 'extractSiteContent', siteId: 'x', contentType: 'single-tweet' },
        expect.any(Function)
      );
    });

    test('shows success and auto-closes on success', async () => {
      const popup = await createPopup();

      chrome.runtime.sendMessage.mockImplementation((msg, callback) => {
        if (callback) callback({ success: true, message: 'Tweet copied!' });
      });
      jest.useFakeTimers();
      await popup.handleSiteExtract('x', 'single-tweet');

      expect(popup.elements.statusMessage.textContent).toBe('Tweet copied!');
      jest.advanceTimersByTime(1500);
      expect(window.close).toHaveBeenCalled();
    });

    test('shows error and re-enables on failure', async () => {
      const popup = await createPopup();

      chrome.runtime.sendMessage.mockImplementation((msg, callback) => {
        if (callback) callback({ success: false, error: 'Not a tweet page' });
      });
      await popup.handleSiteExtract('x', 'single-tweet');

      expect(popup.elements.statusMessage.textContent).toBe('Not a tweet page');
      expect(popup.elements.extractBtn.disabled).toBe(false);
    });

    test('shows error on rejection', async () => {
      const popup = await createPopup();

      chrome.runtime.sendMessage.mockImplementation((msg, callback) => {
        chrome.runtime.lastError = { message: 'Failed' };
        if (callback) callback(undefined);
        chrome.runtime.lastError = null;
      });
      await popup.handleSiteExtract('x', 'thread');

      expect(popup.elements.statusMessage.textContent).toBe('Unexpected error occurred');
      expect(popup.elements.extractBtn.disabled).toBe(false);
    });
  });

  // -------------------------------------------------------
  // updateButtonText
  // -------------------------------------------------------
  describe('updateButtonText', () => {
    test('sets "Copy Page as Markdown" for clipboard mode', async () => {
      const popup = await createPopup();
      popup.updateButtonText('clipboard');

      const btnText = popup.elements.extractBtn.querySelector('.btn-text');
      expect(btnText.textContent).toBe('Copy Page as Markdown');
    });

    test('sets "Save Page as Markdown" for file mode', async () => {
      const popup = await createPopup();
      popup.updateButtonText('file');

      const btnText = popup.elements.extractBtn.querySelector('.btn-text');
      expect(btnText.textContent).toBe('Save Page as Markdown');
    });

    test('updates site action button text for file mode', async () => {
      SiteRegistry.detect.mockReturnValue({
        id: 'x',
        name: 'X / Twitter',
        contentTypes: [
          { id: 'single-tweet', label: 'Tweet', icon: '<svg></svg>' },
          { id: 'thread', label: 'Thread', icon: '<svg></svg>' },
          { id: 'article', label: 'Article', icon: '<svg></svg>' }
        ],
        Extractor: jest.fn(),
        Formatter: jest.fn()
      });
      const popup = await createPopup({ tabUrl: 'https://x.com/user/status/123' });
      popup.updateButtonText('file');

      const tweetBtn = popup.elements.siteActions.querySelector('[data-content-type="single-tweet"] .btn-text');
      const threadBtn = popup.elements.siteActions.querySelector('[data-content-type="thread"] .btn-text');
      const articleBtn = popup.elements.siteActions.querySelector('[data-content-type="article"] .btn-text');
      expect(tweetBtn.textContent).toBe('Save Tweet');
      expect(threadBtn.textContent).toBe('Save Thread');
      expect(articleBtn.textContent).toBe('Save Article');
    });
  });

  // -------------------------------------------------------
  // UI state methods
  // -------------------------------------------------------
  describe('UI state methods', () => {
    let popup;

    beforeEach(async () => {
      popup = await createPopup();
    });

    test('showSelectionActive hides buttons and shows cancel', () => {
      popup.showSelectionActive();

      expect(popup.elements.extractBtn.classList.contains('hidden')).toBe(true);
      expect(popup.elements.selectBtn.classList.contains('hidden')).toBe(true);
      expect(popup.elements.selectionActive.classList.contains('hidden')).toBe(false);
    });

    test('hideSelectionActive shows buttons and hides cancel', () => {
      popup.showSelectionActive();
      popup.hideSelectionActive();

      expect(popup.elements.extractBtn.classList.contains('hidden')).toBe(false);
      expect(popup.elements.selectBtn.classList.contains('hidden')).toBe(false);
      expect(popup.elements.selectionActive.classList.contains('hidden')).toBe(true);
    });

    test('showProgress shows progress and hides status', () => {
      popup.showProgress('Loading...');

      expect(popup.elements.progress.classList.contains('hidden')).toBe(false);
      expect(popup.elements.progressText.textContent).toBe('Loading...');
      expect(popup.elements.status.classList.contains('hidden')).toBe(true);
    });

    test('hideProgress hides progress element', () => {
      popup.showProgress('test');
      popup.hideProgress();

      expect(popup.elements.progress.classList.contains('hidden')).toBe(true);
    });

    test('showSuccess sets success class and message', () => {
      popup.showSuccess('All done!');

      expect(popup.elements.statusMessage.textContent).toBe('All done!');
      expect(popup.elements.status.className).toContain('success');
      expect(popup.elements.status.classList.contains('hidden')).toBe(false);
    });

    test('showError sets error class and message', () => {
      popup.showError('Something broke');

      expect(popup.elements.statusMessage.textContent).toBe('Something broke');
      expect(popup.elements.status.className).toContain('error');
      expect(popup.elements.status.classList.contains('hidden')).toBe(false);
    });

    test('enableExtraction enables buttons and restores text', () => {
      popup.disableExtraction();
      popup.enableExtraction();

      expect(popup.elements.extractBtn.disabled).toBe(false);
      expect(popup.elements.selectBtn.disabled).toBe(false);
      expect(popup.elements.extractBtn.querySelector('.btn-text').textContent).toBe('Copy Page as Markdown');
    });

    test('disableExtraction disables buttons and changes text', () => {
      popup.disableExtraction();

      expect(popup.elements.extractBtn.disabled).toBe(true);
      expect(popup.elements.selectBtn.disabled).toBe(true);
      expect(popup.elements.extractBtn.querySelector('.btn-text').textContent).toBe('Cannot Extract from This Page');
    });
  });

  // -------------------------------------------------------
  // checkSelectionState
  // -------------------------------------------------------
  describe('checkSelectionState', () => {
    test('shows selection active when background says active', async () => {
      const popup = await createPopup({
        sendMessageResponse: { active: true }
      });

      expect(popup.elements.selectionActive.classList.contains('hidden')).toBe(false);
    });

    test('does nothing when background says not active', async () => {
      chrome.runtime.sendMessage.mockImplementation((msg, callback) => {
        if (callback) callback({ active: false });
      });
      const popup = await createPopup();

      expect(popup.elements.selectionActive.classList.contains('hidden')).toBe(true);
    });

    test('handles error gracefully', async () => {
      chrome.runtime.sendMessage.mockImplementation((msg, callback) => {
        if (msg.action === 'getSelectionState') {
          chrome.runtime.lastError = { message: 'No connection' };
          if (callback) callback(undefined);
          chrome.runtime.lastError = null;
        } else if (callback) {
          callback({});
        }
      });
      const popup = await createPopup();

      // Should not throw, selection stays hidden
      expect(popup.elements.selectionActive.classList.contains('hidden')).toBe(true);
    });
  });

  // -------------------------------------------------------
  // sendMessageToBackground
  // -------------------------------------------------------
  describe('sendMessageToBackground', () => {
    test('resolves with response on success', async () => {
      const popup = await createPopup();
      chrome.runtime.sendMessage.mockImplementation((msg, callback) => {
        if (callback) callback({ success: true, data: 'test' });
      });

      const result = await popup.sendMessageToBackground({ action: 'test' });

      expect(result).toEqual({ success: true, data: 'test' });
    });

    test('rejects with lastError when present', async () => {
      const popup = await createPopup();
      chrome.runtime.sendMessage.mockImplementation((msg, callback) => {
        chrome.runtime.lastError = { message: 'Extension error' };
        if (callback) callback(undefined);
        chrome.runtime.lastError = null;
      });

      await expect(popup.sendMessageToBackground({ action: 'test' }))
        .rejects.toThrow('Extension error');
    });
  });

  // -------------------------------------------------------
  // Progress timers
  // -------------------------------------------------------
  describe('progress timers', () => {
    test('_startProgressTimers creates timers with escalating messages', async () => {
      const popup = await createPopup();
      popup.showProgress('Starting...');

      jest.useFakeTimers();
      const timers = popup._startProgressTimers();

      expect(timers).toHaveLength(4);

      jest.advanceTimersByTime(2000);
      expect(popup.elements.progressText.textContent).toBe('Processing page content...');

      jest.advanceTimersByTime(3000); // 5s total
      expect(popup.elements.progressText.textContent).toBe('Converting to markdown...');

      jest.advanceTimersByTime(5000); // 10s total
      expect(popup.elements.progressText.textContent).toBe('Large page \u2014 still working...');

      jest.advanceTimersByTime(10000); // 20s total
      expect(popup.elements.progressText.textContent).toBe('Very large page \u2014 almost done...');
    });

    test('_clearProgressTimers clears all timers', async () => {
      const popup = await createPopup();
      popup.showProgress('Starting...');

      jest.useFakeTimers();
      const timers = popup._startProgressTimers();
      popup._clearProgressTimers(timers);

      jest.advanceTimersByTime(25000);
      // Text should not have changed since timers were cleared
      expect(popup.elements.progressText.textContent).toBe('Starting...');
    });
  });

  // -------------------------------------------------------
  // Keyboard shortcut
  // -------------------------------------------------------
  describe('keyboard shortcut', () => {
    test('Ctrl+Enter triggers handleExtractClick', async () => {
      chrome.runtime.sendMessage.mockImplementation((msg, callback) => {
        if (callback) callback({ success: true, message: 'Done' });
      });
      const popup = await createPopup();
      const spy = jest.spyOn(popup, 'handleExtractClick');

      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', ctrlKey: true }));

      expect(spy).toHaveBeenCalled();
    });

    test('Meta+Enter triggers handleExtractClick', async () => {
      chrome.runtime.sendMessage.mockImplementation((msg, callback) => {
        if (callback) callback({ success: true, message: 'Done' });
      });
      const popup = await createPopup();
      const spy = jest.spyOn(popup, 'handleExtractClick');

      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', metaKey: true }));

      expect(spy).toHaveBeenCalled();
    });

    test('other key combos do not trigger extract', async () => {
      const popup = await createPopup();
      const spy = jest.spyOn(popup, 'handleExtractClick');

      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter' }));
      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'a', ctrlKey: true }));

      expect(spy).not.toHaveBeenCalled();
    });
  });

  // -------------------------------------------------------
  // Event listeners
  // -------------------------------------------------------
  describe('event listeners', () => {
    test('metadata toggle change saves preference', async () => {
      const popup = await createPopup();
      Preferences.set.mockClear();

      popup.elements.metadataToggle.checked = false;
      popup.elements.metadataToggle.dispatchEvent(new Event('change'));

      expect(Preferences.set).toHaveBeenCalledWith({ includeMetadata: false });
    });

    test('output toggle click saves preference and updates text', async () => {
      const popup = await createPopup();
      Preferences.set.mockClear();

      const fileBtn = popup.elements.outputToggle.querySelector('[data-mode="file"]');
      fileBtn.click();

      expect(Preferences.set).toHaveBeenCalledWith({ outputMode: 'file' });
      expect(popup.elements.extractBtn.querySelector('.btn-text').textContent).toBe('Save Page as Markdown');
    });

    test('settings button opens options page', async () => {
      const popup = await createPopup();

      popup.elements.settingsBtn.click();

      expect(chrome.runtime.openOptionsPage).toHaveBeenCalled();
    });
  });
});
