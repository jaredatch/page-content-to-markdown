const Preferences = require('../utils/preferences');
const FilenameTemplate = require('../utils/filename-template');

console.log('🔧 [options] Options page loaded');

// Sample doc context for the live preview pane and filename preview.
// Static — every setting is reflected against the same canned page so users
// can compare configurations side-by-side without needing a real tab.
const PREVIEW_SAMPLE = {
  title: 'The case for browser extensions',
  url: 'https://www.example.com/blog/case-for-extensions',
  date: new Date(2026, 3, 26, 14, 30, 45) // April 26 2026, 14:30:45 local
};

// Debounce window for saving the filename template input. Lets users
// type without spamming chrome.storage.local.set.
const TEMPLATE_SAVE_DEBOUNCE_MS = 400;

// Two-step armed reset: how long the button stays in confirm-state.
const RESET_ARM_TIMEOUT_MS = 4000;

// Toast / preview-flash visibility.
const TOAST_VISIBLE_MS = 2200;
const PREVIEW_FLASH_MS = 400;

// Static markup for the toast checkmark. Parsed via DOMParser instead of
// `innerHTML = ...` to satisfy addons-linter UNSAFE_VAR_ASSIGNMENT.
const TOAST_CHECK_SVG = '<svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="3.5"><polyline points="20 6 9 17 4 12"/></svg>';

function svgFromMarkup(markup) {
  return new DOMParser().parseFromString(markup, 'image/svg+xml').documentElement;
}

// Parse an HTML markup string into nodes that can be appended to a target.
// Used for the syntax-highlighted preview output, which is built by
// `highlightMarkdown` as an HTML string of <span> tags + escaped text.
function nodesFromHtml(html) {
  const doc = new DOMParser().parseFromString(html, 'text/html');
  return Array.from(doc.body.childNodes);
}

