/**
 * Shared integration test harness.
 *
 * Each test file calls createTestHarness() in beforeEach (after jest.resetModules())
 * to get a fresh set of wired-up components. This loads real Background + Content Script
 * modules through the MessageBus so messages route between them.
 */
const MessageBus = require('./message-bus');
const ChromeStorageMock = require('./chrome-storage-mock');

const DEFAULT_PAGE_HTML = `
  <article>
    <h1>Integration Test Page</h1>
    <p>This is substantial test content that should be long enough to pass
       the 50-character Turndown threshold for successful conversion. It contains
       multiple paragraphs and enough text to be considered real content.</p>
    <p>Additional paragraph with <a href="https://example.com">a link</a>
       and <strong>bold text</strong> for markdown verification.</p>
    <ul>
      <li>List item one</li>
      <li>List item two</li>
    </ul>
  </article>
`;

/**
 * Create a fresh test harness with wired-up components.
 *
 * @param {object} options
 * @param {object} options.preferences - Preferences to seed (e.g. { outputMode: 'file' })
 * @param {string} options.pageHtml - HTML to set as document.body.innerHTML
 * @param {string} options.pageTitle - document.title value
 * @param {string} options.tabUrl - Simulated active tab URL
 * @returns {{ bus: MessageBus, storage: ChromeStorageMock }}
 */
function createTestHarness(options = {}) {
  const bus = new MessageBus();
  const storage = new ChromeStorageMock();

  // Install bus and storage into globals
  bus.install();
  storage.install();

  // Seed preferences
  if (options.preferences) {
    storage.seed(options.preferences);
  }

  // Set tab URL if specified
  if (options.tabUrl) {
    bus.setTabUrl(options.tabUrl);
  }

  // Mock clipboard
  navigator.clipboard.writeText = jest.fn().mockResolvedValue();

  // Mock URL APIs for file save
  global.URL.createObjectURL = jest.fn().mockReturnValue('blob:mock-url');
  global.URL.revokeObjectURL = jest.fn();

  // Mock notifications
  chrome.notifications.create = jest.fn();

  // Set up DOM content
  document.title = options.pageTitle || 'Integration Test Page';
  document.body.innerHTML = options.pageHtml || DEFAULT_PAGE_HTML;

  // Load Background first
  bus.setContext('background');
  require('../../../src/background/background');

  // Load Content Script second
  bus.setContext('content');
  require('../../../src/content/content-script');

  // Clear context
  bus.setContext(null);

  return { bus, storage };
}

module.exports = { createTestHarness };
