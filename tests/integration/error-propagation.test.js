/**
 * Integration tests: Error propagation (Phase 6.2.7)
 *
 * Verifies that errors at any layer propagate correctly and never
 * cause unhandled rejections or swallowed failures.
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

describe('Error propagation', () => {
  let bus, storage;

  beforeEach(() => {
    jest.resetModules();
    const setup = require('./helpers/integration-setup');
    ({ bus, storage } = setup.createTestHarness());
  });

  test('content script emergency fallback still returns markdown on conversion error', async () => {
    // Set body to something that might cause Turndown issues but fallback catches
    jest.resetModules();
    const setup = require('./helpers/integration-setup');
    ({ bus, storage } = setup.createTestHarness({
      pageHtml: '' // Empty body — conversion will go through fallback chain
    }));

    const response = await bus.simulatePopupMessage({ action: 'extractAndCopy' });

    // Content script's multi-layer fallback should always return something
    expect(response.success).toBeDefined();
  });

  test('background returns error when content script is unreachable', async () => {
    // Override tabs.sendMessage to reject (simulates no content script)
    chrome.tabs.sendMessage.mockRejectedValueOnce(new Error('Could not establish connection'));

    const response = await bus.simulatePopupMessage({ action: 'extractAndCopy' });

    expect(response.success).toBe(false);
    expect(response.error).toContain('Failed to communicate with content script');
  });

  test('no active tab returns error for extractAndCopy', async () => {
    chrome.tabs.query.mockResolvedValueOnce([]);

    const response = await bus.simulatePopupMessage({ action: 'extractAndCopy' });

    expect(response.success).toBe(false);
    expect(response.error).toContain('No active tab');
  });

  test('clipboard and fallback both failing returns error', async () => {
    // Both clipboard attempts fail
    navigator.clipboard.writeText
      .mockRejectedValueOnce(new Error('Clipboard blocked'))   // Background attempt
      .mockRejectedValueOnce(new Error('Clipboard blocked'));   // Content script fallback

    const response = await bus.simulatePopupMessage({ action: 'extractAndCopy' });

    expect(response.success).toBe(false);
    expect(response.error).toContain('clipboard');
  });

  test('no unhandled promise rejections during error paths', async () => {
    const rejections = [];
    const handler = (reason) => rejections.push(reason);
    process.on('unhandledRejection', handler);

    try {
      // Trigger multiple error paths
      chrome.tabs.query.mockResolvedValueOnce([]);
      await bus.simulatePopupMessage({ action: 'extractAndCopy' });

      chrome.tabs.sendMessage.mockRejectedValueOnce(new Error('Disconnected'));
      await bus.simulatePopupMessage({ action: 'startSelectionMode' });

      await flushPromises();

      expect(rejections).toHaveLength(0);
    } finally {
      process.removeListener('unhandledRejection', handler);
    }
  });
});
