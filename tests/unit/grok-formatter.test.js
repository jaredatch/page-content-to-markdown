'use strict';

const GrokFormatter = require('../../src/sites/grok/grok-formatter');

// ── Test data factories ──

function makeConversation(overrides = {}) {
  return {
    title: 'Test Chat',
    url: 'https://grok.com/share/abc',
    turns: [
      { role: 'human', content: 'Hello Grok' },
      { role: 'assistant', contentHtml: '<p>Hello there.</p>', thinking: 'Thought for 5s' }
    ],
    ...overrides
  };
}

function makeMockConverter() {
  return {
    convertHtmlFragment: (html) => html.replace(/<[^>]+>/g, '').trim()
  };
}

// ── Tests ──

describe('GrokFormatter', () => {
  let formatter;

  beforeEach(() => {
    formatter = new GrokFormatter();
  });

  describe('format() dispatch method', () => {
    test('dispatches conversation to formatConversation', () => {
      const md = formatter.format('conversation', makeConversation(), makeMockConverter());
      expect(md).toContain('# Test Chat');
      expect(md).toContain('Hello Grok');
    });

    test('returns empty string for unknown content type', () => {
      expect(formatter.format('unknown', makeConversation())).toBe('');
    });
  });

  describe('formatConversation', () => {
    test('includes title as h1 heading', () => {
      const md = formatter.formatConversation(makeConversation(), makeMockConverter());
      expect(md).toContain('# Test Chat');
    });

    test('includes "Shared via Grok" attribution', () => {
      const md = formatter.formatConversation(makeConversation(), makeMockConverter());
      expect(md).toContain('*Shared via Grok*');
    });

    test('labels human turns with bold "Human:" prefix', () => {
      const md = formatter.formatConversation(makeConversation(), makeMockConverter());
      expect(md).toContain('**Human:**');
    });

    test('labels assistant turns with bold "Grok:" prefix', () => {
      const md = formatter.formatConversation(makeConversation(), makeMockConverter());
      expect(md).toContain('**Grok:**');
    });

    test('includes italic thinking label for assistant turns when present', () => {
      const md = formatter.formatConversation(makeConversation(), makeMockConverter());
      expect(md).toContain('*Thought for 5s*');
    });

    test('omits thinking label when turn has no thinking field', () => {
      const conv = makeConversation({
        turns: [
          { role: 'human', content: 'Hi' },
          { role: 'assistant', contentHtml: '<p>Reply</p>', thinking: null }
        ]
      });
      const md = formatter.formatConversation(conv, makeMockConverter());
      expect(md).not.toMatch(/\*Thought for/);
    });

    test('separates turns with horizontal rules', () => {
      const md = formatter.formatConversation(makeConversation(), makeMockConverter());
      const hrCount = (md.match(/^---$/gm) || []).length;
      expect(hrCount).toBeGreaterThanOrEqual(2);
    });

    test('uses converter for assistant HTML when provided', () => {
      const md = formatter.formatConversation(makeConversation(), makeMockConverter());
      expect(md).toContain('Hello there.');
    });

    test('falls back to tag-strip when no converter is provided', () => {
      const md = formatter.formatConversation(makeConversation());
      expect(md).toContain('Hello there.');
      expect(md).not.toContain('<p>');
    });

    test('renders human content', () => {
      const md = formatter.formatConversation(makeConversation(), makeMockConverter());
      expect(md).toContain('Hello Grok');
    });

    test('omits title heading when title is empty', () => {
      const md = formatter.formatConversation(
        makeConversation({ title: '' }),
        makeMockConverter()
      );
      expect(md).not.toMatch(/^#\s/m);
    });

    test('collapses excess blank lines', () => {
      const md = formatter.formatConversation(makeConversation(), makeMockConverter());
      expect(md).not.toMatch(/\n{3,}/);
    });

    test('inserts a blank line before fenced code blocks that sit flush against prose', () => {
      const converter = {
        // Simulate Turndown dropping a blank line between prose and fence.
        convertHtmlFragment: () => 'Some prose about a config snippet:\n```json\n{ "a": 1 }\n```'
      };
      const conv = makeConversation({
        turns: [
          { role: 'assistant', contentHtml: '<p>irrelevant</p>', thinking: null }
        ]
      });
      const md = formatter.formatConversation(conv, converter);
      expect(md).toMatch(/config snippet:\n\n```json/);
    });
  });
});
