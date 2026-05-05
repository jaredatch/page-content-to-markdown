# CLAUDE.md — Page Content to Markdown

Browser extension (Firefox primary, Chrome secondary) that converts web pages to clean markdown. Provides **general actions** (full-page conversion, selective element conversion) on any page, plus **site actions** for supported sites (X/Twitter, Claude, Grok, ChatGPT) powered by per-site **site modules** in `src/sites/`.

> Per-site extraction quirks live in each site's own `src/sites/{id}/CLAUDE.md`, auto-loaded when working in that directory. The site module contract and shared rules (including i18n-safe selectors) live in `src/sites/CLAUDE.md`. Project status, plans, and design notes live in `private/PLAN.md`.

## Terminology

These terms are used consistently across docs, code, UI, and conversation. Stick to them.

| Concept | User-facing | Code / docs |
|---|---|---|
| A site we specifically support (X, Claude, Grok, ChatGPT) | "supported site" / "site support" | `site module` (the unit in `src/sites/{id}/`) |
| What the user does (top-level operation) | `action` | — |
| Actions that work on any page | `general actions` | — |
| Actions enabled by a site module | `site actions` | — |
| The thing being extracted | proper noun in UI (Tweet, Thread, Conversation, Page) | `contentType` (matches `site.contentTypes`) |
| Site module internals | — | `Extractor` class (DOM → data), `Formatter` class (data → markdown) |

**Don't use:** "preset", "generic" (use "general"), "plugin", "integration", "connector", "adapter". "Extract" is the internal verb (`extractContent`, `extractSiteContent`); "save" / "copy" is user-facing.

## Quick Reference

```bash
npm install              # Install dependencies (required before anything else)
npm run build            # Production build → dist/
npm run build:dev        # Dev build with watch mode
npm run test             # Unit tests
npm run test:integration # Integration tests
npm run test:all         # Unit (with coverage) + integration
npm run test:watch       # Unit tests in watch mode
npm run test:e2e         # End-to-end tests (Puppeteer)
npm run lint             # ESLint
npm run status           # Side-by-side git status of public + private/ repos
```

## Architecture

```
Popup (UI) → Background (service worker) → Content Script (page context) → Extractor/Converter
                                                                         ↘ ElementPicker (selection mode)
                                                                         ↘ SiteRegistry → site modules
```

- **Popup** (`src/popup/`) — content-first picker. Rows for "Page content" + (on supported sites) the site's content types. Footer Copy/Save buttons; user's `outputMode` pref is the filled-black primary, the other is outlined. Header has page-info checkbox + gear → options page. Honors `autoClosePopup` after success. Fires a DOM probe on open in parallel with the URL-only render (`runContentTypeProbe()`), filtering rows to what's actually present.
- **Background** (`src/background/background.js`) — service worker. Routes messages, handles clipboard with content-script fallback, dispatches output (clipboard/file), per-tab selection state (`Map`), context menus, keyboard commands.
- **Content Script** (`src/content/content-script.js`) — full-page extraction, selection mode, text-selection conversion, clipboard fallback, file save via Blob URL.
- **Element Picker** (`src/content/element-picker.js`) — Shadow DOM UI for selection mode. Sticky banner, phantom capture layer (suppresses host-page `:hover`), hover/selected overlays, floating action bar.
- **Site Registry** (`src/utils/site-registry.js`) — central registry: detection, lookup, dispatch.
- **Site Modules** (`src/sites/`) — per-site extraction. Currently X/Twitter, Claude, Grok, ChatGPT. See `src/sites/CLAUDE.md` for the module contract.

### Message Flow — Page or Site Action

1. Popup sends `extractAndCopy` or `extractSiteContent` (with explicit `mode: 'clipboard' | 'file'` from the clicked button) → Background
2. Background reads prefs, sends `extractContent`/`extractSiteContent` with options (includeMetadata, metadataFormat, formatting, linkMode, imageMode, stripTrackingParams) → Content Script
3. Content Script extracts + converts (site action: dispatches via `SiteRegistry.getById(siteId)`; falls back to general path on failure) → returns markdown + metadata
4. Background calls `dispatchOutput(markdown, metadata, mode, tabId)` — `mode` overrides the `outputMode` pref so each click is explicit per-action; `tabId` binds clipboard fallback / file save to the originating tab so a tab switch mid-dispatch can't retarget output

### Message Flow — Selective Conversion

