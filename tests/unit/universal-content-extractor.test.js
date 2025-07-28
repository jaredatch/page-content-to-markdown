const UniversalContentExtractor = require('../../src/utils/universal-content-extractor');

// Mock DOM environment for testing
const { JSDOM } = require('jsdom');

describe('Universal Content Extractor - Works on ANY Website', () => {
  let extractor;
  let dom;
  let window;
  let document;

  beforeEach(() => {
    extractor = new UniversalContentExtractor();
    
    // Create a fresh DOM for each test
    dom = new JSDOM('<!DOCTYPE html><html><body></body></html>', {
      url: 'https://example.com',
      pretendToBeVisual: true,
      resources: 'usable'
    });
    
    window = dom.window;
    document = window.document;
    
    // Mock global objects for the extractor
    global.window = window;
    global.document = document;
    global.Node = window.Node;
  });

  afterEach(() => {
    // Clean up global mocks
    delete global.window;
    delete global.document;
    delete global.Node;
  });

  describe('JavaScript-Heavy Single Page Applications', () => {
    test('should extract content from React apps', async () => {
      document.body.innerHTML = `
        <div id="root">
          <div class="App">
            <div class="content-wrapper">
              <h1>React App Article</h1>
              <p>This content was rendered by React and loaded dynamically.</p>
              <p>It includes multiple paragraphs of meaningful content that should be extracted.</p>
            </div>
            <div class="sidebar">
              <button>Click me</button>
              <nav>Home | About | Contact</nav>
            </div>
          </div>
        </div>
      `;

      const result = await extractor.extractContent();

      expect(result.success).toBe(true);
      expect(result.markdown).toContain('# React App Article');
      expect(result.markdown).toContain('This content was rendered by React');
      expect(result.markdown).not.toContain('Click me');
      expect(result.markdown).not.toContain('Home | About | Contact');
    });

    test('should extract content from Vue.js apps', async () => {
      document.body.innerHTML = `
        <div id="app" class="v-application">
          <main class="v-main">
            <div class="container">
              <h2>Vue.js Application</h2>
              <article class="post">
                <p>This is content from a Vue.js application with dynamic rendering.</p>
                <p>The universal extractor should handle this regardless of the framework.</p>
              </article>
            </div>
          </main>
          <nav class="v-navigation">Navigation items</nav>
        </div>
      `;

      const result = await extractor.extractContent();

      expect(result.success).toBe(true);
      expect(result.markdown).toContain('Vue.js Application');
      expect(result.markdown).toContain('content from a Vue.js application');
      expect(result.extractionMethod).toBe('intelligent-filtering');
    });
  });

  describe('Complex E-commerce Sites', () => {
    test('should extract product information from any e-commerce site', async () => {
      document.body.innerHTML = `
        <div class="page-wrapper">
          <header class="site-header">
            <nav>Categories | Cart | Account</nav>
          </header>
          <main class="product-page">
            <h1 class="product-title">Amazing Wireless Headphones</h1>
            <div class="product-description">
              <p>Experience crystal-clear audio with our premium wireless headphones.</p>
              <p>Features include noise cancellation, 30-hour battery life, and premium build quality.</p>
              <ul class="features">
                <li>Active noise cancellation</li>
                <li>30-hour battery life</li>
                <li>Premium materials</li>
              </ul>
            </div>
            <div class="purchase-section">
              <button class="buy-now">Buy Now - $199</button>
              <button class="add-to-cart">Add to Cart</button>
            </div>
          </main>
          <aside class="recommendations">
            <h3>You might also like</h3>
            <div class="product-grid">Related products...</div>
          </aside>
        </div>
      `;

      const result = await extractor.extractContent();

      expect(result.success).toBe(true);
      expect(result.markdown).toContain('Amazing Wireless Headphones');
      expect(result.markdown).toContain('Experience crystal-clear audio');
      expect(result.markdown).toContain('Active noise cancellation');
      expect(result.markdown).not.toContain('Buy Now');
      expect(result.markdown).not.toContain('Add to Cart');
    });
  });

  describe('News and Media Sites', () => {
    test('should extract articles from news sites with complex layouts', async () => {
      document.body.innerHTML = `
        <div class="site-container">
          <header class="site-header">
            <div class="breaking-news-ticker">Breaking: ...</div>
            <nav class="main-nav">World | Politics | Tech | Sports</nav>
          </header>
          <main class="content-area">
            <article class="news-article">
              <h1 class="headline">Major Technology Breakthrough Announced</h1>
              <div class="article-meta">
                <span class="byline">By Tech Reporter</span>
                <span class="timestamp">2 hours ago</span>
              </div>
              <div class="article-body">
                <p class="lead-paragraph">Scientists have announced a groundbreaking discovery that could revolutionize technology.</p>
                <p>The research team at the university has been working on this project for several years.</p>
                <p>This breakthrough has significant implications for the future of the industry.</p>
                <blockquote>
                  "This is a game-changing moment for our field," said the lead researcher.
                </blockquote>
              </div>
            </article>
          </main>
          <aside class="sidebar">
            <div class="trending">Trending Now</div>
            <div class="newsletter-signup">Subscribe to our newsletter</div>
          </aside>
        </div>
      `;

      const result = await extractor.extractContent();

      expect(result.success).toBe(true);
      expect(result.markdown).toContain('Major Technology Breakthrough');
      expect(result.markdown).toContain('Scientists have announced');
      expect(result.markdown).toContain('game-changing moment');
      expect(result.markdown).not.toContain('Subscribe to our newsletter');
      expect(result.markdown).not.toContain('Trending Now');
    });
  });

  describe('Social Media and Forum Sites', () => {
    test('should extract meaningful content from social media posts', async () => {
      document.body.innerHTML = `
        <div class="social-feed">
          <div class="post" data-post-id="123">
            <div class="post-header">
              <img class="avatar" src="avatar.jpg" alt="User Avatar">
              <span class="username">@techuser</span>
              <span class="timestamp">3h</span>
            </div>
            <div class="post-content">
              <p>Just discovered this amazing new JavaScript framework that makes development so much easier!</p>
              <p>The documentation is excellent and the community is very supportive. Highly recommend checking it out.</p>
              <p>Here's what I've learned so far about its key features and benefits.</p>
            </div>
            <div class="engagement-actions">
              <button class="like-btn">❤️ 42</button>
              <button class="share-btn">🔄 12</button>
              <button class="comment-btn">💬 8</button>
            </div>
          </div>
        </div>
      `;

      const result = await extractor.extractContent();

      expect(result.success).toBe(true);
      expect(result.markdown).toContain('amazing new JavaScript framework');
      expect(result.markdown).toContain('documentation is excellent');
      expect(result.markdown).not.toContain('❤️ 42');
      expect(result.markdown).not.toContain('🔄 12');
    });
  });

  describe('Documentation and Technical Sites', () => {
    test('should preserve code examples and technical content', async () => {
      document.body.innerHTML = `
        <div class="docs-container">
          <nav class="docs-nav">
            <ul>
              <li><a href="#intro">Introduction</a></li>
              <li><a href="#api">API Reference</a></li>
            </ul>
          </nav>
          <main class="docs-content">
            <h1>API Documentation</h1>
            <section id="intro">
              <h2>Introduction</h2>
              <p>Welcome to our comprehensive API documentation.</p>
              <p>This guide will help you integrate our services into your application.</p>
            </section>
            <section id="example">
              <h3>Code Example</h3>
              <pre><code>
                const api = new APIClient('your-api-key');
                const response = await api.getData();
                console.log(response.data);
              </code></pre>
              <p>This example shows how to make a basic API call.</p>
            </section>
          </main>
        </div>
      `;

      const result = await extractor.extractContent();

      expect(result.success).toBe(true);
      expect(result.markdown).toContain('# API Documentation');
      expect(result.markdown).toContain('Welcome to our comprehensive');
      expect(result.markdown).toContain('const api = new APIClient');
      expect(result.markdown).not.toContain('Introduction</a>');
    });
  });

  describe('Fallback Extraction for ANY Site', () => {
    test('should extract ALL visible text when smart filtering fails', async () => {
      // Create a complex, unstructured page that would break traditional parsing
      document.body.innerHTML = `
        <div class="weird-layout">
          <span>Important content split</span>
          <div style="display: none;">Hidden content should not appear</div>
          <span> across multiple elements</span>
          <p>More important information here.</p>
          <div class="unknown-structure">
            <b>Critical details</b> mixed with other text.
          </div>
        </div>
      `;

      // Force fallback by making content blocks score poorly
      const result = await extractor.extractContent();

      expect(result.success).toBe(true);
      // Should contain all visible text even if structure is weird
      expect(result.markdown).toContain('Important content');
      expect(result.markdown).toContain('More important information');
      expect(result.markdown).toContain('Critical details');
      expect(result.markdown).not.toContain('Hidden content should not appear');
    });

    test('should handle completely broken HTML gracefully', async () => {
      // Malformed HTML that would break traditional parsers
      document.body.innerHTML = `
        <div><p>Unclosed paragraph
        <span>Nested span without closing
        <h1>Heading in weird place</h1>
        Text with no wrapper at all
        <button>Random button</p>
        More loose text content here
      `;

      const result = await extractor.extractContent();

      expect(result.success).toBe(true);
      expect(result.markdown.length).toBeGreaterThan(10);
      // Should extract something useful even from broken HTML
      expect(result.markdown).toContain('Heading in weird place');
    });

    test('should extract content from sites with heavy JavaScript obfuscation', async () => {
      // Simulate content that would be hidden in complex structures
      document.body.innerHTML = `
        <div id="app-root">
          <div data-reactroot="">
            <div class="css-1234567">
              <div class="component-wrapper" data-testid="content">
                <h1 class="title-component">JavaScript Heavy Site</h1>
                <div class="text-content-wrapper">
                  <p class="paragraph-component">This content is heavily wrapped in framework components.</p>
                  <p class="paragraph-component">But the universal extractor should still find it.</p>
                </div>
              </div>
            </div>
          </div>
        </div>
      `;

      const result = await extractor.extractContent();

      expect(result.success).toBe(true);
      expect(result.markdown).toContain('JavaScript Heavy Site');
      expect(result.markdown).toContain('heavily wrapped in framework');
      expect(result.markdown).toContain('universal extractor should still find');
    });
  });

  describe('Performance with Large Sites', () => {
    test('should handle very large pages without timeout', async () => {
      // Create a large page with thousands of elements
      const largeContent = Array(500).fill(0).map((_, i) => `
        <div class="section-${i}">
          <h3>Section ${i}</h3>
          <p>This is content for section ${i} with substantial text that represents real-world content.</p>
          <p>Additional paragraph for section ${i} to make it more realistic.</p>
        </div>
      `).join('');

      document.body.innerHTML = `<main>${largeContent}</main>`;

      const startTime = Date.now();
      const result = await extractor.extractContent();
      const endTime = Date.now();

      expect(result.success).toBe(true);
      expect(endTime - startTime).toBeLessThan(5000); // Should complete within 5 seconds
      expect(result.markdown).toContain('Section 0');
      expect(result.markdown).toContain('Section 499');
    });
  });

  describe('International Content', () => {
    test('should handle any language and character set', async () => {
      document.body.innerHTML = `
        <article>
          <h1>多语言内容测试 - Multilingual Content Test</h1>
          <p>This page contains content in multiple languages: English, 中文, العربية, русский, हिंदी, 日本語.</p>
          <p>العربية: هذا محتوى باللغة العربية من اليمين إلى اليسار.</p>
          <p>中文：这是中文内容，应该能够正确提取。</p>
          <p>हिंदी: यह हिंदी में सामग्री है जो निकाली जानी चाहिए।</p>
          <p>日本語：これは日本語のコンテンツです。</p>
          <p>Русский: Это содержимое на русском языке.</p>
        </article>
      `;

      const result = await extractor.extractContent();

      expect(result.success).toBe(true);
      expect(result.markdown).toContain('多语言内容测试');
      expect(result.markdown).toContain('هذا محتوى باللغة العربية');
      expect(result.markdown).toContain('这是中文内容');
      expect(result.markdown).toContain('यह हिंदी में सामग्री');
      expect(result.markdown).toContain('これは日本語のコンテンツ');
      expect(result.markdown).toContain('Это содержимое на русском');
    });
  });

  describe('Edge Cases and Stress Tests', () => {
    test('should work with minimal content', async () => {
      document.body.innerHTML = `<p>Just one sentence.</p>`;

      const result = await extractor.extractContent();

      expect(result.success).toBe(true);
      expect(result.markdown).toContain('Just one sentence');
    });

    test('should work with only images and minimal text', async () => {
      document.body.innerHTML = `
        <div>
          <img src="image1.jpg" alt="Description of image 1">
          <img src="image2.jpg" alt="Description of image 2">
          <p>Short caption.</p>
        </div>
      `;

      const result = await extractor.extractContent();

      expect(result.success).toBe(true);
      expect(result.markdown.length).toBeGreaterThan(0);
    });

    test('should provide fallback even for completely empty pages', async () => {
      document.body.innerHTML = `<div></div>`;

      const result = await extractor.extractContent();

      expect(result.success).toBe(true);
      expect(result.extractionMethod).toBe('fallback-all-text');
    });
  });

  describe('Real-World Compatibility Guarantee', () => {
    test('GUARANTEE: Should never completely fail to extract SOMETHING', async () => {
      // Test 10 different challenging scenarios
      const challengingLayouts = [
        `<div class="app"><span>Hidden</span> content <b>everywhere</b></div>`,
        `<table><tr><td>Table content</td><td>More content</td></tr></table>`,
        `<main><article><section><div><p>Deeply nested</p></div></section></article></main>`,
        `<!-- Comment --><script>var x = 1;</script><style>.hidden{display:none}</style><p>Real content</p>`,
        `<div style="display:none">Hidden</div><div>Visible content here</div>`,
        `<p>Start</p><img src="test.jpg" alt="Alt text"><p>End</p>`,
        `<div class="container"><div class="row"><div class="col">Nested framework content</div></div></div>`,
        `<header>Header</header><nav>Nav</nav><main>Main content</main><footer>Footer</footer>`,
        `<span>A</span><span>B</span><span>C</span><p>Real paragraph content here</p>`,
        `<div data-component="weird">Strange structure with <em>meaningful</em> content</div>`
      ];

      for (const layout of challengingLayouts) {
        document.body.innerHTML = layout;
        const result = await extractor.extractContent();
        
        // GUARANTEE: Never complete failure
        expect(result.success).toBe(true);
        expect(result.markdown.length).toBeGreaterThan(0);
      }
    });
  });
}); 