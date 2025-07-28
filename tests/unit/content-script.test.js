// Mock the MarkdownConverter since it will be bundled with the content script
const mockConverter = {
  convertToMarkdown: jest.fn()
};

// Mock the content script functions
let ContentScript;

describe('ContentScript', () => {
  beforeEach(() => {
    // Reset mocks
    jest.clearAllMocks();
    mockConverter.convertToMarkdown.mockReset();
    
    // Mock DOM
    document.body.innerHTML = `
      <div>
        <h1>Test Page</h1>
        <p>This is test content.</p>
      </div>
    `;

    // Reset chrome API mocks
    chrome.runtime.sendMessage.mockReset();
    chrome.runtime.onMessage.addListener.mockReset();

    // Import content script functionality
    ContentScript = require('../../src/content/content-script');
  });

  describe('extractPageContent', () => {
    test('should extract page HTML content', () => {
      const content = ContentScript.extractPageContent();
      
      expect(content).toContain('<h1>Test Page</h1>');
      expect(content).toContain('<p>This is test content.</p>');
      expect(typeof content).toBe('string');
    });

    test('should extract page title', () => {
      document.title = 'Test Page Title';
      const content = ContentScript.extractPageContent();
      
      expect(content).toBeDefined();
      expect(typeof content).toBe('string');
    });

    test('should handle empty page', () => {
      document.body.innerHTML = '';
      const content = ContentScript.extractPageContent();
      
      expect(content).toBe('');
    });
  });

  describe('getPageMetadata', () => {
    test('should extract basic page metadata', () => {
      document.title = 'Test Page Title';
      const url = 'https://example.com/test';
      
      // Mock window.location
      Object.defineProperty(window, 'location', {
        value: { href: url },
        writable: true
      });

      const metadata = ContentScript.getPageMetadata();
      
      expect(metadata).toEqual({
        title: 'Test Page Title',
        url: url,
        timestamp: expect.any(String)
      });
    });

    test('should handle missing title', () => {
      document.title = '';
      
      const metadata = ContentScript.getPageMetadata();
      
      expect(metadata.title).toBe('Untitled Page');
    });
  });

  describe('message handling', () => {
    test('should respond to extractContent message', async () => {
      const sendResponse = jest.fn();
      mockConverter.convertToMarkdown.mockReturnValue('# Test\n\nContent');
      
      // Simulate the message listener
      const messageHandler = chrome.runtime.onMessage.addListener.mock.calls[0][0];
      
      await messageHandler(
        { action: 'extractContent' },
        { tab: { id: 1 } },
        sendResponse
      );

      expect(sendResponse).toHaveBeenCalledWith({
        success: true,
        markdown: expect.stringContaining('# Test'),
        metadata: expect.objectContaining({
          title: expect.any(String),
          url: expect.any(String)
        })
      });
    });

    test('should handle extraction errors', async () => {
      const sendResponse = jest.fn();
      mockConverter.convertToMarkdown.mockImplementation(() => {
        throw new Error('Conversion failed');
      });
      
      const messageHandler = chrome.runtime.onMessage.addListener.mock.calls[0][0];
      
      await messageHandler(
        { action: 'extractContent' },
        { tab: { id: 1 } },
        sendResponse
      );

      expect(sendResponse).toHaveBeenCalledWith({
        success: false,
        error: 'Failed to extract content: Conversion failed'
      });
    });

    test('should ignore unknown messages', async () => {
      const sendResponse = jest.fn();
      
      const messageHandler = chrome.runtime.onMessage.addListener.mock.calls[0][0];
      
      const result = await messageHandler(
        { action: 'unknownAction' },
        { tab: { id: 1 } },
        sendResponse
      );

      expect(result).toBe(false);
      expect(sendResponse).not.toHaveBeenCalled();
    });
  });

  describe('initialization', () => {
    test('should set up message listener on load', () => {
      expect(chrome.runtime.onMessage.addListener).toHaveBeenCalledWith(
        expect.any(Function)
      );
    });

    test('should log initialization', () => {
      const consoleSpy = jest.spyOn(console, 'log');
      
      // Re-require to trigger initialization
      delete require.cache[require.resolve('../../src/content/content-script')];
      require('../../src/content/content-script');
      
      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('🚀 [content-script] Content script loaded')
      );
      
      consoleSpy.mockRestore();
    });
  });
}); 