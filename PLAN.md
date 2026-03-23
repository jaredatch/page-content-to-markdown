# Project Plan: Page Content to Markdown

> Living document tracking the state of the project, what needs to be fixed, what needs to be built, and progress.

---

## 1. Project Vision

A Firefox-first (with Chrome support) browser extension that converts web page content to clean, structured markdown. Key capabilities:

- **Full page conversion** — Convert an entire page to well-formatted markdown
- **Selective conversion** — Let users pick specific elements or sections of a page to convert
- **Clipboard & file output** — Copy to clipboard or save as `.md` file
- **Site-specific presets** — Native support for X (Twitter) with predefined conversion templates (tweet, tweet + replies, article, article + replies)

---

## 2. Current State Assessment

### What Exists (post-Phase 4)
- Manifest V3 browser extension with popup UI, background service worker, content script
- Polished popup interface (gradient theme, animations, progress/success/error states)
- Two-tier extraction pipeline: Turndown (primary) → SimpleUniversalExtractor (fallback)
- Selective element conversion: ElementPicker (shadow DOM), context menus, keyboard shortcut
- Two Turndown instances: full-page (content filtering) and fragment (minimal filtering)
- Lazy-loaded image resolution (data-src, data-lazy-src, srcset fallbacks)
- Output options: clipboard or save-as-file, metadata toggle, user preferences
- X/Twitter site-specific presets: XExtractor + XFormatter with auto-detection, 3 content types (tweet, thread, article)
- Webpack build system with Babel transpilation
- Jest test suite (10 unit test files, 237 tests passing + E2E setup)
- Firefox and Chrome compatible manifest (contextMenus permission, commands section)
- MIT license, README

### Architecture (Current)
```
popup.js  →  background.js  →  content-script.js  →  MarkdownConverter (Turndown)
   UI          messaging          page access        ↘ SimpleUniversalExtractor (fallback)
```

---

## 3. Problems Found

### P1 — Critical

| # | Problem | Details |
|---|---------|---------|
| P1.1 | **Markdown output is low quality** | `SimpleUniversalExtractor` (the active extractor) just dumps visible text with crude formatting. It does NOT preserve headings, links, images, lists, code blocks, tables, or any HTML structure. The extension's core value prop is broken. |
| P1.2 | **Turndown converter is unused** | `markdown-converter.js` wraps the Turndown library with smart content detection (semantic selectors, CMS patterns, framework detection) but is never called. This is the module that would produce real markdown. |
| P1.3 | **Dependencies not installed** | `node_modules/` doesn't exist. Can't build or test until `npm install` runs. |
| P1.4 | **Missing icon files** | `manifest.json` references `icons/icon16.png`, `icon32.png`, `icon48.png`, `icon128.png` — none of these exist. Extension will fail to load. |

### P2 — Significant

| # | Problem | Details |
|---|---------|---------|
| P2.1 | **Code duplication / dead code** | Three extraction modules with overlapping purposes: `SimpleUniversalExtractor`, `UniversalContentExtractor`, and `MarkdownConverter`. Need to consolidate into one coherent pipeline. |
| P2.2 | **Firefox compatibility untested** | MV3 manifest uses `service_worker` for background — Firefox requires `scripts` array in `background` instead. Single manifest won't work for both browsers without adjustment. |
| P2.3 | **Content script runs on all URLs** | `matches: ["<all_urls>"]` injects the content script everywhere, including pages where it serves no purpose. Not a security issue (permissions are minimal) but wasteful. |

### P3 — Minor / Polish

| # | Problem | Details |
|---|---------|---------|
| P3.1 | **No keyboard shortcut defined** | Manifest has no `commands` entry for a global shortcut to trigger conversion. |
| P3.2 | **Popup footer references ChatGPT/Claude** | Tips in `popup.html` mention pasting into AI tools — fine as a tip but feels like marketing copy in the UI. |
| P3.3 | **Test suite status unclear** | README claims "10/13 tests passing" — need to verify after dependency install. |

---

## 4. Phases & Steps

### Phase 1: Foundation — Fix What's Broken
> Get the extension to a working, buildable, testable state with quality markdown output.

- [x] **1.1** Install dependencies (`npm install`), verify build (`npm run build`)
- [x] **1.2** Run existing tests, document what passes/fails
- [x] **1.3** Create or source extension icons (16, 32, 48, 128px)
- [x] **1.4** Fix Firefox manifest compatibility (add `browser_specific_settings`, fix background script declaration)
- [x] **1.5** Consolidate extraction pipeline:
  - Wire `MarkdownConverter` (Turndown-based) as the primary conversion path
  - Keep `SimpleUniversalExtractor` as a fallback for when Turndown fails or produces empty output
  - Remove or archive `UniversalContentExtractor` (dead code)
