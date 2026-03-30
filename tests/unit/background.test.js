let BackgroundScript;

describe('BackgroundScript', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.resetModules();

    // Reset chrome API mocks (they're global, survive resetModules)
    chrome.tabs.query.mockReset();
    chrome.tabs.sendMessage.mockReset();
    chrome.action.onClicked.addListener.mockReset();
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
    test('should set up action click listener', () => {
      expect(chrome.action.onClicked.addListener).toHaveBeenCalledWith(
        expect.any(Function)
      );
    });

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

      expect(result).toEqual({
        success: false,
        error: 'Content extraction failed'
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

    test('should handle clipboard errors', async () => {
      navigator.clipboard.writeText.mockRejectedValue(new Error('Clipboard access denied'));
      // No active tab for fallback either
      chrome.tabs.query.mockResolvedValue([]);

      const result = await BackgroundScript.copyToClipboard('Test content');

      expect(result).toEqual({
        success: false,
        error: 'Failed to copy to clipboard: Clipboard access denied'
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

  describe('action click handler', () => {
    // Helper: the onClicked callback doesn't return a promise,
    // so we need to flush microtasks after calling it.
    const flush = () => flushPromises();

    test('should extract and copy content on action click', async () => {
      const actionClickHandler = chrome.action.onClicked.addListener.mock.calls[0][0];

      chrome.tabs.query.mockResolvedValue([{ id: 123 }]);
      chrome.tabs.sendMessage.mockResolvedValue({
        success: true,
        markdown: '# Test Content',
        metadata: { title: 'Test' }
      });

      navigator.clipboard.writeText.mockResolvedValue();

      actionClickHandler({ id: 123 });
      await flush();

      expect(chrome.tabs.sendMessage).toHaveBeenCalledWith(123,
        expect.objectContaining({
          action: 'extractContent',
          options: expect.objectContaining({ includeMetadata: true })
        })
      );
      expect(navigator.clipboard.writeText).toHaveBeenCalledWith('# Test Content');
    });

    test('should handle extraction failure on action click', async () => {
      const actionClickHandler = chrome.action.onClicked.addListener.mock.calls[0][0];

      chrome.tabs.query.mockResolvedValue([{ id: 123 }]);
      chrome.tabs.sendMessage.mockResolvedValue({
        success: false,
        error: 'Extraction failed'
      });

      const consoleSpy = jest.spyOn(console, 'error');

      actionClickHandler({ id: 123 });
      await flush();

      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('Failed to extract content'),
        expect.anything()
      );

      consoleSpy.mockRestore();
    });

    test('should handle missing metadata gracefully in notification', async () => {
      const actionClickHandler = chrome.action.onClicked.addListener.mock.calls[0][0];

      chrome.tabs.query.mockResolvedValue([{ id: 123 }]);
      chrome.tabs.sendMessage.mockResolvedValue({
        success: true,
        markdown: '# Test Content'
        // no metadata field
      });

      navigator.clipboard.writeText.mockResolvedValue();

      actionClickHandler({ id: 123 });
      await flush();

      expect(navigator.clipboard.writeText).toHaveBeenCalledWith('# Test Content');
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
    test('should create filename from title and date', () => {
      const filename = BackgroundScript.generateFilename({ title: 'My Page' });
      expect(filename).toMatch(/^My Page - \d{4}-\d{2}-\d{2}\.md$/);
    });

    test('should strip invalid filename characters', () => {
      const filename = BackgroundScript.generateFilename({ title: 'File: with/bad*chars?"<>|' });
      expect(filename).not.toMatch(/[\/\\:*?"<>|]/);
      expect(filename).toContain('File');
    });

    test('should collapse whitespace', () => {
      const filename = BackgroundScript.generateFilename({ title: 'Lots   of    spaces' });
      expect(filename).toContain('Lots of spaces');
    });

    test('should truncate long titles to 80 chars', () => {
      const longTitle = 'A'.repeat(120);
      const filename = BackgroundScript.generateFilename({ title: longTitle });
      // Title portion should be 80 chars max, plus " - YYYY-MM-DD.md"
      const titlePart = filename.split(' - ')[0];
      expect(titlePart.length).toBeLessThanOrEqual(80);
    });

    test('should fallback to "page" when title is missing', () => {
      const filename = BackgroundScript.generateFilename({});
      expect(filename).toMatch(/^page - \d{4}-\d{2}-\d{2}\.md$/);
    });

    test('should fallback to "page" when metadata is null', () => {
      const filename = BackgroundScript.generateFilename(null);
      expect(filename).toMatch(/^page - /);
    });
  });

  describe('saveAsFile', () => {
    test('should delegate file save to content script', async () => {
      chrome.tabs.query.mockResolvedValue([{ id: 123 }]);
      chrome.tabs.sendMessage.mockResolvedValue({ success: true });

      const result = await BackgroundScript.saveAsFile('# Hello', 'test.md');

      expect(chrome.tabs.sendMessage).toHaveBeenCalledWith(123, {
        action: 'saveAsFile',
        markdown: '# Hello',
        filename: 'test.md'
      });
      expect(result.success).toBe(true);
      expect(result.method).toBe('file');
    });

    test('should handle content script save failure', async () => {
      chrome.tabs.query.mockResolvedValue([{ id: 123 }]);
      chrome.tabs.sendMessage.mockResolvedValue({ success: false, error: 'Save failed' });

      const result = await BackgroundScript.saveAsFile('# Hello', 'test.md');
      expect(result.success).toBe(false);
      expect(result.error).toBe('Save failed');
    });

    test('should handle no active tab', async () => {
      chrome.tabs.query.mockResolvedValue([]);

      const result = await BackgroundScript.saveAsFile('# Hello', 'test.md');
      expect(result.success).toBe(false);
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
      chrome.tabs.query.mockResolvedValue([{ id: 123 }]);
      chrome.tabs.sendMessage.mockResolvedValue({ success: true });

      const result = await BackgroundScript.dispatchOutput('# Content', { title: 'Test Page' });

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
      chrome.tabs.query.mockResolvedValue([{ id: 123 }]);
      chrome.tabs.sendMessage.mockResolvedValue({ success: true });

      const result = await BackgroundScript.copyToClipboard('Test content');

      expect(chrome.tabs.sendMessage).toHaveBeenCalledWith(123, {
        action: 'writeToClipboard',
        text: 'Test content'
      });
      expect(result.success).toBe(true);
    });

    test('should fail if both clipboard API and fallback fail', async () => {
      navigator.clipboard.writeText.mockRejectedValue(new Error('Not allowed'));
      chrome.tabs.query.mockResolvedValue([{ id: 123 }]);
      chrome.tabs.sendMessage.mockResolvedValue({ success: false });

      const result = await BackgroundScript.copyToClipboard('Test content');

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

  describe('X content extraction', () => {
    test('should route extractXContent message to content script', async () => {
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
        { action: 'extractXContent', contentType: 'single-tweet' },
        {},
        sendResponse
      );

      expect(result).toBe(true); // async response

      // Wait for async operations
      await flushPromises();

      expect(chrome.tabs.sendMessage).toHaveBeenCalledWith(
        1,
        expect.objectContaining({
          action: 'extractXContent',
          contentType: 'single-tweet'
        })
      );
      expect(sendResponse).toHaveBeenCalledWith(
        expect.objectContaining({ success: true })
      );
    });

    test('should handle X extraction failure', async () => {
      chrome.tabs.query.mockResolvedValue([]);

      const messageHandler = chrome.runtime.onMessage.addListener.mock.calls[0][0];
      const sendResponse = jest.fn();

      messageHandler(
        { action: 'extractXContent', contentType: 'single-tweet' },
        {},
        sendResponse
      );

      await flushPromises();

      expect(sendResponse).toHaveBeenCalledWith(
        expect.objectContaining({ success: false })
      );
    });

    test('should dispatch X content through output pipeline', async () => {
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
        { action: 'extractXContent', contentType: 'thread' },
        {},
        sendResponse
      );

      await flushPromises();

      // Clipboard should have been called with the markdown
      expect(global.navigator.clipboard.writeText).toHaveBeenCalled();
    });
  });
});
