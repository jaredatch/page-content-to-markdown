/**
 * Integration tests: Preferences flow (Phase 6.2.6)
 *
 * Tests that preferences set via chrome.storage.local propagate correctly
 * through Background → Content Script and affect output behavior.
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

describe('Preferences flow', () => {
  let bus, storage;

  beforeEach(() => {
    jest.resetModules();
    const setup = require('./helpers/integration-setup');
    ({ bus, storage } = setup.createTestHarness());
  });

  test('default preferences applied when storage is empty', async () => {
    const response = await bus.simulatePopupMessage({ action: 'extractAndCopy' });

    expect(response.success).toBe(true);
    expect(response.method).toBe('clipboard');

    // Verify default options sent to content script
    const contentCall = chrome.tabs.sendMessage.mock.calls.find(
      call => call[1] && call[1].action === 'extractContent'
    );
    expect(contentCall[1].options).toEqual(expect.objectContaining({
      includeMetadata: true,
      headingStyle: 'atx',
      bulletListMarker: '-',
      codeBlockStyle: 'fenced',
      linkStyle: 'inlined'
    }));
  });

  test('output mode change between conversions', async () => {
    // First conversion: clipboard (default)
    const response1 = await bus.simulatePopupMessage({ action: 'extractAndCopy' });
    expect(response1.method).toBe('clipboard');
    expect(navigator.clipboard.writeText).toHaveBeenCalledTimes(1);

    // Change preference to file
    storage.seed({ outputMode: 'file' });

    // Second conversion: file
    const response2 = await bus.simulatePopupMessage({ action: 'extractAndCopy' });
    expect(response2.method).toBe('file');
    expect(URL.createObjectURL).toHaveBeenCalled();
    // Clipboard should still only have been called once (from first conversion)
    expect(navigator.clipboard.writeText).toHaveBeenCalledTimes(1);
  });

  test('includeMetadata toggle affects markdown output', async () => {
    // With metadata (default)
    const response1 = await bus.simulatePopupMessage({ action: 'extractAndCopy' });
    const withMetadata = navigator.clipboard.writeText.mock.calls[0][0];
    expect(withMetadata).toContain('**Source:**');

    // Without metadata
    storage.seed({ includeMetadata: false });
    const response2 = await bus.simulatePopupMessage({ action: 'extractAndCopy' });
    const withoutMetadata = navigator.clipboard.writeText.mock.calls[1][0];
    expect(withoutMetadata).not.toContain('**Source:**');
  });

  test('all formatting options forwarded in extractContent message', async () => {
    jest.resetModules();
    const setup = require('./helpers/integration-setup');
    ({ bus, storage } = setup.createTestHarness({
      preferences: {
        headingStyle: 'setext',
        bulletListMarker: '*',
        codeBlockStyle: 'indented',
        linkStyle: 'referenced'
      }
    }));

    await bus.simulatePopupMessage({ action: 'extractAndCopy' });

    const contentCall = chrome.tabs.sendMessage.mock.calls.find(
      call => call[1] && call[1].action === 'extractContent'
    );
    expect(contentCall[1].options).toEqual(expect.objectContaining({
      headingStyle: 'setext',
      bulletListMarker: '*',
      codeBlockStyle: 'indented',
      linkStyle: 'referenced'
    }));
  });
});
