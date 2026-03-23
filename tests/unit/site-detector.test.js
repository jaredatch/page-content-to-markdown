'use strict';

const SiteDetector = require('../../src/utils/site-detector');

describe('SiteDetector', () => {
  describe('isX', () => {
    test.each([
      ['https://x.com/user/status/123', true],
      ['https://www.x.com/user/status/123', true],
      ['https://mobile.x.com/user/status/123', true],
      ['https://twitter.com/user/status/123', true],
      ['https://www.twitter.com/user/status/123', true],
      ['https://mobile.twitter.com/user/status/123', true],
      ['https://x.com', true],
      ['https://twitter.com/home', true],
    ])('returns true for X/Twitter URL: %s', (url, expected) => {
      expect(SiteDetector.isX(url)).toBe(expected);
    });

    test.each([
      ['https://google.com', false],
      ['https://example.com', false],
      ['https://notx.com/status/123', false],
      ['https://fakex.com', false],
      ['https://xtwitter.com', false],
      ['', false],
      ['not-a-url', false],
      [null, false],
      [undefined, false],
    ])('returns false for non-X URL: %s', (url, expected) => {
      expect(SiteDetector.isX(url)).toBe(expected);
    });
  });

  describe('detect', () => {
    test('returns { site: "x" } for X/Twitter URLs', () => {
      expect(SiteDetector.detect('https://x.com/user/status/123')).toEqual({ site: 'x' });
      expect(SiteDetector.detect('https://twitter.com/home')).toEqual({ site: 'x' });
    });

    test('returns { site: "generic" } for non-X URLs', () => {
      expect(SiteDetector.detect('https://google.com')).toEqual({ site: 'generic' });
      expect(SiteDetector.detect('https://example.com')).toEqual({ site: 'generic' });
    });

    test('returns { site: "generic" } for invalid URLs', () => {
      expect(SiteDetector.detect('')).toEqual({ site: 'generic' });
      expect(SiteDetector.detect('not-a-url')).toEqual({ site: 'generic' });
    });
  });
});
