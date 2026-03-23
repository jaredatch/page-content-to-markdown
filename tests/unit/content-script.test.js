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

jest.mock('../../src/utils/x-extractor', () => {
  return jest.fn().mockImplementation(() => ({
    extractSingleTweet: jest.fn().mockReturnValue(null),
    extractThread: jest.fn().mockReturnValue(null),
    extractArticle: jest.fn().mockReturnValue(null),
    detectContentType: jest.fn().mockReturnValue('unknown')
  }));
});

jest.mock('../../src/utils/x-formatter', () => {
  return jest.fn().mockImplementation(() => ({
    formatTweet: jest.fn().mockReturnValue('## @user (User)\n\nTweet text\n\n---'),
    formatThread: jest.fn().mockReturnValue('## @user (User)\n\nThread text\n\n---'),
    formatArticle: jest.fn().mockReturnValue('# Article Title\n\nArticle body')
  }));
});

let MarkdownConverter;
let SimpleUniversalExtractor;
let XExtractor;
let XFormatter;
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
    XExtractor = require('../../src/utils/x-extractor');
    XFormatter = require('../../src/utils/x-formatter');

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
    chrome.storage.local.get.mockReset();
    chrome.storage.local.get.mockResolvedValue({});

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

    test('should respond to convertTextSelection message', async () => {
      const sendResponse = jest.fn();
      const messageHandler = chrome.runtime.onMessage.addListener.mock.calls[0][0];

      const returnValue = messageHandler(
        { action: 'convertTextSelection' },
        { tab: { id: 1 } },
        sendResponse
      );

      expect(returnValue).toBe(true); // async

      await new Promise(resolve => setTimeout(resolve, 100));

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
    test('should convert selected DOM elements to markdown', async () => {
      const instance = new ContentScript();
      const el1 = document.createElement('p');
      el1.textContent = 'First selected paragraph';
      const el2 = document.createElement('p');
      el2.textContent = 'Second selected paragraph';

      const result = await instance.convertElementsToMarkdown([el1, el2]);

      expect(result.success).toBe(true);
      expect(result.markdown).toBeDefined();
      expect(result.extractionInfo.method).toBe('selective-turndown');
      expect(result.extractionInfo.note).toContain('2 selected element');
    });

    test('should include metadata header', async () => {
      const instance = new ContentScript();
      const el = document.createElement('div');
      el.innerHTML = '<h2>Section</h2><p>Content</p>';

      const result = await instance.convertElementsToMarkdown([el]);

      expect(result.markdown).toContain('**Source:**');
      expect(result.markdown).toContain('---');
    });
  });

  describe('metadata toggle', () => {
    test('convertPageToMarkdown should skip metadata header when includeMetadata is false', async () => {
      mockConvertToMarkdown.mockReturnValue('## Heading\n\nLots of content here that is definitely more than fifty characters long.');

      const instance = new ContentScript();
      const result = await instance.convertPageToMarkdown({ includeMetadata: false });

      expect(result.success).toBe(true);
      expect(result.markdown).not.toContain('**Source:**');
      expect(result.markdown).toContain('## Heading');
    });

    test('convertPageToMarkdown should include metadata header by default', async () => {
      mockConvertToMarkdown.mockReturnValue('## Heading\n\nLots of content here that is definitely more than fifty characters long.');

      const instance = new ContentScript();
      const result = await instance.convertPageToMarkdown();

      expect(result.markdown).toContain('**Source:**');
    });

    test('convertElementsToMarkdown should skip metadata when storage says false', async () => {
      chrome.storage.local.get.mockResolvedValue({ includeMetadata: false });

      const instance = new ContentScript();
      const el = document.createElement('p');
      el.textContent = 'Some content';

      const result = await instance.convertElementsToMarkdown([el]);

      expect(result.success).toBe(true);
      expect(result.markdown).not.toContain('**Source:**');
    });

    test('convertElementsToMarkdown should include metadata by default', async () => {
      chrome.storage.local.get.mockResolvedValue({});

      const instance = new ContentScript();
      const el = document.createElement('p');
      el.textContent = 'Some content';

      const result = await instance.convertElementsToMarkdown([el]);

      expect(result.success).toBe(true);
      expect(result.markdown).toContain('**Source:**');
    });

    test('convertTextSelection should skip metadata when storage says false', async () => {
      chrome.storage.local.get.mockResolvedValue({ includeMetadata: false });

      // Set up a selection
      const p = document.createElement('p');
      p.textContent = 'Selected text content here';
      document.body.appendChild(p);

      const range = document.createRange();
      range.selectNodeContents(p);
      const selection = window.getSelection();
      selection.removeAllRanges();
      selection.addRange(range);

      const instance = new ContentScript();
      const result = await instance.convertTextSelection();

      expect(result.success).toBe(true);
      expect(result.markdown).not.toContain('**Source:**');
    });

    test('extractContent message should pass options through', async () => {
      mockConvertToMarkdown.mockReturnValue('## Heading\n\nLots of content here that is definitely more than fifty characters long.');

      const sendResponse = jest.fn();
      const messageHandler = chrome.runtime.onMessage.addListener.mock.calls[0][0];

      messageHandler(
        { action: 'extractContent', options: { includeMetadata: false } },
        { tab: { id: 1 } },
        sendResponse
      );

      await new Promise(resolve => setTimeout(resolve, 100));

      expect(sendResponse).toHaveBeenCalledWith(
        expect.objectContaining({ success: true })
      );
      // The markdown should not contain the metadata header
      const calledWith = sendResponse.mock.calls[0][0];
      expect(calledWith.markdown).not.toContain('**Source:**');
    });
  });

  describe('writeToClipboard handler', () => {
    test('should write text to clipboard via message', async () => {
      navigator.clipboard.writeText.mockResolvedValue();

      const sendResponse = jest.fn();
      const messageHandler = chrome.runtime.onMessage.addListener.mock.calls[0][0];

      const returnValue = messageHandler(
        { action: 'writeToClipboard', text: 'Hello markdown' },
        { tab: { id: 1 } },
        sendResponse
      );

      expect(returnValue).toBe(true);

      await new Promise(resolve => setTimeout(resolve, 100));

      expect(navigator.clipboard.writeText).toHaveBeenCalledWith('Hello markdown');
      expect(sendResponse).toHaveBeenCalledWith({ success: true });
    });

    test('should handle clipboard write failure', async () => {
      navigator.clipboard.writeText.mockRejectedValue(new Error('Denied'));

      const sendResponse = jest.fn();
      const messageHandler = chrome.runtime.onMessage.addListener.mock.calls[0][0];

      messageHandler(
        { action: 'writeToClipboard', text: 'Hello' },
        { tab: { id: 1 } },
        sendResponse
      );

      await new Promise(resolve => setTimeout(resolve, 100));

      expect(sendResponse).toHaveBeenCalledWith(
        expect.objectContaining({ success: false })
      );
    });
  });

  describe('saveAsFile handler', () => {
    test('should create a blob download link and click it', () => {
      const sendResponse = jest.fn();
      const messageHandler = chrome.runtime.onMessage.addListener.mock.calls[0][0];

      // Mock URL.createObjectURL and URL.revokeObjectURL
      const mockUrl = 'blob:http://localhost/fake-blob-url';
      global.URL.createObjectURL = jest.fn().mockReturnValue(mockUrl);
      global.URL.revokeObjectURL = jest.fn();

      const clickSpy = jest.fn();
      const originalCreateElement = document.createElement.bind(document);
      jest.spyOn(document, 'createElement').mockImplementation((tag) => {
        const el = originalCreateElement(tag);
        if (tag === 'a') {
          el.click = clickSpy;
        }
        return el;
      });

      messageHandler(
        { action: 'saveAsFile', markdown: '# Test', filename: 'test.md' },
        { tab: { id: 1 } },
        sendResponse
      );

      expect(global.URL.createObjectURL).toHaveBeenCalled();
      expect(clickSpy).toHaveBeenCalled();
      expect(global.URL.revokeObjectURL).toHaveBeenCalledWith(mockUrl);
      expect(sendResponse).toHaveBeenCalledWith({ success: true });

      document.createElement.mockRestore();
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

  describe('X/Twitter extraction', () => {
    test('extractXContent calls XExtractor and XFormatter for single tweet', async () => {
      const mockTweetData = {
        author: { handle: 'testuser', displayName: 'Test User' },
        text: 'Hello world!'
      };
      const mockExtractSingleTweet = jest.fn().mockReturnValue(mockTweetData);
      const mockFormatTweet = jest.fn().mockReturnValue('## @testuser (Test User)\n\nHello world!\n\n---');

      XExtractor.mockImplementation(() => ({
        extractSingleTweet: mockExtractSingleTweet,
        extractThread: jest.fn(),
        extractArticle: jest.fn()
      }));
      XFormatter.mockImplementation(() => ({
        formatTweet: mockFormatTweet,
        formatThread: jest.fn(),
        formatArticle: jest.fn()
      }));

      const instance = new ContentScript();
      const result = await instance.extractXContent('single-tweet', { includeMetadata: false });

      expect(result.success).toBe(true);
      expect(result.extractionInfo.method).toBe('x-single-tweet');
      expect(result.markdown).toContain('@testuser');
      expect(mockExtractSingleTweet).toHaveBeenCalled();
      expect(mockFormatTweet).toHaveBeenCalledWith(mockTweetData);
    });

    test('extractXContent calls XExtractor and XFormatter for thread', async () => {
      const mockThreadData = {
        mainTweet: { author: { handle: 'user', displayName: 'User' }, text: 'Thread' },
        replies: []
      };
      XExtractor.mockImplementation(() => ({
        extractSingleTweet: jest.fn(),
        extractThread: jest.fn().mockReturnValue(mockThreadData),
        extractArticle: jest.fn()
      }));
      XFormatter.mockImplementation(() => ({
        formatTweet: jest.fn(),
        formatThread: jest.fn().mockReturnValue('## @user\n\nThread\n\n---'),
        formatArticle: jest.fn()
      }));

      const instance = new ContentScript();
      const result = await instance.extractXContent('thread', { includeMetadata: false });

      expect(result.success).toBe(true);
      expect(result.extractionInfo.method).toBe('x-thread');
    });

    test('extractXContent calls XExtractor and XFormatter for article', async () => {
      const mockArticleData = {
        author: { handle: 'writer', displayName: 'Writer' },
        title: 'My Article',
        bodyHtml: '<p>Content</p>',
        publishedDate: null
      };
      XExtractor.mockImplementation(() => ({
        extractSingleTweet: jest.fn(),
        extractThread: jest.fn(),
        extractArticle: jest.fn().mockReturnValue(mockArticleData)
      }));
      XFormatter.mockImplementation(() => ({
        formatTweet: jest.fn(),
        formatThread: jest.fn(),
        formatArticle: jest.fn().mockReturnValue('# My Article\n\nContent')
      }));

      const instance = new ContentScript();
      const result = await instance.extractXContent('article', { includeMetadata: false });

      expect(result.success).toBe(true);
      expect(result.extractionInfo.method).toBe('x-article');
    });

    test('extractXContent falls back to generic conversion on failure', async () => {
      XExtractor.mockImplementation(() => ({
        extractSingleTweet: jest.fn().mockReturnValue(null),
        extractThread: jest.fn(),
        extractArticle: jest.fn()
      }));

      mockConvertToMarkdown.mockReturnValue('# Generic Fallback\n\nThis is generic turndown content for testing purposes.');

      const instance = new ContentScript();
      const result = await instance.extractXContent('single-tweet', { includeMetadata: false });

      // Should have fallen back to generic conversion
      expect(result.success).toBe(true);
      expect(result.extractionInfo.method).not.toBe('x-single-tweet');
    });

    test('extractXContent respects includeMetadata option', async () => {
      const mockTweetData = {
        author: { handle: 'user', displayName: 'User' },
        text: 'Tweet'
      };
      XExtractor.mockImplementation(() => ({
        extractSingleTweet: jest.fn().mockReturnValue(mockTweetData),
        extractThread: jest.fn(),
        extractArticle: jest.fn()
      }));
      XFormatter.mockImplementation(() => ({
        formatTweet: jest.fn().mockReturnValue('## @user\n\nTweet\n\n---'),
        formatThread: jest.fn(),
        formatArticle: jest.fn()
      }));

      const instance = new ContentScript();
      const result = await instance.extractXContent('single-tweet', { includeMetadata: true });

      expect(result.success).toBe(true);
      expect(result.markdown).toContain('**Source:**');
    });

    test('message handler routes extractXContent action', async () => {
      const instance = new ContentScript();
      const listener = chrome.runtime.onMessage.addListener.mock.calls[0][0];

      const sendResponse = jest.fn();
      const returned = listener(
        { action: 'extractXContent', contentType: 'single-tweet', options: {} },
        {},
        sendResponse
      );

      expect(returned).toBe(true); // async response
    });
  });
});
