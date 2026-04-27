/**
 * ElementPicker — on-page UI for selecting elements to convert to markdown.
 *
 * Lives in a shadow DOM so host-page CSS can't reach our styles.
 * Three pieces:
 *   - Sticky banner (mode indicator + Default Copy/Save segmented control)
 *   - Hover/selected overlays painted over the page (no host-DOM mutation)
 *   - Floating action bar (Clear · secondary · primary · X exit)
 *
 * Caller wires three callbacks: onCopy(elements), onSave(elements), onCancel().
 * onCopy/onSave should return `{ success: boolean }` (or a promise of it) so
 * the picker can flash the button green only when the action actually landed.
 *
 * The Default segmented control is session-local: flipping it during selection
 * mode only swaps which side of the action bar is the white "primary" button.
 * It does NOT write back to prefs.outputMode — the popup remains the canonical
 * place to change the persistent default.
 */

const BANNER_CLASS = 'mdpicker-banner';
const HOVER_CLASS = 'mdpicker-hover';
const SELECTED_CLASS = 'mdpicker-selected';
const ACTION_BAR_CLASS = 'mdpicker-bar';
const SUCCESS_FLASH_MS = 1400;
const OVERLAY_OFFSET = 4; // matches prototype's `outline-offset: 4px`

const EXIT_ICON_SVG = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>`;
const CHECK_ICON_SVG = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" style="vertical-align:-2px" aria-hidden="true"><polyline points="20 6 9 17 4 12"/></svg>`;

class ElementPicker {
  constructor({ onCopy, onSave, onCancel, initialOutputMode } = {}) {
    this.onCopy = onCopy;
    this.onSave = onSave;
    this.onCancel = onCancel;
    this.defaultMode = initialOutputMode === 'file' ? 'file' : 'clipboard';

    this.selectedElements = [];
    this.hoveredElement = null;
    this.shadowHost = null;
    this.shadowRoot = null;
    this.hoverOverlay = null;
    this.selectedOverlays = [];
    this.banner = null;
    this.actionBar = null;
    this.primaryBtn = null;
    this.secondaryBtn = null;
    this.clearBtn = null;
    this.countNum = null;
    this.active = false;
    this.actionInFlight = false;

    this._rafId = null;
    this._pendingMouseEvent = null;
    this._flashTimer = null;
    this._flashBtn = null;

    this._captureLayer = null;

    this._onMouseMove = this._onMouseMove.bind(this);
    this._onMouseDown = this._onMouseDown.bind(this);
    this._onClick = this._onClick.bind(this);
    this._onContextMenu = this._onContextMenu.bind(this);
    this._onKeyDown = this._onKeyDown.bind(this);
    this._onScrollResize = this._onScrollResize.bind(this);
  }

