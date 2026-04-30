# Chrome Web Store - Privacy Practices Justifications

When submitting to the Chrome Web Store, you need to justify each permission in the privacy practices form. Below is the justification text for each permission used by this extension.

---

## Permissions

### clipboardWrite

**Justification:**
The extension writes converted markdown output to the user's clipboard when the user chooses the "Copy" output option. This is a core function of the extension. The extension does not read the clipboard.

### contextMenus

**Justification:**
The extension adds two right-click context menu items: "Copy selection as Markdown" (when text is selected) and "Select element for Markdown" (when no text is selected). These provide quick access to conversion without opening the popup.

### storage

**Justification:**
The extension uses chrome.storage.local to persist user preferences such as output mode (clipboard vs. file), whether to include page metadata, and markdown formatting options (heading style, bullet markers, code block style, link style). All data is stored locally on the user's device and is never transmitted anywhere.

---

## Host Permissions

### `*://*/*`

**Justification:**
The extension converts web page content to markdown. By nature, it must be able to read the DOM of any web page the user wants to convert — the user, not the extension, decides which sites are in scope. Broad host access is the standard model for web-clipping extensions in this category (e.g., Obsidian Web Clipper, Raindrop.io, Pocket).

The content script needs to be present on the page *before* the user opens the popup so that:
1. The popup can synchronously detect which supported-site content options apply (for example, on x.com the popup probes the live DOM to show only the content types actually present — a single tweet, a thread, or an article).
2. Keyboard shortcuts and context-menu actions work without an extra activation handshake.
3. Selection mode and element-picker overlays initialize without a page reload.

Without persistent host access, the content script would only inject after the user clicks the toolbar icon, which races the popup's detection step and degrades the experience on the first interaction with each tab.

The pattern is `*://*/*` (http and https only) — file://, ftp://, and other schemes are excluded since the extension does not extract from those.

**Privacy posture:** The content script does not run any logic automatically on page load. It waits for explicit user-triggered messages (popup action, keyboard shortcut, or context menu) before reading any page content. No page content is transmitted to any server or third party. The extension makes no network requests of its own, executes no remote code, and has no analytics or telemetry.

---

## Content Scripts - Host Permissions

### `<all_urls>` (content script match pattern)

**Justification:**
The content script's `matches` pattern aligns with the host permission above: the extension must be able to run on any page the user wants to convert. Once injected, the content script:

1. Reads the current page's DOM only when the user invokes a conversion action.
2. Provides the visual element picker overlay for selective conversion.
3. Handles clipboard write fallback when the background service worker cannot access the clipboard API directly.
4. Handles file save by creating a Blob URL and triggering a download.

The content script does not run any logic automatically on page load. It waits for messages from the popup or background script, which are only sent in response to explicit user actions.

**Important note for reviewers:** This extension has no remote code execution, makes no network requests, and has no analytics or tracking. The `<all_urls>` content-script pattern and `*://*/*` host permission together are required solely because the user can choose to convert any page they visit — the extension cannot predict which sites the user will want to convert.

---

## Data Use Disclosures

For the Chrome Web Store data use disclosure section:

- **Does not collect any user data**
- **Does not transmit any data to any server**
- **Does not sell or share data with third parties**
- **Does not use data for purposes unrelated to the extension's core functionality**
- **Does not use data for creditworthiness or lending purposes**

The only data stored is user preferences (formatting settings, output mode), stored locally via chrome.storage.local.
