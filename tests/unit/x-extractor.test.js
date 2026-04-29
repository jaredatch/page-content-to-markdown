'use strict';

const XExtractor = require('../../src/sites/x/x-extractor');

// ── HTML Fixtures ──

const SINGLE_TWEET_HTML = `
<article data-testid="tweet">
  <div data-testid="User-Name">
    <span>Elon Musk</span>
    <span>@elonmusk</span>
    <span>·</span>
  </div>
  <div data-testid="tweetText" lang="en">
    <span>The quick brown fox jumps over the lazy dog.</span>
  </div>
  <a href="/elonmusk/status/123456">
    <time datetime="2026-03-23T14:15:00.000Z">Mar 23</time>
  </a>
  <div data-testid="tweetPhoto">
    <img src="https://pbs.twimg.com/media/example.jpg" />
  </div>
  <button data-testid="reply" aria-label="1800 replies. Reply"></button>
  <button data-testid="retweet" aria-label="3200 reposts. Repost"></button>
  <button data-testid="like" aria-label="12500 Likes. Like"></button>
  <div aria-label="1800 replies, 3200 reposts, 12500 likes, 0 bookmarks, 450000 views"></div>
</article>
`;

const THREAD_HTML = `
<article data-testid="tweet">
  <div data-testid="User-Name">
    <span>Jane Dev</span>
    <span>@janedev</span>
  </div>
  <div data-testid="tweetText" lang="en">
    <span>Thread: Here is my first point about async programming.</span>
  </div>
  <a href="/janedev/status/100">
    <time datetime="2026-03-23T10:00:00.000Z">Mar 23</time>
  </a>
</article>
<article data-testid="tweet">
  <div data-testid="User-Name">
    <span>Jane Dev</span>
    <span>@janedev</span>
  </div>
  <div data-testid="tweetText" lang="en">
    <span>Second, always handle errors properly.</span>
  </div>
  <a href="/janedev/status/101">
    <time datetime="2026-03-23T10:01:00.000Z">Mar 23</time>
  </a>
</article>
<article data-testid="tweet">
  <div data-testid="User-Name">
    <span>Jane Dev</span>
    <span>@janedev</span>
  </div>
  <div data-testid="tweetText" lang="en">
    <span>Third, use async/await over raw promises.</span>
  </div>
  <a href="/janedev/status/102">
    <time datetime="2026-03-23T10:02:00.000Z">Mar 23</time>
  </a>
</article>
`;

const TWEET_WITH_QUOTE_HTML = `
<article data-testid="tweet">
  <div data-testid="User-Name">
    <span>Alice</span>
    <span>@alice</span>
  </div>
  <div data-testid="tweetText" lang="en">
    <span>Totally agree with this take!</span>
  </div>
  <a href="/alice/status/200">
    <time datetime="2026-03-23T12:00:00.000Z">Mar 23</time>
  </a>
  <div data-testid="quoteTweet">
    <div data-testid="User-Name">
      <span>Bob</span>
      <span>@bob</span>
    </div>
    <div data-testid="tweetText" lang="en">
      <span>Hot take: tabs are better than spaces.</span>
    </div>
    <time datetime="2026-03-22T08:00:00.000Z">Mar 22</time>
  </div>
  <button data-testid="reply" aria-label="50 replies. Reply"></button>
  <button data-testid="retweet" aria-label="200 reposts. Repost"></button>
  <button data-testid="like" aria-label="1500 Likes. Like"></button>
</article>
`;

const FALLBACK_TWEET_HTML = `
<article role="article">
  <a href="/fallbackuser">
    <span>Fallback User</span>
  </a>
  <div lang="en">This tweet uses fallback selectors.</div>
  <time datetime="2026-03-23T16:00:00.000Z">Mar 23</time>
  <img src="https://pbs.twimg.com/media/fallback.jpg" />
</article>
`;

const MULTI_IMAGE_TWEET_HTML = `
<article data-testid="tweet">
  <div data-testid="User-Name">
    <span>Photographer</span>
    <span>@photog</span>
  </div>
  <div data-testid="tweetText" lang="en">
    <span>Check out these photos!</span>
  </div>
  <a href="/photog/status/300">
    <time datetime="2026-03-23T15:00:00.000Z">Mar 23</time>
  </a>
  <div data-testid="tweetPhoto">
    <img src="https://pbs.twimg.com/media/photo1.jpg" />
  </div>
  <div data-testid="tweetPhoto">
    <img src="https://pbs.twimg.com/media/photo2.jpg" />
  </div>
  <div data-testid="tweetPhoto">
    <img src="https://pbs.twimg.com/media/photo3.jpg" />
  </div>
</article>
`;

const TWEET_WITH_VIDEO_HTML = `
<article data-testid="tweet">
  <div data-testid="User-Name">
    <span>VideoCreator</span>
    <span>@videocreator</span>
  </div>
  <div data-testid="tweetText" lang="en">
    <span>Watch this!</span>
  </div>
  <a href="/videocreator/status/400">
    <time datetime="2026-03-23T18:00:00.000Z">Mar 23</time>
  </a>
  <video src="https://video.twimg.com/clip.mp4" poster="https://pbs.twimg.com/poster.jpg"></video>
</article>
`;

const ARTICLE_HTML = `
<html>
  <head>
    <meta property="og:title" content="My Deep Dive Article" />
    <meta name="author" content="Author Name" />
    <title>My Deep Dive Article - X</title>
  </head>
  <body>
    <article role="article">
      <div data-testid="User-Name">
        <span>Author Name</span>
        <span>@authorname</span>
      </div>
      <time datetime="2026-03-20T09:00:00.000Z">Mar 20</time>
      <h1>My Deep Dive Article</h1>
      <p>This is the first paragraph of the article.</p>
      <p>This is the second paragraph with <strong>bold text</strong>.</p>
    </article>
  </body>
</html>
`;

