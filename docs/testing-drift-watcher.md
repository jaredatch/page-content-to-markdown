# Live drift watcher

Real browser, real share URLs, real extension. Runs on a schedule, hits each URL, saves markdown, diffs against an audited baseline. When the diff is non-trivial after stripping ephemera, something on the live site changed and someone needs to look. This is **Tier 2** of the project's testing strategy; the companion piece is the [fixture-based regression suite](testing-fixtures.md).

## Status

**Deferred. Design captured, build pending post-ship evidence.**

This doc is the design and the future runbook. The architecture section becomes the source of truth once it ships, but the deliberate choice right now is *not to ship it yet*. See [When to build this](#when-to-build-this).

## When to build this

Not before the extension ships, and not the moment the extension ships either. Reasoning:

- The [fixture suite](testing-fixtures.md) already covers code-regression detection on every push. That's the bulk of the protection.
- Quarterly manual recapture of baselines covers the staleness gap a watcher would catch automatically. At four sites, by hand once a quarter is real but bounded work.
- Drift watcher pays for itself when the supported-site count grows past what manual recapture sustains, or post-ship evidence shows a specific provider drifts often enough to break real users between recaptures.

Concrete trigger criteria. Start the build when any one of these is true:

- Supported-site count is past 8.
- Two or more user-reported bugs in a single quarter trace to upstream DOM drift the fixture suite didn't catch.
- A manual recapture finds drift that would have been caught a month earlier with automation, and that delay caused a real user-facing problem.

Until then the design lives here, the implementation plan is ready to execute, and no code or infrastructure exists.

## Why this exists

Site DOM drifts. ChatGPT renames classes, X reshuffles testids, Claude changes how artifacts render. The [fixture suite](testing-fixtures.md) catches our code regressing, but it can't catch the world changing underneath us because the captured HTML is frozen in time. Without something watching the live sites, we find out about drift via user reports or our own dogfooding, both of which are slow and reactive.

The pain compounds with site count. Four supported sites is barely manageable by hand. Twenty sites is impossible. If we want to grow the supported-sites roadmap to many sites, we need an automated signal that says "site X changed today, look at it."

## What it is and isn't

**It is** a weekly cron that reports drift between current extraction and an audited baseline. A red run is a signal to investigate, not a build failure that halts a deploy.

**It isn't** a regression test for our code. That's the [fixture suite](testing-fixtures.md). Drift watcher only runs against live URLs we don't control, which means flakiness is part of its design and CI gating on it would be wrong.

**It isn't** a logged-in test. Cloudflare blocks automation against authenticated sessions, and storing real account credentials in a cron environment is a problem we shouldn't have. Logged-in coverage stays a manual periodic dogfood, with the understanding that logged-out drift is a strong (~80%) proxy because both views share most of the DOM scaffolding.

## Implementation plan

Six phases. Build effort depends on the hosting tier picked in [Architecture and technical notes](#architecture-and-technical-notes): ~1 day for the GHA-alone path, ~2–3 days for the worker-delegated path. Initial baseline audit is on top of that, ~30 minutes per case.

### Phase 1: runner

`scripts/drift-check/runner.js`. Playwright + the stealth plugin. Reads cases from `cases.json`, opens each URL in a real browser with the unpacked extension installed, triggers the extension's save action, captures the resulting markdown, and hands off to the normalize and diff steps.

Choices to validate during build:

- **Browser**: Firefox first to match the dev environment. Add Chromium later if a particular site needs a different fingerprinting profile.
- **Extension load**: `web-ext run` style for Firefox, `--load-extension` for Chromium. Run against the built `dist/` so tests reflect what users would get.
- **Capturing the markdown**: drive the popup or the keyboard shortcut, then read clipboard. Reading the saved file is harder to automate cleanly because the download dialog varies by browser.
- **Run each case twice** to detect A/B variants. If the two runs diverge from each other, flag separately from "drift" and skip the diff.

### Phase 2: normalization

`scripts/drift-check/normalize.js`. A small file of regex passes that strip ephemeral content before diffing. Known ephemera from prior dogfood:

- The `**Date:**` metadata line (capture timestamp).
- Azure-signed image URL query params (`?se=...&sig=...&skt=...`). Strip the query, keep the path.
- ChatGPT estuary URL query params (`backend-api/estuary/content?id=...&ts=...`).
- Re-share URL identifiers if the user re-shares the conversation.
- Per-session query params some sites add to outbound links.

The list lives in code; new ephemera get added as they're discovered. The pattern is well-understood from the manual diffing on 2026-04-30 / 2026-05-01.

### Phase 3: baseline audit

For each case, capture the markdown the extension currently produces, audit it against the live page until it's correct, and commit it as the baseline. Same audit discipline as the fixture suite: a wrong baseline silently passes forever.

Initial scope: 5 cases per provider × 4 providers = 20 baselines. Each case picks a representative URL that exercises something interesting (long thread, code blocks, citations, images, attachments).

### Phase 4: scheduling

GitHub Actions cron schedule running the runner weekly. The exact dispatch shape depends on the chosen hosting model (see [Hosting model](#hosting-model) below). For the GHA-alone tier, the workflow runs Playwright directly. For the worker-delegated tiers, the workflow triggers a worker via webhook and waits for the result. Either way, the orchestration, secrets, and logs all live in GHA.

### Phase 5: notification

GHA already provides most of what's needed. Default path:

- **Workflow failure status + auto-issue.** Red status is visible in the repo; an action like `peter-evans/create-issue-from-file` opens an issue with the diff attached. Zero external dependencies.
- **Email is free.** GitHub already emails repo watchers on workflow failures by default.
- **Slack webhook** if email/issue notifications get missed in practice. Add later, not on day one.

### Phase 6: failure-report HTML

A small template that renders pretty diffs for review. Side-by-side or unified, with ephemera-stripped lines collapsed and real differences highlighted. The point is to make the "5 minutes per failure to triage" claim true; if reading the diff takes 20 minutes because the format is bad, the whole exercise loses ROI.

## Architecture and technical notes

To be filled in as the runner ships. Design decisions made up front:

- **Cases as data, not code.** `cases.json` keeps the runner generic. Adding a case is editing JSON plus committing a baseline, no runner changes.
- **Two runs per case** to detect A/B variants. If both runs match each other and the baseline, pass. If they match each other but not the baseline, real drift. If they don't match each other, A/B variant or transient anti-bot challenge; flag and re-run.
- **Real browser, not pure HTML fetch.** SPAs render their actual DOM only after JS executes; the extractor needs that DOM. Pure HTTP fetches aren't useful.
- **Stealth plugin against `navigator.webdriver`.** Helps with naive bot detection, doesn't beat Cloudflare Enterprise on its own.

### Hosting model

Cloudflare scores ASN reputation, so any cloud datacenter (GitHub Actions, Browserbase, Apify, AWS, Hetzner, and the rest) starts with negative reputation and gets blocked on stricter tiers. The hosting model has to match the protection level of the sites we're watching. Four layers, in cost order:

- **GHA alone, ~$0/mo.** Works for sites that don't aggressively block. Smoke-test each provider's share URL before relying on it. Likely fine for Claude, Grok, X share pages; verify.
- **GHA + residential proxy, ~$5–10/mo.** Outbound traffic via residential exit (Bright Data, IPRoyal, similar). Helps with IP reputation, but the GHA runner still has a CI-machine fingerprint Cloudflare can detect when it inspects beyond the IP.
- **GHA + dedicated worker (DO droplet) + residential proxy, ~$10/mo.** GHA owns scheduling, secrets, config, and result handling. The droplet runs the actual browser with a stable non-CI fingerprint and a residential exit. Roughly 70–80% reliable against ChatGPT-tier Cloudflare. Setup is real but bounded: a small worker service that takes a URL and returns markdown.
- **Managed bypass service, $50–100/mo.** Browserless BQL or ScrapingBee Cloudflare-bypass tier. Pays for full-time engineering against bot detection. The most reliable option for ChatGPT-tier protection, with a corresponding price tag.

Pick the cheapest tier that covers the actual targets. For most sites, GHA alone is enough. ChatGPT specifically is the hard case; if drift detection on ChatGPT becomes important, the third or fourth tier earns its keep, and the choice between them comes down to cost vs. reliability tolerance for that one provider.

## Current coverage

Populated post-Phase 3. Format:

| Provider | Case slug          | URL | Baseline file                     | Last audited |
| -------- | ------------------ | --- | --------------------------------- | ------------ |
| (TBD)    | (TBD)              | ... | `tests/drift-baselines/...`       | YYYY-MM-DD   |

## Adding a new case

Once the system is shipped, the loop from URL pick to committed case:

1. **Pick a representative URL.** Public share, stable (not edited regularly), exercises something the existing cases don't already exercise. For a new site, start with the most common content type users will save.

2. **Run the extension against it manually.** Save the markdown. Look at it.

3. **Audit the markdown.** Read it against the live page. Every paragraph, every code block, every link, every image. Same discipline as the fixture suite. Wrong audit, silent failure forever.

4. **Save the baseline** to `tests/drift-baselines/{provider}-{slug}.md`.

5. **Add the case** to `scripts/drift-check/cases.json`:

   ```json
   {
     "provider": "x",
     "slug": "linus-thread",
     "url": "https://x.com/LinusEkenstam/status/...",
     "baseline": "tests/drift-baselines/x-linus-thread.md",
     "contentType": "thread"
   }
   ```

6. **Run drift check locally** to confirm the new case passes:

   ```
   npm run drift-check -- --provider=x --slug=linus-thread
   ```

7. **Commit** baseline + case entry.

## When a drift run fails

1. **Read the report.** Which case(s) failed? What's the diff after normalization?

2. **Decide what kind of failure it is**:

   - **Diff is only ephemera that escaped normalization** → extend `normalize.js` to cover the new pattern. Re-run, expect green.
   - **Diff is real, the new output is wrong** (broken extraction) → DOM drift on the upstream site has broken the extractor. Investigate which site change caused it, fix the extractor, then re-baseline.
   - **Diff is real, the new output is better** (richer extraction, cleaner formatting) → site changed in a way that improves extraction. No code fix needed. Re-baseline, audit the new output, commit.
   - **The two runs of the same case disagreed** → A/B variant or transient anti-bot challenge. Re-run a few times. If consistent, document the variant in the case entry and consider splitting it into two cases. If transient, ignore.
   - **All cases for one provider failed** → site-wide change (DOM rewrite, redesign rollout, anti-bot escalation). Treat as one investigation, not N. Likely a bigger fix or a known-pending update from the provider.
   - **Many providers failed at once** → almost certainly something on our side (build broken, extension not loading correctly in the runner, normalize.js regex bug). Diagnose locally before assuming the world rewrote itself.

3. **Update the failure log** at the bottom of this file with what you found and how you fixed it.

4. **If a baseline got updated**, audit the new one as carefully as the original. The baseline is the source of truth; one bad baseline poisons the case forever.

## Maintenance

Triage time per failure: ~5–15 minutes including the fix or re-baseline. Some failures will be ephemera that's a 2-minute fix. Some will be real DOM drift that's a 30-minute extractor fix. Average across the year: ~10 min.

Expected failure rate: rough estimate based on 4 sites and our experience to date is ~one real DOM-drift event per provider per quarter, plus ~1–2 ephemera-escapes per quarter, plus occasional A/B variant noise. Call it ~20 minutes of triage per month at current scale.

If costs run substantially higher than that for sustained periods, that's the signal to revisit the design. Likely root causes worth investigating:

- A specific provider drifts much more than others (maybe drop them from the watcher and rely on fixture tests + manual dogfood)
- Normalization is leaking too many false positives (extend `normalize.js`)
- A/B variants are common enough that two-runs isn't sufficient (move to median-of-N, or weighted scoring)

Quarterly: re-audit each baseline against a fresh capture of the live page. The watcher only catches diffs against the baseline; it can't catch silent feature additions where the baseline never represented the new feature in the first place. Quarterly audit is the closing of that gap.

## Out of scope

Things this tier explicitly does not cover:

- **Code regression detection.** That's the [fixture suite](testing-fixtures.md). A drift watcher run can't tell whether the cause is upstream or downstream without context.
- **Browser-integration paths.** Popup, content script messaging, clipboard, file save, picker UI. Selenium e2e is the planned answer.
- **Logged-in flow correctness.** Cloudflare blocks automated logged-in browsing reliably enough that there's no path. Manual periodic dogfood covers it; the assumption is that logged-out drift is a strong proxy for logged-in regressions because both views share most of the DOM.
- **Performance regressions.** A run that takes twice as long but produces correct output passes here. Performance work happens elsewhere if it happens at all.
- **Cross-browser parity.** Drift watcher runs in one browser at a time. Cross-browser differences are a separate concern handled at the e2e layer.

## Failure log

Append-only. Each entry: date, case(s) affected, root cause, fix.

(empty until shipped)

## Related

- [Fixture-based regression tests (Tier 1)](testing-fixtures.md): the deterministic counterpart to this watcher.
- [Building site extractors](building-site-extractors.md): the live-DOM workflow that informs both the fixture suite and the baseline audits here.
