# ChatGPT Site Module

Single content type: `conversation`. Works on share pages (`chatgpt.com/share/{id}`) and active chats (`chatgpt.com/c/{id}`).

## Turn Structure

Turns are matched by `<section data-turn="user|assistant">` with `[data-message-author-role]` for the message body.

## User Turns

- **Attachments** render as a chip count: `*[N attachments uploaded]*`.
- **Prose** preserves embedded `<pre><code>` blocks as fenced markdown by walking children rather than flattening textContent (so users who paste code in their question keep the fence in saved output).

## Assistant Turns

Each assistant turn unifies three pieces in document order:

1. **Thinking label** (`Thought for Nm Ns`)
2. **Prose body** (`.markdown.prose`)
3. **Generated images** (in `[class*="imagegen-image"]` wrappers; dedup the 3-img-per-wrapper render to one `src`)

### Reasoning Models Stream Multiple Blocks Per Section

Reasoning models stream multiple `[data-message-author-role="assistant"]` blocks per section (preambles like "I'm checking…" → final answer). The section walker concatenates all of them in document order. Don't take only the first or last.

### Code Blocks (CodeMirror Reconstruction)

Assistant code blocks are CodeMirror panels: `<pre class="cm-content"><code><span>line</span><br>...`. Reconstruct into clean `<pre><code>` for Turndown by joining `<span>` contents with `\n`. Language label sourced from the sticky header (`[class*="sticky"]` textContent, Copy button stripped) since the cm-content has no language attr to read.

### KaTeX Math

Collapse `.katex` / `.katex-display` to `$tex$` / `$$tex$$` via the `<annotation encoding="application/x-tex">` inside each. Without this, Turndown flattens the triple-printed MathML+HTML+annotation textContent.

### Writing-Block Chrome

Strip canvas/email/chat/social-post embedded artifacts via `[data-testid="writing-block-header-sticky-container"]` plus `span.invisible`. The latter fixes the "Following up on our conversationFollowing up on our conversation" doubling caused by React's auto-resize textarea pattern (visible + invisible sibling spans).

### Task Lists

Unwrap `li.task-list-item > p:only-child` so GFM's checkbox rule fires. Trim leading space after the input so we get `- [x] Done` not `- [x]  Done`.

### Citation Chrome

Strip uniformly: `[data-testid="webpage-citation-pill"]` plus the "Sources" footnote button. Keeps saved conversations from turning into forwarded RAG payloads (a downstream agent reading the markdown shouldn't feel obligated to chase 30+ source URLs). Citation handling is on the Tier-2 settings backlog as a future `strip | inline | footnotes` toggle that covers all sites uniformly.

### URL-Shaped Image Alts

Search-result thumbnails copy their `src` into `alt`. Rewrite to `Search result image` so we don't emit `![https://…](https://…)`.

### Transition Copies

`[style*="opacity: 0"]` siblings React keeps for label-change animations get stripped before Turndown runs. Without this, every label change appears twice.
