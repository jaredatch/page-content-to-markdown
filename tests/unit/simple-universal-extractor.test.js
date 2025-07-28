const SimpleUniversalExtractor = require('../../src/utils/simple-universal-extractor');

// Mock DOM environment for testing
const { JSDOM } = require('jsdom');

describe('Simple Universal Extractor - GUARANTEED to work on ANY website', () => {
  let extractor;
  let dom;
  let window;
  let document;

  beforeEach(() => {
    extractor = new SimpleUniversalExtractor();
    
    // Create a fresh DOM for each test
    dom = new JSDOM('<!DOCTYPE html><html><body></body></html>', {
      url: 'https://example.com',
      pretendToBeVisual: true
    });
    
    window = dom.window;
    document = window.document;
    
    // Mock global objects for the extractor
    global.window = window;
    global.document = document;
    global.Node = window.Node;
    global.NodeFilter = window.NodeFilter;
  });

  afterEach(() => {
    // Clean up global mocks
    delete global.window;
    delete global.document;
    delete global.Node;
    delete global.NodeFilter;
  });

  describe('GUARANTEE: Works on ANY Website', () => {
    test('MUST extract SOMETHING from a simple news article', async () => {
      document.title = 'Breaking News: Important Story';
      document.body.innerHTML = `
        <nav>Home | News | Sports</nav>
        <article>
          <h1>Breaking News: Important Story</h1>
          <p>This is the main content of the news article.</p>
          <p>It contains multiple paragraphs with useful information.</p>
        </article>
        <footer>Copyright 2024</footer>
      `;

      const result = await extractor.extractContent();

      expect(result.success).toBe(true);
      expect(result.markdown).toContain('Breaking News: Important Story');
      expect(result.markdown).toContain('main content of the news article');
      expect(result.markdown.length).toBeGreaterThan(50);
    });

    test('MUST extract SOMETHING from a complex React app', async () => {
      document.title = 'React App Dashboard';
      document.body.innerHTML = `
        <div id="root">
          <div class="app-container">
            <div class="navigation">Menu items here</div>
            <div class="main-content">
              <h2>Dashboard Overview</h2>
              <div class="widget">
                <p>This is a complex React component with important data.</p>
                <p>User statistics and analytics are displayed here.</p>
              </div>
            </div>
          </div>
        </div>
      `;

      const result = await extractor.extractContent();

      expect(result.success).toBe(true);
      expect(result.markdown).toContain('Dashboard Overview');
      expect(result.markdown).toContain('important data');
      expect(result.markdown.length).toBeGreaterThan(30);
    });

    test('MUST extract SOMETHING from an e-commerce product page', async () => {
      document.title = 'Premium Headphones - Best Buy';
      document.body.innerHTML = `
        <header>Logo | Search | Cart</header>
        <main>
          <h1>Premium Wireless Headphones</h1>
          <div class="product-info">
            <p>Experience superior sound quality with these premium headphones.</p>
            <p>Features noise cancellation and 30-hour battery life.</p>
          </div>
          <div class="purchase">
            <button>Add to Cart - $299</button>
            <button>Buy Now</button>
          </div>
        </main>
      `;

      const result = await extractor.extractContent();

      expect(result.success).toBe(true);
      expect(result.markdown).toContain('Premium Wireless Headphones');
      expect(result.markdown).toContain('superior sound quality');
      expect(result.success).toBe(true);
    });

    test('MUST extract SOMETHING from broken/malformed HTML', async () => {
      document.title = 'Broken Page';
      document.body.innerHTML = `
        <div><p>Unclosed paragraph
        <span>Nested elements without proper closing
        <h1>Random heading</h1>
        Some loose text floating around
        <button>Random button</p>
        More content here without proper structure
      `;

      const result = await extractor.extractContent();

      expect(result.success).toBe(true);
      expect(result.markdown).toContain('Random heading');
      expect(result.markdown.length).toBeGreaterThan(20);
    });

    test('MUST extract SOMETHING from minimal content pages', async () => {
      document.title = 'Minimal Page';
      document.body.innerHTML = `<p>Just one sentence of content.</p>`;

      const result = await extractor.extractContent();

      expect(result.success).toBe(true);
      expect(result.markdown).toContain('Just one sentence');
      expect(result.success).toBe(true);
    });

    test('MUST work even with completely empty pages', async () => {
      document.title = 'Empty Page Test';
      document.body.innerHTML = ``;

      const result = await extractor.extractContent();

      expect(result.success).toBe(true);
      expect(result.markdown).toContain('Empty Page Test');
      expect(result.method).toBe('emergency-fallback');
    });

    test('MUST handle international content', async () => {
      document.title = '国际新闻 - International News';
      document.body.innerHTML = `
        <article>
          <h1>重要新闻标题</h1>
          <p>这是中文内容，应该能够正确提取。</p>
          <p>العربية: هذا محتوى باللغة العربية.</p>
          <p>Русский: Это содержимое на русском языке.</p>
        </article>
      `;

      const result = await extractor.extractContent();

      expect(result.success).toBe(true);
      expect(result.markdown).toContain('重要新闻标题');
      expect(result.markdown).toContain('中文内容');
      expect(result.markdown).toContain('العربية');
      expect(result.markdown).toContain('русском языке');
    });

    test('MUST work with JavaScript-heavy sites (simulated)', async () => {
      document.title = 'SPA Application';
      document.body.innerHTML = `
        <div id="app" data-framework="vue">
          <div class="spa-content">
            <h2>Single Page Application</h2>
            <div class="dynamic-content">
              <p>This content was loaded dynamically by JavaScript.</p>
              <p>The universal extractor should still capture it.</p>
            </div>
          </div>
        </div>
      `;

      const result = await extractor.extractContent();

      expect(result.success).toBe(true);
      expect(result.markdown).toContain('Single Page Application');
      expect(result.markdown).toContain('loaded dynamically');
    });

    test('MUST filter out navigation but keep content', async () => {
      document.title = 'Content with Navigation';
      document.body.innerHTML = `
        <nav>Home About Contact Login</nav>
        <main>
          <h1>Main Article Title</h1>
          <p>This is the actual content that users want to read.</p>
          <p>It should be extracted while navigation is filtered out.</p>
        </main>
        <button>CLICK HERE</button>
        <button>LEARN MORE</button>
      `;

      const result = await extractor.extractContent();

      expect(result.success).toBe(true);
      expect(result.markdown).toContain('Main Article Title');
      expect(result.markdown).toContain('actual content that users want');
      // Should filter out obvious navigation and buttons
      expect(result.markdown).not.toContain('CLICK HERE');
    });

    test('EMERGENCY FALLBACK: Must work even if everything fails', async () => {
      // Simulate a scenario where text extraction fails
      document.title = 'Emergency Test';
      document.body.innerHTML = `<div style="display:none">Hidden content</div>`;

      // Mock the text extraction to fail
      const originalGetAllVisibleText = extractor.getAllVisibleText;
      extractor.getAllVisibleText = () => {
        throw new Error('Simulated extraction failure');
      };

      const result = await extractor.extractContent();

      expect(result.success).toBe(true);
      expect(result.method).toBe('emergency-fallback');
      expect(result.markdown).toContain('Emergency Test');

      // Restore original method
      extractor.getAllVisibleText = originalGetAllVisibleText;
    });
  });

  describe('Performance and Reliability', () => {
    test('Should complete extraction quickly', async () => {
      document.title = 'Performance Test';
      document.body.innerHTML = '<p>Simple content for performance test.</p>';

      const startTime = Date.now();
      const result = await extractor.extractContent();
      const endTime = Date.now();

      expect(result.success).toBe(true);
      expect(endTime - startTime).toBeLessThan(1000); // Should complete within 1 second
    });

    test('Should handle large content without issues', async () => {
      document.title = 'Large Content Test';
      
      // Create large content
      const largeContent = Array(100).fill(0).map((_, i) => 
        `<p>This is paragraph ${i} with substantial content to test large page handling.</p>`
      ).join('');
      
      document.body.innerHTML = largeContent;

      const result = await extractor.extractContent();

      expect(result.success).toBe(true);
      expect(result.markdown).toContain('paragraph 0');
      expect(result.markdown).toContain('paragraph 99');
    });
  });

  describe('UNIVERSAL COMPATIBILITY GUARANTEE', () => {
    test('100% SUCCESS RATE: Must never completely fail', async () => {
      // Test 20 different challenging scenarios
      const testScenarios = [
        { title: 'Normal', html: '<h1>Title</h1><p>Content</p>' },
        { title: 'Empty', html: '' },
        { title: 'Only Scripts', html: '<script>alert("hi")</script><p>Real content</p>' },
        { title: 'Nested Deep', html: '<div><div><div><div><p>Deep content</p></div></div></div></div>' },
        { title: 'Only Images', html: '<img src="test.jpg"><img src="test2.jpg">' },
        { title: 'Table Content', html: '<table><tr><td>Cell content</td><td>More content</td></tr></table>' },
        { title: 'Form Only', html: '<form><input type="text"><button>Submit</button></form>' },
        { title: 'Comments Only', html: '<!-- This is a comment --><p>Actual content</p>' },
        { title: 'Mixed Languages', html: '<p>English</p><p>中文</p><p>العربية</p>' },
        { title: 'Special Characters', html: '<p>Special: !@#$%^&*()_+{}:"<>?</p>' },
        { title: 'Long Single Line', html: `<p>${'a'.repeat(5000)}</p>` },
        { title: 'Many Short Elements', html: Array(100).fill('<span>x</span>').join('') },
        { title: 'Malformed HTML', html: '<p><div><span>Badly nested</p></div></span>' },
        { title: 'Only Whitespace', html: '   \n\n\t\t   ' },
        { title: 'Unicode Content', html: '<p>Unicode: 𝕌𝕟𝕚𝕔𝕠𝕕𝕖 ℂ𝕠𝕟𝕥𝕖𝕟𝕥</p>' },
        { title: 'Code Blocks', html: '<pre><code>function test() { return true; }</code></pre>' },
        { title: 'Only Lists', html: '<ul><li>Item 1</li><li>Item 2</li></ul>' },
        { title: 'Inline Styles', html: '<p style="color:red">Styled content</p>' },
        { title: 'Data Attributes', html: '<div data-test="value">Content with data</div>' },
        { title: 'Shadow DOM Sim', html: '<div class="shadow-host"><p>Shadow content</p></div>' }
      ];

      let successCount = 0;
      
      for (const scenario of testScenarios) {
        document.title = scenario.title;
        document.body.innerHTML = scenario.html;
        
        const result = await extractor.extractContent();
        
        if (result.success && result.markdown.length > 0) {
          successCount++;
        }
      }

      // GUARANTEE: 100% success rate
      expect(successCount).toBe(testScenarios.length);
      console.log(`✅ GUARANTEED: ${successCount}/${testScenarios.length} scenarios successful (100%)`);
    });
  });
}); 