  activate() {
    if (this.active) return;
    this.active = true;

    // Drop focus from any host-page input so single-letter shortcuts (C/S)
    // don't collide with whatever the user was typing into.
    if (document.activeElement && typeof document.activeElement.blur === 'function') {
      try { document.activeElement.blur(); } catch (e) { /* ignore */ }
    }

    this.shadowHost = document.createElement('div');
    this.shadowHost.id = 'md-element-picker-host';
    this.shadowHost.style.cssText = 'all: initial; position: fixed; z-index: 2147483647; top: 0; left: 0; width: 0; height: 0; pointer-events: none;';
    document.body.appendChild(this.shadowHost);
    this.shadowRoot = this.shadowHost.attachShadow({ mode: 'open' });

    const style = document.createElement('style');
    style.textContent = this._getStyles();
    this.shadowRoot.appendChild(style);

    this._createBanner();

    // Phantom capture layer — a transparent full-viewport div that sits above
    // page content but below our banner / action bar. Mouse events land here,
    // never on page elements, which means :hover never fires anywhere in the
    // host page. We use document.elementsFromPoint to find what's underneath
    // when we need to know what the user is targeting.
    this._captureLayer = document.createElement('div');
    this._captureLayer.className = 'mdpicker-capture';
    this.shadowRoot.appendChild(this._captureLayer);

    this.hoverOverlay = document.createElement('div');
    this.hoverOverlay.className = `mdpicker-overlay ${HOVER_CLASS}`;
    this.shadowRoot.appendChild(this.hoverOverlay);

    this._createActionBar();
    this._updateActionBar();

    // Mouse events listen on the capture layer rather than document. Banner
    // and action-bar clicks are above the capture layer in z-index, so they
    // hit those buttons directly and never come through here.
    this._captureLayer.addEventListener('mousemove', this._onMouseMove);
    this._captureLayer.addEventListener('mousedown', this._onMouseDown);
    this._captureLayer.addEventListener('click', this._onClick);
    this._captureLayer.addEventListener('contextmenu', this._onContextMenu);

    // Keyboard isn't position-based, so it stays at the document level.
    document.addEventListener('keydown', this._onKeyDown, true);
    window.addEventListener('scroll', this._onScrollResize, true);
    window.addEventListener('resize', this._onScrollResize, true);

    console.log('🎯 [element-picker] Activated');
  }

  deactivate() {
    if (!this.active) return;
    this.active = false;

    // The capture layer's listeners go away with the shadow host removal
    // below, but null the ref explicitly first so any in-flight RAF callback
    // sees an inactive picker.
    document.removeEventListener('keydown', this._onKeyDown, true);
    window.removeEventListener('scroll', this._onScrollResize, true);
    window.removeEventListener('resize', this._onScrollResize, true);

    if (this._rafId) {
      cancelAnimationFrame(this._rafId);
      this._rafId = null;
    }
    if (this._flashTimer) {
      clearTimeout(this._flashTimer);
      this._flashTimer = null;
    }
    this._flashBtn = null;

    if (this.shadowHost && this.shadowHost.parentNode) {
      this.shadowHost.parentNode.removeChild(this.shadowHost);
    }

    this.shadowHost = null;
    this.shadowRoot = null;
    this.hoverOverlay = null;
    this.selectedOverlays = [];
    this.banner = null;
    this.actionBar = null;
    this.primaryBtn = null;
    this.secondaryBtn = null;
    this.clearBtn = null;
    this.countNum = null;
    this._captureLayer = null;
    this.selectedElements = [];
    this.hoveredElement = null;
    this.actionInFlight = false;

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
    if (this.selectedElements.indexOf(resolved) !== -1) return;
    this.selectedElements.push(resolved);
    this._updateSelectedOverlays();
    this._updateActionBar();
  }

  // --- private ---

  _onMouseMove(e) {
    this._pendingMouseEvent = e;
    if (this._rafId) return;
    this._rafId = requestAnimationFrame(() => {
      this._rafId = null;
      if (!this._pendingMouseEvent || !this.active) return;
      const evt = this._pendingMouseEvent;
      this._pendingMouseEvent = null;

      let target = this._findPageElementAt(evt.clientX, evt.clientY);
      if (!target) {
        this._hideHoverOverlay();
        return;
      }

      target = this._resolveTarget(target);
      if (!target) {
        this._hideHoverOverlay();
        return;
      }

      // Don't paint a hover ring on top of an already-selected element.
      if (this.selectedElements.indexOf(target) !== -1) {
        this._hideHoverOverlay();
        return;
      }

      this.hoveredElement = target;
      this._positionOverlay(this.hoverOverlay, target);
      this.hoverOverlay.style.display = 'block';
    });
  }

  /**
   * Find the topmost host-page element at viewport coordinates (x, y).
   *
   * The capture layer is on top in z-order, so document.elementFromPoint
   * would return our shadow host. elementsFromPoint returns the full stack;
   * we skip our own shadow host and grab the next layer down.
   */
  _findPageElementAt(x, y) {
    const els = document.elementsFromPoint(x, y);
    for (let i = 0; i < els.length; i++) {
      if (els[i] !== this.shadowHost) return els[i];
    }
    return null;
  }

