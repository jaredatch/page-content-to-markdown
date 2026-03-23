/**
 * ElementPicker — handles DOM interaction for selective element conversion.
 * All UI lives in a shadow DOM to avoid CSS conflicts with the host page.
 */

class ElementPicker {
  constructor({ onConfirm, onCancel }) {
    this.onConfirm = onConfirm;
    this.onCancel = onCancel;
    this.selectedElements = [];
    this.hoveredElement = null;
    this.shadowHost = null;
    this.shadowRoot = null;
    this.hoverOverlay = null;
    this.selectedOverlays = [];
    this.toolbar = null;
    this.active = false;
    this._rafId = null;
    this._pendingMouseEvent = null;

    // Bind handlers so we can remove them later
    this._onMouseMove = this._onMouseMove.bind(this);
    this._onClick = this._onClick.bind(this);
    this._onKeyDown = this._onKeyDown.bind(this);
    this._onScrollResize = this._onScrollResize.bind(this);
  }

  activate() {
    if (this.active) return;
    this.active = true;

    // Create shadow DOM host
    this.shadowHost = document.createElement('div');
    this.shadowHost.id = 'md-element-picker-host';
    this.shadowHost.style.cssText = 'all: initial; position: fixed; z-index: 2147483647; top: 0; left: 0; width: 0; height: 0; pointer-events: none;';
    document.body.appendChild(this.shadowHost);
    this.shadowRoot = this.shadowHost.attachShadow({ mode: 'open' });

    // Inject styles
    const style = document.createElement('style');
    style.textContent = this._getStyles();
    this.shadowRoot.appendChild(style);

    // Create hover overlay
    this.hoverOverlay = document.createElement('div');
    this.hoverOverlay.className = 'picker-overlay picker-hover';
    this.shadowRoot.appendChild(this.hoverOverlay);

    // Create toolbar
    this._createToolbar();

    // Attach listeners (capture phase)
    document.addEventListener('mousemove', this._onMouseMove, true);
    document.addEventListener('click', this._onClick, true);
    document.addEventListener('keydown', this._onKeyDown, true);
    window.addEventListener('scroll', this._onScrollResize, true);
    window.addEventListener('resize', this._onScrollResize, true);

    console.log('🎯 [element-picker] Activated');
  }

  deactivate() {
    if (!this.active) return;
    this.active = false;

    // Remove listeners
    document.removeEventListener('mousemove', this._onMouseMove, true);
    document.removeEventListener('click', this._onClick, true);
    document.removeEventListener('keydown', this._onKeyDown, true);
    window.removeEventListener('scroll', this._onScrollResize, true);
    window.removeEventListener('resize', this._onScrollResize, true);

    if (this._rafId) {
      cancelAnimationFrame(this._rafId);
      this._rafId = null;
    }

    // Remove shadow host (removes all overlays + toolbar)
    if (this.shadowHost && this.shadowHost.parentNode) {
      this.shadowHost.parentNode.removeChild(this.shadowHost);
    }

    this.shadowHost = null;
    this.shadowRoot = null;
    this.hoverOverlay = null;
    this.selectedOverlays = [];
    this.toolbar = null;
    this.selectedElements = [];
    this.hoveredElement = null;

    console.log('🎯 [element-picker] Deactivated');
  }

  getSelectedHtml() {
    return this.selectedElements.map(el => el.outerHTML);
  }

  /**
   * Pre-select an element (e.g. from a right-click context menu).
   * Must be called after activate().
   */
  preselectElement(el) {
    if (!this.active || !el) return;

    const resolved = this._resolveTarget(el);
    if (!resolved) return;

    // Avoid duplicates
    if (this.selectedElements.indexOf(resolved) !== -1) return;

    this.selectedElements.push(resolved);
    this._updateSelectedOverlays();
    this._updateToolbar();
  }

  // --- Private methods ---

