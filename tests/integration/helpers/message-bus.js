/**
 * Chrome messaging simulation for integration tests.
 *
 * Routes messages between real Background and Content Script components
 * by replacing the global chrome.runtime/tabs messaging mocks.
 *
 * Context tracking: call setContext('background') before requiring background.js,
 * and setContext('content') before requiring content-script.js. The bus files each
 * onMessage.addListener callback under the correct component.
 */
class MessageBus {
  constructor() {
    this._backgroundListeners = [];
    this._contentListeners = [];
    this._contextMenuListeners = [];
    this._tabRemovedListeners = [];
    this._tabUpdatedListeners = [];
    this._commandListeners = [];
    this._installedListeners = [];
    this._currentContext = null;
    this._tabId = 1;
    this._tabUrl = 'https://example.com/test-page';
  }

  /**
   * Install this bus into global.chrome, replacing the default jest.fn() mocks.
   * Call BEFORE requiring any source modules.
   */
  install() {
    const self = this;

    // onMessage.addListener — routes to correct listener registry based on context
    chrome.runtime.onMessage.addListener = jest.fn((listener) => {
      if (self._currentContext === 'background') {
        self._backgroundListeners.push(listener);
      } else if (self._currentContext === 'content') {
        self._contentListeners.push(listener);
      }
    });

    // chrome.runtime.sendMessage — Popup/Content → Background
    // Supports callback, promise (await), and fire-and-forget patterns. Real
    // chrome API returns a Promise when no callback is supplied; mirror that
    // so awaiting senders (e.g. selectionComplete) get the real response.
    chrome.runtime.sendMessage = jest.fn((msg, callback) => {
      return new Promise((resolve) => {
        const sender = { tab: { id: self._tabId } };
        let resolved = false;
        const respond = (response) => {
          if (callback) callback(response);
          if (!resolved) {
            resolved = true;
            resolve(response);
          }
        };
        let async = false;
        for (const listener of self._backgroundListeners) {
          const wantsAsync = listener(msg, sender, respond);
          if (wantsAsync) {
            async = true;
            break;
          }
          if (resolved) break;
        }
        // No listener handled the message — resolve undefined so awaiters
        // don't hang. Real chrome rejects, but our tests treat undefined as
        // "nothing took it" via the response-shape check.
        if (!async && !resolved) resolve(undefined);
      });
    });

    // chrome.tabs.sendMessage — Background → Content Script
    // Returns a Promise that resolves when content listener calls sendResponse
    chrome.tabs.sendMessage = jest.fn((tabId, msg) => {
      return new Promise((resolve, reject) => {
        let handled = false;
        for (const listener of self._contentListeners) {
          const wantsAsync = listener(
            msg,
            { tab: { id: tabId } },
            (response) => {
              handled = true;
              resolve(response);
            }
          );
          // Sync handler (returns false) that already called sendResponse
          if (!wantsAsync && handled) break;
          // Async handler (returns true) — will call sendResponse later
          if (wantsAsync) break;
        }
        // If no listener handled it
        if (!handled && self._contentListeners.length === 0) {
          reject(new Error('No content script listener registered'));
        }
      });
    });

    // chrome.tabs.query — returns the simulated active tab
    chrome.tabs.query = jest.fn().mockResolvedValue([
      { id: self._tabId, url: self._tabUrl }
    ]);

    // Capture contextMenus.onClicked listeners
    chrome.contextMenus.onClicked.addListener = jest.fn((listener) => {
      self._contextMenuListeners.push(listener);
    });

    // Capture onInstalled listeners (for context menu creation)
    chrome.runtime.onInstalled.addListener = jest.fn((listener) => {
      self._installedListeners.push(listener);
    });

    // Capture tab lifecycle listeners
    chrome.tabs.onRemoved.addListener = jest.fn((listener) => {
      self._tabRemovedListeners.push(listener);
    });

    chrome.tabs.onUpdated.addListener = jest.fn((listener) => {
      self._tabUpdatedListeners.push(listener);
    });

    // Capture command listeners
    if (chrome.commands && chrome.commands.onCommand) {
      chrome.commands.onCommand.addListener = jest.fn((listener) => {
        self._commandListeners.push(listener);
      });
    }
  }

  /**
   * Set the context before requiring a component module.
   * @param {'background'|'content'} ctx
   */
  setContext(ctx) {
    this._currentContext = ctx;
  }

  /**
   * Set the simulated active tab URL.
   */
  setTabUrl(url) {
    this._tabUrl = url;
    chrome.tabs.query.mockResolvedValue([
      { id: this._tabId, url: this._tabUrl }
    ]);
  }

  /**
   * Simulate Popup sending a message to Background.
   * Returns a Promise that resolves with the sendResponse argument.
   */
  simulatePopupMessage(msg) {
    return new Promise((resolve) => {
      const sender = { tab: { id: this._tabId } };
      for (const listener of this._backgroundListeners) {
        const wantsAsync = listener(msg, sender, (response) => {
          resolve(response);
        });
        if (wantsAsync) break;
      }
    });
  }

  /**
   * Simulate Content Script sending a fire-and-forget message to Background.
   * Used for selectionComplete and selectionCancelled.
   */
  simulateContentToBackground(msg) {
    const sender = { tab: { id: this._tabId } };
    for (const listener of this._backgroundListeners) {
      listener(msg, sender, () => {});
    }
  }

  /**
   * Fire the captured contextMenus.onClicked handler.
   */
  fireContextMenu(info, tab) {
    for (const listener of this._contextMenuListeners) {
      listener(info, tab || { id: this._tabId });
    }
  }

  /**
   * Fire the captured tabs.onRemoved handler. Real tab close destroys the
   * content script along with the page, so drop the content listeners too —
   * otherwise a post-removal ping (e.g. M5's getPickerStatus) would still be
   * answered by a phantom listener and report incorrect state.
   */
  fireTabRemoved(tabId) {
    for (const listener of this._tabRemovedListeners) {
      listener(tabId || this._tabId);
    }
    this._contentListeners = [];
  }

  /**
   * Fire the captured tabs.onUpdated handler.
   */
  fireTabUpdated(tabId, changeInfo) {
    for (const listener of this._tabUpdatedListeners) {
      listener(tabId || this._tabId, changeInfo || {});
    }
  }

  /**
   * Fire onInstalled listeners (triggers context menu creation).
   */
  fireOnInstalled() {
    for (const listener of this._installedListeners) {
      listener({ reason: 'install' });
    }
  }

  /**
   * Reset state between tests.
   */
  reset() {
    this._backgroundListeners = [];
    this._contentListeners = [];
    this._contextMenuListeners = [];
    this._tabRemovedListeners = [];
    this._tabUpdatedListeners = [];
    this._commandListeners = [];
    this._installedListeners = [];
    this._currentContext = null;
  }
}

module.exports = MessageBus;
