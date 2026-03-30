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

- [ ] **5.1** ~~Comprehensive cross-browser testing~~ → Moved to Phase 6 (Testing)
- [x] **5.2** Performance optimization for large pages
- [x] **5.3** Settings/options page (default behaviors, output preferences)
- [ ] **5.4** Extension store assets (screenshots, description, promo images)
- [ ] **5.5** Prepare for Firefox Add-ons submission
- [ ] **5.6** Prepare for Chrome Web Store submission
- [ ] **5.7** ~~Final test pass on all features~~ → Moved to Phase 6 (Testing)
- [x] **5.8** Clean up README for public release

### Phase 6: Testing — Comprehensive Cross-Browser Test Suite
> Build a reliable, multi-layer test suite covering unit, integration, and end-to-end testing across both Firefox and Chrome.

#### Current Testing State (as of 2026-03-30)

| Layer | Status | Details |
|-------|--------|---------|
| **Unit tests** | ✅ EXISTS — needs audit | 10 suites, 255 tests. Good coverage of core logic (background, content script, converter, extractors, formatters, preferences, site-detector). **Gaps:** popup.js (0 tests), options.js (0 tests). Some Chrome API mocks are partial (notifications, commands). |
| **Integration tests** | ❌ DOES NOT EXIST | No tests verify message flows between components (popup → background → content script → response). Each component tested in isolation only. |
| **E2E tests (Chrome)** | ⚠️ EXISTS — essentially scaffolding | Puppeteer setup exists but tests don't exercise the real extension. Content extraction test falls back to `page.content()` instead of using content script. Uses data: URLs. Limited popup assertions. |
| **E2E tests (Firefox)** | ❌ DOES NOT EXIST | No Firefox e2e testing at all. Firefox is the primary target browser. |
| **Cross-browser framework** | ❌ DOES NOT EXIST | No Selenium, no shared test runner for both browsers. |
| **web-ext / Firefox tooling** | ❌ DOES NOT EXIST | No `web-ext lint` or Firefox-specific validation. |
| **CI pipeline** | ❌ DOES NOT EXIST | No automated test runs on push/PR. |

#### Existing Test Files (Reference)

```
tests/
  setup.js                              — Global Chrome API mocks, custom matchers
  unit/
    background.test.js                  — 706 lines — service worker, messaging, clipboard, context menus, X routing
    content-script.test.js              — 669 lines — page conversion, fallback chains, metadata, selection, X extraction
    markdown-converter.test.js          — 418 lines — Turndown conversion, images, links, code, fragments, formatting
    element-picker.test.js              — 286 lines — shadow DOM, selection lifecycle, keyboard, toolbar
    simple-universal-extractor.test.js  — 274 lines — 20 fallback scenarios, "100% success guarantee"
    x-extractor.test.js                 — 477 lines — tweets, threads, articles, selectors, fallbacks
    x-formatter.test.js                 — 277 lines — markdown formatting, engagement metrics, media, quotes
    preferences.test.js                 — 107 lines — storage, defaults, merge
    site-detector.test.js               —  51 lines — URL detection
    real-world-sites.test.js            — 325 lines — React/SPA, frameworks, e-commerce, news layouts
  e2e/
    setup.js                            — Puppeteer browser init
    extension.test.js                   — Scaffolding only (see assessment above)
```

#### Phase 6.1: Unit Test Audit & Gap Fill
> Ensure unit test foundation is solid before building higher layers on top of it.

**What we have:** 10 suites, 255 tests covering core logic. Good patterns (async, listener capture, fallback chains, real Turndown integration).

**What needs work:**

- [ ] **6.1.1** Audit existing 10 test suites for:
  - Fragile tests (timing-dependent, order-dependent, over-mocked)
  - Missing edge cases (error paths, boundary conditions)
  - Stale tests that don't match current source code
  - Tests that test implementation details rather than behavior
  - Document findings as checklist; fix issues found
- [ ] **6.1.2** Add unit tests for `popup.js` (PopupController) — **currently 0 tests**
  - Constructor / DOM element binding
  - `checkCurrentTab()` — valid tab, no tab, restricted URL
  - `isRestrictedUrl()` — chrome://, moz-extension://, about:, file://, normal URLs
  - `handleExtractClick()` — success path, failure path, disabled state
  - `handleSelectClick()` — success, failure
  - `handleCancelSelectClick()` — sends cancel message, restores UI
  - `loadPreferences()` — sets toggle states, metadata checkbox
  - `detectSitePresets()` / `showXPresets()` — X URL shows presets, non-X hides
  - `handleXExtract()` — success, failure, progress timers
  - `updateButtonText()` — clipboard vs file mode text changes
  - `showSelectionActive()` / `hideSelectionActive()` — UI state toggling
  - `showProgress()` / `hideProgress()` / `showSuccess()` / `showError()` — status display
  - `_startProgressTimers()` / `_clearProgressTimers()` — timer lifecycle
  - Keyboard shortcut (Ctrl/Cmd+Enter triggers extract)