// Tokens shown in the Available-tokens disclosure. Each row is click-to-insert.
const TOKEN_ROWS = [
  { label: '{title}',                  insert: '{title}',     example: 'Page title' },
  { label: '{domain}',                 insert: '{domain}',    example: 'example.com' },
  { label: '{host}',                   insert: '{host}',      example: 'www.example.com' },
  { label: '{path}',                   insert: '{path}',      example: 'blog/case-for-extensions' },
  { label: '{slug}',                   insert: '{slug}',      example: 'case-for-extensions' },
  { label: '{date<fmt>[:fmt]</fmt>}',  insert: '{date}',      example: '2026-04-26' },
  { label: '{time<fmt>[:fmt]</fmt>}',  insert: '{time}',      example: '14-30-45' },
  { label: '{datetime<fmt>[:fmt]</fmt>}', insert: '{datetime}', example: '2026-04-26_14-30-45' }
];

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
      // form controls
      outputMode: new RadioGroup('outputMode'),
      includeMetadata: document.getElementById('includeMetadata'),
      metadataFormat: new RadioGroup('metadataFormat'),
      autoClosePopup: document.getElementById('autoClosePopup'),
      filenameTemplate: document.getElementById('filenameTemplate'),
      filenameStyle: new RadioGroup('filenameStyle'),
      imageMode: new RadioGroup('imageMode'),
      linkMode: new RadioGroup('linkMode'),
      stripTrackingParams: document.getElementById('stripTrackingParams'),
      headingStyle: new RadioGroup('headingStyle'),
      bulletListMarker: new RadioGroup('bulletListMarker'),
      codeBlockStyle: new RadioGroup('codeBlockStyle'),
      linkStyle: new RadioGroup('linkStyle'),
      // chrome
      metadataFormatGroup: document.getElementById('metadataFormatGroup'),
      tokensToggle: document.getElementById('tokensToggle'),
      tokensPanel: document.getElementById('tokensPanel'),
      tokensList: document.getElementById('tokensList'),
      advancedToggle: document.getElementById('advancedToggle'),
      advancedContent: document.getElementById('advancedContent'),
      advancedSub: document.getElementById('advancedSub'),
      previewContent: document.getElementById('previewContent'),
      previewFilename: document.getElementById('previewFilename'),
      resetBtn: document.getElementById('resetBtn'),
      toast: document.getElementById('toast')
    };

    this.prefs = { ...Preferences.DEFAULTS };
    this.resetArmed = false;
    this.resetTimer = null;
    this.toastTimer = null;
    this.flashTimer = null;
    this.templateSaveTimer = null;

    this.init();
  }

  async init() {
    await this.loadPreferences();
    this.renderTokensList();
    this.applyDisclosureState();
    this.applyMetadataFormatVisibility();
    this.updatePreview();
    this.attachListeners();
  }

  // ---------------------------------------------------------------
  // Load + write
  // ---------------------------------------------------------------
  async loadPreferences() {
    const prefs = await Preferences.get();
    this.prefs = { ...Preferences.DEFAULTS, ...prefs };

    this.elements.outputMode.value = this.prefs.outputMode;
    this.elements.includeMetadata.checked = this.prefs.includeMetadata;
    this.elements.metadataFormat.value = this.prefs.metadataFormat;
    this.elements.autoClosePopup.checked = this.prefs.autoClosePopup !== false;
    this.elements.filenameTemplate.value = this.prefs.filenameTemplate;
    this.elements.filenameStyle.value = this.prefs.filenameStyle;
    this.elements.imageMode.value = this.prefs.imageMode;
    this.elements.linkMode.value = this.prefs.linkMode;
    this.elements.stripTrackingParams.checked = this.prefs.stripTrackingParams !== false;
    this.elements.headingStyle.value = this.prefs.headingStyle;
    this.elements.bulletListMarker.value = this.prefs.bulletListMarker;
    this.elements.codeBlockStyle.value = this.prefs.codeBlockStyle;
    this.elements.linkStyle.value = this.prefs.linkStyle;
  }

  async save(partial) {
    Object.assign(this.prefs, partial);
    this.disarmReset();
    await Preferences.set(partial);
    this.flashPreview();
  }

  // ---------------------------------------------------------------
  // Listener wiring
  // ---------------------------------------------------------------
  attachListeners() {
    const e = this.elements;

    e.outputMode.addEventListener('change', () => {
      this.save({ outputMode: e.outputMode.value });
      this.updatePreview();
    });

    e.includeMetadata.addEventListener('change', () => {
      this.save({ includeMetadata: e.includeMetadata.checked });
      this.applyMetadataFormatVisibility();
      this.updatePreview();
    });

    e.metadataFormat.addEventListener('change', () => {
      this.save({ metadataFormat: e.metadataFormat.value });
      this.updatePreview();
    });

    e.autoClosePopup.addEventListener('change', () => {
      this.save({ autoClosePopup: e.autoClosePopup.checked });
    });

    // Filename template: live preview every keystroke, debounced save.
    e.filenameTemplate.addEventListener('input', () => {
      this.prefs.filenameTemplate = e.filenameTemplate.value;
      this.disarmReset();
      this.updateFilenamePreview();
      if (this.templateSaveTimer) clearTimeout(this.templateSaveTimer);
      this.templateSaveTimer = setTimeout(() => {
        Preferences.set({ filenameTemplate: e.filenameTemplate.value });
      }, TEMPLATE_SAVE_DEBOUNCE_MS);
    });

    e.filenameStyle.addEventListener('change', () => {
      this.save({ filenameStyle: e.filenameStyle.value });
      this.updateFilenamePreview();
    });

    e.imageMode.addEventListener('change', () => {
      this.save({ imageMode: e.imageMode.value });
      this.updatePreview();
    });

    e.linkMode.addEventListener('change', () => {
      this.save({ linkMode: e.linkMode.value });
      this.updatePreview();
    });

    e.stripTrackingParams.addEventListener('change', () => {
      this.save({ stripTrackingParams: e.stripTrackingParams.checked });
      this.updatePreview();
    });

    e.headingStyle.addEventListener('change', () => {
      this.save({ headingStyle: e.headingStyle.value });
      this.updatePreview();
    });

    e.bulletListMarker.addEventListener('change', () => {
      this.save({ bulletListMarker: e.bulletListMarker.value });
      this.updatePreview();
    });

    e.codeBlockStyle.addEventListener('change', () => {
      this.save({ codeBlockStyle: e.codeBlockStyle.value });
      this.updatePreview();
    });

    e.linkStyle.addEventListener('change', () => {
      this.save({ linkStyle: e.linkStyle.value });
      this.updatePreview();
    });

    e.tokensToggle.addEventListener('click', () => this.toggleDisclosure('tokens'));
    e.advancedToggle.addEventListener('click', () => this.toggleDisclosure('advanced'));

    e.resetBtn.addEventListener('click', () => this.handleResetClick());

    // Click-to-insert handlers are attached when the tokens list is rendered.
  }

  // ---------------------------------------------------------------
  // Disclosures
  // ---------------------------------------------------------------
  applyDisclosureState() {
    this.setDisclosure('tokens', !!this.prefs.uiTokensOpen);
    this.setDisclosure('advanced', !!this.prefs.uiAdvancedOpen);
  }

  toggleDisclosure(which) {
    const prefKey = which === 'tokens' ? 'uiTokensOpen' : 'uiAdvancedOpen';
    const next = !this.prefs[prefKey];
    this.setDisclosure(which, next);
    this.save({ [prefKey]: next });
  }

  setDisclosure(which, open) {
    this.prefs[which === 'tokens' ? 'uiTokensOpen' : 'uiAdvancedOpen'] = open;
    if (which === 'tokens') {
      this.elements.tokensToggle.setAttribute('aria-expanded', String(open));
      this.elements.tokensPanel.hidden = !open;
    } else {
      this.elements.advancedToggle.setAttribute('aria-expanded', String(open));
      this.elements.advancedContent.hidden = !open;
      this.elements.advancedSub.textContent = open
        ? 'Hide power-user syntax preferences'
        : 'Heading, bullet, code block, and link syntax';
    }
  }

  // ---------------------------------------------------------------
  // Conditional sub-fields
  // ---------------------------------------------------------------
  applyMetadataFormatVisibility() {
    this.elements.metadataFormatGroup.hidden = !this.elements.includeMetadata.checked;
  }

  // ---------------------------------------------------------------
  // Tokens panel
  // ---------------------------------------------------------------
  renderTokensList() {
    this.elements.tokensList.replaceChildren();

    for (const row of TOKEN_ROWS) {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'token-row';
      btn.dataset.insertToken = row.insert;
      btn.title = `Click to insert ${row.insert} at cursor`;

      const nameSpan = document.createElement('span');
      nameSpan.className = 'token-name';
      // row.label may contain <fmt>...</fmt> markers that should render as
      // a styled span. Split on those markers and build nodes alternately.
      const parts = row.label.split(/(<fmt>[^<]*<\/fmt>)/);
      for (const part of parts) {
        if (!part) continue;
        const fmtMatch = part.match(/^<fmt>([^<]*)<\/fmt>$/);
        if (fmtMatch) {
          const fmtSpan = document.createElement('span');
          fmtSpan.className = 'token-fmt';
          fmtSpan.textContent = fmtMatch[1];
          nameSpan.appendChild(fmtSpan);
        } else {
          nameSpan.appendChild(document.createTextNode(part));
        }
      }

      const descSpan = document.createElement('span');
      descSpan.className = 'token-desc';
      descSpan.textContent = row.example;

      btn.append(nameSpan, descSpan);
      btn.addEventListener('click', () => this.insertToken(row.insert));
      this.elements.tokensList.appendChild(btn);
    }
  }

  insertToken(token) {
    const input = this.elements.filenameTemplate;
    const start = input.selectionStart != null ? input.selectionStart : input.value.length;
    const end = input.selectionEnd != null ? input.selectionEnd : input.value.length;
    const value = input.value;
    input.value = value.substring(0, start) + token + value.substring(end);
    // Trigger the input listener so save + preview update fire normally.
    input.dispatchEvent(new Event('input', { bubbles: true }));
    // Restore focus + cursor position after the token.
    setTimeout(() => {
      input.focus();
      const pos = start + token.length;
      input.selectionStart = input.selectionEnd = pos;
    }, 0);
  }

  // ---------------------------------------------------------------
  // Reset (two-step armed)
  // ---------------------------------------------------------------
  handleResetClick() {
    if (this.resetArmed) {
      this.confirmReset();
    } else {
      this.armReset();
    }
  }

  armReset() {
    this.resetArmed = true;
    this.elements.resetBtn.textContent = 'Click to confirm reset';
    this.elements.resetBtn.classList.add('armed');
    if (this.resetTimer) clearTimeout(this.resetTimer);
    this.resetTimer = setTimeout(() => this.disarmReset(), RESET_ARM_TIMEOUT_MS);
  }

  disarmReset() {
    if (!this.resetArmed) return;
    this.resetArmed = false;
    this.elements.resetBtn.textContent = 'Reset to defaults';
    this.elements.resetBtn.classList.remove('armed');
    if (this.resetTimer) {
      clearTimeout(this.resetTimer);
      this.resetTimer = null;
    }
  }

  async confirmReset() {
    // A pending debounced filename-template write would otherwise fire after
    // the reset and clobber the default template back to the in-flight value.
    if (this.templateSaveTimer) {
      clearTimeout(this.templateSaveTimer);
      this.templateSaveTimer = null;
    }
    const defaults = Preferences.DEFAULTS;
    // Preserve open/closed disclosure state — UI feel ≠ settings.
    const preserved = {
      uiAdvancedOpen: this.prefs.uiAdvancedOpen,
      uiTokensOpen: this.prefs.uiTokensOpen
    };
    await Preferences.set({ ...defaults, ...preserved });
    this.disarmReset();
    await this.loadPreferences();
    this.applyMetadataFormatVisibility();
    this.updatePreview();
    this.flashPreview();
    this.showToast('Settings reset to defaults');
  }

  // ---------------------------------------------------------------
  // Toast
  // ---------------------------------------------------------------
  showToast(message) {
    const t = this.elements.toast;

    const checkCircle = document.createElement('span');
    checkCircle.className = 'check-circle';
    checkCircle.appendChild(svgFromMarkup(TOAST_CHECK_SVG));

    const msgSpan = document.createElement('span');
    msgSpan.textContent = message;

    t.replaceChildren(checkCircle, msgSpan);
    t.classList.add('visible');
    if (this.toastTimer) clearTimeout(this.toastTimer);
    this.toastTimer = setTimeout(() => t.classList.remove('visible'), TOAST_VISIBLE_MS);
  }

  flashPreview() {
    const el = this.elements.previewContent;
    if (!el) return;
    el.classList.remove('flash');
    // Force reflow so the class re-add animates.
    void el.offsetWidth;
    el.classList.add('flash');
    if (this.flashTimer) clearTimeout(this.flashTimer);
    this.flashTimer = setTimeout(() => el.classList.remove('flash'), PREVIEW_FLASH_MS);
  }

  // ---------------------------------------------------------------
  // Preview generation
  // ---------------------------------------------------------------
  updatePreview() {
    const html = highlightMarkdown(this.generatePreviewMarkdown());
    this.elements.previewContent.replaceChildren(...nodesFromHtml(html));
    this.updateFilenamePreview();
  }

  updateFilenamePreview() {
    const result = FilenameTemplate.formatFilename(
      this.elements.filenameTemplate.value,
      this.elements.filenameStyle.value,
      PREVIEW_SAMPLE
    );
    this.elements.previewFilename.textContent = result;
  }

  generatePreviewMarkdown() {
    const p = this.prefs;
    // Read live values from form, since save() updates `this.prefs` first
    // anyway — but checkboxes / radios are the canonical source of truth.
    const includeMetadata = this.elements.includeMetadata.checked;
    const metadataFormat = this.elements.metadataFormat.value;
    const headingStyle = this.elements.headingStyle.value;
    const imageMode = this.elements.imageMode.value;
    const bullet = this.elements.bulletListMarker.value;
    const codeBlockStyle = this.elements.codeBlockStyle.value;
    const linkMode = this.elements.linkMode.value;
    const linkStyle = this.elements.linkStyle.value;
    const stripTracking = this.elements.stripTrackingParams.checked;

    const lines = [];
    const sourceUrl = PREVIEW_SAMPLE.url;
    const title = PREVIEW_SAMPLE.title;

    if (includeMetadata) {
      if (metadataFormat === 'yaml') {
        lines.push('---');
        lines.push('title: "' + title + '"');
        lines.push('url: ' + sourceUrl);
        lines.push('date: 2026-04-26 14:30');
        lines.push('---');
        lines.push('');
      } else {
        // Inline header — bold key-value, mirrors YAML's keys exactly so
        // both formats carry the same data shape.
        lines.push('**Title:** ' + title + '  ');
        lines.push('**URL:** ' + sourceUrl + '  ');
        lines.push('**Date:** 2026-04-26 14:30');
        lines.push('');
        lines.push('---');
        lines.push('');
      }
    }

    if (headingStyle === 'atx') {
      lines.push('# ' + title);
    } else {
      lines.push(title);
      lines.push('='.repeat(title.length));
    }
    lines.push('');

    lines.push('*By Jared Atchison · April 24, 2026 · 4 min read*');
    lines.push('');

    lines.push('*A short case for treating your browser less like a tool and more like a workshop.*');
    lines.push('');

    lines.push('The web browser has become the **operating system** for most of our work. Extensions are how we *make that environment ours*.');
    lines.push('');

    if (imageMode === 'keep') {
      lines.push('![Toolbar screenshot](toolbar.png)');
      lines.push('');
    } else if (imageMode === 'alt') {
      lines.push('Toolbar screenshot');
      lines.push('');
    } else if (imageMode === 'url-list') {
      // url-list collects URLs into a section at the bottom — preview that.
      // (handled later)
    }

    if (headingStyle === 'atx') {
      lines.push('## What makes a great extension');
    } else {
      const h2 = 'What makes a great extension';
      lines.push(h2);
      lines.push('-'.repeat(h2.length));
    }
    lines.push('');

    lines.push('### Core principles');
    lines.push('');

    lines.push(bullet + ' Solves one specific problem');
    lines.push(bullet + ' Disappears when you don\'t need it');
    lines.push(bullet + ' Respects keyboard navigation');
    lines.push('');

    lines.push('> The best tools are the ones you stop noticing.');
    lines.push('');

    lines.push('### Quick install');
    lines.push('');
    lines.push('1. Open the extensions page');
    lines.push('2. Toggle developer mode');
    lines.push('3. Load the unpacked folder');
    lines.push('');

    lines.push('Use `chrome.runtime.openOptionsPage()` to open settings from the popup.');
    lines.push('');

    if (codeBlockStyle === 'fenced') {
      lines.push('```js');
      lines.push('const x = 1;');
      lines.push('```');
    } else {
      lines.push('    const x = 1;');
    }
    lines.push('');

    let linkUrl = 'https://example.com/blog?utm_source=newsletter&fbclid=abc123';
    if (stripTracking) {
      linkUrl = 'https://example.com/blog';
    }

    if (linkMode === 'keep') {
      if (linkStyle === 'inlined') {
        lines.push('Read more in [our blog post](' + linkUrl + ').');
      } else {
        lines.push('Read more in [our blog post][1].');
      }
    } else if (linkMode === 'strip') {
      lines.push('Read more in our blog post.');
    } else if (linkMode === 'bare') {
      lines.push('Read more in our blog post (' + linkUrl + ').');
    }

    if (linkMode === 'keep' && linkStyle === 'referenced') {
      lines.push('');
      lines.push('[1]: ' + linkUrl);
    }

    if (imageMode === 'url-list') {
      lines.push('');
      lines.push('## Images');
      lines.push('');
      lines.push('- toolbar.png');
    }

    void p; // p kept for clarity in case of future settings; currently we
            // read from the DOM so the function stays consistent at any
            // moment between save() updating prefs and the next render.
    return lines.join('\n');
  }
}

