const fs = require('fs');
const path = require('path');
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

      expect(result).toContain('This is an amazing product description.');
      expect(result).toMatch(/- +Feature 1/);
      expect(result).toMatch(/- +Feature 2/);
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

      expect(result).toContain('information follows in subsequent paragraphs');
      expect(result).toContain('"This is an important quote');
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
                        <p>This content is deeply nested but should be extracted. Real article prose has multi-clause sentences with enough body weight to anchor the significance threshold.</p>
                        <p>A second paragraph carries the kind of density that distinguishes real article bodies from card grids and link lists nested inside framework wrappers.</p>
                        <p>A third paragraph rounds out the fixture so it clears the three-paragraph + five-hundred-character gate used to reject related-card stubs.</p>
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
      
      expect(result).toContain('Deeply Nested Article');
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
      expect(result).toContain('यह हिंदी में है। これは日本語です。');
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
        expect(result).toContain('## Section 0');
        expect(result).toContain('## Section 999');
      }).not.toThrow();
    });
  });

  // Regression coverage against real captures of sites that triggered
  // bugs catalogued in private/dev/PHASE-1-FINDINGS.md. Captures live in
  // private/captures/<host>/ and are gitignored, so tests skip cleanly
  // when run without local fixtures.
  describe('regression: captured pages', () => {
    const captureDir = path.join(__dirname, '..', '..', 'private', 'captures');

    const vergeCapture = path.join(
      captureDir, 'theverge.com', 'cap_1778533795840_gj302q.html'
    );
    const techcrunchCapture = path.join(
      captureDir, 'techcrunch.com', 'cap_1778533822205_j35t64.html'
    );
    const mashableCapture = path.join(
      captureDir, 'mashable.com', 'cap_1778533836791_p3pvq1.html'
    );
    const tomsguideCapture = path.join(
      captureDir, 'tomsguide.com', 'cap_1778533856533_1lwqcs.html'
    );
    const substackCapture = path.join(
      captureDir, 'thisweekinai.ai', 'cap_1778533871290_md3hdz.html'
    );

    // Bug C — Verge: first-article-wins picked a related-cards stub
    // instead of the story body. Output was 0 chars on master.
    (fs.existsSync(vergeCapture) ? test : test.skip)(
      'theverge.com — picks the story body, not the related-cards stub (Bug C)',
      () => {
        const html = fs.readFileSync(vergeCapture, 'utf8');
        const result = converter.convertToMarkdown(html);

        expect(result.length).toBeGreaterThan(1000);
        expect(result).toContain(
          'Canvas is online again after ShinyHunters threaten to leak schools'
        );
        expect(result).toContain(
          'A massive outage of the learning platform started with a ransom message'
        );
      }
    );

    // Bug B — TechCrunch: affiliate disclosure + author-card bio leak
    // into the article body. Real lede should survive.
    (fs.existsSync(techcrunchCapture) ? test : test.skip)(
      'techcrunch.com — strips affiliate disclosure and author bio card (Bug B)',
      () => {
        const html = fs.readFileSync(techcrunchCapture, 'utf8');
        const result = converter.convertToMarkdown(html);

        expect(result).toContain('When Anthropic unveiled its new Mythos model');
        expect(result).not.toContain('When you purchase through links in our articles');
        expect(result).not.toContain('Russell Brandom has been covering the tech industry');
      }
    );

    // Bug B — Mashable: trailing FAQ wrapper (id=frequently-asked-questions)
    // ships through. Real body content should survive.
    (fs.existsSync(mashableCapture) ? test : test.skip)(
      'mashable.com — strips the trailing FAQ section (Bug B)',
      () => {
        const html = fs.readFileSync(mashableCapture, 'utf8');
        const result = converter.convertToMarkdown(html);

        expect(result).toContain('Nintendo Switch 2');
        expect(result).not.toContain('Frequently Asked Questions');
      }
    );

    // Bug B — Tom's Guide: slice-author-bio container leaks the bio
    // block. Real body content should survive.
    (fs.existsSync(tomsguideCapture) ? test : test.skip)(
      "tomsguide.com — strips the author bio slice (Bug B)",
      () => {
        const html = fs.readFileSync(tomsguideCapture, 'utf8');
        const result = converter.convertToMarkdown(html);

        expect(result).toContain('$50 price hike for Switch 2');
        expect(result).not.toContain("Tom is the Tom's Guide's UK Phones Editor");
      }
    );

    // Bug B — Substack (thisweekinai.ai): subscribe widget +
    // "Already have an account" sign-in chrome leaks. Real post body
    // should survive.
    (fs.existsSync(substackCapture) ? test : test.skip)(
      'thisweekinai.ai (Substack) — strips subscribe widget chrome (Bug B)',
      () => {
        const html = fs.readFileSync(substackCapture, 'utf8');
        const result = converter.convertToMarkdown(html);

        expect(result).toContain('the template I use for global instructions');
        expect(result).not.toContain('By subscribing, you agree');
        expect(result).not.toContain('Already have an account? Sign in');
      }
    );
  });
}); 