  _onMouseDown(e) {
    if (!this.active) return;
    if (e.isTrusted === false) return;
    // Capture layer hosts these listeners, so banner / bar clicks never come
    // through here — no shadow-host check needed.
    e.preventDefault();
    e.stopImmediatePropagation();
  }

  _onContextMenu(e) {
    if (!this.active) return;
    if (e.isTrusted === false) return;
    // Suppresses the native context menu and any page-custom right-click menu.
    e.preventDefault();
    e.stopImmediatePropagation();
  }

  _onClick(e) {
    if (!this.active) return;

    // Let synthetic clicks pass through. The picker stays alive across
    // copy/save now, so the content-script's `<a download>.click()` for file
    // save fires while we're still listening — without this guard, our
    // preventDefault would swallow the download.
    if (e.isTrusted === false) return;

    e.preventDefault();
    e.stopImmediatePropagation();

    let target = this._findPageElementAt(e.clientX, e.clientY);
    if (!target) return;

    target = this._resolveTarget(target);
    if (!target) return;

    const existingIndex = this.selectedElements.indexOf(target);
    if (existingIndex !== -1) {
      this.selectedElements.splice(existingIndex, 1);
    } else {
      // If the click lands on an ancestor or descendant of an existing
      // selection, replace rather than nest. Markdown of nested selections
      // would just duplicate content.
      this.selectedElements = this.selectedElements.filter(el =>
        !target.contains(el) && !el.contains(target)
      );
      this.selectedElements.push(target);
    }

    this._hideHoverOverlay();
    this._updateSelectedOverlays();
    this._updateActionBar();
  }

  _onKeyDown(e) {
    if (!this.active) return;

    // Esc always works regardless of focus context.
    if (e.key === 'Escape') {
      e.preventDefault();
      e.stopImmediatePropagation();
      this._hardExit();
      return;
    }

    // Skip letter/Enter shortcuts if focus somehow landed in an editable element
    // — the picker blurs on activate, but host-page scripts could refocus.
    if (this._isEditableTarget(e.target)) return;

    if (e.key === 'Enter') {
      if (this.selectedElements.length === 0) return;
      e.preventDefault();
      e.stopImmediatePropagation();
      this._fireAction(this.defaultMode, this.primaryBtn);
      return;
    }

    if (e.key === 'c' || e.key === 'C') {
      if (this.selectedElements.length === 0) return;
      e.preventDefault();
      e.stopImmediatePropagation();
      const btn = this.defaultMode === 'clipboard' ? this.primaryBtn : this.secondaryBtn;
      this._fireAction('clipboard', btn);
      return;
    }

    if (e.key === 's' || e.key === 'S') {
      if (this.selectedElements.length === 0) return;
      e.preventDefault();
      e.stopImmediatePropagation();
      const btn = this.defaultMode === 'file' ? this.primaryBtn : this.secondaryBtn;
      this._fireAction('file', btn);
    }
  }

  _isEditableTarget(el) {
    if (!el) return false;
    const tag = el.tagName;
    if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return true;
    if (el.isContentEditable) return true;
    return false;
  }

  _onScrollResize() {
    if (!this.active) return;
    if (this.hoveredElement) {
      this._positionOverlay(this.hoverOverlay, this.hoveredElement);
    }
    this.selectedElements.forEach((el, i) => {
      if (this.selectedOverlays[i]) {
        this._positionOverlay(this.selectedOverlays[i], el);
      }
    });
  }

