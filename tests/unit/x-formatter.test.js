'use strict';

const XFormatter = require('../../src/sites/x/x-formatter');

describe('XFormatter', () => {
  let formatter;

  beforeEach(() => {
    formatter = new XFormatter();
  });

  // ── Test data factories ──

  function makeTweet(overrides = {}) {
    return {
      author: { handle: 'testuser', displayName: 'Test User' },
      timestamp: '2026-03-23T14:15:00.000Z',
      text: 'Hello world!',
      media: [],
      quoteTweet: null,
      engagement: { likes: 0, retweets: 0, replies: 0, views: 0 },
      ...overrides
    };
  }

  describe('formatTweet', () => {
    test('formats a basic tweet with all fields', () => {
      const tweet = makeTweet({
        engagement: { likes: 12500, retweets: 3200, replies: 1800, views: 450000 }
      });
      const md = formatter.formatTweet(tweet);

      expect(md).toContain('## @testuser (Test User)');
      expect(md).toContain('*Posted: March 23, 2026 at 2:15 PM*');
      expect(md).toContain('Hello world!');
      expect(md).toContain('12.5K');
      expect(md).toContain('3.2K');
      expect(md).toContain('1.8K');
      expect(md).toContain('450K');
      expect(md).toContain('---');
    });

    test('includes image media', () => {
      const tweet = makeTweet({
        media: [{ type: 'image', url: 'https://pbs.twimg.com/media/photo.jpg' }]
      });
      const md = formatter.formatTweet(tweet);
      expect(md).toContain('![Image](https://pbs.twimg.com/media/photo.jpg)');
    });

    test('includes video media as link', () => {
      const tweet = makeTweet({
        media: [{ type: 'video', url: 'https://video.twimg.com/clip.mp4' }]
      });
      const md = formatter.formatTweet(tweet);
      expect(md).toContain('[Video](https://video.twimg.com/clip.mp4)');
    });

    test('includes multiple media items', () => {
      const tweet = makeTweet({
        media: [
          { type: 'image', url: 'https://pbs.twimg.com/1.jpg' },
          { type: 'image', url: 'https://pbs.twimg.com/2.jpg' },
          { type: 'image', url: 'https://pbs.twimg.com/3.jpg' }
        ]
      });
      const md = formatter.formatTweet(tweet);
      expect(md).toContain('![Image](https://pbs.twimg.com/1.jpg)');
      expect(md).toContain('![Image](https://pbs.twimg.com/2.jpg)');
      expect(md).toContain('![Image](https://pbs.twimg.com/3.jpg)');
    });

    test('omits engagement line when all counts are 0', () => {
      const tweet = makeTweet();
      const md = formatter.formatTweet(tweet);
      // Should not have emoji engagement line
      expect(md).not.toMatch(/[❤🔁💬👁]/);
    });

    test('handles tweet with only handle (no display name)', () => {
      const tweet = makeTweet({ author: { handle: 'solo', displayName: '' } });
      const md = formatter.formatTweet(tweet);
      expect(md).toContain('## @solo');
    });

    test('includes quote tweet as blockquote', () => {
      const tweet = makeTweet({
        quoteTweet: {
          author: { handle: 'quoted', displayName: 'Quoted User' },
          timestamp: '2026-03-22T08:00:00.000Z',
          text: 'Original thought.',
          media: [],
          quoteTweet: null,
          engagement: { likes: 0, retweets: 0, replies: 0, views: 0 }
        }
      });
      const md = formatter.formatTweet(tweet);
      expect(md).toContain('> **@quoted** (Quoted User)');
      expect(md).toContain('> Original thought.');
    });
  });

  describe('formatThread', () => {
    test('formats thread with main tweet and replies', () => {
      const thread = {
        mainTweet: makeTweet({ text: 'Thread starts here.' }),
        replies: [
          makeTweet({ text: 'Second point.', timestamp: '2026-03-23T14:16:00.000Z' }),
          makeTweet({ text: 'Third point.', timestamp: '2026-03-23T14:17:00.000Z' })
        ]
      };
      const md = formatter.formatThread(thread);

      expect(md).toContain('Thread starts here.');
      expect(md).toContain('Second point.');
      expect(md).toContain('Third point.');
      // Should have multiple --- separators
      expect((md.match(/^---$/gm) || []).length).toBe(3);
    });

    test('formats single-tweet thread (no replies)', () => {
      const thread = {
        mainTweet: makeTweet({ text: 'Solo tweet.' }),
        replies: []
      };
      const md = formatter.formatThread(thread);
      expect(md).toContain('Solo tweet.');
      expect((md.match(/^---$/gm) || []).length).toBe(1);
    });
  });

  describe('formatArticle', () => {
    test('formats article with title, author, date, and body', () => {
      const article = {
        author: { handle: 'writer', displayName: 'Writer Name' },
        title: 'My Long Article',
        bodyHtml: '<p>First paragraph.</p><p>Second paragraph.</p>',
        publishedDate: '2026-03-20T09:00:00.000Z'
      };
      const md = formatter.formatArticle(article);

      expect(md).toContain('# My Long Article');
      expect(md).toContain('## @writer (Writer Name)');
      expect(md).toContain('*Published: March 20, 2026 at 9:00 AM*');
      expect(md).toContain('---');
      // Body falls back to tag stripping without converter
      expect(md).toContain('First paragraph.');
      expect(md).toContain('Second paragraph.');
    });

    test('uses converter for body HTML when provided', () => {
      const article = {
        author: { handle: 'writer', displayName: 'Writer' },
        title: 'Article',
        bodyHtml: '<p>Converted content.</p>',
        publishedDate: null
      };
      const mockConverter = {
        convertHtmlFragment: jest.fn().mockReturnValue('Converted content.')
      };
      const md = formatter.formatArticle(article, mockConverter);

      expect(mockConverter.convertHtmlFragment).toHaveBeenCalledWith('<p>Converted content.</p>');
      expect(md).toContain('Converted content.');
    });

    test('handles article with no title', () => {
      const article = {
        author: { handle: 'writer', displayName: 'Writer' },
        title: '',
        bodyHtml: '<p>Content only.</p>',
        publishedDate: null
      };
      const md = formatter.formatArticle(article);
      // No h1 title line (## author heading is fine)
      expect(md).not.toMatch(/^# [^#]/m);
      expect(md).toContain('Content only.');
    });

    test('appends engagement footer when counts are present', () => {
      const article = {
        author: { handle: 'writer', displayName: 'Writer' },
        title: 'Article',
        bodyHtml: '<p>Body.</p>',
        publishedDate: null,
        engagement: { likes: 922, retweets: 135, replies: 20, views: 0 }
      };
      const md = formatter.formatArticle(article);
      // Should appear once, after a horizontal rule, at the end.
      expect(md).toMatch(/Body[\s\S]*\n---\n/);
      expect(md).toMatch(/922/);
      expect(md).toMatch(/135/);
      expect(md).toMatch(/20/);
    });

    test('skips engagement footer when all counts are zero', () => {
      const article = {
        author: { handle: 'writer', displayName: 'Writer' },
        title: 'Article',
        bodyHtml: '<p>Body.</p>',
        publishedDate: null,
        engagement: { likes: 0, retweets: 0, replies: 0, views: 0 }
      };
      const md = formatter.formatArticle(article);
      // Header rule still appears (between metadata and body) but no footer rule.
      const ruleCount = (md.match(/^---$/gm) || []).length;
      expect(ruleCount).toBe(1);
    });

    test('omits engagement footer when engagement is missing', () => {
      const article = {
        author: { handle: 'writer', displayName: 'Writer' },
        title: 'Article',
        bodyHtml: '<p>Body.</p>',
        publishedDate: null
        // no engagement key — backwards-compatible with old extractor output
      };
      expect(() => formatter.formatArticle(article)).not.toThrow();
    });
  });

  describe('formatQuoteTweet', () => {
    test('formats as blockquote', () => {
      const quote = makeTweet({
        author: { handle: 'bob', displayName: 'Bob' },
        text: 'Quoted content.'
      });
      const md = formatter.formatQuoteTweet(quote);

      expect(md).toContain('> **@bob** (Bob)');
      expect(md).toContain('> Quoted content.');
      // Every non-blank line should start with >
      md.split('\n').forEach(line => {
        expect(line).toMatch(/^>/);
      });
    });

    test('includes media in blockquote', () => {
      const quote = makeTweet({
        text: 'Look at this',
        media: [{ type: 'image', url: 'https://pbs.twimg.com/quote.jpg' }]
      });
      const md = formatter.formatQuoteTweet(quote);
      expect(md).toContain('> ![Image](https://pbs.twimg.com/quote.jpg)');
    });
  });

  describe('_formatDate', () => {
    test('formats ISO date to readable string', () => {
      expect(formatter._formatDate('2026-03-23T14:15:00.000Z'))
        .toBe('March 23, 2026 at 2:15 PM');
    });

    test('formats midnight correctly', () => {
      expect(formatter._formatDate('2026-01-01T00:00:00.000Z'))
        .toBe('January 1, 2026 at 12:00 AM');
    });

    test('formats noon correctly', () => {
      expect(formatter._formatDate('2026-06-15T12:30:00.000Z'))
        .toBe('June 15, 2026 at 12:30 PM');
    });

    test('returns input string for invalid date', () => {
      expect(formatter._formatDate('not-a-date')).toBe('not-a-date');
    });
  });

  describe('_formatNumber', () => {
    test('formats numbers under 1000 as-is', () => {
      expect(formatter._formatNumber(0)).toBe('0');
      expect(formatter._formatNumber(999)).toBe('999');
    });

    test('formats thousands with K', () => {
      expect(formatter._formatNumber(1000)).toBe('1K');
      expect(formatter._formatNumber(1500)).toBe('1.5K');
      expect(formatter._formatNumber(12500)).toBe('12.5K');
    });

    test('formats millions with M', () => {
      expect(formatter._formatNumber(1000000)).toBe('1M');
      expect(formatter._formatNumber(1500000)).toBe('1.5M');
      expect(formatter._formatNumber(2300000)).toBe('2.3M');
    });
  });

  describe('_formatEngagement', () => {
    test('formats all engagement stats', () => {
      const line = formatter._formatEngagement({
        likes: 12500, retweets: 3200, replies: 1800, views: 450000
      });
      expect(line).toContain('12.5K');
      expect(line).toContain('3.2K');
      expect(line).toContain('1.8K');
      expect(line).toContain('450K');
    });

    test('returns empty string when all zero', () => {
      expect(formatter._formatEngagement({ likes: 0, retweets: 0, replies: 0, views: 0 }))
        .toBe('');
    });

    test('returns empty string for null engagement', () => {
      expect(formatter._formatEngagement(null)).toBe('');
    });

    test('only includes non-zero stats', () => {
      const line = formatter._formatEngagement({
        likes: 100, retweets: 0, replies: 0, views: 0
      });
      expect(line).toContain('100');
      // Should only have one stat (likes), not retweets/replies/views
      const emojiCount = (line.match(/[❤🔁💬👁]/g) || []).length;
      expect(emojiCount).toBe(1);
    });
  });

  describe('format() dispatch method', () => {
    test('dispatches single-tweet to formatTweet', () => {
      const tweet = makeTweet({ text: 'Dispatch test tweet.' });
      const md = formatter.format('single-tweet', tweet);
      expect(md).toContain('Dispatch test tweet.');
      expect(md).toContain('## @testuser');
    });

    test('dispatches thread to formatThread', () => {
      const thread = {
        mainTweet: makeTweet({ text: 'Thread dispatch.' }),
        replies: [makeTweet({ text: 'Reply.' })]
      };
      const md = formatter.format('thread', thread);
      expect(md).toContain('Thread dispatch.');
      expect(md).toContain('Reply.');
    });

    test('dispatches article to formatArticle', () => {
      const article = {
        author: { handle: 'writer', displayName: 'Writer' },
        title: 'Dispatch Article',
        bodyHtml: '<p>Body content.</p>',
        publishedDate: null
      };
      const md = formatter.format('article', article);
      expect(md).toContain('Dispatch Article');
      expect(md).toContain('Body content.');
    });

    test('returns empty string for unknown content type', () => {
      const md = formatter.format('unknown', {});
      expect(md).toBe('');
    });
  });

  describe('filenameTitle', () => {
    test('single-tweet → "X Post by @{handle}"', () => {
      const tweet = makeTweet({ author: { handle: 'jaredatch', displayName: 'Jared' } });
      expect(formatter.filenameTitle('single-tweet', tweet)).toBe('X Post by @jaredatch');
    });

    test('single-tweet without handle falls back to "X Post"', () => {
      const tweet = makeTweet({ author: { handle: '', displayName: '' } });
      expect(formatter.filenameTitle('single-tweet', tweet)).toBe('X Post');
    });

    test('thread → "X Thread by @{handle}" (uses mainTweet author)', () => {
      const thread = {
        mainTweet: makeTweet({ author: { handle: 'naval', displayName: 'Naval' } }),
        replies: []
      };
      expect(formatter.filenameTitle('thread', thread)).toBe('X Thread by @naval');
    });

    test('thread without handle falls back to "X Thread"', () => {
      const thread = { mainTweet: makeTweet({ author: { handle: '', displayName: '' } }), replies: [] };
      expect(formatter.filenameTitle('thread', thread)).toBe('X Thread');
    });

    test('article → uses data.title as-is', () => {
      const article = { title: 'Creating a Second Brain with Claude Code' };
      expect(formatter.filenameTitle('article', article))
        .toBe('Creating a Second Brain with Claude Code');
    });

    test('article without title falls back to "X Article"', () => {
      expect(formatter.filenameTitle('article', { title: '' })).toBe('X Article');
      expect(formatter.filenameTitle('article', { title: '   ' })).toBe('X Article');
    });

    test('returns null for unknown content type', () => {
      expect(formatter.filenameTitle('unknown', {})).toBeNull();
    });

    test('returns null for missing data', () => {
      expect(formatter.filenameTitle('single-tweet', null)).toBeNull();
    });
  });
});
