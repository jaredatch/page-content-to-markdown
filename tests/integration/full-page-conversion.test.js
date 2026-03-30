/**
 * Integration tests: Full-page conversion flow (Phase 6.2.2)
 *
 * Tests the extractAndCopy message chain:
 * Popup → Background → Content Script → Extraction → Output dispatch → Response
 */

// ElementPicker must be mocked before any require (jsdom limitation)
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

const { createTestHarness } = require('./helpers/integration-setup');

describe('Full-page conversion flow', () => {
  let bus, storage;

  beforeEach(() => {
    jest.resetModules();
    // Re-require after resetModules since module cache is cleared
    const setup = require('./helpers/integration-setup');
    ({ bus, storage } = setup.createTestHarness());
  });

  test('extractAndCopy copies markdown to clipboard (happy path)', async () => {
    const response = await bus.simulatePopupMessage({ action: 'extractAndCopy' });

    expect(response.success).toBe(true);
    expect(response.method).toBe('clipboard');
    expect(navigator.clipboard.writeText).toHaveBeenCalledTimes(1);

    const clipboardContent = navigator.clipboard.writeText.mock.calls[0][0];
    expect(clipboardContent).toContain('Integration Test Page');
    expect(clipboardContent).toContain('a link');
  });

  test('extractAndCopy saves as file when outputMode is file', async () => {
    // Need fresh modules with file preferences
    jest.resetModules();
    const setup = require('./helpers/integration-setup');
    ({ bus, storage } = setup.createTestHarness({
      preferences: { outputMode: 'file' }
    }));

    const response = await bus.simulatePopupMessage({ action: 'extractAndCopy' });

    expect(response.success).toBe(true);
    expect(response.method).toBe('file');
    expect(navigator.clipboard.writeText).not.toHaveBeenCalled();
    expect(URL.createObjectURL).toHaveBeenCalled();
  });

  test('extractAndCopy falls back to content script clipboard on failure', async () => {
    // Make background's clipboard.writeText fail
    navigator.clipboard.writeText
      .mockRejectedValueOnce(new Error('Not allowed'))  // Background fails
      .mockResolvedValueOnce();                           // Content script succeeds

    const response = await bus.simulatePopupMessage({ action: 'extractAndCopy' });

    expect(response.success).toBe(true);
    // clipboard.writeText called twice: once in background (fails), once in content (succeeds)
    expect(navigator.clipboard.writeText).toHaveBeenCalledTimes(2);
  });

  test('extractAndCopy excludes metadata header when disabled', async () => {
    jest.resetModules();
    const setup = require('./helpers/integration-setup');
    ({ bus, storage } = setup.createTestHarness({
      preferences: { includeMetadata: false }
    }));

    const response = await bus.simulatePopupMessage({ action: 'extractAndCopy' });

    expect(response.success).toBe(true);
    const clipboardContent = navigator.clipboard.writeText.mock.calls[0][0];
    expect(clipboardContent).not.toContain('**Source:**');
    expect(clipboardContent).not.toContain('**URL:**');
  });

  test('extractAndCopy forwards formatting options to content script', async () => {
    jest.resetModules();
    const setup = require('./helpers/integration-setup');
    ({ bus, storage } = setup.createTestHarness({
      preferences: { headingStyle: 'setext', bulletListMarker: '*' }
    }));

    const response = await bus.simulatePopupMessage({ action: 'extractAndCopy' });

    expect(response.success).toBe(true);
    // Verify tabs.sendMessage was called with the formatting options
    const tabsCall = chrome.tabs.sendMessage.mock.calls.find(
      call => call[1] && call[1].action === 'extractContent'
    );
    expect(tabsCall).toBeDefined();
    expect(tabsCall[1].options.headingStyle).toBe('setext');
    expect(tabsCall[1].options.bulletListMarker).toBe('*');
  });

  test('extractAndCopy returns error when no active tab', async () => {
    // Override tabs.query to return empty
    chrome.tabs.query.mockResolvedValueOnce([]);

    const response = await bus.simulatePopupMessage({ action: 'extractAndCopy' });

    expect(response.success).toBe(false);
    expect(response.error).toContain('No active tab');
  });
});
