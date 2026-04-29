const FilenameTemplate = require('../../src/utils/filename-template');
const {
  formatFilename,
  formatDate,
  expandTemplate,
  applyStyle,
  slugify,
  FALLBACK_FILENAME
} = FilenameTemplate;

// Fixed reference date used across tests so output is deterministic.
// 2026-04-25 14:05:09 local time. Day = Saturday.
const FIXED_DATE = new Date(2026, 3, 25, 14, 5, 9);

const SAMPLE_CONTEXT = {
  title: 'Example Article',
  url: 'https://www.example.com/blog/post-name',
  date: FIXED_DATE
};

describe('formatDate', () => {
  describe('year', () => {
    test('YYYY → 4-digit year', () => {
      expect(formatDate(FIXED_DATE, 'YYYY')).toBe('2026');
    });
    test('YY → 2-digit year', () => {
      expect(formatDate(FIXED_DATE, 'YY')).toBe('26');
    });
  });

  describe('month', () => {
    test('MM → padded month', () => {
      expect(formatDate(FIXED_DATE, 'MM')).toBe('04');
    });
    test('M → unpadded month', () => {
      expect(formatDate(FIXED_DATE, 'M')).toBe('4');
    });
    test('MMM → short month name', () => {
      expect(formatDate(FIXED_DATE, 'MMM')).toBe('Apr');
    });
    test('MMMM → full month name', () => {
      expect(formatDate(FIXED_DATE, 'MMMM')).toBe('April');
    });
  });

  describe('day', () => {
    test('DD → padded day', () => {
      expect(formatDate(new Date(2026, 0, 5), 'DD')).toBe('05');
    });
    test('D → unpadded day', () => {
      expect(formatDate(new Date(2026, 0, 5), 'D')).toBe('5');
    });
    test('ddd → short day name', () => {
      expect(formatDate(FIXED_DATE, 'ddd')).toBe('Sat');
    });
    test('dddd → full day name', () => {
      expect(formatDate(FIXED_DATE, 'dddd')).toBe('Saturday');
    });
  });

  describe('hours', () => {
    test('HH → padded 24-hour', () => {
      expect(formatDate(new Date(2026, 0, 1, 9, 0), 'HH')).toBe('09');
      expect(formatDate(new Date(2026, 0, 1, 14, 0), 'HH')).toBe('14');
    });
    test('H → unpadded 24-hour', () => {
      expect(formatDate(new Date(2026, 0, 1, 9, 0), 'H')).toBe('9');
    });
    test('hh → padded 12-hour', () => {
      expect(formatDate(new Date(2026, 0, 1, 0, 0), 'hh')).toBe('12');
      expect(formatDate(new Date(2026, 0, 1, 1, 0), 'hh')).toBe('01');
      expect(formatDate(new Date(2026, 0, 1, 12, 0), 'hh')).toBe('12');
      expect(formatDate(new Date(2026, 0, 1, 13, 0), 'hh')).toBe('01');
      expect(formatDate(new Date(2026, 0, 1, 23, 0), 'hh')).toBe('11');
    });
    test('h → unpadded 12-hour', () => {
      expect(formatDate(new Date(2026, 0, 1, 0, 0), 'h')).toBe('12');
      expect(formatDate(new Date(2026, 0, 1, 13, 0), 'h')).toBe('1');
    });
  });

  describe('minutes and seconds', () => {
    test('mm → padded minute', () => {
      expect(formatDate(new Date(2026, 0, 1, 0, 5, 0), 'mm')).toBe('05');
    });
    test('m → unpadded minute', () => {
      expect(formatDate(new Date(2026, 0, 1, 0, 5, 0), 'm')).toBe('5');
    });
    test('ss → padded second', () => {
      expect(formatDate(new Date(2026, 0, 1, 0, 0, 9), 'ss')).toBe('09');
    });
    test('s → unpadded second', () => {
      expect(formatDate(new Date(2026, 0, 1, 0, 0, 9), 's')).toBe('9');
    });
  });

  describe('AM/PM', () => {
    test('A → uppercase AM', () => {
      expect(formatDate(new Date(2026, 0, 1, 9, 0), 'A')).toBe('AM');
    });
    test('A → uppercase PM', () => {
      expect(formatDate(new Date(2026, 0, 1, 15, 0), 'A')).toBe('PM');
    });
    test('a → lowercase am/pm', () => {
      expect(formatDate(new Date(2026, 0, 1, 9, 0), 'a')).toBe('am');
      expect(formatDate(new Date(2026, 0, 1, 15, 0), 'a')).toBe('pm');
    });
  });

  describe('combinations and literals', () => {
    test('full date format', () => {
      expect(formatDate(FIXED_DATE, 'YYYY-MM-DD')).toBe('2026-04-25');
    });
    test('full datetime format', () => {
      expect(formatDate(FIXED_DATE, 'YYYY-MM-DD HH:mm:ss')).toBe('2026-04-25 14:05:09');
    });
    test('mixed punctuation passes through', () => {
      expect(formatDate(FIXED_DATE, 'MM/DD/YY')).toBe('04/25/26');
    });
    test('bracket-escaped literals', () => {
      expect(formatDate(FIXED_DATE, '[Year] YYYY')).toBe('Year 2026');
    });
    test('bracket-escaped letters that would otherwise be tokens', () => {
      expect(formatDate(FIXED_DATE, '[MMMM] MMMM')).toBe('MMMM April');
    });
    test('unrecognized letters pass through as literals', () => {
      // 'q' is not a token, should remain
      expect(formatDate(FIXED_DATE, 'qYYYYq')).toBe('q2026q');
    });
  });

  describe('timezone offset', () => {
    test('Z and ZZ produce a sign-prefixed offset', () => {
      const colon = formatDate(FIXED_DATE, 'Z');
      const compact = formatDate(FIXED_DATE, 'ZZ');
      expect(colon).toMatch(/^[+-]\d{2}:\d{2}$/);
      expect(compact).toMatch(/^[+-]\d{4}$/);
    });
  });

  describe('defensive defaults', () => {
    test('missing format string falls back to default date format', () => {
      expect(formatDate(FIXED_DATE, '')).toBe('2026-04-25');
    });
    test('non-Date input falls back to "now" — output is well-formed', () => {
      // We can't assert exact value (uses real "now"), but the result
      // should at least match the default YYYY-MM-DD shape.
      expect(formatDate('not a date', 'YYYY-MM-DD')).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    });
  });
});

