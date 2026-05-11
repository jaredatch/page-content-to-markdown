'use strict';

const { compilePathPattern, globToRegex } = require('../../src/utils/path-pattern');

describe('globToRegex', () => {
  test('plain path becomes anchored literal', () => {
    expect(globToRegex('/item')).toBe('^/item$');
  });

  test('* matches a single non-empty path segment', () => {
    expect(globToRegex('/users/*')).toBe('^/users/[^/]+$');
  });

  test('** matches across multiple segments (may be empty)', () => {
    expect(globToRegex('/r/**')).toBe('^/r/.*$');
  });

  test('mixed * and ** in one pattern', () => {
    expect(globToRegex('/r/*/comments/**')).toBe('^/r/[^/]+/comments/.*$');
  });

  test('regex metachars in the literal portion are escaped', () => {
    expect(globToRegex('/blog.post')).toBe('^/blog\\.post$');
  });
});

describe('compilePathPattern', () => {
  test('passes RegExp through unchanged', () => {
    const re = /^\/item$/i;
    expect(compilePathPattern(re)).toBe(re);
  });

  test('glob compiles and matches /item exactly, not /items', () => {
    const re = compilePathPattern('/item');
    expect(re.test('/item')).toBe(true);
    expect(re.test('/items')).toBe(false);
    expect(re.test('/Item')).toBe(true); // case-insensitive
  });

  test('single-* glob respects segment boundaries', () => {
    const re = compilePathPattern('/r/*/comments/*');
    expect(re.test('/r/programming/comments/abc')).toBe(true);
    expect(re.test('/r/programming/comments/abc/extra')).toBe(false);
    expect(re.test('/r/programming/comments/')).toBe(false);
  });

  test('** glob spans multiple segments', () => {
    const re = compilePathPattern('/docs/**');
    expect(re.test('/docs')).toBe(false);
    expect(re.test('/docs/')).toBe(true);
    expect(re.test('/docs/api/v1/users')).toBe(true);
  });

  test('regex-looking string is compiled as regex', () => {
    const re = compilePathPattern('^/(item|comment)$');
    expect(re.test('/item')).toBe(true);
    expect(re.test('/comment')).toBe(true);
    expect(re.test('/items')).toBe(false);
  });

  test('rejects full URLs', () => {
    expect(() => compilePathPattern('https://news.ycombinator.com/item')).toThrow(/URL\.pathname/);
    expect(() => compilePathPattern('http://example.com/foo')).toThrow(/URL\.pathname/);
  });

  test('rejects hostname-prefixed strings', () => {
    expect(() => compilePathPattern('news.ycombinator.com/item')).toThrow(/hostname/i);
    expect(() => compilePathPattern('example.com/foo')).toThrow(/hostname/i);
  });

  test('rejects patterns containing ?', () => {
    expect(() => compilePathPattern('/item?id=*')).toThrow(/query string/i);
  });

  test('rejects empty / non-string input', () => {
    expect(() => compilePathPattern('')).toThrow(/empty/);
    expect(() => compilePathPattern('   ')).toThrow(/empty/);
    expect(() => compilePathPattern(null)).toThrow();
    expect(() => compilePathPattern(42)).toThrow();
  });

  test('case-insensitive matching by default', () => {
    expect(compilePathPattern('/item').test('/ITEM')).toBe(true);
    expect(compilePathPattern('^/Foo$').test('/FOO')).toBe(true);
  });
});
