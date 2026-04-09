'use strict';

const ClaudeExtractor = require('../../src/sites/claude/claude-extractor');

// ── HTML Fixtures ──

/**
 * Minimal Claude share page fixture mimicking the real DOM structure:
 * - page-header with title + "Shared by X"
 * - conversation container with disclaimer banner + human/claude turns
 */
const SHARE_PAGE_HTML = `
<div>
  <header data-testid="page-header">
    <div>
      <div>
        <div>Test Conversation Title</div>
      </div>
    </div>
    <div>
      <div>Shared by Test User</div>
    </div>
  </header>
  <div class="flex-1 flex flex-col px-4 max-w-3xl">
    <div class="border-0.5 border-border-400">
      This is a copy of a chat between Claude and Test User.
    </div>
    <div>
      <div class="mb-1 mt-6 group">
        <div class="flex flex-col items-end gap-1">
          <div class="group relative inline-flex gap-2 bg-bg-300">
            <div class="flex flex-row gap-2 relative">
              <div class="flex-1">
                <div data-testid="user-message">
                  <p class="whitespace-pre-wrap break-words">First human question here.</p>
                  <p class="whitespace-pre-wrap break-words">Second paragraph of the question.</p>
                </div>
              </div>
            </div>
          </div>
          <div class="flex justify-start">
            <div class="text-text-300">
              <button data-testid="action-bar-copy">Copy</button>
            </div>
          </div>
        </div>
      </div>
    </div>
    <div>
      <div class="group">
        <div class="contents">
          <div class="group relative pb-3">
            <div class="font-claude-response">
              <div>
                <div class="standard-markdown">
                  <p class="font-claude-response-body">Claude's first response paragraph.</p>
                  <p class="font-claude-response-body">Another paragraph with <strong>bold text</strong>.</p>
                </div>
              </div>
            </div>
          </div>
        </div>
        <div class="flex justify-start">
          <div class="text-text-300">
            <button data-testid="action-bar-copy">Copy</button>
          </div>
        </div>
      </div>
    </div>
    <div>
      <div class="mb-1 mt-6 group">
        <div class="flex flex-col items-end gap-1">
          <div class="group relative inline-flex gap-2 bg-bg-300">
            <div class="flex flex-row gap-2 relative">
              <div class="flex-1">
                <div data-testid="user-message">
                  <p class="whitespace-pre-wrap break-words">A follow-up question.</p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
    <div>
      <div class="group">
        <div class="contents">
          <div class="group relative pb-3">
            <div class="font-claude-response">
              <div class="mt-4">
                <div class="grid grid-rows-[auto_auto] min-w-0">
                  <div class="row-start-1 col-start-1 min-w-0">
                    <div class="min-w-0 pl-2 py-1.5">
                      <button>Searched the web</button>
                      <span class="sr-only" role="status">Searched the web</span>
                    </div>
                  </div>
                  <div class="row-start-2 col-start-1 relative grid isolate min-w-0">
                    <div class="standard-markdown">
                      <p class="font-claude-response-body">The response after search.</p>
                      <p class="font-claude-response-body">With a citation <span class="inline-flex"><a href="https://example.com">Example Source</a></span> inline.</p>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</div>
`;

const EMPTY_PAGE_HTML = `<div><p>No conversation here</p></div>`;

const MINIMAL_CONVERSATION_HTML = `
<div class="flex-1 flex flex-col px-4 max-w-3xl">
  <div class="border-0.5">Disclaimer</div>
  <div>
    <div data-testid="user-message">
      <p>Just a question.</p>
    </div>
  </div>
</div>
`;

// ── Helper ──

function createDoc(html) {
  document.body.innerHTML = html;
  return document;
}

// ── Tests ──

