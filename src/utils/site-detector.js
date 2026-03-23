'use strict';

/**
 * Detects site-specific presets based on URL.
 * Extensible for future site presets beyond X/Twitter.
 */
class SiteDetector {
  static _xHostnames = new Set([
    'x.com', 'www.x.com', 'mobile.x.com',
    'twitter.com', 'www.twitter.com', 'mobile.twitter.com'
  ]);

  /**
   * Detect which site preset applies for a given URL.
   * @param {string} url - The page URL
   * @returns {{ site: 'x' | 'generic' }}
   */
  static detect(url) {
    if (SiteDetector.isX(url)) {
      return { site: 'x' };
    }
    return { site: 'generic' };
  }

  /**
   * Check if a URL is an X/Twitter page.
   * @param {string} url - The page URL
   * @returns {boolean}
   */
  static isX(url) {
    try {
      const hostname = new URL(url).hostname;
      return SiteDetector._xHostnames.has(hostname);
    } catch {
      return false;
    }
  }
}

module.exports = SiteDetector;
