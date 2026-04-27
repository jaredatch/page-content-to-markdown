# CLAUDE.md — Page Content to Markdown

## Project Overview

Browser extension (Firefox primary, Chrome secondary) that converts web page content to clean, structured markdown. Provides **general actions** (full-page conversion, selective element conversion) that work on any page, and **site actions** for supported sites (X/Twitter, Claude, Grok) powered by per-site **site modules** in `src/sites/`.

## Terminology

These terms are used consistently across docs, code comments, UI copy, and conversation. Stick to them.

| Concept | User-facing | Code / docs |
|---|---|---|
| A site we specifically support (X, Claude, Grok) | "supported site" / "site support" | `site module` (the unit in `src/sites/{id}/`) |
| What the user does (top-level operation) | `action` | — |
| Actions that work on any page | `general actions` (Page content, select elements on page, text-selection context menu) | — |
| Actions enabled by a site module | `site actions` (e.g. picking "Tweet" or "Conversation" in the popup, then Copy/Save) | — |
| The thing being extracted | proper noun in UI (Tweet, Thread, Conversation, Page) | `contentType` (matches `site.contentTypes`) |
| Site module internals | — | `Extractor` class (DOM → data), `Formatter` class (data → markdown) |

**Don't use:** "preset", "generic" (use "general"), "plugin", "integration", "connector", "adapter" — each has wrong connotations (third-party extensibility, network/API integration, dismissive, etc.). "Extract" is fine as the internal verb (`extractContent`, `extractSiteContent`); "save" / "copy" is the user-facing verb.

**Status:** Phases 1–4 complete, Phase 5.2–5.3 complete, Phase 5.4–5.6 partially complete (store text drafted, screenshots/submission remaining), Phase 6.1–6.2, 6.5 complete. Phase 6.3–6.4 (Selenium e2e) planned. General actions (full-page conversion, selective element conversion), output options (clipboard/file), site actions via site module registry (X/Twitter, Claude, Grok), settings/options page with output preferences (image handling, link handling, tracking-param strip, page-info format incl. YAML frontmatter, auto-close popup), formatting preferences, customizable filename templates (token-based, Moment-style date formatting), a content-first popup picker (Page content + supported-site content types as rows; Copy / Save buttons in the footer; remembers last-picked content type per site), and a redesigned on-page selection mode (sticky banner with Default Copy/Save toggle, phantom capture layer that fully suppresses host-page `:hover` and link/text interactions, floating action bar with Clear / secondary / primary tiers + X exit; selection persists across actions so Copy and Save can both fire on the same set). GFM output (tables, strikethrough, task lists) via `turndown-plugin-gfm`. 581 unit tests passing (18 suites) + 30 integration tests (6 suites). CI via GitHub Actions on every push/PR.

## Quick Reference

```bash
npm install          # Install dependencies (required before anything else)
npm run build        # Production build → dist/
npm run build:dev    # Dev build with watch mode
npm run test         # Run unit tests
npm run test:integration  # Run integration tests
npm run test:all     # Unit tests (with coverage) + integration tests
npm run test:watch   # Unit tests in watch mode
npm run test:e2e     # End-to-end tests (requires Puppeteer)
npm run lint         # ESLint
npm run status       # Side-by-side git status of public + private/ repos
```

## Architecture

```
Popup (UI) → Background (service worker) → Content Script (page context) → Extractor/Converter
                                                                         ↘ ElementPicker (selection mode)
                                                                         ↘ SiteRegistry → site modules (X/Twitter, Claude, Grok)
```

