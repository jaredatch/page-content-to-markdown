'use strict';

const fs = require('fs');
const path = require('path');
const ChatGPTExtractor = require('../../src/sites/chatgpt/chatgpt-extractor');

// ── HTML Fixtures ──

/**
 * Minimal ChatGPT share fixture mirroring the real DOM structure:
 * - <section data-testid="conversation-turn-N" data-turn="user|assistant">
 * - inner [data-message-author-role="user|assistant"] holds the message body
 * - user prose lives in `.user-message-bubble-color > .whitespace-pre-wrap`
 * - assistant prose lives in `.markdown.prose`
 * - reasoning-only assistant turns have no [data-message-author-role] and
 *   show a "Thought for Nm Ns" chip in their place
 */
const SHARE_PAGE_HTML = `
<main>
  <section data-testid="conversation-turn-1" data-turn="user">
    <h4 class="sr-only">You said:</h4>
    <div data-message-author-role="user" data-message-id="u1">
      <div>
        <div class="user-message-bubble-color">
          <div class="whitespace-pre-wrap">First user question.</div>
        </div>
      </div>
    </div>
  </section>
  <section data-testid="conversation-turn-2" data-turn="assistant">
    <h4 class="sr-only">ChatGPT said:</h4>
    <div data-message-author-role="assistant" data-message-id="a1">
      <div class="markdown prose">
        <p>First assistant reply.</p>
        <h2>A heading</h2>
        <ol>
          <li>Item one</li>
          <li>Item two</li>
        </ol>
      </div>
    </div>
  </section>
  <section data-testid="conversation-turn-3" data-turn="user">
    <div data-message-author-role="user" data-message-id="u2">
      <div class="user-message-bubble-color">
        <div class="whitespace-pre-wrap">A follow-up.</div>
      </div>
    </div>
  </section>
  <section data-testid="conversation-turn-4" data-turn="assistant">
    <div data-message-author-role="assistant" data-message-id="a2">
      <div class="markdown prose">
        <p>A second reply.</p>
      </div>
    </div>
  </section>
</main>
`;

function makeDoc(html = SHARE_PAGE_HTML, title = 'Test Chat') {
  const { JSDOM } = require('jsdom');
  const dom = new JSDOM(`<!doctype html><html><head><title>${title}</title></head><body>${html}</body></html>`);
  return dom.window.document;
}

// ── Tests ──