- [ ] **6.1.3** Add unit tests for `options.js` (OptionsController) — **currently 0 tests**
  - Constructor / DOM element binding
  - `loadPreferences()` — populates form from stored prefs
  - Auto-save on each setting change (output mode, metadata, heading, bullet, code, link)
  - `resetToDefaults()` — resets storage, reloads UI, shows status
  - `updateHint()` — correct preview text for each formatting option (atx vs setext, fenced vs indented, etc.)
  - `showStatus()` — shows message, auto-hides after timeout
- [ ] **6.1.4** Improve Chrome API mocks in `tests/setup.js`:
  - `chrome.notifications.create` — support callback argument
  - `chrome.runtime.openOptionsPage` — add mock (used by popup settings button)
  - `chrome.runtime.lastError` — add mock support for error simulation
  - Verify all mocks match actual Chrome API signatures
- [ ] **6.1.5** Add coverage reporting and establish baseline:
  - Run `npm test -- --coverage` and review per-file coverage
  - Identify any source files below 70% line coverage
  - Add coverage thresholds to `jest.config.js` (warn, not fail — establish baseline first)

#### Phase 6.2: Integration Tests
> Test how components work together via message passing, without a real browser.

**What we have:** Nothing. Each component is tested in isolation with mocked boundaries.

**What we need:** Tests that wire multiple real components together and verify message flows end-to-end through the mock Chrome API layer.

- [ ] **6.2.1** Create integration test infrastructure:
  - New directory: `tests/integration/`
  - Shared helper: `message-bus.js` — simulates Chrome message passing between components (captures `onMessage` listeners, routes `sendMessage` calls to the correct listener, supports `sendResponse` callbacks)
  - Shared helper: `chrome-storage-mock.js` — in-memory `chrome.storage.local` that persists across components within a test (current mock resets per-component)
  - Separate Jest config or test match pattern: `tests/integration/**/*.test.js`
- [ ] **6.2.2** Full-page conversion flow:
  - Popup sends `"extractAndCopy"` → Background reads preferences → sends `"extractContent"` to content script → content script returns markdown → Background copies to clipboard → responds to popup with success
  - Verify: correct options passed at each hop, markdown content arrives at clipboard, popup gets success response
  - Variant: output mode = file → verify `"saveAsFile"` message sent instead of clipboard
  - Variant: clipboard fails → verify fallback to content script `"writeToClipboard"`
- [ ] **6.2.3** Selection mode lifecycle:
  - Popup sends `"startSelectionMode"` → Background tracks state → content script activates picker
  - User confirms → content script sends `"selectionComplete"` → Background dispatches output → notification shown
  - Verify: per-tab state tracked correctly, cleanup on tab close, cancel restores state
- [ ] **6.2.4** X/Twitter extraction flow:
  - Popup sends `"extractXContent"` with contentType → Background → content script creates XExtractor + XFormatter → returns markdown
  - Verify: correct contentType forwarded, preferences applied, fallback to generic on XExtractor failure
- [ ] **6.2.5** Context menu flows:
  - Text selected: context menu → `"convertTextSelection"` → content script converts selection
  - No text: context menu → `"startSelectionWithElement"` → content script activates picker with pre-selected element
- [ ] **6.2.6** Preferences flow:
  - Set formatting preferences → trigger conversion → verify `applyFormattingOptions()` called with correct values on MarkdownConverter
  - Change output mode → trigger conversion → verify output routed to correct destination
- [ ] **6.2.7** Error propagation:
  - Content script throws → Background catches → Popup receives error response
  - Background can't reach content script → Popup gets meaningful error
  - Verify no unhandled promise rejections in any error path

#### Phase 6.3: Selenium E2E — Chrome
> Real extension loaded in real Chrome, testing actual user workflows.

**What we have:** Puppeteer scaffolding (will be replaced by Selenium for cross-browser consistency).

**What we need:** Selenium WebDriver tests that load the built extension into Chrome and verify real user interactions.