1. Popup sends `startSelectionMode` → Background → Content Script
2. Content Script reads `outputMode` and activates ElementPicker with it as `initialOutputMode` (session-local; primes which side of the action bar is the white "primary")
3. User clicks Copy/Save (or Enter/C/S) → ElementPicker invokes `onCopy`/`onSave` → Content Script converts and `await`s `selectionComplete` with `{ markdown, metadata, mode }` → Background
4. Background dispatches and returns the `outputResult` to the awaiting content script — the picker only flashes "success" once the markdown actually landed on the clipboard / disk, never on optimistic send. Picker stays active so the user can fire the other action on the same set. X icon / Esc / popup Cancel hard-exits.

### Message Flow — Content Type Probe (smart popup detection)

1. Popup `init()` calls `runContentTypeProbe()` AFTER the synchronous URL-applicable render
2. `probeContentTypes` → Background → Content Script → `SiteRegistry.getById(siteId)` → optional `detectAvailable(document, url)` → `{ contentTypeId: boolean, ... }` map (or `null` if no probe defined)
3. Popup `applyProbeResult(available)` filters rows to detected types. Conservative on `null` or all-false (treat as inconclusive). No timeout — late responses still apply.

### Message Flow — Quick Extract (keyboard shortcut)

`chrome.commands.onCommand` fires `quick-extract` (no default key — user binds via browser UI). Background `handleQuickExtract()`: queries the active tab, short-circuits restricted URLs, reads `outputMode`, detects site, runs the same probe pipeline, picks `lastUsedPerSite[siteId]` if applicable else first applicable else Page content, dispatches via the existing handlers. System notification confirms result.

### Message Flow — Context Menu

- **Text selected:** "Copy selection as Markdown" → `convertTextSelection`
- **No text selected:** "Select element for Markdown" → `startSelectionWithElement` (picker activates with right-clicked element pre-selected)

## Key Files

| File | Purpose |
|------|---------|
| `manifest.json` | Extension manifest (MV3) — permissions, commands, context menus |
| `src/content/element-picker.js` | Shadow DOM UI for selection mode |
| `src/utils/markdown-converter.js` | Turndown-based HTML→Markdown (GFM); two instances (full-page filtered, fragment minimal) |
| `src/utils/preferences.js` | `chrome.storage.local` wrapper (output mode, page-info, filename, formatting, link/image modes, etc.) |
| `src/utils/filename-template.js` | Filename templater — pipe-filter syntax (`{title\|max:50\|default:Untitled}`), Moment-style date tokens, style transforms |
| `src/utils/url-cleaner.js` | Tracking-param stripper (`utm_*`, `fbclid`, `gclid`, etc.) |
| `src/utils/site-registry.js` | Site module detection, lookup, dispatch |
| `src/utils/simple-universal-extractor.js` | Text extraction fallback (guaranteed to return something) |
| `src/options/options.js` | Options page controller |
| `docs/building-site-extractors.md` | Workflow doc for adding new site extractors via `firefox-devtools-mcp` live-DOM inspection |
| `webpack.config.js` | Build config — 4 entry points → `dist/` |
| `store/` | Listing text, privacy policy, Chrome Web Store permission justifications |
| `private/PLAN.md` | Project plan, phases, progress tracking (private repo) |

Per-site extractors live at `src/sites/{x,chatgpt,grok,claude}/`; each directory has its own `CLAUDE.md` with site-specific gotchas.

## Build & Load Extension

1. `npm install`
2. `npm run build`
3. **Firefox:** `about:debugging` → "This Firefox" → "Load Temporary Add-on" → select `dist/manifest.json`
4. **Chrome:** `chrome://extensions` → Developer Mode → "Load unpacked" → select `dist/`

## Code Conventions

- **Class-based modules** — each major component is a class (`BackgroundScript`, `ContentScript`, `PopupController`, `ElementPicker`, etc.).
- **Console logging** — emoji prefixes for traceability (`🔄`, `✅`, `❌`, `🎯`, `🔍`).
- **Message passing** — Chrome extension API (`chrome.runtime.sendMessage`, `onMessage`).
- **Error handling** — multi-layer fallbacks. Extraction must always return *something*, never throw to the caller.
- **No TypeScript** — pure JS with ES6+, transpiled via Babel.
- **Shadow DOM isolation** — ElementPicker UI uses Shadow DOM. Styles inlined as template strings.
- **No `innerHTML` assignments** — use `replaceChildren` + `createElement` for built UI, or `DOMParser.parseFromString` (`'image/svg+xml'` for SVG, `'text/html'` for HTML chunks) when a static markup string is more readable. `addons-linter` flags `innerHTML = ...` as `UNSAFE_VAR_ASSIGNMENT` and AMO reviewers triage every instance — it's not worth the friction even when the data is internal. Reading `el.innerHTML` (e.g. in extractors that hand HTML to Turndown) is fine.

