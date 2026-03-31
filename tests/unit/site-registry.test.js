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
});
