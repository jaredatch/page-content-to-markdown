'use strict';

const GrokExtractor = require('../../src/sites/grok/grok-extractor');

// ── HTML Fixtures ──

/**
 * Minimal Grok share page fixture mimicking the real DOM structure:
 * - document.title = "{title} | Shared Grok Conversation"
 * - alternating [data-testid="user-message"] and [data-testid="assistant-message"]
 * - assistant messages contain .thinking-container + .response-content-markdown
 * - citation chips are <a class="citation">⁠Source</a> with U+2060 prefix
 */
const SHARE_PAGE_HTML = `
<main>
  <div data-testid="user-message">
    <div class="relative response-content-markdown markdown">
      <p>First user question.</p>
    </div>
  </div>
  <div data-testid="assistant-message">
    <div class="relative">
      <div class="thinking-container mb-3">
        <div class="flex flex-col">
          <button><span>Thought for 42s</span></button>
        </div>
      </div>
      <div class="relative response-content-markdown markdown">
        <p>First assistant reply with an <a class="citation" href="https://example.com/a">⁠ExampleA</a> chip.</p>
        <h3>A heading</h3>
        <ol>
          <li>Item one</li>
          <li>Item two</li>
        </ol>
      </div>
    </div>
  </div>
  <div data-testid="user-message">
    <div class="relative response-content-markdown markdown">
      <p>A follow-up question.</p>
    </div>
  </div>
  <div data-testid="assistant-message">
    <div class="relative">
      <div class="relative response-content-markdown markdown">
        <p>A reply without a thinking block.</p>
      </div>
    </div>
  </div>
</main>
`;

function makeDoc(html = SHARE_PAGE_HTML, title = 'Test Chat | Shared Grok Conversation') {
  const { JSDOM } = require('jsdom');
  const dom = new JSDOM(`<!doctype html><html><head><title>${title}</title></head><body>${html}</body></html>`);
  return dom.window.document;
}

// ── Tests ──