- [x] **1.6** Verify the consolidated pipeline produces quality markdown:
  - Headings (h1-h6) preserved
  - Links and images converted
  - Lists (ordered/unordered) preserved
  - Code blocks and inline code preserved
  - Tables converted
  - Bold/italic/strikethrough preserved
- [x] **1.7** Update and fix test suite to match new pipeline
- [x] **1.8** Test extension manually in Firefox and Chrome

### Phase 2: Core Features — Selective Conversion
> Let users convert specific parts of a page, not just the whole thing.

- [x] **2.1** Design element selection UX (element picker / highlight on hover)
- [x] **2.2** Implement content script overlay for element selection mode (shadow DOM, floating toolbar)
- [x] **2.3** Add "Select elements" option to popup UI alongside "Copy full page"
- [x] **2.4** Support converting selected element(s) to markdown (`convertHtmlFragment` with separate Turndown instance)
- [x] **2.5** Handle multi-selection (user picks several sections, nested element replacement)
- [x] **2.6** Add keyboard shortcut to toggle selection mode (`Cmd+Shift+M` / `Ctrl+Shift+M`)
- [x] **2.7** Add right-click context menu integration ("Copy selection as Markdown" for text, "Select element for Markdown" with pre-selection for elements)

### Phase 3: Output Options — Clipboard & File
> Give users control over what happens with the converted markdown.

- [x] **3.1** Ensure clipboard copy works reliably on both browsers (background + content script fallback)
- [x] **3.2** Add "Save as file" option (Blob URL download via content script)
- [x] **3.3** Add filename generation (from page title + date, sanitized, truncated to 80 chars)
- [x] **3.4** Add option to include/exclude page metadata header (title, URL, date)
- [x] **3.5** Update popup UI with output format options (segmented toggle, metadata checkbox, dynamic button text)

### Phase 4: Site-Specific Presets — X (Twitter)
> Native support for converting X/Twitter content with predefined templates.

- [x] **4.1** Research X/Twitter DOM structure for tweets, replies, articles
- [x] **4.2** Build X-specific content extractor (XExtractor + XFormatter):
  - Single tweet → structured markdown (author, timestamp, text, media, engagement)
  - Tweet + replies thread → sequential tweet blocks
  - X article (long-form) → title, author, body converted via Turndown fragment
- [x] **4.3** Auto-detect when user is on X and show preset options in popup (SiteDetector utility)
- [x] **4.4** Design preset selector UI in popup (compact button grid with Copy/Save text toggle)
- [x] **4.5** Tiered selector strategy for resilience (data-testid → ARIA roles → structural selectors)
- [x] **4.6** Fallback to generic Turndown conversion when X-specific extraction fails

### Phase 5: Polish & Release
> Final cleanup and preparation for distribution.

- [ ] **5.1** Comprehensive cross-browser testing (Firefox + Chrome)
- [x] **5.2** Performance optimization for large pages
- [x] **5.3** Settings/options page (default behaviors, output preferences)
- [ ] **5.4** Extension store assets (screenshots, description, promo images)
- [ ] **5.5** Prepare for Firefox Add-ons submission
- [ ] **5.6** Prepare for Chrome Web Store submission
- [ ] **5.7** Final test pass on all features
- [x] **5.8** Clean up README for public release

---

## 5. Progress Log

