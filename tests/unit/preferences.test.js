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

      expect(prefs).toEqual({
        outputMode: 'clipboard',
        includeMetadata: true
      });
    });

    test('should merge stored values with defaults', async () => {
      chrome.storage.local.get.mockResolvedValue({ outputMode: 'file' });

      const prefs = await Preferences.get();

      expect(prefs).toEqual({
        outputMode: 'file',
        includeMetadata: true
      });
    });

    test('should override all defaults when all stored', async () => {
      chrome.storage.local.get.mockResolvedValue({
        outputMode: 'file',
        includeMetadata: false
      });

      const prefs = await Preferences.get();

      expect(prefs).toEqual({
        outputMode: 'file',
        includeMetadata: false
      });
    });

    test('should return defaults on storage error', async () => {
      chrome.storage.local.get.mockRejectedValue(new Error('Storage unavailable'));

      const prefs = await Preferences.get();

      expect(prefs).toEqual({
        outputMode: 'clipboard',
        includeMetadata: true
      });
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
});