describe('expandTemplate', () => {
  describe('token resolution', () => {
    test('{title} resolves to context.title', () => {
      expect(expandTemplate('{title}', SAMPLE_CONTEXT)).toBe('Example Article');
    });
    test('{title} falls back to "page" when title is empty', () => {
      expect(expandTemplate('{title}', { ...SAMPLE_CONTEXT, title: '' })).toBe('page');
    });
    test('{title} falls back to "page" when title is missing', () => {
      expect(expandTemplate('{title}', { url: 'https://example.com', date: FIXED_DATE })).toBe('page');
    });
    test('{domain} strips www.', () => {
      expect(expandTemplate('{domain}', SAMPLE_CONTEXT)).toBe('example.com');
    });
    test('{domain} preserves non-www subdomains', () => {
      const ctx = { ...SAMPLE_CONTEXT, url: 'https://news.example.com/' };
      expect(expandTemplate('{domain}', ctx)).toBe('news.example.com');
    });
    test('{host} preserves www.', () => {
      expect(expandTemplate('{host}', SAMPLE_CONTEXT)).toBe('www.example.com');
    });
    test('{path} returns pathname without leading/trailing slashes', () => {
      expect(expandTemplate('{path}', SAMPLE_CONTEXT)).toBe('blog/post-name');
    });
    test('{path} is empty for root URL', () => {
      const ctx = { ...SAMPLE_CONTEXT, url: 'https://example.com/' };
      expect(expandTemplate('{path}', ctx)).toBe('');
    });
    test('{slug} returns the last path segment', () => {
      expect(expandTemplate('{slug}', SAMPLE_CONTEXT)).toBe('post-name');
    });
    test('{slug} is empty for root URL', () => {
      const ctx = { ...SAMPLE_CONTEXT, url: 'https://example.com/' };
      expect(expandTemplate('{slug}', ctx)).toBe('');
    });
    test('{date} uses default YYYY-MM-DD', () => {
      expect(expandTemplate('{date}', SAMPLE_CONTEXT)).toBe('2026-04-25');
    });
    test('{date:fmt} accepts custom format', () => {
      expect(expandTemplate('{date:MMM-DD-YYYY}', SAMPLE_CONTEXT)).toBe('Apr-25-2026');
    });
    test('{time} uses default HHmmss', () => {
      expect(expandTemplate('{time}', SAMPLE_CONTEXT)).toBe('140509');
    });
    test('{time:fmt} accepts custom format', () => {
      expect(expandTemplate('{time:HH-mm}', SAMPLE_CONTEXT)).toBe('14-05');
    });
    test('{datetime} uses default YYYY-MM-DD_HHmmss', () => {
      expect(expandTemplate('{datetime}', SAMPLE_CONTEXT)).toBe('2026-04-25_140509');
    });
    test('{datetime:fmt} accepts custom format with embedded literals', () => {
      expect(expandTemplate('{datetime:YYYY-MM-DD HH:mm}', SAMPLE_CONTEXT))
        .toBe('2026-04-25 14:05');
    });
    test('unknown tokens render as empty string', () => {
      expect(expandTemplate('{author}', SAMPLE_CONTEXT)).toBe('');
    });
  });

  describe('template structure', () => {
    test('combines multiple tokens with literals', () => {
      expect(expandTemplate('{date} - {title}', SAMPLE_CONTEXT))
        .toBe('2026-04-25 - Example Article');
    });
    test('preserves literal characters between tokens', () => {
      expect(expandTemplate('[{date}]_{title}', SAMPLE_CONTEXT))
        .toBe('[2026-04-25]_Example Article');
    });
    test('empty template returns empty string', () => {
      expect(expandTemplate('', SAMPLE_CONTEXT)).toBe('');
    });
    test('template with no tokens returns input verbatim', () => {
      expect(expandTemplate('static-name', SAMPLE_CONTEXT)).toBe('static-name');
    });
    test('non-string template returns empty string', () => {
      expect(expandTemplate(null, SAMPLE_CONTEXT)).toBe('');
      expect(expandTemplate(undefined, SAMPLE_CONTEXT)).toBe('');
      expect(expandTemplate(42, SAMPLE_CONTEXT)).toBe('');
    });
  });

  describe('context handling', () => {
    test('invalid URL is handled gracefully', () => {
      const ctx = { title: 'Test', url: 'not a url', date: FIXED_DATE };
      expect(expandTemplate('{domain}-{slug}', ctx)).toBe('-');
    });
    test('missing url leaves URL-derived tokens empty', () => {
      const ctx = { title: 'Test', date: FIXED_DATE };
      expect(expandTemplate('{domain}', ctx)).toBe('');
      expect(expandTemplate('{path}', ctx)).toBe('');
      expect(expandTemplate('{slug}', ctx)).toBe('');
    });
    test('missing date defaults to "now"', () => {
      const ctx = { title: 'Test', url: 'https://example.com' };
      expect(expandTemplate('{date}', ctx)).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    });
  });
});

