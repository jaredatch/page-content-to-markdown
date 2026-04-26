const MOCK_DEFAULTS = {
  outputMode: 'clipboard',
  includeMetadata: true,
  headingStyle: 'atx',
  bulletListMarker: '-',
  codeBlockStyle: 'fenced',
  linkStyle: 'inlined',
  filenameTemplate: '{title} - {date}',
  filenameStyle: 'preserve',
  autoClosePopup: true,
  stripTrackingParams: true,
  linkMode: 'keep',
  imageMode: 'keep',
  metadataFormat: 'header'
};

jest.mock('../../src/utils/preferences', () => ({
  get: jest.fn().mockResolvedValue({ ...MOCK_DEFAULTS }),
  set: jest.fn().mockResolvedValue(),
  DEFAULTS: { ...MOCK_DEFAULTS }
}));

// Re-acquired in beforeEach after jest.resetModules()
let Preferences;

// Minimal options DOM matching src/options/options.html
const OPTIONS_HTML = `
  <div class="container">
    <header class="header">
      <h1 class="title">Markdown Settings</h1>
    </header>
    <main class="main">
      <section class="section">
        <div class="setting">
          <span class="setting-label">Default output</span>
          <div class="segmented" role="radiogroup" aria-label="Default output">
            <input type="radio" id="outputMode-clipboard" name="outputMode" value="clipboard">
            <label for="outputMode-clipboard">Copy to clipboard</label>
            <input type="radio" id="outputMode-file" name="outputMode" value="file">
            <label for="outputMode-file">Save as file</label>
          </div>
        </div>
        <div class="setting">
          <label class="checkbox-label">
            <input type="checkbox" id="includeMetadata" checked>
            <span>Include page info</span>
          </label>
        </div>
        <div class="setting">
          <span class="setting-label">Page info format</span>
          <div class="segmented" role="radiogroup" aria-label="Page info format">
            <input type="radio" id="metadataFormat-header" name="metadataFormat" value="header">
            <label for="metadataFormat-header">Markdown header</label>
            <input type="radio" id="metadataFormat-yaml" name="metadataFormat" value="yaml">
            <label for="metadataFormat-yaml">YAML frontmatter</label>
          </div>
          <div class="setting-hint" id="metadataFormatHint"></div>
        </div>
        <div class="setting">
          <label class="checkbox-label">
            <input type="checkbox" id="autoClosePopup" checked>
            <span>Auto-close popup after action</span>
          </label>
        </div>
      </section>
      <section class="section">
        <div class="setting">
          <label class="setting-label" for="filenameTemplate">Template</label>
          <input type="text" id="filenameTemplate" class="setting-input">
          <div class="filename-preview">
            <code id="filenamePreview"></code>
          </div>
        </div>
        <div class="setting">
          <span class="setting-label">Style</span>
          <div class="segmented" role="radiogroup" aria-label="File name style">
            <input type="radio" id="filenameStyle-preserve" name="filenameStyle" value="preserve">
            <label for="filenameStyle-preserve">Preserve</label>
            <input type="radio" id="filenameStyle-kebab" name="filenameStyle" value="kebab">
            <label for="filenameStyle-kebab">kebab-case</label>
            <input type="radio" id="filenameStyle-snake" name="filenameStyle" value="snake">
            <label for="filenameStyle-snake">snake_case</label>
          </div>
        </div>
      </section>
      <section class="section">
        <div class="setting">
          <span class="setting-label">Heading style</span>
          <div class="segmented" role="radiogroup" aria-label="Heading style">
            <input type="radio" id="headingStyle-atx" name="headingStyle" value="atx">
            <label for="headingStyle-atx"># ATX headings</label>
            <input type="radio" id="headingStyle-setext" name="headingStyle" value="setext">
            <label for="headingStyle-setext">Setext headings</label>
          </div>
          <div class="setting-hint" id="headingHint"></div>
        </div>
        <div class="setting">
          <span class="setting-label">Bullet list marker</span>
          <div class="segmented" role="radiogroup" aria-label="Bullet list marker">
            <input type="radio" id="bulletListMarker-dash" name="bulletListMarker" value="-">
            <label for="bulletListMarker-dash">- Dash</label>
            <input type="radio" id="bulletListMarker-asterisk" name="bulletListMarker" value="*">
            <label for="bulletListMarker-asterisk">* Asterisk</label>
          </div>
          <div class="setting-hint" id="bulletHint"></div>
        </div>
        <div class="setting">
          <span class="setting-label">Code block style</span>
          <div class="segmented" role="radiogroup" aria-label="Code block style">
            <input type="radio" id="codeBlockStyle-fenced" name="codeBlockStyle" value="fenced">
            <label for="codeBlockStyle-fenced">Fenced</label>
            <input type="radio" id="codeBlockStyle-indented" name="codeBlockStyle" value="indented">
            <label for="codeBlockStyle-indented">Indented</label>
          </div>
          <div class="setting-hint" id="codeHint"></div>
        </div>
        <div class="setting">
          <span class="setting-label">Image handling</span>
          <div class="segmented" role="radiogroup" aria-label="Image handling">
            <input type="radio" id="imageMode-keep" name="imageMode" value="keep">
            <label for="imageMode-keep">Keep</label>
            <input type="radio" id="imageMode-alt" name="imageMode" value="alt">
            <label for="imageMode-alt">Alt only</label>
            <input type="radio" id="imageMode-strip" name="imageMode" value="strip">
            <label for="imageMode-strip">Strip</label>
            <input type="radio" id="imageMode-url-list" name="imageMode" value="url-list">
            <label for="imageMode-url-list">URL list</label>
          </div>
          <div class="setting-hint" id="imageModeHint"></div>
        </div>
        <div class="setting">
          <span class="setting-label">Link handling</span>
          <div class="segmented" role="radiogroup" aria-label="Link handling">
            <input type="radio" id="linkMode-keep" name="linkMode" value="keep">
            <label for="linkMode-keep">Keep links</label>
            <input type="radio" id="linkMode-strip" name="linkMode" value="strip">
            <label for="linkMode-strip">Text only</label>
            <input type="radio" id="linkMode-bare" name="linkMode" value="bare">
            <label for="linkMode-bare">Text + URL</label>
          </div>
          <div class="setting-hint" id="linkModeHint"></div>
        </div>
        <div class="setting">
          <span class="setting-label">Link style</span>
          <div class="segmented" role="radiogroup" aria-label="Link style">
            <input type="radio" id="linkStyle-inlined" name="linkStyle" value="inlined">
            <label for="linkStyle-inlined">Inlined</label>
            <input type="radio" id="linkStyle-referenced" name="linkStyle" value="referenced">
            <label for="linkStyle-referenced">Referenced</label>
          </div>
          <div class="setting-hint" id="linkHint"></div>
        </div>
        <div class="setting">
          <label class="checkbox-label">
            <input type="checkbox" id="stripTrackingParams" checked>
            <span>Strip tracking parameters from URLs</span>
          </label>
        </div>
      </section>
      <section class="section">
        <button id="resetBtn" class="btn btn-outline">Reset to defaults</button>
      </section>
      <div id="status" class="status hidden"></div>
    </main>
  </div>
`;

