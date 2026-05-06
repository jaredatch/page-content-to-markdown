# Supported Sites

For some sites, the extension provides **site actions**: dedicated extractors that produce cleaner output than the general page path. They handle the site's quirks directly (threading, reasoning blocks, citations, conversation roles) so the result looks like what you'd actually want.

When you're on a supported site, the popup picker shows the site's content options (under an "Available on …" divider) alongside the regular Page content option. Pick the one that matches what's on the page, then Copy or Save.

On X, the popup goes a step further and detects what's actually on the page — so you only see the options that fit. On a single tweet you'll see "Tweet"; on a thread you'll see "Tweet" and "Thread"; on an X Article you'll see "Article" by itself (since extracting the wrapper tweet of an article isn't useful).

| Site | Actions | Where it works |
|---|---|---|
| X / Twitter | Tweet, Thread, Article | `x.com`, `twitter.com` |
| Claude | Conversation | Share pages and active chats (`claude.ai/share/...`, `claude.ai/chat/...`) |
| Grok | Conversation | Share pages and active chats (`grok.com/share/...`, `grok.com/c/...`) |
| ChatGPT | Conversation | Share pages and active chats (`chatgpt.com/share/...`, `chatgpt.com/c/...`) |

If a site action fails (e.g., the site changed its DOM and we haven't caught up), the extension falls back to [general content extraction](content-extraction.md). You'll always get something out.

---

## X / Twitter

Three actions, depending on what's on the page:

**Tweet.** On a single tweet page (`/{user}/status/{id}`), captures the focal tweet (the one named in the URL) with author, handle, text, and media. Other tweets visible on the page (replies, recommended posts) are ignored.

**Thread.** When the focal tweet is part of a chain by the same author, captures the whole chain in document order. Use this on the entry tweet of a thread to grab everything at once.

**Article.** For X Articles, captures the long-form post structure with headings, body, and images. Article URLs come in three shapes (`/i/article/...`, `/{user}/status/{id}` for X-Article-style status pages, and `/{user}/article/...`); detection looks at both the URL and the live DOM, and on a status page that's actually an article only the "Article" option appears (Tweet and Thread are hidden since extracting the bare wrapper tweet wouldn't include the body).

---

## Claude

**Conversation.** Works on share pages (`claude.ai/share/...`) and your own active chats (`claude.ai/chat/...`). Captures the conversation title, every human and Claude turn in order, and formatting like headings, lists, and code blocks. Share pages also include the "Shared by {name}" attribution above the first turn.

Share pages work whether or not you're logged in; active chats require being logged into your own Claude account.

---

## Grok

**Conversation.** Works on both share pages (`grok.com/share/...`) and your own active chats (`grok.com/c/...`). Captures:

- Conversation title (with the "Shared Grok Conversation" or "- Grok" suffix stripped)
- Every user and assistant turn in order
- Assistant reasoning blocks ("Thought for Ns" collapsibles) as-is
- Citation chips (with the invisible U+2060 prefix Grok adds cleaned out)
- Code blocks with language hints preserved

Share pages work whether or not you're logged in; active chats require being logged into your own Grok account.

---

## ChatGPT

**Conversation.** Works on share pages (`chatgpt.com/share/...`) and your own active chats (`chatgpt.com/c/...`). Captures:

- Conversation title
- Every user and assistant turn in order
- Reasoning streams from o-series models (preamble blocks + final answer, with the "Thought for Nm Ns" label preserved)
- Code blocks with language hints (reconstructed from ChatGPT's CodeMirror panels into clean fenced code)
- KaTeX math preserved as `$tex$` / `$$tex$$`
- Assistant-generated images
- User attachments as a chip count (e.g., `*[2 attachments uploaded]*`)

Citation pills and the "Sources" footnote are stripped so saved conversations don't turn into RAG-style URL dumps. Share pages work whether or not you're logged in; active chats require being logged into your own ChatGPT account.

---

## When site actions fail

Site detection is hostname-based, so the site rows appear in the popup whenever you're on a supported site. A few things can still go wrong:

- **Wrong page type.** The popup shows X's content options on any X page, but "Tweet" only works on `/status/` URLs. Picking the wrong one gives a clear error.
- **DOM changes.** Sites update their HTML structure regularly. If an extractor falls behind, the action may fail or return incomplete output.
- **Fallback.** When a site action fails, the extension falls back to general content extraction. You get markdown, just not the polished version.

If you keep hitting broken extraction on a supported site, that's worth a bug report. Most likely the DOM has shifted.

---

## Want support for another site?

See [CONTRIBUTING.md](../CONTRIBUTING.md) for the high-level process, and [docs/building-site-extractors.md](building-site-extractors.md) for the live-DOM workflow we use to build extractors quickly.
