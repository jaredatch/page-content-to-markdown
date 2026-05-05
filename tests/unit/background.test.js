let BackgroundScript;

describe('BackgroundScript', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.resetModules();

    // Reset chrome API mocks (they're global, survive resetModules)
    chrome.tabs.query.mockReset();
    chrome.tabs.sendMessage.mockReset();
    chrome.runtime.onMessage.addListener.mockReset();
    chrome.runtime.onInstalled.addListener.mockReset();
    chrome.notifications.create.mockReset();
    chrome.contextMenus.create.mockReset();
    chrome.contextMenus.onClicked.addListener.mockReset();
    chrome.commands.onCommand.addListener.mockReset();
    chrome.tabs.onRemoved.addListener.mockReset();
    chrome.tabs.onUpdated.addListener.mockReset();
    global.navigator.clipboard.writeText.mockReset();
    chrome.storage.local.get.mockReset();
    chrome.storage.local.set.mockReset();
    chrome.downloads.download.mockReset();
    chrome.storage.local.get.mockResolvedValue({});
    chrome.storage.local.set.mockResolvedValue();
    chrome.downloads.download.mockImplementation((options, callback) => {
      if (callback) callback(1);
    });

    // Fresh import — module re-evaluates, constructor runs, listeners attached
    BackgroundScript = require('../../src/background/background');
  });

  describe('initialization', () => {
    test('should set up message listener', () => {
      expect(chrome.runtime.onMessage.addListener).toHaveBeenCalledWith(
        expect.any(Function)
      );
    });

    test('should log initialization', () => {
      const consoleSpy = jest.spyOn(console, 'log');
      jest.resetModules();

      require('../../src/background/background');

      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('🚀 [background] Background script loaded')
      );

      consoleSpy.mockRestore();
    });
  });

  describe('extractContentFromActiveTab', () => {
    test('should extract content from active tab successfully', async () => {
      chrome.tabs.query.mockResolvedValue([{ id: 123, url: 'https://example.com' }]);

      chrome.tabs.sendMessage.mockResolvedValue({
        success: true,
        markdown: '# Test Content\n\nThis is test content.',
        metadata: {
          title: 'Test Page',
          url: 'https://example.com'
        },
        extractionInfo: {
          method: 'turndown',
          note: 'Primary conversion'
        }
      });

      const result = await BackgroundScript.extractContentFromActiveTab();

      expect(chrome.tabs.query).toHaveBeenCalledWith({
        active: true,
        currentWindow: true
      });

      expect(chrome.tabs.sendMessage).toHaveBeenCalledWith(123,
        expect.objectContaining({
          action: 'extractContent',
          options: expect.objectContaining({ includeMetadata: true })
        })
      );

      expect(result.success).toBe(true);
      expect(result.markdown).toContain('# Test Content');
    });

    test('should handle no active tab', async () => {
      chrome.tabs.query.mockResolvedValue([]);

      const result = await BackgroundScript.extractContentFromActiveTab();

      expect(result).toEqual({
        success: false,
        error: 'No active tab found'
      });
    });

    test('should handle content script errors', async () => {
      chrome.tabs.query.mockResolvedValue([{ id: 123 }]);
      chrome.tabs.sendMessage.mockResolvedValue({
        success: false,
        error: 'Content extraction failed'
      });

      const result = await BackgroundScript.extractContentFromActiveTab();

      // tabId is always threaded onto the response so dispatch downstream
      // binds to the originating tab — see H2.
      expect(result).toEqual({
        success: false,
        error: 'Content extraction failed',
        tabId: 123
      });
    });

    test('should handle communication errors', async () => {
      chrome.tabs.query.mockResolvedValue([{ id: 123 }]);
      chrome.tabs.sendMessage.mockRejectedValue(new Error('Communication failed'));

      const result = await BackgroundScript.extractContentFromActiveTab();

      expect(result).toEqual({
        success: false,
        error: 'Failed to communicate with content script: Communication failed'
      });
    });
  });

  describe('copyToClipboard', () => {
    test('should copy text to clipboard successfully', async () => {
      navigator.clipboard.writeText.mockResolvedValue();

      const result = await BackgroundScript.copyToClipboard('Test content');

      expect(navigator.clipboard.writeText).toHaveBeenCalledWith('Test content');
      expect(result).toEqual({
        success: true,
        message: 'Content copied to clipboard'
      });
    });

    test('should handle clipboard errors when no source tab is provided', async () => {
      navigator.clipboard.writeText.mockRejectedValue(new Error('Clipboard access denied'));

      // No tabId — the SW fallback has nowhere to delegate.
      const result = await BackgroundScript.copyToClipboard('Test content');

      expect(result).toEqual({
        success: false,
        error: 'Failed to copy to clipboard: SW clipboard failed (Clipboard access denied); no source tab available for content-script fallback'
      });
    });

    test('should handle empty content', async () => {
      const result = await BackgroundScript.copyToClipboard('');

      expect(result).toEqual({
        success: false,
        error: 'No content to copy'
      });
    });

    test('should handle null content', async () => {
      const result = await BackgroundScript.copyToClipboard(null);

      expect(result).toEqual({
        success: false,
        error: 'No content to copy'
      });
    });
  });

  describe('message handler', () => {
    const flush = () => flushPromises();

    test('should handle extractAndCopy message', async () => {
      const messageHandler = chrome.runtime.onMessage.addListener.mock.calls[0][0];
      const sendResponse = jest.fn();

      chrome.tabs.query.mockResolvedValue([{ id: 123 }]);
      chrome.tabs.sendMessage.mockResolvedValue({
        success: true,
        markdown: '# Test Content'
      });
      navigator.clipboard.writeText.mockResolvedValue();

      messageHandler(
        { action: 'extractAndCopy' },
        { tab: { id: 123 } },
        sendResponse
      );
      await flush();

      expect(sendResponse).toHaveBeenCalledWith({
        success: true,
        message: 'Content copied to clipboard',
        method: 'clipboard'
      });
    });

    test('should ignore unknown messages', async () => {
      const messageHandler = chrome.runtime.onMessage.addListener.mock.calls[0][0];
      const sendResponse = jest.fn();

      const result = await messageHandler(
        { action: 'unknownAction' },
        { tab: { id: 123 } },
        sendResponse
      );

      expect(result).toBe(false);
      expect(sendResponse).not.toHaveBeenCalled();
    });

    test('should handle startSelectionMode message', async () => {
      const messageHandler = chrome.runtime.onMessage.addListener.mock.calls[0][0];
      const sendResponse = jest.fn();

      chrome.tabs.query.mockResolvedValue([{ id: 123 }]);
      chrome.tabs.sendMessage.mockResolvedValue({ success: true });

      messageHandler(
        { action: 'startSelectionMode' },
        {},
        sendResponse
      );
      await flush();

      expect(chrome.tabs.sendMessage).toHaveBeenCalledWith(123, {
        action: 'startSelectionMode'
      });
      expect(sendResponse).toHaveBeenCalledWith({ success: true });
    });

    test('should handle getSelectionState message', async () => {
      const messageHandler = chrome.runtime.onMessage.addListener.mock.calls[0][0];
      const sendResponse = jest.fn();

      chrome.tabs.query.mockResolvedValue([{ id: 123 }]);

      // No selection active yet
      messageHandler(
        { action: 'getSelectionState' },
        {},
        sendResponse
      );
      await flush();

      expect(sendResponse).toHaveBeenCalledWith({ active: false });
    });

    test('should handle selectionComplete message', async () => {
      const messageHandler = chrome.runtime.onMessage.addListener.mock.calls[0][0];
      const sendResponse = jest.fn();

      navigator.clipboard.writeText.mockResolvedValue();

      messageHandler(
        {
          action: 'selectionComplete',
          result: {
            success: true,
            markdown: '## Selected\n\nContent here.',
            extractionInfo: { note: '1 element' }
          }
        },
        { tab: { id: 123 } },
        sendResponse
      );
      await flush();

      expect(navigator.clipboard.writeText).toHaveBeenCalledWith('## Selected\n\nContent here.');
    });

    test('should handle selectionCancelled message', () => {
      const messageHandler = chrome.runtime.onMessage.addListener.mock.calls[0][0];
      const sendResponse = jest.fn();

      // Set up selection state first
      BackgroundScript.getSelectionState().set(123, { active: true });

      messageHandler(
        { action: 'selectionCancelled' },
        { tab: { id: 123 } },
        sendResponse
      );

      expect(BackgroundScript.getSelectionState().has(123)).toBe(false);
    });

    test('should handle cancelSelectionMode message', async () => {
      const messageHandler = chrome.runtime.onMessage.addListener.mock.calls[0][0];
      const sendResponse = jest.fn();

      chrome.tabs.query.mockResolvedValue([{ id: 123 }]);
      chrome.tabs.sendMessage.mockResolvedValue({ success: true });

      messageHandler(
        { action: 'cancelSelectionMode' },
        {},
        sendResponse
      );
      await flush();

      expect(chrome.tabs.sendMessage).toHaveBeenCalledWith(123, {
        action: 'cancelSelectionMode'
      });
      expect(sendResponse).toHaveBeenCalledWith({ success: true });
    });
  });

  describe('context menu', () => {
    test('should register context menus on install', () => {
      expect(chrome.runtime.onInstalled.addListener).toHaveBeenCalled();

      // Simulate onInstalled callback
      const onInstalledCallback = chrome.runtime.onInstalled.addListener.mock.calls[0][0];
      onInstalledCallback();

      expect(chrome.contextMenus.create).toHaveBeenCalledWith({
        id: 'convert-selection',
        title: 'Copy selection as Markdown',
        contexts: ['selection']
      });
      expect(chrome.contextMenus.create).toHaveBeenCalledWith({
        id: 'select-element',
        title: 'Select element for Markdown',
        contexts: ['page', 'image', 'link']
      });
    });

    test('should set up context menu click listener', () => {
      expect(chrome.contextMenus.onClicked.addListener).toHaveBeenCalledWith(
        expect.any(Function)
      );
    });
  });

  describe('commands', () => {
    const flush = () => flushPromises();

    test('should set up command listener', () => {
      expect(chrome.commands.onCommand.addListener).toHaveBeenCalledWith(
        expect.any(Function)
      );
    });

    test('should toggle selection mode on command', async () => {
      const commandHandler = chrome.commands.onCommand.addListener.mock.calls[0][0];

      chrome.tabs.query.mockResolvedValue([{ id: 456 }]);
      chrome.tabs.sendMessage.mockResolvedValue({ success: true });

      commandHandler('toggle-selection-mode');
      await flush();

      expect(chrome.tabs.sendMessage).toHaveBeenCalledWith(456, {
        action: 'startSelectionMode'
      });
    });
  });

  describe('generateFilename', () => {
    // Behavioral coverage of template/style/sanitization lives in
    // filename-template.test.js. These tests just check that
    // BackgroundScript wires prefs + metadata into the formatter.
    const DEFAULT_PREFS = {
      filenameTemplate: '{title} - {date}',
      filenameStyle: 'preserve'
    };

    test('formats from metadata using default prefs', () => {
      const filename = BackgroundScript.generateFilename(
        { title: 'My Page' },
        DEFAULT_PREFS
      );
      expect(filename).toMatch(/^My Page - \d{4}-\d{2}-\d{2}\.md$/);
    });

    test('respects custom template + style from prefs', () => {
      const filename = BackgroundScript.generateFilename(
        { title: 'My Page', url: 'https://www.example.com/' },
        { filenameTemplate: '{domain}-{title}', filenameStyle: 'kebab' }
      );
      expect(filename).toBe('example-com-my-page.md');
    });

    test('falls back to page.md when metadata is null', () => {
      const filename = BackgroundScript.generateFilename(null, DEFAULT_PREFS);
      expect(filename).toMatch(/^page - /);
    });
  });

  describe('saveAsFile', () => {
    test('should delegate file save to content script', async () => {
      chrome.tabs.sendMessage.mockResolvedValue({ success: true });

      const result = await BackgroundScript.saveAsFile('# Hello', 'test.md', 123);

      expect(chrome.tabs.sendMessage).toHaveBeenCalledWith(123, {
        action: 'saveAsFile',
        markdown: '# Hello',
        filename: 'test.md'
      });
      expect(result.success).toBe(true);
      expect(result.method).toBe('file');
    });

    test('should handle content script save failure', async () => {
      chrome.tabs.sendMessage.mockResolvedValue({ success: false, error: 'Save failed' });

      const result = await BackgroundScript.saveAsFile('# Hello', 'test.md', 123);
      expect(result.success).toBe(false);
      expect(result.error).toBe('Save failed');
    });

    test('should fail when no source tab is provided', async () => {
      const result = await BackgroundScript.saveAsFile('# Hello', 'test.md');
      expect(result.success).toBe(false);
      expect(result.error).toBe('No source tab available for file save');
    });
  });

  describe('dispatchOutput', () => {
    test('should copy to clipboard when outputMode is clipboard', async () => {
      chrome.storage.local.get.mockResolvedValue({ outputMode: 'clipboard' });
      navigator.clipboard.writeText.mockResolvedValue();

      const result = await BackgroundScript.dispatchOutput('# Content', { title: 'Test' });

      expect(navigator.clipboard.writeText).toHaveBeenCalledWith('# Content');
      expect(result.success).toBe(true);
      expect(result.method).toBe('clipboard');
    });

    test('should save as file when outputMode is file', async () => {
      chrome.storage.local.get.mockResolvedValue({ outputMode: 'file' });
      chrome.tabs.sendMessage.mockResolvedValue({ success: true });

      const result = await BackgroundScript.dispatchOutput('# Content', { title: 'Test Page' }, undefined, 123);

      expect(chrome.tabs.sendMessage).toHaveBeenCalledWith(123, expect.objectContaining({
        action: 'saveAsFile'
      }));
      expect(result.success).toBe(true);
      expect(result.method).toBe('file');
    });

    test('should default to clipboard when no preference stored', async () => {
      chrome.storage.local.get.mockResolvedValue({});
      navigator.clipboard.writeText.mockResolvedValue();

      const result = await BackgroundScript.dispatchOutput('# Content', { title: 'Test' });

      expect(result.method).toBe('clipboard');
    });
  });

  describe('clipboard fallback', () => {
    test('should fallback to content script when navigator.clipboard fails', async () => {
      navigator.clipboard.writeText.mockRejectedValue(new Error('Not allowed'));
      chrome.tabs.sendMessage.mockResolvedValue({ success: true });

      const result = await BackgroundScript.copyToClipboard('Test content', 123);

      expect(chrome.tabs.sendMessage).toHaveBeenCalledWith(123, {
        action: 'writeToClipboard',
        text: 'Test content'
      });
      expect(result.success).toBe(true);
    });

    test('should fail if both clipboard API and fallback fail', async () => {
      navigator.clipboard.writeText.mockRejectedValue(new Error('Not allowed'));
      chrome.tabs.sendMessage.mockResolvedValue({ success: false });

      const result = await BackgroundScript.copyToClipboard('Test content', 123);

      expect(result.success).toBe(false);
    });
  });

  describe('extractContentFromActiveTab with preferences', () => {
    test('should pass includeMetadata option to content script', async () => {
      chrome.storage.local.get.mockResolvedValue({ includeMetadata: false });
      chrome.tabs.query.mockResolvedValue([{ id: 123, url: 'https://example.com' }]);
      chrome.tabs.sendMessage.mockResolvedValue({
        success: true,
        markdown: '# Test',
        metadata: { title: 'Test' }
      });

      await BackgroundScript.extractContentFromActiveTab();

      expect(chrome.tabs.sendMessage).toHaveBeenCalledWith(123,
        expect.objectContaining({
          action: 'extractContent',
          options: expect.objectContaining({ includeMetadata: false })
        })
      );
    });
  });

  describe('tab cleanup', () => {
    test('should set up tab removal listener', () => {
      expect(chrome.tabs.onRemoved.addListener).toHaveBeenCalledWith(
        expect.any(Function)
      );
    });

    test('should set up tab update listener', () => {
      expect(chrome.tabs.onUpdated.addListener).toHaveBeenCalledWith(
        expect.any(Function)
      );
    });

    test('should clear selection state on tab removal', () => {
      BackgroundScript.getSelectionState().set(999, { active: true });

      const removeHandler = chrome.tabs.onRemoved.addListener.mock.calls[0][0];
      removeHandler(999);

      expect(BackgroundScript.getSelectionState().has(999)).toBe(false);
    });

    test('should clear selection state on navigation', () => {
      BackgroundScript.getSelectionState().set(888, { active: true });

      const updateHandler = chrome.tabs.onUpdated.addListener.mock.calls[0][0];
      updateHandler(888, { status: 'loading' });

      expect(BackgroundScript.getSelectionState().has(888)).toBe(false);
    });
  });

  describe('site content extraction', () => {
    test('should route extractSiteContent message to content script', async () => {
      const mockTab = { id: 1, url: 'https://x.com/user/status/123' };
      chrome.tabs.query.mockResolvedValue([mockTab]);
      chrome.tabs.sendMessage.mockResolvedValue({
        success: true,
        markdown: '## @user\n\nTweet\n\n---',
        metadata: { title: 'Tweet', url: 'https://x.com/user/status/123' }
      });
      global.navigator.clipboard.writeText.mockResolvedValue();

      const messageHandler = chrome.runtime.onMessage.addListener.mock.calls[0][0];
      const sendResponse = jest.fn();

      const result = messageHandler(
        { action: 'extractSiteContent', siteId: 'x', contentType: 'single-tweet' },
        {},
        sendResponse
      );

      expect(result).toBe(true); // async response

      // Wait for async operations
      await flushPromises();

      expect(chrome.tabs.sendMessage).toHaveBeenCalledWith(
        1,
        expect.objectContaining({
          action: 'extractSiteContent',
          siteId: 'x',
          contentType: 'single-tweet'
        })
      );
      expect(sendResponse).toHaveBeenCalledWith(
        expect.objectContaining({ success: true })
      );
    });

    test('should handle site extraction failure', async () => {
      chrome.tabs.query.mockResolvedValue([]);

      const messageHandler = chrome.runtime.onMessage.addListener.mock.calls[0][0];
      const sendResponse = jest.fn();

      messageHandler(
        { action: 'extractSiteContent', siteId: 'x', contentType: 'single-tweet' },
        {},
        sendResponse
      );

      await flushPromises();

      expect(sendResponse).toHaveBeenCalledWith(
        expect.objectContaining({ success: false })
      );
    });

    test('should dispatch site content through output pipeline', async () => {
      const mockTab = { id: 1, url: 'https://x.com/user/status/123' };
      chrome.tabs.query.mockResolvedValue([mockTab]);
      chrome.storage.local.get.mockResolvedValue({ outputMode: 'clipboard' });
      chrome.tabs.sendMessage.mockResolvedValue({
        success: true,
        markdown: '## @user\n\nTweet content\n\n---',
        metadata: { title: 'Tweet' }
      });
      global.navigator.clipboard.writeText.mockResolvedValue();

      const messageHandler = chrome.runtime.onMessage.addListener.mock.calls[0][0];
      const sendResponse = jest.fn();

      messageHandler(
        { action: 'extractSiteContent', siteId: 'x', contentType: 'thread' },
        {},
        sendResponse
      );

      await flushPromises();

      // Clipboard should have been called with the markdown
      expect(global.navigator.clipboard.writeText).toHaveBeenCalled();
    });
  });
});
