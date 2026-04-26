/**
 * URL tracking-parameter stripper.
 *
 * Pure functions only — no DOM, no chrome APIs. Safe to require from any
 * extension surface or from tests.
 *
 * The list targets well-known analytics/ad-attribution params with low risk
 * of collision. Generic single-letter keys (`s`, `t`, `ref`) are deliberately
 * left alone — too many legitimate sites use them for routing.
 */

const TRACKING_PREFIXES = [
  'utm_',     // Google Analytics: utm_source, utm_medium, utm_campaign, utm_term, utm_content, utm_id, ...
  '_hs',      // HubSpot: _hsenc, _hsmi, ...
  '__hs'      // HubSpot session: __hsfp, __hssc, __hstc
];

const TRACKING_NAMES = new Set([
  // Ad networks
  'fbclid', 'gclid', 'dclid', 'msclkid', 'yclid', 'wbraid', 'gbraid', 'twclid',
  // Email marketing
  'mc_cid', 'mc_eid',           // Mailchimp
  'mkt_tok',                    // Marketo
  'vero_id', 'vero_conv',       // Vero
  'hsCtaTracking',              // HubSpot CTA
  // Social
  'igshid',                     // Instagram
  'ref_src', 'ref_url',         // Twitter share buttons (more specific than bare "ref")
  // Analytics
  '_ga', '_gl'                  // Google Analytics cross-domain
]);

function isTrackingParam(key) {
  if (TRACKING_NAMES.has(key)) return true;
  for (const prefix of TRACKING_PREFIXES) {
    if (key.startsWith(prefix)) return true;
  }
  return false;
}

/**
 * Strip well-known tracking params from a URL string. Returns the input
 * unchanged on parse failure or when nothing matched.
 *
 * @param {string} urlStr
 * @returns {string}
 */
function cleanUrl(urlStr) {
  if (!urlStr || typeof urlStr !== 'string') return urlStr;
  let u;
  try {
    u = new URL(urlStr);
  } catch (_e) {
    return urlStr;
  }
  // Snapshot keys before mutation — iterating searchParams while deleting is unsafe.
  const keys = Array.from(u.searchParams.keys());
  let modified = false;
  for (const key of keys) {
    if (isTrackingParam(key)) {
      u.searchParams.delete(key);
      modified = true;
    }
  }
  if (!modified) return urlStr;
  let result = u.toString();
  // URL.toString() leaves a dangling "?" if all params were removed.
  if (result.endsWith('?')) result = result.slice(0, -1);
  return result;
}

// Matches absolute http(s) URLs in markdown. Excludes whitespace, angle/paren/
// bracket/brace closers — those are the boundaries Turndown emits around URLs.
const URL_RE = /https?:\/\/[^\s<>"()[\]{}]+/g;

/**
 * Replace every absolute URL in a markdown string with its cleaned form.
 *
 * @param {string} markdown
 * @returns {string}
 */
function cleanUrlsInMarkdown(markdown) {
  if (!markdown || typeof markdown !== 'string') return markdown;
  return markdown.replace(URL_RE, (match) => cleanUrl(match));
}

module.exports = {
  cleanUrl,
  cleanUrlsInMarkdown,
  isTrackingParam
};
