// Mock MarkdownConverter before requiring content-script
jest.mock('../../src/utils/markdown-converter', () => {
  return jest.fn().mockImplementation(() => ({
    convertToMarkdown: jest.fn().mockReturnValue(''),
    convertFromDOM: jest.fn().mockReturnValue('')
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

const mockExtract = jest.fn().mockReturnValue(null);
const mockFormat = jest.fn().mockReturnValue('');
const MockExtractor = jest.fn().mockImplementation(() => ({ extract: mockExtract }));
const MockFormatter = jest.fn().mockImplementation(() => ({ format: mockFormat }));

jest.mock('../../src/utils/site-registry', () => ({
  getById: jest.fn().mockReturnValue({
    id: 'x',
    name: 'X / Twitter',
    Extractor: MockExtractor,
    Formatter: MockFormatter
  })
}));

let MarkdownConverter;
let SimpleUniversalExtractor;
let SiteRegistry;
let ContentScript;

describe('ContentScript', () => {
  let mockConvertToMarkdown;
  let mockConvertFromDOM;
  let mockExtractContent;

  beforeEach(() => {
    jest.clearAllMocks();
    jest.resetModules();

    // Re-require mocked modules after resetModules
    MarkdownConverter = require('../../src/utils/markdown-converter');
    SimpleUniversalExtractor = require('../../src/utils/simple-universal-extractor');
    SiteRegistry = require('../../src/utils/site-registry');

    // Set up mock return values
    mockConvertToMarkdown = jest.fn().mockReturnValue('');
    mockConvertFromDOM = jest.fn().mockReturnValue('');
    const mockConvertHtmlFragment = jest.fn().mockReturnValue('## Fragment\n\nConverted fragment text.');
    MarkdownConverter.mockImplementation(() => ({
      convertToMarkdown: mockConvertToMarkdown,
      convertFromDOM: mockConvertFromDOM,
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
    test('should use DOM-direct path as primary converter when it returns substantial content', async () => {
      mockConvertFromDOM.mockReturnValue('## Test Page\n\nThis is test content with enough text to pass the threshold.');

      const instance = new ContentScript();
      const result = await instance.convertPageToMarkdown();

      expect(result.success).toBe(true);
      expect(result.extractionInfo.method).toBe('turndown-dom');
      expect(result.markdown).toContain('Test Page');
      expect(result.metadata).toBeDefined();
      expect(result.metadata.title).toBe('Test Page');
    });

    test('should fall back to string path when DOM-direct returns short content', async () => {
      mockConvertFromDOM.mockReturnValue('short');
      mockConvertToMarkdown.mockReturnValue('## Test Page\n\nThis is test content with enough text to pass the threshold.');

      const instance = new ContentScript();
      const result = await instance.convertPageToMarkdown();

      expect(result.success).toBe(true);
      expect(result.extractionInfo.method).toBe('turndown');
      expect(mockConvertToMarkdown).toHaveBeenCalled();
    });

    test('should fall back to SimpleUniversalExtractor when both Turndown paths return short content', async () => {
      mockConvertFromDOM.mockReturnValue('short');
      mockConvertToMarkdown.mockReturnValue('short');

      const instance = new ContentScript();
      const result = await instance.convertPageToMarkdown();

      expect(result.success).toBe(true);
      expect(result.extractionInfo.method).toBe('guaranteed-text-extraction');
      expect(mockExtractContent).toHaveBeenCalled();
    });

    test('should fall back to SimpleUniversalExtractor when Turndown throws', async () => {
      mockConvertFromDOM.mockImplementation(() => {
        throw new Error('Turndown conversion failed');
      });

      const instance = new ContentScript();
      const result = await instance.convertPageToMarkdown();

      expect(result.success).toBe(true);
      expect(result.extractionInfo.method).toBe('guaranteed-text-extraction');
      expect(mockExtractContent).toHaveBeenCalled();
    });

    test('should return emergency fallback when both converters fail', async () => {
      mockConvertFromDOM.mockImplementation(() => {
        throw new Error('DOM failed');
      });
      mockExtractContent.mockRejectedValue(new Error('Extractor failed'));

      const instance = new ContentScript();
      const result = await instance.convertPageToMarkdown();

      expect(result.success).toBe(true);
      expect(result.extractionInfo.method).toBe('emergency-fallback');
      expect(result.markdown).toContain('Test Page');
    });

    test('should include metadata in response', async () => {
      mockConvertFromDOM.mockReturnValue('## Heading\n\nLots of content here that is definitely more than fifty characters long.');

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
      mockConvertFromDOM.mockReturnValue('## Heading\n\nLots of content here that is definitely more than fifty characters long.');

      const instance = new ContentScript();
      const result = await instance.convertPageToMarkdown();

      expect(result.markdown).toContain('**Title:** Test Page');
      expect(result.markdown).toContain('**URL:**');
      expect(result.markdown).toContain('**Date:**');
      // Date format: YYYY-MM-DD HH:mm (local), e.g. "2026-04-26 14:30"
      expect(result.markdown).toMatch(/\*\*Date:\*\* \d{4}-\d{2}-\d{2} \d{2}:\d{2}/);
      expect(result.markdown).not.toContain('**Domain:**');
      expect(result.markdown).toContain('---');
    });
  });

  describe('message handling', () => {
    test('should respond to extractContent message', async () => {
      mockConvertFromDOM.mockReturnValue('## Test\n\nEnough content here to pass the fifty character threshold for sure.');

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
      await flushPromises();

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

      await flushPromises();

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

      expect(result.markdown).toContain('**URL:**');
      expect(result.markdown).toContain('---');
    });
  });

  describe('metadata toggle', () => {
    test('convertPageToMarkdown should skip metadata header when includeMetadata is false', async () => {
      mockConvertFromDOM.mockReturnValue('## Heading\n\nLots of content here that is definitely more than fifty characters long.');

      const instance = new ContentScript();
      const result = await instance.convertPageToMarkdown({ includeMetadata: false });

      expect(result.success).toBe(true);
      expect(result.markdown).not.toContain('**URL:**');
      expect(result.markdown).toContain('## Heading');
    });

    test('convertPageToMarkdown should include metadata header by default', async () => {
      mockConvertFromDOM.mockReturnValue('## Heading\n\nLots of content here that is definitely more than fifty characters long.');

      const instance = new ContentScript();
      const result = await instance.convertPageToMarkdown();

      expect(result.markdown).toContain('**URL:**');
    });

    test('convertPageToMarkdown emits YAML frontmatter when metadataFormat is yaml', async () => {
      mockConvertFromDOM.mockReturnValue('## Heading\n\nLots of content here that is definitely more than fifty characters long.');

      const instance = new ContentScript();
      const result = await instance.convertPageToMarkdown({ metadataFormat: 'yaml' });

      expect(result.success).toBe(true);
      // Frontmatter delimiters and field
      expect(result.markdown).toMatch(/^---\n/);
      expect(result.markdown).toContain('title: "');
      expect(result.markdown).toContain('url: ');
      expect(result.markdown).toContain('date: ');
      // Should NOT contain the legacy header
      expect(result.markdown).not.toContain('**URL:**');
      // Body should still follow the frontmatter
      expect(result.markdown).toContain('## Heading');
    });

    test('YAML frontmatter escapes quotes and backslashes in title', async () => {
      mockConvertFromDOM.mockReturnValue('## Body\n\nLots of content here that is definitely more than fifty characters long.');
      // Override document.title for this test
      const originalTitle = document.title;
      document.title = 'A "quoted" \\ tricky title';

      const instance = new ContentScript();
      const result = await instance.convertPageToMarkdown({ metadataFormat: 'yaml' });

      expect(result.markdown).toContain('title: "A \\"quoted\\" \\\\ tricky title"');

      document.title = originalTitle;
    });

    test('convertElementsToMarkdown should skip metadata when storage says false', async () => {
      chrome.storage.local.get.mockResolvedValue({ includeMetadata: false });

      const instance = new ContentScript();
      const el = document.createElement('p');
      el.textContent = 'Some content';

      const result = await instance.convertElementsToMarkdown([el]);

      expect(result.success).toBe(true);
      expect(result.markdown).not.toContain('**URL:**');
    });

    test('convertElementsToMarkdown should include metadata by default', async () => {
      chrome.storage.local.get.mockResolvedValue({});

      const instance = new ContentScript();
      const el = document.createElement('p');
      el.textContent = 'Some content';

      const result = await instance.convertElementsToMarkdown([el]);

      expect(result.success).toBe(true);
      expect(result.markdown).toContain('**URL:**');
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
      expect(result.markdown).not.toContain('**URL:**');
    });

    test('extractContent message should pass options through', async () => {
      mockConvertFromDOM.mockReturnValue('## Heading\n\nLots of content here that is definitely more than fifty characters long.');

      const sendResponse = jest.fn();
      const messageHandler = chrome.runtime.onMessage.addListener.mock.calls[0][0];

      messageHandler(
        { action: 'extractContent', options: { includeMetadata: false } },
        { tab: { id: 1 } },
        sendResponse
      );

      await flushPromises();

      expect(sendResponse).toHaveBeenCalledWith(
        expect.objectContaining({ success: true })
      );
      // The markdown should not contain the metadata header
      const calledWith = sendResponse.mock.calls[0][0];
      expect(calledWith.markdown).not.toContain('**URL:**');
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

      await flushPromises();

      expect(navigator.clipboard.writeText).toHaveBeenCalledWith('Hello markdown');
      expect(sendResponse).toHaveBeenCalledWith({ success: true, method: 'clipboardApi' });
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

      await flushPromises();

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

  describe('site-specific extraction', () => {
    test('extractSiteContent calls site extractor and formatter for single tweet', async () => {
      const mockTweetData = {
        author: { handle: 'testuser', displayName: 'Test User' },
        text: 'Hello world!'
      };
      mockExtract.mockReturnValue(mockTweetData);
      mockFormat.mockReturnValue('## @testuser (Test User)\n\nHello world!\n\n---');

      const instance = new ContentScript();
      const result = await instance.extractSiteContent('x', 'single-tweet', { includeMetadata: false });

      expect(result.success).toBe(true);
      expect(result.extractionInfo.method).toBe('x-single-tweet');
      expect(result.markdown).toContain('@testuser');
      expect(mockExtract).toHaveBeenCalledWith('single-tweet', expect.anything(), expect.any(String));
      expect(mockFormat).toHaveBeenCalledWith('single-tweet', mockTweetData, expect.anything());
    });

    test('extractSiteContent calls site extractor and formatter for thread', async () => {
      const mockThreadData = {
        mainTweet: { author: { handle: 'user', displayName: 'User' }, text: 'Thread' },
        replies: []
      };
      mockExtract.mockReturnValue(mockThreadData);
      mockFormat.mockReturnValue('## @user\n\nThread\n\n---');

      const instance = new ContentScript();
      const result = await instance.extractSiteContent('x', 'thread', { includeMetadata: false });

      expect(result.success).toBe(true);
      expect(result.extractionInfo.method).toBe('x-thread');
    });

    test('extractSiteContent calls site extractor and formatter for article', async () => {
      const mockArticleData = {
        author: { handle: 'writer', displayName: 'Writer' },
        title: 'My Article',
        bodyHtml: '<p>Content</p>',
        publishedDate: null
      };
      mockExtract.mockReturnValue(mockArticleData);
      mockFormat.mockReturnValue('# My Article\n\nContent');

      const instance = new ContentScript();
      const result = await instance.extractSiteContent('x', 'article', { includeMetadata: false });

      expect(result.success).toBe(true);
      expect(result.extractionInfo.method).toBe('x-article');
    });

    test('extractSiteContent falls back to general conversion on failure', async () => {
      mockExtract.mockReturnValue(null);

      mockConvertFromDOM.mockReturnValue('# General Fallback\n\nThis is general turndown content for testing purposes.');

      const instance = new ContentScript();
      const result = await instance.extractSiteContent('x', 'single-tweet', { includeMetadata: false });

      // Should have fallen back to the general conversion path
      expect(result.success).toBe(true);
      expect(result.extractionInfo.method).not.toBe('x-single-tweet');
    });

    test('extractSiteContent respects includeMetadata option', async () => {
      const mockTweetData = {
        author: { handle: 'user', displayName: 'User' },
        text: 'Tweet'
      };
      mockExtract.mockReturnValue(mockTweetData);
      mockFormat.mockReturnValue('## @user\n\nTweet\n\n---');

      const instance = new ContentScript();
      const result = await instance.extractSiteContent('x', 'single-tweet', { includeMetadata: true });

      expect(result.success).toBe(true);
      expect(result.markdown).toContain('**URL:**');
    });

    test('message handler routes extractSiteContent action', async () => {
      const instance = new ContentScript();
      const listener = chrome.runtime.onMessage.addListener.mock.calls[0][0];

      const sendResponse = jest.fn();
      const returned = listener(
        { action: 'extractSiteContent', siteId: 'x', contentType: 'single-tweet', options: {} },
        {},
        sendResponse
      );

      expect(returned).toBe(true); // async response
    });
  });
});
