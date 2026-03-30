const MOCK_DEFAULTS = {
  outputMode: 'clipboard',
  includeMetadata: true,
  headingStyle: 'atx',
  bulletListMarker: '-',
  codeBlockStyle: 'fenced',
  linkStyle: 'inlined'
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
          <select id="outputMode" class="setting-select">
            <option value="clipboard">Copy to clipboard</option>
            <option value="file">Save as file</option>
          </select>
        </div>
        <div class="setting">
          <label class="checkbox-label">
            <input type="checkbox" id="includeMetadata" checked>
            <span>Include page info</span>
          </label>
        </div>
      </section>
      <section class="section">
        <div class="setting">
          <select id="headingStyle" class="setting-select">
            <option value="atx"># ATX headings</option>
            <option value="setext">Setext headings</option>
          </select>
          <div class="setting-hint" id="headingHint"></div>
        </div>
        <div class="setting">
          <select id="bulletListMarker" class="setting-select">
            <option value="-">- Dash</option>
            <option value="*">* Asterisk</option>
          </select>
          <div class="setting-hint" id="bulletHint"></div>
        </div>
        <div class="setting">
          <select id="codeBlockStyle" class="setting-select">
            <option value="fenced">Fenced</option>
            <option value="indented">Indented</option>
          </select>
          <div class="setting-hint" id="codeHint"></div>
        </div>
        <div class="setting">
          <select id="linkStyle" class="setting-select">
            <option value="inlined">Inlined</option>
            <option value="referenced">Referenced</option>
          </select>
          <div class="setting-hint" id="linkHint"></div>
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