  _resolveTarget(target) {
    if (target === this.shadowHost) return null;

    const rect = target.getBoundingClientRect();
    if (rect.width < 20 || rect.height < 20) {
      target = target.parentElement;
      if (!target || target === document.body || target === document.documentElement) return null;
    }

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
    overlay.style.top = (rect.top - OVERLAY_OFFSET) + 'px';
    overlay.style.left = (rect.left - OVERLAY_OFFSET) + 'px';
    overlay.style.width = (rect.width + OVERLAY_OFFSET * 2) + 'px';
    overlay.style.height = (rect.height + OVERLAY_OFFSET * 2) + 'px';
  }

  _hideHoverOverlay() {
    if (this.hoverOverlay) this.hoverOverlay.style.display = 'none';
    this.hoveredElement = null;
  }

  _updateSelectedOverlays() {
    this.selectedOverlays.forEach(o => o.remove());
    this.selectedOverlays = [];

    this.selectedElements.forEach((el, index) => {
      const overlay = document.createElement('div');
      overlay.className = `mdpicker-overlay ${SELECTED_CLASS}`;
      this._positionOverlay(overlay, el);

      const badge = document.createElement('span');
      badge.className = 'mdpicker-badge';
      badge.textContent = String(index + 1);
      overlay.appendChild(badge);

      this.shadowRoot.appendChild(overlay);
      this.selectedOverlays.push(overlay);
    });
  }

  _updateActionBar() {
    if (!this.actionBar) return;
    const count = this.selectedElements.length;

    if (this.countNum) this.countNum.textContent = String(count);

    if (count > 0) {
      this.actionBar.classList.add('visible');
    } else {
      this.actionBar.classList.remove('visible');
    }

    this._updateButtonRoles();
  }

  _updateButtonRoles() {
    if (!this.primaryBtn || !this.secondaryBtn) return;
    if (this.defaultMode === 'clipboard') {
      this.primaryBtn.dataset.role = 'clipboard';
      this.primaryBtn.textContent = 'Copy';
      this.secondaryBtn.dataset.role = 'file';
      this.secondaryBtn.textContent = 'Save';
    } else {
      this.primaryBtn.dataset.role = 'file';
      this.primaryBtn.textContent = 'Save';
      this.secondaryBtn.dataset.role = 'clipboard';
      this.secondaryBtn.textContent = 'Copy';
    }
  }

  _setDefaultMode(mode) {
    if (mode !== 'clipboard' && mode !== 'file') return;
    this.defaultMode = mode;
    if (this.banner) {
      const opts = this.banner.querySelectorAll('[data-default-mode]');
      opts.forEach(opt => {
        opt.classList.toggle('active', opt.dataset.defaultMode === mode);
        opt.setAttribute('aria-checked', opt.dataset.defaultMode === mode ? 'true' : 'false');
      });
    }
    // End any in-flight success flash so the swapped button renders cleanly
    // (otherwise the green pill briefly carries the new label).
    this._endFlash();
  }

  async _fireAction(mode, btn) {
    if (!this.active) return;
    if (this.actionInFlight) return;
    if (this.selectedElements.length === 0) return;

    const handler = mode === 'file' ? this.onSave : this.onCopy;
    if (typeof handler !== 'function') return;

    this.actionInFlight = true;
    this._setBarBusy(true);

    let success = false;
    try {
      const ret = await handler(this.selectedElements.slice());
      success = !!(ret && ret.success !== false);
    } catch (e) {
      success = false;
    }

    this.actionInFlight = false;
    this._setBarBusy(false);

    if (!this.active) return;

    if (success && btn) {
      this._flashSuccess(btn, mode === 'file' ? 'Saved' : 'Copied');
    }
  }

  _setBarBusy(busy) {
    if (!this.actionBar) return;
    [this.primaryBtn, this.secondaryBtn, this.clearBtn].forEach(b => {
      if (!b) return;
      b.disabled = busy;
    });
  }

  _flashSuccess(btn, label) {
    this._endFlash();
    this._flashBtn = btn;
    btn.innerHTML = `${CHECK_ICON_SVG} ${label}`;
    btn.classList.add('success');
    this._flashTimer = setTimeout(() => this._endFlash(), SUCCESS_FLASH_MS);
  }

