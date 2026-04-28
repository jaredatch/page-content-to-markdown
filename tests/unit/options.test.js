const MOCK_DEFAULTS = {
  outputMode: 'clipboard',
  includeMetadata: true,
  metadataFormat: 'header',
  autoClosePopup: true,
  filenameTemplate: '{title} - {date}',
  filenameStyle: 'preserve',
  imageMode: 'keep',
  linkMode: 'keep',
  stripTrackingParams: true,
  headingStyle: 'atx',
  bulletListMarker: '-',
  codeBlockStyle: 'fenced',
  linkStyle: 'inlined',
  uiAdvancedOpen: false,
  uiTokensOpen: false
};

jest.mock('../../src/utils/preferences', () => ({
  get: jest.fn().mockResolvedValue({ ...MOCK_DEFAULTS }),
  set: jest.fn().mockResolvedValue(),
  DEFAULTS: { ...MOCK_DEFAULTS }
}));

let Preferences;

// Fixture mirrors src/options/options.html structure. Kept minimal —
// every element the controller looks up by id/name must be present.
const OPTIONS_HTML = `
  <div class="page">
    <div class="page-header">
      <button class="reset-btn" id="resetBtn" type="button">Reset to defaults</button>
    </div>
    <div class="layout">
      <div class="settings-card">
        <section class="section">
          <div class="field">
            <div class="segmented" role="radiogroup">
              <input type="radio" id="outputMode-clipboard" name="outputMode" value="clipboard">
              <label for="outputMode-clipboard">Copy</label>
              <input type="radio" id="outputMode-file" name="outputMode" value="file">
              <label for="outputMode-file">Save</label>
            </div>
          </div>
          <div class="field">
            <label class="checkbox-row" for="includeMetadata">
              <input type="checkbox" id="includeMetadata">
              <span class="checkbox-fauxbox"></span>
            </label>
            <div class="indented" id="metadataFormatGroup">
              <div class="segmented" role="radiogroup">
                <input type="radio" id="metadataFormat-header" name="metadataFormat" value="header">
                <label for="metadataFormat-header">Header</label>
                <input type="radio" id="metadataFormat-yaml" name="metadataFormat" value="yaml">
                <label for="metadataFormat-yaml">YAML</label>
              </div>
            </div>
          </div>
          <div class="field">
            <label class="checkbox-row" for="autoClosePopup">
              <input type="checkbox" id="autoClosePopup">
              <span class="checkbox-fauxbox"></span>
            </label>
          </div>
        </section>
        <section class="section">
          <div class="field">
            <input type="text" id="filenameTemplate" class="text-input">
            <button class="disclosure" id="tokensToggle" type="button" aria-expanded="false" aria-controls="tokensPanel">
              <span class="disclosure-tri"></span><span>Available tokens</span>
            </button>
            <div class="tokens-panel" id="tokensPanel" hidden>
              <div class="tokens-list" id="tokensList"></div>
            </div>
          </div>
          <div class="field">
            <div class="segmented" role="radiogroup">
              <input type="radio" id="filenameStyle-preserve" name="filenameStyle" value="preserve">
              <label for="filenameStyle-preserve">Preserve</label>
              <input type="radio" id="filenameStyle-kebab" name="filenameStyle" value="kebab">
              <label for="filenameStyle-kebab">kebab</label>
              <input type="radio" id="filenameStyle-snake" name="filenameStyle" value="snake">
              <label for="filenameStyle-snake">snake</label>
            </div>
          </div>
        </section>
        <section class="section">
          <div class="field">
            <div class="segmented" role="radiogroup">
              <input type="radio" id="imageMode-keep" name="imageMode" value="keep">
              <label for="imageMode-keep">Keep</label>
              <input type="radio" id="imageMode-alt" name="imageMode" value="alt">
              <label for="imageMode-alt">Alt</label>
              <input type="radio" id="imageMode-strip" name="imageMode" value="strip">
              <label for="imageMode-strip">Strip</label>
              <input type="radio" id="imageMode-url-list" name="imageMode" value="url-list">
              <label for="imageMode-url-list">URL list</label>
            </div>
          </div>
          <div class="field">
            <div class="segmented" role="radiogroup">
              <input type="radio" id="linkMode-keep" name="linkMode" value="keep">
              <label for="linkMode-keep">Keep</label>
              <input type="radio" id="linkMode-strip" name="linkMode" value="strip">
              <label for="linkMode-strip">Text</label>
              <input type="radio" id="linkMode-bare" name="linkMode" value="bare">
              <label for="linkMode-bare">Text+URL</label>
            </div>
          </div>
          <div class="field">
            <label class="checkbox-row" for="stripTrackingParams">
              <input type="checkbox" id="stripTrackingParams">
              <span class="checkbox-fauxbox"></span>
            </label>
          </div>
        </section>
        <section class="section">
          <button class="advanced-toggle" id="advancedToggle" type="button" aria-expanded="false" aria-controls="advancedContent">
            <span class="advanced-sub" id="advancedSub">Heading, bullet, code block, and link syntax</span>
          </button>
          <div class="advanced-content" id="advancedContent" hidden>
            <div class="field">
              <div class="segmented" role="radiogroup">
                <input type="radio" id="headingStyle-atx" name="headingStyle" value="atx">
                <label for="headingStyle-atx">ATX</label>
                <input type="radio" id="headingStyle-setext" name="headingStyle" value="setext">
                <label for="headingStyle-setext">Setext</label>
              </div>
            </div>
            <div class="field">
              <div class="segmented" role="radiogroup">
                <input type="radio" id="bulletListMarker-dash" name="bulletListMarker" value="-">
                <label for="bulletListMarker-dash">-</label>
                <input type="radio" id="bulletListMarker-asterisk" name="bulletListMarker" value="*">
                <label for="bulletListMarker-asterisk">*</label>
              </div>
            </div>
            <div class="field">
              <div class="segmented" role="radiogroup">
                <input type="radio" id="codeBlockStyle-fenced" name="codeBlockStyle" value="fenced">
                <label for="codeBlockStyle-fenced">Fenced</label>
                <input type="radio" id="codeBlockStyle-indented" name="codeBlockStyle" value="indented">
                <label for="codeBlockStyle-indented">Indented</label>
              </div>
            </div>
            <div class="field">
              <div class="segmented" role="radiogroup">
                <input type="radio" id="linkStyle-inlined" name="linkStyle" value="inlined">
                <label for="linkStyle-inlined">Inline</label>
                <input type="radio" id="linkStyle-referenced" name="linkStyle" value="referenced">
                <label for="linkStyle-referenced">Reference</label>
              </div>
            </div>
          </div>
        </section>
      </div>
      <aside class="preview-pane">
        <div class="preview-filename"><div id="previewFilename"></div></div>
        <pre class="preview-content" id="previewContent"></pre>
      </aside>
    </div>
  </div>
  <div class="toast" id="toast"></div>
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

  // ---------------------------------------------------------------
  // Constructor / init
  // ---------------------------------------------------------------
  describe('constructor and init', () => {
    test('binds all expected DOM elements', async () => {
      const opts = await createOptions();
      expect(opts.elements.outputMode).toBeTruthy();
      expect(opts.elements.includeMetadata).toBeTruthy();
      expect(opts.elements.filenameTemplate).toBeTruthy();
      expect(opts.elements.filenameStyle).toBeTruthy();
      expect(opts.elements.imageMode).toBeTruthy();
      expect(opts.elements.linkMode).toBeTruthy();
      expect(opts.elements.headingStyle).toBeTruthy();
      expect(opts.elements.tokensToggle).toBeTruthy();
      expect(opts.elements.advancedToggle).toBeTruthy();
      expect(opts.elements.previewContent).toBeTruthy();
      expect(opts.elements.previewFilename).toBeTruthy();
      expect(opts.elements.resetBtn).toBeTruthy();
      expect(opts.elements.toast).toBeTruthy();
    });

    test('loads preferences on init', async () => {
      await createOptions();
      expect(Preferences.get).toHaveBeenCalled();
    });

    test('renders preview content on init', async () => {
      const opts = await createOptions();
      expect(opts.elements.previewContent.innerHTML.length).toBeGreaterThan(0);
      expect(opts.elements.previewContent.innerHTML).toContain('md-heading');
    });

    test('renders filename preview on init', async () => {
      const opts = await createOptions();
      expect(opts.elements.previewFilename.textContent).toMatch(/\.md$/);
    });

    test('renders tokens list rows', async () => {
      const opts = await createOptions();
      const rows = opts.elements.tokensList.querySelectorAll('[data-insert-token]');
      expect(rows.length).toBe(8);
    });
  });

  // ---------------------------------------------------------------
  // loadPreferences
  // ---------------------------------------------------------------
  describe('loadPreferences', () => {
    test('populates outputMode', async () => {
      const opts = await createOptions({ outputMode: 'file' });
      expect(opts.elements.outputMode.value).toBe('file');
    });

    test('populates includeMetadata checkbox', async () => {
      const opts = await createOptions({ includeMetadata: false });
      expect(opts.elements.includeMetadata.checked).toBe(false);
    });

    test('populates filenameTemplate input', async () => {
      const opts = await createOptions({ filenameTemplate: '{domain}-{slug}' });
      expect(opts.elements.filenameTemplate.value).toBe('{domain}-{slug}');
    });

    test('populates filenameStyle', async () => {
      const opts = await createOptions({ filenameStyle: 'kebab' });
      expect(opts.elements.filenameStyle.value).toBe('kebab');
    });

    test('populates imageMode', async () => {
      const opts = await createOptions({ imageMode: 'url-list' });
      expect(opts.elements.imageMode.value).toBe('url-list');
    });

    test('populates linkMode', async () => {
      const opts = await createOptions({ linkMode: 'bare' });
      expect(opts.elements.linkMode.value).toBe('bare');
    });

    test('populates advanced fields', async () => {
      const opts = await createOptions({
        headingStyle: 'setext',
        bulletListMarker: '*',
        codeBlockStyle: 'indented',
        linkStyle: 'referenced'
      });
      expect(opts.elements.headingStyle.value).toBe('setext');
      expect(opts.elements.bulletListMarker.value).toBe('*');
      expect(opts.elements.codeBlockStyle.value).toBe('indented');
      expect(opts.elements.linkStyle.value).toBe('referenced');
    });
  });

  // ---------------------------------------------------------------
  // Auto-save listeners
  // ---------------------------------------------------------------
  describe('auto-save', () => {
    test('outputMode change saves', async () => {
      const opts = await createOptions();
      Preferences.set.mockClear();

      opts.elements.outputMode.value = 'file';
      opts.elements.outputMode.dispatchEvent(new Event('change'));
      await flushPromises();

      expect(Preferences.set).toHaveBeenCalledWith({ outputMode: 'file' });
    });

    test('includeMetadata change saves', async () => {
      const opts = await createOptions();
      Preferences.set.mockClear();

      opts.elements.includeMetadata.checked = false;
      opts.elements.includeMetadata.dispatchEvent(new Event('change'));
      await flushPromises();

      expect(Preferences.set).toHaveBeenCalledWith({ includeMetadata: false });
    });

    test('imageMode change saves', async () => {
      const opts = await createOptions();
      Preferences.set.mockClear();

      opts.elements.imageMode.value = 'strip';
      opts.elements.imageMode.dispatchEvent(new Event('change'));
      await flushPromises();

      expect(Preferences.set).toHaveBeenCalledWith({ imageMode: 'strip' });
    });

    test('linkMode change saves', async () => {
      const opts = await createOptions();
      Preferences.set.mockClear();

      opts.elements.linkMode.value = 'bare';
      opts.elements.linkMode.dispatchEvent(new Event('change'));
      await flushPromises();

      expect(Preferences.set).toHaveBeenCalledWith({ linkMode: 'bare' });
    });

    test('stripTrackingParams change saves', async () => {
      const opts = await createOptions();
      Preferences.set.mockClear();

      opts.elements.stripTrackingParams.checked = false;
      opts.elements.stripTrackingParams.dispatchEvent(new Event('change'));
      await flushPromises();

      expect(Preferences.set).toHaveBeenCalledWith({ stripTrackingParams: false });
    });

    test('headingStyle change saves', async () => {
      const opts = await createOptions();
      Preferences.set.mockClear();

      opts.elements.headingStyle.value = 'setext';
      opts.elements.headingStyle.dispatchEvent(new Event('change'));
      await flushPromises();

      expect(Preferences.set).toHaveBeenCalledWith({ headingStyle: 'setext' });
    });

    test('filenameStyle change saves', async () => {
      const opts = await createOptions();
      Preferences.set.mockClear();

      opts.elements.filenameStyle.value = 'snake';
      opts.elements.filenameStyle.dispatchEvent(new Event('change'));
      await flushPromises();

      expect(Preferences.set).toHaveBeenCalledWith({ filenameStyle: 'snake' });
    });
  });

  // ---------------------------------------------------------------
  // Filename template debouncing
  // ---------------------------------------------------------------
  describe('filename template', () => {
    test('input event updates the filename preview immediately', async () => {
      const opts = await createOptions();
      opts.elements.filenameTemplate.value = '{slug}';
      opts.elements.filenameTemplate.dispatchEvent(new Event('input'));
      expect(opts.elements.previewFilename.textContent)
        .toBe('case-for-extensions.md');
    });

    test('save is debounced', async () => {
      const opts = await createOptions();
      Preferences.set.mockClear();
      jest.useFakeTimers();

      opts.elements.filenameTemplate.value = '{slug}';
      opts.elements.filenameTemplate.dispatchEvent(new Event('input'));
      expect(Preferences.set).not.toHaveBeenCalled();

      jest.advanceTimersByTime(500);
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

  // ---------------------------------------------------------------
  // Live preview content reflects settings
  // ---------------------------------------------------------------
  describe('live preview', () => {
    test('YAML format produces frontmatter', async () => {
      const opts = await createOptions({ metadataFormat: 'yaml' });
      const html = opts.elements.previewContent.innerHTML;
      expect(html).toContain('md-yaml-key');
    });

    test('strip image mode hides image line', async () => {
      const opts = await createOptions({ imageMode: 'strip' });
      const text = opts.elements.previewContent.textContent;
      expect(text).not.toContain('toolbar.png');
    });

    test('url-list image mode appends Images section', async () => {
      const opts = await createOptions({ imageMode: 'url-list' });
      const text = opts.elements.previewContent.textContent;
      expect(text).toContain('## Images');
    });

    test('strip tracking removes utm_* from preview link', async () => {
      const opts = await createOptions({ stripTrackingParams: true });
      const text = opts.elements.previewContent.textContent;
      expect(text).not.toContain('utm_source');
    });

    test('reference link style adds footnote definition', async () => {
      const opts = await createOptions({ linkStyle: 'referenced' });
      const text = opts.elements.previewContent.textContent;
      expect(text).toContain('[1]:');
    });

    test('setext heading uses underline', async () => {
      const opts = await createOptions({ headingStyle: 'setext' });
      const text = opts.elements.previewContent.textContent;
      expect(text).toMatch(/={5,}/);
    });

    test('asterisk bullet marker is reflected in preview', async () => {
      const opts = await createOptions({ bulletListMarker: '*' });
      const text = opts.elements.previewContent.textContent;
      expect(text).toMatch(/^\* Solves/m);
    });

    test('changing a setting updates the preview', async () => {
      const opts = await createOptions({ headingStyle: 'atx' });
      const before = opts.elements.previewContent.textContent;

      opts.elements.headingStyle.value = 'setext';
      opts.elements.headingStyle.dispatchEvent(new Event('change'));
      await flushPromises();

      const after = opts.elements.previewContent.textContent;
      expect(after).not.toBe(before);
      expect(after).toMatch(/={5,}/);
    });
  });

  // ---------------------------------------------------------------
  // Two-step armed reset
  // ---------------------------------------------------------------
  describe('reset to defaults (armed)', () => {
    test('first click arms the button', async () => {
      const opts = await createOptions();
      Preferences.set.mockClear();

      opts.elements.resetBtn.click();

      expect(opts.resetArmed).toBe(true);
      expect(opts.elements.resetBtn.classList.contains('armed')).toBe(true);
      expect(opts.elements.resetBtn.textContent).toBe('Click to confirm reset');
      // First click does NOT save yet — only arms.
      expect(Preferences.set).not.toHaveBeenCalled();
    });

    test('second click within window confirms the reset', async () => {
      const opts = await createOptions({ outputMode: 'file', headingStyle: 'setext' });
      Preferences.set.mockClear();
      Preferences.get.mockResolvedValue({ ...MOCK_DEFAULTS });

      opts.elements.resetBtn.click(); // arm
      opts.elements.resetBtn.click(); // confirm
      await flushPromises();

      expect(Preferences.set).toHaveBeenCalledWith(expect.objectContaining({
        outputMode: 'clipboard',
        headingStyle: 'atx'
      }));
      expect(opts.elements.resetBtn.classList.contains('armed')).toBe(false);
      expect(opts.elements.resetBtn.textContent).toBe('Reset to defaults');
    });

    test('auto-disarms after timeout', async () => {
      const opts = await createOptions();
      jest.useFakeTimers();

      opts.elements.resetBtn.click();
      expect(opts.resetArmed).toBe(true);

      jest.advanceTimersByTime(4000);
      expect(opts.resetArmed).toBe(false);
      expect(opts.elements.resetBtn.classList.contains('armed')).toBe(false);
    });

    test('any other change disarms the button', async () => {
      const opts = await createOptions();
      opts.elements.resetBtn.click();
      expect(opts.resetArmed).toBe(true);

      opts.elements.outputMode.value = 'file';
      opts.elements.outputMode.dispatchEvent(new Event('change'));
      await flushPromises();

      expect(opts.resetArmed).toBe(false);
    });

    test('confirmed reset shows the toast', async () => {
      const opts = await createOptions();
      Preferences.get.mockResolvedValue({ ...MOCK_DEFAULTS });

      opts.elements.resetBtn.click();
      opts.elements.resetBtn.click();
      await flushPromises();

      expect(opts.elements.toast.classList.contains('visible')).toBe(true);
      expect(opts.elements.toast.textContent).toContain('Settings reset to defaults');
    });

    test('reset preserves disclosure state', async () => {
      const opts = await createOptions({ uiAdvancedOpen: true, uiTokensOpen: true });
      Preferences.set.mockClear();
      Preferences.get.mockResolvedValue({ ...MOCK_DEFAULTS, uiAdvancedOpen: true, uiTokensOpen: true });

      opts.elements.resetBtn.click();
      opts.elements.resetBtn.click();
      await flushPromises();

      const callArg = Preferences.set.mock.calls[0][0];
      expect(callArg.uiAdvancedOpen).toBe(true);
      expect(callArg.uiTokensOpen).toBe(true);
    });
  });

  // ---------------------------------------------------------------
  // Disclosures
  // ---------------------------------------------------------------
  describe('disclosures', () => {
    test('tokens disclosure toggles open and persists', async () => {
      const opts = await createOptions({ uiTokensOpen: false });
      expect(opts.elements.tokensPanel.hidden).toBe(true);
      Preferences.set.mockClear();

      opts.elements.tokensToggle.click();
      expect(opts.elements.tokensPanel.hidden).toBe(false);
      expect(opts.elements.tokensToggle.getAttribute('aria-expanded')).toBe('true');
      await flushPromises();
      expect(Preferences.set).toHaveBeenCalledWith({ uiTokensOpen: true });
    });

    test('advanced disclosure toggles open and persists', async () => {
      const opts = await createOptions({ uiAdvancedOpen: false });
      expect(opts.elements.advancedContent.hidden).toBe(true);
      Preferences.set.mockClear();

      opts.elements.advancedToggle.click();
      expect(opts.elements.advancedContent.hidden).toBe(false);
      expect(opts.elements.advancedToggle.getAttribute('aria-expanded')).toBe('true');
      await flushPromises();
      expect(Preferences.set).toHaveBeenCalledWith({ uiAdvancedOpen: true });
    });

    test('initial state honors persisted prefs', async () => {
      const opts = await createOptions({ uiAdvancedOpen: true, uiTokensOpen: true });
      expect(opts.elements.advancedContent.hidden).toBe(false);
      expect(opts.elements.tokensPanel.hidden).toBe(false);
    });

    test('advanced sub-text changes when expanded', async () => {
      const opts = await createOptions({ uiAdvancedOpen: false });
      expect(opts.elements.advancedSub.textContent)
        .toBe('Heading, bullet, code block, and link syntax');

      opts.elements.advancedToggle.click();
      expect(opts.elements.advancedSub.textContent)
        .toBe('Hide power-user syntax preferences');
    });
  });

  // ---------------------------------------------------------------
  // Click-to-insert tokens
  // ---------------------------------------------------------------
  describe('token insertion', () => {
    test('clicking a token row inserts at cursor and triggers save', async () => {
      const opts = await createOptions({ filenameTemplate: '' });
      Preferences.set.mockClear();
      jest.useFakeTimers();

      const row = opts.elements.tokensList.querySelector('[data-insert-token="{title}"]');
      expect(row).toBeTruthy();
      row.click();

      expect(opts.elements.filenameTemplate.value).toBe('{title}');

      // Save fires after debounce.
      jest.advanceTimersByTime(500);
      expect(Preferences.set).toHaveBeenCalledWith({ filenameTemplate: '{title}' });
    });

    test('inserts at the cursor position, not just the end', async () => {
      const opts = await createOptions({ filenameTemplate: 'pre-suf' });
      const input = opts.elements.filenameTemplate;
      input.focus();
      input.selectionStart = 3;
      input.selectionEnd = 3;

      const row = opts.elements.tokensList.querySelector('[data-insert-token="{date}"]');
      row.click();

      expect(input.value).toBe('pre{date}-suf');
    });
  });

  // ---------------------------------------------------------------
  // Conditional Page-info-format sub-control
  // ---------------------------------------------------------------
  describe('page info format visibility', () => {
    test('hidden when includeMetadata is off', async () => {
      const opts = await createOptions({ includeMetadata: false });
      expect(opts.elements.metadataFormatGroup.hidden).toBe(true);
    });

    test('visible when includeMetadata is on', async () => {
      const opts = await createOptions({ includeMetadata: true });
      expect(opts.elements.metadataFormatGroup.hidden).toBe(false);
    });

    test('toggling the checkbox updates visibility', async () => {
      const opts = await createOptions({ includeMetadata: true });
      expect(opts.elements.metadataFormatGroup.hidden).toBe(false);

      opts.elements.includeMetadata.checked = false;
      opts.elements.includeMetadata.dispatchEvent(new Event('change'));
      await flushPromises();

      expect(opts.elements.metadataFormatGroup.hidden).toBe(true);
    });
  });
});
