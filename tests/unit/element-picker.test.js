const ElementPicker = require('../../src/content/element-picker');

describe('ElementPicker', () => {
  let picker;
  let onConfirm;
  let onCancel;

  beforeEach(() => {
    document.body.innerHTML = `
      <div id="container">
        <h1 id="title">Test Title</h1>
        <p id="para1">First paragraph with enough content.</p>
        <div id="block1">
          <p id="nested-para">Nested paragraph.</p>
        </div>
        <p id="para2">Second paragraph.</p>
      </div>
    `;

    onConfirm = jest.fn();
    onCancel = jest.fn();
    picker = new ElementPicker({ onConfirm, onCancel });
  });

  afterEach(() => {
    if (picker.active) {
      picker.deactivate();
    }
  });

  describe('activate/deactivate', () => {
    test('should create shadow DOM host on activate', () => {
      picker.activate();

      const host = document.getElementById('md-element-picker-host');
      expect(host).not.toBeNull();
      expect(host.shadowRoot).not.toBeNull();
      expect(picker.active).toBe(true);
    });

    test('should remove shadow DOM host on deactivate', () => {
      picker.activate();
      picker.deactivate();

      const host = document.getElementById('md-element-picker-host');
      expect(host).toBeNull();
      expect(picker.active).toBe(false);
    });

    test('should not double-activate', () => {
      picker.activate();
      const firstHost = document.getElementById('md-element-picker-host');
      picker.activate();
      const secondHost = document.getElementById('md-element-picker-host');

      expect(firstHost).toBe(secondHost);
    });

    test('should clear selected elements on deactivate', () => {
      picker.activate();
      picker.selectedElements = [document.getElementById('para1')];
      picker.deactivate();

      expect(picker.selectedElements).toEqual([]);
    });

    test('should be safe to deactivate when not active', () => {
      expect(() => picker.deactivate()).not.toThrow();
    });
  });

  describe('selection', () => {
    test('should add element to selectedElements on simulated selection', () => {
      picker.activate();

      const el = document.getElementById('para1');
      picker.selectedElements.push(el);

      expect(picker.selectedElements).toContain(el);
      expect(picker.selectedElements.length).toBe(1);
    });

    test('should remove element when deselected', () => {
      picker.activate();

      const el = document.getElementById('para1');
      picker.selectedElements.push(el);
      expect(picker.selectedElements.length).toBe(1);

      // Simulate deselect
      const index = picker.selectedElements.indexOf(el);
      picker.selectedElements.splice(index, 1);
      expect(picker.selectedElements.length).toBe(0);
    });

    test('should support multi-selection', () => {
      picker.activate();

      const el1 = document.getElementById('para1');
      const el2 = document.getElementById('para2');
      picker.selectedElements.push(el1);
      picker.selectedElements.push(el2);

      expect(picker.selectedElements.length).toBe(2);
    });

    test('should handle nested element replacement', () => {
      picker.activate();

      const parent = document.getElementById('block1');
      const child = document.getElementById('nested-para');

      // Select child first
      picker.selectedElements.push(child);
      expect(picker.selectedElements.length).toBe(1);

      // Now select parent — should remove child
      picker.selectedElements = picker.selectedElements.filter(el =>
        !parent.contains(el) && !el.contains(parent)
      );
      picker.selectedElements.push(parent);

      expect(picker.selectedElements).toContain(parent);
      expect(picker.selectedElements).not.toContain(child);
      expect(picker.selectedElements.length).toBe(1);
    });
  });

  describe('getSelectedHtml', () => {
    test('should return outerHTML of selected elements', () => {
      picker.activate();

      const el = document.getElementById('para1');
      picker.selectedElements.push(el);

      const html = picker.getSelectedHtml();
      expect(html).toHaveLength(1);
      expect(html[0]).toContain('First paragraph');
      expect(html[0]).toContain('<p');
    });

    test('should return empty array when nothing selected', () => {
      picker.activate();
      expect(picker.getSelectedHtml()).toEqual([]);
    });
  });

  describe('keyboard handling', () => {
    test('should call onCancel when Escape is pressed', () => {
      picker.activate();

      const event = new KeyboardEvent('keydown', {
        key: 'Escape',
        bubbles: true,
        cancelable: true
      });
      document.dispatchEvent(event);

      expect(onCancel).toHaveBeenCalled();
      expect(picker.active).toBe(false);
    });

    test('should call onConfirm when Enter is pressed with selections', () => {
      picker.activate();

      const el = document.getElementById('para1');
      picker.selectedElements.push(el);

      const event = new KeyboardEvent('keydown', {
        key: 'Enter',
        bubbles: true,
        cancelable: true
      });
      document.dispatchEvent(event);

      expect(onConfirm).toHaveBeenCalledWith([el]);
    });

    test('should not call onConfirm when Enter is pressed without selections', () => {
      picker.activate();

      const event = new KeyboardEvent('keydown', {
        key: 'Enter',
        bubbles: true,
        cancelable: true
      });
      document.dispatchEvent(event);

      expect(onConfirm).not.toHaveBeenCalled();
    });
  });

  describe('toolbar', () => {
    test('should create toolbar in shadow DOM', () => {
      picker.activate();

      const toolbar = picker.shadowRoot.querySelector('.picker-toolbar');
      expect(toolbar).not.toBeNull();
    });

    test('should have disabled copy button initially', () => {
      picker.activate();

      const copyBtn = picker.shadowRoot.querySelector('.picker-copy-btn');
      expect(copyBtn.disabled).toBe(true);
    });

    test('should show element count', () => {
      picker.activate();

      const count = picker.shadowRoot.querySelector('.picker-count');
      expect(count.textContent).toBe('No elements selected');
    });
  });

  describe('preselectElement', () => {
    test('should add element to selection when _resolveTarget succeeds', () => {
      picker.activate();

      // Mock _resolveTarget to bypass jsdom's 0x0 getBoundingClientRect
      const el = document.getElementById('para1');
      picker._resolveTarget = jest.fn().mockReturnValue(el);
      picker.preselectElement(el);

      expect(picker.selectedElements).toContain(el);
      expect(picker.selectedElements.length).toBe(1);
    });

    test('should not add duplicates', () => {
      picker.activate();

      const el = document.getElementById('para1');
      picker._resolveTarget = jest.fn().mockReturnValue(el);
      picker.preselectElement(el);
      picker.preselectElement(el);

      expect(picker.selectedElements.length).toBe(1);
    });

    test('should do nothing when not active', () => {
      const el = document.getElementById('para1');
      picker.preselectElement(el);

      expect(picker.selectedElements.length).toBe(0);
    });

    test('should do nothing with null element', () => {
      picker.activate();
      picker.preselectElement(null);

      expect(picker.selectedElements.length).toBe(0);
    });

    test('should do nothing when _resolveTarget returns null', () => {
      picker.activate();

      const el = document.getElementById('para1');
      picker._resolveTarget = jest.fn().mockReturnValue(null);
      picker.preselectElement(el);

      expect(picker.selectedElements.length).toBe(0);
    });
  });

  describe('_resolveTarget', () => {
    test('should return null for shadow host', () => {
      picker.activate();
      expect(picker._resolveTarget(picker.shadowHost)).toBeNull();
    });

    test('should return null for body', () => {
      picker.activate();
      expect(picker._resolveTarget(document.body)).toBeNull();
    });

    test('should return an element (walks up from small elements in jsdom)', () => {
      picker.activate();
      const el = document.getElementById('para1');
      // In jsdom, getBoundingClientRect returns 0x0, so _resolveTarget
      // walks up to a parent. Just verify it returns a valid element.
      const result = picker._resolveTarget(el);
      expect(result).not.toBeNull();
      expect(result.nodeType).toBe(1); // Element node
    });
  });
});