describe('GrokExtractor', () => {
  let extractor;

  beforeEach(() => {
    extractor = new GrokExtractor();
  });

  describe('extract() dispatch method', () => {
    test('dispatches "conversation" to extractConversation', () => {
      const doc = makeDoc();
      const data = extractor.extract('conversation', doc, 'https://grok.com/share/abc');
      expect(data).toBeTruthy();
      expect(data.turns.length).toBeGreaterThan(0);
    });

    test('returns null for unknown content type', () => {
      const doc = makeDoc();
      expect(extractor.extract('unknown', doc)).toBeNull();
    });
  });

  describe('extractConversation', () => {
    test('returns null when no turns are present', () => {
      const doc = makeDoc('<main></main>');
      expect(extractor.extractConversation(doc)).toBeNull();
    });

    test('extracts title stripping the Grok suffix', () => {
      const doc = makeDoc();
      const data = extractor.extractConversation(doc);
      expect(data.title).toBe('Test Chat');
    });

    test('handles title without the expected suffix', () => {
      const doc = makeDoc(SHARE_PAGE_HTML, 'Just a Title');
      const data = extractor.extractConversation(doc);
      expect(data.title).toBe('Just a Title');
    });

    test('preserves the url passed in', () => {
      const doc = makeDoc();
      const data = extractor.extractConversation(doc, 'https://grok.com/share/xyz');
      expect(data.url).toBe('https://grok.com/share/xyz');
    });

    test('extracts turns in document order', () => {
      const doc = makeDoc();
      const data = extractor.extractConversation(doc);
      expect(data.turns.map(t => t.role)).toEqual(['human', 'assistant', 'human', 'assistant']);
    });

    test('extracts user content as plain text', () => {
      const doc = makeDoc();
      const data = extractor.extractConversation(doc);
      expect(data.turns[0].content).toBe('First user question.');
      expect(data.turns[2].content).toBe('A follow-up question.');
    });

    test('extracts assistant thinking label when present', () => {
      const doc = makeDoc();
      const data = extractor.extractConversation(doc);
      expect(data.turns[1].thinking).toBe('Thought for 42s');
    });

    test('sets thinking to null when no thinking container is present', () => {
      const doc = makeDoc();
      const data = extractor.extractConversation(doc);
      expect(data.turns[3].thinking).toBeNull();
    });

    test('extracts assistant content as HTML', () => {
      const doc = makeDoc();
      const data = extractor.extractConversation(doc);
      expect(data.turns[1].contentHtml).toContain('<p>');
      expect(data.turns[1].contentHtml).toContain('<h3>A heading</h3>');
      expect(data.turns[1].contentHtml).toContain('<ol>');
    });

    test('strips U+2060 word-joiner prefix from citation chip text', () => {
      const doc = makeDoc();
      const data = extractor.extractConversation(doc);
      const html = data.turns[1].contentHtml;
      expect(html).toContain('>ExampleA<');
      expect(html).not.toMatch(/>⁠/);
    });

    test('preserves citation chip hrefs', () => {
      const doc = makeDoc();
      const data = extractor.extractConversation(doc);
      expect(data.turns[1].contentHtml).toContain('href="https://example.com/a"');
    });

    test('replaces code-block wrappers with clean <pre><code>, discarding the language/Copy chrome', () => {
      const codeBlockHtml = `
        <main>
          <div data-testid="assistant-message">
            <div class="relative response-content-markdown markdown">
              <p>Here's a snippet:</p>
              <div data-testid="code-block">
                <div>
                  <div><span class="font-mono text-xs">JSON</span></div>
                  <div><button>Copy</button></div>
                  <pre><code><span>{ "foo": 1 }</span></code></pre>
                </div>
              </div>
            </div>
          </div>
        </main>
      `;
      const doc = makeDoc(codeBlockHtml);
      const data = extractor.extractConversation(doc);
      const html = data.turns[0].contentHtml;
      expect(html).toContain('<pre><code class="language-json">{ "foo": 1 }</code></pre>');
      expect(html).not.toContain('Copy');
      expect(html).not.toContain('data-testid="code-block"');
    });

    test('removes multi-citation popover buttons (<button class="no-copy">)', () => {
      const html = `
        <main>
          <div data-testid="assistant-message">
            <div class="relative response-content-markdown markdown">
              <p>Some prose<button class="no-copy rounded-full bg-surface-l1">⁠GitHub<span> +2</span></button>.</p>
            </div>
          </div>
        </main>
      `;
      const doc = makeDoc(html);
      const data = extractor.extractConversation(doc);
      expect(data.turns[0].contentHtml).not.toContain('<button');
      expect(data.turns[0].contentHtml).not.toContain('+2');
    });

    test('sets default alt="Image" on images with empty alt', () => {
      const html = `
        <main>
          <div data-testid="assistant-message">
            <div class="relative response-content-markdown markdown">
              <img src="https://example.com/a.jpg" alt="">
              <img src="https://example.com/b.jpg">
            </div>
          </div>
        </main>
      `;
      const doc = makeDoc(html);
      const data = extractor.extractConversation(doc);
      expect(data.turns[0].contentHtml).toContain('alt="Image"');
      expect(data.turns[0].contentHtml).not.toMatch(/alt=""/);
    });

    test('preserves non-empty image alt text', () => {
      const html = `
        <main>
          <div data-testid="assistant-message">
            <div class="relative response-content-markdown markdown">
              <img src="https://example.com/c.jpg" alt="A diagram">
            </div>
          </div>
        </main>
      `;
      const doc = makeDoc(html);
      const data = extractor.extractConversation(doc);
      expect(data.turns[0].contentHtml).toContain('alt="A diagram"');
    });

    test('omits the language class when no language label is present', () => {
      const html = `
        <main>
          <div data-testid="assistant-message">
            <div class="relative response-content-markdown markdown">
              <div data-testid="code-block">
                <pre><code>plain text</code></pre>
              </div>
            </div>
          </div>
        </main>
      `;
      const doc = makeDoc(html);
      const data = extractor.extractConversation(doc);
      expect(data.turns[0].contentHtml).toContain('<pre><code>plain text</code></pre>');
    });
  });
});
