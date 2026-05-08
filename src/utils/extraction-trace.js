/**
 * ExtractionTrace — additive instrumentation for the extraction pipeline.
 *
 * Wraps an externally-supplied JSON-serializable target object and exposes
 * recording methods the extractor calls during normal operation. When no
 * target is supplied, the wrapper is a no-op shell — every method is a
 * single early-return, so the extraction pipeline pays nothing for trace
 * support in production.
 *
 * The production extension never instantiates this with a target. The dev
 * extension under private/dev/ wraps a fresh `{}`, runs extraction, then
 * reads the populated fields off its target.
 *
 * Schema v0.1 (target shape after a successful trace run):
 *
 *   {
 *     schemaVersion:  "0.1",
 *     capturedAt:     ISO 8601 timestamp string,
 *     url:            string,
 *     userAgent:      string,
 *     elementCount:   integer (set by caller via setElementCount),
 *
 *     path:           "turndown-dom" | "turndown-string" | "size-guard"
 *                   | "guaranteed-text" | "emergency-fallback"
 *                   | "ultimate-fallback" | "site-action" | null,
 *     pathReason:     string (free-form English),
 *
 *     site:           null | { id, name },
 *     contentType:    null | string,
 *
 *     contentDiscovery: null | {
 *       tier:            "content-selector" | "largest-text-block"
 *                      | "framework-content" | "body-fallback",
 *       winningSelector: string | null,
 *       tried:           Array<{ selector, result }>,
 *     },
 *
 *     filterDecisions: {
 *       keptCount: integer,
 *       rejected:  Array<{
 *         id, rule, reason, tag, id_attr, classes, testids, nodePath, preview
 *       }>,
 *     },
 *
 *     output: null | { method, byteLength, markdown, metadata },
 *
 *     truncated: boolean   // flipped to true when rejected[] hits its cap
 *   }
 *
 * The rejected[] list is capped at MAX_REJECTED entries — beyond that,
 * additional rejections are dropped and `truncated` flips to true. Keeps
 * trace size bounded on huge pages.
 */

const MAX_REJECTED = 500;
const PREVIEW_MAX = 80;

class ExtractionTrace {
  /**
   * Coerce a caller-supplied value into an ExtractionTrace. Accepts:
   *   - ExtractionTrace instance — returned as-is so callers in a chain share state
   *   - plain object              — wrapped (the object becomes the target)
   *   - null/undefined            — disabled tracer (all methods no-op)
   */
  static from(value) {
    if (value instanceof ExtractionTrace) return value;
    if (value && typeof value === 'object') return new ExtractionTrace(value);
    return new ExtractionTrace(null);
  }

  constructor(target) {
    this.target = target || null;
    this.fdCounter = 0;
    if (!this.target) return;
    // Idempotent init — when extractSiteContent's catch hands off to
    // convertPageToMarkdown, the inner call creates a fresh tracer over
    // the same target; re-initialising would wipe state the outer caller
    // already populated (capturedAt, contentDiscovery from a prior tier
    // walk, etc.). Resume fdCounter from existing rejections so the next
    // recordRejected emits a unique id.
    if (this.target.schemaVersion) {
      const list = this.target.filterDecisions && this.target.filterDecisions.rejected;
      if (Array.isArray(list)) this.fdCounter = list.length;
      return;
    }
    this._initialize();
  }

  enabled() { return this.target !== null; }

  _initialize() {
    const t = this.target;
    t.schemaVersion = '0.1';
    t.capturedAt = new Date().toISOString();
    t.url = (typeof location !== 'undefined' && location.href) || '';
    t.userAgent = (typeof navigator !== 'undefined' && navigator.userAgent) || '';
    t.elementCount = 0;
    t.path = null;
    t.pathReason = null;
    t.site = null;
    t.contentType = null;
    t.contentDiscovery = null;
    t.filterDecisions = { keptCount: 0, rejected: [] };
    t.output = null;
    t.truncated = false;
  }

  setElementCount(n) {
    if (!this.target) return;
    this.target.elementCount = n;
  }

  setPath(path, reason) {
    if (!this.target) return;
    this.target.path = path;
    this.target.pathReason = reason || '';
  }

  setSiteContext(site, contentType) {
    if (!this.target) return;
    this.target.site = site || null;
    this.target.contentType = contentType || null;
  }

  setContentDiscovery(tier, winningSelector, tried) {
    if (!this.target) return;
    this.target.contentDiscovery = {
      tier,
      winningSelector: winningSelector || null,
      tried: Array.isArray(tried) ? tried.slice() : []
    };
  }

  recordKept() {
    if (!this.target) return;
    this.target.filterDecisions.keptCount++;
  }

  recordRejected(rule, reason, node) {
    if (!this.target) return;
    const list = this.target.filterDecisions.rejected;
    if (list.length >= MAX_REJECTED) {
      this.target.truncated = true;
      return;
    }
    list.push({
      id: `fd-${this.fdCounter++}`,
      rule,
      reason: reason || '',
      tag: this._tagOf(node),
      id_attr: this._idOf(node),
      classes: this._classesOf(node),
      testids: this._testidsOf(node),
      nodePath: this._nodePathOf(node),
      preview: this._previewOf(node)
    });
  }

  setOutput(method, markdown, metadata) {
    if (!this.target) return;
    const md = typeof markdown === 'string' ? markdown : '';
    this.target.output = {
      method: method || '',
      byteLength: md.length,
      markdown: md,
      metadata: metadata || null
    };
  }

  _tagOf(node) {
    return node && node.tagName ? node.tagName.toLowerCase() : '';
  }

  _idOf(node) {
    return (node && typeof node.id === 'string') ? node.id : '';
  }

  _classesOf(node) {
    if (!node) return [];
    if (node.classList && node.classList.length) {
      return Array.from(node.classList);
    }
    if (typeof node.className === 'string' && node.className) {
      return node.className.split(/\s+/).filter(Boolean);
    }
    return [];
  }

  _testidsOf(node) {
    const found = [];
    if (!node || !node.attributes) return found;
    for (let i = 0; i < node.attributes.length; i++) {
      const attr = node.attributes[i];
      if (attr.name && attr.name.startsWith('data-test')) {
        found.push(attr.value);
      }
    }
    return found;
  }

  _nodePathOf(node) {
    const parts = [];
    let cur = node;
    while (cur && cur.nodeType === 1 && cur.tagName) {
      let segment = cur.tagName.toLowerCase();
      if (cur.id) {
        segment += `#${cur.id}`;
      } else if (cur.classList && cur.classList.length > 0) {
        segment += `.${cur.classList[0]}`;
      }
      parts.unshift(segment);
      cur = cur.parentNode;
    }
    return parts.join('>');
  }

  _previewOf(node) {
    if (!node) return '';
    const raw = (node.textContent || '').replace(/\s+/g, ' ').trim();
    if (raw.length <= PREVIEW_MAX) return raw;
    return raw.slice(0, PREVIEW_MAX) + '...';
  }
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = ExtractionTrace;
} else if (typeof window !== 'undefined') {
  window.ExtractionTrace = ExtractionTrace;
}
