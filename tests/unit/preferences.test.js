const Preferences = require('../../src/utils/preferences');

describe('Preferences', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    chrome.storage.local.get.mockResolvedValue({});
    chrome.storage.local.set.mockResolvedValue();
  });

  describe('DEFAULTS', () => {
    test('should have outputMode default to clipboard', () => {
      expect(Preferences.DEFAULTS.outputMode).toBe('clipboard');
    });

    test('should have includeMetadata default to true', () => {
      expect(Preferences.DEFAULTS.includeMetadata).toBe(true);
    });

    test('should return a copy (not the original object)', () => {
      const a = Preferences.DEFAULTS;
      const b = Preferences.DEFAULTS;
      expect(a).not.toBe(b);
      expect(a).toEqual(b);
    });
  });

  describe('get', () => {
    test('should return defaults when storage is empty', async () => {
      chrome.storage.local.get.mockResolvedValue({});

      const prefs = await Preferences.get();

      expect(prefs).toEqual(Preferences.DEFAULTS);
    });

    test('should merge stored values with defaults', async () => {
      chrome.storage.local.get.mockResolvedValue({ outputMode: 'file' });

      const prefs = await Preferences.get();

      expect(prefs.outputMode).toBe('file');
      expect(prefs.includeMetadata).toBe(true);
      // Formatting defaults should still be present
      expect(prefs.headingStyle).toBe('atx');
      expect(prefs.bulletListMarker).toBe('-');
    });

    test('should override all defaults when all stored', async () => {
      const overrides = {
        outputMode: 'file',
        includeMetadata: false,
        headingStyle: 'setext',
        bulletListMarker: '*',
        codeBlockStyle: 'indented',
        linkStyle: 'referenced',
        filenameTemplate: '{domain}-{slug}',
        filenameStyle: 'kebab',
        autoClosePopup: false,
        stripTrackingParams: false,
        linkMode: 'strip',
        imageMode: 'strip',
        metadataFormat: 'yaml',
        lastUsedPerSite: { x: 'thread' },
        uiAdvancedOpen: true,
        uiTokensOpen: true
      };
      chrome.storage.local.get.mockResolvedValue(overrides);

      const prefs = await Preferences.get();

      expect(prefs).toEqual(overrides);
    });

    test('should return defaults on storage error', async () => {
      chrome.storage.local.get.mockRejectedValue(new Error('Storage unavailable'));

      const prefs = await Preferences.get();

      expect(prefs).toEqual(Preferences.DEFAULTS);
    });
  });

  describe('set', () => {
    test('should write partial preferences to storage', async () => {
      await Preferences.set({ outputMode: 'file' });

      expect(chrome.storage.local.set).toHaveBeenCalledWith({ outputMode: 'file' });
    });

    test('should handle storage write error gracefully', async () => {
      chrome.storage.local.set.mockRejectedValue(new Error('Write failed'));

      // Should not throw
      await Preferences.set({ outputMode: 'file' });

      expect(chrome.storage.local.set).toHaveBeenCalled();
    });
  });

  describe('formatting defaults', () => {
    test('should have headingStyle default to atx', () => {
      expect(Preferences.DEFAULTS.headingStyle).toBe('atx');
    });

    test('should have bulletListMarker default to -', () => {
      expect(Preferences.DEFAULTS.bulletListMarker).toBe('-');
    });

    test('should have codeBlockStyle default to fenced', () => {
      expect(Preferences.DEFAULTS.codeBlockStyle).toBe('fenced');
    });

    test('should have linkStyle default to inlined', () => {
      expect(Preferences.DEFAULTS.linkStyle).toBe('inlined');
    });
  });
});
