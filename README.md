# Copy Page as Markdown

A browser extension that turns web pages into clean markdown. It finds the meaningful content of a page and skips the chrome around it (nav, ads, footers, comments). For X, Claude, and Grok, dedicated extractors produce even cleaner output.

Firefox-first, with Chrome support.

## Features

- **Content extraction.** Skips nav, ads, footers, comments, and other page chrome by default. [How it works](docs/content-extraction.md)
- **Selective conversion.** Hover and click to pick specific elements, or right-click selected text.
- **Site actions for X, Claude, and Grok.** Dedicated extractors that produce cleaner output than the general path. [Supported sites](docs/supported-sites.md)
- **GFM output.** Tables, strikethrough, task lists.
- **Clipboard or file.** Copy to clipboard or save as `.md`.
- **Page info as inline metadata or YAML frontmatter.** Title, URL, and date/time at the top of every save — as bold key-value lines or as YAML for Obsidian, Logseq, Hugo, Jekyll, and similar tools.
- **Image and link handling.** Keep them, replace with alt text, strip them, or collect image URLs at the end of the doc. Useful when feeding output to LLMs that don't need the noise.
- **Tracking-parameter strip.** `utm_*`, `fbclid`, `gclid`, and other analytics noise removed from URLs by default.
- **Customizable filenames.** Template-based with tokens (`{title}`, `{date}`, `{domain}`, `{slug}`, etc.) and a choice of preserve / kebab-case / snake_case.
- **Formatting preferences.** Heading style, bullet markers, code blocks, link style.
- **Keyboard shortcut and context menus.** `Cmd+Shift+M` / `Ctrl+Shift+M` toggles selection mode; right-click to convert selected text or pick an element.

## Install

1. Clone and build:
   ```bash
   git clone https://github.com/jaredatch/page-content-to-markdown.git
   cd page-content-to-markdown
   npm install
   npm run build
   ```

2. Load the extension:
   - **Firefox:** `about:debugging` → "This Firefox" → "Load Temporary Add-on" → `dist/manifest.json`
   - **Chrome:** `chrome://extensions` → Developer Mode → "Load unpacked" → `dist/`

## Usage

Click the extension icon to open the popup. Pick what you want to capture (Page content, or — on a supported site — a Tweet, Thread, Conversation, etc.), then hit **Copy** or **Save**. The popup remembers your last pick per site.

- **Pick elements:** "or select elements on page" link → hover and click → Copy or Save from the floating action bar (selection persists, so you can fire both on the same set)
- **Selected text:** right-click → "Copy selection as Markdown"
- **Default action:** Copy or Save — whichever you set as default in the options page becomes the filled primary button
- **Settings:** click the gear icon in the popup header to configure output, formatting, and the page-info format

## Documentation

- [How content extraction works](docs/content-extraction.md): the capture/strip strategy and an FAQ for when something looks wrong
- [Supported sites](docs/supported-sites.md): the site action catalog
- [Contributing](CONTRIBUTING.md): setup, tests, PR guide
- [Building site extractors](docs/building-site-extractors.md): workflow for adding a new site

## Development

See [CONTRIBUTING.md](CONTRIBUTING.md) for setup, tests, and PR workflow. For deeper architecture notes, see [CLAUDE.md](CLAUDE.md).

## Browser compatibility

- Firefox (primary target): MV3 with `background.scripts`
- Chrome: MV3 with `service_worker`
- Keyboard shortcut: `Cmd+Shift+M` / `Ctrl+Shift+M` (avoids Firefox's `Cmd+Shift+S` screenshot conflict)

## Acknowledgments

Originally forked from [elad12390/browser-extension-copy-page-as-markdown](https://github.com/elad12390/browser-extension-copy-page-as-markdown). The project has been substantially rewritten since. The fallback text extractor (`simple-universal-extractor.js`) is the main piece of the original code that remains. Thanks to Elad for the initial scaffold.

## License

MIT
