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
  <button aria-label="1800 replies. Reply"></button>
  <button aria-label="3200 reposts. Repost"></button>
  <button aria-label="12500 Likes. Like"></button>
  <button aria-label="450000 Views. View post analytics"></button>
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
  <button aria-label="50 replies. Reply"></button>
  <button aria-label="200 reposts. Repost"></button>
  <button aria-label="1500 Likes. Like"></button>
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
      expect(tweet.engagement).toEqual({ likes: 0, retweets: 0, replies: 0, views: 0 });
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
          <button aria-label="1,234 Likes. Like"></button>
          <button aria-label="5,678 reposts. Repost"></button>
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
