# Building Site Extractors with Live-DOM Inspection

This doc explains the workflow for building new site-specific extractors (the things in `src/sites/`) using a live Firefox browser that Claude Code can drive directly. Use this when adding support for a new site like Grok, ChatGPT, Gemini, Perplexity, etc.

## TL;DR

1. The `firefox-devtools-mcp` MCP server is installed and auto-spawns Firefox Developer Edition against a dedicated profile.
2. Claude Code can navigate pages, take a11y snapshots, and run arbitrary JS in-page — no need to paste multi-megabyte HTML samples into context.
3. Use that access to discover DOM structure, then write an `Extractor` + `Formatter` pair in `src/sites/{id}/` and register one line in `src/utils/site-registry.js`.

---

## Why This Exists

Most modern sites we want to extract from (Claude share pages, Grok share pages, ChatGPT, etc.) are SPAs. Their rendered HTML is multi-megabyte, the structure is opaque until JS runs, and selectors are hashed/obfuscated class names that change across deploys. Three options were evaluated:

- **A. Save big HTML samples and paste into context** — failed: files are too big and selector discovery still required manual inspection.
- **B. Live-DOM inspection via `firefox-devtools-mcp`** — **chosen**. Claude Code opens the real page, runs JS against it, and iteratively discovers selectors.
- **C. Build a browser extension debug tool** — rejected: heavyweight; B already solves it.

Solution B means extractor development is now a conversation with the live DOM rather than archaeology on static HTML.

---

## Setup (one-time, already done)

Installed user-scoped via:

```bash
claude mcp add firefox-devtools --scope user -- \
  npx -y firefox-devtools-mcp@latest \
  --enable-script \
  --profile-path "/Users/jared/Library/Application Support/Firefox/Profiles/g1azvxsm.MCP"
```

Verify it's running: `claude mcp list` should show `firefox-devtools: ... - ✓ Connected`.

### Key setup details

