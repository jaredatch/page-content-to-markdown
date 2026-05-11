# Site Modules

Per-site extraction modules. Each handles one supported site (X/Twitter, Claude, Grok, ChatGPT). When working on per-site code, the relevant subdirectory's `CLAUDE.md` also loads with site-specific gotchas.

## Module Interface

Each site module is a directory `src/sites/{id}/` exporting a registration object from `index.js`:

```js
{
  id: 'x',
  hostnames: ['x.com', 'twitter.com'],
  icon: '<svg…/>',         // brand mark for the popup's "Available on …" divider
  contentTypes: [
    { id: 'single-tweet', label: 'Tweet', icon: '<svg…/>', pathPatterns: [/^\/[^/]+\/status\//] },
    { id: 'thread',       label: 'Thread', icon: '<svg…/>', pathPatterns: [/^\/[^/]+\/status\//] },
    { id: 'article',      label: 'Article', icon: '<svg…/>', pathPatterns: [/^\/i\/article\//, /^\/[^/]+\/(status|article)\//] }
  ],
  Extractor: XExtractor,   // DOM → structured data
  Formatter: XFormatter    // structured data → markdown
}
```

Brand icons are sourced from Font Awesome 7.x Free Brands (X, Claude, OpenAI/ChatGPT) and Lobe Icons (Grok); see `ATTRIBUTIONS.md` for licensing. Each is a monochrome silhouette using `fill="currentColor"`, rendered at 14×14 in the divider in `--text-primary`.

`SiteRegistry` (`src/utils/site-registry.js`) provides:
- `detect(url)` — hostname → site
- `getById(id)` — direct lookup
- `applicableContentTypes(site, url)` — filters `contentTypes` by `pathPatterns` against `URL.pathname`. Content types without `pathPatterns` are always-applicable.

### `pathPatterns` syntax

Each entry in `pathPatterns` can be a `RegExp`, a glob string, or a regex string. Matching is against `URL.pathname` only — hostname lives in the module's `hostnames` array, and query strings live in `detectAvailable` or are implicit. Compilation goes through `src/utils/path-pattern.js`.

| Shape | Example | Notes |
|---|---|---|
| `RegExp` literal | `/^\/share\//i` | Convention used by the existing modules. |
| Glob string | `'/item'`, `'/r/*/comments/*'`, `'/docs/**'` | `*` = one non-empty segment (`[^/]+`), `**` = multi-segment (`.*`, may be empty). Anchored both ends by default; matching is case-insensitive. URL-routing intent — `/users/*` matches `/users/alice` but not the half-formed `/users/`. |
| Regex string | `'^/(item\|comment)$'` | Anything containing `^ $ \ ( ) \| [ ] + { }` is compiled as a regex, not a glob. |

Patterns starting with `http(s)://`, hostname-shaped prefixes, or containing `?` are rejected with a clear console warning and skipped at runtime — drop the hostname (use `hostnames`) and don't try to match query strings here (use `detectAvailable`).

The popup uses `applicableContentTypes` to render only rows that fit the current URL. On URLs that match a single content type only that row renders; on `/status/` URLs all three X rows show because the popup can't disambiguate without DOM (the `detectAvailable` probe handles that — see below).

## Required Methods

### `Extractor`

```js
class XExtractor {
  extract(contentType, doc, url) { ... }      // returns structured data or null on failure
  detectAvailable?(doc, url) { ... }          // optional — returns { contentTypeId: bool, ... } or null
  prepareForExtraction?(contentType, doc, url) { ... }  // optional async hook before extract()
}
```

`extract()` must return `null` (not throw) on failure. The content script falls back to the general Turndown path when extraction returns null.

### `Formatter`

```js
class XFormatter {
  format(contentType, data) { ... }           // returns markdown string
  filenameTitle(contentType, data) { ... }    // returns filename-safe title or null (fall through to document.title)
}
```

## Optional Hooks

### `detectAvailable(doc, url)` — smart popup detection

Returns `{ contentTypeId: boolean, ... }` mapping each content type to whether it's actually present in the live DOM. Or `null` if the site has no probe.