describe('slugify', () => {
  test('lowercases and replaces whitespace', () => {
    expect(slugify('Hello World', '-')).toBe('hello-world');
  });
  test('strips diacritics', () => {
    expect(slugify('Café au lait', '-')).toBe('cafe-au-lait');
    expect(slugify('Naïve résumé', '-')).toBe('naive-resume');
    expect(slugify('São Paulo', '-')).toBe('sao-paulo');
  });
  test('collapses runs of non-alphanumerics', () => {
    expect(slugify('one !!! two', '-')).toBe('one-two');
  });
  test('trims leading and trailing separators', () => {
    expect(slugify('  hello  ', '-')).toBe('hello');
    expect(slugify('!!hello!!', '-')).toBe('hello');
  });
  test('preserves digits', () => {
    expect(slugify('Year 2026 Q1', '-')).toBe('year-2026-q1');
  });
  test('snake separator works the same way', () => {
    expect(slugify('Hello World!', '_')).toBe('hello_world');
  });
  test('all-special-character input becomes empty', () => {
    expect(slugify('!!!', '-')).toBe('');
  });
});

describe('applyStyle', () => {
  describe('preserve', () => {
    test('keeps spaces and case', () => {
      expect(applyStyle('Hello World', 'preserve')).toBe('Hello World');
    });
    test('replaces FS-illegal characters with -', () => {
      expect(applyStyle('a/b\\c:d*e?f"g<h>i|j', 'preserve')).toBe('a-b-c-d-e-f-g-h-i-j');
    });
    test('strips control characters', () => {
      expect(applyStyle('Hello\x00World', 'preserve')).toBe('HelloWorld');
    });
    test('collapses internal whitespace runs to a single space', () => {
      expect(applyStyle('a    b', 'preserve')).toBe('a b');
    });
    test('trims leading and trailing whitespace', () => {
      expect(applyStyle('  hello  ', 'preserve')).toBe('hello');
    });
    test('trims trailing dots (Windows compat)', () => {
      expect(applyStyle('hello...', 'preserve')).toBe('hello');
    });
    test('trims leading dots', () => {
      expect(applyStyle('...hello', 'preserve')).toBe('hello');
    });
    test('preserves internal dots (e.g., domain names)', () => {
      expect(applyStyle('example.com', 'preserve')).toBe('example.com');
    });
  });

  describe('kebab', () => {
    test('lowercases and uses hyphens', () => {
      expect(applyStyle('Hello World', 'kebab')).toBe('hello-world');
    });
    test('strips FS-illegal chars implicitly', () => {
      expect(applyStyle('a/b:c', 'kebab')).toBe('a-b-c');
    });
  });

  describe('snake', () => {
    test('lowercases and uses underscores', () => {
      expect(applyStyle('Hello World', 'snake')).toBe('hello_world');
    });
    test('multiple words and punctuation collapse to single underscore', () => {
      expect(applyStyle('one!!two..three', 'snake')).toBe('one_two_three');
    });
  });

  describe('unknown style falls back to preserve', () => {
    test('treats unknown style as preserve', () => {
      expect(applyStyle('Hello World', 'unknown')).toBe('Hello World');
    });
    test('treats undefined style as preserve', () => {
      expect(applyStyle('Hello World')).toBe('Hello World');
    });
  });
});

