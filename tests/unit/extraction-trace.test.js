const ExtractionTrace = require('../../src/utils/extraction-trace');

describe('ExtractionTrace', () => {
  describe('disabled tracer', () => {
    test('null target leaves enabled() false and methods are no-ops', () => {
      const t = new ExtractionTrace(null);
      expect(t.enabled()).toBe(false);
      // None of these should throw or mutate anything visible
      t.setPath('turndown-dom', 'reason');
      t.setSiteContext({ id: 'x', name: 'X' }, 'tweet');
      t.setContentDiscovery('content-selector', 'article', []);
      t.setElementCount(42);
      t.recordKept();
      t.recordRejected('removeNonContent', 'tag', null);
      t.setOutput('turndown', 'md', { url: 'u' });
      // No target — nothing observable to assert beyond no-throw
      expect(t.target).toBe(null);
    });

    test('undefined target also yields a no-op tracer', () => {
      const t = new ExtractionTrace();
      expect(t.enabled()).toBe(false);
    });

    test('ExtractionTrace.from(null) returns a disabled tracer', () => {
      const t = ExtractionTrace.from(null);
      expect(t.enabled()).toBe(false);
    });
  });

  describe('enabled tracer initialization', () => {
    test('initializes the schema fields on a fresh target', () => {
      const target = {};
      const t = new ExtractionTrace(target);
      expect(t.enabled()).toBe(true);
      expect(target.schemaVersion).toBe('0.1');
      expect(typeof target.capturedAt).toBe('string');
      expect(target.capturedAt).toMatch(/\d{4}-\d{2}-\d{2}T/);
      expect(target.path).toBe(null);
      expect(target.pathReason).toBe(null);
      expect(target.site).toBe(null);
      expect(target.contentType).toBe(null);
      expect(target.contentDiscovery).toBe(null);
      expect(target.filterDecisions).toEqual({ keptCount: 0, rejected: [] });
      expect(target.output).toBe(null);
      expect(target.truncated).toBe(false);
      expect(target.elementCount).toBe(0);
    });

    test('does not re-initialise an already-initialised target', () => {
      const target = {};
      new ExtractionTrace(target);
      target.path = 'site-action';
      target.contentDiscovery = { tier: 'content-selector', winningSelector: 'article', tried: [] };
      // Wrap again — simulates the extractSiteContent fallback chain where
      // convertPageToMarkdown opens its own tracer over the same target.
      new ExtractionTrace(target);
      expect(target.path).toBe('site-action');
      expect(target.contentDiscovery.tier).toBe('content-selector');
    });

    test('resumes fdCounter when re-wrapping a populated target', () => {
      const target = {};
      const t1 = new ExtractionTrace(target);
      const node = makeNode('div', { id: 'x' });
      t1.recordRejected('rule', 'reason', node);
      expect(target.filterDecisions.rejected[0].id).toBe('fd-0');

      const t2 = new ExtractionTrace(target);
      t2.recordRejected('rule', 'reason', node);
      expect(target.filterDecisions.rejected[1].id).toBe('fd-1');
    });

    test('ExtractionTrace.from passes through an existing instance', () => {
      const target = {};
      const t1 = new ExtractionTrace(target);
      const t2 = ExtractionTrace.from(t1);
      expect(t2).toBe(t1);
    });

    test('ExtractionTrace.from wraps a plain object target', () => {
      const target = {};
      const t = ExtractionTrace.from(target);
      expect(t.target).toBe(target);
      expect(target.schemaVersion).toBe('0.1');
    });
  });

  describe('setPath', () => {
    test('records the chosen path and reason', () => {
      const target = {};
      const t = new ExtractionTrace(target);
      t.setPath('turndown-dom', 'returned 8192 chars');
      expect(target.path).toBe('turndown-dom');
      expect(target.pathReason).toBe('returned 8192 chars');
    });

    test('coerces missing reason to empty string', () => {
      const target = {};
      const t = new ExtractionTrace(target);
      t.setPath('site-action');
      expect(target.pathReason).toBe('');
    });
  });

  describe('setContentDiscovery', () => {
    test('stores the tier, winningSelector, and a copy of tried', () => {
      const target = {};
      const t = new ExtractionTrace(target);
      const tried = [{ selector: 'article', result: 'matched-significant' }];
      t.setContentDiscovery('content-selector', 'article', tried);
      expect(target.contentDiscovery).toEqual({
        tier: 'content-selector',
        winningSelector: 'article',
        tried: [{ selector: 'article', result: 'matched-significant' }]
      });
      // Caller mutation should not affect the stored snapshot
      tried.push({ selector: 'main', result: 'skipped-not-yet-tried' });
      expect(target.contentDiscovery.tried).toHaveLength(1);
    });

    test('null winningSelector survives for fallback tiers', () => {
      const target = {};
      const t = new ExtractionTrace(target);
      t.setContentDiscovery('largest-text-block', null, []);
      expect(target.contentDiscovery.winningSelector).toBe(null);
    });
  });

  describe('recordKept', () => {
    test('increments keptCount each call', () => {
      const target = {};
      const t = new ExtractionTrace(target);
      t.recordKept();
      t.recordKept();
      t.recordKept();
      expect(target.filterDecisions.keptCount).toBe(3);
    });
  });

  describe('recordRejected', () => {
    test('captures tag, id, classes, testids, nodePath, preview', () => {
      const target = {};
      const t = new ExtractionTrace(target);
      const root = makeNode('html');
      const body = makeNode('body', {}, root);
      const main = makeNode('main', {}, body);
      const aside = makeNode('aside', {
        id: 'related',
        classList: ['related-stories', 'sidebar'],
        attributes: [{ name: 'data-testid', value: 'related-block' }],
        textContent: 'Related stories from The Verge that you might also like to read about today'
      }, main);

      t.recordRejected('removeNonContent', 'tag in nonContentTags set: aside', aside);
      const entry = target.filterDecisions.rejected[0];
      expect(entry.id).toBe('fd-0');
      expect(entry.rule).toBe('removeNonContent');
      expect(entry.reason).toBe('tag in nonContentTags set: aside');
      expect(entry.tag).toBe('aside');
      expect(entry.id_attr).toBe('related');
      expect(entry.classes).toEqual(['related-stories', 'sidebar']);
      expect(entry.testids).toEqual(['related-block']);
      expect(entry.nodePath).toBe('html>body>main>aside#related');
      expect(entry.preview.startsWith('Related stories from The Verge')).toBe(true);
    });

    test('preview truncates over 80 chars with ellipsis', () => {
      const target = {};
      const t = new ExtractionTrace(target);
      const long = 'x'.repeat(200);
      const node = makeNode('div', { textContent: long });
      t.recordRejected('removeNonContent', '', node);
      const entry = target.filterDecisions.rejected[0];
      expect(entry.preview.length).toBe(83); // 80 + '...'
      expect(entry.preview.endsWith('...')).toBe(true);
    });

    test('uses first class when no id is present', () => {
      const target = {};
      const t = new ExtractionTrace(target);
      const html = makeNode('html');
      const body = makeNode('body', {}, html);
      const div = makeNode('div', { classList: ['main-nav', 'top'] }, body);
      t.recordRejected('removeNonContent', '', div);
      expect(target.filterDecisions.rejected[0].nodePath).toBe('html>body>div.main-nav');
    });

    test('emits monotonic ids fd-0, fd-1, fd-2', () => {
      const target = {};
      const t = new ExtractionTrace(target);
      const node = makeNode('div');
      t.recordRejected('r', 'a', node);
      t.recordRejected('r', 'b', node);
      t.recordRejected('r', 'c', node);
      expect(target.filterDecisions.rejected.map(r => r.id)).toEqual(['fd-0', 'fd-1', 'fd-2']);
    });

    test('caps at 500 entries and flips truncated flag', () => {
      const target = {};
      const t = new ExtractionTrace(target);
      const node = makeNode('div', { textContent: 'x' });
      for (let i = 0; i < 600; i++) {
        t.recordRejected('removeNonContent', '', node);
      }
      expect(target.filterDecisions.rejected.length).toBe(500);
      expect(target.truncated).toBe(true);
    });

    test('collects every data-test* attribute as a testid', () => {
      const target = {};
      const t = new ExtractionTrace(target);
      const node = makeNode('div', {
        attributes: [
          { name: 'data-testid', value: 'main' },
          { name: 'data-test-id', value: 'legacy' },
          { name: 'data-test', value: 'cy-anchor' },
          { name: 'data-foo', value: 'ignored' }
        ]
      });
      t.recordRejected('rule', '', node);
      expect(target.filterDecisions.rejected[0].testids).toEqual(['main', 'legacy', 'cy-anchor']);
    });
  });

  describe('setSiteContext', () => {
    test('stores site and contentType', () => {
      const target = {};
      const t = new ExtractionTrace(target);
      t.setSiteContext({ id: 'x', name: 'X' }, 'single-tweet');
      expect(target.site).toEqual({ id: 'x', name: 'X' });
      expect(target.contentType).toBe('single-tweet');
    });

    test('coerces missing values to null', () => {
      const target = {};
      const t = new ExtractionTrace(target);
      t.setSiteContext(null, null);
      expect(target.site).toBe(null);
      expect(target.contentType).toBe(null);
    });
  });

  describe('setOutput', () => {
    test('records method, byteLength, markdown, metadata', () => {
      const target = {};
      const t = new ExtractionTrace(target);
      t.setOutput('turndown-dom', '# Hello', { url: 'https://example.com' });
      expect(target.output).toEqual({
        method: 'turndown-dom',
        byteLength: 7,
        markdown: '# Hello',
        metadata: { url: 'https://example.com' }
      });
    });

    test('handles non-string markdown by recording empty body and zero length', () => {
      const target = {};
      const t = new ExtractionTrace(target);
      t.setOutput('emergency-fallback', null, null);
      expect(target.output).toEqual({
        method: 'emergency-fallback',
        byteLength: 0,
        markdown: '',
        metadata: null
      });
    });
  });

  describe('setElementCount', () => {
    test('writes elementCount on the target', () => {
      const target = {};
      const t = new ExtractionTrace(target);
      t.setElementCount(2847);
      expect(target.elementCount).toBe(2847);
    });
  });
});

/**
 * Build a synthetic Element-like object that's enough for ExtractionTrace's
 * accessors. Avoids spinning up jsdom for unit-level focus on the wrapper.
 * Children registered via the parent argument get their parentNode wired so
 * nodePath construction can walk up.
 */
function makeNode(tagName, opts = {}, parent = null) {
  const node = {
    nodeType: 1,
    tagName: tagName.toUpperCase(),
    id: opts.id || '',
    className: opts.className || (opts.classList || []).join(' '),
    classList: opts.classList || [],
    textContent: opts.textContent || '',
    attributes: opts.attributes || [],
    parentNode: parent
  };
  return node;
}
