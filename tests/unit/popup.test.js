jest.mock('../../src/utils/preferences', () => ({
  DEFAULTS: {
    outputMode: 'clipboard',
    includeMetadata: true,
    autoClosePopup: true,
    lastUsedPerSite: {}
  },
  get: jest.fn(),
  set: jest.fn()
}));

jest.mock('../../src/utils/site-registry', () => ({
  detect: jest.fn().mockReturnValue(null),
  // Default mock: pass through all of the site's content types. Individual tests
  // can override for path-applicability scenarios.
  applicableContentTypes: jest.fn((site) =>
    site && Array.isArray(site.contentTypes) ? site.contentTypes : []
  )
}));

let Preferences, SiteRegistry;

const POPUP_HTML = `
  <div class="popup" id="popup">
    <header class="popup-header">
      <div class="header-left">
        <span class="logo"><svg></svg></span>
        <span class="title">Markdown</span>
      </div>
      <div class="header-right">
        <label class="page-info-toggle" id="metadataToggleLabel">
          <input type="checkbox" id="metadataToggle" checked>
          <span class="checkbox-box"><svg class="checkbox-check"></svg></span>
          <span class="checkbox-text">Page info</span>
        </label>
        <button class="gear" id="settingsBtn"><svg></svg></button>
      </div>
    </header>
    <main class="popup-body" id="popupBody">
      <div class="row-list" id="rowList">
        <button type="button" class="row selected" id="pageRow" data-content-type="page" data-site-id="">
          <span class="row-icon"><svg></svg></span>
          <span class="row-label">Page content</span>
          <span class="row-check"><svg></svg></span>
        </button>
        <div class="site-divider hidden" id="siteDivider">
          <span class="divider-badge" id="dividerBadge"></span>
          <span class="divider-text" id="dividerText"></span>
          <span class="divider-line"></span>
        </div>
        <div class="site-rows" id="siteRows"></div>
      </div>
      <div class="selection-active hidden" id="selectionActive">
        <div class="selection-card">
          <span class="selection-icon"><svg></svg></span>
          <p class="selection-message">Selection mode is active on this page.</p>
          <button type="button" class="btn btn-secondary" id="cancelSelectBtn">Cancel selection</button>
        </div>
      </div>
    </main>
    <div class="error-banner hidden" id="errorBanner" role="alert">
      <span class="error-icon"><svg></svg></span>
      <span class="error-message" id="errorMessage"></span>
    </div>
    <footer class="popup-footer" id="popupFooter">
      <div class="actions">
        <button type="button" class="btn btn-action btn-primary" id="primaryBtn" data-action="clipboard">
          <span class="btn-text">Copy</span>
        </button>
        <button type="button" class="btn btn-action" id="secondaryBtn" data-action="file">
          <span class="btn-text">Save</span>
        </button>
      </div>
      <button type="button" class="select-link" id="selectBtn">
        <span class="select-icon"><svg></svg></span>
        <span class="select-link-text">or select elements on page</span>
      </button>
    </footer>
  </div>
`;

const DEFAULT_PREFS = {
  outputMode: 'clipboard',
  includeMetadata: true,
  autoClosePopup: true,
  lastUsedPerSite: {}
};

const X_SITE = {
  id: 'x',
  name: 'X / Twitter',
  icon: '<svg data-testid="x-icon"></svg>',
  contentTypes: [
    { id: 'single-tweet', label: 'Tweet', icon: '<svg></svg>' },
    { id: 'thread', label: 'Thread', icon: '<svg></svg>' },
    { id: 'article', label: 'Article', icon: '<svg></svg>' }
  ]
};

const CLAUDE_SITE = {
  id: 'claude',
  name: 'Claude',
  icon: '<svg data-testid="claude-icon"></svg>',
  contentTypes: [
    { id: 'conversation', label: 'Conversation', icon: '<svg></svg>' }
  ]
};