For per-site extraction code, additional conventions (i18n-safe selectors, the `Extractor` / `Formatter` contract, `prepareForExtraction` and `detectAvailable` hooks) live in `src/sites/CLAUDE.md`.

## Testing

- **Unit tests:** Jest + jsdom in `tests/unit/`. Mock Chrome APIs via `tests/setup.js`. Coverage via `npm run test:coverage`.
- **Integration tests:** Jest + jsdom in `tests/integration/`. Real Background + Content Script wired together via a MessageBus helper that simulates Chrome message passing.
- **E2E tests:** Jest + Puppeteer in `tests/e2e/`. Currently scaffolding only — being replaced by Selenium (Phase 6.3–6.4 planned).
- **Custom matcher:** `toBeValidMarkdown` — checks output contains markdown-like content.
- **jsdom limitation:** `getBoundingClientRect()` returns 0x0, so ElementPicker tests that depend on element sizing mock `_resolveTarget` directly. Lowest coverage is `element-picker.js` (~67% lines) for this reason.

The site-extractor testing strategy lives in two docs that are deeper references than this section. `docs/testing-fixtures.md` covers Tier 1 (captured-HTML regression tests in CI, partially shipped — the ChatGPT regression block is the reference implementation). `docs/testing-drift-watcher.md` covers Tier 2 (live drift watcher on personal-machine cron, planned). Read those before adding new test infrastructure for site modules.

## Browser Compatibility Notes

- Firefox MV3 requires `"background": { "scripts": [...] }` instead of `"service_worker"`, plus `browser_specific_settings.gecko.id`.
- `chrome.*` APIs work in both browsers (Firefox supports the `chrome` namespace).
- `Cmd+Shift+S` conflicts with Firefox screenshot tool — selection mode uses `Cmd+Shift+M`. The `quick-extract` command intentionally has no default key (user binds via `about:addons` → "Manage Extension Shortcuts" on Firefox or `chrome://extensions/shortcuts` on Chrome).
- **Firefox MV3 host_permissions are optional in temp-extension loads.** When loaded via "Load Temporary Add-on", declared host_permissions show as **off** — Firefox doesn't auto-grant since there's no install dialog. Manually flip them on for testing. `web-ext run` mimics the real install path and pre-grants.
- **Static content scripts only inject on page load.** When you reload the extension, already-open tabs keep their previously-injected content script. New code paths won't be available on pre-existing tabs until the tab reloads. Symptom: popup probe always returns nothing because the old content script ignores the new message action. Fix: Cmd+R the page tab.
- Context menu `info.targetElementId` is Chrome-only — content script tracks the last right-clicked element via a `contextmenu` listener instead.
- Firefox blocks `data:` URIs in `chrome.downloads.download` — file save uses Blob URL via `URL.createObjectURL` in the content script.
- Chrome MV3 service workers have no `navigator.clipboard` (no DOM); Firefox SWs have it but may reject. Background falls back to sending `writeToClipboard` to the content script, which tries `navigator.clipboard.writeText` then `document.execCommand('copy')` via a temp textarea — needed because `writeText` rejects with `NotAllowedError: Document is not focused` whenever the popup is open.

## Dependencies

- **Runtime:** `turndown` (HTML→Markdown), `turndown-plugin-gfm` (tables, strikethrough, task lists)
- **Dev:** Webpack, Babel, Jest, Puppeteer, ESLint

## Private Working Directory

The `private/` directory is a **nested independent git repository** (`page-content-to-markdown-private`) for working notes, plans, and sample pages too large or sensitive for the public repo. The public `.gitignore` excludes `private/`; it has its own `.git/`, commits, and remote.

**What lives there:** `private/PLAN.md` (project plan, phases, progress), `private/DESIGN-BRIEF.md`, `private/captures/` (HTML/markdown captures for site module dev and regression checking).

**Setup with private-repo access:**
```bash
git clone <public-repo-url> page-content-to-markdown
cd page-content-to-markdown
git clone <private-repo-url> private
```
Without access the directory is simply absent — public-repo code, tests, and build all work fine without it.

**Commit hygiene:** when committing changes to the public repo, also check `private/` (`cd private && git status`). Commit and push private changes separately. When the change relates to a public commit, reference its hash in the private commit message. Run `npm run status` before/after committing to catch drift (exit codes: `0` clean, `1` uncommitted, `2` `private/` missing).

**Never** add files inside `private/` to the public repo.

## Important Context

