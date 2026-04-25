const Preferences = require('../utils/preferences');
const FilenameTemplate = require('../utils/filename-template');

console.log('🔧 [options] Options page loaded');

// Sample data used to render the filename preview as the user edits.
const FILENAME_PREVIEW_SAMPLE = {
  title: 'Example Article',
  url: 'https://www.example.com/blog/post-name'
};

// Debounce window for saving the filename template input. Lets users
// type without spamming chrome.storage.local.set + the saved-toast.
const TEMPLATE_SAVE_DEBOUNCE_MS = 400;

// Wraps a radio-button group so it exposes the same .value / addEventListener
// interface as a <select>, letting the controller treat both uniformly.
class RadioGroup {
  constructor(name) {
    this.inputs = Array.from(
      document.querySelectorAll(`input[type="radio"][name="${name}"]`)
    );
  }

  get value() {
    const checked = this.inputs.find(i => i.checked);
    return checked ? checked.value : null;
  }

  set value(v) {
    for (const input of this.inputs) {
      input.checked = input.value === v;
    }
  }

  addEventListener(event, handler) {
    for (const input of this.inputs) {
      input.addEventListener(event, handler);
    }
  }

  dispatchEvent(event) {
    const target = this.inputs.find(i => i.checked) || this.inputs[0];
    if (target) target.dispatchEvent(event);
  }
}

class OptionsController {
  constructor() {
    this.elements = {
      outputMode: new RadioGroup('outputMode'),
      includeMetadata: document.getElementById('includeMetadata'),
      filenameTemplate: document.getElementById('filenameTemplate'),
      filenameStyle: new RadioGroup('filenameStyle'),
      filenamePreview: document.getElementById('filenamePreview'),
      headingStyle: new RadioGroup('headingStyle'),
      bulletListMarker: new RadioGroup('bulletListMarker'),
      codeBlockStyle: new RadioGroup('codeBlockStyle'),
      linkStyle: new RadioGroup('linkStyle'),
      headingHint: document.getElementById('headingHint'),
      bulletHint: document.getElementById('bulletHint'),
      codeHint: document.getElementById('codeHint'),
      linkHint: document.getElementById('linkHint'),
      resetBtn: document.getElementById('resetBtn'),
      status: document.getElementById('status')
    };

    this.statusTimeout = null;
    this.templateSaveTimeout = null;
    this.init();
  }

  async init() {
    await this.loadPreferences();
    this.setupEventListeners();
    this.updateAllHints();
    this.updateFilenamePreview();
  }

  async loadPreferences() {
    const prefs = await Preferences.get();

    this.elements.outputMode.value = prefs.outputMode;
    this.elements.includeMetadata.checked = prefs.includeMetadata;
    this.elements.filenameTemplate.value = prefs.filenameTemplate;
    this.elements.filenameStyle.value = prefs.filenameStyle;
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

    // Filename template: live preview on every keystroke, debounced save.
    this.elements.filenameTemplate.addEventListener('input', () => {
      this.updateFilenamePreview();
      if (this.templateSaveTimeout) clearTimeout(this.templateSaveTimeout);
      this.templateSaveTimeout = setTimeout(() => {
        this.save({ filenameTemplate: this.elements.filenameTemplate.value });
      }, TEMPLATE_SAVE_DEBOUNCE_MS);
    });

    this.elements.filenameStyle.addEventListener('change', () => {
      this.save({ filenameStyle: this.elements.filenameStyle.value });
      this.updateFilenamePreview();
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
    this.updateFilenamePreview();
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

  updateFilenamePreview() {
    const template = this.elements.filenameTemplate.value;
    const style = this.elements.filenameStyle.value;
    const result = FilenameTemplate.formatFilename(template, style, {
      ...FILENAME_PREVIEW_SAMPLE,
      date: new Date()
    });
    this.elements.filenamePreview.textContent = result;
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
