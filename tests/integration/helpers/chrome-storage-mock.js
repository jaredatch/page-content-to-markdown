/**
 * Persistent in-memory chrome.storage.local mock for integration tests.
 * Unlike the unit test mock (which resets per-component), this persists
 * across components within a test so both Background and Content Script
 * see the same preferences via Preferences.get().
 */
class ChromeStorageMock {
  constructor() {
    this._data = {};
  }

  /**
   * Install into global.chrome.storage.local, replacing the default jest.fn() mocks.
   */
  install() {
    chrome.storage.local.get = jest.fn((keys) => {
      if (!keys) return Promise.resolve({ ...this._data });

      // String form: single key
      if (typeof keys === 'string') {
        const result = {};
        if (keys in this._data) result[keys] = this._data[keys];
        return Promise.resolve(result);
      }

      // Array form: list of keys (used by Preferences.get())
      if (Array.isArray(keys)) {
        const result = {};
        for (const key of keys) {
          if (key in this._data) result[key] = this._data[key];
        }
        return Promise.resolve(result);
      }

      // Object form: keys with default values
      const result = {};
      for (const [key, defaultVal] of Object.entries(keys)) {
        result[key] = key in this._data ? this._data[key] : defaultVal;
      }
      return Promise.resolve(result);
    });

    chrome.storage.local.set = jest.fn((items) => {
      Object.assign(this._data, items);
      return Promise.resolve();
    });
  }

  /**
   * Pre-seed preferences for a test.
   */
  seed(data) {
    Object.assign(this._data, data);
  }

  /**
   * Read current storage state (for assertions).
   */
  getAll() {
    return { ...this._data };
  }

  /**
   * Reset storage between tests.
   */
  reset() {
    this._data = {};
  }
}

module.exports = ChromeStorageMock;