describe('formatFilename', () => {
  describe('integration with default template', () => {
    test('default template + preserve + sample context', () => {
      expect(formatFilename('{title} - {date}', 'preserve', SAMPLE_CONTEXT))
        .toBe('Example Article - 2026-04-25.md');
    });
    test('default template + kebab', () => {
      expect(formatFilename('{title} - {date}', 'kebab', SAMPLE_CONTEXT))
        .toBe('example-article-2026-04-25.md');
    });
    test('default template + snake', () => {
      expect(formatFilename('{title} - {date}', 'snake', SAMPLE_CONTEXT))
        .toBe('example_article_2026_04_25.md');
    });
  });

  describe('user examples from feature spec', () => {
    test('"espn.com 04/02/26" template + preserve', () => {
      // User example: "espn.com 04/02/26.md"
      // Template: "{domain} {date:MM/DD/YY}"
      const ctx = { ...SAMPLE_CONTEXT, url: 'https://www.espn.com/', date: new Date(2026, 3, 2) };
      // The "/" inside the date format will be replaced with "-" by preserve
      // since "/" is FS-illegal even when the user types it.
      expect(formatFilename('{domain} {date:MM/DD/YY}', 'preserve', ctx))
        .toBe('espn.com 04-02-26.md');
    });
    test('domain-prefixed kebab', () => {
      const ctx = { ...SAMPLE_CONTEXT, url: 'https://nytimes.com/article/foo' };
      expect(formatFilename('{domain}-{slug}', 'kebab', ctx))
        .toBe('nytimes-com-foo.md');
    });
    test('date-only template still works (no title)', () => {
      expect(formatFilename('{date}', 'preserve', SAMPLE_CONTEXT))
        .toBe('2026-04-25.md');
    });
  });

  describe('extension and fallback', () => {
    test('always appends .md', () => {
      expect(formatFilename('foo', 'preserve', SAMPLE_CONTEXT)).toBe('foo.md');
    });
    test('empty template falls back to page.md', () => {
      expect(formatFilename('', 'preserve', SAMPLE_CONTEXT)).toBe(FALLBACK_FILENAME);
    });
    test('template that resolves entirely empty falls back to page.md', () => {
      // {author} unknown, no other tokens
      expect(formatFilename('{author}', 'preserve', SAMPLE_CONTEXT))
        .toBe(FALLBACK_FILENAME);
    });
    test('template that sanitizes to empty falls back to page.md', () => {
      // Only FS-illegal chars in literals
      expect(formatFilename('////', 'preserve', SAMPLE_CONTEXT))
        .toBe(FALLBACK_FILENAME);
    });
  });

  describe('truncation', () => {
    test('truncates very long titles to ≤200 chars including .md', () => {
      const longTitle = 'a'.repeat(500);
      const ctx = { ...SAMPLE_CONTEXT, title: longTitle };
      const result = formatFilename('{title}', 'preserve', ctx);
      expect(result.length).toBeLessThanOrEqual(200);
      expect(result.endsWith('.md')).toBe(true);
    });
    test('walks back to a separator boundary in kebab mode', () => {
      const longTitle = ('word ').repeat(100);
      const ctx = { ...SAMPLE_CONTEXT, title: longTitle };
      const result = formatFilename('{title}', 'kebab', ctx);
      expect(result.length).toBeLessThanOrEqual(200);
      expect(result.endsWith('.md')).toBe(true);
      // Should end on a word, not mid-word
      expect(result).toMatch(/word\.md$/);
    });
    test('strips trailing separators after truncation', () => {
      const longTitle = ('word_').repeat(100);
      const ctx = { ...SAMPLE_CONTEXT, title: longTitle };
      const result = formatFilename('{title}', 'snake', ctx);
      // No trailing _ before .md
      expect(result).not.toMatch(/_\.md$/);
    });
  });

  describe('style transforms apply to literals in template', () => {
    test('kebab transforms the entire expanded string including literal separators', () => {
      // Template literal " - " becomes "-" after kebab slugification
      expect(formatFilename('{title} - {date}', 'kebab', SAMPLE_CONTEXT))
        .toBe('example-article-2026-04-25.md');
    });
    test('snake collapses literal whitespace and dashes', () => {
      expect(formatFilename('{title} - {date}', 'snake', SAMPLE_CONTEXT))
        .toBe('example_article_2026_04_25.md');
    });
    test('preserve keeps user-typed literal separators', () => {
      expect(formatFilename('{title}_{date}', 'preserve', SAMPLE_CONTEXT))
        .toBe('Example Article_2026-04-25.md');
    });
  });

  describe('user-typed FS-illegal chars in template', () => {
    test('preserve replaces user-typed slashes with hyphens', () => {
      // User wrote "{date:MM/DD/YY}" — slashes inside the date format
      // expand to literals in the result. preserve replaces them.
      const result = formatFilename('{date:MM/DD/YY}', 'preserve', SAMPLE_CONTEXT);
      expect(result).toBe('04-25-26.md');
    });
    test('kebab strips user-typed colons', () => {
      const result = formatFilename('{datetime:HH:mm:ss}', 'kebab', SAMPLE_CONTEXT);
      expect(result).toBe('14-05-09.md');
    });
  });

  describe('edge cases', () => {
    test('handles missing context gracefully', () => {
      const result = formatFilename('{title} - {date}', 'preserve', {});
      // title falls back to "page"; date defaults to now
      expect(result).toMatch(/^page - \d{4}-\d{2}-\d{2}\.md$/);
    });
    test('handles undefined context', () => {
      const result = formatFilename('{title}', 'preserve');
      expect(result).toBe('page.md');
    });
    test('non-string template falls back gracefully', () => {
      expect(formatFilename(null, 'preserve', SAMPLE_CONTEXT)).toBe(FALLBACK_FILENAME);
      expect(formatFilename(undefined, 'preserve', SAMPLE_CONTEXT)).toBe(FALLBACK_FILENAME);
    });
    test('title containing brace literals is inserted as-is, not re-parsed', () => {
      // Title contains "{Title}" — should NOT be treated as a token
      const ctx = { ...SAMPLE_CONTEXT, title: 'My {Title}' };
      const result = formatFilename('{title}', 'preserve', ctx);
      expect(result).toBe('My {Title}.md');
    });
  });

  describe('default title cap (sanity safety net)', () => {
    test('caps {title} at 100 chars by default — no user filter needed', () => {
      const longTitle = 'a'.repeat(500);
      const ctx = { ...SAMPLE_CONTEXT, title: longTitle };
      const result = formatFilename('{title}', 'preserve', ctx);
      // 100 a's + .md = 103 chars
      expect(result.length).toBe(103);
      expect(result).toBe('a'.repeat(100) + '.md');
    });

    test('default cap walks back to a word boundary when present', () => {
      // 12-char chunks separated by spaces — should walk back to a space boundary
      const longTitle = 'aaaaaaaaaaaa '.repeat(20).trim();
      const ctx = { ...SAMPLE_CONTEXT, title: longTitle };
      const result = formatFilename('{title}', 'preserve', ctx);
      expect(result.length).toBeLessThanOrEqual(103);
      // Should end on a full chunk, not mid-chunk
      expect(result).toMatch(/aaaaaaaaaaaa\.md$/);
    });

    test('explicit |max:N filter wins over default cap', () => {
      const longTitle = 'a'.repeat(500);
      const ctx = { ...SAMPLE_CONTEXT, title: longTitle };
      const result = formatFilename('{title|max:30}', 'preserve', ctx);
      expect(result).toBe('a'.repeat(30) + '.md');
    });

    test('explicit |max:N can widen beyond the default cap', () => {
      const longTitle = 'a'.repeat(500);
      const ctx = { ...SAMPLE_CONTEXT, title: longTitle };
      const result = formatFilename('{title|max:160}', 'preserve', ctx);
      // 160 a's + .md = 163; ≤ MAX_FILENAME_LENGTH
      expect(result).toBe('a'.repeat(160) + '.md');
    });

    test('default cap leaves room for date suffix', () => {
      // The whole problem this is solving: the X-style 280-char title used to
      // crowd the date out. With the default cap, the suffix survives intact.
      const longTitle = 'X Post by @author '.repeat(20); // ~360 chars
      const ctx = { ...SAMPLE_CONTEXT, title: longTitle };
      const result = formatFilename('{title} - {date}', 'preserve', ctx);
      expect(result).toMatch(/ - 2026-04-25\.md$/);
    });
  });

  describe('pipe-filter syntax', () => {
    test('|max:N truncates the value at a word boundary when one exists in the last 30%', () => {
      const ctx = { ...SAMPLE_CONTEXT, title: 'A very long article title here' };
      // max=12 → substring(0,12)="A very long ", boundary at index 11 (space) → "A very long"
      expect(formatFilename('{title|max:12}', 'preserve', ctx)).toBe('A very long.md');
    });

    test('|max:N falls back to hard cut when no word boundary fits', () => {
      const ctx = { ...SAMPLE_CONTEXT, title: 'Antidisestablishmentarianism' };
      // No spaces in last 30% — hard truncate at 10 chars
      expect(formatFilename('{title|max:10}', 'preserve', ctx)).toBe('Antidisest.md');
    });

    test('|max:N with a value shorter than N is unchanged', () => {
      const ctx = { ...SAMPLE_CONTEXT, title: 'Short' };
      expect(formatFilename('{title|max:50}', 'preserve', ctx)).toBe('Short.md');
    });

    test('|default:VALUE supplies a fallback when token is empty', () => {
      const ctx = { ...SAMPLE_CONTEXT, title: '', url: '' };
      expect(formatFilename('{slug|default:untitled}', 'preserve', ctx))
        .toBe('untitled.md');
    });

    test('|default does NOT override a non-empty value', () => {
      const ctx = { ...SAMPLE_CONTEXT, title: 'Real Title' };
      expect(formatFilename('{title|default:fallback}', 'preserve', ctx))
        .toBe('Real Title.md');
    });

    test('chained filters apply left-to-right', () => {
      const ctx = { ...SAMPLE_CONTEXT, title: '' };
      // Default fills in "Some Long Fallback Value", then max truncates it
      expect(formatFilename('{title|default:Some Long Fallback Value|max:10}', 'preserve', ctx))
        .toBe('Some Long.md');
    });

    test('unknown filter is a no-op (typo-safe)', () => {
      const ctx = { ...SAMPLE_CONTEXT, title: 'Title' };
      expect(formatFilename('{title|nosuchfilter:foo}', 'preserve', ctx))
        .toBe('Title.md');
    });

    test('filters work on non-title tokens too', () => {
      const ctx = { ...SAMPLE_CONTEXT, url: 'https://example.com/very/deep/nested/path/here' };
      // The max filter runs on the raw path; later, preserve-style sanitization
      // replaces / with - because slashes are FS-illegal in filenames.
      expect(formatFilename('{path|max:15}', 'preserve', ctx))
        .toBe('very-deep-neste.md');
    });
  });

  describe('legacy {date:fmt} colon shortcut still works', () => {
    test('{date:YYYY-MM-DD} produces the expected date string', () => {
      const ctx = { ...SAMPLE_CONTEXT, date: new Date(2026, 0, 5) };
      expect(formatFilename('{date:YYYY-MM-DD}', 'preserve', ctx))
        .toBe('2026-01-05.md');
    });

    test('legacy date format combined with pipe filter', () => {
      const ctx = { ...SAMPLE_CONTEXT, date: new Date(2026, 0, 5) };
      // {date:YYYY} returns "2026", then |max:2 truncates to "20"
      expect(formatFilename('{date:YYYY|max:2}', 'preserve', ctx))
        .toBe('20.md');
    });
  });
});
