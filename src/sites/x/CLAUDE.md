# X / Twitter Site Module

Three content types: `single-tweet`, `thread`, `article`. Lives at `x.com` and `twitter.com`.

## Tweet Body Formatting

Long-form tweet body preserves emojis and inline links:
- Mentions → `[@user](https://x.com/user)`
- Hashtags → `[#Tag](https://x.com/hashtag/Tag)`
- Posted URLs unmask t.co to display-text destination, with truncated-display fallback

The verified author indicator is rendered as `✓` after the display name.

**Engagement summary** is in X visual order (replies → reposts → likes → bookmarks → views) with bookmarks/views captured. Timestamps are in viewer-local time, matching X's on-page display.

**Community Notes** (`birdwatch-pivot`) render as a labelled blockquote between content and engagement footer. Multi-line: per-line `>` blockquote prefixing so source links and trailing paragraphs stay inside the callout.

## "Show More" Auto-Expansion (`prepareForExtraction`)

X uses `[data-testid="tweet-text-show-more-link"]` buttons to truncate long tweets (>~280 chars). The site module's `prepareForExtraction(contentType, doc, url)` hook clicks these buttons in scope (focal tweet for `single-tweet`, all chain tweets for `thread`) and polls for their removal — X inlines the full body via API on click and removes the button. 5s timeout per button (parallel `Promise.all`); on timeout we proceed with whatever's in the DOM.

## Thread Chain Detection

`_collectThreadChain(tweets, focal, focalHandle)` walks DOM-forward and DOM-backward from the focal, gathering a contiguous run of same-author tweets. It:

- Skips empty `<article>` wrappers (X's reply-composer chrome — they have no `User-Name` and shouldn't break the chain)
- Stops hard at the first real tweet whose author differs from the focal's

Used by `extractThread` (output) and `prepareForExtraction` (Show-more scope). The previous all-same-author rule swept up the author's replies-to-commenters from the discussion section below the thread; the chain rule excludes them by stopping at the first commenter.

## Quote Tweets and Link Cards

Both render as embedded blocks below the tweet body and need to be excluded from outer-tweet field extraction:

- **Quote tweets** sit inside `[role="link"][tabindex="0"]` containing a nested `[data-testid="User-Name"]` (`_findQuoteContainer`).
- **Link cards** sit inside `[data-testid="card.wrapper"]` with a single anchor wrapping image + title and a sibling div carrying the canonical `From {domain}` text (`_extractCard`).

`_extractAuthor`, `_extractText`, `_extractTimestamp`, and `_extractMedia` all accept an `exclude` parameter (single element or array) so the focal tweet's fields skip both subtrees. Without this, the focal `<time>` silently inherits the quoted tweet's timestamp (the quote's `<time>` always appears first in DOM order) and the card image double-lists in `media`.

Quote tweets also get their own card extraction inside `_parseQuoteContainer` so a quoted post's card renders as part of its blockquote. Quote bodies (multi-line) get per-line `>` blockquote prefixing.

Link cards render as `🔗 [**title**](t.co URL) — domain` followed by the OG image; the card image is excluded from `_extractMedia` so it doesn't double-list.

## URL-Shaped Link Label Cleanup

In `_formatTweetLink`, when the display label starts with `http` (i.e., it's an inlined URL link, not a mention or hashtag) and ends with `…` or `...`, the trailing ellipsis gets stripped via `_stripUrlEllipsis`. X uses ellipses as visual chrome on truncated long-URL displays even when the underlying href is intact. The t.co fallback path (where the real URL is unrecoverable) keeps its `…` since the ellipsis is meaningful chrome there.

## Articles

X Articles live at three URL forms:
- `/i/article/{id}` (URL regex match)
- `/{user}/status/{id}` (canonical, DOM-detected)
- `/{user}/article/{id}` (alternative, DOM-detected)

All three serve the same `[data-testid="twitterArticleReadView"]` body, so detection uses URL regex first then falls back to a DOM testid check.

`extractArticle` uses a layered scope:
- The broader `pageContainer` (`article[role="article"]`) holds author / `<time>` / engagement chrome
- The read view holds the article-specific content
- `[data-testid="twitterArticleRichTextView"]` holds *just the body* (excludes engagement chrome)

Title comes from `[data-testid="twitter-article-title"]` (the page-level og:title is the noisy `Author on X: "..." / X` wrapper). Cover image is the first `[data-testid="tweetPhoto"]` inside the read view but outside the body. Engagement (replies/reposts/likes/views) lives on the `pageContainer` outside the read view; the formatter renders it as an emoji footer at the very end of the article (matching the tweet convention).

### `_sanitizeArticleBody` Pipeline

Body HTML is run through `_sanitizeArticleBody`, which executes a pipeline of normalization passes — order matters where noted. See JSDoc on the function and each helper for full detail; summary:

1. `_promoteInlineBold` — wraps `<span style="font-weight: bold">` (or numeric ≥600) in `<strong>` so Turndown emits `**…**`. X uses inline styles instead of `<strong>`/`<b>`.
2. `_promoteInlineItalic` — same shape for `<span style="font-style: italic">` (or `oblique`), wrapping in `<em>`.
3. `_flattenHeadings` — `<h2><div><span>text</span></div></h2>` → `<h2>text</h2>`, otherwise Turndown emits `##\n\ntext` due to the block-level child.
4. `_sanitizeCodeBlocks` — strips `[data-testid="markdown-code-block"]` chrome (visible language-label span + Copy button).
5. `_replaceVideoWithPoster` — swaps `<video poster="…" src="…">` for `<img alt="GIF" src="{poster}">`. Also dedupes X's GIF render (still `<img>` + `<video poster=...>` with same URL → one `<img>`).
6. `_unwrapMediaLinks` — unwraps `<a href="/.../media/...">` link wrappers around inline tweetPhotos and video components.
7. `_stripVideoLabels` — strips bare `<span>GIF</span>` / `<span>Video</span>` badge spans inside `videoComponent`/`videoPlayer`.
8. `_inlineMentionWrappers` — unwraps the block-level `<div>` X wraps inline mentions in.
9. `_cleanMentionUrls` — strips the leading `@` from mention URLs (`/@user` → `/user`; displayed text stays `@user`).

Blockquotes (`<blockquote class="longform-blockquote">`, used for pull quotes / call-outs) work natively through Turndown's default rule even with the Draft.js `<div data-block><span data-text>` wrapping inside.

## i18n Hardening

X site module is hardened for non-English locales:
- Engagement extraction is testid-primary with positional summary fallback
- Community-note body detection is structural (no phrase matching)
- Video-label stripping is structural (leaf-span rule)

Number parsing (`_parseCount` / `_extractOrderedNumbers`) handles `,` `.` and whitespace as thousand separators (US/EU/FR formats).

## `detectAvailable(doc, url)` Probe

- Article URL or DOM `[data-testid="twitterArticleReadView"]` → `{ article: true }` (others false; mutually exclusive — extracting "just the tweet wrapper" of an article page yields title+author with no body).
- Else `/status/` URL with focal tweet → `{ 'single-tweet': true }`, plus `thread: true` when `_collectThreadChain` returns ≥ 2 elements.
