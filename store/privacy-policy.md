# Privacy Policy - Copy Page as Markdown

**Last updated:** March 2026

## What this extension does

Copy Page as Markdown reads the content of web pages you are viewing in order to convert that content into markdown format. It can also write to your clipboard when you choose to copy the converted output.

By default it strips well-known tracking parameters (utm_*, fbclid, gclid, and similar) from URLs in the converted output. This happens entirely within your browser; the original page is unaffected.

## Data collection

This extension does not collect, transmit, or store any of your data on any server. There is no analytics, no tracking, no telemetry, and no third-party services of any kind.

## What is accessed and why

- **Page content:** The extension reads the DOM of the active page to convert it to markdown. This happens entirely within your browser.
- **Clipboard:** When you choose the "Copy" output option, the extension writes the converted markdown to your clipboard. It does not read your clipboard.
- **Local storage:** Your preferences (output mode, page-info toggle and format, image and link handling, tracking-param strip, filename template, formatting options, auto-close behavior) are saved using the browser's local storage API (`chrome.storage.local`). This data stays on your device and is never transmitted anywhere.

## Permissions

The extension requests only the permissions it needs to function:

- **clipboardWrite** -- Write converted markdown to your clipboard
- **contextMenus** -- Add right-click menu options for quick conversion
- **notifications** -- Show brief system confirmations when a conversion succeeds or fails (e.g. "Tweet copied as markdown"); used for context-menu, keyboard-shortcut, and element-picker actions where there is no popup to display feedback in
- **storage** -- Save your preferences locally
- **Host access on all URLs** -- The content script runs on any page you choose to convert; it does nothing on page load and only reads the DOM in response to your explicit actions

## Third-party services

None. The extension has no network calls, no external dependencies at runtime, and no server-side component.

## Contact

If you have questions about this privacy policy, contact [YOUR EMAIL].
