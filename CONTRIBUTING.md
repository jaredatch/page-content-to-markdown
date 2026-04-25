# Contributing

Thanks for thinking about contributing! This doc covers how to get set up, where things live, and what makes a good PR. The most welcome contributions are bug fixes, new content-extraction patterns, and new site extractors. Anything thoughtful is fair game.

---

## Setup

```bash
git clone https://github.com/jaredatch/page-content-to-markdown.git
cd page-content-to-markdown
npm install
npm run build         # Production build → dist/
npm run build:dev     # Dev build with watch mode
```

Load `dist/` as an unpacked extension:

- **Firefox:** `about:debugging` → "This Firefox" → "Load Temporary Add-on" → `dist/manifest.json`
- **Chrome:** `chrome://extensions` → enable Developer Mode → "Load unpacked" → `dist/`

Firefox is the primary target; Chrome support is secondary.

---

## Tests

```bash
npm run test               # Unit tests (Jest + jsdom)
npm run test:watch         # Unit tests in watch mode
npm run test:integration   # Integration tests
npm run test:all           # Unit + integration with coverage
npm run lint               # ESLint
```

PRs need to keep tests green. Add tests for new behavior. They don't have to be exhaustive, but they should pin down whatever you changed so it doesn't silently regress later.

---

## Common contribution paths

### Improving content extraction

If you've found a class or ID pattern the general extractor should filter (or one it's filtering that it shouldn't), the change is usually a one-line regex tweak in `src/utils/markdown-converter.js` plus a test in `tests/unit/markdown-converter.test.js`. See [docs/content-extraction.md](docs/content-extraction.md) for the full list of current patterns and where to edit.

### Adding a new site action

If a site you use regularly extracts poorly with the general path, it might deserve a dedicated extractor. Each supported site is a self-contained module under `src/sites/` exporting a registration object, an `Extractor`, and a `Formatter`. See [docs/building-site-extractors.md](docs/building-site-extractors.md) for the full workflow, including the `firefox-devtools-mcp`-driven live-DOM inspection process we use to discover selectors quickly.

### Bug fixes and general improvements

Just open a PR. If the fix is non-obvious, a short note about the bug and how to reproduce it makes review faster.

---

## Project layout

```
src/
├── popup/         UI shown when you click the extension icon
├── background/    Service worker (routes messages, dispatches output, manages context menus)
├── content/       Content script + element picker (runs in page context)
├── options/       Settings page
├── sites/         Per-site modules (X, Claude, Grok)
└── utils/         Shared utilities (markdown converter, site registry, preferences)

tests/
├── unit/          Per-module unit tests (Jest + jsdom)
├── integration/   Background and content-script wired together via message bus helper
└── e2e/           Puppeteer-based; being replaced by Selenium
```

Pure JavaScript (ES6+, transpiled via Babel), no TypeScript. Webpack bundles four entry points into `dist/`. See [CLAUDE.md](CLAUDE.md) at the repo root for deeper architecture notes.

---

## What makes a good PR

- **One concern per PR.** Easier to review, easier to revert. If you're tempted to bundle a refactor with a fix, split them.
- **Tests for new behavior.** See above.
- **Lint clean.** `npm run lint` should pass.
- **Clear commit messages.** Imperative mood ("Add Grok citation handling", not "Added" or "Adds").
- **A short PR description** explaining what changed and why. If it fixes a bug, a one-liner about the repro helps. If it adds a feature, a sentence about why it's useful is enough.

Don't worry about polishing every word. The goal is enough context for a reviewer to understand the change without reading every line of the diff.

---

## Questions?

Open an issue if you're unsure whether a contribution is welcome, want to discuss an approach before writing code, or hit something confusing in the codebase. We'd rather you ask early than build something that needs to be reworked.
