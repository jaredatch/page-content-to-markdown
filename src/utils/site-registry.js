'use strict';

const xModule = require('../sites/x');
const claudeModule = require('../sites/claude');

const _sites = [xModule, claudeModule];

/**
 * Central registry for site-specific extractors.
 * Adding a new site = require() its module and add it to _sites.
 */
class SiteRegistry {
  /**
   * Detect which site module matches a URL.
   * @param {string} url - The page URL
   * @returns {object|null} Site module object, or null for generic/unrecognized
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
}

module.exports = SiteRegistry;
