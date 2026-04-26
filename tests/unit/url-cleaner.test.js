const UrlCleaner = require('../../src/utils/url-cleaner');

describe('UrlCleaner.cleanUrl', () => {
  test('strips utm_* params', () => {
    const input = 'https://example.com/post?utm_source=newsletter&utm_medium=email&utm_campaign=spring';
    expect(UrlCleaner.cleanUrl(input)).toBe('https://example.com/post');
  });

  test('strips fbclid, gclid, msclkid', () => {
    expect(UrlCleaner.cleanUrl('https://example.com/?fbclid=abc')).toBe('https://example.com/');
    expect(UrlCleaner.cleanUrl('https://example.com/?gclid=xyz')).toBe('https://example.com/');
    expect(UrlCleaner.cleanUrl('https://example.com/?msclkid=123')).toBe('https://example.com/');
  });

  test('strips Mailchimp + HubSpot params', () => {
    const input = 'https://example.com/?mc_cid=abc&mc_eid=xyz&_hsenc=foo&__hssc=bar';
    expect(UrlCleaner.cleanUrl(input)).toBe('https://example.com/');
  });

  test('preserves legitimate query params alongside trackers', () => {
    const input = 'https://example.com/search?q=hello&utm_source=twitter&page=2';
    expect(UrlCleaner.cleanUrl(input)).toBe('https://example.com/search?q=hello&page=2');
  });

  test('returns input unchanged when no tracking params present', () => {
    const input = 'https://example.com/path?id=42&category=news';
    expect(UrlCleaner.cleanUrl(input)).toBe(input);
  });

  test('preserves anchor / hash fragment', () => {
    const input = 'https://example.com/post?utm_source=twitter#section-2';
    expect(UrlCleaner.cleanUrl(input)).toBe('https://example.com/post#section-2');
  });

  test('does not strip generic single-letter params (s, t, ref)', () => {
    // These collide with too many legitimate uses
    const input = 'https://example.com/?s=query&t=tab&ref=home';
    expect(UrlCleaner.cleanUrl(input)).toBe(input);
  });

  test('returns input unchanged for unparseable URLs', () => {
    expect(UrlCleaner.cleanUrl('not a url')).toBe('not a url');
    expect(UrlCleaner.cleanUrl('')).toBe('');
  });

  test('handles non-string input gracefully', () => {
    expect(UrlCleaner.cleanUrl(null)).toBe(null);
    expect(UrlCleaner.cleanUrl(undefined)).toBe(undefined);
    expect(UrlCleaner.cleanUrl(42)).toBe(42);
  });
});

describe('UrlCleaner.cleanUrlsInMarkdown', () => {
  test('cleans URLs inside inline markdown links', () => {
    const md = 'See [this post](https://example.com/p?utm_source=foo&id=1) for details.';
    const out = UrlCleaner.cleanUrlsInMarkdown(md);
    expect(out).toBe('See [this post](https://example.com/p?id=1) for details.');
  });

  test('cleans URLs in reference-style link definitions', () => {
    const md = '[1]: https://example.com/p?fbclid=abc';
    expect(UrlCleaner.cleanUrlsInMarkdown(md)).toBe('[1]: https://example.com/p');
  });

  test('cleans bare URLs in body text', () => {
    const md = 'Visit https://example.com/?utm_campaign=launch today.';
    expect(UrlCleaner.cleanUrlsInMarkdown(md)).toBe('Visit https://example.com/ today.');
  });

  test('leaves clean URLs alone', () => {
    const md = '[Home](https://example.com/) and [Docs](https://example.com/docs)';
    expect(UrlCleaner.cleanUrlsInMarkdown(md)).toBe(md);
  });

  test('handles multiple URLs in one document', () => {
    const md = [
      '[A](https://a.com/?utm_source=x)',
      '[B](https://b.com/?gclid=y)',
      '[C](https://c.com/?id=42)'
    ].join('\n');
    const out = UrlCleaner.cleanUrlsInMarkdown(md);
    expect(out).toBe([
      '[A](https://a.com/)',
      '[B](https://b.com/)',
      '[C](https://c.com/?id=42)'
    ].join('\n'));
  });
});

describe('UrlCleaner.isTrackingParam', () => {
  test('matches utm_* prefix', () => {
    expect(UrlCleaner.isTrackingParam('utm_source')).toBe(true);
    expect(UrlCleaner.isTrackingParam('utm_anything_at_all')).toBe(true);
  });

  test('matches well-known names', () => {
    expect(UrlCleaner.isTrackingParam('fbclid')).toBe(true);
    expect(UrlCleaner.isTrackingParam('gclid')).toBe(true);
    expect(UrlCleaner.isTrackingParam('mc_cid')).toBe(true);
    expect(UrlCleaner.isTrackingParam('igshid')).toBe(true);
  });

  test('rejects generic params', () => {
    expect(UrlCleaner.isTrackingParam('id')).toBe(false);
    expect(UrlCleaner.isTrackingParam('q')).toBe(false);
    expect(UrlCleaner.isTrackingParam('ref')).toBe(false);
    expect(UrlCleaner.isTrackingParam('s')).toBe(false);
  });
});