// =================================================================
// Markdown highlighter (lifted from prototype, preserved verbatim
// in behavior). Renders HTML with classed spans for the preview pane.
// =================================================================

function escapeHtml(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function escapeAttr(s) {
  return escapeHtml(s);
}

function highlightInline(text) {
  if (!text) return '';
  let result = escapeHtml(text);

  // Inline code — protect content from further inline-pattern replacement.
  const codeBlocks = [];
  result = result.replace(/`([^`\n]+)`/g, (_m, c) => {
    codeBlocks.push(c);
    return '\x00CODE' + (codeBlocks.length - 1) + '\x00';
  });

  // Image: ![alt](url)
  result = result.replace(/!\[([^\]]*)\]\(([^)]+)\)/g, (_m, alt, url) =>
    '<span class="md-marker">![</span>' +
    '<span class="md-link-text">' + alt + '</span>' +
    '<span class="md-marker">](</span>' +
    '<span class="md-link-url">' + url + '</span>' +
    '<span class="md-marker">)</span>'
  );

  // Inline link: [text](url)
  result = result.replace(/\[([^\]]+)\]\(([^)]+)\)/g, (_m, text, url) =>
    '<span class="md-marker">[</span>' +
    '<span class="md-link-text">' + text + '</span>' +
    '<span class="md-marker">](</span>' +
    '<span class="md-link-url">' + url + '</span>' +
    '<span class="md-marker">)</span>'
  );

  // Reference link: [text][1]
  result = result.replace(/\[([^\]]+)\]\[(\d+)\]/g, (_m, text, ref) =>
    '<span class="md-marker">[</span>' +
    '<span class="md-link-text">' + text + '</span>' +
    '<span class="md-marker">][</span>' +
    '<span class="md-list-marker">' + ref + '</span>' +
    '<span class="md-marker">]</span>'
  );

  // Autolink: <url>
  result = result.replace(/&lt;(https?:\/\/[^&\s<>]+)&gt;/g, (_m, url) =>
    '<span class="md-marker">&lt;</span>' +
    '<span class="md-link-url">' + url + '</span>' +
    '<span class="md-marker">&gt;</span>'
  );

  // Bold: **text**
  result = result.replace(/\*\*([^*\n]+)\*\*/g,
    '<span class="md-marker">**</span><span class="md-bold">$1</span><span class="md-marker">**</span>'
  );

  // Italic: *text*
  result = result.replace(/(^|[^*\w])\*([^*\n]+?)\*(?!\*)/g,
    '$1<span class="md-marker">*</span><span class="md-italic">$2</span><span class="md-marker">*</span>'
  );

  // Restore inline code
  result = result.replace(/\x00CODE(\d+)\x00/g, (_m, idx) => {
    const c = codeBlocks[parseInt(idx, 10)];
    return '<span class="md-marker">`</span><span class="md-code">' + c + '</span><span class="md-marker">`</span>';
  });

  return result;
}

function highlightMarkdown(md) {
  const lines = md.split('\n');
  const out = [];
  let inCodeBlock = false;
  let inFrontmatter = false;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const next = i + 1 < lines.length ? lines[i + 1] : '';

    // YAML frontmatter — only at very top
    if (i === 0 && line === '---') {
      inFrontmatter = true;
      out.push('<span class="md-fence">' + line + '</span>');
      continue;
    }
    if (inFrontmatter) {
      if (line === '---') {
        inFrontmatter = false;
        out.push('<span class="md-fence">' + line + '</span>');
        continue;
      }
      const colonIdx = line.indexOf(':');
      if (colonIdx > 0) {
        const key = line.substring(0, colonIdx);
        const rest = line.substring(colonIdx + 1);
        out.push('<span class="md-yaml-key">' + escapeHtml(key) + '</span>:<span class="md-yaml-val">' + escapeHtml(rest) + '</span>');
      } else {
        out.push(escapeHtml(line));
      }
      continue;
    }

    if (/^```/.test(line)) {
      inCodeBlock = !inCodeBlock;
      out.push('<span class="md-fence">' + escapeHtml(line) + '</span>');
      continue;
    }
    if (inCodeBlock) {
      out.push('<span class="md-code-block">' + escapeHtml(line) + '</span>');
      continue;
    }

    if (/^ {4}\S/.test(line)) {
      out.push('<span class="md-code-block">' + escapeHtml(line) + '</span>');
      continue;
    }

    if (line === '') {
      out.push('');
      continue;
    }

    // Setext H1 — current line is plain text, next line is === (3+ chars)
    if (line && !/^#/.test(line) && /^=+$/.test(next) && next.length >= 3) {
      out.push('<span class="md-heading md-heading-1">' + highlightInline(line) + '</span>');
      out.push('<span class="md-fence">' + next + '</span>');
      i++;
      continue;
    }

    // Setext H2 — current line plain text, next line is --- (3+ dashes).
    // Skip if current line is itself only dashes (i.e. an HR before an HR).
    if (line && !/^#/.test(line) && /^-{3,}$/.test(next) && !/^-{3,}$/.test(line)) {
      out.push('<span class="md-heading md-heading-2">' + highlightInline(line) + '</span>');
      out.push('<span class="md-fence">' + next + '</span>');
      i++;
      continue;
    }

    if (line === '---' || /^-{3,}$/.test(line) || /^=+$/.test(line)) {
      out.push('<span class="md-fence">' + line + '</span>');
      continue;
    }

    let m = line.match(/^(#{1,6})(\s+)(.*)$/);
    if (m) {
      const level = m[1].length;
      out.push(
        '<span class="md-heading-marker md-heading-marker-' + level + '">' + m[1] + '</span>' +
        m[2] +
        '<span class="md-heading md-heading-' + level + '">' + highlightInline(m[3]) + '</span>'
      );
      continue;
    }

    m = line.match(/^(>)(\s*)(.*)$/);
    if (m) {
      out.push(
        '<span class="md-quote-marker">' + m[1] + '</span>' +
        m[2] +
        '<span class="md-quote">' + highlightInline(m[3]) + '</span>'
      );
      continue;
    }

    // Reference definition: [1]: url
    m = line.match(/^(\[\d+\]):(\s+)(.*)$/);
    if (m) {
      out.push(
        '<span class="md-list-marker">' + escapeHtml(m[1]) + '</span>:' +
        m[2] +
        '<span class="md-link-url">' + escapeHtml(m[3]) + '</span>'
      );
      continue;
    }

    m = line.match(/^(\d+\.)(\s+)(.*)$/);
    if (m) {
      out.push('<span class="md-list-marker">' + m[1] + '</span>' + m[2] + highlightInline(m[3]));
      continue;
    }

    m = line.match(/^([-*])(\s+)(.*)$/);
    if (m) {
      out.push('<span class="md-list-marker">' + m[1] + '</span>' + m[2] + highlightInline(m[3]));
      continue;
    }

    out.push(highlightInline(line));
  }

  return out.join('\n');
}

document.addEventListener('DOMContentLoaded', () => {
  new OptionsController();
});

if (typeof module !== 'undefined' && module.exports) {
  module.exports = OptionsController;
  module.exports.highlightMarkdown = highlightMarkdown;
}
