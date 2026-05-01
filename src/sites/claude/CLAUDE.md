# Claude.ai Site Module

Single content type: `conversation`. Works on share pages (`claude.ai/share/{id}`).

## DOM Structure

- **Page header:** `[data-testid="page-header"]` contains title + "Shared by {name}"
- **Conversation container:** `.flex-1.flex.flex-col.px-4.max-w-3xl`
  - Child 0: disclaimer banner (`border-0.5` class)
  - Children 1..N: alternating human/claude turns
- **Human turns:** contain `[data-testid="user-message"]` with `<p>` elements
- **Claude turns:** contain `.font-claude-response` with `.standard-markdown` content

## "Shared by {name}" — `i18n note`

The "Shared by {name}" extraction uses an English phrase prefix to locate the speaker name in the page header. This is **cosmetic only** (used to title the conversation header in markdown output) — it does not gate any extraction. Per `src/sites/CLAUDE.md`'s i18n rules, phrase matching for cosmetic behavior is acceptable; if non-English Claude share pages start rendering a translated label, the extractor degrades gracefully (no name shown) rather than failing.

Followup tracked in `private/PLAN.md` → Future Ideas → "i18n hardening followups".

## Title

`filenameTitle` returns `Claude — {title}` or `Claude Conversation` when title is empty.
