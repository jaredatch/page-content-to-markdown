# Chrome Web Store - Privacy Practices Justifications

When submitting to the Chrome Web Store, you need to justify each permission in the privacy practices form. Below is the justification text for each permission used by this extension.

---

## Permissions

### activeTab

**Justification:**
The extension needs access to the active tab's page content so it can read the DOM and convert the page's HTML to markdown. This permission is only activated when the user clicks the extension icon, uses the keyboard shortcut, or selects a context menu option. It does not grant persistent or background access to any tab.

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

### `*://x.com/*` and `*://*.x.com/*`

**Justification:**
X (formerly Twitter) is a supported site for which the extension provides specialized extraction (single tweets, threads, and X Articles). The extension needs to detect, on popup open, which of these content types is actually present in the page DOM so it can show only the applicable options to the user — for example, hiding the "Article" option on a regular tweet, or showing only "Article" on an X Article page.

This DOM detection runs the moment the user opens the popup, before they can click anything. With `activeTab` alone, the content script is only injected after the user clicks the toolbar icon, which races the detection step and produces incorrect results on the first popup open.

Pre-granting access to x.com via host permissions ensures the content script is already loaded when the user opens the popup, so detection works correctly the first time. The same as `<all_urls>` content scripts: no logic runs automatically on page load, no page content is transmitted anywhere, and no remote code is executed.

This permission is scoped narrowly to x.com because that is the only supported site requiring popup-time DOM detection today. Other supported sites (Claude, Grok) are reachable through the existing user-click flow without a similar race.

---

## Content Scripts - Host Permissions

### `<all_urls>` (content script match pattern)

**Justification:**
The extension converts web page content to markdown. By nature, it must be able to run on any web page the user wants to convert. The content script is injected on all URLs so that when the user activates the extension (via popup button, keyboard shortcut, or context menu), it can:

1. Read the current page's DOM to extract and convert content to markdown
2. Provide the visual element picker overlay for selective conversion
3. Handle clipboard write fallback when the background service worker cannot access the clipboard API directly
4. Handle file save by creating a Blob URL and triggering a download

The content script does not run any logic automatically on page load. It waits for messages from the popup or background script, which are only sent in response to explicit user actions. No page content is transmitted to any server or third party.

**Important note for reviewers:** This extension has no remote code execution, makes no network requests, and has no analytics or tracking. The `<all_urls>` pattern is required solely because the user can choose to convert any page they visit -- the extension cannot predict which sites the user will want to convert.

---

## Data Use Disclosures

For the Chrome Web Store data use disclosure section:

- **Does not collect any user data**
- **Does not transmit any data to any server**
- **Does not sell or share data with third parties**
- **Does not use data for purposes unrelated to the extension's core functionality**
- **Does not use data for creditworthiness or lending purposes**

The only data stored is user preferences (formatting settings, output mode), stored locally via chrome.storage.local.
