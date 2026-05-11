'use strict';

/**
 * Path-pattern compilation for site-module `contentTypes[*].pathPatterns`.
 *
 * Each entry in `pathPatterns` is matched against `URL.pathname` (NOT the
 * full URL — hostname lives in the module's `hostnames` array, and query
 * strings live in `detectAvailable` or are implicit). This module accepts
 * three input shapes so module authors can pick the most readable one:
 *
 *   1. RegExp                       /^\/r\/[^/]+\/comments\//
 *      Returned as-is. The convention used by every existing site module.
 *
 *   2. Glob string                  '/r/*\/comments/*'
 *      Friendlier syntax: `*` = `[^/]+` (one non-empty path segment, no
 *      slash), `**` = `.*` (multi-segment wildcard, may be empty).
 *      Anchored at both ends by default — `/item` matches `/item` only,
 *      not `/items`. URL-routing intent: `/users/*` matches `/users/alice`
 *      but not the half-formed `/users/`.
 *
 *   3. Regex string                 '^/r/[^/]+/comments/'
 *      Detected by the presence of regex metachars (^ $ \ ( ) | [ ] + { }).
 *      Compiled with the `i` flag.
 *
 * Inputs that look like full URLs (starting with `http://` or with a
 * hostname-shaped prefix) or that contain `?` are rejected with a clear
 * error — those concerns belong in `hostnames` or `detectAvailable`,
 * not here.
 */

const REGEX_METACHARS = /[\^$\\()|\[\]{}+]/;
const FULL_URL = /^https?:\/\//i;
const HOSTNAME_LIKE = /^[a-z0-9-]+(?:\.[a-z0-9-]+)+\//i;

/**
 * @param {string|RegExp} input
 * @returns {RegExp}
 * @throws {Error} on invalid input
 */
function compilePathPattern(input) {
  if (input instanceof RegExp) return input;
  if (typeof input !== 'string') {
    throw new Error('pathPattern must be a string or RegExp');
  }
  const s = input.trim();
  if (!s) throw new Error('pathPattern is empty');

  if (FULL_URL.test(s)) {
    throw new Error('pathPattern matches URL.pathname only — drop the `http(s)://...` prefix (hostname belongs in `hostnames`)');
  }
  if (HOSTNAME_LIKE.test(s)) {
    throw new Error('pathPattern matches URL.pathname only — drop the hostname prefix (it belongs in `hostnames`)');
  }
  if (s.includes('?')) {
    throw new Error('pathPattern matches URL.pathname only — query string isn\'t included; use `detectAvailable` for query-aware checks');
  }

  if (REGEX_METACHARS.test(s)) {
    return new RegExp(s, 'i');
  }
  return new RegExp(globToRegex(s), 'i');
}

/**
 * Compile a glob string to an anchored regex source.
 * `*`  → `[^/]+`  (one non-empty path segment, no slash)
 * `**` → `.*`     (multi-segment wildcard, may be empty)
 * All other regex metachars are escaped so the glob is treated literally.
 *
 * The `+` (not `*`) on single-segment wildcards is intentional. This is URL
 * routing, not filesystem globbing — `/users/*` should match `/users/alice`,
 * not the half-formed `/users/` with an empty trailing segment.
 * @param {string} glob
 * @returns {string} regex source — wrap in `new RegExp(..., 'i')` to use
 */
function globToRegex(glob) {
  let out = '';
  for (let i = 0; i < glob.length; i++) {
    const c = glob[i];
    if (c === '*') {
      if (glob[i + 1] === '*') {
        out += '.*';
        i++;
      } else {
        out += '[^/]+';
      }
    } else if (/[.+?^$(){}|\[\]\\]/.test(c)) {
      out += '\\' + c;
    } else {
      out += c;
    }
  }
  return '^' + out + '$';
}

module.exports = { compilePathPattern, globToRegex };
