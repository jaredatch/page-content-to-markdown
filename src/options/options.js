const Preferences = require('../utils/preferences');

console.log('🔧 [options] Options page loaded');

class OptionsController {
  constructor() {
    this.elements = {
      outputMode: document.getElementById('outputMode'),
      includeMetadata: document.getElementById('includeMetadata'),
      headingStyle: document.getElementById('headingStyle'),
      bulletListMarker: document.getElementById('bulletListMarker'),
      codeBlockStyle: document.getElementById('codeBlockStyle'),
      linkStyle: document.getElementById('linkStyle'),
      headingHint: document.getElementById('headingHint'),
      bulletHint: document.getElementById('bulletHint'),
      codeHint: document.getElementById('codeHint'),
      linkHint: document.getElementById('linkHint'),
      resetBtn: document.getElementById('resetBtn'),
      status: document.getElementById('status')
    };

    this.statusTimeout = null;
    this.init();
  }

  async init() {
    await this.loadPreferences();
    this.setupEventListeners();
    this.updateAllHints();
  }

  async loadPreferences() {
    const prefs = await Preferences.get();

    this.elements.outputMode.value = prefs.outputMode;
    this.elements.includeMetadata.checked = prefs.includeMetadata;
    this.elements.headingStyle.value = prefs.headingStyle;
    this.elements.bulletListMarker.value = prefs.bulletListMarker;
    this.elements.codeBlockStyle.value = prefs.codeBlockStyle;
    this.elements.linkStyle.value = prefs.linkStyle;
  }

  setupEventListeners() {
    // Auto-save on any change
    this.elements.outputMode.addEventListener('change', () => {
      this.save({ outputMode: this.elements.outputMode.value });
    });

    this.elements.includeMetadata.addEventListener('change', () => {
      this.save({ includeMetadata: this.elements.includeMetadata.checked });
    });

    this.elements.headingStyle.addEventListener('change', () => {
      this.save({ headingStyle: this.elements.headingStyle.value });
      this.updateHint('heading');
    });

    this.elements.bulletListMarker.addEventListener('change', () => {
      this.save({ bulletListMarker: this.elements.bulletListMarker.value });
      this.updateHint('bullet');
    });

    this.elements.codeBlockStyle.addEventListener('change', () => {
      this.save({ codeBlockStyle: this.elements.codeBlockStyle.value });
      this.updateHint('code');
    });

    this.elements.linkStyle.addEventListener('change', () => {
      this.save({ linkStyle: this.elements.linkStyle.value });
      this.updateHint('link');
    });

    this.elements.resetBtn.addEventListener('click', () => this.resetToDefaults());
  }

  async save(partial) {
    await Preferences.set(partial);
    this.showStatus('Settings saved', 'saved');
  }

  async resetToDefaults() {
    const defaults = Preferences.DEFAULTS;
    await Preferences.set(defaults);
    await this.loadPreferences();
    this.updateAllHints();
    this.showStatus('Reset to defaults', 'reset');
  }

  showStatus(message, type) {
    if (this.statusTimeout) clearTimeout(this.statusTimeout);

    this.elements.status.textContent = message;
    this.elements.status.className = `status ${type}`;
    this.elements.status.classList.remove('hidden');

    this.statusTimeout = setTimeout(() => {
      this.elements.status.classList.add('hidden');
    }, 1500);
  }

  updateAllHints() {
    this.updateHint('heading');
    this.updateHint('bullet');
    this.updateHint('code');
    this.updateHint('link');
  }

  updateHint(type) {
    switch (type) {
      case 'heading':
        this.elements.headingHint.textContent =
          this.elements.headingStyle.value === 'atx'
            ? '## Section Title'
            : 'Section Title\n--------------';
        break;
      case 'bullet':
        this.elements.bulletHint.textContent =
          `${this.elements.bulletListMarker.value} First item\n${this.elements.bulletListMarker.value} Second item`;
        break;
      case 'code': {
        this.elements.codeHint.textContent =
          this.elements.codeBlockStyle.value === 'fenced'
            ? '```\nconst x = 1;\n```'
            : '    const x = 1;';
        break;
      }
      case 'link':
        this.elements.linkHint.textContent =
          this.elements.linkStyle.value === 'inlined'
            ? '[Example](https://example.com)'
            : '[Example][1]\n\n[1]: https://example.com';
        break;
    }
  }
}

document.addEventListener('DOMContentLoaded', () => {
  new OptionsController();
});

if (typeof module !== 'undefined' && module.exports) {
  module.exports = OptionsController;
}