describe('ClaudeExtractor', () => {
  let extractor;

  beforeEach(() => {
    extractor = new ClaudeExtractor();
    document.body.innerHTML = '';
  });

  describe('extract() dispatch method', () => {
    test('dispatches conversation to extractConversation', () => {
      const doc = createDoc(SHARE_PAGE_HTML);
      const result = extractor.extract('conversation', doc, 'https://claude.ai/share/abc');
      expect(result).not.toBeNull();
      expect(result.turns.length).toBeGreaterThan(0);
    });

    test('returns null for unknown content type', () => {
      const doc = createDoc(SHARE_PAGE_HTML);
      expect(extractor.extract('unknown-type', doc)).toBeNull();
    });
  });

  describe('extractConversation', () => {
    test('extracts full conversation with title, shared-by, and turns', () => {
      const doc = createDoc(SHARE_PAGE_HTML);
      const result = extractor.extractConversation(doc, 'https://claude.ai/share/abc');

      expect(result).not.toBeNull();
      expect(result.title).toBe('Test Conversation Title');
      expect(result.sharedBy).toBe('Test User');
      expect(result.url).toBe('https://claude.ai/share/abc');
      expect(result.turns.length).toBe(4);
    });

    test('alternates human and assistant turns', () => {
      const doc = createDoc(SHARE_PAGE_HTML);
      const result = extractor.extractConversation(doc);

      expect(result.turns[0].role).toBe('human');
      expect(result.turns[1].role).toBe('assistant');
      expect(result.turns[2].role).toBe('human');
      expect(result.turns[3].role).toBe('assistant');
    });

    test('human turns contain text content from paragraphs', () => {
      const doc = createDoc(SHARE_PAGE_HTML);
      const result = extractor.extractConversation(doc);

      expect(result.turns[0].content).toContain('First human question here.');
      expect(result.turns[0].content).toContain('Second paragraph of the question.');
      expect(result.turns[2].content).toContain('A follow-up question.');
    });

    test('assistant turns contain HTML from standard-markdown sections', () => {
      const doc = createDoc(SHARE_PAGE_HTML);
      const result = extractor.extractConversation(doc);

      expect(result.turns[1].contentHtml).toContain("Claude's first response paragraph");
      expect(result.turns[1].contentHtml).toContain('<strong>bold text</strong>');
    });

    test('skips the disclaimer banner', () => {
      const doc = createDoc(SHARE_PAGE_HTML);
      const result = extractor.extractConversation(doc);

      // No turn should contain the disclaimer text
      for (const turn of result.turns) {
        const content = turn.content || turn.contentHtml || '';
        expect(content).not.toContain('This is a copy of a chat');
      }
    });

    test('removes "Searched the web" button row but keeps the content row', () => {
      const doc = createDoc(SHARE_PAGE_HTML);
      const result = extractor.extractConversation(doc);

      const lastAssistantTurn = result.turns[3];
      expect(lastAssistantTurn.contentHtml).toContain('The response after search');
      expect(lastAssistantTurn.contentHtml).not.toContain('Searched the web');
    });

    test('removes action-bar-copy buttons from Claude responses', () => {
      const doc = createDoc(SHARE_PAGE_HTML);
      const result = extractor.extractConversation(doc);

      // None of the Claude turns should contain action bar markup
      for (const turn of result.turns) {
        if (turn.role === 'assistant') {
          expect(turn.contentHtml).not.toContain('action-bar-copy');
        }
      }
    });

    test('unwraps inline-flex citation spans to plain anchor tags', () => {
      const doc = createDoc(SHARE_PAGE_HTML);
      const result = extractor.extractConversation(doc);

      const lastAssistantTurn = result.turns[3];
      expect(lastAssistantTurn.contentHtml).toContain('href="https://example.com"');
      expect(lastAssistantTurn.contentHtml).toContain('Example Source');
      // The inline-flex wrapper should be gone
      expect(lastAssistantTurn.contentHtml).not.toContain('class="inline-flex"');
    });

    test('returns null when no conversation container is found', () => {
      const doc = createDoc(EMPTY_PAGE_HTML);
      const result = extractor.extractConversation(doc);
      expect(result).toBeNull();
    });

    test('handles minimal conversation with only one turn', () => {
      const doc = createDoc(MINIMAL_CONVERSATION_HTML);
      const result = extractor.extractConversation(doc);

      expect(result).not.toBeNull();
      expect(result.turns.length).toBe(1);
      expect(result.turns[0].role).toBe('human');
      expect(result.turns[0].content).toContain('Just a question');
    });

    test('uses empty url when none provided', () => {
      const doc = createDoc(SHARE_PAGE_HTML);
      const result = extractor.extractConversation(doc);
      expect(result.url).toBe('');
    });
  });

  describe('title extraction', () => {
    test('extracts title from leaf element in page header', () => {
      const doc = createDoc(SHARE_PAGE_HTML);
      const result = extractor.extractConversation(doc);
      expect(result.title).toBe('Test Conversation Title');
    });

    test('returns empty string when no page header exists', () => {
      const doc = createDoc(MINIMAL_CONVERSATION_HTML);
      const result = extractor.extractConversation(doc);
      expect(result.title).toBe('');
    });

    test('falls back to document title when header has no suitable leaf', () => {
      const html = `
        <header data-testid="page-header">
          <div><div>Shared by Someone</div></div>
        </header>
        <div class="flex-1 flex flex-col px-4 max-w-3xl">
          <div class="border-0.5">d</div>
          <div><div data-testid="user-message"><p>hi</p></div></div>
        </div>
      `;
      const doc = createDoc(html);
      document.title = 'Fallback Title';
      const result = extractor.extractConversation(doc);
      expect(result.title).toBe('Fallback Title');
    });
  });

  describe('sharedBy extraction', () => {
    test('extracts shared-by name from header', () => {
      const doc = createDoc(SHARE_PAGE_HTML);
      const result = extractor.extractConversation(doc);
      expect(result.sharedBy).toBe('Test User');
    });

    test('returns empty string when no header', () => {
      const doc = createDoc(MINIMAL_CONVERSATION_HTML);
      const result = extractor.extractConversation(doc);
      expect(result.sharedBy).toBe('');
    });
  });

  describe('human content extraction', () => {
    test('joins multiple paragraphs with double newlines', () => {
      const doc = createDoc(SHARE_PAGE_HTML);
      const result = extractor.extractConversation(doc);
      const firstHuman = result.turns[0];
      expect(firstHuman.content).toContain('\n\n');
    });

    test('falls back to textContent when no paragraphs exist', () => {
      const html = `
        <div class="flex-1 flex flex-col px-4 max-w-3xl">
          <div class="border-0.5">d</div>
          <div>
            <div data-testid="user-message">Plain text with no paragraphs</div>
          </div>
        </div>
      `;
      const doc = createDoc(html);
      const result = extractor.extractConversation(doc);
      expect(result.turns[0].content).toBe('Plain text with no paragraphs');
    });
  });
});