  _endFlash() {
    if (this._flashTimer) {
      clearTimeout(this._flashTimer);
      this._flashTimer = null;
    }
    if (this._flashBtn) {
      this._flashBtn.classList.remove('success');
      this._flashBtn = null;
    }
    // Re-render primary/secondary text from current defaultMode — handles the
    // case where the user flipped the segmented control during the flash.
    if (this.active) this._updateButtonRoles();
  }

  _clearSelection() {
    this.selectedElements = [];
    this._updateSelectedOverlays();
    this._updateActionBar();
  }

  _hardExit() {
    const cb = this.onCancel;
    this.deactivate();
    if (typeof cb === 'function') cb();
  }

  _createBanner() {
    this.banner = document.createElement('div');
    this.banner.className = BANNER_CLASS;
    this.banner.innerHTML = `
      <div class="mdpicker-banner-left">
        <span class="mdpicker-dot" aria-hidden="true"></span>
        <span class="mdpicker-banner-text"><strong>Selection mode</strong> &mdash; click any element to select</span>
      </div>
      <div class="mdpicker-banner-right">
        <span class="mdpicker-default-label">Default:</span>
        <div class="mdpicker-segmented" role="radiogroup" aria-label="Default action">
          <button type="button" class="mdpicker-seg-opt" data-default-mode="clipboard" role="radio" aria-checked="false">Copy</button>
          <button type="button" class="mdpicker-seg-opt" data-default-mode="file" role="radio" aria-checked="false">Save</button>
        </div>
      </div>
    `;
    this.banner.style.pointerEvents = 'auto';

    this.banner.querySelectorAll('[data-default-mode]').forEach(opt => {
      opt.addEventListener('click', (e) => {
        e.stopPropagation();
        this._setDefaultMode(opt.dataset.defaultMode);
      });
    });

    this.shadowRoot.appendChild(this.banner);
    this._setDefaultMode(this.defaultMode);
  }

  _createActionBar() {
    this.actionBar = document.createElement('div');
    this.actionBar.className = ACTION_BAR_CLASS;
    this.actionBar.style.pointerEvents = 'auto';
    this.actionBar.innerHTML = `
      <span class="mdpicker-count"><span class="mdpicker-count-num">0</span><span>selected</span></span>
      <div class="mdpicker-bar-divider"></div>
      <button type="button" class="mdpicker-btn mdpicker-btn-clear" data-act="clear">Clear</button>
      <button type="button" class="mdpicker-btn mdpicker-btn-secondary" data-act="secondary">Save</button>
      <button type="button" class="mdpicker-btn mdpicker-btn-primary" data-act="primary">Copy</button>
      <div class="mdpicker-bar-divider"></div>
      <button type="button" class="mdpicker-icon-btn" data-act="exit" aria-label="Exit selection mode (Esc)" title="Exit selection mode (Esc)">${EXIT_ICON_SVG}</button>
    `;

    this.countNum = this.actionBar.querySelector('.mdpicker-count-num');
    this.primaryBtn = this.actionBar.querySelector('[data-act="primary"]');
    this.secondaryBtn = this.actionBar.querySelector('[data-act="secondary"]');
    this.clearBtn = this.actionBar.querySelector('[data-act="clear"]');

    this.actionBar.addEventListener('click', (e) => {
      const btn = e.target.closest('[data-act]');
      if (!btn) return;
      e.stopPropagation();
      const act = btn.dataset.act;
      if (act === 'clear') this._clearSelection();
      else if (act === 'exit') this._hardExit();
      else if (act === 'primary' || act === 'secondary') {
        this._fireAction(btn.dataset.role, btn);
      }
    });

    this.shadowRoot.appendChild(this.actionBar);
    this._updateButtonRoles();
  }