describe('ChatGPTExtractor', () => {
  let extractor;

  beforeEach(() => {
    extractor = new ChatGPTExtractor();
  });

  describe('extract() dispatch method', () => {
    test('dispatches "conversation" to extractConversation', () => {
      const doc = makeDoc();
      const data = extractor.extract('conversation', doc, 'https://chatgpt.com/share/abc');
      expect(data).toBeTruthy();
      expect(data.turns.length).toBe(4);
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

    test('extracts title from document.title', () => {
      const doc = makeDoc(SHARE_PAGE_HTML, 'My Chat');
      expect(extractor.extractConversation(doc).title).toBe('My Chat');
    });

    test('strips trailing " | ChatGPT" suffix', () => {
      const doc = makeDoc(SHARE_PAGE_HTML, 'My Chat | ChatGPT');
      expect(extractor.extractConversation(doc).title).toBe('My Chat');
    });

    test('does not strip "ChatGPT" mid-title', () => {
      const doc = makeDoc(SHARE_PAGE_HTML, 'How ChatGPT works for me');
      expect(extractor.extractConversation(doc).title).toBe('How ChatGPT works for me');
    });

    test('preserves the url passed in', () => {
      const data = extractor.extractConversation(makeDoc(), 'https://chatgpt.com/share/xyz');
      expect(data.url).toBe('https://chatgpt.com/share/xyz');
    });

    test('extracts turns in document order', () => {
      const data = extractor.extractConversation(makeDoc());
      expect(data.turns.map(t => t.role)).toEqual(['human', 'assistant', 'human', 'assistant']);
    });

    test('extracts user content as plain text', () => {
      const data = extractor.extractConversation(makeDoc());
      expect(data.turns[0].content).toBe('First user question.');
      expect(data.turns[2].content).toBe('A follow-up.');
    });

    test('extracts assistant content as HTML', () => {
      const data = extractor.extractConversation(makeDoc());
      expect(data.turns[1].contentHtml).toContain('<p>First assistant reply.</p>');
      expect(data.turns[1].contentHtml).toContain('<h2>A heading</h2>');
      expect(data.turns[1].contentHtml).toContain('<ol>');
    });

    test('attachments default to 0 when no upload chips are present', () => {
      const data = extractor.extractConversation(makeDoc());
      expect(data.turns[0].attachments).toBe(0);
      expect(data.turns[2].attachments).toBe(0);
    });

    test('counts each upload chip as one attachment', () => {
      const html = `
        <main>
          <section data-testid="conversation-turn-1" data-turn="user">
            <div data-message-author-role="user" data-message-id="u1">
              <div>
                <div class="text-token-text-secondary"><span>Uploaded an image</span></div>
                <div class="text-token-text-secondary"><span>Uploaded an image</span></div>
                <div class="user-message-bubble-color">
                  <div class="whitespace-pre-wrap">Look at these two images.</div>
                </div>
              </div>
            </div>
          </section>
        </main>
      `;
      const data = extractor.extractConversation(makeDoc(html));
      expect(data.turns[0].attachments).toBe(2);
      expect(data.turns[0].content).toBe('Look at these two images.');
    });

    test('counts /c/ active-conversation thumbnail buttons as attachments when no chips are present', () => {
      const html = `
        <main>
          <section data-testid="conversation-turn-1" data-turn="user">
            <div data-message-author-role="user" data-message-id="u1">
              <div>
                <button aria-label="Open image in full view">
                  <img alt="Uploaded image" src="https://example.com/a.jpg">
                </button>
                <button aria-label="Open image in full view">
                  <img alt="Uploaded image" src="https://example.com/b.jpg">
                </button>
                <div class="user-message-bubble-color">
                  <div class="whitespace-pre-wrap">Look at these two images.</div>
                </div>
              </div>
            </div>
          </section>
        </main>
      `;
      const data = extractor.extractConversation(makeDoc(html));
      expect(data.turns[0].attachments).toBe(2);
      expect(data.turns[0].content).toBe('Look at these two images.');
    });

    test('preserves embedded code blocks in user prose as fenced blocks', () => {
      const html = `
        <main>
          <section data-testid="conversation-turn-1" data-turn="user">
            <div data-message-author-role="user" data-message-id="u1">
              <div class="user-message-bubble-color">
                <div class="whitespace-pre-wrap">Look at this output:<pre><code>line1
line2</code></pre>That's the issue.</div>
              </div>
            </div>
          </section>
        </main>
      `;
      const data = extractor.extractConversation(makeDoc(html));
      expect(data.turns[0].content).toContain('Look at this output:');
      expect(data.turns[0].content).toContain('```\nline1\nline2\n```');
      expect(data.turns[0].content).toContain("That's the issue.");
    });

    test('replaces CodeMirror code blocks with clean <pre><code>, discarding chrome', () => {
      const html = `
        <main>
          <section data-testid="conversation-turn-1" data-turn="assistant">
            <div data-message-author-role="assistant" data-message-id="a1">
              <div class="markdown prose">
                <p>Here you go:</p>
                <pre data-start="0" data-end="20">
                  <button aria-label="Copy">Copy</button>
                  <div class="cm-editor">
                    <div class="cm-scroller">
                      <pre class="cm-content">
                        <code><span>const a = 1;</span><br><span>const b = 2;</span></code>
                      </pre>
                    </div>
                  </div>
                </pre>
              </div>
            </div>
          </section>
        </main>
      `;
      const data = extractor.extractConversation(makeDoc(html));
      expect(data.turns[0].contentHtml).toContain('<pre><code>const a = 1;\nconst b = 2;</code></pre>');
      expect(data.turns[0].contentHtml).not.toContain('cm-editor');
      expect(data.turns[0].contentHtml).not.toContain('Copy');
    });

    test('reads code language from the sticky header (icon + label pattern)', () => {
      // The label sits as a text node next to an SVG icon inside a div whose
      // children.length is 1 — make sure we still pick up "Python".
      const html = `
        <main>
          <section data-testid="conversation-turn-1" data-turn="assistant">
            <div data-message-author-role="assistant" data-message-id="a1">
              <div class="markdown prose">
                <pre data-start="0" data-end="10">
                  <div class="sticky z-2 select-none">
                    <div class="flex items-center justify-between">
                      <div class="flex items-center text-sm font-medium justify-self-start">
                        <svg width="20" height="20"><use href="#icon"></use></svg>Python
                      </div>
                      <div class="justify-self-end">
                        <button aria-label="Copy">Copy</button>
                      </div>
                    </div>
                  </div>
                  <div class="cm-editor">
                    <div class="cm-scroller">
                      <pre class="cm-content">
                        <code><span>print("hi")</span></code>
                      </pre>
                    </div>
                  </div>
                </pre>
              </div>
            </div>
          </section>
        </main>
      `;
      const data = extractor.extractConversation(makeDoc(html));
      expect(data.turns[0].contentHtml).toContain('<pre><code class="language-python">print("hi")</code></pre>');
    });

    test('strips trailing newlines from CodeMirror code text', () => {
      const html = `
        <main>
          <section data-testid="conversation-turn-1" data-turn="assistant">
            <div data-message-author-role="assistant" data-message-id="a1">
              <div class="markdown prose">
                <pre data-start="0" data-end="10">
                  <div class="cm-editor"><div class="cm-scroller"><pre class="cm-content">
                    <code><span>line1</span><br><span>line2</span><br></code>
                  </pre></div></div>
                </pre>
              </div>
            </div>
          </section>
        </main>
      `;
      const data = extractor.extractConversation(makeDoc(html));
      expect(data.turns[0].contentHtml).toContain('<pre><code>line1\nline2</code></pre>');
      expect(data.turns[0].contentHtml).not.toMatch(/line2\n+<\/code>/);
    });

    test('replaces KaTeX block math with $$...$$ from the LaTeX annotation', () => {
      const html = `
        <main>
          <section data-testid="conversation-turn-1" data-turn="assistant">
            <div data-message-author-role="assistant" data-message-id="a1">
              <div class="markdown prose">
                <p>See:</p>
                <span class="katex-display">
                  <span class="katex">
                    <span class="katex-mathml">
                      <math><semantics><mrow><mi>a</mi></mrow><annotation encoding="application/x-tex">a^2 + b^2 = c^2</annotation></semantics></math>
                    </span>
                    <span class="katex-html">a2+b2=c2</span>
                  </span>
                </span>
              </div>
            </div>
          </section>
        </main>
      `;
      const data = extractor.extractConversation(makeDoc(html));
      expect(data.turns[0].contentHtml).toContain('$$a^2 + b^2 = c^2$$');
      expect(data.turns[0].contentHtml).not.toContain('katex');
    });

    test('replaces inline KaTeX math with $...$ — even on cloned (detached) trees', () => {
      // Regression: a previous guard used Element.isConnected to skip
      // already-replaced math, but isConnected is always false on a cloned
      // subtree, so the inline pass silently no-op'd.
      const html = `
        <main>
          <section data-testid="conversation-turn-1" data-turn="assistant">
            <div data-message-author-role="assistant" data-message-id="a1">
              <div class="markdown prose">
                <p>Inline:
                  <span class="katex">
                    <span class="katex-mathml">
                      <math><semantics><mrow><mi>E</mi></mrow><annotation encoding="application/x-tex">E = mc^2</annotation></semantics></math>
                    </span>
                    <span class="katex-html">E=mc2</span>
                  </span>
                </p>
              </div>
            </div>
          </section>
        </main>
      `;
      const data = extractor.extractConversation(makeDoc(html));
      expect(data.turns[0].contentHtml).toContain('$E = mc^2$');
      expect(data.turns[0].contentHtml).not.toMatch(/katex/);
    });

    test('strips writing-block chrome (Edit button, sticky header, invisible auto-resize span)', () => {
      const html = `
        <main>
          <section data-testid="conversation-turn-1" data-turn="assistant">
            <div data-message-author-role="assistant" data-message-id="a1">
              <div class="markdown prose">
                <div data-testid="writing-block-container">
                  <div data-testid="writing-block-header-sticky-container">
                    <button data-testid="writing-block-header-magic-edit-button" aria-label="Edit">
                      <span data-testid="writing-block-header-magic-edit-collapsed-label">Edit</span>
                    </button>
                  </div>
                  <div class="font-medium">Subject</div>
                  <textarea>Following up</textarea>
                  <span class="invisible">Following up</span>
                  <p>Body content</p>
                </div>
              </div>
            </div>
          </section>
        </main>
      `;
      const data = extractor.extractConversation(makeDoc(html));
      const html2 = data.turns[0].contentHtml;
      expect(html2).not.toContain('Edit');
      expect(html2).not.toContain('writing-block-header');
      expect(html2).not.toContain('class="invisible"');
      // Only one copy of the subject text remains (from the textarea), not two
      const matches = (html2.match(/Following up/g) || []).length;
      expect(matches).toBe(1);
    });

    test('does not duplicate writing-block body when the inner ProseMirror also carries the .markdown class', () => {
      // Active-conversation /c/ rendering: each writing-block contains a
      // ProseMirror editor with class="ProseMirror markdown prose ...". The
      // outer message body (also .markdown) already serializes that prose
      // inline, so re-walking the inner .markdown re-emits it. Filter to
      // top-level blocks so each draft body appears exactly once.
      const html = `
        <main>
          <section data-testid="conversation-turn-1" data-turn="assistant">
            <div data-message-author-role="assistant" data-message-id="a1">
              <div class="markdown prose markdown-new-styling">
                <h3>Email drafts</h3>
                <div data-testid="writing-block-container">
                  <div data-testid="writing-block-header-sticky-container">
                    <button data-testid="writing-block-header-magic-edit-button"><span>Edit</span></button>
                  </div>
                  <div class="grid">
                    <textarea>Following up on our conversation</textarea>
                    <span class="invisible">Following up on our conversation</span>
                  </div>
                  <hr>
                  <div class="writing-block-editor">
                    <div class="ProseMirror markdown prose">
                      <p><span>Hi Maya,</span></p>
                      <p><span>Thanks again for taking the time to speak with me today.</span></p>
                      <p><span>Best,</span><br><span>Alex</span></p>
                    </div>
                  </div>
                </div>
                <h3>Chat or text-message drafts</h3>
                <div data-testid="writing-block-container">
                  <div data-testid="writing-block-header-sticky-container"></div>
                  <div class="writing-block-editor">
                    <div class="ProseMirror markdown prose">
                      <p><span>Hey! Running about 10 minutes late, but I'm on my way now.</span></p>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </section>
        </main>
      `;
      const data = extractor.extractConversation(makeDoc(html));
      const html2 = data.turns[0].contentHtml;
      const hiMaya = (html2.match(/Hi Maya/g) || []).length;
      const tenMin = (html2.match(/10 minutes late/g) || []).length;
      expect(hiMaya).toBe(1);
      expect(tenMin).toBe(1);
    });

    test('unwraps li.task-list-item > p so GFM task list rule fires, and trims leading space after checkbox', () => {
      const html = `
        <main>
          <section data-testid="conversation-turn-1" data-turn="assistant">
            <div data-message-author-role="assistant" data-message-id="a1">
              <div class="markdown prose">
                <ul>
                  <li class="task-list-item"><p><input disabled type="checkbox" checked> Done</p></li>
                  <li class="task-list-item"><p><input disabled type="checkbox"> Not done</p></li>
                </ul>
              </div>
            </div>
          </section>
        </main>
      `;
      const data = extractor.extractConversation(makeDoc(html));
      const html2 = data.turns[0].contentHtml;
      // Paragraph wrapper gone, input now a direct child of the li
      expect(html2).toMatch(/<li class="task-list-item">\s*<input[^>]*type="checkbox"[^>]*>Done<\/li>/);
      expect(html2).toMatch(/<li class="task-list-item">\s*<input[^>]*type="checkbox"[^>]*>Not done<\/li>/);
    });

    test('sets default alt="Image" on assistant images with empty alt', () => {
      const html = `
        <main>
          <section data-testid="conversation-turn-1" data-turn="assistant">
            <div data-message-author-role="assistant" data-message-id="a1">
              <div class="markdown prose">
                <img src="https://example.com/a.jpg" alt="">
                <img src="https://example.com/b.jpg">
              </div>
            </div>
          </section>
        </main>
      `;
      const data = extractor.extractConversation(makeDoc(html));
      expect(data.turns[0].contentHtml).toContain('alt="Image"');
      expect(data.turns[0].contentHtml).not.toMatch(/alt=""/);
    });

    test('preserves non-empty image alt text', () => {
      const html = `
        <main>
          <section data-testid="conversation-turn-1" data-turn="assistant">
            <div data-message-author-role="assistant" data-message-id="a1">
              <div class="markdown prose">
                <img src="https://example.com/c.jpg" alt="A diagram">
              </div>
            </div>
          </section>
        </main>
      `;
      const data = extractor.extractConversation(makeDoc(html));
      expect(data.turns[0].contentHtml).toContain('alt="A diagram"');
    });

    test('surfaces reasoning-only assistant turns with the "Thought for ..." label', () => {
      const html = `
        <main>
          <section data-testid="conversation-turn-1" data-turn="user">
            <div data-message-author-role="user" data-message-id="u1">
              <div class="user-message-bubble-color">
                <div class="whitespace-pre-wrap">Think hard about this.</div>
              </div>
            </div>
          </section>
          <section data-testid="conversation-turn-2" data-turn="assistant">
            <div class="border">
              <div class="text-token-text-tertiary">Thought for 1m 38s</div>
            </div>
          </section>
        </main>
      `;
      const data = extractor.extractConversation(makeDoc(html));
      expect(data.turns).toHaveLength(2);
      expect(data.turns[1]).toMatchObject({
        role: 'assistant',
        thinking: 'Thought for 1m 38s',
        contentHtml: null,
      });
      expect(data.turns[1].generatedImages).toEqual([]);
    });

    test('captures generated images even when the assistant turn has no text body', () => {
      const html = `
        <main>
          <section data-testid="conversation-turn-1" data-turn="user">
            <div data-message-author-role="user" data-message-id="u1">
              <div class="user-message-bubble-color">
                <div class="whitespace-pre-wrap">Make me a mockup.</div>
              </div>
            </div>
          </section>
          <section data-testid="conversation-turn-2" data-turn="assistant">
            <div class="text-token-text-tertiary">Thought for 36s</div>
            <div class="group/imagegen-image relative">
              <div><div><img src="https://oai.example/a.png" alt="Generated image: variations grid"></div></div>
              <div><img src="https://oai.example/a.png" alt="Generated image: variations grid"></div>
              <div><img src="https://oai.example/a.png" alt="Generated image: variations grid"></div>
            </div>
          </section>
        </main>
      `;
      const data = extractor.extractConversation(makeDoc(html));
      expect(data.turns[1].generatedImages).toEqual([
        { src: 'https://oai.example/a.png', alt: 'Generated image: variations grid' }
      ]);
      expect(data.turns[1].thinking).toBe('Thought for 36s');
      expect(data.turns[1].contentHtml).toBeNull();
    });

    test('captures generated images alongside an assistant text body', () => {
      const html = `
        <main>
          <section data-testid="conversation-turn-1" data-turn="assistant">
            <div data-message-author-role="assistant" data-message-id="a1">
              <div class="markdown prose"><p>Here are mockups:</p></div>
            </div>
            <div class="group/imagegen-image">
              <div><img src="https://oai.example/b.png" alt="Generated image: dashboard"></div>
              <div><img src="https://oai.example/b.png" alt="Generated image: dashboard"></div>
            </div>
          </section>
        </main>
      `;
      const data = extractor.extractConversation(makeDoc(html));
      expect(data.turns[0].contentHtml).toContain('Here are mockups:');
      expect(data.turns[0].generatedImages).toEqual([
        { src: 'https://oai.example/b.png', alt: 'Generated image: dashboard' }
      ]);
    });

    test('dedupes the 3 imgs-per-imagegen-wrapper into one per generated image', () => {
      // ChatGPT renders each generated image as 3 <img> nodes (foreground +
      // 2 backdrop copies) inside a single imagegen wrapper. We key off the
      // wrapper so the same src isn't emitted three times.
      const html = `
        <main>
          <section data-testid="conversation-turn-1" data-turn="assistant">
            <div class="group/imagegen-image">
              <div class="absolute"><img src="https://oai.example/c.png" alt="Image"></div>
              <div class="relative"><img src="https://oai.example/c.png" alt="Image"></div>
              <div class="absolute scale-110"><img src="https://oai.example/c.png" alt="Image"></div>
            </div>
          </section>
        </main>
      `;
      const data = extractor.extractConversation(makeDoc(html));
      expect(data.turns[0].generatedImages).toHaveLength(1);
    });

    test('falls back to "Generated image" alt when img alt is empty', () => {
      const html = `
        <main>
          <section data-testid="conversation-turn-1" data-turn="assistant">
            <div class="group/imagegen-image">
              <div><img src="https://oai.example/d.png" alt=""></div>
            </div>
          </section>
        </main>
      `;
      const data = extractor.extractConversation(makeDoc(html));
      expect(data.turns[0].generatedImages[0].alt).toBe('Generated image');
    });

    test('concatenates multiple .markdown blocks per assistant turn (reasoning model streams preambles + answer)', () => {
      const html = `
        <main>
          <section data-testid="conversation-turn-1" data-turn="assistant">
            <div data-message-author-role="assistant" data-message-id="m1">
              <div class="markdown prose"><p>I'm checking which species do well.</p></div>
            </div>
            <div data-message-author-role="assistant" data-message-id="m2">
              <div class="markdown prose"><p>The likely pattern is...</p></div>
            </div>
            <div data-message-author-role="assistant" data-message-id="m3">
              <div class="markdown prose"><p>For a 5-gallon tank, here's the answer.</p></div>
            </div>
          </section>
        </main>
      `;
      const data = extractor.extractConversation(makeDoc(html));
      expect(data.turns).toHaveLength(1);
      const html2 = data.turns[0].contentHtml;
      expect(html2).toContain("I'm checking which species do well.");
      expect(html2).toContain('The likely pattern is...');
      expect(html2).toContain("For a 5-gallon tank, here's the answer.");
      // Order preserved
      expect(html2.indexOf('checking')).toBeLessThan(html2.indexOf('likely pattern'));
      expect(html2.indexOf('likely pattern')).toBeLessThan(html2.indexOf('5-gallon tank'));
    });

    test('handles a single assistant turn with multiple .markdown blocks inside one message-author-role', () => {
      const html = `
        <main>
          <section data-testid="conversation-turn-1" data-turn="assistant">
            <div data-message-author-role="assistant" data-message-id="m1">
              <div class="markdown prose"><p>First part.</p></div>
              <div class="markdown prose"><p>Second part.</p></div>
            </div>
          </section>
        </main>
      `;
      const data = extractor.extractConversation(makeDoc(html));
      const html2 = data.turns[0].contentHtml;
      expect(html2).toContain('First part.');
      expect(html2).toContain('Second part.');
    });

    test('replaces URL-shaped image alts with "Search result image"', () => {
      const html = `
        <main>
          <section data-testid="conversation-turn-1" data-turn="assistant">
            <div data-message-author-role="assistant" data-message-id="m1">
              <div class="markdown prose">
                <img src="https://example.com/a.jpg" alt="https://example.com/a.jpg">
                <img src="https://example.com/b.jpg" alt="https://example.com/b.jpg">
              </div>
            </div>
          </section>
        </main>
      `;
      const data = extractor.extractConversation(makeDoc(html));
      expect(data.turns[0].contentHtml).toContain('alt="Search result image"');
      expect(data.turns[0].contentHtml).not.toMatch(/alt="https?:\/\//);
    });

    test('strips elements with inline opacity:0 (transition placeholders)', () => {
      const html = `
        <main>
          <section data-testid="conversation-turn-1" data-turn="assistant">
            <div data-message-author-role="assistant" data-message-id="m1">
              <div class="markdown prose">
                <p>Visible text<span style="opacity: 0; transform: translateX(10%);">hidden duplicate</span> after.</p>
              </div>
            </div>
          </section>
        </main>
      `;
      const data = extractor.extractConversation(makeDoc(html));
      const html2 = data.turns[0].contentHtml;
      expect(html2).toContain('Visible text');
      expect(html2).toContain('after.');
      expect(html2).not.toContain('hidden duplicate');
      expect(html2).not.toContain('opacity: 0');
    });

    test('strips ChatGPT webpage citation pills entirely (v1 default — no inline RAG citations)', () => {
      const html = `
        <main>
          <section data-testid="conversation-turn-1" data-turn="assistant">
            <div data-message-author-role="assistant" data-message-id="m1">
              <div class="markdown prose">
                <p>Body text. <span data-testid="webpage-citation-pill"><a href="https://example.com">PetMD +2</a></span> More text.</p>
              </div>
            </div>
          </section>
        </main>
      `;
      const data = extractor.extractConversation(makeDoc(html));
      const html2 = data.turns[0].contentHtml;
      expect(html2).toContain('Body text.');
      expect(html2).toContain('More text.');
      expect(html2).not.toContain('PetMD');
      expect(html2).not.toContain('webpage-citation-pill');
      expect(html2).not.toContain('href="https://example.com"');
    });

    test('strips the "Sources" footnote button at the end of search-grounded answers', () => {
      const html = `
        <main>
          <section data-testid="conversation-turn-1" data-turn="assistant">
            <div data-message-author-role="assistant" data-message-id="m1">
              <div class="markdown prose">
                <p>Final paragraph.</p>
                <button class="group/footnote" aria-label="Sources">
                  <img src="https://www.google.com/s2/favicons?domain=https://example.com">
                  <div>Sources</div>
                </button>
              </div>
            </div>
          </section>
        </main>
      `;
      const data = extractor.extractConversation(makeDoc(html));
      const html2 = data.turns[0].contentHtml;
      expect(html2).toContain('Final paragraph.');
      expect(html2).not.toContain('aria-label="Sources"');
      expect(html2).not.toContain('group/footnote');
    });

    test('skips empty turn sections and screen-reader chrome', () => {
      const html = `
        <main>
          <section data-testid="conversation-turn-1" data-turn="user">
            <h4 class="sr-only">You said:</h4>
            <div data-message-author-role="user" data-message-id="u1">
              <div class="user-message-bubble-color">
                <div class="whitespace-pre-wrap">Hello.</div>
              </div>
            </div>
          </section>
        </main>
      `;
      const data = extractor.extractConversation(makeDoc(html));
      expect(data.turns).toHaveLength(1);
      expect(data.turns[0].content).toBe('Hello.');
      expect(data.turns[0].content).not.toContain('You said:');
    });
  });

  describe('regression: real share-page captures', () => {
    const uiUxCapturePath = path.join(
      __dirname, '..', '..', 'private', 'captures',
      'chatgpt-2026-04-30-share-ui-ux-design-feedback.html'
    );
    const formattingCapturePath = path.join(
      __dirname, '..', '..', 'private', 'captures',
      'chatgpt-2026-04-30-share-formatting-elements.html'
    );
    const fishTankCapturePath = path.join(
      __dirname, '..', '..', 'private', 'captures',
      'chatgpt-2026-04-30-share-fish-tank.html'
    );

    (fs.existsSync(uiUxCapturePath) ? test : test.skip)('extracts the full UI/UX share — 12 turns, mixed body/thinking-only', () => {
      const html = fs.readFileSync(uiUxCapturePath, 'utf8');
      const { JSDOM } = require('jsdom');
      const dom = new JSDOM(html, { url: 'https://chatgpt.com/share/x' });
      const data = extractor.extractConversation(dom.window.document, dom.window.location.href);

      expect(data.title).toBe('UI/UX Design Feedback');
      expect(data.turns).toHaveLength(12);

      const roles = data.turns.map(t => t.role);
      expect(roles.filter(r => r === 'human')).toHaveLength(6);
      expect(roles.filter(r => r === 'assistant')).toHaveLength(6);

      const reasoningOnly = data.turns.filter(t => t.role === 'assistant' && t.thinking && !t.contentHtml);
      expect(reasoningOnly).toHaveLength(4);
      expect(reasoningOnly[0].thinking).toMatch(/^Thought for /);

      // Every assistant turn in this share generated images — 6 total.
      const withImages = data.turns.filter(t => t.role === 'assistant' && t.generatedImages.length > 0);
      expect(withImages).toHaveLength(6);
      expect(withImages[0].generatedImages[0].src).toMatch(/^https:\/\/sdmntpr/);

      // First user turn has 2 image attachments and the embedded code-fence paste
      expect(data.turns[0].attachments).toBe(2);
      expect(data.turns[0].content).toContain('```');
      expect(data.turns[0].content).toContain('Top OpenClaw Mission Control Projects');
    });

    (fs.existsSync(formattingCapturePath) ? test : test.skip)('extracts the formatting-elements share — code lang, math, task lists, writing-block chrome stripped', () => {
      const html = fs.readFileSync(formattingCapturePath, 'utf8');
      const { JSDOM } = require('jsdom');
      const dom = new JSDOM(html, { url: 'https://chatgpt.com/share/y' });
      const data = extractor.extractConversation(dom.window.document, dom.window.location.href);

      expect(data.title).toBe('Formatting Elements Overview');
      const allHtml = data.turns
        .filter(t => t.role === 'assistant')
        .map(t => t.contentHtml || '')
        .join('\n');

      // Code language labels resolved from the sticky header, not from the
      // first short text leaf inside cm-content (which would be "print").
      expect(allHtml).toMatch(/<pre><code class="language-python">/);
      expect(allHtml).toMatch(/<pre><code class="language-html">/);

      // KaTeX collapses to LaTeX with $ / $$ markers
      expect(allHtml).toContain('$E = mc^2$');
      expect(allHtml).toContain('$$a^2 + b^2 = c^2$$');
      expect(allHtml).not.toContain('katex');

      // Writing-block Edit chrome and invisible auto-resize spans gone
      expect(allHtml).not.toContain('writing-block-header');
      expect(allHtml).not.toContain('class="invisible"');
      expect((allHtml.match(/Following up on our conversation/g) || []).length).toBe(1);

      // Task list checkboxes preserved as direct children of <li>
      expect(allHtml).toMatch(/<li[^>]*class="task-list-item"[^>]*>\s*<input[^>]*type="checkbox"/);
    });

    (fs.existsSync(fishTankCapturePath) ? test : test.skip)('extracts the fish-tank share — multi-block reasoning turn with citations + search images', () => {
      const html = fs.readFileSync(fishTankCapturePath, 'utf8');
      const { JSDOM } = require('jsdom');
      const dom = new JSDOM(html, { url: 'https://chatgpt.com/share/z' });
      const data = extractor.extractConversation(dom.window.document, dom.window.location.href);

      expect(data.title).toBe('Easy Fish for 5 Gallon');
      expect(data.turns).toHaveLength(2);
      const asst = data.turns.find(t => t.role === 'assistant');
      expect(asst).toBeTruthy();

      // Multi-block extraction: all 3 .markdown blocks present
      expect(asst.contentHtml).toContain("I’m checking which species");
      expect(asst.contentHtml).toContain("The likely pattern I’m seeing");
      expect(asst.contentHtml).toContain("the easiest success is usually");

      // Search-result images get a clean alt, not the URL itself
      expect(asst.contentHtml).toMatch(/alt="Search result image"/);
      expect(asst.contentHtml).not.toMatch(/alt="https?:\/\/images\.openai\.com/);

      // Citation chrome is dropped entirely in v1 — no inline source pills
      // and no Sources footnote button leak into the markdown.
      expect(asst.contentHtml).not.toContain('webpage-citation-pill');
      expect(asst.contentHtml).not.toContain('PetMD');
      expect(asst.contentHtml).not.toContain('aria-label="Sources"');
    });
  });

  describe('regression: logged-in captures', () => {
    const uiUxLoggedInPath = path.join(
      __dirname, '..', '..', 'private', 'captures',
      'chatgpt-2026-04-30-share-loggedin.html'
    );
    const formattingLoggedInPath = path.join(
      __dirname, '..', '..', 'private', 'captures',
      'chatgpt-2026-04-30-share-2-loggedin.html'
    );

    (fs.existsSync(uiUxLoggedInPath) ? test : test.skip)('counts thumbnail-button attachments on the /share/ logged-in render (no chips)', () => {
      const html = fs.readFileSync(uiUxLoggedInPath, 'utf8');
      const { JSDOM } = require('jsdom');
      const dom = new JSDOM(html, { url: 'https://chatgpt.com/share/x' });
      const data = extractor.extractConversation(dom.window.document, dom.window.location.href);

      // Logged-in viewers get the rich active-conversation chrome on /share/
      // pages too: attachments render as <button><img alt="Uploaded image">
      // instead of the "Uploaded an image" chip used on logged-out /share/.
      // First user turn has 2 image attachments, third has 1.
      const userTurns = data.turns.filter(t => t.role === 'human');
      expect(userTurns[0].attachments).toBe(2);
      expect(userTurns[2].attachments).toBe(1);
    });

    (fs.existsSync(formattingLoggedInPath) ? test : test.skip)('does not duplicate writing-block content on /c/ active-conversation captures', () => {
      const html = fs.readFileSync(formattingLoggedInPath, 'utf8');
      const { JSDOM } = require('jsdom');
      const dom = new JSDOM(html, { url: 'https://chatgpt.com/c/x' });
      const data = extractor.extractConversation(dom.window.document, dom.window.location.href);

      const allHtml = data.turns
        .filter(t => t.role === 'assistant')
        .map(t => t.contentHtml || '')
        .join('\n');

      // Each writing-block draft body should appear exactly once.
      // Without the nested-.markdown filter, the inner ProseMirror editors
      // re-emit every draft, leading to a trailing duplicate block.
      expect((allHtml.match(/Hi Maya/g) || []).length).toBe(1);
      expect((allHtml.match(/Running about 10 minutes late/g) || []).length).toBe(1);
      expect((allHtml.match(/Big milestone today/g) || []).length).toBe(1);
    });
  });
});