  _onMouseMove(e) {
    this._pendingMouseEvent = e;
    if (!this._rafId) {
      this._rafId = requestAnimationFrame(() => {
        this._rafId = null;
        if (!this._pendingMouseEvent || !this.active) return;
        const evt = this._pendingMouseEvent;
        this._pendingMouseEvent = null;

        let target = document.elementFromPoint(evt.clientX, evt.clientY);
        if (!target || target === this.shadowHost) {
          this._hideHoverOverlay();
          return;
        }

        target = this._resolveTarget(target);
        if (!target) {
          this._hideHoverOverlay();
          return;
        }

        this.hoveredElement = target;
        this._positionOverlay(this.hoverOverlay, target);
        this.hoverOverlay.style.display = 'block';
      });
    }
  }

  _onClick(e) {
    if (!this.active) return;

    // Don't intercept clicks on our toolbar
    if (e.target === this.shadowHost || (e.composedPath && e.composedPath().includes(this.shadowHost))) {
      return;
    }

    e.preventDefault();
    e.stopImmediatePropagation();

    let target = document.elementFromPoint(e.clientX, e.clientY);
    if (!target || target === this.shadowHost) return;

    target = this._resolveTarget(target);
    if (!target) return;

    const existingIndex = this.selectedElements.indexOf(target);
    if (existingIndex !== -1) {
      // Deselect
      this.selectedElements.splice(existingIndex, 1);
    } else {
      // Handle nested: remove children/parents that conflict
      this.selectedElements = this.selectedElements.filter(el =>
        !target.contains(el) && !el.contains(target)
      );
      this.selectedElements.push(target);
    }

    this._updateSelectedOverlays();
    this._updateToolbar();
  }

  _onKeyDown(e) {
    if (!this.active) return;

    if (e.key === 'Escape') {
      e.preventDefault();
      e.stopImmediatePropagation();
      this.deactivate();
      if (this.onCancel) this.onCancel();
    } else if (e.key === 'Enter' && this.selectedElements.length > 0) {
      e.preventDefault();
      e.stopImmediatePropagation();
      if (this.onConfirm) this.onConfirm(this.selectedElements);
    }
  }

  _onScrollResize() {
    if (!this.active) return;
    // Reposition hover overlay
    if (this.hoveredElement) {
      this._positionOverlay(this.hoverOverlay, this.hoveredElement);
    }
    // Reposition selected overlays
    this.selectedElements.forEach((el, i) => {
      if (this.selectedOverlays[i]) {
        this._positionOverlay(this.selectedOverlays[i], el);
      }
    });
  }

  _resolveTarget(target) {
    // Skip our own shadow host
    if (target === this.shadowHost) return null;

    // Skip tiny elements — walk up to a block-level ancestor
    const rect = target.getBoundingClientRect();
    if (rect.width < 20 || rect.height < 20) {
      target = target.parentElement;
      if (!target || target === document.body || target === document.documentElement) return null;
    }

    // Walk up from inline elements to block-level parents
    const inlineTags = ['SPAN', 'A', 'STRONG', 'EM', 'B', 'I', 'U', 'CODE', 'SMALL', 'SUB', 'SUP', 'ABBR', 'MARK'];
    let walked = 0;
    while (target && inlineTags.includes(target.tagName) && walked < 3) {
      target = target.parentElement;
      walked++;
    }

    if (!target || target === document.body || target === document.documentElement) return null;

    return target;
  }

  _positionOverlay(overlay, element) {
    const rect = element.getBoundingClientRect();
    overlay.style.top = rect.top + 'px';
    overlay.style.left = rect.left + 'px';
    overlay.style.width = rect.width + 'px';
    overlay.style.height = rect.height + 'px';
  }

  _hideHoverOverlay() {
    if (this.hoverOverlay) {
      this.hoverOverlay.style.display = 'none';
    }
    this.hoveredElement = null;
  }

  _updateSelectedOverlays() {
    // Remove existing selected overlays
    this.selectedOverlays.forEach(o => o.remove());
    this.selectedOverlays = [];

    // Create new overlays for each selected element
    this.selectedElements.forEach((el, index) => {
      const overlay = document.createElement('div');
      overlay.className = 'picker-overlay picker-selected';
      this._positionOverlay(overlay, el);

      const badge = document.createElement('span');
      badge.className = 'picker-badge';
      badge.textContent = index + 1;
      overlay.appendChild(badge);

      this.shadowRoot.appendChild(overlay);
      this.selectedOverlays.push(overlay);
    });
  }

