# How Content Extraction Works

When you pick "Page content" in the popup and hit Copy or Save, the extension doesn't dump the whole page into your clipboard. Most of a modern web page is chrome: navigation, ads, footers, cookie banners, comment threads. None of that is what you came for, so we try to find the actual content and leave the rest behind.

This doc covers how detection works, what gets stripped, what happens when a page is unusual, and what to do if extraction surprised you.

---

## The shape of the strategy

Three phases, roughly:

1. **Find the main content.** Try a list of known selectors in priority order. If one matches and contains real content (paragraphs, headings), use it.
2. **Strip the chrome that's left.** Even inside the content container there's often junk: share widgets, newsletter callouts, ad slots, related-content rails. We pattern-match on class and ID names and remove those during conversion.
3. **Convert what's left to markdown.** Powered by [Turndown](https://github.com/mixmark-io/turndown) with the GFM plugin (tables, strikethrough, task lists).

If phase 1 finds nothing, we fall back through progressively more lenient strategies, ending with raw text extraction. Conversion always returns *something*. We'd rather give you imperfect output than a blank clipboard.

The code is in `src/utils/markdown-converter.js` (heuristics + Turndown setup), `src/content/content-script.js` (orchestration, fallback wiring), and `src/utils/simple-universal-extractor.js` (text-dump fallback).

---

## Where we look for main content

Selectors are tried in priority order. The first that matches *and* contains real content wins. The full list lives in `_contentSelectors()` in `src/utils/markdown-converter.js`:

**Semantic HTML** (the simple case):

- `article`, `main`, `[role="main"]`

**Common CMS patterns** (WordPress, Ghost, etc.):

- `.content`, `.post-content`, `.entry-content`, `.article-content`, `.article-body`, `.post-body`, `.entry-body`, `#content`

**News and blog patterns:**

- `.article`, `.story`, `.news-content`, `.blog-post`, `.post`

**E-commerce patterns:**

- `.product-description`, `.product-details`, `.product-info`

**Documentation patterns:**

- `.documentation`, `.docs-content`, `.readme`

**Framework patterns:**

- `[data-testid="article"]`, `[data-content="true"]`, `.prose`, `.rich-text`

**Generic content containers:**

- `.container .content`, `.main-content`, `.primary-content`, `.page-content`

A match only counts if `hasSignificantContent()` returns true: 500+ characters of trimmed text **and** at least three `<p>` descendants. This stops us matching a sidebar that happens to be called `.content`, or an `<article>` wrapping a related-stories grid whose aggregated link text would pass a looser gate.

---

## What we strip out

Once we've found the main content, Turndown walks the tree and removes anything matching our exclusion patterns. The full set is in `setupCustomRules()` in `src/utils/markdown-converter.js` (the `removeNonContent` rule and the regex constants above it).

**Tags removed entirely:**

- `script`, `style`, `iframe`, `object`, `embed`, `noscript`

**Page chrome:**

- `<nav>`, `<aside>`, `<header>`, `<footer>` elements
- Anything with `nav`, `menu`, `aside`, `header`, `footer` in a class or ID

**Ads and engagement noise:**

- `ad` (word-boundary matched, so "header" and "leader" are safe), `advertisement`, `banner`
- Sponsored content, related/recommended rails
- `like`, `vote`, `rating` (engagement counters)

**Page interruptions:**

- `popup`, `modal`, `overlay`, `cookie`, `gdpr`

**Conversion CTAs:**

- `subscription`, `newsletter`, `signup`
- `buy-now`, `purchase`, `cart`, `checkout`

**Social and sharing:**

- `social`, `share`, `comment`, `related`, `recommended`

**Navigation aids:**

- `breadcrumb`, `pagination`

Short patterns use word-boundary regex to avoid false positives. A class called `header` shouldn't match just because "ad" appears inside it. Longer patterns share a single combined regex for performance, since this filter runs against every node Turndown visits.

### A note on selecting elements

When you pick elements directly via the **select elements on page** link (or right-click → "Copy selection as Markdown"), we apply a much lighter filter: only universal junk like ads, popups, consent banners, and e-commerce CTAs. Navigation, headers, social widgets, and comments are left alone. You've already chosen what you want, and second-guessing would be obnoxious.

The lighter filter lives in `convertHtmlFragment()` in the same file.

---

## When the page doesn't fit a known shape

If no priority selector matches, we try fallbacks, each more permissive than the last:

1. **Largest text block.** Among top-level and second-level body containers, pick the one with the most text (200+ characters). Skips anything that *looks* like chrome based on class or ID. (`findLargestTextBlock` / `_findLargestTextBlockNode`)
2. **Framework-specific patterns.** Common SPA roots: `#root article`, `#__next main` (Next.js), `#__nuxt main` (Nuxt.js), `.v-application main` (Vue + Vuetify), `ion-content` (Ionic), `[data-reactroot] main`. (`findFrameworkContent` / `_findFrameworkContentNode`)
3. **Cleaned body content.** Clone `<body>`, remove anything matching a hardcoded list of chrome selectors, return what's left. (`getCleanedBodyContent`)
4. **Universal text extraction.** A separate module (`SimpleUniversalExtractor`) walks every visible text node, drops obvious nav and button text, and returns a plain text dump. Always succeeds.
5. **Emergency markdown.** If even the text dump throws, you get a stub with the page title, URL, and a note that extraction failed. You'll never get a blank result.

The chain lives in `convertPageToMarkdown()` at the top of `src/content/content-script.js`.

---

## Size guards

Some pages are absurd. A 100,000-element comment thread or a 30MB SPA dump will choke any naive HTML-to-markdown conversion. Two guardrails:

- **50,000 element threshold.** If `document.body.querySelectorAll('*')` returns more than that, we skip Turndown entirely and go straight to the text dump fallback. Less polished, but the browser doesn't hang.
- **5MB HTML cap.** The string-based `convertToMarkdown(html)` truncates input over 5MB. Mostly relevant when something feeds us serialized HTML; the DOM-direct path doesn't go through it.

Both thresholds live in `content-script.js` and `markdown-converter.js`. If you hit them regularly, that's worth a bug report.

---

## Why your extraction might not match what you expected

**"Something obvious got cut."** Exclusion patterns are name-based. A class like `.site-share-callout` holding actual article content will get stripped because "share" appears in the name. False positives like this are the most common surprise.

**"Something junk got included."** Either we don't have a pattern for it, or the page uses a class name that doesn't match anything we look for. Ads without recognizable class hints slip through.

**"The whole page came out as a wall of text with no headings."** None of the content selectors matched, and we fell through to the text-dump fallback. Look for a console message starting with `📄 [simple-extractor]` to confirm.

**"It picked the wrong section."** An earlier selector in the priority list won. For example, a tiny `<article>` element for a "related stories" tile beating the real `.post-content`.

To see which path the extraction took, open DevTools and watch the console. Every step logs with an emoji prefix: `🎯`, `📊`, `📄`, `⚠️`, `🚨`.

If a page consistently extracts badly, it might be a candidate for a [site action](supported-sites.md). Those get hand-tuned extraction that bypasses all of the above.

---

## See something missing?

These patterns aren't exhaustive. New class names show up all the time. If you've found one that should be filtered (or one we filter that we shouldn't), a small PR is welcome.

See [CONTRIBUTING.md](../CONTRIBUTING.md) for the full guide. The short version: edit the patterns in `setupCustomRules()` of `src/utils/markdown-converter.js`, add a test case in `tests/unit/markdown-converter.test.js`, and open a PR.
