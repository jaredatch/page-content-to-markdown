// Popup script for browser extension
// Content-first picker: select what (Page content / site content type), then how (Copy / Save).

const Preferences = require('../utils/preferences');
const SiteRegistry = require('../utils/site-registry');

console.log('🚀 [popup] Popup script loaded');

const RESTRICTED_PATTERNS = [
  /^chrome:\/\//,
  /^chrome-extension:\/\//,
  /^moz-extension:\/\//,
  /^edge:\/\//,
  /^about:/,
  /^file:\/\//
];

// Site badge characters used in the divider. Falls back to first letter of site.name.
const SITE_BADGE = {
  x: '\u{1D54F}',  // Mathematical Double-Struck Capital X (𝕏)
  claude: 'C',
  grok: 'G'
};

const CHECK_SVG = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>';

class PopupController {
  constructor() {
    this.elements = {
      popup: document.getElementById('popup'),
      metadataToggle: document.getElementById('metadataToggle'),
      settingsBtn: document.getElementById('settingsBtn'),
      pageRow: document.getElementById('pageRow'),
      siteDivider: document.getElementById('siteDivider'),
      dividerBadge: document.getElementById('dividerBadge'),
      dividerText: document.getElementById('dividerText'),
      siteRows: document.getElementById('siteRows'),
      selectionActive: document.getElementById('selectionActive'),
      cancelSelectBtn: document.getElementById('cancelSelectBtn'),
      errorBanner: document.getElementById('errorBanner'),
      errorMessage: document.getElementById('errorMessage'),
      primaryBtn: document.getElementById('primaryBtn'),
      secondaryBtn: document.getElementById('secondaryBtn'),
      selectBtn: document.getElementById('selectBtn')
    };

    this.state = {
      currentTab: null,
      currentSite: null,
      selectedContentType: 'page',
      selectedSiteId: null,
      view: 'main',                    // 'main' | 'selecting' | 'restricted'
      prefs: { ...Preferences.DEFAULTS },
      busy: false
    };

    this._errorTimer = null;

    this.init();
  }

  async init() {
    console.log('🔧 [popup] Initializing popup controller');

    await this.loadPreferences();
    await this.resolveCurrentTab();
    await this.checkSelectionState();
    this.restoreSelectionFromMemory();
    this.setupEventListeners();
    this.render();
  }

  async loadPreferences() {
    try {
      this.state.prefs = await Preferences.get();
    } catch (error) {
      console.warn('📋 [popup] Could not load preferences:', error.message);
      this.state.prefs = { ...Preferences.DEFAULTS };
    }
  }

  async resolveCurrentTab() {
    try {
      const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
      if (tabs.length === 0) {
        this.state.view = 'restricted';
        return;
      }

      this.state.currentTab = tabs[0];
      const url = this.state.currentTab.url || '';

      if (RESTRICTED_PATTERNS.some(pattern => pattern.test(url))) {
        this.state.view = 'restricted';
        return;
      }

      this.state.currentSite = SiteRegistry.detect(url);
    } catch (error) {
      console.error('🚨 [popup] Error checking current tab:', error);
      this.state.view = 'restricted';
    }
  }

  async checkSelectionState() {
    if (this.state.view === 'restricted') return;
    try {
      const response = await this.sendMessageToBackground({ action: 'getSelectionState' });
      if (response && response.active) {
        this.state.view = 'selecting';
      }
    } catch (error) {
      console.log('📋 [popup] Could not check selection state:', error.message);
    }
  }

  /**
   * Restore the last-used content type for the current site (or default to 'page').
   * Persisted in chrome.storage.local under prefs.lastUsedPerSite as { siteId: contentTypeId }.
   */
  restoreSelectionFromMemory() {
    const site = this.state.currentSite;
    const lastUsed = this.state.prefs.lastUsedPerSite || {};

    if (site && lastUsed[site.id]) {
      const remembered = lastUsed[site.id];
      const valid = site.contentTypes.some(ct => ct.id === remembered);
      if (valid) {
        this.state.selectedContentType = remembered;
        this.state.selectedSiteId = site.id;
        return;
      }
    }

    this.state.selectedContentType = 'page';
    this.state.selectedSiteId = null;
  }

