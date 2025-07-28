let BackgroundScript;

describe('BackgroundScript', () => {
  beforeEach(() => {
    // Reset all mocks
    jest.clearAllMocks();
    
    // Reset chrome API mocks
    chrome.tabs.query.mockReset();
    chrome.tabs.sendMessage.mockReset();
    chrome.action.onClicked.addListener.mockReset();
    chrome.runtime.onMessage.addListener.mockReset();
    
    // Mock clipboard API
    global.navigator.clipboard.writeText.mockReset();

    // Import background script
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
      
      // Re-require to trigger initialization
      delete require.cache[require.resolve('../../src/background/background')];
      require('../../src/background/background');
      
      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('🚀 [background] Background script loaded')
      );
      
      consoleSpy.mockRestore();
    });
  });

  describe('extractContentFromActiveTab', () => {
    test('should extract content from active tab successfully', async () => {
      // Mock successful tab query
      chrome.tabs.query.mockResolvedValue([{ id: 123, url: 'https://example.com' }]);
      
      // Mock successful content extraction
      chrome.tabs.sendMessage.mockResolvedValue({
        success: true,
        markdown: '# Test Content\n\nThis is test content.',
        metadata: {
          title: 'Test Page',
          url: 'https://example.com'
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

      expect(result).toEqual({
        success: true,
        markdown: '# Test Content\n\nThis is test content.',
        metadata: {
          title: 'Test Page',
          url: 'https://example.com'
        }
      });
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
    test('should extract and copy content on action click', async () => {
      // Mock the action click handler
      const actionClickHandler = chrome.action.onClicked.addListener.mock.calls[0][0];
      
      // Mock successful extraction
      chrome.tabs.query.mockResolvedValue([{ id: 123 }]);
      chrome.tabs.sendMessage.mockResolvedValue({
        success: true,
        markdown: '# Test Content',
        metadata: { title: 'Test' }
      });
      
      // Mock successful clipboard copy
      navigator.clipboard.writeText.mockResolvedValue();

      await actionClickHandler({ id: 123 });

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

      await actionClickHandler({ id: 123 });

      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('Failed to extract content')
      );

      consoleSpy.mockRestore();
    });
  });

  describe('message handler', () => {
    test('should handle extractAndCopy message', async () => {
      const messageHandler = chrome.runtime.onMessage.addListener.mock.calls[0][0];
      const sendResponse = jest.fn();

      // Mock successful extraction and copy
      chrome.tabs.query.mockResolvedValue([{ id: 123 }]);
      chrome.tabs.sendMessage.mockResolvedValue({
        success: true,
        markdown: '# Test Content'
      });
      navigator.clipboard.writeText.mockResolvedValue();

      await messageHandler(
        { action: 'extractAndCopy' },
        { tab: { id: 123 } },
        sendResponse
      );

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
  });
}); 