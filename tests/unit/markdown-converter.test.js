const MarkdownConverter = require('../../src/utils/markdown-converter');

describe('MarkdownConverter', () => {
  let converter;

  beforeEach(() => {
    converter = new MarkdownConverter();
  });

  describe('convertToMarkdown', () => {
    test('should convert simple HTML to markdown', () => {
      const html = '<h1>Title</h1><p>This is a paragraph.</p>';
      const result = converter.convertToMarkdown(html);
      
      expect(result).toContain('# Title');
      expect(result).toContain('This is a paragraph.');
      expect(result).toBeValidMarkdown();
    });

    test('should handle nested HTML elements', () => {
      const html = `
        <article>
          <h2>Section Title</h2>
          <div>
            <p>Paragraph with <strong>bold</strong> and <em>italic</em> text.</p>
            <ul>
              <li>Item 1</li>
              <li>Item 2</li>
            </ul>
          </div>
        </article>
      `;
      const result = converter.convertToMarkdown(html);
      
      expect(result).toContain('## Section Title');
      expect(result).toContain('**bold**');
      expect(result).toContain('*italic*');
      expect(result).toMatch(/- +Item 1/);
      expect(result).toMatch(/- +Item 2/);
    });

    test('should preserve links', () => {
      const html = '<p>Check out <a href="https://example.com">this link</a>.</p>';
      const result = converter.convertToMarkdown(html);
      
      expect(result).toContain('[this link](https://example.com)');
    });

    test('should handle code blocks', () => {
      const html = '<pre><code>const x = 42;</code></pre>';
      const result = converter.convertToMarkdown(html);
      
      expect(result).toContain('```');
      expect(result).toContain('const x = 42;');
    });

    test('should clean up navigation and ads', () => {
      const html = `
        <nav>Navigation menu</nav>
        <main>
          <h1>Main Content</h1>
          <p>Important content here.</p>
        </main>
        <div class="ad">Advertisement</div>
        <footer>Footer content</footer>
      `;
      const result = converter.convertToMarkdown(html);
      
      expect(result).toContain('# Main Content');
      expect(result).toContain('Important content here.');
      expect(result).not.toContain('Navigation menu');
      expect(result).not.toContain('Advertisement');
    });

    test('should return empty string for empty input', () => {
      expect(converter.convertToMarkdown('')).toBe('');
      expect(converter.convertToMarkdown(null)).toBe('');
      expect(converter.convertToMarkdown(undefined)).toBe('');
    });
  });

  describe('extractMainContent', () => {
    test('should extract content from article tags', () => {
      const html = `
        <header>Header</header>
        <article>
          <h1>Article Title</h1>
          <p>This is a substantial article with enough content to pass the significance threshold for extraction. It contains multiple sentences and meaningful text that would be found on a real web page.</p>
        </article>
        <sidebar>Sidebar</sidebar>
      `;
      const result = converter.extractMainContent(html);

      expect(result).toContain('Article Title');
      expect(result).toContain('substantial article');
      expect(result).not.toContain('Header');
      expect(result).not.toContain('Sidebar');
    });

    test('should extract content from main tags', () => {
      const html = `
        <nav>Navigation</nav>
        <main>
          <h1>Main Title</h1>
          <p>This is the main content area with enough text to pass the significance threshold. It contains multiple sentences and meaningful paragraphs that represent real page content.</p>
        </main>
        <footer>Footer</footer>
      `;
      const result = converter.extractMainContent(html);

      expect(result).toContain('Main Title');
      expect(result).toContain('main content area');
      expect(result).not.toContain('Navigation');
      expect(result).not.toContain('Footer');
    });

    test('should fallback to body if no semantic tags found', () => {
      const html = `
        <body>
          <div>
            <h1>Title</h1>
            <p>Content</p>
          </div>
        </body>
      `;
      const result = converter.extractMainContent(html);
      
      expect(result).toContain('Title');
      expect(result).toContain('Content');
    });
  });

  describe('convertHtmlFragment', () => {
    test('should convert HTML fragment without content extraction', () => {
      const html = '<h2>Selected Heading</h2><p>Selected paragraph text.</p>';
      const result = converter.convertHtmlFragment(html);

      expect(result).toContain('## Selected Heading');
      expect(result).toContain('Selected paragraph text.');
      expect(result).toBeValidMarkdown();
    });

    test('should preserve content that full-page mode would strip', () => {
      // Nav, social, header elements would be stripped by the full-page
      // Turndown rules, but convertHtmlFragment trusts the user's selection
      const html = '<nav><a href="/home">Home</a> | <a href="/about">About</a></nav>';
      const result = converter.convertHtmlFragment(html);

      expect(result).toContain('Home');
      expect(result).toContain('About');
    });

    test('should still strip universally junk elements', () => {
      const html = `
        <div>
          <p>Real content the user selected.</p>
          <div class="cookie-notice">Accept cookies</div>
          <div class="advertisement">Buy stuff</div>
          <div id="gdpr-banner">Privacy consent</div>
          <div class="popup-overlay">Sign up now!</div>
        </div>
      `;
      const result = converter.convertHtmlFragment(html);

      expect(result).toContain('Real content');
      expect(result).not.toContain('Accept cookies');
      expect(result).not.toContain('Buy stuff');
      expect(result).not.toContain('Privacy consent');
      expect(result).not.toContain('Sign up now');
    });

    test('should preserve social, header, comment content in fragments', () => {
      const html = `
        <div>
          <div class="article-header"><p>By John Doe, Product Manager</p></div>
          <div class="social-links"><a href="/twitter">@author</a></div>
          <div class="comment-count">42 comments</div>
        </div>
      `;
      const result = converter.convertHtmlFragment(html);

      expect(result).toContain('John Doe');
      expect(result).toContain('@author');
      expect(result).toContain('42 comments');
    });

    test('should handle lists in fragments', () => {
      const html = '<ul><li>Item A</li><li>Item B</li><li>Item C</li></ul>';
      const result = converter.convertHtmlFragment(html);

      expect(result).toContain('Item A');
      expect(result).toContain('Item B');
      expect(result).toContain('Item C');
    });

    test('should handle empty input', () => {
      expect(converter.convertHtmlFragment('')).toBe('');
      expect(converter.convertHtmlFragment(null)).toBe('');
      expect(converter.convertHtmlFragment(undefined)).toBe('');
    });

    test('should clean up markdown output', () => {
      const html = '<p>Text</p><p></p><p></p><p>More text</p>';
      const result = converter.convertHtmlFragment(html);

      // Should not have excessive line breaks
      expect(result).not.toMatch(/\n{3,}/);
    });
  });

  describe('image handling', () => {
    test('should use src when it is a real URL', () => {
      const html = '<img src="https://example.com/photo.jpg" alt="A photo">';
      const result = converter.convertToMarkdown(html);
      expect(result).toContain('![A photo](https://example.com/photo.jpg)');
    });

    test('should fall back to data-src when src is a data URI placeholder', () => {
      const html = `<img src="data:image/svg+xml,%3Csvg%20xmlns='http://www.w3.org/2000/svg'%20width='100'%20height='100'%3E%3C/svg%3E"
        data-src="https://example.com/real-image.png" alt="Lazy image">`;
      const result = converter.convertToMarkdown(html);
      expect(result).toContain('![Lazy image](https://example.com/real-image.png)');
      expect(result).not.toContain('data:image');
    });

    test('should fall back to data-lazy-src when src is a placeholder', () => {
      const html = `<img src="data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP"
        data-lazy-src="https://example.com/lazy.jpg" alt="Lazy loaded">`;
      const result = converter.convertToMarkdown(html);
      expect(result).toContain('![Lazy loaded](https://example.com/lazy.jpg)');
    });

    test('should parse srcset when src is a placeholder and no data-src', () => {
      const html = `<img src="data:image/svg+xml,%3Csvg%3E%3C/svg%3E"
        srcset="https://example.com/small.jpg 400w, https://example.com/large.jpg 1600w"
        alt="Responsive">`;
      const result = converter.convertToMarkdown(html);
      expect(result).toContain('![Responsive](https://example.com/large.jpg)');
    });

    test('should include images without alt text', () => {
      const html = '<img src="https://example.com/photo.jpg">';
      const result = converter.convertToMarkdown(html);
      expect(result).toContain('![](https://example.com/photo.jpg)');
    });

    test('should drop images with no resolvable URL', () => {
      const html = `<img src="data:image/svg+xml,%3Csvg%3E%3C/svg%3E" alt="No real src">`;
      const result = converter.convertToMarkdown(html);
      expect(result).not.toContain('![No real src]');
    });
  });

  describe('cleanupMarkdown', () => {
    test('should remove excessive whitespace', () => {
      const markdown = '# Title\n\n\n\n\nParagraph\n\n\n';
      const result = converter.cleanupMarkdown(markdown);

      expect(result).toBe('# Title\n\nParagraph');
    });

    test('should remove empty lines at start and end', () => {
      const markdown = '\n\n# Title\nParagraph\n\n\n';
      const result = converter.cleanupMarkdown(markdown);

      expect(result).toBe('# Title\nParagraph');
    });
  });

  describe('convertFromDOM', () => {
    test('should convert a DOM element with article content to markdown', () => {
      const { JSDOM } = require('jsdom');
      const dom = new JSDOM(`<html><body>
        <article>
          <h1>Test Article</h1>
          <p>This is a paragraph with <strong>bold</strong> and <em>italic</em> text that is long enough to pass content checks.</p>
        </article>
      </body></html>`);
      const body = dom.window.document.body;

      const result = converter.convertFromDOM(body);

      expect(result).toContain('Test Article');
      expect(result).toContain('**bold**');
      expect(result).toContain('*italic*');
      expect(result).toBeValidMarkdown();
    });

    test('should return empty string for null input', () => {
      expect(converter.convertFromDOM(null)).toBe('');
      expect(converter.convertFromDOM(undefined)).toBe('');
    });

    test('should return empty string for non-element input', () => {
      expect(converter.convertFromDOM('not an element')).toBe('');
      expect(converter.convertFromDOM(42)).toBe('');
    });

    test('should handle body element as input when no semantic container exists', () => {
      const { JSDOM } = require('jsdom');
      const dom = new JSDOM(`<html><body>
        <div>
          <p>Just some loose content that is long enough to produce a reasonable markdown output for testing.</p>
          <p>Another paragraph with some more text to make this substantial enough for the converter.</p>
        </div>
      </body></html>`);
      const body = dom.window.document.body;

      const result = converter.convertFromDOM(body);

      expect(result).toContain('loose content');
    });

    test('should produce equivalent output to convertToMarkdown for the same content', () => {
      const html = `<html><body>
        <article>
          <h2>Section Title</h2>
          <p>A paragraph with a <a href="https://example.com">link</a> and enough text to make it substantial for testing.</p>
          <ul><li>Item 1</li><li>Item 2</li></ul>
        </article>
      </body></html>`;

      const { JSDOM } = require('jsdom');
      const dom = new JSDOM(html);

      const stringResult = converter.convertToMarkdown(html);
      const domResult = converter.convertFromDOM(dom.window.document.body);

      // Both should contain the same key content
      expect(stringResult).toContain('Section Title');
      expect(domResult).toContain('Section Title');
      expect(stringResult).toContain('[link](https://example.com)');
      expect(domResult).toContain('[link](https://example.com)');
    });
  });

  describe('applyFormattingOptions', () => {
    test('should change heading style to setext', () => {
      converter.applyFormattingOptions({ headingStyle: 'setext' });
      const html = '<article><h2>My Heading</h2><p>Content that is long enough for the content check threshold.</p></article>';
      const result = converter.convertToMarkdown(html);

      // Setext h2 uses dashes underneath
      expect(result).toContain('My Heading');
      expect(result).toContain('---');
      expect(result).not.toMatch(/^## /m);
    });

    test('should change bullet list marker to asterisk', () => {
      converter.applyFormattingOptions({ bulletListMarker: '*' });
      const html = '<article><ul><li>Alpha</li><li>Beta</li></ul><p>Extra content to meet the content threshold for testing.</p></article>';
      const result = converter.convertToMarkdown(html);

      expect(result).toMatch(/^\* +Alpha/m);
      expect(result).toMatch(/^\* +Beta/m);
    });

    test('should change code block style to indented', () => {
      converter.applyFormattingOptions({ codeBlockStyle: 'indented' });
      const html = '<article><pre><code>const x = 1;</code></pre><p>Enough paragraph content to pass the threshold check.</p></article>';
      const result = converter.convertToMarkdown(html);

      expect(result).toContain('    const x = 1;');
      expect(result).not.toContain('```');
    });

    test('should change link style to referenced', () => {
      converter.applyFormattingOptions({ linkStyle: 'referenced' });
      const html = '<article><p>Visit <a href="https://example.com">Example</a> for more details and content.</p></article>';
      const result = converter.convertToMarkdown(html);

      expect(result).toContain('[Example]');
      expect(result).toContain('https://example.com');
      // Should NOT be inlined
      expect(result).not.toContain('[Example](https://example.com)');
    });

    test('should apply options to fragment service too', () => {
      // Ensure fragment service is initialized first
      converter.convertHtmlFragment('<p>init</p>');

      converter.applyFormattingOptions({ bulletListMarker: '*' });
      const result = converter.convertHtmlFragment('<ul><li>One</li><li>Two</li></ul>');

      expect(result).toMatch(/^\* +One/m);
    });

    test('should handle null options gracefully', () => {
      expect(() => converter.applyFormattingOptions(null)).not.toThrow();
      expect(() => converter.applyFormattingOptions(undefined)).not.toThrow();
    });
  });

  describe('size guard', () => {
    test('convertToMarkdown should handle large HTML without throwing', () => {
      // Create a large HTML string (~1MB, below the 5MB guard)
      const bigContent = '<p>' + 'x'.repeat(100) + '</p>\n';
      const html = '<article>' + bigContent.repeat(10000) + '</article>';

      expect(() => converter.convertToMarkdown(html)).not.toThrow();
    });

    test('convertToMarkdown should truncate HTML over 5MB', () => {
      const warnSpy = jest.spyOn(console, 'warn').mockImplementation();

      // Create HTML just over 5MB
      const bigContent = 'x'.repeat(6 * 1024 * 1024);
      const html = '<article><p>' + bigContent + '</p></article>';

      converter.convertToMarkdown(html);

      expect(warnSpy).toHaveBeenCalledWith(
        expect.stringContaining('HTML too large')
      );

      warnSpy.mockRestore();
    });
  });
}); 