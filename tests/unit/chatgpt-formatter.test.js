'use strict';

const ChatGPTFormatter = require('../../src/sites/chatgpt/chatgpt-formatter');

// ── Test data factories ──

function makeConversation(overrides = {}) {
  return {
    title: 'Test Chat',
    url: 'https://chatgpt.com/share/abc',
    turns: [
      { role: 'human', content: 'Hello ChatGPT', attachments: 0 },
      { role: 'assistant', contentHtml: '<p>Hello there.</p>' }
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

describe('ChatGPTFormatter', () => {
  let formatter;

  beforeEach(() => {
    formatter = new ChatGPTFormatter();
  });

  describe('format() dispatch method', () => {
    test('dispatches conversation to formatConversation', () => {
      const md = formatter.format('conversation', makeConversation(), makeMockConverter());
      expect(md).toContain('# Test Chat');
      expect(md).toContain('Hello ChatGPT');
    });

    test('returns empty string for unknown content type', () => {
      expect(formatter.format('unknown', makeConversation())).toBe('');
    });
  });

  describe('filenameTitle', () => {
    test('returns "ChatGPT — {title}" when a title is present', () => {
      expect(formatter.filenameTitle('conversation', { title: 'Render Pipeline' }))
        .toBe('ChatGPT — Render Pipeline');
    });

    test('falls back to "ChatGPT Conversation" when title is empty', () => {
      expect(formatter.filenameTitle('conversation', { title: '' })).toBe('ChatGPT Conversation');
      expect(formatter.filenameTitle('conversation', { title: '   ' })).toBe('ChatGPT Conversation');
    });

    test('returns null for unknown content types or missing data', () => {
      expect(formatter.filenameTitle('unknown', { title: 'x' })).toBeNull();
      expect(formatter.filenameTitle('conversation', null)).toBeNull();
    });
  });

  describe('formatConversation', () => {
    test('includes title as h1 heading', () => {
      const md = formatter.formatConversation(makeConversation(), makeMockConverter());
      expect(md).toContain('# Test Chat');
    });

    test('includes "Shared via ChatGPT" attribution', () => {
      const md = formatter.formatConversation(makeConversation(), makeMockConverter());
      expect(md).toContain('*Shared via ChatGPT*');
    });

    test('labels human turns with bold "Human:" prefix', () => {
      const md = formatter.formatConversation(makeConversation(), makeMockConverter());
      expect(md).toContain('**Human:**');
    });

    test('labels assistant turns with bold "ChatGPT:" prefix', () => {
      const md = formatter.formatConversation(makeConversation(), makeMockConverter());
      expect(md).toContain('**ChatGPT:**');
    });

    test('renders attachment chip for human turns with attachments > 0', () => {
      const md = formatter.formatConversation(makeConversation({
        turns: [{ role: 'human', content: 'Look at this.', attachments: 1 }]
      }), makeMockConverter());
      expect(md).toContain('*[1 attachment uploaded]*');
    });

    test('pluralizes attachment chip when count > 1', () => {
      const md = formatter.formatConversation(makeConversation({
        turns: [{ role: 'human', content: 'Look at these.', attachments: 3 }]
      }), makeMockConverter());
      expect(md).toContain('*[3 attachments uploaded]*');
    });

    test('omits attachment chip when count is 0', () => {
      const md = formatter.formatConversation(makeConversation(), makeMockConverter());
      expect(md).not.toMatch(/attachment/i);
    });

    test('renders thinking label when present', () => {
      const md = formatter.formatConversation(makeConversation({
        turns: [
          { role: 'human', content: 'Think hard.', attachments: 0 },
          { role: 'assistant', thinking: 'Thought for 1m 38s', contentHtml: null, generatedImages: [] }
        ]
      }), makeMockConverter());
      expect(md).toContain('*[Thought for 1m 38s]*');
    });

    test('falls back to generic placeholder when assistant turn has no thinking, no body, no images', () => {
      const md = formatter.formatConversation(makeConversation({
        turns: [
          { role: 'human', content: 'Think hard.', attachments: 0 },
          { role: 'assistant', thinking: null, contentHtml: null, generatedImages: [] }
        ]
      }), makeMockConverter());
      expect(md).toContain('Response not included');
    });

    test('renders generated images as markdown image lines', () => {
      const md = formatter.formatConversation(makeConversation({
        turns: [
          { role: 'assistant', thinking: null, contentHtml: null, generatedImages: [
            { src: 'https://oai.example/a.png', alt: 'Generated image: mockup' },
            { src: 'https://oai.example/b.png', alt: 'Generated image: dashboard' }
          ] }
        ]
      }), makeMockConverter());
      expect(md).toContain('![Generated image: mockup](https://oai.example/a.png)');
      expect(md).toContain('![Generated image: dashboard](https://oai.example/b.png)');
    });

    test('renders thinking + body + generated images together', () => {
      const md = formatter.formatConversation(makeConversation({
        turns: [
          { role: 'assistant',
            thinking: 'Thought for 30s',
            contentHtml: '<p>Here is the design.</p>',
            generatedImages: [{ src: 'https://oai.example/x.png', alt: 'Generated image' }] }
        ]
      }), makeMockConverter());
      expect(md).toContain('*[Thought for 30s]*');
      expect(md).toContain('Here is the design.');
      expect(md).toContain('![Generated image](https://oai.example/x.png)');
      // Order check: thinking before body before image
      expect(md.indexOf('Thought for 30s')).toBeLessThan(md.indexOf('Here is the design.'));
      expect(md.indexOf('Here is the design.')).toBeLessThan(md.indexOf('Generated image'));
    });

    test('uses converter.convertHtmlFragment for assistant content when provided', () => {
      const md = formatter.formatConversation(makeConversation({
        turns: [{ role: 'assistant', contentHtml: '<p>Converted body.</p>' }]
      }), makeMockConverter());
      expect(md).toContain('Converted body.');
      expect(md).not.toContain('<p>');
    });

    test('falls back to text-only stripping when no converter is provided', () => {
      const md = formatter.formatConversation(makeConversation({
        turns: [{ role: 'assistant', contentHtml: '<p>Plain  fallback.</p>' }]
      }));
      expect(md).toContain('Plain fallback.');
    });

    test('separates turns with horizontal rules', () => {
      const md = formatter.formatConversation(makeConversation(), makeMockConverter());
      const ruleCount = (md.match(/^---$/gm) || []).length;
      expect(ruleCount).toBeGreaterThanOrEqual(3);
    });

    test('omits the title heading when title is empty', () => {
      const md = formatter.formatConversation(makeConversation({ title: '' }), makeMockConverter());
      expect(md).not.toMatch(/^# /m);
      expect(md).toContain('*Shared via ChatGPT*');
    });

    test('tightens nested unordered lists by dropping the blank line before an indented sublist', () => {
      const md = formatter.formatConversation(makeConversation({
        turns: [{ role: 'assistant', contentHtml: '<ul><li>Parent<ul><li>Child</li></ul></li></ul>' }]
      }), { convertHtmlFragment: () => '- Parent\n\n  - Child' });
      expect(md).toContain('- Parent\n  - Child');
      expect(md).not.toContain('- Parent\n\n  - Child');
    });

    test('tightens nested ordered-into-unordered lists', () => {
      const md = formatter.formatConversation(makeConversation({
        turns: [{ role: 'assistant', contentHtml: '<ol><li>Parent<ul><li>Child</li></ul></li></ol>' }]
      }), { convertHtmlFragment: () => '1. Parent\n\n   - Child' });
      expect(md).toContain('1. Parent\n   - Child');
    });

    test('preserves spacing emitted by the converter without forcing blank lines into closing fences', () => {
      // Regression: an earlier post-process regex inserted a blank line
      // before every triple-backtick, which also matched closing fences and
      // produced `code\n\n```` (extra blank inside the block). Turndown
      // already handles fence boundaries correctly, so the formatter must
      // not muck with them.
      const md = formatter.formatConversation(makeConversation({
        turns: [{ role: 'assistant', contentHtml: '<p>Run this:</p>\n<pre><code>code</code></pre>' }]
      }), { convertHtmlFragment: () => 'Run this:\n\n```\ncode\n```' });
      expect(md).not.toMatch(/code\n\n```/);
      expect(md).toMatch(/code\n```/);
    });
  });
});
