/**
 * Integration tests: X/Twitter extraction flow (Phase 6.2.4)
 *
 * Tests the extractXContent message chain:
 * Popup → Background (reads prefs) → Content Script (XExtractor + XFormatter) → Output
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

jest.mock('../../src/utils/x-extractor', () => {
  return jest.fn().mockImplementation(() => ({
    extractSingleTweet: jest.fn().mockReturnValue({
      author: { name: 'Test User', handle: '@testuser' },
      text: 'This is a test tweet with enough content',
      timestamp: '2026-03-30T12:00:00Z',
      metrics: { likes: 42, retweets: 10, replies: 5 }
    }),
    extractThread: jest.fn().mockReturnValue({
      author: { name: 'Test User', handle: '@testuser' },
      tweets: [
        { text: 'Thread tweet 1', timestamp: '2026-03-30T12:00:00Z' },
        { text: 'Thread tweet 2', timestamp: '2026-03-30T12:01:00Z' }
      ]
    }),
    extractArticle: jest.fn().mockReturnValue({
      title: 'Test Article',
      author: { name: 'Test User', handle: '@testuser' },
      body: '<p>Article body content</p>'
    })
  }));
});

jest.mock('../../src/utils/x-formatter', () => {
  return jest.fn().mockImplementation(() => ({
    formatTweet: jest.fn().mockReturnValue('## @testuser\n\nThis is a test tweet with enough content\n\n---\n*42 likes · 10 retweets · 5 replies*'),
    formatThread: jest.fn().mockReturnValue('## Thread by @testuser\n\nThread tweet 1\n\n---\n\nThread tweet 2'),
    formatArticle: jest.fn().mockReturnValue('# Test Article\n\nBy @testuser\n\nArticle body content')
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

  test('extractXContent single-tweet copies formatted tweet to clipboard', async () => {
    const response = await bus.simulatePopupMessage({
      action: 'extractXContent',
      contentType: 'single-tweet'
    });

    expect(response.success).toBe(true);
    expect(response.method).toBe('clipboard');
    expect(navigator.clipboard.writeText).toHaveBeenCalled();
    const clipboardText = navigator.clipboard.writeText.mock.calls[0][0];
    expect(clipboardText).toContain('@testuser');
    expect(clipboardText).toContain('test tweet');
  });

  test('extractXContent thread copies formatted thread to clipboard', async () => {
    const response = await bus.simulatePopupMessage({
      action: 'extractXContent',
      contentType: 'thread'
    });

    expect(response.success).toBe(true);
    expect(navigator.clipboard.writeText).toHaveBeenCalled();
    const clipboardText = navigator.clipboard.writeText.mock.calls[0][0];
    expect(clipboardText).toContain('Thread');
  });

  test('extractXContent forwards preferences to content script', async () => {
    jest.resetModules();
    const setup = require('./helpers/integration-setup');
    ({ bus, storage } = setup.createTestHarness({
      tabUrl: 'https://x.com/testuser/status/123456',
      preferences: { headingStyle: 'setext', bulletListMarker: '*', includeMetadata: false }
    }));

    await bus.simulatePopupMessage({
      action: 'extractXContent',
      contentType: 'single-tweet'
    });

    // Verify the message sent to content script included preferences
    const contentCall = chrome.tabs.sendMessage.mock.calls.find(
      call => call[1] && call[1].action === 'extractXContent'
    );
    expect(contentCall).toBeDefined();
    expect(contentCall[1].options.headingStyle).toBe('setext');
    expect(contentCall[1].options.bulletListMarker).toBe('*');
    expect(contentCall[1].options.includeMetadata).toBe(false);
  });

  test('extractXContent falls back to generic conversion on extractor failure', async () => {
    // Re-mock XExtractor to return null (extraction failure)
    jest.resetModules();
    jest.mock('../../src/utils/x-extractor', () => {
      return jest.fn().mockImplementation(() => ({
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
      action: 'extractXContent',
      contentType: 'single-tweet'
    });

    // Should still succeed via generic fallback
    expect(response.success).toBe(true);
    expect(navigator.clipboard.writeText).toHaveBeenCalled();
  });

  test('extractXContent with file output saves file', async () => {
    jest.resetModules();
    const setup = require('./helpers/integration-setup');
    ({ bus, storage } = setup.createTestHarness({
      tabUrl: 'https://x.com/testuser/status/123456',
      preferences: { outputMode: 'file' }
    }));

    const response = await bus.simulatePopupMessage({
      action: 'extractXContent',
      contentType: 'single-tweet'
    });

    expect(response.success).toBe(true);
    expect(response.method).toBe('file');
    expect(URL.createObjectURL).toHaveBeenCalled();
    expect(navigator.clipboard.writeText).not.toHaveBeenCalled();
  });
});
