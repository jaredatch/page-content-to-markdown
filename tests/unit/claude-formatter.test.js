'use strict';

const ClaudeFormatter = require('../../src/sites/claude/claude-formatter');

// ── Test data factories ──

function makeConversation(overrides = {}) {
  return {
    title: 'Test Chat',
    sharedBy: 'Test User',
    url: 'https://claude.ai/share/abc',
    turns: [
      { role: 'human', content: 'Hello Claude' },
      { role: 'assistant', contentHtml: '<p>Hello there, how can I help?</p>' }
    ],
    ...overrides
  };
}

function makeMockConverter() {
  return {
    convertHtmlFragment: (html) => {
      // Simple mock: strip tags and return text with a marker
      return html.replace(/<[^>]+>/g, '').trim();
    }
  };
}

// ── Tests ──

describe('ClaudeFormatter', () => {
  let formatter;

  beforeEach(() => {
    formatter = new ClaudeFormatter();
  });

  describe('format() dispatch method', () => {
    test('dispatches conversation to formatConversation', () => {
      const md = formatter.format('conversation', makeConversation(), makeMockConverter());
      expect(md).toContain('# Test Chat');
      expect(md).toContain('Hello Claude');
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

    test('includes shared-by attribution', () => {
      const md = formatter.formatConversation(makeConversation(), makeMockConverter());
      expect(md).toContain('*Shared by Test User via Claude*');
    });

    test('labels human turns with bold "Human:" prefix', () => {
      const md = formatter.formatConversation(makeConversation(), makeMockConverter());
      expect(md).toContain('**Human:**');
    });

    test('labels assistant turns with bold "Claude:" prefix', () => {
      const md = formatter.formatConversation(makeConversation(), makeMockConverter());
      expect(md).toContain('**Claude:**');
    });

    test('separates turns with horizontal rules', () => {
      const md = formatter.formatConversation(makeConversation(), makeMockConverter());
      const hrCount = (md.match(/^---$/gm) || []).length;
      expect(hrCount).toBeGreaterThanOrEqual(2);
    });

    test('includes human text content', () => {
      const md = formatter.formatConversation(makeConversation(), makeMockConverter());
      expect(md).toContain('Hello Claude');
    });

    test('converts Claude HTML content via converter', () => {
      const md = formatter.formatConversation(makeConversation(), makeMockConverter());
      expect(md).toContain('Hello there, how can I help?');
    });

    test('falls back to tag stripping when no converter provided', () => {
      const conversation = makeConversation({
        turns: [
          { role: 'assistant', contentHtml: '<p>Some <strong>bold</strong> text</p>' }
        ]
      });
      const md = formatter.formatConversation(conversation);
      expect(md).toContain('Some bold text');
    });

    test('handles empty title gracefully', () => {
      const md = formatter.formatConversation(
        makeConversation({ title: '' }),
        makeMockConverter()
      );
      expect(md).not.toMatch(/^# \n/m);
      expect(md).toContain('Hello Claude');
    });

    test('handles empty sharedBy gracefully', () => {
      const md = formatter.formatConversation(
        makeConversation({ sharedBy: '' }),
        makeMockConverter()
      );
      expect(md).not.toContain('Shared by');
      expect(md).toContain('# Test Chat');
    });

    test('formats a multi-turn conversation in order', () => {
      const conversation = makeConversation({
        turns: [
          { role: 'human', content: 'Question 1' },
          { role: 'assistant', contentHtml: '<p>Answer 1</p>' },
          { role: 'human', content: 'Question 2' },
          { role: 'assistant', contentHtml: '<p>Answer 2</p>' }
        ]
      });
      const md = formatter.formatConversation(conversation, makeMockConverter());

      const q1Index = md.indexOf('Question 1');
      const a1Index = md.indexOf('Answer 1');
      const q2Index = md.indexOf('Question 2');
      const a2Index = md.indexOf('Answer 2');

      expect(q1Index).toBeGreaterThan(-1);
      expect(a1Index).toBeGreaterThan(q1Index);
      expect(q2Index).toBeGreaterThan(a1Index);
      expect(a2Index).toBeGreaterThan(q2Index);
    });

    test('collapses excessive blank lines', () => {
      const md = formatter.formatConversation(makeConversation(), makeMockConverter());
      expect(md).not.toMatch(/\n{3,}/);
    });

    test('handles empty turns array', () => {
      const md = formatter.formatConversation(
        makeConversation({ turns: [] }),
        makeMockConverter()
      );
      expect(md).toContain('# Test Chat');
    });

    test('handles assistant turn with empty contentHtml', () => {
      const conversation = makeConversation({
        turns: [
          { role: 'human', content: 'Hi' },
          { role: 'assistant', contentHtml: '' }
        ]
      });
      const md = formatter.formatConversation(conversation, makeMockConverter());
      expect(md).toContain('**Claude:**');
      expect(md).toContain('Hi');
    });
  });

  describe('filenameTitle', () => {
    test('uses "Claude — {title}" when conversation has a title', () => {
      const data = { title: 'Debugging a tricky regex', sharedBy: '', turns: [] };
      expect(formatter.filenameTitle('conversation', data)).toBe('Claude — Debugging a tricky regex');
    });

    test('falls back to "Claude Conversation" when no title', () => {
      const data = { title: '', sharedBy: '', turns: [] };
      expect(formatter.filenameTitle('conversation', data)).toBe('Claude Conversation');
    });

    test('returns null for unknown content type', () => {
      expect(formatter.filenameTitle('unknown', { title: 'X' })).toBeNull();
    });
  });
});
