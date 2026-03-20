# CLAUDE.md — Page Content to Markdown

## Project Overview

Browser extension (Firefox primary, Chrome secondary) that converts web page content to clean, structured markdown. Supports full-page conversion, selective element conversion, and site-specific presets (starting with X/Twitter).

**Status:** Phase 2 complete. Full-page and selective conversion working. Element picker, context menus, keyboard shortcut all functional. 123 tests passing.

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
```

- **Popup** (`src/popup/`) — User-facing UI. Two actions: "Copy Page as Markdown" and "Select Elements". Shows selection-active state when picker is running.
- **Background** (`src/background/background.js`) — Service worker. Routes messages, handles clipboard, manages per-tab selection state (`Map`), context menus, keyboard commands.
- **Content Script** (`src/content/content-script.js`) — Injected into web pages. Full-page extraction, element selection mode, text selection conversion.
- **Element Picker** (`src/content/element-picker.js`) — Shadow DOM overlay for hover-highlight, click-to-select, floating toolbar. Bundled with content script via webpack.
- **Utils** (`src/utils/`) — Extraction and conversion modules.

### Message Flow — Full Page
1. Popup sends `"extractAndCopy"` → Background
2. Background sends `"extractContent"` → Content Script
3. Content Script extracts + converts → returns markdown + metadata
4. Background copies to clipboard → notifies popup

### Message Flow — Selective Conversion
1. Popup sends `"startSelectionMode"` → Background → Content Script
2. Content Script activates ElementPicker (user interacts with page)
3. User confirms → Content Script sends `"selectionComplete"` with markdown → Background
4. Background copies to clipboard → shows notification

### Message Flow — Context Menu
- **Text selected:** "Copy selection as Markdown" → `"convertTextSelection"` → Content Script converts selection DOM fragment
- **No text selected:** "Select element for Markdown" → `"startSelectionWithElement"` → Content Script activates picker with right-clicked element pre-selected

## Key Files

| File | Purpose |
|------|---------|
| `manifest.json` | Extension manifest (MV3) — permissions, commands, context menus |
| `src/content/element-picker.js` | ElementPicker class — shadow DOM UI for selective conversion |
| `src/utils/markdown-converter.js` | Turndown-based HTML→Markdown — two instances: full-page (with content filtering) and fragment (minimal filtering for user selections) |
| `src/utils/simple-universal-extractor.js` | Text extraction fallback (guaranteed to return something) |
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
