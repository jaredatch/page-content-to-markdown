# Copy Page as Markdown

A browser extension that converts web page content to clean, structured markdown. Supports full-page conversion, selective element picking, and site-specific presets for X/Twitter.

Firefox-first, with Chrome support.

## Features

- **Full page conversion** — One click to convert an entire page to well-formatted markdown
- **Selective conversion** — Hover and click to pick specific elements, or right-click selected text
- **X/Twitter presets** — Dedicated extraction for single tweets, threads, and articles
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

**X/Twitter:** When on x.com or twitter.com, the popup shows preset buttons for Tweet, Thread, and Article extraction

**Settings:** Click the gear icon in the popup header to configure output defaults and markdown formatting options

## Development

```bash
npm run build        # Production build → dist/
npm run build:dev    # Dev build with watch mode
npm run test         # Run unit tests (349 tests across 12 suites)
npm run test:integration  # Run integration tests (30 tests across 6 suites)
npm run test:all     # Unit tests (with coverage) + integration tests
npm run test:watch   # Unit tests in watch mode
npm run test:e2e     # End-to-end tests (requires Puppeteer)
npm run lint         # ESLint
```

### Architecture

```
Popup (UI) → Background (service worker) → Content Script → MarkdownConverter (Turndown)
                                                           ↘ ElementPicker (selection mode)
                                                           ↘ XExtractor + XFormatter (X/Twitter)
```

- **Turndown** is the primary HTML-to-Markdown engine, with a fallback text extractor for edge cases
- **Two Turndown instances**: full-page (with content filtering) and fragment (minimal filtering for user selections)
- **DOM-direct conversion**: passes live DOM nodes to Turndown, avoiding serialize/reparse overhead
- **Shadow DOM isolation**: the element picker UI is injected via shadow DOM to avoid CSS conflicts

See [CLAUDE.md](CLAUDE.md) for detailed architecture docs and [PLAN.md](PLAN.md) for project status and roadmap.

### Dependencies

- **Runtime:** [Turndown](https://github.com/mixmark-io/turndown) (HTML to Markdown)
- **Dev:** Webpack, Babel, Jest, Puppeteer, ESLint

## Browser Compatibility

- Firefox (primary target) — MV3 with `background.scripts`
- Chrome — MV3 with `service_worker`
- Keyboard shortcut: `Cmd+Shift+M` / `Ctrl+Shift+M` (avoids Firefox's `Cmd+Shift+S` screenshot conflict)

## License

MIT
