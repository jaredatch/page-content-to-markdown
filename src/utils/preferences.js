// Preferences wrapper around chrome.storage.local

const DEFAULTS = {
  outputMode: 'clipboard',  // 'clipboard' or 'file'
  includeMetadata: true
};

class Preferences {
  static get DEFAULTS() {
    return { ...DEFAULTS };
  }

  static async get() {
    try {
      const stored = await chrome.storage.local.get(Object.keys(DEFAULTS));
      return { ...DEFAULTS, ...stored };
    } catch (error) {
      console.warn('⚠️ [preferences] Failed to read preferences:', error.message);
      return { ...DEFAULTS };
    }
  }

  static async set(partial) {
    try {
      await chrome.storage.local.set(partial);
    } catch (error) {
      console.warn('⚠️ [preferences] Failed to save preferences:', error.message);
    }
  }
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = Preferences;
}