async function createOptions(prefs) {
  if (prefs) {
    Preferences.get.mockResolvedValue({ ...MOCK_DEFAULTS, ...prefs });
  }
  const OptionsController = require('../../src/options/options');
  const controller = new OptionsController();
  await flushPromises();
  return controller;
}

describe('OptionsController', () => {
  let consoleLogSpy;

  beforeEach(() => {
    jest.resetModules();
    document.body.innerHTML = OPTIONS_HTML;

    Preferences = require('../../src/utils/preferences');
    Preferences.get.mockResolvedValue({ ...MOCK_DEFAULTS });
    Preferences.set.mockResolvedValue();

    consoleLogSpy = jest.spyOn(console, 'log').mockImplementation();
  });

  afterEach(() => {
    consoleLogSpy.mockRestore();
    jest.useRealTimers();
  });

  // -------------------------------------------------------
  // Constructor / init
  // -------------------------------------------------------
  describe('constructor and init', () => {
    test('binds all expected DOM elements', async () => {
      const opts = await createOptions();
      expect(opts.elements.outputMode).toBeTruthy();
      expect(opts.elements.includeMetadata).toBeTruthy();
      expect(opts.elements.filenameTemplate).toBeTruthy();
      expect(opts.elements.filenameStyle).toBeTruthy();
      expect(opts.elements.filenamePreview).toBeTruthy();
      expect(opts.elements.headingStyle).toBeTruthy();
      expect(opts.elements.bulletListMarker).toBeTruthy();
      expect(opts.elements.codeBlockStyle).toBeTruthy();
      expect(opts.elements.linkStyle).toBeTruthy();
      expect(opts.elements.headingHint).toBeTruthy();
      expect(opts.elements.bulletHint).toBeTruthy();
      expect(opts.elements.codeHint).toBeTruthy();
      expect(opts.elements.linkHint).toBeTruthy();
      expect(opts.elements.resetBtn).toBeTruthy();
      expect(opts.elements.status).toBeTruthy();
    });

    test('loads preferences on init', async () => {
      await createOptions();
      expect(Preferences.get).toHaveBeenCalled();
    });

    test('updates all hints on init', async () => {
      const opts = await createOptions();
      // Heading hint should be set (default is atx)
      expect(opts.elements.headingHint.textContent).toBe('## Section Title');
    });
  });

  // -------------------------------------------------------
  // loadPreferences
  // -------------------------------------------------------
  describe('loadPreferences', () => {
    test('populates outputMode select', async () => {
      const opts = await createOptions({ outputMode: 'file' });
      expect(opts.elements.outputMode.value).toBe('file');
    });

    test('populates includeMetadata checkbox', async () => {
      const opts = await createOptions({ includeMetadata: false });
      expect(opts.elements.includeMetadata.checked).toBe(false);
    });

    test('populates headingStyle select', async () => {
      const opts = await createOptions({ headingStyle: 'setext' });
      expect(opts.elements.headingStyle.value).toBe('setext');
    });

    test('populates bulletListMarker select', async () => {
      const opts = await createOptions({ bulletListMarker: '*' });
      expect(opts.elements.bulletListMarker.value).toBe('*');
    });

    test('populates codeBlockStyle select', async () => {
      const opts = await createOptions({ codeBlockStyle: 'indented' });
      expect(opts.elements.codeBlockStyle.value).toBe('indented');
    });

    test('populates linkStyle select', async () => {
      const opts = await createOptions({ linkStyle: 'referenced' });
      expect(opts.elements.linkStyle.value).toBe('referenced');
    });

    test('populates filenameTemplate input', async () => {
      const opts = await createOptions({ filenameTemplate: '{domain}-{slug}' });
      expect(opts.elements.filenameTemplate.value).toBe('{domain}-{slug}');
    });

    test('populates filenameStyle radio group', async () => {
      const opts = await createOptions({ filenameStyle: 'kebab' });
      expect(opts.elements.filenameStyle.value).toBe('kebab');
    });
  });

  // -------------------------------------------------------
  // Filename section
  // -------------------------------------------------------
  describe('filename template + style', () => {
    test('renders preview on init using current prefs', async () => {
      const opts = await createOptions();
      expect(opts.elements.filenamePreview.textContent)
        .toMatch(/^Example Article - \d{4}-\d{2}-\d{2}\.md$/);
    });

    test('preview reflects style on init', async () => {
      const opts = await createOptions({ filenameStyle: 'kebab' });
      expect(opts.elements.filenamePreview.textContent)
        .toMatch(/^example-article-\d{4}-\d{2}-\d{2}\.md$/);
    });

    test('input event updates the preview immediately', async () => {
      const opts = await createOptions();
      opts.elements.filenameTemplate.value = '{domain}/{slug}';
      opts.elements.filenameTemplate.dispatchEvent(new Event('input'));
      expect(opts.elements.filenamePreview.textContent)
        .toBe('example.com-post-name.md');
    });

    test('style change updates the preview immediately', async () => {
      const opts = await createOptions();
      opts.elements.filenameStyle.value = 'snake';
      opts.elements.filenameStyle.dispatchEvent(new Event('change'));
      expect(opts.elements.filenamePreview.textContent)
        .toMatch(/^example_article_\d{4}_\d{2}_\d{2}\.md$/);
    });

    test('style change saves immediately', async () => {
      const opts = await createOptions();
      Preferences.set.mockClear();

      opts.elements.filenameStyle.value = 'kebab';
      opts.elements.filenameStyle.dispatchEvent(new Event('change'));
      await flushPromises();

      expect(Preferences.set).toHaveBeenCalledWith({ filenameStyle: 'kebab' });
    });

    test('template input save is debounced', async () => {
      const opts = await createOptions();
      Preferences.set.mockClear();
      jest.useFakeTimers();

      opts.elements.filenameTemplate.value = '{slug}';
      opts.elements.filenameTemplate.dispatchEvent(new Event('input'));

      // Before the debounce window expires, save has not fired
      expect(Preferences.set).not.toHaveBeenCalled();

      jest.advanceTimersByTime(500);

      // Preferences.set is invoked synchronously inside save() before
      // the first await, so the call is observable without a microtask flush.
      expect(Preferences.set).toHaveBeenCalledWith({ filenameTemplate: '{slug}' });
    });

    test('rapid keystrokes coalesce into one save', async () => {
      const opts = await createOptions();
      Preferences.set.mockClear();
      jest.useFakeTimers();

      opts.elements.filenameTemplate.value = '{';
      opts.elements.filenameTemplate.dispatchEvent(new Event('input'));
      opts.elements.filenameTemplate.value = '{s';
      opts.elements.filenameTemplate.dispatchEvent(new Event('input'));
      opts.elements.filenameTemplate.value = '{slug}';
      opts.elements.filenameTemplate.dispatchEvent(new Event('input'));

      jest.advanceTimersByTime(500);

      expect(Preferences.set).toHaveBeenCalledTimes(1);
      expect(Preferences.set).toHaveBeenCalledWith({ filenameTemplate: '{slug}' });
    });
  });

  // -------------------------------------------------------
  // save
  // -------------------------------------------------------
  describe('save', () => {
    test('calls Preferences.set with partial object', async () => {
      const opts = await createOptions();
      Preferences.set.mockClear();

      await opts.save({ headingStyle: 'setext' });

      expect(Preferences.set).toHaveBeenCalledWith({ headingStyle: 'setext' });
    });

    test('shows "Settings saved" status on save', async () => {
      const opts = await createOptions();

      await opts.save({ outputMode: 'file' });

      expect(opts.elements.status.textContent).toBe('Settings saved');
      expect(opts.elements.status.classList.contains('hidden')).toBe(false);
    });
  });

  // -------------------------------------------------------
  // Auto-save event listeners
  // -------------------------------------------------------
  describe('auto-save event listeners', () => {
    test('outputMode change triggers save', async () => {
      const opts = await createOptions();
      Preferences.set.mockClear();

      opts.elements.outputMode.value = 'file';
      opts.elements.outputMode.dispatchEvent(new Event('change'));
      await flushPromises();

      expect(Preferences.set).toHaveBeenCalledWith({ outputMode: 'file' });
    });

    test('includeMetadata change triggers save', async () => {
      const opts = await createOptions();
      Preferences.set.mockClear();

      opts.elements.includeMetadata.checked = false;
      opts.elements.includeMetadata.dispatchEvent(new Event('change'));
      await flushPromises();

      expect(Preferences.set).toHaveBeenCalledWith({ includeMetadata: false });
    });

    test('headingStyle change triggers save and updates hint', async () => {
      const opts = await createOptions();
      Preferences.set.mockClear();

      opts.elements.headingStyle.value = 'setext';
      opts.elements.headingStyle.dispatchEvent(new Event('change'));
      await flushPromises();

      expect(Preferences.set).toHaveBeenCalledWith({ headingStyle: 'setext' });
      expect(opts.elements.headingHint.textContent).toBe('Section Title\n--------------');
    });

    test('bulletListMarker change triggers save and updates hint', async () => {
      const opts = await createOptions();
      Preferences.set.mockClear();

      opts.elements.bulletListMarker.value = '*';
      opts.elements.bulletListMarker.dispatchEvent(new Event('change'));
      await flushPromises();

      expect(Preferences.set).toHaveBeenCalledWith({ bulletListMarker: '*' });
      expect(opts.elements.bulletHint.textContent).toBe('* First item\n* Second item');
    });

    test('codeBlockStyle change triggers save and updates hint', async () => {
      const opts = await createOptions();
      Preferences.set.mockClear();

      opts.elements.codeBlockStyle.value = 'indented';
      opts.elements.codeBlockStyle.dispatchEvent(new Event('change'));
      await flushPromises();

      expect(Preferences.set).toHaveBeenCalledWith({ codeBlockStyle: 'indented' });
      expect(opts.elements.codeHint.textContent).toBe('    const x = 1;');
    });

    test('linkStyle change triggers save and updates hint', async () => {
      const opts = await createOptions();
      Preferences.set.mockClear();

      opts.elements.linkStyle.value = 'referenced';
      opts.elements.linkStyle.dispatchEvent(new Event('change'));
      await flushPromises();

      expect(Preferences.set).toHaveBeenCalledWith({ linkStyle: 'referenced' });
      expect(opts.elements.linkHint.textContent).toBe('[Example][1]\n\n[1]: https://example.com');
    });
  });

  // -------------------------------------------------------
  // resetToDefaults
  // -------------------------------------------------------
  describe('resetToDefaults', () => {
    test('calls Preferences.set with DEFAULTS', async () => {
      const opts = await createOptions({ headingStyle: 'setext', outputMode: 'file' });
      Preferences.set.mockClear();

      await opts.resetToDefaults();

      expect(Preferences.set).toHaveBeenCalledWith(expect.objectContaining({
        outputMode: 'clipboard',
        includeMetadata: true,
        headingStyle: 'atx'
      }));
    });

    test('reloads preferences into form', async () => {
      const opts = await createOptions({ outputMode: 'file' });

      // After reset, loadPreferences is called again with defaults
      Preferences.get.mockResolvedValue({ ...MOCK_DEFAULTS });
      await opts.resetToDefaults();

      expect(opts.elements.outputMode.value).toBe('clipboard');
    });

    test('updates all hints', async () => {
      const opts = await createOptions({ headingStyle: 'setext' });
      expect(opts.elements.headingHint.textContent).toBe('Section Title\n--------------');

      Preferences.get.mockResolvedValue({ ...MOCK_DEFAULTS });
      await opts.resetToDefaults();

      expect(opts.elements.headingHint.textContent).toBe('## Section Title');
    });

    test('shows "Reset to defaults" status', async () => {
      const opts = await createOptions();

      await opts.resetToDefaults();

      expect(opts.elements.status.textContent).toBe('Reset to defaults');
      expect(opts.elements.status.className).toContain('reset');
    });
  });

  // -------------------------------------------------------
  // showStatus
  // -------------------------------------------------------
  describe('showStatus', () => {
    test('shows message with correct type class', async () => {
      const opts = await createOptions();

      opts.showStatus('Test message', 'saved');

      expect(opts.elements.status.textContent).toBe('Test message');
      expect(opts.elements.status.className).toContain('saved');
    });

    test('removes hidden class', async () => {
      const opts = await createOptions();

      opts.showStatus('Visible', 'saved');

      expect(opts.elements.status.classList.contains('hidden')).toBe(false);
    });

    test('auto-hides after 1500ms', async () => {
      const opts = await createOptions();

      jest.useFakeTimers();
      opts.showStatus('Temporary', 'saved');

      expect(opts.elements.status.classList.contains('hidden')).toBe(false);

      jest.advanceTimersByTime(1500);
      expect(opts.elements.status.classList.contains('hidden')).toBe(true);
    });

    test('clears previous timeout on consecutive calls', async () => {
      const opts = await createOptions();

      jest.useFakeTimers();
      opts.showStatus('First', 'saved');
      opts.showStatus('Second', 'reset');

      // Only second message should be visible
      expect(opts.elements.status.textContent).toBe('Second');

      jest.advanceTimersByTime(1500);
      expect(opts.elements.status.classList.contains('hidden')).toBe(true);
    });
  });

  // -------------------------------------------------------
  // updateHint
  // -------------------------------------------------------
  describe('updateHint', () => {
    test('heading hint: atx shows "## Section Title"', async () => {
      const opts = await createOptions({ headingStyle: 'atx' });
      expect(opts.elements.headingHint.textContent).toBe('## Section Title');
    });

    test('heading hint: setext shows underline format', async () => {
      const opts = await createOptions({ headingStyle: 'setext' });
      expect(opts.elements.headingHint.textContent).toBe('Section Title\n--------------');
    });

    test('bullet hint: dash shows "- First item"', async () => {
      const opts = await createOptions({ bulletListMarker: '-' });
      expect(opts.elements.bulletHint.textContent).toBe('- First item\n- Second item');
    });

    test('bullet hint: asterisk shows "* First item"', async () => {
      const opts = await createOptions({ bulletListMarker: '*' });
      expect(opts.elements.bulletHint.textContent).toBe('* First item\n* Second item');
    });

    test('code hint: fenced shows triple backtick format', async () => {
      const opts = await createOptions({ codeBlockStyle: 'fenced' });
      expect(opts.elements.codeHint.textContent).toBe('```\nconst x = 1;\n```');
    });

    test('code hint: indented shows 4-space format', async () => {
      const opts = await createOptions({ codeBlockStyle: 'indented' });
      expect(opts.elements.codeHint.textContent).toBe('    const x = 1;');
    });

    test('link hint: inlined shows [text](url) format', async () => {
      const opts = await createOptions({ linkStyle: 'inlined' });
      expect(opts.elements.linkHint.textContent).toBe('[Example](https://example.com)');
    });

    test('link hint: referenced shows [text][1] format', async () => {
      const opts = await createOptions({ linkStyle: 'referenced' });
      expect(opts.elements.linkHint.textContent).toBe('[Example][1]\n\n[1]: https://example.com');
    });
  });

  // -------------------------------------------------------
  // updateAllHints
  // -------------------------------------------------------
  describe('updateAllHints', () => {
    test('updates all four hint types', async () => {
      const opts = await createOptions();
      // Clear hints
      opts.elements.headingHint.textContent = '';
      opts.elements.bulletHint.textContent = '';
      opts.elements.codeHint.textContent = '';
      opts.elements.linkHint.textContent = '';

      opts.updateAllHints();

      expect(opts.elements.headingHint.textContent).not.toBe('');
      expect(opts.elements.bulletHint.textContent).not.toBe('');
      expect(opts.elements.codeHint.textContent).not.toBe('');
      expect(opts.elements.linkHint.textContent).not.toBe('');
    });
  });
});
