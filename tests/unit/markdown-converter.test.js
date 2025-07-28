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
      expect(result).toContain('- Item 1');
      expect(result).toContain('- Item 2');
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
          <p>Article content</p>
        </article>
        <sidebar>Sidebar</sidebar>
      `;
      const result = converter.extractMainContent(html);
      
      expect(result).toContain('Article Title');
      expect(result).toContain('Article content');
      expect(result).not.toContain('Header');
      expect(result).not.toContain('Sidebar');
    });

    test('should extract content from main tags', () => {
      const html = `
        <nav>Navigation</nav>
        <main>
          <h1>Main Title</h1>
          <p>Main content</p>
        </main>
        <footer>Footer</footer>
      `;
      const result = converter.extractMainContent(html);
      
      expect(result).toContain('Main Title');
      expect(result).toContain('Main content');
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
}); 