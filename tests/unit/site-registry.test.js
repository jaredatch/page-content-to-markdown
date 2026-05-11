const SiteRegistry = require('../../src/utils/site-registry');

describe('SiteRegistry', () => {
  describe('detect', () => {
    test.each([
      ['https://x.com/user/status/123'],
      ['https://www.x.com/user/status/123'],
      ['https://mobile.x.com/user/status/123'],
      ['https://twitter.com/user/status/123'],
      ['https://www.twitter.com/user/status/123'],
      ['https://mobile.twitter.com/user/status/123'],
      ['https://x.com'],
      ['https://twitter.com/home']
    ])('returns X site module for: %s', (url) => {
      const site = SiteRegistry.detect(url);
      expect(site).not.toBeNull();
      expect(site.id).toBe('x');
      expect(site.name).toBe('X / Twitter');
    });

    test.each([
      ['https://claude.ai/share/abc123'],
      ['https://claude.ai/chat/abc123'],
      ['https://www.claude.ai/share/abc123']
    ])('returns Claude site module for: %s', (url) => {
      const site = SiteRegistry.detect(url);
      expect(site).not.toBeNull();
      expect(site.id).toBe('claude');
      expect(site.name).toBe('Claude');
    });

    test.each([
      ['https://google.com'],
      ['https://example.com'],
      ['https://notx.com/status/123'],
      ['https://reddit.com/r/test']
    ])('returns null for non-registered URL: %s', (url) => {
      expect(SiteRegistry.detect(url)).toBeNull();
    });

    test.each([
      [''],
      ['not-a-url'],
      [null],
      [undefined]
    ])('returns null for invalid URL: %s', (url) => {
      expect(SiteRegistry.detect(url)).toBeNull();
    });
  });

  describe('getById', () => {
    test('returns X module for id "x"', () => {
      const site = SiteRegistry.getById('x');
      expect(site).not.toBeNull();
      expect(site.id).toBe('x');
      expect(site.Extractor).toBeDefined();
      expect(site.Formatter).toBeDefined();
    });

    test('returns null for unknown id', () => {
      expect(SiteRegistry.getById('unknown')).toBeNull();
      expect(SiteRegistry.getById('')).toBeNull();
    });
  });

  describe('all', () => {
    test('returns array of registered site modules', () => {
      const sites = SiteRegistry.all();
      expect(Array.isArray(sites)).toBe(true);
      expect(sites.length).toBeGreaterThanOrEqual(1);
      expect(sites[0].id).toBe('x');
    });
  });

  describe('site module shape', () => {
    test('each registered site has required fields', () => {
      for (const site of SiteRegistry.all()) {
        expect(typeof site.id).toBe('string');
        expect(typeof site.name).toBe('string');
        expect(Array.isArray(site.hostnames)).toBe(true);
        expect(site.hostnames.length).toBeGreaterThan(0);
        expect(Array.isArray(site.contentTypes)).toBe(true);
        expect(site.contentTypes.length).toBeGreaterThan(0);
        expect(site.Extractor).toBeDefined();
        expect(site.Formatter).toBeDefined();

        // Each content type has required fields
        for (const ct of site.contentTypes) {
          expect(typeof ct.id).toBe('string');
          expect(typeof ct.label).toBe('string');
          expect(typeof ct.icon).toBe('string');
        }
      }
    });

    test('Extractor has extract() dispatch method', () => {
      for (const site of SiteRegistry.all()) {
        const extractor = new site.Extractor();
        expect(typeof extractor.extract).toBe('function');
      }
    });

    test('Formatter has format() dispatch method', () => {
      for (const site of SiteRegistry.all()) {
        const formatter = new site.Formatter();
        expect(typeof formatter.format).toBe('function');
      }
    });
  });

  describe('applicableContentTypes', () => {
    const xSite = SiteRegistry.getById('x');
    const claudeSite = SiteRegistry.getById('claude');
    const grokSite = SiteRegistry.getById('grok');

    test('X home/feed/profile returns nothing applicable', () => {
      expect(SiteRegistry.applicableContentTypes(xSite, 'https://x.com/home')).toHaveLength(0);
      expect(SiteRegistry.applicableContentTypes(xSite, 'https://x.com/explore')).toHaveLength(0);
      expect(SiteRegistry.applicableContentTypes(xSite, 'https://x.com/notifications')).toHaveLength(0);
      expect(SiteRegistry.applicableContentTypes(xSite, 'https://x.com/somebody')).toHaveLength(0);
      expect(SiteRegistry.applicableContentTypes(xSite, 'https://x.com')).toHaveLength(0);
    });

    test('X /status/ URL offers all three content types (DOM disambiguates)', () => {
      const types = SiteRegistry.applicableContentTypes(xSite, 'https://x.com/elonmusk/status/12345');
      const ids = types.map(t => t.id).sort();
      expect(ids).toEqual(['article', 'single-tweet', 'thread']);
    });

    test('X /i/article/ URL offers only article', () => {
      const types = SiteRegistry.applicableContentTypes(xSite, 'https://x.com/i/article/12345');
      expect(types.map(t => t.id)).toEqual(['article']);
    });

    test('X /{user}/article/{id} URL offers only article', () => {
      const types = SiteRegistry.applicableContentTypes(xSite, 'https://x.com/garrytan/article/2046876981711769720');
      expect(types.map(t => t.id)).toEqual(['article']);
    });

    test('Claude /share/ and /chat/ offer conversation; bare hostname does not', () => {
      expect(SiteRegistry.applicableContentTypes(claudeSite, 'https://claude.ai/share/abc')).toHaveLength(1);
      expect(SiteRegistry.applicableContentTypes(claudeSite, 'https://claude.ai/chat/xyz')).toHaveLength(1);
      expect(SiteRegistry.applicableContentTypes(claudeSite, 'https://claude.ai/new')).toHaveLength(0);
      expect(SiteRegistry.applicableContentTypes(claudeSite, 'https://claude.ai/')).toHaveLength(0);
    });

    test('Grok /share/ and /c/ offer conversation; bare hostname does not', () => {
      expect(SiteRegistry.applicableContentTypes(grokSite, 'https://grok.com/share/foo')).toHaveLength(1);
      expect(SiteRegistry.applicableContentTypes(grokSite, 'https://grok.com/c/abc123')).toHaveLength(1);
      expect(SiteRegistry.applicableContentTypes(grokSite, 'https://grok.com/')).toHaveLength(0);
    });

    test('returns empty for null site or invalid URL', () => {
      expect(SiteRegistry.applicableContentTypes(null, 'https://x.com')).toEqual([]);
      expect(SiteRegistry.applicableContentTypes(xSite, 'not-a-url')).toEqual([]);
    });

    test('content types without pathPatterns are treated as always-applicable', () => {
      const fakeSite = {
        contentTypes: [
          { id: 'always', label: 'Always', icon: '' }, // no pathPatterns
          { id: 'restricted', label: 'Restricted', icon: '', pathPatterns: [/\/match\//] }
        ]
      };
      const types = SiteRegistry.applicableContentTypes(fakeSite, 'https://example.com/anywhere');
      expect(types.map(t => t.id)).toEqual(['always']);
    });

    test('glob string pathPatterns are accepted alongside RegExp', () => {
      const fakeSite = {
        contentTypes: [
          { id: 'post', label: 'Post', icon: '', pathPatterns: ['/item'] },
          { id: 'thread', label: 'Thread', icon: '', pathPatterns: ['/r/*/comments/*'] }
        ]
      };
      expect(SiteRegistry.applicableContentTypes(fakeSite, 'https://news.ycombinator.com/item').map(t => t.id))
        .toEqual(['post']);
      expect(SiteRegistry.applicableContentTypes(fakeSite, 'https://news.ycombinator.com/items').map(t => t.id))
        .toEqual([]);
      expect(SiteRegistry.applicableContentTypes(fakeSite, 'https://reddit.com/r/programming/comments/abc').map(t => t.id))
        .toEqual(['thread']);
    });

    test('regex strings (with metachars) are compiled as regex, not glob', () => {
      const fakeSite = {
        contentTypes: [
          { id: 'either', label: 'Either', icon: '', pathPatterns: ['^/(foo|bar)$'] }
        ]
      };
      expect(SiteRegistry.applicableContentTypes(fakeSite, 'https://e.com/foo')).toHaveLength(1);
      expect(SiteRegistry.applicableContentTypes(fakeSite, 'https://e.com/bar')).toHaveLength(1);
      expect(SiteRegistry.applicableContentTypes(fakeSite, 'https://e.com/baz')).toHaveLength(0);
    });

    test('invalid pathPattern strings are skipped without crashing', () => {
      const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
      const fakeSite = {
        contentTypes: [
          { id: 'broken', label: 'Broken', icon: '', pathPatterns: ['https://full.url/item'] }
        ]
      };
      expect(SiteRegistry.applicableContentTypes(fakeSite, 'https://full.url/item')).toEqual([]);
      expect(warn).toHaveBeenCalledWith(
        expect.stringContaining('invalid pathPattern'),
        expect.any(String)
      );
      warn.mockRestore();
    });
  });
});