- [ ] **6.3.1** Install dependencies and create infrastructure:
  - `npm install --save-dev selenium-webdriver` (Selenium 4.x includes selenium-manager for auto driver management)
  - Create `tests/e2e-selenium/` directory (keep old `tests/e2e/` until migration complete)
  - Create `tests/e2e-selenium/helpers/driver-factory.js` — browser-agnostic driver creation:
    - `createDriver('chrome')` → ChromeDriver with `--load-extension=dist/`
    - `createDriver('firefox')` → GeckoDriver with temporary addon install (Phase 6.4)
    - Handles headless/headed mode via env var
  - Create `tests/e2e-selenium/helpers/extension-pages.js` — resolves popup/options URLs per browser:
    - Chrome: `chrome-extension://<id>/popup.html`
    - Firefox: `moz-extension://<uuid>/popup.html` (uuid from manifest `gecko.id`)
  - Create `tests/e2e-selenium/helpers/fixture-server.js` — local HTTP server serving test HTML pages from `tests/e2e-selenium/fixtures/`
  - Create `tests/e2e-selenium/fixtures/` — static HTML test pages:
    - `simple-article.html` — headings, paragraphs, links, images, lists, code
    - `complex-page.html` — tables, nested lists, multiple sections, lazy images
    - `large-page.html` — 1000+ elements (tests size guards)
    - `mock-tweet.html` — mimics X/Twitter DOM structure (data-testid attributes)
  - Jest config: `jest.e2e-selenium.config.js` with long timeout (60s)
- [ ] **6.3.2** Core Chrome e2e tests — full page conversion:
  - Load extension → navigate to fixture page → open popup → click "Copy Page as Markdown" → verify clipboard contains expected markdown
  - Variant: "Save Page as Markdown" → verify file download triggered
  - Variant: metadata toggle off → verify no metadata header in output
  - Test with `simple-article.html`, `complex-page.html`, `large-page.html`
- [ ] **6.3.3** Chrome e2e — element picker:
  - Navigate to fixture → open popup → click "Select Elements" → popup closes → hover element (verify highlight) → click to select → confirm in toolbar → verify output
- [ ] **6.3.4** Chrome e2e — options page:
  - Open options page → change each setting → verify saved → reopen → verify persisted
  - Reset to defaults → verify all settings restored
  - Change formatting option → convert page → verify formatting applied in output
- [ ] **6.3.5** Chrome e2e — context menu:
  - Select text on page → right-click → "Copy selection as Markdown" → verify clipboard
  - Right-click element (no selection) → "Select element for Markdown" → verify picker activates with element pre-selected
- [ ] **6.3.6** Chrome e2e — X/Twitter presets:
  - Navigate to `mock-tweet.html` (fixture mimicking X DOM) → open popup → verify X preset buttons visible → click "Copy Tweet" → verify structured markdown output
  - Test fallback: navigate to malformed mock → verify falls back to generic conversion
- [ ] **6.3.7** Chrome e2e — keyboard shortcuts:
  - Trigger `Cmd+Shift+M` / `Ctrl+Shift+M` → verify selection mode activates
  - In popup: `Cmd+Enter` / `Ctrl+Enter` → verify extraction triggers
- [ ] **6.3.8** npm scripts:
  - `npm run test:e2e:chrome` → runs Selenium Chrome suite
  - `npm run build && npm run test:e2e:chrome` → full build + test
- [ ] **6.3.9** Remove old Puppeteer e2e tests (`tests/e2e/`) and `jest.e2e.config.js` once Selenium suite covers equivalent + more. Remove `puppeteer` dev dependency.

#### Phase 6.4: Selenium E2E — Firefox & Cross-Browser
> Extend Selenium tests to Firefox. Single test suite, two browsers.

**What we have:** Nothing. Firefox is the primary target but has zero automated e2e testing.

**What we need:** Firefox driver support, XPI packaging, shared test runner.

- [ ] **6.4.1** Firefox driver setup:
  - Install `web-ext` as dev dependency (`npm install --save-dev web-ext`)
  - Add npm script: `npm run build:xpi` → `web-ext build --source-dir=dist/ --artifacts-dir=build/` (produces `.xpi` for Firefox)
  - Update `driver-factory.js`: `createDriver('firefox')` → launch Firefox → `driver.installAddon(xpiPath, true)` for temporary addon
  - Handle extension UUID resolution (fixed `gecko.id` in manifest → predictable `moz-extension://` UUID)
- [ ] **6.4.2** Add `web-ext lint` validation:
  - `npm run lint:extension` → `web-ext lint --source-dir=dist/`
  - Validates manifest, CSP, deprecated APIs, Firefox-specific issues
  - Fast, low-effort, high-value — catches Firefox problems before e2e
