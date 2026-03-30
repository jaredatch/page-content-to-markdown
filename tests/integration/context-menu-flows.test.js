/**
 * Integration tests: Context menu flows (Phase 6.2.5)
 *
 * Tests context menu → background → content script flows:
 * - "Copy selection as Markdown" → convertTextSelection
 * - "Select element for Markdown" → startSelectionWithElement
 */

const mockElementPicker = jest.fn();
jest.mock('../../src/content/element-picker', () => {
  return mockElementPicker;
});

describe('Context menu flows', () => {
  let bus, storage;
  let pickerInstances;

  beforeEach(() => {
    pickerInstances = [];
    mockElementPicker.mockReset();
    mockElementPicker.mockImplementation(({ onConfirm, onCancel }) => {
      const instance = {
        activate: jest.fn(),
        deactivate: jest.fn(),
        preselectElement: jest.fn(),
        onConfirm,
        onCancel,
        selectedElements: []
      };
      pickerInstances.push(instance);
      return instance;
    });

    jest.resetModules();
    const setup = require('./helpers/integration-setup');
    ({ bus, storage } = setup.createTestHarness());

    // Fire onInstalled to trigger context menu creation
    bus.fireOnInstalled();
  });

  test('convert-selection menu item converts text selection to clipboard', async () => {
    // Set up a text selection in the DOM
    const range = document.createRange();
    const paragraph = document.querySelector('p');
    range.selectNodeContents(paragraph);
    const selection = window.getSelection();
    selection.removeAllRanges();
    selection.addRange(range);

    // Fire the context menu click
    bus.fireContextMenu({ menuItemId: 'convert-selection' });
    await flushPromises();

    // Should have copied the selection as markdown
    expect(navigator.clipboard.writeText).toHaveBeenCalled();
    const clipboardText = navigator.clipboard.writeText.mock.calls[0][0];
    expect(clipboardText).toContain('substantial test content');
  });

  test('select-element menu item activates element picker', async () => {
    // Fire the context menu click for element selection
    bus.fireContextMenu({ menuItemId: 'select-element' });
    await flushPromises();

    // ElementPicker should have been created and activated
    expect(mockElementPicker).toHaveBeenCalled();
    expect(pickerInstances[0].activate).toHaveBeenCalled();
  });

  test('convert-selection with file output saves to file', async () => {
    jest.resetModules();
    pickerInstances = [];
    mockElementPicker.mockReset();
    mockElementPicker.mockImplementation(({ onConfirm, onCancel }) => {
      const instance = {
        activate: jest.fn(),
        deactivate: jest.fn(),
        preselectElement: jest.fn(),
        onConfirm,
        onCancel,
        selectedElements: []
      };
      pickerInstances.push(instance);
      return instance;
    });

    const setup = require('./helpers/integration-setup');
    ({ bus, storage } = setup.createTestHarness({
      preferences: { outputMode: 'file' }
    }));
    bus.fireOnInstalled();

    // Set up selection
    const range = document.createRange();
    const paragraph = document.querySelector('p');
    range.selectNodeContents(paragraph);
    const selection = window.getSelection();
    selection.removeAllRanges();
    selection.addRange(range);

    bus.fireContextMenu({ menuItemId: 'convert-selection' });
    await flushPromises();

    expect(URL.createObjectURL).toHaveBeenCalled();
    expect(navigator.clipboard.writeText).not.toHaveBeenCalled();
  });
});
