# Supported Sites

For some sites, the extension provides **site actions**: dedicated extractors that produce cleaner output than the general page path. They handle the site's quirks directly (threading, reasoning blocks, citations, conversation roles) so the result looks like what you'd actually want.

When you're on a supported site, the popup shows the site's action buttons alongside "Copy Page as Markdown" and "Select Elements". Pick the one that matches what's on the page.

| Site | Actions | Where it works |
|---|---|---|
| X / Twitter | Tweet, Thread, Article | `x.com`, `twitter.com` |
| Claude | Conversation | Share pages (`claude.ai/share/...`) |
| Grok | Conversation | Share pages and active chats (`grok.com/share/...`, `grok.com/c/...`) |

If a site action fails (e.g., the site changed its DOM and we haven't caught up), the extension falls back to [general content extraction](content-extraction.md). You'll always get something out.

---

## X / Twitter

Three actions, depending on what's on the page:

**Tweet.** On a single tweet page (`/{user}/status/{id}`), captures the focal tweet (the one named in the URL) with author, handle, text, and media. Other tweets visible on the page (replies, recommended posts) are ignored.

**Thread.** When the focal tweet is part of a chain by the same author, captures the whole chain in document order. Use this on the entry tweet of a thread to grab everything at once.

**Article.** For X Articles (`/i/article/...`), captures the long-form post structure with headings, body, and images. The "Article" button only makes sense on these URLs.

---

## Claude

**Conversation.** Works on Claude's share pages (`claude.ai/share/...`). Captures the conversation title, the "Shared by {name}" attribution, and every human and Claude turn in order, with formatting preserved (headings, lists, code blocks, etc.).

Active chats in your own account aren't supported. For those, use **Select Elements** to pick the parts you want.

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

## When site actions fail

Site detection is hostname-based, so action buttons appear whenever you're on a supported site. A few things can still go wrong:

- **Wrong page type.** The popup shows X's action buttons on any X page, but "Tweet" only works on `/status/` URLs. Picking the wrong action gives a clear error.
- **DOM changes.** Sites update their HTML structure regularly. If an extractor falls behind, the action may fail or return incomplete output.
- **Fallback.** When a site action fails, the extension falls back to general content extraction. You get markdown, just not the polished version.

If you keep hitting broken extraction on a supported site, that's worth a bug report. Most likely the DOM has shifted.

---

## Want support for another site?

See [CONTRIBUTING.md](../CONTRIBUTING.md) for the high-level process, and [docs/building-site-extractors.md](building-site-extractors.md) for the live-DOM workflow we use to build extractors quickly.