- **Popup** (`src/popup/`) — Content-first picker UI. Body shows rows for "Page content" and (on supported sites) the site's content types under an "Available on …" divider; user selects one. Footer has Copy and Save buttons — the user's preferred default (`outputMode` pref) is rendered as the filled-black primary; the other stays as a neutral outline button. Header has the page-info checkbox and a gear that opens the options page. A tertiary "or select elements on page" link sits below the buttons. Restricted URLs render the same layout with everything dimmed plus a sticky error banner. When the picker is running on the tab, the body is replaced with a focused "Selection mode is active" card. Last-picked content type per site is persisted to `prefs.lastUsedPerSite` and restored on next open. Honors `autoClosePopup` pref to decide whether to close after a successful action.
- **Background** (`src/background/background.js`) — Service worker. Routes messages, handles clipboard (with content script fallback), output dispatch (clipboard or file), manages per-tab selection state (`Map`), context menus, keyboard commands.
- **Content Script** (`src/content/content-script.js`) — Injected into web pages. Full-page extraction, element selection mode, text selection conversion, clipboard fallback, file save via Blob URL.
- **Element Picker** (`src/content/element-picker.js`) — Shadow DOM UI for selection mode. Three pieces: a sticky banner (mode indicator + Default Copy/Save segmented control), a phantom capture layer (transparent full-viewport div, `pointer-events: auto`, sits above page content but below banner / action bar — mouse events land here so `:hover` never fires on host-page elements; uses `document.elementsFromPoint` filtered by shadow host to find what's underneath), hover/selected overlays painted over the page (no host-DOM mutation), and a floating action bar (Clear · secondary · primary white · X exit). Bundled with content script via webpack.
- **Utils** (`src/utils/`) — Extraction, conversion, preferences, and site registry.
- **Site Registry** (`src/utils/site-registry.js`) — Central registry for site-specific extractors. Handles detection, lookup, and dispatch to site modules.
- **Site Modules** (`src/sites/`) — Per-site extraction modules. Each exports a registration object with matchers, content types, extractor, and formatter. Currently: X/Twitter (`src/sites/x/`), Claude (`src/sites/claude/`), Grok (`src/sites/grok/`).

### Message Flow — Full Page
1. Popup sends `"extractAndCopy"` (with explicit `mode: 'clipboard' | 'file'` from the clicked button) → Background
2. Background reads preferences, sends `"extractContent"` with `options` (includeMetadata, metadataFormat, formatting options, linkMode, imageMode, stripTrackingParams) → Content Script
3. Content Script applies options to converter, extracts + converts (conditionally adds metadata header in chosen format) → returns markdown + metadata
4. Background calls `dispatchOutput(markdown, metadata, mode)` → routes to clipboard or file (popup-supplied `mode` overrides the `outputMode` pref) → notifies popup

### Message Flow — Selective Conversion
1. Popup sends `"startSelectionMode"` → Background → Content Script
2. Content Script reads `outputMode` from storage and activates ElementPicker with it as `initialOutputMode` (primes which side of the action bar is the white "primary" button — session-local, no writeback)
3. User clicks Copy or Save (or presses Enter / C / S) → ElementPicker invokes `onCopy` or `onSave` → Content Script converts the selection and sends `"selectionComplete"` with `{ markdown, metadata, mode: 'clipboard' | 'file' }` → Background
4. Background calls `dispatchOutput(markdown, metadata, mode)` — the `mode` field overrides the `outputMode` pref so each click is explicit per-action (mirrors the popup pattern)
5. Picker stays active after a successful action — selection persists, button flashes green, user can fire the other action on the same set or refine the selection. X icon / Esc / popup Cancel hard-exits

### Message Flow — File Save
1. Background sends `"saveAsFile"` with markdown + filename → Content Script
2. Content Script creates Blob URL via `URL.createObjectURL`, triggers download via `<a>` click
3. Content Script responds with success/failure

### Message Flow — Context Menu
- **Text selected:** "Copy selection as Markdown" → `"convertTextSelection"` → Content Script converts selection DOM fragment
- **No text selected:** "Select element for Markdown" → `"startSelectionWithElement"` → Content Script activates picker with right-clicked element pre-selected

### Message Flow — Site Action
1. Popup detects site via `SiteRegistry.detect(url)`, dynamically renders site rows under the "Available on …" divider using each content type's label and SVG icon
2. User picks a site row, then clicks Copy or Save → Popup sends `"extractSiteContent"` with `siteId`, `contentType`, and `mode` ('clipboard' | 'file' from the clicked button) → Background
3. Background reads preferences, sends `"extractSiteContent"` with siteId + contentType + options → Content Script
4. Content Script uses `SiteRegistry.getById(siteId)` to get the site module, calls `extract()` and `format()` → returns markdown
5. On failure, Content Script falls back to the general `convertPageToMarkdown()` path
6. Background calls `dispatchOutput(markdown, metadata, mode)` → clipboard or file (popup-supplied `mode` overrides pref) → notifies popup

## Key Files

| File | Purpose |
|------|---------|
| `manifest.json` | Extension manifest (MV3) — permissions, commands, context menus |
| `src/content/element-picker.js` | ElementPicker class — shadow DOM UI for selection mode (banner + phantom capture layer + hover/selected overlays + action bar with dual Copy/Save tier hierarchy) |
| `src/utils/markdown-converter.js` | Turndown-based HTML→Markdown (GFM) — two instances: full-page (with content filtering) and fragment (minimal filtering for user selections) |
| `src/utils/preferences.js` | Preferences wrapper around `chrome.storage.local` (output mode, page-info toggle + format, filename template + style, formatting options, link/image modes, tracking-param strip, auto-close popup) |
| `src/utils/filename-template.js` | Pure-function filename templater — token expansion, Moment-style date formatting, preserve/kebab/snake style transforms, sanitization, truncation |
| `src/utils/url-cleaner.js` | Pure-function tracking-param stripper — `cleanUrl(url)` and `cleanUrlsInMarkdown(markdown)` for `utm_*`, `fbclid`, `gclid`, `mc_cid`, etc. |
| `src/options/options.js` | Options page controller — auto-save, formatting previews, filename live preview, reset to defaults |
| `src/utils/simple-universal-extractor.js` | Text extraction fallback (guaranteed to return something) |
| `src/utils/site-registry.js` | Central registry for site-specific extractors — detection, lookup, dispatch |
| `src/sites/x/index.js` | X/Twitter site module — registration object, content types, SVG icons |
| `src/sites/x/x-extractor.js` | X/Twitter DOM parser — extracts tweets, threads, articles as structured data |
| `src/sites/x/x-formatter.js` | X/Twitter markdown formatter — structured data → markdown strings |
| `src/sites/claude/index.js` | Claude site module — shared conversation extraction |
| `src/sites/claude/claude-extractor.js` | Claude DOM parser — extracts conversation turns from share pages |
| `src/sites/claude/claude-formatter.js` | Claude markdown formatter — conversation → structured markdown |
| `src/sites/grok/index.js` | Grok site module — shared conversation extraction |
| `src/sites/grok/grok-extractor.js` | Grok DOM parser — extracts turns, reasoning blocks, citations, code blocks |
| `src/sites/grok/grok-formatter.js` | Grok markdown formatter — conversation → structured markdown |
| `docs/building-site-extractors.md` | Workflow doc for adding new site extractors via `firefox-devtools-mcp` live-DOM inspection |
| `webpack.config.js` | Build config — 4 entry points → `dist/` |
| `store/listing.md` | Store listing text for Firefox Add-ons and Chrome Web Store |
| `store/privacy-policy.md` | Privacy policy — no data collection, local-only processing |
| `store/chrome-privacy-justifications.md` | Chrome Web Store permission justifications for privacy practices form |
| `private/PLAN.md` | Project plan, phases, progress tracking (private repo, see "Private working directory" below) |

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

- **Unit tests:** Jest + jsdom. Located in `tests/unit/`. 18 suites, 581 tests. Mock Chrome APIs via `tests/setup.js`. Coverage via `npm run test:coverage`.
- **Integration tests:** Jest + jsdom. Located in `tests/integration/`. 6 suites, 30 tests. Real Background + Content Script wired together via MessageBus helper that simulates Chrome message passing. Run with `npm run test:integration`.
- **E2E tests:** Jest + Puppeteer. Located in `tests/e2e/`. Currently scaffolding only — being replaced by Selenium.
- **Cross-browser e2e:** Planned (Phase 6.3–6.4) — Selenium WebDriver for Chrome + Firefox.
- **Custom matcher:** `toBeValidMarkdown` — checks that output contains markdown-like content.
- **jsdom limitation:** `getBoundingClientRect()` returns 0x0 in jsdom, so ElementPicker tests that depend on element sizing mock `_resolveTarget` directly.
- **Lowest coverage:** `element-picker.js` at 67.25% lines — jsdom limitation (`getBoundingClientRect` returns 0x0), not actionable without real browser.

## Browser Compatibility Notes

- Firefox MV3 requires `"background": { "scripts": [...] }` instead of `"service_worker"`.
- Firefox needs `browser_specific_settings.gecko.id` in manifest.
- `chrome.*` APIs work in both browsers (Firefox supports the `chrome` namespace).
- Some Chrome notification APIs may not be available in Firefox — check before using.
- `Cmd+Shift+S` conflicts with Firefox screenshot tool — keyboard shortcut uses `Cmd+Shift+M` instead.
- Context menu `info.targetElementId` is Chrome-only — content script tracks last right-clicked element via `contextmenu` event listener instead (works in both browsers).
- Firefox blocks `data:` URIs in `chrome.downloads.download` ("Access denied") — file save uses Blob URL created in content script via `URL.createObjectURL` instead.
- Chrome MV3 service workers have no `navigator.clipboard` at all (no DOM); Firefox SWs have it but may reject. Background falls back to sending `writeToClipboard` to the content script. The content-script handler tries `navigator.clipboard.writeText` first, then falls back to `document.execCommand('copy')` via a temp textarea — needed because `writeText` rejects with `NotAllowedError: Document is not focused` whenever the popup is open (which is always the case for the main copy flow on Chrome).

## Dependencies

- **Runtime:** `turndown` (HTML to Markdown conversion), `turndown-plugin-gfm` (tables, strikethrough, task lists)
- **Dev:** Webpack, Babel, Jest, Puppeteer, ESLint

## Private working directory

The `private/` directory is a **nested independent git repository** (`page-content-to-markdown-private`) that holds working notes, plans, and sample pages too large or sensitive to belong in the public repo. The public repo's `.gitignore` lists `private/` so git stops at the boundary — `private/` has its own `.git/`, its own commits, and its own remote.

**What lives there:**
- `private/PLAN.md` — full project plan, phases, progress tracking
- `private/DESIGN-BRIEF.md` — design notes
- `private/cleanpage.md` — working drafts
- `private/captures/` — captured HTML/markdown pages for site module development and regression checking

**Setup (collaborators with access):**
```bash
git clone <public-repo-url> page-content-to-markdown
cd page-content-to-markdown
git clone <private-repo-url> private
```
Without private-repo access the directory is simply absent — public-repo code, tests, and build all work fine without it.

**Commit hygiene (important):**
When committing changes to the public repo, also check `private/` for uncommitted changes (`cd private && git status`). If there are any, commit and push them to the private repo separately. When the change relates to a public-repo commit, reference its hash in the private commit message so the two histories stay coherent.

A helper script shows the status of both repos side-by-side — run `npm run status` before/after committing to catch drift. Exit codes: `0` both clean, `1` something uncommitted, `2` `private/` missing or not a git repo.

**Never** add files inside `private/` to the public repo. Treat it as fully out-of-scope for public commits.

## Important Context

- `private/PLAN.md` has the full project plan, known issues, and progress tracking. Read it for current state if you have private-repo access; ignore if not.
- Firefox is the primary target. Chrome support is desired but secondary.
- Turndown `require()` needs `TurndownImport.default || TurndownImport` due to webpack ES module interop with Turndown's browser bundle.
- `jsdom` is marked as a webpack external — it's only used in the Node.js branch of `markdown-converter.js` for testing, never in the browser.
- **Two Turndown instances** in `markdown-converter.js`: `turndownService` (full-page, aggressive content filtering) and `_fragmentService` (selective mode, only strips universally junk elements). Both have the GFM plugin applied (tables, strikethrough, task lists). This is intentional — user-selected content should not be filtered.
- **Lazy-loaded images:** `_resolveImageSrc()` handles sites that put placeholder SVGs in `src` and real URLs in `data-src`, `data-lazy-src`, or `srcset`/`data-srcset`.
- **Content filtering patterns** use word-boundary regex for short patterns like `ad` to avoid false positives (e.g., `header` contains `ad` as a substring).
- **Preferences** stored in `chrome.storage.local`. `Preferences.get()` merges stored values with defaults. Current keys + defaults: `outputMode: 'clipboard'` (the user's *preferred default*; the popup uses this to decide which footer button is primary, but each Copy/Save click sends an explicit `mode` so the pref isn't rewritten per action), `includeMetadata: true`, `metadataFormat: 'header'` ('header' or 'yaml' frontmatter), `autoClosePopup: true`, `stripTrackingParams: true`, `linkMode: 'keep'` ('keep' | 'strip' | 'bare'), `imageMode: 'keep'` ('keep' | 'alt' | 'strip' | 'url-list'), formatting options (`headingStyle`, `bulletListMarker`, `codeBlockStyle`, `linkStyle`), filename options (`filenameTemplate: '{title} - {date}'`, `filenameStyle: 'preserve'`), and `lastUsedPerSite: {}` (map of `siteId → contentTypeId`; popup remembers what you last picked on each supported site). Shared by popup, options page, and background via webpack. Options flow: background reads prefs → passes in message options → content script calls `converter.applyFormattingOptions()` (Turndown options + extraction-time toggles like `_linkMode`/`_imageMode`/`_stripTrackingParams`) → conversion runs. For paths the background doesn't touch (text-selection context menu, element-selection picker), `ContentScript._fillOptionsFromStorage()` reads any missing keys directly from `chrome.storage.local`.
- **Options page** — Dedicated settings page (`src/options/`) accessible via gear icon in popup header or browser extension settings. Auto-saves on change (filename template debounced 400ms), shows live formatting previews and a live filename preview, has reset-to-defaults button. Two-option settings render as segmented controls (radio groups styled as pill buttons) — see `RadioGroup` wrapper in `options.js` that exposes a `<select>`-compatible `.value` / `addEventListener` interface so the controller treats both uniformly. Registered in manifest via `options_ui` with `open_in_tab: true`.
- **Page-info format** — When `includeMetadata` is on, `ContentScript.addMetadataHeader(markdown, metadata, format)` emits either the legacy markdown title block (`format === 'header'`) or YAML frontmatter (`format === 'yaml'`, see `_buildYamlFrontmatter`). YAML mode quote-escapes the title (`\\` and `"`), normalizes newlines, emits `url`/`domain`/`date` unquoted, and uses ISO date (`YYYY-MM-DD`). Compatible with Obsidian, Logseq, Bear, Hugo, Jekyll. The popup checkbox stays as on/off; the format itself is options-page only.
- **Link mode** — `applyFormattingOptions({ linkMode })` stores `_linkMode` on the converter. `_registerLinkModeRule` adds a Turndown `<a>` rule whose filter returns false for `linkMode === 'keep'` (so Turndown's default inlined/referenced rule runs) and true for `'strip'` (emits text only) or `'bare'` (emits `text (url)`). Registered on both the full-page and fragment Turndown services. Tracking-param strip runs after this in `cleanupMarkdown`, so `bare` mode URLs get cleaned regardless.
- **Image mode** — `_imageReplacement(node)` is the shared rule body for both Turndown services. `keep` emits `![alt](url)`, `alt` emits the alt text only, `strip` emits empty, `url-list` collects URLs into `_pendingImageUrls` (deduped) and emits empty inline. Per-conversion state (`_pendingImageUrls`) is reset at the top of every top-level convert method; `_appendImageUrlList(markdown)` appends a `## Images` section before `cleanupMarkdown` runs (so the URL list also gets tracking-param-stripped if enabled).
- **Tracking-param strip** — `src/utils/url-cleaner.js` is a pure module: `cleanUrl(urlStr)` parses with `URL`, deletes well-known tracking params (utm_* / __hs* / _hs* prefixes; explicit names: fbclid, gclid, dclid, msclkid, yclid, wbraid, gbraid, twclid, mc_cid, mc_eid, mkt_tok, vero_id/vero_conv, hsCtaTracking, igshid, ref_src, ref_url, _ga, _gl), and serializes back. `cleanUrlsInMarkdown(md)` runs the cleaner over every absolute http(s) URL. Applied at two sites: (1) `ContentScript._getMetadata(options)` cleans `metadata.url` so file save names and the metadata header use the cleaned URL; (2) `MarkdownConverter.cleanupMarkdown(markdown)` post-processes content URLs when `_stripTrackingParams` is true. Generic params like `s`, `t`, `ref` are deliberately left alone — too many legitimate sites use them for routing.
- **Output dispatch** — `dispatchOutput(markdown, metadata, modeOverride)` in background routes to `copyToClipboard()` or `saveAsFile()`. The optional `modeOverride` ('clipboard' | 'file') wins over the `outputMode` pref when supplied — the popup passes it on every action so Copy and Save are explicit per-click without rewriting the user's preferred default. Paths that don't pass an override (context-menu text selection, content-script `selectionComplete`) fall through to the pref. All output paths go through this single dispatcher. File saves call `BackgroundScript.generateFilename(metadata, prefs)` which delegates to `FilenameTemplate.formatFilename(template, style, { title, url, date })` — see `src/utils/filename-template.js` for the token set (`{title} {host} {domain} {path} {slug} {date[:fmt]} {time[:fmt]} {datetime[:fmt]}`), Moment-style date format tokens, and pipeline (expand → style transform → sanitize → truncate to 200 chars → append `.md`).
- **Site module interface** — Each site module exports a registration object with `id`, `matchers` (hostname patterns), `contentTypes` (with labels and SVG icons), `Extractor` class, and `Formatter` class. `SiteRegistry` provides `extract(siteId, contentType, doc, url)` and `format(siteId, contentType, data)` dispatch methods. X/Twitter's `XExtractor` returns structured data objects (TweetData, ThreadData, ArticleData), `XFormatter` converts them to markdown.
- **X selector resilience** — `_query()` and `_queryAll()` helpers in `src/sites/x/x-extractor.js` try selectors in priority order: `data-testid` (primary) → ARIA roles (fallback) → structural tags (last resort). When all selectors fail, extraction returns `null` and the content script falls back to the general Turndown conversion path.
- **X extraction methods accept URL parameter** — `extractSingleTweet(doc, url)` and `extractThread(doc, url)` in `src/sites/x/x-extractor.js` take an optional URL to identify the focal tweet. This avoids needing to mock `document.location` in jsdom tests.
- **Popup auto-detection is URL-only** — `SiteRegistry.detect(url)` checks hostname against registered site matchers, called directly in popup (no background round-trip). Site rows are built dynamically from the site module's `contentTypes` array; the divider always shows for supported sites (single-content sites like Claude/Grok keep the divider for layout consistency). Wrong content type gives a clear error message rather than pre-detecting at popup-open time.
- **Popup state machine** — three views: `'main'` (row picker + Copy/Save footer), `'restricted'` (everything dimmed + sticky error banner for chrome://, about:, file://, etc.), `'selecting'` (focused "Selection mode is active" card replacing the picker, with a Cancel button). View is decided at init from the current tab URL and the background's `getSelectionState`. Errors from action failures appear as a non-sticky inline banner above the buttons (auto-dismisses after 4s). Successful actions flash the clicked button green with a check + "Copied"/"Saved" for 1.4s, then auto-close ~200ms later if `autoClosePopup` is on; otherwise revert. Site detection uses a small badge mapping (`x → 𝕏`, `claude → C`, `grok → G`); divider text strips after `' / '` so "X / Twitter" reads as "Available on X". Last-picked content type per site is persisted to `prefs.lastUsedPerSite` and restored on next open; picking "Page content" on a supported site clears that site's memory.
- **Picker phantom capture layer** — the killer architectural detail. A transparent `<div class="mdpicker-capture">` lives inside the shadow root with `position: fixed; inset: 0; z-index: 50; pointer-events: auto; cursor: crosshair`, sitting above page content but below the banner (z-index 100) and action bar (z-index 100). All mouse events (mousemove, mousedown, click, contextmenu) listen on this layer rather than `document` — the cursor never physically lands on host-page elements, so the browser literally never sets `:hover` on anything in the page. No specificity wars, no JS hover handlers fire, no link/text/scrollbar interactions. To find the page element under the cursor we use `document.elementsFromPoint(x, y)` and skip our shadow host. Trade-off: the capture layer covers the right-edge scrollbar gutter, so scrollbar-drag won't work mid-selection (wheel / arrow keys / spacebar / trackpad still scroll fine). Banner / action bar buttons receive their own clicks because they're above the capture layer in z-index within the shadow root, so events never bubble through to it.
- **Picker dual-action interface** — `ElementPicker` constructor takes `{ onCopy, onSave, onCancel, initialOutputMode }`. The Default segmented control in the banner is **session-local** (no `chrome.storage` writeback) — flipping it during selection mode only swaps which side of the action bar is the white "primary" button; the popup remains the canonical place to change `prefs.outputMode`. Keyboard: Esc = hard exit, Enter = primary action, C = Copy, S = Save (letter shortcuts skipped when the event target is editable). Synthetic clicks (`event.isTrusted === false`) pass through the click handler — required because the picker stays alive after Copy/Save and the file-save path triggers a synthetic `<a download>.click()` from the content script that we must not swallow. After a successful action, the button flashes green with a checkmark for 1.4s, the selection persists, and the picker stays active so the user can fire the other action on the same set. `_endFlash()` re-renders the button text from the current `defaultMode` so flipping the segmented control during the flash leaves the right label on the button. Background's `handleSelectionComplete` reads `result.mode` (`'clipboard' | 'file'`) and passes it as the dispatch override; `selectionState` is no longer cleared on completion (only on Cancel / Esc / X / tab close), since the picker stays alive.
- **Adding a new site extractor** requires creating a module in `src/sites/{id}/` with an `index.js` exporting the registration object, plus `Extractor` and `Formatter` classes, and adding one `require()` line to `site-registry.js` -- no changes to popup, background, or content script. Full workflow (including live-DOM inspection via `firefox-devtools-mcp`) is documented in `docs/building-site-extractors.md`.
- **Grok extraction details** — Works on share pages (`grok.com/share/...`) and active chats (`grok.com/c/...`). Turns are matched by `[data-testid="user-message"]` / `[data-testid="assistant-message"]`. Assistant reasoning collapse lives at `.thinking-container > button` (text: "Thought for Ns"). Citation chips are `a.citation` with a U+2060 word-joiner prefix that's stripped. Multi-source popover buttons (`<button class="no-copy ...">`) are removed since they have no stable link target. Code blocks (`[data-testid="code-block"]`) are replaced with clean `<pre><code class="language-X">` before Turndown. Images with empty alt get a default `alt="Image"`. Title comes from `document.title` with the page-context suffix stripped — `" | Shared Grok Conversation"` on share pages and `" - Grok"` (incl. en/em-dash variants) on active chats.
- **DOM-direct conversion path** — `convertFromDOM(element)` in `markdown-converter.js` accepts a live DOM Element, finds content via the same selector strategy as `extractMainContent`, and passes the DOM node directly to Turndown (which clones it internally). This avoids the serialize→reparse round-trip of the string-based `convertToMarkdown(html)` path. Content script uses `convertFromDOM(document.body)` as the primary path, falling back to the string path if it returns insufficient output.
- **Size guards** — Content script skips full Turndown conversion for pages with >50K elements (uses SimpleUniversalExtractor directly). `convertToMarkdown` truncates HTML strings over 5MB to prevent browser hangs.
- **Progress feedback** — Popup shows escalating progress messages ("Extracting content..." → "Processing page content..." → "Large page — still working...") via timed updates during long conversions.