// X Articles in the wild use a twitterArticleReadView container, the User-Name and
// <time> sit OUTSIDE that container but inside the broader tweet, body lives in a
// twitterArticleRichTextView, and headings/mentions/code blocks are wrapped in Draft.js
// scaffolding. This fixture reproduces those structures.
const X_ARTICLE_READVIEW_HTML = `
<html>
  <head>
    <meta property="og:title" content="Author on X: &quot;Real Title&quot; / X" />
    <title>Author on X: "Real Title" / X</title>
  </head>
  <body>
    <article role="article" data-testid="tweet">
      <div data-testid="User-Name">
        <span>Real Author</span>
        <span>@realauthor</span>
      </div>
      <time datetime="2026-04-15T16:09:43.000Z">Apr 15, 2026</time>
      <button data-testid="reply" aria-label="20 replies"></button>
      <button data-testid="retweet" aria-label="135 reposts"></button>
      <button data-testid="like" aria-label="922 Likes"></button>
      <div data-testid="twitterArticleReadView">
        <div data-testid="twitter-article-title">Real Title</div>
        <a href="/realauthor/article/1/media/cover">
          <div data-testid="tweetPhoto">
            <img src="https://pbs.twimg.com/media/cover.jpg" alt="Image" />
          </div>
        </a>
        <div data-testid="twitterArticleRichTextView">
          <h2 class="longform-header-two">
            <div><span style="font-weight: bold;"><span data-text="true">Background</span></span></div>
          </h2>
          <div class="longform-unstyled" data-block="true">
            <div>
              <span><span data-text="true">Working with </span></span>
              <div>
                <a href="https://x.com/@mercury">
                  <span><span data-text="true">@mercury</span></span>
                </a>
              </div>
              <span><span data-text="true"> is fun.</span></span>
            </div>
          </div>
          <div data-testid="markdown-code-block">
            <div>
              <div><span>js</span></div>
              <div><button aria-label="Copy to clipboard">Copy</button></div>
            </div>
            <pre><code class="language-js">const x = 1;</code></pre>
          </div>
          <a href="/realauthor/article/1/media/inline">
            <div data-testid="tweetPhoto">
              <img src="https://pbs.twimg.com/media/inline.jpg" alt="Image" />
            </div>
          </a>
          <div data-testid="videoPlayer">
            <div data-testid="videoComponent">
              <video poster="https://pbs.twimg.com/tweet_video_thumb/abc.jpg" src="https://video.twimg.com/abc.mp4"></video>
              <span>GIF</span>
            </div>
          </div>
        </div>
      </div>
    </article>
  </body>
</html>
`;

// ── Helpers ──

function createDoc(html) {
  document.body.innerHTML = html;
  return document;
}

// ── Tests ──