  _getStyles() {
    return `
      :host, * { box-sizing: border-box; }

      /* Phantom capture layer — transparent, full viewport, sits above page
         content but below banner / action bar. Mouse events land here so :hover
         never fires on host-page elements. */
      .mdpicker-capture {
        position: fixed;
        top: 0;
        left: 0;
        right: 0;
        bottom: 0;
        z-index: 50;
        background: transparent;
        cursor: crosshair;
        pointer-events: auto;
      }

      .${BANNER_CLASS} {
        position: fixed;
        top: 0;
        left: 0;
        right: 0;
        z-index: 100;
        /* Flat near-opaque background — backdrop-filter blur was forcing the
           GPU to re-rasterize the backdrop on every hover-overlay reposition,
           which made the page feel laggy on busy sites. */
        background: rgba(255, 255, 255, 0.97);
        border-bottom: 0.5px solid #e5e7eb;
        padding: 10px 24px;
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 16px;
        flex-wrap: wrap;
        font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Helvetica Neue', Arial, sans-serif;
        font-size: 13px;
        color: #6b7280;
        line-height: 1.4;
      }
      .mdpicker-banner-left {
        display: flex;
        align-items: center;
        gap: 10px;
      }
      .mdpicker-banner-text strong {
        color: #1a1a1a;
        font-weight: 500;
      }
      .mdpicker-dot {
        width: 8px;
        height: 8px;
        background: #1D9E75;
        border-radius: 50%;
        animation: mdpicker-pulse 2s infinite;
        flex-shrink: 0;
      }
      @keyframes mdpicker-pulse {
        0%, 100% { opacity: 1; }
        50% { opacity: 0.4; }
      }
      .mdpicker-banner-right {
        display: flex;
        align-items: center;
        gap: 16px;
        font-size: 12px;
      }
      .mdpicker-default-label {
        color: #9ca3af;
      }
      .mdpicker-segmented {
        display: inline-flex;
        background: #F1F3F5;
        border-radius: 6px;
        padding: 2px;
      }
      .mdpicker-seg-opt {
        padding: 3px 10px;
        font-size: 11px;
        color: #6b7280;
        border-radius: 4px;
        border: none;
        background: transparent;
        font-family: inherit;
        cursor: pointer;
        user-select: none;
        transition: background 0.15s, color 0.15s;
      }
      .mdpicker-seg-opt.active {
        background: #ffffff;
        color: #1a1a1a;
        font-weight: 500;
        box-shadow: 0 1px 2px rgba(0, 0, 0, 0.06);
      }

      .mdpicker-overlay {
        position: fixed;
        pointer-events: none;
        box-sizing: border-box;
        border-radius: 4px;
        /* No position transitions — they trail the element during scroll. */
      }
      .${HOVER_CLASS} {
        z-index: 1;
        border: 2px dashed #185FA5;
        background: transparent;
        display: none;
      }
      .${SELECTED_CLASS} {
        z-index: 2;
        border: 2px solid #185FA5;
        background: rgba(24, 95, 165, 0.10);
        display: block;
      }
      .mdpicker-badge {
        position: absolute;
        top: -10px;
        left: -10px;
        min-width: 22px;
        height: 22px;
        padding: 0 6px;
        background: #1a1a1a;
        color: #ffffff;
        border-radius: 5px;
        display: flex;
        align-items: center;
        justify-content: center;
        font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Helvetica Neue', Arial, sans-serif;
        font-size: 12px;
        font-weight: 500;
        line-height: 1;
        box-shadow: 0 1px 3px rgba(0, 0, 0, 0.15);
        pointer-events: none;
        z-index: 3;
      }

      .${ACTION_BAR_CLASS} {
        position: fixed;
        bottom: 28px;
        left: 50%;
        transform: translateX(-50%) translateY(120%);
        z-index: 100;
        background: #1a1a1a;
        color: #ffffff;
        border-radius: 12px;
        padding: 6px 6px 6px 14px;
        display: flex;
        align-items: center;
        gap: 8px;
        font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Helvetica Neue', Arial, sans-serif;
        font-size: 13px;
        box-shadow: 0 8px 32px rgba(0, 0, 0, 0.20), 0 2px 8px rgba(0, 0, 0, 0.15);
        opacity: 0;
        pointer-events: none;
        transition: transform 0.32s cubic-bezier(0.34, 1.3, 0.64, 1), opacity 0.2s;
      }
      .${ACTION_BAR_CLASS}.visible {
        transform: translateX(-50%) translateY(0);
        opacity: 1;
        pointer-events: auto;
      }
      .mdpicker-count {
        font-weight: 500;
        white-space: nowrap;
        display: inline-flex;
        align-items: center;
        gap: 6px;
      }
      .mdpicker-count-num {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        min-width: 20px;
        height: 20px;
        padding: 0 6px;
        background: rgba(255, 255, 255, 0.15);
        border-radius: 4px;
        font-size: 12px;
      }
      .mdpicker-bar-divider {
        width: 0.5px;
        height: 22px;
        background: rgba(255, 255, 255, 0.18);
        flex-shrink: 0;
      }
      .mdpicker-btn {
        font-family: inherit;
        padding: 7px 14px;
        border-radius: 7px;
        font-size: 13px;
        font-weight: 500;
        cursor: pointer;
        border: 0.5px solid transparent;
        background: transparent;
        color: #ffffff;
        white-space: nowrap;
        display: inline-flex;
        align-items: center;
        gap: 6px;
        transition: background 0.15s, color 0.15s, border-color 0.15s, transform 0.1s, opacity 0.15s;
      }
      .mdpicker-btn:active { transform: scale(0.97); }
      .mdpicker-btn:disabled { opacity: 0.5; cursor: not-allowed; }
      .mdpicker-btn-clear {
        border-color: rgba(255, 255, 255, 0.20);
        color: rgba(255, 255, 255, 0.85);
      }
      .mdpicker-btn-clear:hover:not(:disabled) {
        background: rgba(255, 255, 255, 0.06);
        border-color: rgba(255, 255, 255, 0.32);
        color: #ffffff;
      }
      .mdpicker-btn-secondary {
        background: rgba(255, 255, 255, 0.12);
      }
      .mdpicker-btn-secondary:hover:not(:disabled) {
        background: rgba(255, 255, 255, 0.20);
      }
      .mdpicker-btn-primary {
        background: #ffffff;
        color: #1a1a1a;
      }
      .mdpicker-btn-primary:hover:not(:disabled) {
        opacity: 0.88;
      }
      .mdpicker-btn.success {
        background: #1D9E75 !important;
        color: #ffffff !important;
        border-color: #1D9E75 !important;
        opacity: 1 !important;
        pointer-events: none;
      }
      .mdpicker-icon-btn {
        width: 32px;
        height: 32px;
        padding: 0;
        border: none;
        background: transparent;
        color: rgba(255, 255, 255, 0.5);
        border-radius: 7px;
        cursor: pointer;
        display: inline-flex;
        align-items: center;
        justify-content: center;
        font-family: inherit;
        transition: background 0.15s, color 0.15s, transform 0.1s;
      }
      .mdpicker-icon-btn:hover {
        color: #ffffff;
        background: rgba(255, 255, 255, 0.08);
      }
      .mdpicker-icon-btn:active { transform: scale(0.92); }

      @media (max-width: 600px) {
        .${ACTION_BAR_CLASS} {
          left: 12px;
          right: 12px;
          transform: translateY(120%);
        }
        .${ACTION_BAR_CLASS}.visible {
          transform: translateY(0);
        }
      }
    `;
  }
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = ElementPicker;
} else if (typeof window !== 'undefined') {
  window.ElementPicker = ElementPicker;
}