- [ ] **6.4.3** Run existing Chrome e2e tests on Firefox:
  - Tests from Phase 6.3 should be browser-agnostic (using `driver-factory.js`)
  - Run full suite with `BROWSER=firefox` env var
  - Identify and fix Firefox-specific failures:
    - Clipboard behavior differences (navigator.clipboard fallback)
    - File save via Blob URL (already handled in source, verify in tests)
    - Any `chrome.*` API differences
  - Document any tests that must be browser-conditional
- [ ] **6.4.4** Firefox-specific e2e tests (if needed):
  - Clipboard fallback path: verify content script `writeToClipboard` message works when `navigator.clipboard.writeText` fails in service worker
  - File save: verify Blob URL approach works (vs Chrome's `chrome.downloads.download`)
  - Keyboard shortcut: verify `Cmd+Shift+M` doesn't conflict with Firefox screenshot tool
- [ ] **6.4.5** Cross-browser npm scripts:
  - `npm run test:e2e:firefox` → Selenium Firefox suite
  - `npm run test:e2e` → runs Chrome + Firefox sequentially
  - `npm run test:all` → unit + integration + e2e (both browsers)
- [ ] **6.4.6** Cross-browser test matrix documentation:
  - Document which tests are shared vs browser-specific
  - Document known browser differences and how they're handled in tests

#### Phase 6.5: CI Pipeline & Final Polish
> Automate everything so tests run on every push/PR.

- [ ] **6.5.1** GitHub Actions workflow (`.github/workflows/test.yml`):
  - On push/PR to `master`
  - Steps: install → lint (`npm run lint` + `web-ext lint`) → unit tests → integration tests → build → e2e Chrome → e2e Firefox
  - Use `ubuntu-latest` with pre-installed Chrome + Firefox
  - Cache `node_modules/` for speed
- [ ] **6.5.2** Coverage enforcement:
  - Add coverage thresholds to Jest config based on baseline from Phase 6.1.5
  - CI fails if coverage drops below threshold
- [ ] **6.5.3** Test documentation:
  - Update README testing section with all test commands
  - Document test architecture in CLAUDE.md (test layers, when to use each)
  - Document how to run tests locally (prerequisites, env vars)
- [ ] **6.5.4** Final audit:
  - Run full `npm run test:all` — all layers, both browsers
  - Review and close any remaining test gaps
  - Update PLAN.md progress log

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
| 2026-03-30 | Phase 6 | Planning | Testing improvement plan created. Audited existing test infrastructure: 10 unit test suites (255 tests), scaffolding-only Puppeteer e2e tests, no integration tests, no Firefox e2e, no cross-browser framework. Planned 5 sub-phases: unit audit & gap fill (6.1), integration tests (6.2), Selenium Chrome e2e (6.3), Firefox e2e & cross-browser (6.4), CI pipeline (6.5). Chose Selenium WebDriver as single cross-browser e2e framework (replaces Puppeteer). |

---

## 6. Key Decisions & Open Questions

### Decisions Made
- Firefox is the primary target browser; Chrome is secondary but supported
- Turndown library will be the primary markdown conversion engine
- `SimpleUniversalExtractor` will serve as fallback, not primary
- Settings/options page built in Phase 5.3 (was open question)
- **Selenium WebDriver** chosen as the cross-browser e2e framework — single API for Chrome + Firefox, mature extension-loading support for both, replaces Puppeteer
- **Three-layer test architecture:** unit (Jest+jsdom) → integration (Jest, wired components) → e2e (Selenium, real browsers)
- **web-ext** adopted for Firefox XPI packaging and manifest linting

### Open Questions
- Should we support other browsers beyond Firefox and Chrome (Edge, Safari)?
- What level of markdown fidelity do we target? (CommonMark? GFM with tables/strikethrough?)
- For X presets, should we handle authenticated vs. unauthenticated views?
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
  setup.js                      — Global Chrome API mocks, custom matchers
  unit/                         — 10 test suites (255 tests) — Jest + jsdom
  integration/                  — (Planned: Phase 6.2) Message flow tests — Jest
  e2e/                          — Puppeteer-based E2E tests (scaffolding, to be replaced)
  e2e-selenium/                 — (Planned: Phase 6.3–6.4) Selenium cross-browser E2E
    helpers/                    —   Driver factory, extension page resolver, fixture server
    fixtures/                   —   Static HTML test pages (article, tweet mock, etc.)
```
