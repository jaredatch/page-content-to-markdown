# Fixture-based regression tests

Captured HTML in the repo, run through the extractor in jsdom, asserted via Jest. Cheap, deterministic, runs on every push. Catches code regressions in the site modules instantly. This is **Tier 1** of the project's testing strategy; the companion piece is the [drift watcher](testing-drift-watcher.md).

## Status

**Shipped, with room to grow per site.** All four site modules now have at least one captured-HTML regression case in CI: ChatGPT (3 share + 2 logged-in), X article, Claude share, Grok share. ChatGPT remains the deepest coverage and is still the reference implementation. The remaining work is breadth — X needs thread / quote-tweet / single-tweet captures alongside the article, and Claude/Grok each want a second and third capture exercising different content shapes (long reasoning, code blocks, attachments).

## Why this exists

Site DOM is messy and selector-fragile. Unit tests with hand-written inline HTML are useful for testing one feature at a time, but they don't catch the "sanitize step accidentally drops a real-world structure" class of bug because the fixture is too clean. Real captured pages reproduce the actual DOM the extractor sees in production, and re-running the extractor against that same HTML on every push is the cheapest way to keep regressions out.

The pattern complements the [drift watcher](testing-drift-watcher.md) but doesn't replace it. Fixture tests catch *our code* regressing. The drift watcher catches *external sites* changing in ways that break us. Both matter, neither is sufficient alone.

## Implementation plan

The pattern itself is shipped, so most of this is about extending coverage to the other three site modules.

### Phase 1: pattern definition (done)

Captured HTML lives in `private/captures/`, which is gitignored. Tests gate on `fs.existsSync()` so the build stays green for contributors without local captures — those tests skip via `test.skip`. Each provider's regression block sits inside `tests/unit/{site}-extractor.test.js` under a `describe('regression: real captures', ...)` group. The ChatGPT block at the bottom of `tests/unit/chatgpt-extractor.test.js` is the reference implementation.

### Phase 2: extend to X, Claude, Grok

Each site needs at least three captures picked to exercise the messy parts of that site. X has thread / quote tweet / article as obvious candidates because the extractor branches hard on those. Claude and Grok need a less obvious mix (long conversations, code blocks, attachments) and the right cases are best chosen by looking at what the existing inline-fixture unit tests already cover and filling the gaps with real-world DOM. The capture mechanics themselves are in `building-site-extractors.md`; the work specific to this phase is auditing the markdown output against the live page until it's correct, then committing both the fixture and the test case.

**First case landed for each site (2026-05-01).** X article (`x-2026-04-28-article-fixture.html`) pins the `_sanitizeArticleBody` pipeline — title from testid, mention-URL cleanup, code-block chrome stripping, positional engagement parsing. Claude share (`claude-share.html`) pins title + sharedBy extraction, the disclaimer-banner skip, citation anchors surviving as `<a href>`, and the "Searched the web" button being filtered out. Grok share (`grok-2026-04-24-share.html`) pins title-suffix stripping, the 4-human / 4-assistant alternation, "Thought for Ns" labels on every assistant turn, citation chrome removal, and code-block language inference. Remaining captures per the table below are the breadth work for this phase.

### Phase 3: standardize the test shape

Each provider's regression block currently differs slightly. Pull the shared scaffolding (file existence gate, jsdom construction, common asserts like "no writing-block chrome leaks") into a small helper in `tests/unit/_capture-helpers.js` so adding a new case is one function call plus the asserts that are unique to that case.

### Phase 4: contributor docs

Once the pattern is uniform, document "how to add a case" as a runbook section in this file (already started below) and link from `building-site-extractors.md`. New site modules ship with at least one capture case from day one.

## Architecture and technical notes

**Capture format.** HTML files only; no markdown alongside. The audited markdown output is implicit in the test asserts. Storing both invites drift between them.

**File naming.** `{site}-YYYY-MM-DD-{slug}.html` for shared/public captures. Add `-loggedin` suffix for captures from a logged-in session. The date is the capture day, not the conversation date, so file age tells you when the fixture was last refreshed.

**jsdom URL.** Always pass a `url` to `new JSDOM(html, { url: '...' })` so location-aware extractors work. URL form matters: `chatgpt.com/share/x` and `chatgpt.com/c/x` exercise different code paths in extractors that branch on path.

**File-existence gate.** The pattern at the top of each regression block:

```js
const capturePath = path.join(__dirname, '..', '..', 'private', 'captures', '...');
(fs.existsSync(capturePath) ? test : test.skip)('extracts ...', () => { ... });
```

This keeps the build green for contributors who don't have local captures. Skipped tests are visible in the Jest output, so you can see what's being skipped if you go looking.

**What to assert.** Lean toward structural and content-shape assertions, not full markdown-equality. Equality assertions break on every rendering tweak even when extraction is correct. Prefer "this turn count is N", "this string appears exactly once", "this content does not appear", "this language label resolved to `python`".

## Current coverage

