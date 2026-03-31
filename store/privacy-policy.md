# Privacy Policy - Copy Page as Markdown

**Last updated:** March 2026

## What this extension does

Copy Page as Markdown reads the content of web pages you are viewing in order to convert that content into markdown format. It can also write to your clipboard when you choose to copy the converted output.

## Data collection

This extension does not collect, transmit, or store any of your data on any server. There is no analytics, no tracking, no telemetry, and no third-party services of any kind.

## What is accessed and why

- **Page content:** The extension reads the DOM of the active page to convert it to markdown. This happens entirely within your browser.
- **Clipboard:** When you choose the "Copy" output option, the extension writes the converted markdown to your clipboard. It does not read your clipboard.
- **Local storage:** Your preferences (output mode, metadata toggle, formatting options) are saved using the browser's local storage API (`chrome.storage.local`). This data stays on your device and is never transmitted anywhere.

## Permissions

The extension requests only the permissions it needs to function:

- **activeTab** -- Access the current tab's content when you activate the extension
- **clipboardWrite** -- Write converted markdown to your clipboard
- **contextMenus** -- Add right-click menu options for quick conversion
- **storage** -- Save your preferences locally
- **Content script on all URLs** -- The content script needs to run on any page so it can convert whatever page you are viewing

## Third-party services

None. The extension has no network calls, no external dependencies at runtime, and no server-side component.

## Contact

If you have questions about this privacy policy, contact [YOUR EMAIL].
