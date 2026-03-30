/**
 * Integration tests: Selection mode lifecycle (Phase 6.2.3)
 *
 * Tests the full selection flow:
 * startSelectionMode → ElementPicker interaction → selectionComplete/selectionCancelled → output
 */

const mockElementPicker = jest.fn();
jest.mock('../../src/content/element-picker', () => {
  return mockElementPicker;
});

describe('Selection mode lifecycle', () => {
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
  });

  test('startSelectionMode flows from popup through background to content', async () => {
    const response = await bus.simulatePopupMessage({ action: 'startSelectionMode' });

    expect(response.success).toBe(true);
    // Content script should have created an ElementPicker
    expect(mockElementPicker).toHaveBeenCalled();
    expect(pickerInstances[0].activate).toHaveBeenCalled();
  });

  test('selectionComplete triggers clipboard write and clears state', async () => {
    // Start selection mode first
    await bus.simulatePopupMessage({ action: 'startSelectionMode' });

    // Verify selection state is active
    const stateBeforeResponse = await bus.simulatePopupMessage({ action: 'getSelectionState' });
    expect(stateBeforeResponse.active).toBe(true);

    // Simulate user confirming selection with a real DOM element
    const testElement = document.createElement('div');
    testElement.innerHTML = '<p>Selected content for testing purposes with enough text</p>';
    document.body.appendChild(testElement);

    // Invoke onConfirm — this triggers selectionComplete message to background
    await pickerInstances[0].onConfirm([testElement]);
    await flushPromises();

    // Clipboard should have been written
    expect(navigator.clipboard.writeText).toHaveBeenCalled();
    const clipboardText = navigator.clipboard.writeText.mock.calls[0][0];
    expect(clipboardText).toContain('Selected content');

    // Selection state should be cleared
    const stateAfterResponse = await bus.simulatePopupMessage({ action: 'getSelectionState' });
    expect(stateAfterResponse.active).toBe(false);
  });

  test('cancelSelectionMode flows through and clears state', async () => {
    await bus.simulatePopupMessage({ action: 'startSelectionMode' });

    const response = await bus.simulatePopupMessage({ action: 'cancelSelectionMode' });
    expect(response.success).toBe(true);

    const stateResponse = await bus.simulatePopupMessage({ action: 'getSelectionState' });
    expect(stateResponse.active).toBe(false);
  });

  test('selectionCancelled (user presses Escape) clears background state', async () => {
    await bus.simulatePopupMessage({ action: 'startSelectionMode' });

    // Simulate user pressing Escape — ElementPicker calls onCancel
    pickerInstances[0].onCancel();
    await flushPromises();

    // selectionCancelled was sent to background, state should be cleared
    const stateResponse = await bus.simulatePopupMessage({ action: 'getSelectionState' });
    expect(stateResponse.active).toBe(false);
  });

  test('getSelectionState returns correct state before and after', async () => {
    const before = await bus.simulatePopupMessage({ action: 'getSelectionState' });
    expect(before.active).toBe(false);

    await bus.simulatePopupMessage({ action: 'startSelectionMode' });

    const after = await bus.simulatePopupMessage({ action: 'getSelectionState' });
    expect(after.active).toBe(true);
  });

  test('tab close cleans up selection state', async () => {
    await bus.simulatePopupMessage({ action: 'startSelectionMode' });

    // Simulate tab being closed
    bus.fireTabRemoved();

    const stateResponse = await bus.simulatePopupMessage({ action: 'getSelectionState' });
    expect(stateResponse.active).toBe(false);
  });

  test('selectionComplete with file output saves file instead of clipboard', async () => {
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

    await bus.simulatePopupMessage({ action: 'startSelectionMode' });

    const testElement = document.createElement('div');
    testElement.innerHTML = '<p>File save test content with enough text to convert</p>';
    document.body.appendChild(testElement);

    await pickerInstances[0].onConfirm([testElement]);
    await flushPromises();

    // Should use file save, not clipboard
    expect(URL.createObjectURL).toHaveBeenCalled();
    expect(navigator.clipboard.writeText).not.toHaveBeenCalled();
  });
});
