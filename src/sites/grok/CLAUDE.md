# Grok Site Module

Single content type: `conversation`. Works on share pages (`grok.com/share/...`) and active chats (`grok.com/c/...`).

## Turn Markers

Turns are matched by `[data-testid="user-message"]` / `[data-testid="assistant-message"]`.

## Reasoning Collapse

Assistant reasoning lives at `.thinking-container > button` with text like `Thought for Ns`.

## Citations

Citation chips are `<a class="citation">` with a U+2060 word-joiner prefix that's stripped. Multi-source popover buttons (`<button class="no-copy ...">`) are removed since they have no stable link target.

Citation handling is uniform with ChatGPT — strip by default to keep saved conversations clean. Future Tier-2 setting will offer `strip | inline | footnotes`.

## Code Blocks

`[data-testid="code-block"]` panels are replaced with clean `<pre><code class="language-X">` before Turndown.

## Image Alts

Images with empty alt get a default `alt="Image"` (avoids `![](url)` in output).

## Title

`document.title` with the page-context suffix stripped:
- `" | Shared Grok Conversation"` on share pages
- `" - Grok"` (incl. en/em-dash variants) on active chats

The site formatter's `filenameTitle` returns `Grok — {title}` (or `Grok Conversation` when title is empty after stripping).