describe('XExtractor', () => {
  let extractor;

  beforeEach(() => {
    extractor = new XExtractor();
    document.head.innerHTML = '';
    document.body.innerHTML = '';
    document.title = '';
  });

  describe('detectContentType', () => {
    test('detects single tweet from /status/ URL', () => {
      createDoc(SINGLE_TWEET_HTML);
      expect(extractor.detectContentType('https://x.com/elonmusk/status/123456', document))
        .toBe('single-tweet');
    });

    test('detects thread when multiple tweets from same author', () => {
      createDoc(THREAD_HTML);
      expect(extractor.detectContentType('https://x.com/janedev/status/100', document))
        .toBe('thread');
    });

    test('detects article from /i/article/ URL', () => {
      expect(extractor.detectContentType('https://x.com/i/article/12345', document))
        .toBe('article');
    });

    test('detects article on /status/ URL when twitterArticleReadView is present', () => {
      document.documentElement.innerHTML = X_ARTICLE_READVIEW_HTML;
      expect(extractor.detectContentType('https://x.com/realauthor/status/1', document))
        .toBe('article');
    });

    test('detects article on /{user}/article/{id} URL when read view is present', () => {
      // X also serves the same article body at /{user}/article/{id} (visible in
      // internal media-viewer links). Detection must rely on the DOM testid,
      // not the URL regex, since this path doesn't match /status/ or /i/article/.
      document.documentElement.innerHTML = X_ARTICLE_READVIEW_HTML;
      expect(extractor.detectContentType('https://x.com/realauthor/article/2046876981711769720', document))
        .toBe('article');
    });

    test('returns unknown for non-tweet URLs', () => {
      expect(extractor.detectContentType('https://x.com/home', document))
        .toBe('unknown');
    });

    test('returns unknown for invalid URLs', () => {
      expect(extractor.detectContentType('not-a-url', document))
        .toBe('unknown');
    });
  });

  describe('extractSingleTweet', () => {
    test('extracts complete tweet data', () => {
      createDoc(SINGLE_TWEET_HTML);
      const tweet = extractor.extractSingleTweet(document, 'https://x.com/elonmusk/status/123456');

      expect(tweet).not.toBeNull();
      expect(tweet.author.handle).toBe('elonmusk');
      expect(tweet.author.displayName).toBe('Elon Musk');
      expect(tweet.text).toBe('The quick brown fox jumps over the lazy dog.');
      expect(tweet.timestamp).toBe('2026-03-23T14:15:00.000Z');
      expect(tweet.media).toHaveLength(1);
      expect(tweet.media[0].type).toBe('image');
      expect(tweet.media[0].url).toContain('example.jpg');
    });

    test('extracts engagement stats', () => {
      createDoc(SINGLE_TWEET_HTML);
      const tweet = extractor.extractSingleTweet(document, 'https://x.com/elonmusk/status/123456');

      expect(tweet.engagement.replies).toBe(1800);
      expect(tweet.engagement.retweets).toBe(3200);
      expect(tweet.engagement.likes).toBe(12500);
      expect(tweet.engagement.views).toBe(450000);
    });

    test('extracts multiple images', () => {
      createDoc(MULTI_IMAGE_TWEET_HTML);
      const tweet = extractor.extractSingleTweet(document, 'https://x.com/photog/status/300');

      expect(tweet.media).toHaveLength(3);
      expect(tweet.media[0].url).toContain('photo1.jpg');
      expect(tweet.media[1].url).toContain('photo2.jpg');
      expect(tweet.media[2].url).toContain('photo3.jpg');
    });

    test('extracts video media', () => {
      createDoc(TWEET_WITH_VIDEO_HTML);
      const tweet = extractor.extractSingleTweet(document, 'https://x.com/videocreator/status/400');

      expect(tweet.media).toHaveLength(1);
      expect(tweet.media[0].type).toBe('video');
      expect(tweet.media[0].url).toContain('clip.mp4');
    });

    test('extracts quote tweet', () => {
      createDoc(TWEET_WITH_QUOTE_HTML);
      const tweet = extractor.extractSingleTweet(document, 'https://x.com/alice/status/200');

      expect(tweet.quoteTweet).not.toBeNull();
      expect(tweet.quoteTweet.author.handle).toBe('bob');
      expect(tweet.quoteTweet.text).toBe('Hot take: tabs are better than spaces.');
      // Quote tweets should not nest further
      expect(tweet.quoteTweet.quoteTweet).toBeNull();
    });

    test('returns null when no tweets found', () => {
      createDoc('<div>No tweets here</div>');
      const tweet = extractor.extractSingleTweet(document);
      expect(tweet).toBeNull();
    });

    test('uses fallback selectors when data-testid missing', () => {
      createDoc(FALLBACK_TWEET_HTML);
      const tweet = extractor.extractSingleTweet(document, 'https://x.com/fallbackuser/status/500');

      expect(tweet).not.toBeNull();
      expect(tweet.text).toBe('This tweet uses fallback selectors.');
      expect(tweet.timestamp).toBe('2026-03-23T16:00:00.000Z');
    });

    test('handles tweet with no text gracefully', () => {
      createDoc(`
        <article data-testid="tweet">
          <div data-testid="User-Name">
            <span>User</span>
            <span>@user</span>
          </div>
          <a href="/user/status/1">
            <time datetime="2026-01-01T00:00:00.000Z">Jan 1</time>
          </a>
          <div data-testid="tweetPhoto">
            <img src="https://pbs.twimg.com/media/image.jpg" />
          </div>
        </article>
      `);
      const tweet = extractor.extractSingleTweet(document);
      expect(tweet).not.toBeNull();
      expect(tweet.text).toBe('');
      expect(tweet.media).toHaveLength(1);
    });

    test('handles tweet with no engagement stats', () => {
      createDoc(`
        <article data-testid="tweet">
          <div data-testid="User-Name">
            <span>User</span>
            <span>@user</span>
          </div>
          <div data-testid="tweetText" lang="en">
            <span>A simple tweet.</span>
          </div>
        </article>
      `);
      const tweet = extractor.extractSingleTweet(document);
      expect(tweet.engagement).toEqual({ replies: 0, retweets: 0, likes: 0, bookmarks: 0, views: 0 });
    });
  });

  describe('extractThread', () => {
    test('extracts thread with main tweet and replies', () => {
      createDoc(THREAD_HTML);
      const thread = extractor.extractThread(document, 'https://x.com/janedev/status/100');

      expect(thread).not.toBeNull();
      expect(thread.mainTweet.author.handle).toBe('janedev');
      expect(thread.mainTweet.text).toContain('first point');
      expect(thread.replies).toHaveLength(2);
      expect(thread.replies[0].text).toContain('handle errors');
      expect(thread.replies[1].text).toContain('async/await');
    });

    test('returns thread with empty replies for single-author tweet', () => {
      createDoc(SINGLE_TWEET_HTML);
      const thread = extractor.extractThread(document, 'https://x.com/elonmusk/status/123456');

      expect(thread).not.toBeNull();
      expect(thread.mainTweet.author.handle).toBe('elonmusk');
      expect(thread.replies).toHaveLength(0);
    });

    test('returns null when no tweets found', () => {
      createDoc('<div>Nothing</div>');
      expect(extractor.extractThread(document)).toBeNull();
    });

    test('excludes tweets from different authors in thread', () => {
      createDoc(`
        <article data-testid="tweet">
          <div data-testid="User-Name"><span>Author</span><span>@author</span></div>
          <div data-testid="tweetText" lang="en"><span>My thread starts here.</span></div>
          <a href="/author/status/1"><time datetime="2026-01-01T00:00:00.000Z">Jan 1</time></a>
        </article>
        <article data-testid="tweet">
          <div data-testid="User-Name"><span>Other Person</span><span>@other</span></div>
          <div data-testid="tweetText" lang="en"><span>Nice thread!</span></div>
          <a href="/other/status/2"><time datetime="2026-01-01T00:01:00.000Z">Jan 1</time></a>
        </article>
        <article data-testid="tweet">
          <div data-testid="User-Name"><span>Author</span><span>@author</span></div>
          <div data-testid="tweetText" lang="en"><span>Continuing my thread.</span></div>
          <a href="/author/status/3"><time datetime="2026-01-01T00:02:00.000Z">Jan 1</time></a>
        </article>
      `);
      const thread = extractor.extractThread(document, 'https://x.com/author/status/1');

      expect(thread.mainTweet.author.handle).toBe('author');
      // Only same-author tweets: first + third (skips @other)
      expect(thread.replies).toHaveLength(1);
      expect(thread.replies[0].text).toContain('Continuing');
    });
  });

  describe('extractArticle', () => {
    test('extracts article with title, author, and body', () => {
      document.documentElement.innerHTML = ARTICLE_HTML;
      const article = extractor.extractArticle(document);

      expect(article).not.toBeNull();
      expect(article.title).toBe('My Deep Dive Article');
      expect(article.author.handle).toBe('authorname');
      expect(article.author.displayName).toBe('Author Name');
      expect(article.bodyHtml).toContain('first paragraph');
      expect(article.bodyHtml).toContain('<strong>bold text</strong>');
      expect(article.publishedDate).toBe('2026-03-20T09:00:00.000Z');
    });

    test('falls back to meta tags for author', () => {
      document.head.innerHTML = '';
      document.body.innerHTML = '<main><p>Article content without User-Name testid.</p></main>';

      const meta = document.createElement('meta');
      meta.setAttribute('name', 'author');
      meta.setAttribute('content', 'Meta Author');
      document.head.appendChild(meta);

      const h1 = document.createElement('h1');
      h1.textContent = 'Title from H1';
      document.body.prepend(h1);

      const article = extractor.extractArticle(document);
      expect(article).not.toBeNull();
      expect(article.author.displayName).toBe('Meta Author');
    });

    test('returns null when no article content found', () => {
      document.body.innerHTML = '<div></div>';
      // Clear head meta too
      document.head.innerHTML = '';
      document.title = '';
      const article = extractor.extractArticle(document);
      expect(article).toBeNull();
    });
  });

  describe('extractArticle (X Article / twitterArticleReadView)', () => {
    beforeEach(() => {
      document.documentElement.innerHTML = X_ARTICLE_READVIEW_HTML;
    });

    test('uses twitter-article-title (not og:title) for clean title', () => {
      const article = extractor.extractArticle(document);
      expect(article.title).toBe('Real Title');
      // og:title carries the noisy "Author on X: \"...\" / X" wrapper — must not leak through.
      expect(article.title).not.toMatch(/on X:/);
    });

    test('extracts author and timestamp from outside the read view', () => {
      const article = extractor.extractArticle(document);
      expect(article.author.handle).toBe('realauthor');
      expect(article.author.displayName).toBe('Real Author');
      expect(article.publishedDate).toBe('2026-04-15T16:09:43.000Z');
    });

    test('cover image comes from outside the rich text view', () => {
      const article = extractor.extractArticle(document);
      expect(article.coverImage).toBe('https://pbs.twimg.com/media/cover.jpg');
      // Inline image (inside body) must not be picked as the cover.
      expect(article.coverImage).not.toMatch(/inline/);
    });

    test('body excludes engagement chrome and avatar', () => {
      const article = extractor.extractArticle(document);
      // Engagement aria-labels live OUTSIDE the rich text view, so the body should be free of them.
      expect(article.bodyHtml).not.toMatch(/\b922\b/);
      expect(article.bodyHtml).not.toMatch(/\b135\b/);
      expect(article.bodyHtml).not.toMatch(/\b20 replies\b/);
    });

    test('flattens Draft.js heading wrappers', () => {
      const article = extractor.extractArticle(document);
      // Pre-flatten: <h2><div><span><span data-text>Background</span></span></div></h2>
      // Post-flatten: <h2>Background</h2>
      expect(article.bodyHtml).toMatch(/<h2[^>]*>Background<\/h2>/);
      // No leftover Draft.js scaffolding inside headings.
      expect(article.bodyHtml).not.toMatch(/<h2[^>]*>\s*<div/);
    });

    test('sanitizes code blocks: drops language label + copy button', () => {
      const article = extractor.extractArticle(document);
      // The <pre><code class="language-js"> survives intact.
      expect(article.bodyHtml).toMatch(/<pre><code class="language-js">const x = 1;<\/code><\/pre>/);
      // The "Copy to clipboard" button and bare "js" label span are gone.
      expect(article.bodyHtml).not.toMatch(/Copy to clipboard/);
      expect(article.bodyHtml).not.toMatch(/<span>js<\/span>/);
    });

    test('replaces <video> with <img> of the poster', () => {
      const article = extractor.extractArticle(document);
      // Turndown drops <video> entirely; we swap to <img> so the poster image survives.
      expect(article.bodyHtml).toMatch(/<img[^>]*src="https:\/\/pbs\.twimg\.com\/tweet_video_thumb\/abc\.jpg"[^>]*alt="GIF"/);
      expect(article.bodyHtml).not.toMatch(/<video/);
    });

    test('strips the bare "GIF" label span from video components', () => {
      const article = extractor.extractArticle(document);
      // The standalone <span>GIF</span> X renders as a video badge would otherwise show
      // up as bare "GIF" text in the markdown output.
      expect(article.bodyHtml).not.toMatch(/<span>GIF<\/span>/);
    });

    test('unwraps media-viewer link wrappers around photos', () => {
      const article = extractor.extractArticle(document);
      // Inline tweetPhotos in the body survive, but their wrapping <a href="/.../media/...">
      // is gone — Turndown would otherwise emit ugly [![](url)](mediaUrl).
      expect(article.bodyHtml).toMatch(/inline\.jpg/);
      expect(article.bodyHtml).not.toMatch(/href="\/realauthor\/article\/1\/media\/inline"/);
    });

    test('inlines mention block-div wrappers so paragraphs flow', () => {
      const article = extractor.extractArticle(document);
      // Pre-unwrap: <div>…</div> <div><a href="…">@mercury</a></div> <div>…</div>
      // Post-unwrap: <a href="…">@mercury</a> sits as a direct sibling of the
      // surrounding text — Turndown then emits inline link, paragraph stays whole.
      // The "<div><a href=...mercury" wrap pattern must be gone.
      expect(article.bodyHtml).not.toMatch(/<div[^>]*>\s*<a href="https:\/\/x\.com\/mercury"/);
    });

    test('cleans @ from mention URLs', () => {
      const article = extractor.extractArticle(document);
      // /@mercury → /mercury (the displayed text @mercury is unchanged).
      expect(article.bodyHtml).toMatch(/href="https:\/\/x\.com\/mercury"/);
      expect(article.bodyHtml).not.toMatch(/href="https:\/\/x\.com\/@mercury"/);
    });

    test('dedupes preview <img> when its src matches the <video> poster', () => {
      // X often renders animated GIFs as both an <img> still preview AND a
      // <video poster=...> with the same URL. Without de-duping, the same
      // media URL appears twice in the output (once with alt="GIF", once empty).
      document.body.innerHTML = `
        <article role="article" data-testid="tweet">
          <div data-testid="twitterArticleReadView">
            <div data-testid="twitterArticleRichTextView">
              <div data-testid="videoComponent">
                <img src="https://pbs.twimg.com/tweet_video_thumb/DUP.jpg" alt="" />
                <video poster="https://pbs.twimg.com/tweet_video_thumb/DUP.jpg" src="https://video.twimg.com/x.mp4"></video>
              </div>
            </div>
          </div>
        </article>
      `;
      const article = extractor.extractArticle(document);
      const matches = (article.bodyHtml.match(/tweet_video_thumb\/DUP\.jpg/g) || []).length;
      expect(matches).toBe(1);
      // The surviving image is the alt="GIF" one we substituted in.
      expect(article.bodyHtml).toMatch(/alt="GIF"/);
    });

    test('extracts engagement (replies, reposts, likes) from page container', () => {
      const article = extractor.extractArticle(document);
      // Aria labels in the fixture: "20 replies", "135 reposts", "922 Likes"
      expect(article.engagement).toBeDefined();
      expect(article.engagement.replies).toBe(20);
      expect(article.engagement.retweets).toBe(135);
      expect(article.engagement.likes).toBe(922);
    });

    test('promotes inline-style bold spans to <strong>', () => {
      // X article bodies use <span style="font-weight: bold"> (NOT <strong>) for inline
      // bold. Turndown ignores inline styles, so without promotion every bold passage
      // in an article silently drops to plain text.
      document.body.innerHTML = `
        <article role="article" data-testid="tweet">
          <div data-testid="twitterArticleReadView">
            <div data-testid="twitterArticleRichTextView">
              <div data-block="true">
                <span data-text="true">Plain text and </span>
                <span style="font-weight: bold;"><span data-text="true">important phrase</span></span>
                <span data-text="true"> follows.</span>
              </div>
              <p>
                <span style="font-weight: 700;">numeric weight 700</span>
                and
                <span style="font-weight: 400;">normal 400</span>
              </p>
            </div>
          </div>
        </article>
      `;
      const article = extractor.extractArticle(document);
      expect(article.bodyHtml).toMatch(/<strong><span data-text="true">important phrase<\/span><\/strong>/);
      expect(article.bodyHtml).toMatch(/<strong>numeric weight 700<\/strong>/);
      // 400 is not bold — must NOT be wrapped
      expect(article.bodyHtml).not.toMatch(/<strong>normal 400<\/strong>/);
    });

    test('promotes inline-style italic spans to <em>', () => {
      // X article bodies use <span style="font-style: italic"> (NOT <em>/<i>)
      // for emphasis. Same Turndown blind spot as the bold case.
      document.body.innerHTML = `
        <article role="article" data-testid="tweet">
          <div data-testid="twitterArticleReadView">
            <div data-testid="twitterArticleRichTextView">
              <p>
                <span style="font-style: italic;"><span data-text="true">emphasis</span></span>
                and
                <span style="font-style: oblique;">also slanted</span>
                and
                <span style="font-style: normal;">not italic</span>
              </p>
            </div>
          </div>
        </article>
      `;
      const article = extractor.extractArticle(document);
      expect(article.bodyHtml).toMatch(/<em><span data-text="true">emphasis<\/span><\/em>/);
      expect(article.bodyHtml).toMatch(/<em>also slanted<\/em>/);
      expect(article.bodyHtml).not.toMatch(/<em>not italic<\/em>/);
    });

    test('does not promote bold spans nested inside headings', () => {
      // Headings are flattened to plain text via _flattenHeadings — wrapping
      // their inner bold spans in <strong> first would have no visible effect
      // but adds noise to the DOM walk. Skip them deliberately.
      document.body.innerHTML = `
        <article role="article" data-testid="tweet">
          <div data-testid="twitterArticleReadView">
            <div data-testid="twitterArticleRichTextView">
              <h2><span style="font-weight: bold;">Heading text</span></h2>
            </div>
          </div>
        </article>
      `;
      const article = extractor.extractArticle(document);
      expect(article.bodyHtml).toMatch(/<h2[^>]*>Heading text<\/h2>/);
      expect(article.bodyHtml).not.toMatch(/<strong>/);
    });
  });

  describe('_query and _queryAll helpers', () => {
    test('_query returns first matching selector result', () => {
      document.body.innerHTML = '<div class="target">Found</div>';
      const result = extractor._query(document, '.missing', '.target');
      expect(result.textContent).toBe('Found');
    });

    test('_query returns null when no selectors match', () => {
      document.body.innerHTML = '<div>Nothing</div>';
      const result = extractor._query(document, '.a', '.b', '.c');
      expect(result).toBeNull();
    });

    test('_queryAll returns array from first matching selector', () => {
      document.body.innerHTML = '<span>1</span><span>2</span>';
      const results = extractor._queryAll(document, '.missing', 'span');
      expect(results).toHaveLength(2);
    });

    test('_queryAll returns empty array when nothing matches', () => {
      document.body.innerHTML = '<div>Nothing</div>';
      const results = extractor._queryAll(document, '.a', '.b');
      expect(results).toHaveLength(0);
    });
  });

  describe('edge cases', () => {
    test('handles comma-formatted engagement numbers', () => {
      createDoc(`
        <article data-testid="tweet">
          <div data-testid="User-Name"><span>User</span><span>@user</span></div>
          <div data-testid="tweetText" lang="en"><span>Popular tweet.</span></div>
          <button data-testid="like" aria-label="1,234 Likes. Like"></button>
          <button data-testid="retweet" aria-label="5,678 reposts. Repost"></button>
        </article>
      `);
      const tweet = extractor.extractSingleTweet(document);
      expect(tweet.engagement.likes).toBe(1234);
      expect(tweet.engagement.retweets).toBe(5678);
    });

    test('fallback image detection skips profile pictures', () => {
      createDoc(`
        <article role="article">
          <div lang="en">Tweet with images.</div>
          <time datetime="2026-01-01T00:00:00.000Z">Jan 1</time>
          <img src="https://pbs.twimg.com/profile_images/avatar.jpg" />
          <img src="https://pbs.twimg.com/media/content.jpg" />
        </article>
      `);
      const tweet = extractor.extractSingleTweet(document);
      expect(tweet.media).toHaveLength(1);
      expect(tweet.media[0].url).toContain('content.jpg');
    });
  });

  describe('engagement extraction — locale-stable signals', () => {
    // Tier 1 (primary): testid-based per-button scan. Tier 2 (fallback):
    // summary div, parsed positionally so it works in any X locale.

    test('Tier 1: per-button testid scan extracts replies/reposts/likes/bookmarks', () => {
      // No summary div on this fixture — only individual action buttons.
      createDoc(`
        <article data-testid="tweet">
          <div data-testid="User-Name"><span>User</span><span>@user</span></div>
          <div data-testid="tweetText" lang="en"><span>Timeline tweet.</span></div>
          <button data-testid="reply" aria-label="3 replies. Reply"></button>
          <button data-testid="retweet" aria-label="6 reposts. Repost"></button>
          <button data-testid="like" aria-label="334 Likes. Like"></button>
          <button data-testid="bookmark" aria-label="741 Bookmarks. Bookmark"></button>
        </article>
      `);
      const tweet = extractor.extractSingleTweet(document);
      expect(tweet.engagement.replies).toBe(3);
      expect(tweet.engagement.retweets).toBe(6);
      expect(tweet.engagement.likes).toBe(334);
      expect(tweet.engagement.bookmarks).toBe(741);
      expect(tweet.engagement.views).toBe(0); // no individual views signal
    });

    test('Tier 1: handles flipped testids (unlike/unretweet/removeBookmark)', () => {
      // When the viewer has already liked/reposted/bookmarked, X flips the testid.
      createDoc(`
        <article data-testid="tweet">
          <div data-testid="User-Name"><span>User</span><span>@user</span></div>
          <div data-testid="tweetText" lang="en"><span>Tweet.</span></div>
          <button data-testid="reply" aria-label="3 replies. Reply"></button>
          <button data-testid="unretweet" aria-label="6 reposts. Undo repost"></button>
          <button data-testid="unlike" aria-label="334 Likes. Liked"></button>
          <button data-testid="removeBookmark" aria-label="741 Bookmarks. Bookmarked"></button>
        </article>
      `);
      const tweet = extractor.extractSingleTweet(document);
      expect(tweet.engagement.replies).toBe(3);
      expect(tweet.engagement.retweets).toBe(6);
      expect(tweet.engagement.likes).toBe(334);
      expect(tweet.engagement.bookmarks).toBe(741);
    });

    test('Tier 2: summary fills views (no testid carries view count)', () => {
      // Buttons supply replies/reposts/likes/bookmarks; summary div supplies views.
      createDoc(`
        <article data-testid="tweet">
          <div data-testid="User-Name"><span>User</span><span>@user</span></div>
          <div data-testid="tweetText" lang="en"><span>Focal tweet.</span></div>
          <button data-testid="reply" aria-label="3 replies. Reply"></button>
          <button data-testid="retweet" aria-label="6 reposts. Repost"></button>
          <button data-testid="like" aria-label="334 Likes. Like"></button>
          <button data-testid="removeBookmark" aria-label="741 Bookmarks. Bookmarked"></button>
          <div aria-label="3 replies, 6 reposts, 334 likes, 741 bookmarks, 195828 views"></div>
        </article>
      `);
      const tweet = extractor.extractSingleTweet(document);
      expect(tweet.engagement.views).toBe(195828);
    });

    test('Tier 2: summary works in non-English locale (Spanish)', () => {
      // Even with Spanish metric words, position-based parsing recovers
      // every count. No buttons → only summary is the source.
      createDoc(`
        <article data-testid="tweet">
          <div data-testid="User-Name"><span>User</span><span>@user</span></div>
          <div data-testid="tweetText" lang="es"><span>Tweet en español.</span></div>
          <div aria-label="3 respuestas, 6 republicaciones, 334 Me gusta, 741 marcadores, 195828 vistas"></div>
        </article>
      `);
      const tweet = extractor.extractSingleTweet(document);
      expect(tweet.engagement).toEqual({
        replies: 3, retweets: 6, likes: 334, bookmarks: 741, views: 195828
      });
    });

    test('Tier 2: summary works in non-English locale (French) with space-separated thousands', () => {
      // FR uses a thin space as thousand separator: "1 234".
      createDoc(`
        <article data-testid="tweet">
          <div data-testid="User-Name"><span>User</span><span>@user</span></div>
          <div data-testid="tweetText" lang="fr"><span>Tweet en français.</span></div>
          <div aria-label="1 800 réponses, 3 200 republications, 12 500 J'aime, 600 signets, 450 000 vues"></div>
        </article>
      `);
      const tweet = extractor.extractSingleTweet(document);
      expect(tweet.engagement.replies).toBe(1800);
      expect(tweet.engagement.retweets).toBe(3200);
      expect(tweet.engagement.likes).toBe(12500);
      expect(tweet.engagement.bookmarks).toBe(600);
      expect(tweet.engagement.views).toBe(450000);
    });

    test('Tier 2: summary works in non-English locale (Spanish) with period-separated thousands', () => {
      // ES uses period as thousand separator: "1.234".
      createDoc(`
        <article data-testid="tweet">
          <div data-testid="User-Name"><span>User</span><span>@user</span></div>
          <div data-testid="tweetText" lang="es"><span>Tweet.</span></div>
          <div aria-label="1.800 respuestas, 3.200 republicaciones, 12.500 Me gusta, 600 marcadores, 450.000 vistas"></div>
        </article>
      `);
      const tweet = extractor.extractSingleTweet(document);
      expect(tweet.engagement.likes).toBe(12500);
      expect(tweet.engagement.views).toBe(450000);
    });

    test('Tier 2: timestamp aria-label does not get mistaken for engagement summary', () => {
      // Timestamp is on an <a>, summary is on a <div>. The detector filters
      // to div[aria-label] specifically.
      createDoc(`
        <article data-testid="tweet">
          <div data-testid="User-Name"><span>User</span><span>@user</span></div>
          <div data-testid="tweetText" lang="en"><span>Tweet.</span></div>
          <a aria-label="9:20 AM · Feb 7, 2026"><time datetime="2026-02-07T15:20:07.000Z">9:20 AM</time></a>
          <button data-testid="reply" aria-label="5 replies. Reply"></button>
        </article>
      `);
      const tweet = extractor.extractSingleTweet(document);
      // Should NOT pull "9", "20", "7", "2026" from the timestamp aria-label.
      expect(tweet.engagement.replies).toBe(5);
      expect(tweet.engagement.retweets).toBe(0);
      expect(tweet.engagement.likes).toBe(0);
    });
  });

  describe('emoji-aware text extraction', () => {
    // X renders emojis as <img alt="🔥" src=".../emoji/v2/svg/...">. Plain
    // textContent skips img nodes, dropping every emoji from the post body
    // and from display names. _textWithEmoji walks children and substitutes alt.
    test('preserves emojis in tweet body', () => {
      // Real X DOM has no inter-element whitespace between emoji <img> and the
      // adjacent text spans, so the fixture is written compact (matching the
      // structure captured from x.com/aiwithmayank/status/...).
      createDoc(
        '<article data-testid="tweet">' +
          '<div data-testid="User-Name"><span>User</span><span>@user</span></div>' +
          '<div data-testid="tweetText" lang="en">' +
            '<img alt="❌" src="https://abs.twimg.com/emoji/v2/svg/274c.svg">' +
            '<span> INSTRUCTION:</span>' +
            '<img alt="✅" src="https://abs.twimg.com/emoji/v2/svg/2705.svg">' +
            '<span> SOCRATIC</span>' +
          '</div>' +
        '</article>'
      );
      const tweet = extractor.extractSingleTweet(document);
      expect(tweet.text).toBe('❌ INSTRUCTION:✅ SOCRATIC');
    });

    test('preserves emojis in display name', () => {
      createDoc(`
        <article data-testid="tweet">
          <div data-testid="User-Name">
            <span><span>Sparkle <img alt="✨" src="https://abs.twimg.com/emoji/v2/svg/2728.svg"> User</span></span>
            <span>@sparkle</span>
          </div>
          <div data-testid="tweetText" lang="en"><span>Hi.</span></div>
        </article>
      `);
      const tweet = extractor.extractSingleTweet(document);
      expect(tweet.author.displayName).toBe('Sparkle ✨ User');
    });
  });

  describe('tweet body links (mentions, hashtags, URLs)', () => {
    // Tweet bodies in the real X DOM have <a href="/user"> for mentions,
    // <a href="/hashtag/Foo"> for hashtags, and <a href="https://t.co/..."
    // with display-text URL> for posted URLs. Plain textContent strips the
    // hrefs entirely; the link-aware walker preserves them as markdown.
    test('mention becomes [@user](https://x.com/user)', () => {
      createDoc(
        '<article data-testid="tweet">' +
          '<div data-testid="User-Name"><span>User</span><span>@user</span></div>' +
          '<div data-testid="tweetText" lang="en">' +
            '<span>Hi </span>' +
            '<a href="/elonmusk" role="link">@elonmusk</a>' +
            '<span>!</span>' +
          '</div>' +
        '</article>'
      );
      const tweet = extractor.extractSingleTweet(document);
      expect(tweet.text).toBe('Hi [@elonmusk](https://x.com/elonmusk)!');
    });

    test('mention href with leading @ is normalized to canonical /user path', () => {
      // X serves both /user and /@user — the canonical profile URL has no @.
      createDoc(
        '<article data-testid="tweet">' +
          '<div data-testid="User-Name"><span>User</span><span>@user</span></div>' +
          '<div data-testid="tweetText" lang="en">' +
            '<a href="/@bob" role="link">@bob</a>' +
          '</div>' +
        '</article>'
      );
      const tweet = extractor.extractSingleTweet(document);
      expect(tweet.text).toBe('[@bob](https://x.com/bob)');
    });

    test('hashtag becomes [#Tag](https://x.com/hashtag/Tag)', () => {
      createDoc(
        '<article data-testid="tweet">' +
          '<div data-testid="User-Name"><span>User</span><span>@user</span></div>' +
          '<div data-testid="tweetText" lang="en">' +
            '<span>Loving </span>' +
            '<a href="/hashtag/AI?src=hashtag_click">#AI</a>' +
          '</div>' +
        '</article>'
      );
      const tweet = extractor.extractSingleTweet(document);
      expect(tweet.text).toBe('Loving [#AI](https://x.com/hashtag/AI?src=hashtag_click)');
    });

    test('posted URL: display text used as real link target (t.co bypassed)', () => {
      createDoc(
        '<article data-testid="tweet">' +
          '<div data-testid="User-Name"><span>User</span><span>@user</span></div>' +
          '<div data-testid="tweetText" lang="en">' +
            '<span>Read: </span>' +
            '<a href="https://t.co/abc123">example.com/article</a>' +
          '</div>' +
        '</article>'
      );
      const tweet = extractor.extractSingleTweet(document);
      expect(tweet.text).toBe('Read: [example.com/article](https://example.com/article)');
    });

    test('truncated posted URL falls back to t.co href', () => {
      // X truncates long URLs in the visible text (e.g., "example.com/very-lon…").
      // The real URL is unrecoverable from the display, so route through t.co.
      createDoc(
        '<article data-testid="tweet">' +
          '<div data-testid="User-Name"><span>User</span><span>@user</span></div>' +
          '<div data-testid="tweetText" lang="en">' +
            '<a href="https://t.co/xyz789">example.com/very-long-pa…</a>' +
          '</div>' +
        '</article>'
      );
      const tweet = extractor.extractSingleTweet(document);
      expect(tweet.text).toBe('[example.com/very-long-pa…](https://t.co/xyz789)');
    });

    test('mixed body: text + emoji + mention + hashtag preserved together', () => {
      createDoc(
        '<article data-testid="tweet">' +
          '<div data-testid="User-Name"><span>User</span><span>@user</span></div>' +
          '<div data-testid="tweetText" lang="en">' +
            '<img alt="🔥" src="https://abs.twimg.com/emoji/v2/svg/1f525.svg">' +
            '<span> shoutout to </span>' +
            '<a href="/coolperson">@coolperson</a>' +
            '<span> on </span>' +
            '<a href="/hashtag/Friday">#Friday</a>' +
          '</div>' +
        '</article>'
      );
      const tweet = extractor.extractSingleTweet(document);
      expect(tweet.text).toBe(
        '🔥 shoutout to [@coolperson](https://x.com/coolperson) on [#Friday](https://x.com/hashtag/Friday)'
      );
    });

    test('absolute non-t.co URL passes through unchanged', () => {
      // Older/edge cases where X embeds a direct link without the t.co masker.
      createDoc(
        '<article data-testid="tweet">' +
          '<div data-testid="User-Name"><span>User</span><span>@user</span></div>' +
          '<div data-testid="tweetText" lang="en">' +
            '<a href="https://example.com/page">example.com/page</a>' +
          '</div>' +
        '</article>'
      );
      const tweet = extractor.extractSingleTweet(document);
      expect(tweet.text).toBe('[example.com/page](https://example.com/page)');
    });

    test('display name extraction is link-free even when name span contains an <a>', () => {
      // Defensive: if X ever auto-linkifies an @mention inside a display name,
      // we don't want a markdown link inside the author heading.
      createDoc(
        '<article data-testid="tweet">' +
          '<div data-testid="User-Name">' +
            '<span><span>Sponsored by <a href="/brand">@brand</a></span></span>' +
            '<span>@account</span>' +
          '</div>' +
          '<div data-testid="tweetText" lang="en"><span>Hi.</span></div>' +
        '</article>'
      );
      const tweet = extractor.extractSingleTweet(document);
      expect(tweet.author.displayName).not.toContain('](https://x.com');
      expect(tweet.author.displayName).toContain('Sponsored by @brand');
    });
  });

  describe('community note extraction', () => {
    // The birdwatch-pivot block lives inside [data-testid="tweet"] and has
    // a fixed structure: header phrase, body (text + t.co source links),
    // footer chrome ("Do you find this helpful? / Rate it"). Header + footer
    // are skipped; body is preserved with link-aware text walking.
    test('extracts note body with t.co source links unmasked', () => {
      createDoc(
        '<article data-testid="tweet">' +
          '<div data-testid="User-Name"><span>User</span><span>@user</span></div>' +
          '<div data-testid="tweetText" lang="en"><span>Tweet body.</span></div>' +
          '<div data-testid="birdwatch-pivot" role="link">' +
            '<div><span>Readers added context they thought people might want to know</span></div>' +
            '<span></span>' +
            '<div></div>' +
            '<div>' +
              '<span>Uploading palm photos to AI tools shares biometric data. </span>' +
              '<a href="https://t.co/abc">edition.cnn.com/2021/05/25/uk/…</a>' +
              '<span> </span>' +
              '<a href="https://t.co/def">ftc.gov/news-events/ne…</a>' +
            '</div>' +
            '<span></span>' +
            '<div><span>Do you find this helpful?</span><div role="link"><span>Rate it</span></div></div>' +
          '</div>' +
        '</article>'
      );
      const tweet = extractor.extractSingleTweet(document);
      // Both source links truncated (display ends in …), so they round-trip
      // through t.co per the link-walker policy.
      expect(tweet.communityNote).toBe(
        'Uploading palm photos to AI tools shares biometric data. ' +
        '[edition.cnn.com/2021/05/25/uk/…](https://t.co/abc) ' +
        '[ftc.gov/news-events/ne…](https://t.co/def)'
      );
    });

    test('returns null when no community note present', () => {
      createDoc(
        '<article data-testid="tweet">' +
          '<div data-testid="User-Name"><span>User</span><span>@user</span></div>' +
          '<div data-testid="tweetText" lang="en"><span>Plain tweet.</span></div>' +
        '</article>'
      );
      const tweet = extractor.extractSingleTweet(document);
      expect(tweet.communityNote).toBeNull();
    });

    test('skips header (first child) and footer (last child with tappable role=link)', () => {
      // Position-based detection — works in any locale because we don't
      // match the heading/footer phrases. Footer is identified by the
      // tappable role=link "Rate it" UI present in every locale.
      createDoc(
        '<article data-testid="tweet">' +
          '<div data-testid="User-Name"><span>User</span><span>@user</span></div>' +
          '<div data-testid="tweetText" lang="en"><span>Tweet.</span></div>' +
          '<div data-testid="birdwatch-pivot">' +
            '<div>Heading text in any locale</div>' +
            '<div>The actual note body.</div>' +
            '<div><span>Helpfulness prompt</span><div role="link"><span>Rate it</span></div></div>' +
          '</div>' +
        '</article>'
      );
      const tweet = extractor.extractSingleTweet(document);
      expect(tweet.communityNote).toBe('The actual note body.');
      expect(tweet.communityNote).not.toContain('Heading text');
      expect(tweet.communityNote).not.toContain('Rate it');
      expect(tweet.communityNote).not.toContain('Helpfulness');
    });

    test('community note works in non-English locale', () => {
      // Spanish UI: header phrase, body, and footer ("Califícalo") are all
      // localized. Position-based detection still works.
      createDoc(
        '<article data-testid="tweet">' +
          '<div data-testid="User-Name"><span>User</span><span>@user</span></div>' +
          '<div data-testid="tweetText" lang="es"><span>Tweet.</span></div>' +
          '<div data-testid="birdwatch-pivot">' +
            '<div>Los lectores agregaron contexto</div>' +
            '<div>Cuerpo de la nota en español.</div>' +
            '<div><span>¿Te resulta útil?</span><div role="link"><span>Califícalo</span></div></div>' +
          '</div>' +
        '</article>'
      );
      const tweet = extractor.extractSingleTweet(document);
      expect(tweet.communityNote).toBe('Cuerpo de la nota en español.');
    });
  });

  describe('verified author indicator', () => {
    test('detects icon-verified inside User-Name', () => {
      createDoc(`
        <article data-testid="tweet">
          <div data-testid="User-Name">
            <span><span>Mayank Vora</span></span>
            <span>@aiwithmayank</span>
            <svg data-testid="icon-verified" aria-label="Verified account"></svg>
          </div>
          <div data-testid="tweetText" lang="en"><span>Hi.</span></div>
        </article>
      `);
      const tweet = extractor.extractSingleTweet(document);
      expect(tweet.author.verified).toBe(true);
    });

    test('verified is false when no icon present', () => {
      createDoc(`
        <article data-testid="tweet">
          <div data-testid="User-Name">
            <span><span>Plain User</span></span>
            <span>@plainuser</span>
          </div>
          <div data-testid="tweetText" lang="en"><span>Hi.</span></div>
        </article>
      `);
      const tweet = extractor.extractSingleTweet(document);
      expect(tweet.author.verified).toBe(false);
    });
  });

  describe('extract() dispatch method', () => {
    test('dispatches single-tweet to extractSingleTweet', () => {
      createDoc(SINGLE_TWEET_HTML);
      const result = extractor.extract('single-tweet', document, 'https://x.com/elonmusk/status/123456');
      expect(result).not.toBeNull();
      expect(result.author.handle).toBe('elonmusk');
      expect(result.text).toBe('The quick brown fox jumps over the lazy dog.');
    });

    test('dispatches thread to extractThread', () => {
      createDoc(THREAD_HTML);
      const result = extractor.extract('thread', document, 'https://x.com/janedev/status/100');
      expect(result).not.toBeNull();
      expect(result.mainTweet.author.handle).toBe('janedev');
      expect(result.replies).toHaveLength(2);
    });

    test('dispatches article to extractArticle', () => {
      document.documentElement.innerHTML = ARTICLE_HTML;
      const result = extractor.extract('article', document);
      expect(result).not.toBeNull();
      expect(result.title).toBe('My Deep Dive Article');
    });

    test('returns null for unknown content type', () => {
      createDoc(SINGLE_TWEET_HTML);
      const result = extractor.extract('unknown-type', document);
      expect(result).toBeNull();
    });
  });
});