| Site    | Capture                                                       | Tests reference                                              | Status |
| ------- | ------------------------------------------------------------- | ------------------------------------------------------------ | ------ |
| ChatGPT | `chatgpt-2026-04-30-share-ui-ux-design-feedback.html`         | `tests/unit/chatgpt-extractor.test.js` regression block      | live   |
| ChatGPT | `chatgpt-2026-04-30-share-formatting-elements.html`           | same                                                         | live   |
| ChatGPT | `chatgpt-2026-04-30-share-fish-tank.html`                     | same                                                         | live   |
| ChatGPT | `chatgpt-2026-04-30-share-loggedin.html`                      | same                                                         | live   |
| ChatGPT | `chatgpt-2026-04-30-share-2-loggedin.html`                    | same                                                         | live   |
| X       | `x-2026-04-28-article-fixture.html`                           | `tests/unit/x-extractor.test.js` regression block            | live   |
| X       | (thread, single-tweet, quote-tweet — none)                    | —                                                            | gap    |
| Claude  | `claude-share.html`                                           | `tests/unit/claude-extractor.test.js` regression block       | live   |
| Claude  | (long reasoning, code-block, attachments — none)              | —                                                            | gap    |
| Grok    | `grok-2026-04-24-share.html`                                  | `tests/unit/grok-extractor.test.js` regression block         | live   |
| Grok    | (long reasoning, attachments, generated images — none)        | —                                                            | gap    |

## Adding a new case

The whole loop, end to end. ~15 minutes per case once the workflow is muscle memory.

1. **Capture the page.** Use the live-DOM workflow in `building-site-extractors.md`. If the MCP can reach the page, that's preferred. If it's blocked by Cloudflare or behind login, use the DevTools `copy(document.querySelector('main').outerHTML)` workaround documented in the same file.

2. **Save the HTML** to a gitignored captures location your test will read from (existing tests use `path.join(__dirname, '..', '..', 'private', 'captures', '...')`, so any path under a gitignored `private/captures/` directory works). Filename convention: `{site}-YYYY-MM-DD-{slug}.html`, slug describing what the capture exercises ("thread-with-quote", "long-reasoning-with-citations").

3. **Generate the markdown** by loading the extension and saving the live page output. Save it next to the HTML for reference during audit. This is just a working copy; the asserts in the test file are the source of truth.

4. **Audit the markdown.** Read it carefully against the live page. Every paragraph, every code block, every link, every image. This is the step that determines fixture quality. A wrong audit means a green test that's testing the wrong thing forever.

5. **Add the test case** in `tests/unit/{site}-extractor.test.js` under the regression block. Mirror the existing patterns. Assert structural properties, not whole-document equality.

6. **Run locally:** `npm test -- {site}`. Confirm green.

7. **Commit the test code.** The captured HTML stays gitignored; only the test that consumes it lands in the repo.

## When a fixture test fails

A few common failure modes, each with a different fix. Triage by reading the Jest output first to see *which assertion* failed, then:

- **Recently changed extractor code, fixture's been stable for a while** → almost always your code regressed. Read the diff, fix the extractor, re-run.
- **Fixture is new, test fails on first run** → audit was wrong. Re-read the live page output against the asserts and reconcile.
- **Fixture and code have both been stable for weeks, suddenly red** → unlikely but possible. Either someone touched a shared utility (`markdown-converter.js`, sanitization helpers) or someone re-captured the fixture without re-auditing. Check git log on both.
- **Test passes but extension behavior is bad on the live page** → fixture is stale. The live site changed and the captured HTML no longer represents reality. Recapture, re-audit, re-commit.

## Maintenance

Adding a case takes ~15 minutes, with the audit eating most of that time.

Per-case maintenance after that is essentially zero. HTML files don't drift, so a fixture either keeps passing forever or gets replaced wholesale during a recapture. The trigger for a recapture is the [drift watcher](testing-drift-watcher.md) flagging real DOM drift on that provider; otherwise, leave fixtures alone.

In steady state this suite should fail only when extractor code regresses. Intermittent failures are a bug in the test itself (timing, randomness, environment) and worth fixing immediately rather than tolerating.

## Out of scope

Things this tier explicitly does not cover, so future-you doesn't try to make it do them:

- **Live DOM drift.** Captured HTML is frozen. If ChatGPT renames a class tomorrow, this suite will keep passing on yesterday's HTML. The [drift watcher](testing-drift-watcher.md) is the answer there.
- **Browser-integration paths.** Popup, content script messaging, clipboard, file save, keyboard shortcuts, picker UI on real layouts. jsdom can't simulate any of those. Selenium e2e is the planned answer.
- **Logged-in flow correctness.** A logged-in capture in this suite tests *extraction* correctness on logged-in DOM, but not the live login flow itself, account-specific features, or anti-bot challenges. Manual periodic dogfood covers those.
- **Cross-browser parity.** The same extractor runs in jsdom regardless of where it'll deploy. Real Firefox vs Chrome rendering differences only show up in live e2e.

## Failure log

Append-only. Each entry: date, what failed, what the actual cause was, what the fix was. After ~5 entries, patterns emerge.

(empty)

## Related

- [Drift watcher (Tier 2)](testing-drift-watcher.md): catches the upstream side that this tier doesn't.
- [Building site extractors](building-site-extractors.md): the live-DOM workflow that produces the captures used here.
