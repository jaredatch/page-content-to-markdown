const ElementPicker = require('../../src/content/element-picker');

describe('ElementPicker', () => {
  let picker;
  let onCopy;
  let onSave;
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

    onCopy = jest.fn().mockResolvedValue({ success: true });
    onSave = jest.fn().mockResolvedValue({ success: true });
    onCancel = jest.fn();
    picker = new ElementPicker({ onCopy, onSave, onCancel });
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

    test('renders a phantom capture layer above page content', () => {
      picker.activate();
      const layer = picker.shadowRoot.querySelector('.mdpicker-capture');
      expect(layer).not.toBeNull();
      expect(layer).toBe(picker._captureLayer);
    });

    test('does not mutate body styles', () => {
      // The phantom capture layer handles cursor + interaction lockdown, so
      // the picker no longer touches body inline styles. Verify we don't
      // accidentally regress to mutating them.
      document.body.style.setProperty('cursor', 'grab');
      picker.activate();
      expect(document.body.style.getPropertyValue('cursor')).toBe('grab');
      picker.deactivate();
      document.body.style.removeProperty('cursor');
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

      picker.selectedElements.push(child);
      expect(picker.selectedElements.length).toBe(1);

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
    test('Esc hard-exits and calls onCancel', () => {
      picker.activate();

      document.dispatchEvent(new KeyboardEvent('keydown', {
        key: 'Escape', bubbles: true, cancelable: true
      }));

      expect(onCancel).toHaveBeenCalled();
      expect(picker.active).toBe(false);
    });

    test('Enter fires the default action (Copy when default = clipboard)', () => {
      picker.activate();
      picker.selectedElements.push(document.getElementById('para1'));

      document.dispatchEvent(new KeyboardEvent('keydown', {
        key: 'Enter', bubbles: true, cancelable: true
      }));

      expect(onCopy).toHaveBeenCalledTimes(1);
      expect(onSave).not.toHaveBeenCalled();
    });

    test('Enter fires Save when default = file', () => {
      picker = new ElementPicker({ onCopy, onSave, onCancel, initialOutputMode: 'file' });
      picker.activate();
      picker.selectedElements.push(document.getElementById('para1'));

      document.dispatchEvent(new KeyboardEvent('keydown', {
        key: 'Enter', bubbles: true, cancelable: true
      }));

      expect(onSave).toHaveBeenCalledTimes(1);
      expect(onCopy).not.toHaveBeenCalled();
    });

    test('C key fires Copy regardless of default', () => {
      picker = new ElementPicker({ onCopy, onSave, onCancel, initialOutputMode: 'file' });
      picker.activate();
      picker.selectedElements.push(document.getElementById('para1'));

      document.dispatchEvent(new KeyboardEvent('keydown', {
        key: 'c', bubbles: true, cancelable: true
      }));

      expect(onCopy).toHaveBeenCalledTimes(1);
      expect(onSave).not.toHaveBeenCalled();
    });

    test('S key fires Save regardless of default', () => {
      picker.activate(); // default is clipboard
      picker.selectedElements.push(document.getElementById('para1'));

      document.dispatchEvent(new KeyboardEvent('keydown', {
        key: 's', bubbles: true, cancelable: true
      }));

      expect(onSave).toHaveBeenCalledTimes(1);
      expect(onCopy).not.toHaveBeenCalled();
    });

    test('Enter / C / S do nothing without selections', () => {
      picker.activate();

      ['Enter', 'c', 's'].forEach(key => {
        document.dispatchEvent(new KeyboardEvent('keydown', {
          key, bubbles: true, cancelable: true
        }));
      });

      expect(onCopy).not.toHaveBeenCalled();
      expect(onSave).not.toHaveBeenCalled();
    });

    test('trusted mousedown is suppressed (drag-text-select / link press)', () => {
      // jsdom-dispatched events get isTrusted = false (matching synthetic clicks),
      // and isTrusted is a non-writable getter on the prototype, so we exercise
      // the handler directly with a mock to simulate a real user mousedown.
      picker.activate();
      const event = {
        isTrusted: true,
        target: document.body,
        composedPath: () => [document.body, document],
        preventDefault: jest.fn(),
        stopImmediatePropagation: jest.fn()
      };
      picker._onMouseDown(event);
      expect(event.preventDefault).toHaveBeenCalled();
      expect(event.stopImmediatePropagation).toHaveBeenCalled();
    });

    test('trusted contextmenu is suppressed (native right-click menu)', () => {
      picker.activate();
      const event = {
        isTrusted: true,
        target: document.body,
        composedPath: () => [document.body, document],
        preventDefault: jest.fn(),
        stopImmediatePropagation: jest.fn()
      };
      picker._onContextMenu(event);
      expect(event.preventDefault).toHaveBeenCalled();
      expect(event.stopImmediatePropagation).toHaveBeenCalled();
    });

    test('synthetic mousedown / contextmenu (isTrusted === false) pass through', () => {
      picker.activate();
      const md = new MouseEvent('mousedown', { bubbles: true, cancelable: true });
      const cm = new MouseEvent('contextmenu', { bubbles: true, cancelable: true });
      picker._captureLayer.dispatchEvent(md);
      picker._captureLayer.dispatchEvent(cm);
      expect(md.defaultPrevented).toBe(false);
      expect(cm.defaultPrevented).toBe(false);
    });

    test('synthetic clicks (e.isTrusted === false) pass through without preventDefault', () => {
      // The picker stays alive across copy/save, and the file-save path triggers
      // a synthetic <a download>.click(). The picker must not swallow that click.
      picker.activate();

      const event = new MouseEvent('click', { bubbles: true, cancelable: true });
      // jsdom-dispatched events have isTrusted = false, matching synthetic clicks.
      picker._captureLayer.dispatchEvent(event);

      expect(event.defaultPrevented).toBe(false);
    });

    test('letter shortcuts skip when target is editable', () => {
      const input = document.createElement('input');
      document.body.appendChild(input);
      picker.activate();
      picker.selectedElements.push(document.getElementById('para1'));

      const event = new KeyboardEvent('keydown', {
        key: 'c', bubbles: true, cancelable: true
      });
      Object.defineProperty(event, 'target', { value: input });
      document.dispatchEvent(event);

      expect(onCopy).not.toHaveBeenCalled();
    });
  });

  describe('banner + segmented default control', () => {
    test('renders the banner on activate', () => {
      picker.activate();
      const banner = picker.shadowRoot.querySelector('.mdpicker-banner');
      expect(banner).not.toBeNull();
      expect(banner.textContent).toContain('Selection mode');
    });

    test('initial default reflects initialOutputMode = clipboard', () => {
      picker.activate();
      const opts = picker.shadowRoot.querySelectorAll('[data-default-mode]');
      const active = Array.from(opts).find(o => o.classList.contains('active'));
      expect(active.dataset.defaultMode).toBe('clipboard');
    });

    test('initial default reflects initialOutputMode = file', () => {
      picker = new ElementPicker({ onCopy, onSave, onCancel, initialOutputMode: 'file' });
      picker.activate();
      const opts = picker.shadowRoot.querySelectorAll('[data-default-mode]');
      const active = Array.from(opts).find(o => o.classList.contains('active'));
      expect(active.dataset.defaultMode).toBe('file');
    });

    test('clicking the segmented control flips primary/secondary buttons (session-local)', () => {
      picker.activate();
      // Default = clipboard → primary should be Copy
      expect(picker.primaryBtn.textContent).toBe('Copy');
      expect(picker.secondaryBtn.textContent).toBe('Save');

      const fileOpt = picker.shadowRoot.querySelector('[data-default-mode="file"]');
      fileOpt.click();

      expect(picker.defaultMode).toBe('file');
      expect(picker.primaryBtn.textContent).toBe('Save');
      expect(picker.secondaryBtn.textContent).toBe('Copy');
    });
  });

  describe('action bar', () => {
    test('renders the action bar on activate', () => {
      picker.activate();
      expect(picker.shadowRoot.querySelector('.mdpicker-bar')).not.toBeNull();
    });

    test('action bar is hidden when count = 0', () => {
      picker.activate();
      const bar = picker.shadowRoot.querySelector('.mdpicker-bar');
      expect(bar.classList.contains('visible')).toBe(false);
    });

    test('action bar becomes visible after preselect adds an element', () => {
      picker.activate();
      const el = document.getElementById('para1');
      picker._resolveTarget = jest.fn().mockReturnValue(el);
      picker.preselectElement(el);

      const bar = picker.shadowRoot.querySelector('.mdpicker-bar');
      expect(bar.classList.contains('visible')).toBe(true);
      expect(picker.countNum.textContent).toBe('1');
    });

    test('Clear button empties selection and hides the bar', () => {
      picker.activate();
      const el = document.getElementById('para1');
      picker._resolveTarget = jest.fn().mockReturnValue(el);
      picker.preselectElement(el);

      const bar = picker.shadowRoot.querySelector('.mdpicker-bar');
      expect(bar.classList.contains('visible')).toBe(true);

      picker.shadowRoot.querySelector('[data-act="clear"]').click();

      expect(picker.selectedElements).toEqual([]);
      expect(bar.classList.contains('visible')).toBe(false);
      expect(picker.active).toBe(true); // Clear stays in mode
    });

    test('X icon button hard-exits', () => {
      picker.activate();
      picker.shadowRoot.querySelector('[data-act="exit"]').click();

      expect(onCancel).toHaveBeenCalled();
      expect(picker.active).toBe(false);
    });

    test('primary button click calls onCopy when default = clipboard', async () => {
      picker.activate();
      const el = document.getElementById('para1');
      picker._resolveTarget = jest.fn().mockReturnValue(el);
      picker.preselectElement(el);

      picker.primaryBtn.click();
      // _fireAction is async; let it resolve.
      await Promise.resolve();
      await Promise.resolve();

      expect(onCopy).toHaveBeenCalledTimes(1);
      expect(onCopy.mock.calls[0][0]).toContain(el);
    });

    test('secondary button click calls onSave when default = clipboard', async () => {
      picker.activate();
      const el = document.getElementById('para1');
      picker._resolveTarget = jest.fn().mockReturnValue(el);
      picker.preselectElement(el);

      picker.secondaryBtn.click();
      await Promise.resolve();
      await Promise.resolve();

      expect(onSave).toHaveBeenCalledTimes(1);
    });

    test('selection persists after a successful action', async () => {
      picker.activate();
      const el = document.getElementById('para1');
      picker._resolveTarget = jest.fn().mockReturnValue(el);
      picker.preselectElement(el);

      picker.primaryBtn.click();
      await Promise.resolve();
      await Promise.resolve();

      expect(picker.selectedElements).toContain(el);
      expect(picker.active).toBe(true);
    });

    test('double-click while in flight is ignored', async () => {
      let resolveCopy;
      onCopy = jest.fn(() => new Promise(res => { resolveCopy = res; }));
      picker = new ElementPicker({ onCopy, onSave, onCancel });
      picker.activate();
      const el = document.getElementById('para1');
      picker._resolveTarget = jest.fn().mockReturnValue(el);
      picker.preselectElement(el);

      picker.primaryBtn.click();
      picker.primaryBtn.click();
      picker.primaryBtn.click();

      expect(onCopy).toHaveBeenCalledTimes(1);
      resolveCopy({ success: true });
      await Promise.resolve();
      await Promise.resolve();
    });
  });

  describe('preselectElement', () => {
    test('should add element to selection when _resolveTarget succeeds', () => {
      picker.activate();

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
      const result = picker._resolveTarget(el);
      expect(result).not.toBeNull();
      expect(result.nodeType).toBe(1);
    });
  });
});