  setupEventListeners() {
    this.elements.settingsBtn.addEventListener('click', () => {
      chrome.runtime.openOptionsPage();
    });

    this.elements.metadataToggle.addEventListener('change', (e) => {
      const value = e.target.checked;
      this.state.prefs.includeMetadata = value;
      Preferences.set({ includeMetadata: value });
    });

    this.elements.pageRow.addEventListener('click', () => {
      this.selectContent('page', null);
    });

    this.elements.primaryBtn.addEventListener('click', () => {
      const mode = this.elements.primaryBtn.dataset.action;
      this.handleAction(mode, this.elements.primaryBtn);
    });

    this.elements.secondaryBtn.addEventListener('click', () => {
      const mode = this.elements.secondaryBtn.dataset.action;
      this.handleAction(mode, this.elements.secondaryBtn);
    });

    this.elements.selectBtn.addEventListener('click', () => {
      this.handleStartSelection();
    });

    this.elements.cancelSelectBtn.addEventListener('click', () => {
      this.handleCancelSelection();
    });

    document.addEventListener('keydown', (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
        e.preventDefault();
        if (!this.elements.primaryBtn.disabled) {
          const mode = this.elements.primaryBtn.dataset.action;
          this.handleAction(mode, this.elements.primaryBtn);
        }
      }
    });
  }

  /* ----- Rendering ---------------------------------------------------- */

  render() {
    this.renderMetadataToggle();
    this.renderActionButtons();
    this.renderRows();
    this.renderView();
  }

  renderMetadataToggle() {
    this.elements.metadataToggle.checked = !!this.state.prefs.includeMetadata;
  }

  /**
   * Primary button corresponds to the user's preferred outputMode pref.
   * Both buttons stay visible; the secondary keeps the default outline look.
   */
  renderActionButtons() {
    const preferred = this.state.prefs.outputMode === 'file' ? 'file' : 'clipboard';
    const other = preferred === 'clipboard' ? 'file' : 'clipboard';

    this.applyButton(this.elements.primaryBtn, preferred, true);
    this.applyButton(this.elements.secondaryBtn, other, false);
  }

  applyButton(btn, mode, isPrimary) {
    btn.dataset.action = mode;
    btn.classList.toggle('btn-primary', isPrimary);
    const label = mode === 'file' ? 'Save' : 'Copy';
    const textEl = btn.querySelector('.btn-text');
    if (textEl) textEl.textContent = label;
  }

  renderRows() {
    const site = this.state.currentSite;

    if (!site) {
      this.elements.siteDivider.classList.add('hidden');
      this.elements.siteRows.innerHTML = '';
      this.applySelectionClasses();
      return;
    }

    this.elements.dividerBadge.textContent = SITE_BADGE[site.id] || (site.name.charAt(0) || '').toUpperCase();
    const shortName = (site.name || '').split(' / ')[0];
    this.elements.dividerText.textContent = `Available on ${shortName}`;
    this.elements.siteDivider.classList.remove('hidden');

    this.elements.siteRows.innerHTML = '';
    for (const ct of site.contentTypes) {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'row';
      btn.dataset.contentType = ct.id;
      btn.dataset.siteId = site.id;
      btn.innerHTML = `
        <span class="row-icon" aria-hidden="true">${ct.icon}</span>
        <span class="row-label">${this.escapeHtml(ct.label)}</span>
        <span class="row-check" aria-hidden="true">${CHECK_SVG}</span>
      `;
      btn.addEventListener('click', () => {
        this.selectContent(ct.id, site.id);
      });
      this.elements.siteRows.appendChild(btn);
    }

    this.applySelectionClasses();
  }

  applySelectionClasses() {
    const isPage = this.state.selectedContentType === 'page';
    this.elements.pageRow.classList.toggle('selected', isPage);

    const siteRows = this.elements.siteRows.querySelectorAll('.row');
    siteRows.forEach(row => {
      const matches = !isPage
        && row.dataset.siteId === this.state.selectedSiteId
        && row.dataset.contentType === this.state.selectedContentType;
      row.classList.toggle('selected', matches);
    });
  }

  renderView() {
    const popup = this.elements.popup;
    popup.classList.toggle('selecting', this.state.view === 'selecting');
    popup.classList.toggle('disabled', this.state.view === 'restricted');

    this.elements.selectionActive.classList.toggle('hidden', this.state.view !== 'selecting');

    if (this.state.view === 'restricted') {
      this.showError("Can't extract from this page", { sticky: true });
    } else {
      this.hideError();
    }
  }

  /* ----- User actions ------------------------------------------------- */

  selectContent(contentType, siteId) {
    if (this.state.busy || this.state.view !== 'main') return;

    this.state.selectedContentType = contentType;
    this.state.selectedSiteId = siteId;
    this.applySelectionClasses();
    this.persistLastUsed();
  }

  persistLastUsed() {
    const site = this.state.currentSite;
    if (!site) return;

    const lastUsed = { ...(this.state.prefs.lastUsedPerSite || {}) };

    if (this.state.selectedContentType === 'page') {
      // Page content selected on a supported site — clear that site's memory so
      // next visit defaults to 'page' rather than the previous site row.
      if (lastUsed[site.id]) {
        delete lastUsed[site.id];
      } else {
        return;
      }
    } else {
      lastUsed[site.id] = this.state.selectedContentType;
    }

    this.state.prefs.lastUsedPerSite = lastUsed;
    Preferences.set({ lastUsedPerSite: lastUsed });
  }

  async handleAction(mode, sourceBtn) {
    if (this.state.busy || this.state.view !== 'main') return;

    this.state.busy = true;
    this.setBusy(true);
    this.hideError();

    const message = this.buildExtractMessage(mode);

    try {
      const response = await this.sendMessageToBackground(message);

      if (response && response.success) {
        this.flashSuccess(sourceBtn, mode === 'file' ? 'Saved' : 'Copied');
        if (this.state.prefs.autoClosePopup !== false) {
          setTimeout(() => { window.close(); }, 1600);
        } else {
          setTimeout(() => {
            this.state.busy = false;
            this.setBusy(false);
          }, 1400);
        }
      } else {
        const errMsg = (response && response.error) || 'Failed to extract content';
        this.showError(errMsg);
        this.state.busy = false;
        this.setBusy(false);
      }
    } catch (error) {
      console.error('🚨 [popup] Action failed:', error);
      this.showError('Unexpected error occurred');
      this.state.busy = false;
      this.setBusy(false);
    }
  }

  buildExtractMessage(mode) {
    if (this.state.selectedContentType === 'page' || !this.state.selectedSiteId) {
      return { action: 'extractAndCopy', mode };
    }
    return {
      action: 'extractSiteContent',
      siteId: this.state.selectedSiteId,
      contentType: this.state.selectedContentType,
      mode
    };
  }

  async handleStartSelection() {
    if (this.state.busy || this.state.view !== 'main') return;

    try {
      const response = await this.sendMessageToBackground({ action: 'startSelectionMode' });
      if (response && response.success) {
        window.close();
      } else {
        this.showError((response && response.error) || 'Failed to start selection mode');
      }
    } catch (error) {
      console.error('🚨 [popup] Failed to start selection mode:', error);
      this.showError('Failed to start selection mode');
    }
  }

  async handleCancelSelection() {
    try {
      await this.sendMessageToBackground({ action: 'cancelSelectionMode' });
    } catch (error) {
      console.error('🚨 [popup] Error cancelling selection:', error);
    }
    this.state.view = 'main';
    this.renderView();
  }

  /* ----- UI helpers --------------------------------------------------- */

  setBusy(busy) {
    this.elements.primaryBtn.disabled = busy;
    this.elements.secondaryBtn.disabled = busy;
    this.elements.selectBtn.disabled = busy;
  }

  flashSuccess(btn, label) {
    if (!btn) return;
    const original = btn.innerHTML;
    btn.innerHTML = `<span class="btn-text"><span style="display:inline-flex;align-items:center;gap:6px;vertical-align:-2px;">${CHECK_SVG}<span>${this.escapeHtml(label)}</span></span></span>`;
    btn.classList.add('btn-success');
    setTimeout(() => {
      btn.classList.remove('btn-success');
      btn.innerHTML = original;
    }, 1400);
  }

  showError(message, opts = {}) {
    const sticky = !!opts.sticky;
    this.elements.errorMessage.textContent = message;
    this.elements.errorBanner.classList.remove('hidden');

    if (this._errorTimer) {
      clearTimeout(this._errorTimer);
      this._errorTimer = null;
    }
    if (!sticky) {
      this._errorTimer = setTimeout(() => this.hideError(), 4000);
    }
  }

  hideError() {
    this.elements.errorBanner.classList.add('hidden');
    if (this._errorTimer) {
      clearTimeout(this._errorTimer);
      this._errorTimer = null;
    }
  }

  escapeHtml(str) {
    return String(str).replace(/[&<>"']/g, ch => (
      { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]
    ));
  }

  sendMessageToBackground(message) {
    return new Promise((resolve, reject) => {
      chrome.runtime.sendMessage(message, (response) => {
        if (chrome.runtime.lastError) {
          reject(new Error(chrome.runtime.lastError.message));
        } else {
          resolve(response);
        }
      });
    });
  }
}

document.addEventListener('DOMContentLoaded', () => {
  console.log('📄 [popup] DOM loaded, initializing popup');
  new PopupController();
});

if (typeof module !== 'undefined' && module.exports) {
  module.exports = PopupController;
}