- **Two Turndown instances** in `markdown-converter.js`: `turndownService` (full-page, aggressive content filtering) and `_fragmentService` (selective mode, only strips universally junk elements). Both have the GFM plugin. User-selected content should not be filtered.
- **Lazy-loaded images:** `_resolveImageSrc()` handles sites that put placeholder SVGs in `src` and real URLs in `data-src`, `data-lazy-src`, or `srcset`/`data-srcset`.
- **Content filtering patterns** use word-boundary regex for short patterns like `ad` to avoid false positives (e.g., `header` contains `ad` as a substring).
- **Preferences** stored in `chrome.storage.local` via `Preferences.get()` (merges stored values with defaults). Keys: `outputMode`, `includeMetadata`, `metadataFormat` (`'header'` inline | `'yaml'` frontmatter), `autoClosePopup`, `stripTrackingParams`, `linkMode` (`'keep'` | `'strip'` | `'bare'`), `imageMode` (`'keep'` | `'alt'` | `'strip'` | `'url-list'`), formatting (`headingStyle`, `bulletListMarker`, `codeBlockStyle`, `linkStyle`), filename (`filenameTemplate`, `filenameStyle`), `lastUsedPerSite` (`siteId → contentTypeId` map). For paths the background doesn't touch (text-selection context menu, picker), `ContentScript._fillOptionsFromStorage()` reads missing keys directly from storage.
- **Output dispatch** — `dispatchOutput(markdown, metadata, modeOverride, tabId)` in background routes to `copyToClipboard()` or `saveAsFile()`. The optional `modeOverride` ('clipboard' | 'file') wins over the `outputMode` pref when supplied. `tabId` is the originating tab from the extract phase — both the clipboard content-script fallback and the file-save delegate use it directly, so a tab switch between extract and dispatch can't redirect output to the wrong page. Result always carries `method` ('clipboard' or 'file') even on failure, which `handleQuickExtract` uses as a "handler already notified" marker. Single chokepoint for all output paths.
- **File save** calls `BackgroundScript.generateFilename(metadata, prefs)` → `FilenameTemplate.formatFilename(template, style, { title, url, date })`. Token set: `{title} {host} {domain} {path} {slug} {date[:fmt]} {time[:fmt]} {datetime[:fmt]}`. Pipeline: expand → default-title-cap → pipe filters → style transform → sanitize → truncate to 200 chars → append `.md`.
- **Page-info format** — `ContentScript.addMetadataHeader(markdown, metadata, format)` emits inline (`format === 'header'`, `**Key:** value` block with hard-breaks) or YAML frontmatter. Both carry Title, URL, Date. Inline date is human (`April 29, 2026 at 11:35 AM`) matching tweet/article timestamps; YAML date is sortable (`2026-04-29 11:35`). Local time, not UTC. Domain is deliberately omitted — redundant against URL.
- **Tracking-param strip** — `src/utils/url-cleaner.js`: `cleanUrl(urlStr)` deletes well-known tracking params (utm_*, __hs*, _hs* prefixes; explicit names: fbclid, gclid, dclid, msclkid, yclid, wbraid, gbraid, twclid, mc_cid, mc_eid, mkt_tok, vero_*, hsCtaTracking, igshid, ref_src, ref_url, _ga, _gl). Generic params like `s`, `t`, `ref` are left alone. Applied at metadata URL and in `cleanupMarkdown` for content URLs.
- **URL scheme allowlist** — `src/utils/markdown-converter.js` is the trust boundary for emitted URLs. Links allowlist `http`, `https`, `mailto`; images allowlist `http`, `https`. Other schemes (`javascript:`, `data:`, `file:`, `vbscript:`, …) get textified (links — keep visible text, drop href) or dropped (images — emit nothing). Relative URLs (no scheme) are kept since they inherit the host page's scheme. The trust assumption is that downstream renderers don't need to re-validate emitted URLs; the converter has already done it. Note: `tel:` and `sms:` are deliberately not allowlisted right now — revisit if a real use case shows up.
- **Broad `host_permissions: ["*://*/*"]`** (http/https only). Content script auto-injects on every page so the popup probe and quick-extract have no activation handshake to wait on. The content script does nothing on page load — only responds to explicit user actions and never transmits page content. Privacy posture justified in `store/chrome-privacy-justifications.md`.
- **Size guards** — content script skips full Turndown for pages with >50K elements (uses `SimpleUniversalExtractor` directly). `convertToMarkdown` truncates HTML strings >5MB to prevent browser hangs. Popup shows escalating progress messages during long conversions.
- **DOM-direct conversion** — `convertFromDOM(element)` in `markdown-converter.js` accepts a live DOM Element and passes it directly to Turndown (which clones internally), avoiding the serialize→reparse round-trip of `convertToMarkdown(html)`. Content script uses this as the primary path with the string path as fallback.

For the site module interface, registration shape, optional hooks (`detectAvailable`, `prepareForExtraction`), and the `filenameTitle` pattern, see `src/sites/CLAUDE.md`.
