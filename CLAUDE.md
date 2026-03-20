# CLAUDE.md — Page Content to Markdown

## Project Overview

Browser extension (Firefox primary, Chrome secondary) that converts web page content to clean, structured markdown. Supports full-page conversion, selective element conversion, and site-specific presets (starting with X/Twitter).

**Status:** Phase 1 complete. Core conversion working (Turndown primary, text fallback). Builds and loads in Firefox + Chrome.

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
```

- **Popup** (`src/popup/`) — User-facing UI. Sends messages to background script.
- **Background** (`src/background/background.js`) — Service worker. Routes messages between popup and content script. Handles clipboard operations.
- **Content Script** (`src/content/content-script.js`) — Injected into web pages. Accesses DOM, runs extraction, returns markdown.
- **Utils** (`src/utils/`) — Extraction and conversion modules.

### Message Flow
1. Popup sends `"extractAndCopy"` → Background
2. Background sends `"extractContent"` → Content Script
3. Content Script extracts + converts → returns markdown + metadata
4. Background copies to clipboard → notifies popup

## Key Files

| File | Purpose |
|------|---------|
| `manifest.json` | Extension manifest (MV3) |
| `src/utils/markdown-converter.js` | Turndown-based HTML→Markdown (primary converter) |
| `src/utils/simple-universal-extractor.js` | Text extraction fallback (guaranteed to return something) |
| `webpack.config.js` | Build config — 3 entry points → `dist/` |
| `PLAN.md` | Project plan, phases, progress tracking |

## Build & Load Extension

1. `npm install`
2. `npm run build`
3. **Firefox:** `about:debugging` → "This Firefox" → "Load Temporary Add-on" → select `dist/manifest.json`
4. **Chrome:** `chrome://extensions` → Enable Developer Mode → "Load unpacked" → select `dist/` folder

## Code Conventions

- **Class-based modules** — Each major component is a class (`BackgroundScript`, `ContentScript`, `PopupController`, etc.)
- **Console logging** — All key functions log with emoji prefixes for traceability (e.g., `🔄`, `✅`, `❌`)
- **Message passing** — Chrome extension messaging API (`chrome.runtime.sendMessage`, `chrome.runtime.onMessage`)
- **Error handling** — Multi-layer fallbacks. Extraction must always return *something*, never throw to the caller.
- **No TypeScript** — Pure JavaScript with ES6+ features, transpiled via Babel.

## Testing

- **Unit tests:** Jest + jsdom. Located in `tests/unit/`. Mock Chrome APIs via `tests/setup.js`.
- **E2E tests:** Jest + Puppeteer. Located in `tests/e2e/`.
- **Custom matcher:** `toBeValidMarkdown` — checks that output contains markdown-like content.

## Browser Compatibility Notes

- Firefox MV3 requires `"background": { "scripts": [...] }` instead of `"service_worker"`.
- Firefox needs `browser_specific_settings.gecko.id` in manifest.
- `chrome.*` APIs work in both browsers (Firefox supports the `chrome` namespace).
- Some Chrome notification APIs may not be available in Firefox — check before using.

## Dependencies

- **Runtime:** `turndown` (HTML to Markdown conversion)
- **Dev:** Webpack, Babel, Jest, Puppeteer, ESLint

## Important Context

- See `PLAN.md` for the full project plan, known issues, and progress tracking.
- See `ABOUT.md` for the original project vision and goals.
- Firefox is the primary target. Chrome support is desired but secondary.
- Turndown `require()` needs `TurndownImport.default || TurndownImport` due to webpack ES module interop with Turndown's browser bundle.
- `jsdom` is marked as a webpack external — it's only used in the Node.js branch of `markdown-converter.js` for testing, never in the browser.