| Date | Phase | Items Completed | Notes |
|------|-------|----------------|-------|
| 2026-03-20 | — | Initial assessment | Forked project reviewed, PLAN.md and CLAUDE.md created |
| 2026-03-20 | Phase 1 | 1.1–1.8 | Foundation complete. Turndown wired as primary converter, fallback chain working, icons created, Firefox manifest updated, dead code removed, 66 tests passing. Tested manually in Firefox — working. Fixed Turndown ES module interop issue discovered during browser testing. |
| 2026-03-20 | Phase 2 | 2.1–2.7 | Selective conversion complete. ElementPicker with shadow DOM UI, hover highlights, click-to-select with numbered badges, floating toolbar. Two context menu items (text selection + element selection with pre-select). Keyboard shortcut (Cmd+Shift+M). Separate Turndown instance for fragments (no content filtering on user selections). Fixed lazy-loaded image resolution (data-src/srcset fallback). Fixed false-positive pattern matching ("ad" in "header"). 123 tests passing. |
| 2026-03-20 | Phase 3 | 3.1–3.5 | Output options complete. Preferences module (chrome.storage.local). Popup UI: metadata checkbox, output mode segmented toggle (Copy/Save), dynamic button text. Background: dispatchOutput() routes to clipboard or file, generateFilename() with sanitization/truncation, clipboard fallback via content script. Content script: conditional metadata header, writeToClipboard handler, saveAsFile handler (Blob URL + `<a>` click). Firefox data URI blocked in chrome.downloads — switched to Blob approach. 156 tests passing. |
| 2026-03-23 | Phase 4 | 4.1–4.6 | X/Twitter presets complete. Extractor/Formatter separation: XExtractor (DOM parsing with tiered selectors) + XFormatter (structured markdown output). SiteDetector for URL-based auto-detection. Popup shows X preset buttons (Copy/Save Tweet, Thread, Article) when on x.com/twitter.com. Content types: single tweet, thread, article. Structured format with author heading, timestamp, media, engagement stats. Falls back to generic Turndown on failure. Tweet and thread presets tested and working well. Article preset functional but needs formatting polish (deferred — requires Chrome extension DOM inspection). 237 tests passing (10 suites). |
| 2026-03-23 | Phase 5 | 5.2 | Performance optimization complete. DOM-direct conversion path (convertFromDOM) bypasses serialize→reparse round-trip by passing live DOM nodes to Turndown. Optimized removeNonContent filter (single combined regex vs array iteration). Optimized findLargestTextBlock (top-level + second-level selectors only). Consolidated cleanupMarkdown regex chain. Size guards: 50K element limit in content script, 5MB HTML truncation in converter. Escalating progress messages in popup for large pages. 245 tests passing (10 suites). |
| 2026-03-23 | Phase 5 | 5.3 | Settings/options page complete. Dedicated options page (options.html) with auto-save. Preferences expanded with 4 formatting options: heading style (atx/setext), bullet list marker (-/*), code block style (fenced/indented), link style (inlined/referenced). Options flow through background → content script → MarkdownConverter.applyFormattingOptions(). Popup header has gear icon to open options page. manifest.json has options_ui. cleanupMarkdown respects configured bullet marker and preserves indented code blocks. 255 tests passing (10 suites). |

---

## 6. Key Decisions & Open Questions

### Decisions Made
- Firefox is the primary target browser; Chrome is secondary but supported
- Turndown library will be the primary markdown conversion engine
- `SimpleUniversalExtractor` will serve as fallback, not primary

### Open Questions
- Should we support other browsers beyond Firefox and Chrome (Edge, Safari)?
- What level of markdown fidelity do we target? (CommonMark? GFM with tables/strikethrough?)
- For X presets, should we handle authenticated vs. unauthenticated views?
- Do we want a configurable options/settings page from the start, or defer to Phase 5?
- Should the extension support converting pages to formats beyond markdown (e.g., plain text, HTML snippet)?

### Future Ideas
- **X Article extraction polish** — Article extraction works but needs formatting/conversion improvement. Requires inspecting real X article DOM structure (use `claude --chrome` with Chrome extension for live DOM inspection). Single tweet and thread presets are solid; article is the remaining rough edge.
- **Video extraction via Downie integration** — When converting posts/articles that contain video, integrate with [Downie](https://software.charliemonroe.net/downie/) (macOS video downloader) to extract and save the video alongside the markdown. Currently X videos render as `[Video](thumbnail-url)` pointing at the poster/thumbnail image, not the actual video. Could pass the tweet/page URL to Downie via its URL scheme (`downie://`) or AppleScript to trigger a download.

---

## 7. File Map (Current)

```
src/
  background/background.js     — Service worker, message routing, clipboard (with fallback), output dispatch, file save, per-tab selection state, context menus, commands, X content routing
  content/content-script.js    — Page-context script, Turndown primary + fallback chain, selection mode, text selection conversion, clipboard fallback, file save (Blob URL), X extraction handler
  content/element-picker.js    — ElementPicker class (shadow DOM UI, hover/select overlays, floating toolbar)
  popup/popup.html              — Extension popup markup (action buttons, options section, X presets section, selection-active state)
  popup/popup.css               — Popup styles (polished, gradient theme, options/toggle controls, X preset buttons)
  popup/popup.js                — Popup controller, button handling, preferences loading, site detection, X preset handlers, selection state check, status UI
  utils/
    markdown-converter.js           — Turndown-based HTML→Markdown (two instances: full-page + fragment)
    preferences.js                  — Preferences wrapper (chrome.storage.local, defaults + merge)
    simple-universal-extractor.js   — Text extraction (FALLBACK)
    site-detector.js                — URL-based site detection for auto-showing presets
    x-extractor.js                  — X/Twitter DOM parser (tweets, threads, articles → structured data)
    x-formatter.js                  — X/Twitter markdown formatter (structured data → markdown)
icons/                          — Placeholder extension icons (16, 32, 48, 128px)
tests/
  unit/                         — 10 test suites (237 tests)
  e2e/                          — Puppeteer-based E2E tests
```
