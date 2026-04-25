/**
 * Integration tests: X/Twitter extraction flow (Phase 6.2.4)
 *
 * Tests the extractSiteContent message chain:
 * Popup → Background (reads prefs) → Content Script (SiteRegistry → Extractor + Formatter) → Output
 *
 * XExtractor/XFormatter are mocked since realistic X DOM is impractical in jsdom.
 * The integration value is testing message routing, preference forwarding, and fallback behavior.
 */

jest.mock('../../src/content/element-picker', () => {
  return jest.fn().mockImplementation(({ onConfirm, onCancel }) => ({
    activate: jest.fn(),
    deactivate: jest.fn(),
    preselectElement: jest.fn(),
    onConfirm,
    onCancel,
    selectedElements: []
  }));
});

jest.mock('../../src/sites/x/x-extractor', () => {
  return jest.fn().mockImplementation(() => ({
    extract: jest.fn().mockImplementation((contentType) => {
      switch (contentType) {
        case 'single-tweet': return {
          author: { name: 'Test User', handle: '@testuser' },
          text: 'This is a test tweet with enough content',
          timestamp: '2026-03-30T12:00:00Z',
          metrics: { likes: 42, retweets: 10, replies: 5 }
        };
        case 'thread': return {
          author: { name: 'Test User', handle: '@testuser' },
          tweets: [
            { text: 'Thread tweet 1', timestamp: '2026-03-30T12:00:00Z' },
            { text: 'Thread tweet 2', timestamp: '2026-03-30T12:01:00Z' }
          ]
        };
        case 'article': return {
          title: 'Test Article',
          author: { name: 'Test User', handle: '@testuser' },
          body: '<p>Article body content</p>'
        };
        default: return null;
      }
    }),
    extractSingleTweet: jest.fn(),
    extractThread: jest.fn(),
    extractArticle: jest.fn()
  }));
});

jest.mock('../../src/sites/x/x-formatter', () => {
  return jest.fn().mockImplementation(() => ({
    format: jest.fn().mockImplementation((contentType) => {
      switch (contentType) {
        case 'single-tweet': return '## @testuser\n\nThis is a test tweet with enough content\n\n---\n*42 likes · 10 retweets · 5 replies*';
        case 'thread': return '## Thread by @testuser\n\nThread tweet 1\n\n---\n\nThread tweet 2';
        case 'article': return '# Test Article\n\nBy @testuser\n\nArticle body content';
        default: return '';
      }
    }),
    formatTweet: jest.fn(),
    formatThread: jest.fn(),
    formatArticle: jest.fn()
  }));
});

describe('X/Twitter extraction flow', () => {
  let bus, storage;

  beforeEach(() => {
    jest.resetModules();
    const setup = require('./helpers/integration-setup');
    ({ bus, storage } = setup.createTestHarness({
      tabUrl: 'https://x.com/testuser/status/123456'
    }));
  });

  test('extractSiteContent single-tweet copies formatted tweet to clipboard', async () => {
    const response = await bus.simulatePopupMessage({
      action: 'extractSiteContent', siteId: 'x',
      contentType: 'single-tweet'
    });

    expect(response.success).toBe(true);
    expect(response.method).toBe('clipboard');
    expect(navigator.clipboard.writeText).toHaveBeenCalled();
    const clipboardText = navigator.clipboard.writeText.mock.calls[0][0];
    expect(clipboardText).toContain('@testuser');
    expect(clipboardText).toContain('test tweet');
  });

  test('extractSiteContent thread copies formatted thread to clipboard', async () => {
    const response = await bus.simulatePopupMessage({
      action: 'extractSiteContent', siteId: 'x',
      contentType: 'thread'
    });

    expect(response.success).toBe(true);
    expect(navigator.clipboard.writeText).toHaveBeenCalled();
    const clipboardText = navigator.clipboard.writeText.mock.calls[0][0];
    expect(clipboardText).toContain('Thread');
  });

  test('extractSiteContent forwards preferences to content script', async () => {
    jest.resetModules();
    const setup = require('./helpers/integration-setup');
    ({ bus, storage } = setup.createTestHarness({
      tabUrl: 'https://x.com/testuser/status/123456',
      preferences: { headingStyle: 'setext', bulletListMarker: '*', includeMetadata: false }
    }));

    await bus.simulatePopupMessage({
      action: 'extractSiteContent', siteId: 'x',
      contentType: 'single-tweet'
    });

    // Verify the message sent to content script included preferences
    const contentCall = chrome.tabs.sendMessage.mock.calls.find(
      call => call[1] && call[1].action === 'extractSiteContent'
    );
    expect(contentCall).toBeDefined();
    expect(contentCall[1].options.headingStyle).toBe('setext');
    expect(contentCall[1].options.bulletListMarker).toBe('*');
    expect(contentCall[1].options.includeMetadata).toBe(false);
  });

  test('extractSiteContent falls back to general conversion on extractor failure', async () => {
    // Re-mock XExtractor to return null (extraction failure)
    jest.resetModules();
    jest.mock('../../src/sites/x/x-extractor', () => {
      return jest.fn().mockImplementation(() => ({
        extract: jest.fn().mockReturnValue(null),
        extractSingleTweet: jest.fn().mockReturnValue(null),
        extractThread: jest.fn().mockReturnValue(null),
        extractArticle: jest.fn().mockReturnValue(null)
      }));
    });
    jest.mock('../../src/content/element-picker', () => {
      return jest.fn().mockImplementation(({ onConfirm, onCancel }) => ({
        activate: jest.fn(),
        deactivate: jest.fn(),
        preselectElement: jest.fn(),
        onConfirm,
        onCancel,
        selectedElements: []
      }));
    });

    const setup = require('./helpers/integration-setup');
    ({ bus, storage } = setup.createTestHarness({
      tabUrl: 'https://x.com/testuser/status/123456'
    }));

    const response = await bus.simulatePopupMessage({
      action: 'extractSiteContent', siteId: 'x',
      contentType: 'single-tweet'
    });

    // Should still succeed via the general fallback path
    expect(response.success).toBe(true);
    expect(navigator.clipboard.writeText).toHaveBeenCalled();
  });

  test('extractSiteContent with file output saves file', async () => {
    jest.resetModules();
    const setup = require('./helpers/integration-setup');
    ({ bus, storage } = setup.createTestHarness({
      tabUrl: 'https://x.com/testuser/status/123456',
      preferences: { outputMode: 'file' }
    }));

    const response = await bus.simulatePopupMessage({
      action: 'extractSiteContent', siteId: 'x',
      contentType: 'single-tweet'
    });

    expect(response.success).toBe(true);
    expect(response.method).toBe('file');
    expect(URL.createObjectURL).toHaveBeenCalled();
    expect(navigator.clipboard.writeText).not.toHaveBeenCalled();
  });
});
