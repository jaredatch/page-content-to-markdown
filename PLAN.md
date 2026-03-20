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

### What Exists (post-Phase 1)
- Manifest V3 browser extension with popup UI, background service worker, content script
- Polished popup interface (gradient theme, animations, progress/success/error states)
- Two-tier extraction pipeline: Turndown (primary) → SimpleUniversalExtractor (fallback)
- Webpack build system with Babel transpilation
- Jest test suite (5 unit test files, 66 tests passing + E2E setup)
- Firefox and Chrome compatible manifest
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

- [ ] **2.1** Design element selection UX (element picker / highlight on hover)
- [ ] **2.2** Implement content script overlay for element selection mode
- [ ] **2.3** Add "Select elements" option to popup UI alongside "Copy full page"
- [ ] **2.4** Support converting selected element(s) to markdown
- [ ] **2.5** Handle multi-selection (user picks several sections)
- [ ] **2.6** Add keyboard shortcut to toggle selection mode
- [ ] **2.7** Add right-click context menu integration ("Convert selection to markdown")

### Phase 3: Output Options — Clipboard & File
> Give users control over what happens with the converted markdown.

- [ ] **3.1** Ensure clipboard copy works reliably on both browsers
- [ ] **3.2** Add "Save as file" option (downloads `.md` file)
- [ ] **3.3** Add filename generation (from page title + date)
- [ ] **3.4** Add option to include/exclude page metadata header (title, URL, date)
- [ ] **3.5** Update popup UI with output format options

### Phase 4: Site-Specific Presets — X (Twitter)
> Native support for converting X/Twitter content with predefined templates.

- [ ] **4.1** Research X/Twitter DOM structure for tweets, replies, articles
- [ ] **4.2** Build X-specific content extractor:
  - Single tweet → markdown
  - Tweet + replies thread → markdown
  - X article (long-form) → markdown
  - X article + replies → markdown
- [ ] **4.3** Auto-detect when user is on X and show preset options in popup
- [ ] **4.4** Design preset selector UI in popup
- [ ] **4.5** Handle X's dynamic loading (infinite scroll, lazy-loaded replies)
- [ ] **4.6** Test against X's frequent DOM changes — build resilience

### Phase 5: Polish & Release
> Final cleanup and preparation for distribution.

- [ ] **5.1** Comprehensive cross-browser testing (Firefox + Chrome)
- [ ] **5.2** Performance optimization for large pages
- [ ] **5.3** Settings/options page (default behaviors, output preferences)
- [ ] **5.4** Extension store assets (screenshots, description, promo images)
- [ ] **5.5** Prepare for Firefox Add-ons submission
- [ ] **5.6** Prepare for Chrome Web Store submission
- [ ] **5.7** Final test pass on all features
- [ ] **5.8** Clean up README for public release

---

## 5. Progress Log

| Date | Phase | Items Completed | Notes |
|------|-------|----------------|-------|
| 2026-03-20 | — | Initial assessment | Forked project reviewed, PLAN.md and CLAUDE.md created |
| 2026-03-20 | Phase 1 | 1.1–1.8 | Foundation complete. Turndown wired as primary converter, fallback chain working, icons created, Firefox manifest updated, dead code removed, 66 tests passing. Tested manually in Firefox — working. Fixed Turndown ES module interop issue discovered during browser testing. |

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

---

## 7. File Map (Current)

```
src/
  background/background.js     — Service worker, message routing, clipboard
  content/content-script.js    — Page-context script, Turndown primary + fallback chain
  popup/popup.html              — Extension popup markup
  popup/popup.css               — Popup styles (polished, gradient theme)
  popup/popup.js                — Popup controller, button handling, status UI
  utils/
    markdown-converter.js           — Turndown-based HTML→Markdown (PRIMARY converter)
    simple-universal-extractor.js   — Text extraction (FALLBACK)
icons/                          — Placeholder extension icons (16, 32, 48, 128px)
tests/
  unit/                         — 5 test suites (66 tests)
  e2e/                          — Puppeteer-based E2E tests
```
