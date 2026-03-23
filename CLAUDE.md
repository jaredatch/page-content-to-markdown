# CLAUDE.md — Page Content to Markdown

## Project Overview

Browser extension (Firefox primary, Chrome secondary) that converts web page content to clean, structured markdown. Supports full-page conversion, selective element conversion, and site-specific presets (starting with X/Twitter).

**Status:** Phase 4 complete. Full-page conversion, selective element conversion, output options (clipboard/file), and X/Twitter site-specific presets (single tweet, thread work well; article functional but needs polish). 237 tests passing.

## Quick Reference

```bash
npm install          # Install dependencies (required before anything else)
npm run build        # Production build → dist/
npm run build:dev    # Dev build with watch mode
npm run test         # Run unit tests
npm run test:watch   # Unit tests in watch mode
npm run test:e2e     # End-to-end tests (requires Puppeteer)
npm run lint         # ESLint
```

## Architecture

```
Popup (UI) → Background (service worker) → Content Script (page context) → Extractor/Converter
                                                                         ↘ ElementPicker (selection mode)
                                                                         ↘ XExtractor + XFormatter (X/Twitter)
```

- **Popup** (`src/popup/`) — User-facing UI. Actions: "Copy/Save Page as Markdown" and "Select Elements". Options: metadata toggle, output mode (clipboard/file). Shows selection-active state when picker is running.
- **Background** (`src/background/background.js`) — Service worker. Routes messages, handles clipboard (with content script fallback), output dispatch (clipboard or file), manages per-tab selection state (`Map`), context menus, keyboard commands.
- **Content Script** (`src/content/content-script.js`) — Injected into web pages. Full-page extraction, element selection mode, text selection conversion, clipboard fallback, file save via Blob URL.
- **Element Picker** (`src/content/element-picker.js`) — Shadow DOM overlay for hover-highlight, click-to-select, floating toolbar. Bundled with content script via webpack.
- **Utils** (`src/utils/`) — Extraction, conversion, preferences, and site-specific modules.
- **X/Twitter** (`src/utils/x-extractor.js`, `x-formatter.js`) — Site-specific extraction for tweets, threads, articles. XExtractor reads DOM with tiered selectors (data-testid → ARIA → structural). XFormatter produces structured markdown.
- **Site Detector** (`src/utils/site-detector.js`) — URL-based site detection for auto-showing presets in popup.

### Message Flow — Full Page
1. Popup sends `"extractAndCopy"` → Background
2. Background reads preferences, sends `"extractContent"` with `options: { includeMetadata }` → Content Script
3. Content Script extracts + converts (conditionally adds metadata header) → returns markdown + metadata
4. Background calls `dispatchOutput()` → routes to clipboard or file based on preferences → notifies popup

### Message Flow — Selective Conversion
1. Popup sends `"startSelectionMode"` → Background → Content Script
2. Content Script activates ElementPicker (user interacts with page)
3. User confirms → Content Script sends `"selectionComplete"` with markdown → Background
4. Background calls `dispatchOutput()` → clipboard or file → shows notification

### Message Flow — File Save
1. Background sends `"saveAsFile"` with markdown + filename → Content Script
2. Content Script creates Blob URL via `URL.createObjectURL`, triggers download via `<a>` click
3. Content Script responds with success/failure

### Message Flow — Context Menu
- **Text selected:** "Copy selection as Markdown" → `"convertTextSelection"` → Content Script converts selection DOM fragment
- **No text selected:** "Select element for Markdown" → `"startSelectionWithElement"` → Content Script activates picker with right-clicked element pre-selected

### Message Flow — X/Twitter Preset
1. Popup detects X via `SiteDetector.detect(url)`, shows preset buttons
2. User clicks "Copy Tweet" → Popup sends `"extractXContent"` with `contentType: "single-tweet"` → Background
3. Background reads preferences, sends `"extractXContent"` with contentType + options → Content Script
4. Content Script creates XExtractor + XFormatter, extracts and formats → returns markdown
5. On failure, Content Script falls back to generic `convertPageToMarkdown()`
6. Background calls `dispatchOutput()` → clipboard or file → notifies popup

## Key Files

| File | Purpose |
|------|---------|
| `manifest.json` | Extension manifest (MV3) — permissions, commands, context menus |
| `src/content/element-picker.js` | ElementPicker class — shadow DOM UI for selective conversion |
| `src/utils/markdown-converter.js` | Turndown-based HTML→Markdown — two instances: full-page (with content filtering) and fragment (minimal filtering for user selections) |
| `src/utils/preferences.js` | Preferences wrapper around `chrome.storage.local` (outputMode, includeMetadata) |
| `src/utils/simple-universal-extractor.js` | Text extraction fallback (guaranteed to return something) |
| `src/utils/site-detector.js` | URL-based site detection (X/Twitter auto-detection) |
| `src/utils/x-extractor.js` | X/Twitter DOM parser — extracts tweets, threads, articles as structured data |
| `src/utils/x-formatter.js` | X/Twitter markdown formatter — structured data → markdown strings |
| `webpack.config.js` | Build config — 3 entry points → `dist/` |
| `PLAN.md` | Project plan, phases, progress tracking |

