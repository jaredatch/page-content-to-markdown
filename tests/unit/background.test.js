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

      expect(chrome.tabs.sendMessage).toHaveBeenCalledWith(123, {
        action: 'extractContent'
      });

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
    const flush = () => new Promise(resolve => setTimeout(resolve, 10));

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

      expect(chrome.tabs.sendMessage).toHaveBeenCalledWith(123, {
        action: 'extractContent'
      });
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
    const flush = () => new Promise(resolve => setTimeout(resolve, 10));

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
        message: 'Content copied to clipboard'
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
    const flush = () => new Promise(resolve => setTimeout(resolve, 10));

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
});