The popup fires `probeContentTypes` on open *in parallel* with the synchronous URL-only render, then filters rows down to detected types. Conservative on inconclusive responses: `null` (no probe defined) or all-false (page may not have rendered yet) → keep URL-applicable rows. **No timeout** — popup is already showing rows, so a slow probe doesn't block UI; late responses still apply.

Quick-extract uses the same probe in `handleQuickExtract` to pick the smartest content type without opening the popup.

### `prepareForExtraction(contentType, doc, url)` — pre-extraction async hook

Awaited by the content script before `extract()` runs. X uses it to click "Show more" buttons and wait for them to disappear (5s timeout, parallel `Promise.all`) so long-tweet bodies are captured in full.

## `filenameTitle(contentType, data)`

Each formatter exposes this so file saves get a clean title instead of the noisy `document.title` (e.g., X stuffs the post body into the OG title). Returns `null` to fall through to `document.title`. Patterns:

- X tweet → `X Post by @{handle}`
- X thread → `X Thread by @{handle}`
- X article → `data.title` (the `twitter-article-title` value)
- Claude/Grok conversation → `Claude — {title}` / `Grok — {title}` (or `Claude Conversation` / `Grok Conversation` when title is empty)
- ChatGPT conversation → `ChatGPT — {title}` / `ChatGPT Conversation`

`ContentScript.extractSiteContent` calls this and overrides `metadata.title` before returning, so file saves use the clean title.

## i18n-Safe Selectors and Detection

**Site modules, detection logic, extractors, formatters, and any per-site code must be locale-stable by default.** The user base is global; English-phrase matching silently breaks for every non-English viewer. Always prefer, in order:

1. **`data-testid` attributes** — these never localize (`reply`, `retweet`/`unretweet`, `like`/`unlike`, `bookmark`/`removeBookmark`, `birdwatch-pivot`, `tweetText`, `User-Name`, etc.). First choice for any per-element identification.
2. **Structural / positional rules** — first/last child, role attributes (`role="link"`, `role="button"`), tag names, parent/sibling relationships. Use when there's no testid.
3. **Locale-invariant anchors** — brand names ("Grok", "Claude"), URL paths (`/hashtag/`, `/status/`), separator characters (`|`, `…`, U+2060), Unicode shape rules. These don't translate.
4. **Numeric position** — when reading aggregated values from a localized string (e.g., engagement summary), parse all numeric runs in order and map by position. The metric *order* is stable across locales even when the metric *words* aren't. Use `_parseCount` / `_extractOrderedNumbers` patterns from `x-extractor.js` — they handle `,` `.` and whitespace as thousand separators (US/EU/FR formats).
5. **Phrase matching is a last resort.** When unavoidable (e.g., extracting a localized speaker name like "Shared by {X}"), keep the phrase narrowly scoped and document it inline with an `i18n note:` comment explaining the limitation. **Never use phrase matching to gate extraction** (skip/include decisions) — it must only inform optional cosmetic behavior.

Existing reference implementations: `src/sites/x/x-extractor.js` `_extractEngagement` (testid + summary positional), `_extractCommunityNote` (position + role-based footer detection), `_stripVideoLabels` (structural leaf-span rule), `_parseCount` / `_extractOrderedNumbers` helpers. Mirror these in any new site module.

## Selector Resilience Pattern

`_query()` and `_queryAll()` helpers (see `x-extractor.js`) try selectors in priority order: `data-testid` (primary) → ARIA roles (fallback) → structural tags (last resort). When all selectors fail, extraction returns `null` and the content script falls back to the general Turndown conversion path.

## Adding a New Site Extractor

Create a module at `src/sites/{id}/` with `index.js` exporting the registration object, plus `Extractor` and `Formatter` classes, then add one `require()` line to `site-registry.js`. No changes to popup, background, or content script.

Full workflow including live-DOM inspection via `firefox-devtools-mcp` is in `docs/building-site-extractors.md`.

## Test Methods Accept URL Parameter

Extraction methods like `extractSingleTweet(doc, url)` take an optional URL parameter to identify the focal tweet. This avoids needing to mock `document.location` in jsdom tests.