  _updateToolbar() {
    if (!this.toolbar) return;
    const countEl = this.toolbar.querySelector('.picker-count');
    const copyBtn = this.toolbar.querySelector('.picker-copy-btn');

    const count = this.selectedElements.length;
    countEl.textContent = count === 0
      ? 'No elements selected'
      : `${count} element${count > 1 ? 's' : ''} selected`;
    copyBtn.disabled = count === 0;
  }

  _createToolbar() {
    this.toolbar = document.createElement('div');
    this.toolbar.className = 'picker-toolbar';
    // Toolbar needs pointer events
    this.toolbar.style.pointerEvents = 'auto';
    this.toolbar.innerHTML = `
      <span class="picker-count">No elements selected</span>
      <button class="picker-copy-btn" disabled>Copy as Markdown</button>
      <button class="picker-cancel-btn">Cancel</button>
      <span class="picker-hint">Esc to cancel</span>
    `;

    this.toolbar.querySelector('.picker-copy-btn').addEventListener('click', (e) => {
      e.stopPropagation();
      if (this.selectedElements.length > 0 && this.onConfirm) {
        this.onConfirm(this.selectedElements);
      }
    });

    this.toolbar.querySelector('.picker-cancel-btn').addEventListener('click', (e) => {
      e.stopPropagation();
      this.deactivate();
      if (this.onCancel) this.onCancel();
    });

    this.shadowRoot.appendChild(this.toolbar);
  }

  _getStyles() {
    return `
      .picker-overlay {
        position: fixed;
        pointer-events: none;
        z-index: 2147483646;
        box-sizing: border-box;
        transition: top 0.05s, left 0.05s, width 0.05s, height 0.05s;
      }
      .picker-hover {
        border: 2px dashed #3b82f6;
        background: rgba(59, 130, 246, 0.06);
        display: none;
      }
      .picker-selected {
        border: 2px solid #1a1a1a;
        background: rgba(0, 0, 0, 0.04);
        display: block;
      }
      .picker-badge {
        position: absolute;
        top: -9px;
        left: -9px;
        width: 20px;
        height: 20px;
        background: #1a1a1a;
        color: #fff;
        border-radius: 50%;
        font-size: 11px;
        font-weight: 600;
        display: flex;
        align-items: center;
        justify-content: center;
        font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
        pointer-events: none;
      }
      .picker-toolbar {
        position: fixed;
        bottom: 16px;
        left: 50%;
        transform: translateX(-50%);
        background: #1a1a1a;
        color: #fff;
        padding: 8px 14px;
        border-radius: 8px;
        display: flex;
        align-items: center;
        gap: 10px;
        font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
        font-size: 13px;
        box-shadow: 0 4px 20px rgba(0, 0, 0, 0.25);
        z-index: 2147483647;
        white-space: nowrap;
      }
      .picker-count {
        font-weight: 500;
        font-size: 12px;
        color: #aaa;
      }
      .picker-copy-btn, .picker-cancel-btn {
        border: none;
        border-radius: 5px;
        padding: 5px 12px;
        font-size: 12px;
        font-weight: 500;
        cursor: pointer;
        font-family: inherit;
        transition: background 0.15s;
      }
      .picker-copy-btn {
        background: #fff;
        color: #1a1a1a;
      }
      .picker-copy-btn:hover {
        background: #e5e5e5;
      }
      .picker-copy-btn:disabled {
        opacity: 0.3;
        cursor: not-allowed;
      }
      .picker-cancel-btn {
        background: rgba(255, 255, 255, 0.12);
        color: #ccc;
      }
      .picker-cancel-btn:hover {
        background: rgba(255, 255, 255, 0.2);
        color: #fff;
      }
      .picker-hint {
        font-size: 11px;
        color: #666;
      }
    `;
  }
}

// Support both CommonJS and ES modules
if (typeof module !== 'undefined' && module.exports) {
  module.exports = ElementPicker;
} else if (typeof window !== 'undefined') {
  window.ElementPicker = ElementPicker;
}
