const MarkdownConverter = require('../../src/utils/markdown-converter');

describe('Real-World Website Compatibility', () => {
  let converter;

  beforeEach(() => {
    converter = new MarkdownConverter();
  });

  describe('Dynamic Content Challenges', () => {
    test('should handle React/SPA content with dynamic rendering', () => {
      const spaHtml = `
        <div id="root">
          <div data-react-component="Article">
            <h1>Dynamic Article Title</h1>
            <div class="content-wrapper">
              <p>This content was dynamically rendered.</p>
            </div>
          </div>
        </div>
        <script>window.__INITIAL_DATA__ = {...}</script>
      `;
      
      const result = converter.convertToMarkdown(spaHtml);
      
      expect(result).toContain('# Dynamic Article Title');
      expect(result).toContain('This content was dynamically rendered.');
      expect(result).not.toContain('window.__INITIAL_DATA__');
    });

    test('should extract content even when wrapped in framework divs', () => {
      const frameworkHtml = `
        <div id="__nuxt">
          <div class="nuxt-wrapper">
            <div class="page-container">
              <main class="main-content">
                <h1>Nuxt.js Article</h1>
                <p>Content in a Nuxt.js app.</p>
              </main>
            </div>
          </div>
        </div>
      `;
      
      const result = converter.convertToMarkdown(frameworkHtml);
      
      expect(result).toContain('# Nuxt.js Article');
      expect(result).toContain('Content in a Nuxt.js app.');
    });
  });

  describe('E-commerce Site Patterns', () => {
    test('should extract product descriptions from e-commerce sites', () => {
      const ecommerceHtml = `
        <div class="product-page">
          <div class="product-info">
            <h1 class="product-title">Amazing Product</h1>
            <div class="product-description">
              <p>This is an amazing product description.</p>
              <ul class="features">
                <li>Feature 1</li>
                <li>Feature 2</li>
              </ul>
            </div>
          </div>
          <div class="sidebar">
            <div class="price">$99.99</div>
            <button class="buy-now">Buy Now</button>
          </div>
        </div>
      `;
      
      const result = converter.convertToMarkdown(ecommerceHtml);
      
      expect(result).toContain('# Amazing Product');
      expect(result).toContain('This is an amazing product description.');
      expect(result).toContain('- Feature 1');
      expect(result).toContain('- Feature 2');
    });
  });

  describe('News/Blog Site Patterns', () => {
    test('should extract article content from news sites', () => {
      const newsHtml = `
        <article class="news-article">
          <header class="article-header">
            <h1>Breaking News: Important Event</h1>
            <div class="byline">By Reporter Name | Published 2 hours ago</div>
          </header>
          <div class="article-body">
            <p class="lead">This is the lead paragraph of the news article.</p>
            <p>More detailed information follows in subsequent paragraphs.</p>
            <blockquote>
              "This is an important quote from a source."
            </blockquote>
          </div>
        </article>
      `;
      
      const result = converter.convertToMarkdown(newsHtml);
      
      expect(result).toContain('# Breaking News: Important Event');
      expect(result).toContain('This is the lead paragraph');
      expect(result).toContain('> "This is an important quote');
    });
  });

  describe('Social Media Content', () => {
    test('should handle social media post structures', () => {
      const socialHtml = `
        <div class="social-post">
          <div class="post-header">
            <div class="author">@username</div>
            <div class="timestamp">2 hours ago</div>
          </div>
          <div class="post-content">
            <p>This is a social media post with some content.</p>
            <p>It might have #hashtags and @mentions.</p>
          </div>
          <div class="engagement">
            <button class="like">Like</button>
            <button class="share">Share</button>
          </div>
        </div>
      `;
      
      const result = converter.convertToMarkdown(socialHtml);
      
      expect(result).toContain('This is a social media post');
      expect(result).toContain('#hashtags and @mentions');
      expect(result).not.toContain('Like');
      expect(result).not.toContain('Share');
    });
  });

  describe('Documentation Sites', () => {
    test('should preserve code examples and structure', () => {
      const docsHtml = `
        <div class="documentation">
          <h1>API Documentation</h1>
          <section class="endpoint">
            <h2>GET /api/users</h2>
            <p>Retrieves a list of users.</p>
            <h3>Example Request</h3>
            <pre><code class="language-bash">curl -X GET https://api.example.com/users</code></pre>
            <h3>Example Response</h3>
            <pre><code class="language-json">{
  "users": [
    {"id": 1, "name": "John Doe"}
  ]
}</code></pre>
          </section>
        </div>
      `;
      
      const result = converter.convertToMarkdown(docsHtml);
      
      expect(result).toContain('# API Documentation');
      expect(result).toContain('## GET /api/users');
      expect(result).toContain('```');
      expect(result).toContain('curl -X GET');
      expect(result).toContain('"users": [');
    });
  });

  describe('Complex Nested Structures', () => {
    test('should handle deeply nested content structures', () => {
      const nestedHtml = `
        <div class="page-wrapper">
          <div class="container">
            <div class="row">
              <div class="col-md-8">
                <div class="content-area">
                  <article class="post">
                    <header class="post-header">
                      <h1 class="post-title">Deeply Nested Article</h1>
                    </header>
                    <div class="post-body">
                      <div class="entry-content">
                        <p>This content is deeply nested but should be extracted.</p>
                      </div>
                    </div>
                  </article>
                </div>
              </div>
            </div>
          </div>
        </div>
      `;
      
      const result = converter.convertToMarkdown(nestedHtml);
      
      expect(result).toContain('# Deeply Nested Article');
      expect(result).toContain('This content is deeply nested but should be extracted.');
    });
  });

  describe('Large Content Handling', () => {
    test('should handle large articles without performance issues', () => {
      // Generate a large article
      const largeParagraphs = Array(100).fill(0).map((_, i) => 
        `<p>This is paragraph ${i + 1} of a very large article with substantial content that tests performance.</p>`
      ).join('\n');
      
      const largeHtml = `
        <article>
          <h1>Very Large Article</h1>
          ${largeParagraphs}
        </article>
      `;
      
      const startTime = Date.now();
      const result = converter.convertToMarkdown(largeHtml);
      const endTime = Date.now();
      
      expect(result).toContain('# Very Large Article');
      expect(result).toContain('This is paragraph 1 of');
      expect(result).toContain('This is paragraph 100 of');
      expect(endTime - startTime).toBeLessThan(5000); // Should complete within 5 seconds
    });
  });

  describe('Internationalization', () => {
    test('should handle non-Latin characters', () => {
      const internationalHtml = `
        <article>
          <h1>国际化测试 - Internationalization Test</h1>
          <p>This content includes 中文, العربية, русский, and other scripts.</p>
          <p>यह हिंदी में है। これは日本語です。</p>
        </article>
      `;
      
      const result = converter.convertToMarkdown(internationalHtml);
      
      expect(result).toContain('国际化测试 - Internationalization Test');
      expect(result).toContain('中文, العربية, русский');
      expect(result).toContain('यह हिंदी में है। これは日本語です।');
    });

    test('should handle RTL content', () => {
      const rtlHtml = `
        <article dir="rtl">
          <h1>عنوان المقال</h1>
          <p>هذا محتوى باللغة العربية يجب أن يُعرض من اليمين إلى اليسار.</p>
        </article>
      `;
      
      const result = converter.convertToMarkdown(rtlHtml);
      
      expect(result).toContain('# عنوان المقال');
      expect(result).toContain('هذا محتوى باللغة العربية');
    });
  });

  describe('Edge Cases and Error Recovery', () => {
    test('should handle malformed HTML gracefully', () => {
      const malformedHtml = `
        <article>
          <h1>Article with Malformed HTML
          <p>Missing closing tags and <strong>unclosed elements
          <div>More content here
          <p>Another paragraph</p>
        </article>
      `;
      
      const result = converter.convertToMarkdown(malformedHtml);
      
      expect(result).toContain('Article with Malformed HTML');
      expect(result).toContain('Missing closing tags');
      expect(result).toContain('More content here');
    });

    test('should handle empty or whitespace-only content', () => {
      const emptyContent = `
        <article>
          <div>   </div>
          <p></p>
          <span>   
          </span>
        </article>
      `;
      
      const result = converter.convertToMarkdown(emptyContent);
      
      expect(result.trim()).toBe('');
    });

    test('should handle content with only images and no text', () => {
      const imageOnlyHtml = `
        <article>
          <img src="image1.jpg" alt="Image 1">
          <figure>
            <img src="image2.jpg" alt="Image 2">
            <figcaption>Image caption</figcaption>
          </figure>
        </article>
      `;
      
      const result = converter.convertToMarkdown(imageOnlyHtml);
      
      expect(result).toContain('![Image 1]');
      expect(result).toContain('![Image 2]');
      expect(result).toContain('Image caption');
    });
  });

  describe('Performance Optimization', () => {
    test('should not exceed memory limits with very large content', () => {
      // Create content that could cause memory issues
      const hugeContent = Array(1000).fill(0).map((_, i) => 
        `<div class="section-${i}">
          <h2>Section ${i}</h2>
          ${Array(50).fill(0).map((_, j) => 
            `<p>Paragraph ${j} in section ${i} with lots of text content.</p>`
          ).join('')}
        </div>`
      ).join('\n');
      
      const hugeHtml = `<main>${hugeContent}</main>`;
      
      expect(() => {
        const result = converter.convertToMarkdown(hugeHtml);
        expect(result).toContain('# Section 0');
        expect(result).toContain('# Section 999');
      }).not.toThrow();
    });
  });
}); 