async function createPopup(opts = {}) {
  const tabUrl = opts.tabUrl || 'https://example.com';
  const prefs = { ...DEFAULT_PREFS, ...(opts.prefs || {}) };

  Preferences.get.mockResolvedValue(prefs);
  Preferences.set.mockResolvedValue();
  chrome.tabs.query.mockResolvedValue([{ id: 1, url: tabUrl }]);

  if (opts.site !== undefined) {
    SiteRegistry.detect.mockReturnValue(opts.site);
  }

  if (!opts.skipSendMessageMock) {
    chrome.runtime.sendMessage.mockImplementation((msg, callback) => {
      if (callback) callback(opts.sendMessageResponse || {});
    });
  }

  const PopupController = require('../../src/popup/popup');
  const controller = new PopupController();
  await flushPromises();
  await flushPromises();
  return controller;
}

describe('PopupController', () => {
  let consoleLogSpy, consoleErrorSpy, consoleWarnSpy;

  beforeEach(() => {
    jest.resetModules();
    document.body.innerHTML = POPUP_HTML;
    window.close = jest.fn();

    Preferences = require('../../src/utils/preferences');
    SiteRegistry = require('../../src/utils/site-registry');

    chrome.tabs.query.mockReset();
    chrome.runtime.sendMessage.mockReset();
    chrome.runtime.openOptionsPage.mockReset();
    chrome.runtime.lastError = null;

    Preferences.get.mockResolvedValue(DEFAULT_PREFS);
    Preferences.set.mockResolvedValue();
    SiteRegistry.detect.mockReturnValue(null);
    SiteRegistry.applicableContentTypes.mockImplementation((site) =>
      site && Array.isArray(site.contentTypes) ? site.contentTypes : []
    );

    consoleLogSpy = jest.spyOn(console, 'log').mockImplementation();
    consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation();
    consoleWarnSpy = jest.spyOn(console, 'warn').mockImplementation();
  });

  afterEach(() => {
    consoleLogSpy.mockRestore();
    consoleErrorSpy.mockRestore();
    consoleWarnSpy.mockRestore();
    jest.useRealTimers();
  });

  describe('init', () => {
    test('binds DOM element refs', async () => {
      const popup = await createPopup();
      expect(popup.elements.popup).toBeTruthy();
      expect(popup.elements.metadataToggle).toBeTruthy();
      expect(popup.elements.settingsBtn).toBeTruthy();
      expect(popup.elements.pageRow).toBeTruthy();
      expect(popup.elements.primaryBtn).toBeTruthy();
      expect(popup.elements.secondaryBtn).toBeTruthy();
      expect(popup.elements.selectBtn).toBeTruthy();
      expect(popup.elements.errorBanner).toBeTruthy();
    });

    test('queries the active tab', async () => {
      await createPopup();
      expect(chrome.tabs.query).toHaveBeenCalledWith({ active: true, currentWindow: true });
    });

    test('reads preferences on init', async () => {
      await createPopup();
      expect(Preferences.get).toHaveBeenCalled();
    });

    test('view defaults to main on a normal http(s) URL', async () => {
      const popup = await createPopup({ tabUrl: 'https://example.com' });
      expect(popup.state.view).toBe('main');
      expect(popup.elements.popup.classList.contains('disabled')).toBe(false);
      expect(popup.elements.popup.classList.contains('selecting')).toBe(false);
    });

    test('survives preference load failure', async () => {
      Preferences.get.mockRejectedValue(new Error('storage error'));
      chrome.tabs.query.mockResolvedValue([{ id: 1, url: 'https://example.com' }]);
      chrome.runtime.sendMessage.mockImplementation((msg, callback) => callback && callback({}));

      const PopupController = require('../../src/popup/popup');
      const popup = new PopupController();
      await flushPromises();
      await flushPromises();

      expect(popup.elements.popup).toBeTruthy();
    });
  });

  describe('restricted URL handling', () => {
    test.each([
      ['chrome://extensions'],
      ['chrome-extension://abc/popup.html'],
      ['moz-extension://abc/popup.html'],
      ['about:blank'],
      ['file:///home/user/doc.html']
    ])('marks view as restricted for %s', async (url) => {
      const popup = await createPopup({ tabUrl: url });
      expect(popup.state.view).toBe('restricted');
      expect(popup.elements.popup.classList.contains('disabled')).toBe(true);
      expect(popup.elements.errorBanner.classList.contains('hidden')).toBe(false);
      expect(popup.elements.errorMessage.textContent).toBe("Can't extract from this page");
    });

    test('marks view as restricted when no active tab is found', async () => {
      Preferences.get.mockResolvedValue(DEFAULT_PREFS);
      chrome.tabs.query.mockResolvedValue([]);
      chrome.runtime.sendMessage.mockImplementation((msg, callback) => callback && callback({}));

      const PopupController = require('../../src/popup/popup');
      const popup = new PopupController();
      await flushPromises();
      await flushPromises();

      expect(popup.state.view).toBe('restricted');
      expect(popup.elements.popup.classList.contains('disabled')).toBe(true);
    });
  });

  describe('action button derivation from outputMode pref', () => {
    test("primary = Copy when outputMode pref is 'clipboard'", async () => {
      const popup = await createPopup({ prefs: { outputMode: 'clipboard' } });
      expect(popup.elements.primaryBtn.dataset.action).toBe('clipboard');
      expect(popup.elements.primaryBtn.classList.contains('btn-primary')).toBe(true);
      expect(popup.elements.primaryBtn.querySelector('.btn-text').textContent).toBe('Copy');
      expect(popup.elements.secondaryBtn.dataset.action).toBe('file');
      expect(popup.elements.secondaryBtn.classList.contains('btn-primary')).toBe(false);
      expect(popup.elements.secondaryBtn.querySelector('.btn-text').textContent).toBe('Save');
    });

    test("primary = Save when outputMode pref is 'file'", async () => {
      const popup = await createPopup({ prefs: { outputMode: 'file' } });
      expect(popup.elements.primaryBtn.dataset.action).toBe('file');
      expect(popup.elements.primaryBtn.querySelector('.btn-text').textContent).toBe('Save');
      expect(popup.elements.secondaryBtn.dataset.action).toBe('clipboard');
      expect(popup.elements.secondaryBtn.querySelector('.btn-text').textContent).toBe('Copy');
    });
  });

  describe('site detection and rendering', () => {
    test('hides site divider on non-supported site', async () => {
      const popup = await createPopup({ tabUrl: 'https://example.com', site: null });
      expect(popup.elements.siteDivider.classList.contains('hidden')).toBe(true);
      expect(popup.elements.siteRows.children).toHaveLength(0);
    });

    test('renders site rows and divider on a supported site', async () => {
      const popup = await createPopup({ tabUrl: 'https://x.com/u/status/1', site: X_SITE });
      expect(popup.elements.siteDivider.classList.contains('hidden')).toBe(false);
      expect(popup.elements.dividerText.textContent).toBe('Available on X');
      expect(popup.elements.dividerBadge.querySelector('[data-testid="x-icon"]')).not.toBeNull();
      expect(popup.elements.siteRows.children).toHaveLength(3);
      expect(popup.elements.siteRows.children[0].dataset.contentType).toBe('single-tweet');
      expect(popup.elements.siteRows.children[1].dataset.contentType).toBe('thread');
      expect(popup.elements.siteRows.children[2].dataset.contentType).toBe('article');
    });

    test('renders single-content-site (Claude) with divider always shown', async () => {
      const popup = await createPopup({ tabUrl: 'https://claude.ai/share/abc', site: CLAUDE_SITE });
      expect(popup.elements.siteDivider.classList.contains('hidden')).toBe(false);
      expect(popup.elements.dividerText.textContent).toBe('Available on Claude');
      expect(popup.elements.dividerBadge.querySelector('[data-testid="claude-icon"]')).not.toBeNull();
      expect(popup.elements.siteRows.children).toHaveLength(1);
    });

    test('hides site divider when no content types are applicable on this URL', async () => {
      // E.g. on x.com/home — site is detected by hostname but no contentTypes
      // match the path, so the "Available on X" section should not render.
      SiteRegistry.applicableContentTypes.mockReturnValueOnce([]);
      const popup = await createPopup({ tabUrl: 'https://x.com/home', site: X_SITE });
      expect(popup.elements.siteDivider.classList.contains('hidden')).toBe(true);
      expect(popup.elements.siteRows.children).toHaveLength(0);
      // Page content should be selected as the default action
      expect(popup.state.selectedContentType).toBe('page');
    });

    test('renders only the applicable subset when path matches some content types', async () => {
      // Imagine a future site where /article/ paths only show "article", not "tweet".
      SiteRegistry.applicableContentTypes.mockReturnValueOnce([
        X_SITE.contentTypes[2] // just article
      ]);
      const popup = await createPopup({ tabUrl: 'https://x.com/u/article/1', site: X_SITE });
      expect(popup.elements.siteDivider.classList.contains('hidden')).toBe(false);
      expect(popup.elements.siteRows.children).toHaveLength(1);
      expect(popup.elements.siteRows.children[0].dataset.contentType).toBe('article');
    });

    test('does not restore remembered content type when none are applicable on this URL', async () => {
      // User last picked 'thread' on a /status/ page; now they're on /home where
      // nothing applies. The remembered type must NOT carry over — Page content wins.
      SiteRegistry.applicableContentTypes.mockReturnValueOnce([]);
      const popup = await createPopup({
        tabUrl: 'https://x.com/home',
        site: X_SITE,
        prefs: { lastUsedPerSite: { x: 'thread' } }
      });
      expect(popup.state.selectedContentType).toBe('page');
      expect(popup.state.selectedSiteId).toBeNull();
    });
  });

  describe('lastUsedPerSite — restore', () => {
    test('defaults to first applicable site action when nothing is remembered', async () => {
      // Site action wins over Page content whenever one is available, so on a
      // supported site with applicable content types we default to the first.
      const popup = await createPopup({ tabUrl: 'https://x.com/foo', site: X_SITE });
      expect(popup.state.selectedContentType).toBe('single-tweet');
      expect(popup.state.selectedSiteId).toBe('x');

      const tweetRow = popup.elements.siteRows.querySelector('[data-content-type="single-tweet"]');
      expect(tweetRow.classList.contains('selected')).toBe(true);
      expect(popup.elements.pageRow.classList.contains('selected')).toBe(false);
    });

    test('restores remembered content type for the current site', async () => {
      const popup = await createPopup({
        tabUrl: 'https://x.com/foo',
        site: X_SITE,
        prefs: { lastUsedPerSite: { x: 'thread' } }
      });
      expect(popup.state.selectedContentType).toBe('thread');
      expect(popup.state.selectedSiteId).toBe('x');

      const threadRow = popup.elements.siteRows.querySelector('[data-content-type="thread"]');
      expect(threadRow.classList.contains('selected')).toBe(true);
      expect(popup.elements.pageRow.classList.contains('selected')).toBe(false);
    });

    test('falls back to first applicable site action if remembered content type is no longer valid', async () => {
      const popup = await createPopup({
        tabUrl: 'https://x.com/foo',
        site: X_SITE,
        prefs: { lastUsedPerSite: { x: 'something-removed' } }
      });
      expect(popup.state.selectedContentType).toBe('single-tweet');
      expect(popup.state.selectedSiteId).toBe('x');
    });
  });

  describe('lastUsedPerSite — persist', () => {
    test('clicking a site row persists last-used for that site', async () => {
      const popup = await createPopup({ tabUrl: 'https://x.com/foo', site: X_SITE });
      Preferences.set.mockClear();

      const threadRow = popup.elements.siteRows.querySelector('[data-content-type="thread"]');
      threadRow.click();

      expect(Preferences.set).toHaveBeenCalledWith({
        lastUsedPerSite: { x: 'thread' }
      });
      expect(popup.state.selectedContentType).toBe('thread');
      expect(threadRow.classList.contains('selected')).toBe(true);
      expect(popup.elements.pageRow.classList.contains('selected')).toBe(false);
    });

    test('clicking page row clears that site’s remembered choice', async () => {
      const popup = await createPopup({
        tabUrl: 'https://x.com/foo',
        site: X_SITE,
        prefs: { lastUsedPerSite: { x: 'thread', claude: 'conversation' } }
      });
      Preferences.set.mockClear();

      popup.elements.pageRow.click();

      expect(Preferences.set).toHaveBeenCalledWith({
        lastUsedPerSite: { claude: 'conversation' }
      });
    });

    test('clicking page row on non-supported site does not persist', async () => {
      const popup = await createPopup({ tabUrl: 'https://example.com', site: null });
      Preferences.set.mockClear();

      popup.elements.pageRow.click();

      expect(Preferences.set).not.toHaveBeenCalled();
    });
  });

  describe('handleAction — Page content', () => {
    test('sends extractAndCopy with mode=clipboard when primary is clicked', async () => {
      const popup = await createPopup({ prefs: { outputMode: 'clipboard' } });
      chrome.runtime.sendMessage.mockClear();
      chrome.runtime.sendMessage.mockImplementation((msg, callback) => {
        if (callback) callback({ success: true });
      });

      popup.elements.primaryBtn.click();
      await flushPromises();

      expect(chrome.runtime.sendMessage).toHaveBeenCalledWith(
        { action: 'extractAndCopy', mode: 'clipboard' },
        expect.any(Function)
      );
    });

    test('sends extractAndCopy with mode=file when secondary is clicked (clipboard is primary)', async () => {
      const popup = await createPopup({ prefs: { outputMode: 'clipboard' } });
      chrome.runtime.sendMessage.mockClear();
      chrome.runtime.sendMessage.mockImplementation((msg, callback) => {
        if (callback) callback({ success: true });
      });

      popup.elements.secondaryBtn.click();
      await flushPromises();

      expect(chrome.runtime.sendMessage).toHaveBeenCalledWith(
        { action: 'extractAndCopy', mode: 'file' },
        expect.any(Function)
      );
    });
  });

  describe('handleAction — site content', () => {
    test('sends extractSiteContent with siteId, contentType and mode', async () => {
      const popup = await createPopup({
        tabUrl: 'https://x.com/foo',
        site: X_SITE,
        prefs: { lastUsedPerSite: { x: 'thread' }, outputMode: 'clipboard' }
      });
      chrome.runtime.sendMessage.mockClear();
      chrome.runtime.sendMessage.mockImplementation((msg, callback) => {
        if (callback) callback({ success: true });
      });

      popup.elements.primaryBtn.click();
      await flushPromises();

      expect(chrome.runtime.sendMessage).toHaveBeenCalledWith(
        { action: 'extractSiteContent', siteId: 'x', contentType: 'thread', mode: 'clipboard' },
        expect.any(Function)
      );
    });
  });

  describe('handleAction — success and error', () => {
    test('flashes success and schedules auto-close when autoClosePopup is on', async () => {
      const popup = await createPopup({ prefs: { autoClosePopup: true } });
      const setTimeoutSpy = jest.spyOn(global, 'setTimeout');
      chrome.runtime.sendMessage.mockImplementation((msg, callback) => {
        if (callback) callback({ success: true });
      });

      popup.elements.primaryBtn.click();
      await flushPromises();

      expect(popup.elements.primaryBtn.classList.contains('btn-success')).toBe(true);

      const closeCall = setTimeoutSpy.mock.calls.find(c => c[1] === 1600);
      expect(closeCall).toBeDefined();
      closeCall[0]();
      expect(window.close).toHaveBeenCalled();
      setTimeoutSpy.mockRestore();
    });

    test('flashes success and reverts without closing when autoClosePopup is off', async () => {
      const popup = await createPopup({ prefs: { autoClosePopup: false } });
      const setTimeoutSpy = jest.spyOn(global, 'setTimeout');
      chrome.runtime.sendMessage.mockImplementation((msg, callback) => {
        if (callback) callback({ success: true });
      });

      popup.elements.primaryBtn.click();
      await flushPromises();

      expect(popup.elements.primaryBtn.classList.contains('btn-success')).toBe(true);

      const closeCall = setTimeoutSpy.mock.calls.find(c => c[1] === 1600);
      expect(closeCall).toBeUndefined();

      // Run the flash-revert and busy-reset timers manually
      setTimeoutSpy.mock.calls.forEach(([cb]) => cb());
      expect(window.close).not.toHaveBeenCalled();
      expect(popup.elements.primaryBtn.classList.contains('btn-success')).toBe(false);
      expect(popup.state.busy).toBe(false);
      setTimeoutSpy.mockRestore();
    });

    test('shows inline error banner on failure response', async () => {
      const popup = await createPopup();
      chrome.runtime.sendMessage.mockImplementation((msg, callback) => {
        if (callback) callback({ success: false, error: 'Extraction failed' });
      });

      popup.elements.primaryBtn.click();
      await flushPromises();

      expect(popup.elements.errorBanner.classList.contains('hidden')).toBe(false);
      expect(popup.elements.errorMessage.textContent).toBe('Extraction failed');
      expect(popup.elements.primaryBtn.disabled).toBe(false);
    });

    test('shows generic error message on sendMessage rejection', async () => {
      const popup = await createPopup();
      chrome.runtime.sendMessage.mockImplementation((msg, callback) => {
        chrome.runtime.lastError = { message: 'context invalidated' };
        if (callback) callback(undefined);
        chrome.runtime.lastError = null;
      });

      popup.elements.primaryBtn.click();
      await flushPromises();

      expect(popup.elements.errorBanner.classList.contains('hidden')).toBe(false);
      expect(popup.elements.errorMessage.textContent).toBe('Unexpected error occurred');
    });
  });

  describe('select-elements link', () => {
    test('sends startSelectionMode and closes the popup on success', async () => {
      const popup = await createPopup();
      chrome.runtime.sendMessage.mockImplementation((msg, callback) => {
        if (msg.action === 'startSelectionMode') {
          if (callback) callback({ success: true });
        } else if (callback) {
          callback({});
        }
      });

      popup.elements.selectBtn.click();
      await flushPromises();

      expect(chrome.runtime.sendMessage).toHaveBeenCalledWith(
        { action: 'startSelectionMode' },
        expect.any(Function)
      );
      expect(window.close).toHaveBeenCalled();
    });

    test('shows error banner on selection-start failure', async () => {
      const popup = await createPopup();
      chrome.runtime.sendMessage.mockImplementation((msg, callback) => {
        if (msg.action === 'startSelectionMode') {
          if (callback) callback({ success: false, error: 'No tab' });
        } else if (callback) {
          callback({});
        }
      });

      popup.elements.selectBtn.click();
      await flushPromises();

      expect(popup.elements.errorBanner.classList.contains('hidden')).toBe(false);
      expect(popup.elements.errorMessage.textContent).toBe('No tab');
    });
  });

  describe('selection-active state', () => {
    test('switches view to "selecting" when background reports active picker', async () => {
      const popup = await createPopup({ sendMessageResponse: { active: true } });

      expect(popup.state.view).toBe('selecting');
      expect(popup.elements.popup.classList.contains('selecting')).toBe(true);
      expect(popup.elements.selectionActive.classList.contains('hidden')).toBe(false);
    });

    test('cancel button sends cancelSelectionMode and returns view to main', async () => {
      const popup = await createPopup({ sendMessageResponse: { active: true } });
      chrome.runtime.sendMessage.mockClear();
      chrome.runtime.sendMessage.mockImplementation((msg, callback) => {
        if (callback) callback({});
      });

      popup.elements.cancelSelectBtn.click();
      await flushPromises();

      expect(chrome.runtime.sendMessage).toHaveBeenCalledWith(
        { action: 'cancelSelectionMode' },
        expect.any(Function)
      );
      expect(popup.state.view).toBe('main');
      expect(popup.elements.popup.classList.contains('selecting')).toBe(false);
      expect(popup.elements.selectionActive.classList.contains('hidden')).toBe(true);
    });
  });

  describe('settings button', () => {
    test('opens the options page', async () => {
      const popup = await createPopup();
      popup.elements.settingsBtn.click();
      expect(chrome.runtime.openOptionsPage).toHaveBeenCalled();
    });
  });

  describe('metadata toggle', () => {
    test('saves includeMetadata preference on change', async () => {
      const popup = await createPopup();
      Preferences.set.mockClear();

      popup.elements.metadataToggle.checked = false;
      popup.elements.metadataToggle.dispatchEvent(new Event('change'));

      expect(Preferences.set).toHaveBeenCalledWith({ includeMetadata: false });
    });

    test('reflects pref state on init', async () => {
      const popup = await createPopup({ prefs: { includeMetadata: false } });
      expect(popup.elements.metadataToggle.checked).toBe(false);
    });
  });

  describe('keyboard shortcut', () => {
    test('Ctrl+Enter triggers the primary action', async () => {
      const popup = await createPopup();
      const spy = jest.spyOn(popup, 'handleAction');

      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', ctrlKey: true }));

      expect(spy).toHaveBeenCalled();
    });

    test('Cmd+Enter triggers the primary action', async () => {
      const popup = await createPopup();
      const spy = jest.spyOn(popup, 'handleAction');

      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', metaKey: true }));

      expect(spy).toHaveBeenCalled();
    });

    test('plain Enter is ignored', async () => {
      const popup = await createPopup();
      const spy = jest.spyOn(popup, 'handleAction');

      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter' }));

      expect(spy).not.toHaveBeenCalled();
    });
  });

  describe('error banner', () => {
    test('non-sticky error auto-dismisses after 4s', async () => {
      const popup = await createPopup();
      jest.useFakeTimers();
      popup.showError('something');

      expect(popup.elements.errorBanner.classList.contains('hidden')).toBe(false);
      jest.advanceTimersByTime(4500);
      expect(popup.elements.errorBanner.classList.contains('hidden')).toBe(true);
    });

    test('sticky error stays', async () => {
      const popup = await createPopup();
      jest.useFakeTimers();
      popup.showError('cannot extract', { sticky: true });

      jest.advanceTimersByTime(10000);
      expect(popup.elements.errorBanner.classList.contains('hidden')).toBe(false);
    });
  });

  describe('sendMessageToBackground', () => {
    test('resolves with response on success', async () => {
      const popup = await createPopup();
      chrome.runtime.sendMessage.mockImplementation((msg, callback) => {
        if (callback) callback({ ok: true });
      });

      const result = await popup.sendMessageToBackground({ action: 'x' });
      expect(result).toEqual({ ok: true });
    });

    test('rejects with lastError when present', async () => {
      const popup = await createPopup();
      chrome.runtime.sendMessage.mockImplementation((msg, callback) => {
        chrome.runtime.lastError = { message: 'oops' };
        if (callback) callback(undefined);
        chrome.runtime.lastError = null;
      });

      await expect(popup.sendMessageToBackground({ action: 'x' })).rejects.toThrow('oops');
    });
  });
});