- **`--enable-script`** — enables `evaluate_script` (arbitrary JS in page context). Off by default for safety. Required for selector discovery.
- **`--profile-path`** points at a dedicated FF Dev profile (NOT the user's daily browser profile). Cookies/logins persist across sessions — you log into a target site once and auth sticks.
- **No `--connect-existing`** — this flag was tried originally but broke `evaluate_script` (BiDi script module times out under connect-existing). The MCP owns its own Firefox process now.

### Profile lifecycle gotcha

While Claude Code is running, the MCP holds a lock on the FF Dev profile. To manually poke at it (edit settings, log into a site, install an extension), **quit Claude Code first** so the MCP shuts down, then launch FF Dev Edition normally. Restart Claude Code when done.

---

## The Workflow — How to Build a New Site Extractor

### 0. Prep

- Pick a sample URL (ideally public so login isn't required).
- Skim `src/sites/claude/` and `src/sites/x/` — your new module mirrors their shape.
- If the site requires login, quit Claude Code, log in manually in FF Dev Edition, then restart. The profile persists the session.

### 1. Load the page in the MCP's Firefox

```
navigate_page(url: "https://grok.com/share/...")
```

No need to ask the user to open a tab — the MCP does it in its own Firefox window.

### 2. Sanity-check script eval

```js
evaluate_script(() => ({ url: location.href, ready: document.readyState }))
```

If this times out on a trivial script, something is wrong with the MCP config (usually `--connect-existing` has snuck back in). Check `claude mcp list`.

### 3. Get the structural outline

```
take_snapshot(selector: "main", includeAttributes: true)
```

This returns an a11y-filtered tree: structure + text + ARIA attributes. Good for identifying repeating turn containers, headings, and the general shape.

**Snapshot caps to know:** MAX_NODES=1000, MAX_DEPTH=10, text truncated at 100 chars. Does **not** show `className`, `data-testid`, or arbitrary DOM attributes.

### 4. Discover selectors with `evaluate_script`

This is the main discovery loop. Return just what you need — attribute values, element counts, sample outerHTML slices.

```js
// Count candidates for a selector hypothesis
evaluate_script(() =>
  document.querySelectorAll('[data-testid]').length
)

// Collect distinct data-testids used on the page
evaluate_script(() => {
  const ids = new Set();
  document.querySelectorAll('[data-testid]').forEach(el => ids.add(el.getAttribute('data-testid')));
  return Array.from(ids);
})

// Inspect a specific element's className / attrs
evaluate_script(() => {
  const el = document.querySelector('main > div > div');
  return { cls: el.className, html: el.outerHTML.slice(0, 500) };
})
```

**Function body is capped at 16 KB, default timeout 5s.** For anything bigger, break it into multiple calls or increase `timeout`.

### 5. Build the site module

Create `src/sites/{id}/` with three files mirroring `src/sites/claude/`:

- `{id}-extractor.js` — parses DOM → structured data object(s), returning `null` on failure.
- `{id}-formatter.js` — takes structured data → markdown string.
- `index.js` — registration object (see [Site Module Spec](#site-module-spec) below).

### 6. Register it

Add one line to `src/utils/site-registry.js`:

```js
const myModule = require('../sites/{id}');
const _sites = [xModule, claudeModule, myModule];
```

No changes needed to popup, background, or content script — the registry handles detection, dispatch, and popup UI dynamically from the module's registration object.

### 7. Verify against the sample

If you captured a sample markdown file (e.g., `samples/grok-2026-04-14.md`) showing the expected output shape, diff your output against it. Otherwise hand-check that the markdown reads well.

### 8. Write tests

Add `tests/unit/{id}-extractor.test.js` and `tests/unit/{id}-formatter.test.js` following the Claude/X patterns. Use small inline HTML fixtures (parse via `jsdom`) — not the full multi-megabyte sample.

---

## MCP Tool Reference (the useful ones)

| Tool | Use for |
|------|---------|
| `navigate_page` | Load a URL in the MCP's Firefox |
| `list_pages` / `select_page` | Multi-tab workflows |
| `take_snapshot` | a11y-filtered structural tree. Scope with `selector`, enable `includeAttributes` for ARIA |
| `evaluate_script` | **The workhorse** — arbitrary JS in page context. Use this for everything attribute-related |
| `screenshot_page` / `screenshot_by_uid` | Visual verification |
| `click_by_uid` / `fill_by_uid` / `hover_by_uid` | Interact with UIDs returned from a snapshot |
| `list_console_messages` / `list_network_requests` | Debug page-level errors, observe API calls |
| `get_firefox_info` | Version info for diagnostics |

### What works beyond what a content script can do

- Open shadow DOM traversal via script (closed shadow roots are still opaque).
- `getComputedStyle` and arbitrary attribute reads.
- Localhost and internal tools.
- Observing network requests (useful when the rendered DOM lacks metadata but an API response has it).

### Caveats

- Cross-origin iframes appear as placeholder nodes only.
- MCP sets `navigator.webdriver = true` — may trip Cloudflare/Turnstile/Akamai bot detection. Public share pages usually fine, but flag if a site misbehaves.
- Pre-1.0 MCP — rough edges expected.

---

## Site Module Spec

Every site module in `src/sites/{id}/index.js` exports this shape:

```js
module.exports = {
  id: 'grok',              // unique string id
  name: 'Grok',            // human-readable name (shown in popup)
  hostnames: [             // exact hostname matches
    'grok.com', 'www.grok.com'
  ],
  contentTypes: [          // one or more content variants
    {
      id: 'conversation',
      label: 'Conversation',
      icon: '<svg ...>'    // SVG string, 14x14, currentColor stroke
    }
  ],
  Extractor: GrokExtractor,  // class with extract(contentType, doc, url) → data|null
  Formatter: GrokFormatter   // class with format(contentType, data, converter) → string
};
```

### Extractor contract

```js
class MyExtractor {
  extract(contentType, doc, url) {
    switch (contentType) {
      case 'conversation': return this.extractConversation(doc, url);
      default: return null;
    }
  }
  // ... one method per content type, each returns a plain data object or null
}
```

- **Always accept `url` as a parameter** — don't read `document.location`. This avoids mocking location in jsdom tests.
- **Return `null` on any failure** — the content script falls back to the general Turndown conversion path if extraction returns null. Never throw.
- **Return plain data objects** (no DOM nodes, no functions) — the formatter is a separate pure transform.

### Formatter contract

```js
class MyFormatter {
  format(contentType, data, converter) {
    switch (contentType) {
      case 'conversation': return this.formatConversation(data, converter);
      default: return '';
    }
  }
}
```

- Third param `converter` is an optional `MarkdownConverter` instance for HTML→markdown on rich content blocks (e.g., assistant responses that contain real HTML). Use `converter.convertHtmlFragment(html)` when available, with a tag-strip fallback for tests that don't pass one.

### Reference implementations

- **Simple (single content type, HTML-in-turns):** `src/sites/claude/`
- **Multiple content types + selector resilience:** `src/sites/x/` — uses a `_query()` helper that tries `data-testid` → ARIA roles → structural tags in priority order.

### Selector resilience pattern

For sites with unstable class names (all the big SPAs), follow the X/Twitter pattern:

```js
_query(root, selectors) {
  for (const sel of selectors) {
    const el = root.querySelector(sel);
    if (el) return el;
  }
  return null;
}

// Usage: try testid → role → tag
this._query(container, [
  '[data-testid="tweetText"]',
  '[role="article"] p',
  'article p'
]);
```

---

## Gotchas Observed in the Wild

### Unicode weirdness

Grok citation chips use **U+2060 (word joiner)** as a prefix on chip text (e.g. `⁠Thenewstack`). Looks like a space, isn't. Normalize with `text.replace(/⁠/g, '')` before formatting.

### Lazy-loaded images

Sites frequently put placeholder SVGs in `src` and the real URL in `data-src`, `data-lazy-src`, or `srcset`/`data-srcset`. `src/utils/markdown-converter.js` has `_resolveImageSrc()` that handles this — reuse it rather than reimplementing.

### Login-gated content

If a site requires login:
1. Quit Claude Code (releases the profile lock).
2. Launch FF Dev Edition manually, open the MCP profile, log in.
3. Restart Claude Code. Auth persists in the profile.

### When `evaluate_script` hangs

Almost always means `--connect-existing` has crept back into the MCP args. Check `claude mcp list` and reinstall with the command at the top of this doc if needed.

### When `list_pages` fails with "Failed to create session: timeout"

The MCP's spawned Firefox didn't start. Verify the profile path in `claude mcp list` still exists on disk.

---

## Currently Registered Sites

| id | name | Hostnames | Content types |
|----|------|-----------|---------------|
| `x` | X / Twitter | `x.com`, `twitter.com` (+ `www.`/`mobile.` variants) | Tweet, Thread, Article |
| `claude` | Claude | `claude.ai`, `www.claude.ai` | Conversation |

## Queued / Planned Targets

- **Grok** (`grok.com`) — sample URL and markdown saved in `samples/grok-2026-04-14.{html,md}`. Next in line. Notes on DOM structure live in the memory file `project_grok_and_live_dom_eval.md`.

---

## Pointers

- Existing site modules: `src/sites/claude/`, `src/sites/x/`
- Registry: `src/utils/site-registry.js`
- MCP project (upstream): https://github.com/mozilla/firefox-devtools-mcp
- Samples directory: `samples/` (gitignored? check before committing large HTML)