## Build & Load Extension

1. `npm install`
2. `npm run build`
3. **Firefox:** `about:debugging` → "This Firefox" → "Load Temporary Add-on" → select `dist/manifest.json`
4. **Chrome:** `chrome://extensions` → Enable Developer Mode → "Load unpacked" → select `dist/` folder

## Code Conventions

- **Class-based modules** — Each major component is a class (`BackgroundScript`, `ContentScript`, `PopupController`, `ElementPicker`, etc.)
- **Console logging** — All key functions log with emoji prefixes for traceability (e.g., `🔄`, `✅`, `❌`, `🎯`)
- **Message passing** — Chrome extension messaging API (`chrome.runtime.sendMessage`, `chrome.runtime.onMessage`)
- **Error handling** — Multi-layer fallbacks. Extraction must always return *something*, never throw to the caller.
- **No TypeScript** — Pure JavaScript with ES6+ features, transpiled via Babel.
- **Shadow DOM isolation** — ElementPicker UI uses shadow DOM to avoid CSS conflicts with host pages. Styles are inlined as template strings (no separate CSS files).

## Testing

- **Unit tests:** Jest + jsdom. Located in `tests/unit/`. Mock Chrome APIs via `tests/setup.js`.
- **E2E tests:** Jest + Puppeteer. Located in `tests/e2e/`.
- **Custom matcher:** `toBeValidMarkdown` — checks that output contains markdown-like content.
- **jsdom limitation:** `getBoundingClientRect()` returns 0x0 in jsdom, so ElementPicker tests that depend on element sizing mock `_resolveTarget` directly.

## Browser Compatibility Notes

- Firefox MV3 requires `"background": { "scripts": [...] }` instead of `"service_worker"`.
- Firefox needs `browser_specific_settings.gecko.id` in manifest.
- `chrome.*` APIs work in both browsers (Firefox supports the `chrome` namespace).
- Some Chrome notification APIs may not be available in Firefox — check before using.
- `Cmd+Shift+S` conflicts with Firefox screenshot tool — keyboard shortcut uses `Cmd+Shift+M` instead.
- Context menu `info.targetElementId` is Chrome-only — content script tracks last right-clicked element via `contextmenu` event listener instead (works in both browsers).
- Firefox blocks `data:` URIs in `chrome.downloads.download` ("Access denied") — file save uses Blob URL created in content script via `URL.createObjectURL` instead.
- `navigator.clipboard.writeText` may fail in Firefox MV3 service workers — background script falls back to sending `writeToClipboard` message to content script.

## Dependencies

- **Runtime:** `turndown` (HTML to Markdown conversion)
- **Dev:** Webpack, Babel, Jest, Puppeteer, ESLint

## Important Context

- See `PLAN.md` for the full project plan, known issues, and progress tracking.
- See `ABOUT.md` for the original project vision and goals.
- Firefox is the primary target. Chrome support is desired but secondary.
- Turndown `require()` needs `TurndownImport.default || TurndownImport` due to webpack ES module interop with Turndown's browser bundle.
- `jsdom` is marked as a webpack external — it's only used in the Node.js branch of `markdown-converter.js` for testing, never in the browser.
- **Two Turndown instances** in `markdown-converter.js`: `turndownService` (full-page, aggressive content filtering) and `_fragmentService` (selective mode, only strips universally junk elements). This is intentional — user-selected content should not be filtered.
- **Lazy-loaded images:** `_resolveImageSrc()` handles sites that put placeholder SVGs in `src` and real URLs in `data-src`, `data-lazy-src`, or `srcset`/`data-srcset`.
- **Content filtering patterns** use word-boundary regex for short patterns like `ad` to avoid false positives (e.g., `header` contains `ad` as a substring).
- **Preferences** stored in `chrome.storage.local`. `Preferences.get()` merges stored values with defaults (`outputMode: 'clipboard'`, `includeMetadata: true`). Shared by popup and background via webpack.
- **Output dispatch** — `dispatchOutput()` in background reads preferences and routes to `copyToClipboard()` or `saveAsFile()`. All output paths (full page, selection, context menu, X presets) go through this single dispatcher.
- **X/Twitter Extractor/Formatter separation** — `XExtractor` returns structured data objects (TweetData, ThreadData, ArticleData), `XFormatter` converts them to markdown. This makes extraction testable against mock DOM independently of formatting.
- **X selector resilience** — `_query()` and `_queryAll()` helpers try selectors in priority order: `data-testid` (primary) → ARIA roles (fallback) → structural tags (last resort). When all selectors fail, extraction returns `null` and the content script falls back to generic Turndown conversion.
- **X extraction methods accept URL parameter** — `extractSingleTweet(doc, url)` and `extractThread(doc, url)` take an optional URL to identify the focal tweet. This avoids needing to mock `document.location` in jsdom tests.
- **Popup auto-detection is URL-only** — `SiteDetector.detect()` checks hostname, called directly in popup (no background round-trip). All three X buttons always show; wrong content type gives a clear error message rather than pre-detecting at popup-open time.
