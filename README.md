# Copy Page as Markdown

A browser extension that converts web page content to clean, structured markdown. Supports general actions (full-page conversion, selective element picking) and site actions for supported sites (X/Twitter, Claude, Grok).

Firefox-first, with Chrome support.

## Features

The extension provides two kinds of actions: **general actions** that work on any page, and **site actions** that are enabled on supported sites.

**General actions**

- **Full page conversion** — One click to convert an entire page to well-formatted markdown
- **Selective conversion** — Hover and click to pick specific elements, or right-click selected text

**Site actions** — dedicated extraction for supported sites, handled by self-contained site modules:

- **X/Twitter** — Tweet, Thread, Article
- **Claude** (`claude.ai`) — Conversation (shared chats)
- **Grok** (`grok.com`) — Conversation (shared chats)

**Everywhere**

- **GFM output** — Tables, strikethrough, and task lists via `turndown-plugin-gfm`
- **Output options** — Copy to clipboard or save as `.md` file
- **Formatting preferences** — Configure heading style, bullet markers, code blocks, and link style
- **Keyboard shortcut** — `Cmd+Shift+M` (Mac) / `Ctrl+Shift+M` to toggle element selection mode
- **Context menus** — Right-click to convert text selection or pick an element

## Install

1. Clone and build:
   ```bash
   git clone <repo-url>
   cd page-content-to-markdown
   npm install
   npm run build
   ```

2. Load the extension:
   - **Firefox:** `about:debugging` → "This Firefox" → "Load Temporary Add-on" → select `dist/manifest.json`
   - **Chrome:** `chrome://extensions` → Enable Developer Mode → "Load unpacked" → select `dist/` folder

## Usage

**Full page:** Click the extension icon → "Copy Page as Markdown"

**Select elements:** Click "Select Elements" → hover and click elements on the page → confirm in the floating toolbar

**Site actions:** When on a supported site, the popup shows dedicated action buttons:
- **X/Twitter** (x.com, twitter.com) — Tweet, Thread, Article
- **Claude** (claude.ai) — Conversation (for shared chats)
- **Grok** (grok.com) — Conversation (for shared chats)

**Settings:** Click the gear icon in the popup header to configure output defaults and markdown formatting options

## Development

```bash
npm run build        # Production build → dist/
npm run build:dev    # Dev build with watch mode
npm run test         # Run unit tests (440 tests across 16 suites)
npm run test:integration  # Run integration tests (30 tests across 6 suites)
npm run test:all     # Unit tests (with coverage) + integration tests
npm run test:watch   # Unit tests in watch mode
npm run test:e2e     # End-to-end tests (requires Puppeteer)
npm run lint         # ESLint
npm run status       # Side-by-side git status of public + private/ repos (see CLAUDE.md)
```

### Architecture

```
Popup (UI) → Background (service worker) → Content Script → MarkdownConverter (Turndown + GFM)
                                                           ↘ ElementPicker (selection mode)
                                                           ↘ SiteRegistry → site modules (X/Twitter, Claude, Grok, ...)
```

- **Turndown + turndown-plugin-gfm** is the primary HTML-to-Markdown engine, with a fallback text extractor for edge cases
- **Two Turndown instances**: full-page (with content filtering) and fragment (minimal filtering for user selections)
- **DOM-direct conversion**: passes live DOM nodes to Turndown, avoiding serialize/reparse overhead
- **Shadow DOM isolation**: the element picker UI is injected via shadow DOM to avoid CSS conflicts
- **Site module registry**: modular architecture — each supported site is a self-contained site module in `src/sites/` exporting an extractor, formatter, and metadata; adding a new site requires no changes to popup, background, or content script

See [CLAUDE.md](CLAUDE.md) for detailed architecture docs.

### Dependencies

- **Runtime:** [Turndown](https://github.com/mixmark-io/turndown) (HTML to Markdown), [turndown-plugin-gfm](https://github.com/mixmark-io/turndown-plugin-gfm) (tables, strikethrough, task lists)
- **Dev:** Webpack, Babel, Jest, Puppeteer, ESLint

## Browser Compatibility

- Firefox (primary target) — MV3 with `background.scripts`
- Chrome — MV3 with `service_worker`
- Keyboard shortcut: `Cmd+Shift+M` / `Ctrl+Shift+M` (avoids Firefox's `Cmd+Shift+S` screenshot conflict)

## Acknowledgments

Originally forked from [elad12390/browser-extension-copy-page-as-markdown](https://github.com/elad12390/browser-extension-copy-page-as-markdown). The project has since been substantially rewritten — the fallback text extractor (`simple-universal-extractor.js`) is the main piece of the original code that remains. Thanks to Elad for the initial scaffold.

## License

MIT
