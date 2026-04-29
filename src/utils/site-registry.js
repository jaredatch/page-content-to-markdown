'use strict';

const xModule = require('../sites/x');
const claudeModule = require('../sites/claude');
const grokModule = require('../sites/grok');

const _sites = [xModule, claudeModule, grokModule];

/**
 * Central registry of site modules (per-site extractors + formatters).
 * Adding a new supported site = require() its module and add it to _sites.
 */
class SiteRegistry {
  /**
   * Detect which site module matches a URL.
   * @param {string} url - The page URL
   * @returns {object|null} Site module object, or null if no supported site matches (general actions only)
   */
  static detect(url) {
    try {
      const hostname = new URL(url).hostname;
      for (const site of _sites) {
        if (site.hostnames.includes(hostname)) {
          return site;
        }
      }
    } catch {
      // Invalid URL
    }
    return null;
  }

  /**
   * Get a site module by its id.
   * @param {string} id - Site id (e.g., 'x', 'claude')
   * @returns {object|null} Site module object, or null if not found
   */
  static getById(id) {
    return _sites.find(s => s.id === id) || null;
  }

  /**
   * Get all registered site modules.
   * @returns {Array<object>}
   */
  static all() {
    return _sites;
  }

  /**
   * Filter a site's content types to those whose pathPatterns match the URL.
   * Content types without pathPatterns are treated as always-applicable
   * (backwards-compatible default — useful while a site module is being built out).
   * @param {object} site - Site module
   * @param {string} url - Current page URL
   * @returns {Array<object>} Subset of site.contentTypes that apply on this URL
   */
  static applicableContentTypes(site, url) {
    if (!site || !Array.isArray(site.contentTypes)) return [];
    let path;
    try {
      path = new URL(url).pathname;
    } catch {
      return [];
    }
    return site.contentTypes.filter(ct => {
      if (!ct.pathPatterns || ct.pathPatterns.length === 0) return true;
      return ct.pathPatterns.some(p => p.test(path));
    });
  }
}

module.exports = SiteRegistry;
