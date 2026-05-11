const MarkdownConverter = require('../../src/utils/markdown-converter');

describe('MarkdownConverter trace plumbing', () => {
  describe('content-discovery tiers (extractMainContent — string path)', () => {
    test('records content-selector tier when an article matches', () => {
      const trace = {};
      const converter = new MarkdownConverter({ trace });
      converter.convertToMarkdown(`
        <html><body>
          <article>
            <h1>Headline</h1>
            <p>First paragraph of body prose with enough length to anchor the significance threshold — multi-clause sentence, real article texture, clearly not boilerplate or navigation chrome.</p>
            <p>Second paragraph continuing the body of the piece with additional context, more substantial sentences, and the kind of paragraph density that distinguishes a real article body from a card grid.</p>
            <p>Third paragraph rounding out the body so the fixture clears the threshold of three paragraphs and five hundred characters of trimmed text content.</p>
          </article>
        </body></html>
      `);
      expect(trace.contentDiscovery.tier).toBe('content-selector');
      expect(trace.contentDiscovery.winningSelector).toBe('article');
      const triedArticle = trace.contentDiscovery.tried.find(t => t.selector === 'article');
      expect(triedArticle).toEqual({ selector: 'article', result: 'matched-significant' });
      // Selectors after the winner are listed as not-yet-tried — preserves
      // the full ordered candidate list for downstream visualization.
      expect(trace.contentDiscovery.tried.some(t => t.result === 'skipped-not-yet-tried')).toBe(true);
    });

    test('records no-match for selectors that find nothing before the winner', () => {
      const trace = {};
      const converter = new MarkdownConverter({ trace });
      converter.convertToMarkdown(`
        <html><body>
          <main>
            <h1>Headline</h1>
            <p>First paragraph of substantial main-element content meant to clear the new significance threshold of three paragraphs plus five hundred characters of trimmed text content.</p>
            <p>Second paragraph adding the kind of body weight that real articles carry — multi-clause sentences, more than a card grid headline or sidebar link list could ever produce on its own.</p>
            <p>Third paragraph rounding the fixture out so the main element comfortably clears the trimmed-text length floor and wins as the content selector tier in the trace.</p>
          </main>
        </body></html>
      `);
      expect(trace.contentDiscovery.winningSelector).toBe('main');
      const articleEntry = trace.contentDiscovery.tried.find(t => t.selector === 'article');
      expect(articleEntry.result).toBe('no-match');
    });

    test('records largest-text-block tier when no semantic selector matches', () => {
      const trace = {};
      const converter = new MarkdownConverter({ trace });
      const para = '<p>This block has substantial prose content meant to win on size alone since none of the semantic content selectors apply.</p>';
      converter.convertToMarkdown(`
        <html><body>
          <div>${para.repeat(20)}</div>
        </body></html>
      `);
      expect(trace.contentDiscovery.tier).toBe('largest-text-block');
      expect(trace.contentDiscovery.winningSelector).toBe(null);
      // Every content selector should have been tried and missed
      expect(trace.contentDiscovery.tried.every(t => t.result === 'no-match' || t.result === 'no-significant-content')).toBe(true);
    });

    test('records framework-content tier when only a framework selector matches', () => {
      const trace = {};
      const converter = new MarkdownConverter({ trace });
      // <ion-content> is the one framework selector with no equivalent in
      // the content-selector list — so an Ionic-style page reaches the
      // framework tier without a content-selector hit. Largest-text-block
      // also misses since its candidate list is fixed to body>div/section/
      // article/main, not custom elements.
      converter.convertToMarkdown(`
        <html><body>
          <ion-content>
            <h1>App Heading</h1>
            <p>First paragraph of Ionic app content with enough prose to clear the new significance threshold and become the framework-tier winner with real article texture and density.</p>
            <p>Second paragraph carrying more body weight — multi-clause sentences, plausible article density, clearly not card chrome, sidebar links, or framework-shell scaffolding around an empty body.</p>
            <p>Third paragraph rounding the fixture out so the three-paragraph plus five-hundred-character significance threshold is comfortably satisfied at the framework tier.</p>
          </ion-content>
        </body></html>
      `);
      expect(trace.contentDiscovery.tier).toBe('framework-content');
      expect(trace.contentDiscovery.winningSelector).toBe(null);
    });

    test('records body-fallback tier when no selector or fallback matches', () => {
      const trace = {};
      const converter = new MarkdownConverter({ trace });
      converter.convertToMarkdown('<html><body><span>tiny</span></body></html>');
      // No content selector matches, nothing significant — falls to body
      expect(trace.contentDiscovery.tier).toBe('body-fallback');
      expect(trace.contentDiscovery.winningSelector).toBe(null);
    });
  });

  describe('content-discovery tiers (extractMainContentFromDOM — DOM path)', () => {
    test('records the same tier shape from convertFromDOM', () => {
      const trace = {};
      const converter = new MarkdownConverter({ trace });
      const doc = new DOMParser().parseFromString(`
        <html><body>
          <article>
            <h1>Live DOM</h1>
            <p>First paragraph of a DOM-rooted article body with enough length to anchor the significance threshold — multi-clause sentence, real article texture, clearly not navigation chrome or sidebar links.</p>
            <p>Second paragraph continuing the body of the piece with more substantial sentences and the kind of paragraph density that distinguishes real prose from a card grid or link list of headlines.</p>
            <p>Third paragraph rounding out the fixture so it comfortably clears the three-paragraph plus five-hundred-character significance threshold on the DOM path through extractMainContentFromDOM.</p>
          </article>
        </body></html>
      `, 'text/html');
      converter.convertFromDOM(doc.body);
      expect(trace.contentDiscovery.tier).toBe('content-selector');
      expect(trace.contentDiscovery.winningSelector).toBe('article');
    });

    test('DOM path body-fallback when nothing meaningful is on the page', () => {
      const trace = {};
      const converter = new MarkdownConverter({ trace });
      const doc = new DOMParser().parseFromString(
        '<html><body><span>minimal</span></body></html>',
        'text/html'
      );
      converter.convertFromDOM(doc.body);
      expect(trace.contentDiscovery.tier).toBe('body-fallback');
    });
  });

  describe('removeNonContent rule', () => {
    test('records nav/aside/header/footer rejections with tag-set reasons', () => {
      const trace = {};
      const converter = new MarkdownConverter({ trace });
      converter.convertToMarkdown(`
        <html><body>
          <article>
            <h1>Body</h1>
            <p>Real content with enough length to pass the significance threshold and let the article win as the content selector.</p>
            <nav>navigation links</nav>
            <aside>related stories</aside>
            <footer>footer chrome</footer>
          </article>
        </body></html>
      `);
      const rules = trace.filterDecisions.rejected.map(r => r.rule);
      expect(rules.every(r => r === 'removeNonContent' || r === 'linkModeOverride')).toBe(true);
      const tags = trace.filterDecisions.rejected.map(r => r.tag);
      expect(tags).toContain('nav');
      expect(tags).toContain('aside');
      expect(tags).toContain('footer');
      // Each rejection should have a reason explaining which check matched
      const navEntry = trace.filterDecisions.rejected.find(r => r.tag === 'nav');
      expect(navEntry.reason).toContain('nonContentTags');
    });

    test('records substring-pattern rejections with the matched substring', () => {
      const trace = {};
      const converter = new MarkdownConverter({ trace });
      converter.convertToMarkdown(`
        <html><body>
          <article>
            <h1>Body</h1>
            <p>Article body content of sufficient length to win as the content selector for this trace assertion.</p>
            <div class="newsletter-signup">Sign up for our newsletter</div>
          </article>
        </body></html>
      `);
      const newsletter = trace.filterDecisions.rejected.find(r => r.classes.includes('newsletter-signup'));
      expect(newsletter).toBeDefined();
      expect(newsletter.reason).toContain('substring pattern');
    });

    test('keptCount reflects nodes that passed the filter', () => {
      const trace = {};
      const converter = new MarkdownConverter({ trace });
      converter.convertToMarkdown(`
        <html><body>
          <article>
            <h1>Heading</h1>
            <p>One paragraph with enough text for the significance threshold to fire on the article element.</p>
            <p>Another paragraph for the article body.</p>
          </article>
        </body></html>
      `);
      expect(trace.filterDecisions.keptCount).toBeGreaterThan(0);
    });
  });

  describe('linkModeOverride rule', () => {
    test('does not record user-mode strip on allowed schemes (intentional formatting)', () => {
      const trace = {};
      const converter = new MarkdownConverter({ trace });
      converter.applyFormattingOptions({ linkMode: 'strip' });
      converter.convertToMarkdown(`
        <html><body>
          <article>
            <h1>Body</h1>
            <p>Article body with enough text to win as the content selector. <a href="https://example.com">a normal link</a> that strip mode will textify.</p>
          </article>
        </body></html>
      `);
      const linkEntries = trace.filterDecisions.rejected.filter(r => r.rule === 'linkModeOverride');
      expect(linkEntries).toHaveLength(0);
    });

    test('records non-allowlisted scheme drops in keep mode', () => {
      const trace = {};
      const converter = new MarkdownConverter({ trace });
      // keep mode (default) — javascript: scheme is non-allowlisted, link is textified
      converter.convertToMarkdown(`
        <html><body>
          <article>
            <h1>Body</h1>
            <p>Article body with enough text to win as the content selector. <a href="javascript:alert(1)">click me</a> would be a security risk.</p>
          </article>
        </body></html>
      `);
      const linkEntries = trace.filterDecisions.rejected.filter(r => r.rule === 'linkModeOverride');
      expect(linkEntries.length).toBeGreaterThan(0);
      expect(linkEntries[0].reason).toContain('javascript');
    });
  });

  describe('inert when no trace is requested', () => {
    test('output is byte-identical with and without a trace target', () => {
      const html = `
        <html><body>
          <header>Site chrome</header>
          <article>
            <h1>Story</h1>
            <p>Real article body with substantial prose to pass the significance threshold and become the winning content selector.</p>
            <p>A second paragraph for body weight.</p>
            <aside>related</aside>
          </article>
          <footer>chrome</footer>
        </body></html>
      `;
      const without = new MarkdownConverter().convertToMarkdown(html);
      const trace = {};
      const withTrace = new MarkdownConverter({ trace }).convertToMarkdown(html);
      expect(withTrace).toBe(without);
      // And the same on the DOM path
      const dom = new DOMParser().parseFromString(html, 'text/html');
      const withoutDom = new MarkdownConverter().convertFromDOM(dom.body);
      const withDom = new MarkdownConverter({ trace: {} }).convertFromDOM(dom.body);
      expect(withDom).toBe(withoutDom);
    });
  });

  describe('setTrace swaps targets between calls', () => {
    test('two separate targets receive independent traces', () => {
      const converter = new MarkdownConverter();
      const traceA = {};
      const traceB = {};
      const html = `
        <html><body>
          <article>
            <h1>One</h1>
            <p>First paragraph of article body prose meant to clear the new significance threshold — three paragraphs and five hundred characters of trimmed text content, comfortably above the floor.</p>
            <p>Second paragraph adding the kind of body weight that real article fixtures need so the article selector wins on both setTrace targets without depending on the old looser thresholds.</p>
            <p>Third paragraph rounding out the fixture so the trace-target swap test stays focused on its actual assertion about independent population rather than drifting on threshold tuning.</p>
          </article>
        </body></html>
      `;
      converter.setTrace(traceA);
      converter.convertToMarkdown(html);
      converter.setTrace(traceB);
      converter.convertToMarkdown(html);
      expect(traceA.contentDiscovery.winningSelector).toBe('article');
      expect(traceB.contentDiscovery.winningSelector).toBe('article');
      // Each target gets its own population — A and B are not the same object
      expect(traceA).not.toBe(traceB);
    });

    test('setTrace(null) detaches and subsequent calls do not mutate the prior target', () => {
      const converter = new MarkdownConverter();
      const trace = {};
      converter.setTrace(trace);
      converter.convertToMarkdown('<article><h1>A</h1><p>Substantial article body with enough prose to pass the significance threshold.</p></article>');
      const before = JSON.stringify(trace);
      converter.setTrace(null);
      converter.convertToMarkdown('<article><h1>B</h1><p>Different content but the trace target should not change because we detached.</p></article>');
      expect(JSON.stringify(trace)).toBe(before);
    });
  });
});
