// Mock MarkdownConverter before requiring content-script
jest.mock('../../src/utils/markdown-converter', () => {
  return jest.fn().mockImplementation(() => ({
    convertToMarkdown: jest.fn().mockReturnValue('')
  }));
});

jest.mock('../../src/utils/simple-universal-extractor', () => {
  return jest.fn().mockImplementation(() => ({
    extractContent: jest.fn().mockResolvedValue({
      success: true,
      markdown: '# Fallback Content\n\nExtracted text.',
      method: 'guaranteed-text-extraction',
      note: 'Fallback'
    })
  }));
});

jest.mock('../../src/content/element-picker', () => {
  return jest.fn().mockImplementation(({ onConfirm, onCancel }) => ({
    activate: jest.fn(),
    deactivate: jest.fn(),
    onConfirm,
    onCancel,
    selectedElements: [],
    getSelectedHtml: jest.fn().mockReturnValue([])
  }));
});

let MarkdownConverter;
let SimpleUniversalExtractor;
let ContentScript;

describe('ContentScript', () => {
  let mockConvertToMarkdown;
  let mockExtractContent;

  beforeEach(() => {
    jest.clearAllMocks();
    jest.resetModules();

    // Re-require mocked modules after resetModules
    MarkdownConverter = require('../../src/utils/markdown-converter');
    SimpleUniversalExtractor = require('../../src/utils/simple-universal-extractor');

    // Set up mock return values
    mockConvertToMarkdown = jest.fn().mockReturnValue('');
    const mockConvertHtmlFragment = jest.fn().mockReturnValue('## Fragment\n\nConverted fragment text.');
    MarkdownConverter.mockImplementation(() => ({
      convertToMarkdown: mockConvertToMarkdown,
      convertHtmlFragment: mockConvertHtmlFragment
    }));

    mockExtractContent = jest.fn().mockResolvedValue({
      success: true,
      markdown: '# Fallback\n\nFallback text content here for testing purposes.',
      method: 'guaranteed-text-extraction',
      note: 'Fallback'
    });
    SimpleUniversalExtractor.mockImplementation(() => ({
      extractContent: mockExtractContent
    }));

    // Mock DOM
    document.body.innerHTML = `
      <article>
        <h1>Test Page</h1>
        <p>This is test content with enough text to pass the threshold for conversion.</p>
      </article>
    `;
    document.title = 'Test Page';

    // Reset chrome API mocks
    chrome.runtime.onMessage.addListener.mockReset();

    ContentScript = require('../../src/content/content-script');
  });

  describe('convertPageToMarkdown', () => {
    test('should use Turndown as primary converter when it returns substantial content', async () => {
      mockConvertToMarkdown.mockReturnValue('## Test Page\n\nThis is test content with enough text to pass the threshold.');

      const instance = new ContentScript();
      const result = await instance.convertPageToMarkdown();

      expect(result.success).toBe(true);
      expect(result.extractionInfo.method).toBe('turndown');
      expect(result.markdown).toContain('Test Page');
      expect(result.metadata).toBeDefined();
      expect(result.metadata.title).toBe('Test Page');
    });

    test('should fall back to SimpleUniversalExtractor when Turndown returns short content', async () => {
      mockConvertToMarkdown.mockReturnValue('short');

      const instance = new ContentScript();
      const result = await instance.convertPageToMarkdown();

      expect(result.success).toBe(true);
      expect(result.extractionInfo.method).toBe('guaranteed-text-extraction');
      expect(mockExtractContent).toHaveBeenCalled();
    });

    test('should fall back to SimpleUniversalExtractor when Turndown throws', async () => {
      mockConvertToMarkdown.mockImplementation(() => {
        throw new Error('Turndown conversion failed');
      });

      const instance = new ContentScript();
      const result = await instance.convertPageToMarkdown();

      expect(result.success).toBe(true);
      expect(result.extractionInfo.method).toBe('guaranteed-text-extraction');
      expect(mockExtractContent).toHaveBeenCalled();
    });

    test('should return emergency fallback when both converters fail', async () => {
      mockConvertToMarkdown.mockImplementation(() => {
        throw new Error('Turndown failed');
      });
      mockExtractContent.mockRejectedValue(new Error('Extractor failed'));

      const instance = new ContentScript();
      const result = await instance.convertPageToMarkdown();

      expect(result.success).toBe(true);
      expect(result.extractionInfo.method).toBe('emergency-fallback');
      expect(result.markdown).toContain('Test Page');
    });

    test('should include metadata in response', async () => {
      mockConvertToMarkdown.mockReturnValue('## Heading\n\nLots of content here that is definitely more than fifty characters long.');

      const instance = new ContentScript();
      const result = await instance.convertPageToMarkdown();

      expect(result.metadata).toEqual({
        title: 'Test Page',
        url: expect.any(String),
        timestamp: expect.any(String),
        domain: expect.any(String)
      });
    });

    test('should add metadata header when Turndown succeeds', async () => {
      mockConvertToMarkdown.mockReturnValue('## Heading\n\nLots of content here that is definitely more than fifty characters long.');

      const instance = new ContentScript();
      const result = await instance.convertPageToMarkdown();

      expect(result.markdown).toContain('# Test Page');
      expect(result.markdown).toContain('**Source:**');
      expect(result.markdown).toContain('---');
    });
  });

  describe('message handling', () => {
    test('should respond to extractContent message', async () => {
      mockConvertToMarkdown.mockReturnValue('## Test\n\nEnough content here to pass the fifty character threshold for sure.');

      const sendResponse = jest.fn();
      const messageHandler = chrome.runtime.onMessage.addListener.mock.calls[0][0];

      // The handler returns true (async) and calls sendResponse later
      const returnValue = messageHandler(
        { action: 'extractContent' },
        { tab: { id: 1 } },
        sendResponse
      );

      expect(returnValue).toBe(true);

      // Wait for the async operation
      await new Promise(resolve => setTimeout(resolve, 100));

      expect(sendResponse).toHaveBeenCalledWith(
        expect.objectContaining({
          success: true,
          markdown: expect.any(String),
          extractionInfo: expect.objectContaining({
            method: expect.any(String)
          })
        })
      );
    });

    test('should ignore unknown messages', () => {
      const sendResponse = jest.fn();
      const messageHandler = chrome.runtime.onMessage.addListener.mock.calls[0][0];

      const result = messageHandler(
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
      jest.resetModules();

      require('../../src/content/content-script');

      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('🚀 [content-script] Content script loaded')
      );

      consoleSpy.mockRestore();
    });
  });

  describe('selection mode message handling', () => {
    test('should respond to startSelectionMode message', () => {
      const sendResponse = jest.fn();
      const messageHandler = chrome.runtime.onMessage.addListener.mock.calls[0][0];

      const result = messageHandler(
        { action: 'startSelectionMode' },
        { tab: { id: 1 } },
        sendResponse
      );

      expect(sendResponse).toHaveBeenCalledWith({ success: true });
    });

    test('should respond to cancelSelectionMode message', () => {
      const sendResponse = jest.fn();
      const messageHandler = chrome.runtime.onMessage.addListener.mock.calls[0][0];

      messageHandler(
        { action: 'cancelSelectionMode' },
        { tab: { id: 1 } },
        sendResponse
      );

      expect(sendResponse).toHaveBeenCalledWith({ success: true });
    });

    test('should respond to convertTextSelection message', () => {
      const sendResponse = jest.fn();
      const messageHandler = chrome.runtime.onMessage.addListener.mock.calls[0][0];

      messageHandler(
        { action: 'convertTextSelection' },
        { tab: { id: 1 } },
        sendResponse
      );

      // Should respond (even if no selection exists)
      expect(sendResponse).toHaveBeenCalled();
    });

    test('should respond to startSelectionWithElement message', () => {
      const sendResponse = jest.fn();
      const messageHandler = chrome.runtime.onMessage.addListener.mock.calls[0][0];

      messageHandler(
        { action: 'startSelectionWithElement' },
        { tab: { id: 1 } },
        sendResponse
      );

      expect(sendResponse).toHaveBeenCalledWith({ success: true });
    });
  });

  describe('convertElementsToMarkdown', () => {
    test('should convert selected DOM elements to markdown', () => {
      const instance = new ContentScript();
      const el1 = document.createElement('p');
      el1.textContent = 'First selected paragraph';
      const el2 = document.createElement('p');
      el2.textContent = 'Second selected paragraph';

      const result = instance.convertElementsToMarkdown([el1, el2]);

      expect(result.success).toBe(true);
      expect(result.markdown).toBeDefined();
      expect(result.extractionInfo.method).toBe('selective-turndown');
      expect(result.extractionInfo.note).toContain('2 selected element');
    });

    test('should include metadata header', () => {
      const instance = new ContentScript();
      const el = document.createElement('div');
      el.innerHTML = '<h2>Section</h2><p>Content</p>';

      const result = instance.convertElementsToMarkdown([el]);

      expect(result.markdown).toContain('**Source:**');
      expect(result.markdown).toContain('---');
    });
  });

  describe('getPageMetadata', () => {
    test('should return page metadata', () => {
      const instance = new ContentScript();
      const metadata = instance.getPageMetadata();

      expect(metadata.title).toBe('Test Page');
      expect(metadata).toHaveProperty('url');
      expect(metadata).toHaveProperty('timestamp');
      expect(metadata).toHaveProperty('domain');
    });

    test('should handle missing title', () => {
      document.title = '';
      const instance = new ContentScript();
      const metadata = instance.getPageMetadata();

      expect(metadata.title).toBe('Untitled Page');
    });
  });
});
