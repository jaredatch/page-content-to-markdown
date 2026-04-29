/**
 * Filename template formatter.
 *
 * Expands template tokens against page context, applies a style transform
 * (preserve / kebab / snake), sanitizes for filesystem safety, truncates
 * to a safe length, and appends `.md`.
 *
 * Pure functions only — no DOM, no chrome APIs. Safe to require from
 * background, options page, content script, or tests.
 */

const MAX_FILENAME_LENGTH = 200;
const EXTENSION = '.md';
const FALLBACK_FILENAME = 'page' + EXTENSION;

// Sanity cap for the {title} token. A page's <title> can be hundreds of
// characters (X tweet pages stuff the entire post text in there), and
// without an opt-out cap we end up with filenames that overflow the
// MAX_FILENAME_LENGTH cap and chop off the user's date/suffix tokens.
// Users who want a wider title can override with `{title|max:N}`.
const DEFAULT_TITLE_MAX = 100;

const DEFAULT_DATE_FORMAT = 'YYYY-MM-DD';
const DEFAULT_TIME_FORMAT = 'HHmmss';
const DEFAULT_DATETIME_FORMAT = 'YYYY-MM-DD_HHmmss';

const MONTH_NAMES_FULL = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December'
];
const MONTH_NAMES_SHORT = MONTH_NAMES_FULL.map(m => m.substring(0, 3));
const DAY_NAMES_FULL = [
  'Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'
];
const DAY_NAMES_SHORT = DAY_NAMES_FULL.map(d => d.substring(0, 3));

// Date-format tokens (Moment / dayjs style). Listed longest-first so regex
// alternation chooses correctly (e.g. MMMM before MMM before MM before M).
// `[literal]` lets users embed letters that would otherwise be tokens.
const DATE_TOKEN_RE = /\[([^\]]+)\]|YYYY|YY|MMMM|MMM|MM|M|DD|D|dddd|ddd|HH|H|hh|h|mm|m|ss|s|A|a|ZZ|Z/g;

// Template tokens look like:
//   {name}                          — bare token
//   {name:format}                   — colon shortcut (date format string only — kept
//                                     for back-compat: `{date:YYYY-MM-DD}`)
//   {name|filter:arg|filter:arg}    — pipe-style filter chain
//   {name:format|filter:arg}        — combine: legacy date format then filters
// We capture the entire interior and let the parser split on `|` and `:`.
const TEMPLATE_TOKEN_RE = /\{([^}]+)\}/g;

const FS_ILLEGAL_RE = /[/\\:*?"<>|]/g;
// eslint-disable-next-line no-control-regex
const CONTROL_CHARS_RE = /[\x00-\x1f]/g;
const COMBINING_MARKS_RE = /[̀-ͯ]/g;

function pad(n, width = 2) {
  return String(n).padStart(width, '0');
}

function formatOffset(date, withColon) {
  const totalMinutes = -date.getTimezoneOffset();
  const sign = totalMinutes >= 0 ? '+' : '-';
  const abs = Math.abs(totalMinutes);
  const hours = pad(Math.floor(abs / 60));
  const minutes = pad(abs % 60);
  return withColon ? `${sign}${hours}:${minutes}` : `${sign}${hours}${minutes}`;
}

/**
 * Format a Date with a Moment / dayjs style format string.
 * Wrap literal letters in [brackets] to prevent token expansion.
 */
function formatDate(date, fmt) {
  if (!(date instanceof Date) || Number.isNaN(date.getTime())) {
    date = new Date();
  }
  if (typeof fmt !== 'string' || fmt.length === 0) {
    fmt = DEFAULT_DATE_FORMAT;
  }
  return fmt.replace(DATE_TOKEN_RE, (match, escaped) => {
    if (escaped !== undefined) return escaped;
    switch (match) {
      case 'YYYY': return String(date.getFullYear());
      case 'YY':   return pad(date.getFullYear() % 100);
      case 'MMMM': return MONTH_NAMES_FULL[date.getMonth()];
      case 'MMM':  return MONTH_NAMES_SHORT[date.getMonth()];
      case 'MM':   return pad(date.getMonth() + 1);
      case 'M':    return String(date.getMonth() + 1);
      case 'DD':   return pad(date.getDate());
      case 'D':    return String(date.getDate());
      case 'dddd': return DAY_NAMES_FULL[date.getDay()];
      case 'ddd':  return DAY_NAMES_SHORT[date.getDay()];
      case 'HH':   return pad(date.getHours());
      case 'H':    return String(date.getHours());
      case 'hh':   return pad(((date.getHours() + 11) % 12) + 1);
      case 'h':    return String(((date.getHours() + 11) % 12) + 1);
      case 'mm':   return pad(date.getMinutes());
      case 'm':    return String(date.getMinutes());
      case 'ss':   return pad(date.getSeconds());
      case 's':    return String(date.getSeconds());
      case 'A':    return date.getHours() < 12 ? 'AM' : 'PM';
      case 'a':    return date.getHours() < 12 ? 'am' : 'pm';
      case 'Z':    return formatOffset(date, true);
      case 'ZZ':   return formatOffset(date, false);
      default:     return match;
    }
  });
}

function resolveContext(context) {
  const ctx = context || {};
  const url = typeof ctx.url === 'string' ? ctx.url : '';
  let host = '';
  let path = '';
  try {
    if (url) {
      const u = new URL(url);
      host = u.hostname || '';
      path = (u.pathname || '').replace(/^\/+|\/+$/g, '');
    }
  } catch (_e) {
    // Invalid URL — leave host/path empty
  }
  const domain = host.replace(/^www\./i, '');
  const segments = path ? path.split('/') : [];
  const slug = segments[segments.length - 1] || '';
  const title = typeof ctx.title === 'string' ? ctx.title : '';
  const date = ctx.date instanceof Date ? ctx.date : new Date();
  return { title, host, domain, path, slug, date };
}

/**
 * Parse a filter expression (e.g. `max:50`, `default:Untitled`).
 * Returns `{ name, arg }`. The colon is the separator between filter
 * name and its argument; the argument may itself contain colons.
 */
function parseFilter(expr) {
  const idx = expr.indexOf(':');
  if (idx < 0) return { name: expr.trim(), arg: null };
  return {
    name: expr.substring(0, idx).trim(),
    arg: expr.substring(idx + 1)
  };
}

/**
 * Apply a single filter to a string value. Unknown filters pass the
 * value through unchanged so a typo doesn't silently destroy filenames.
 */
function applyFilter(filter, value) {
  switch (filter.name) {
    case 'max': {
      const n = parseInt(filter.arg, 10);
      if (!Number.isFinite(n) || n <= 0) return value;
      if (typeof value !== 'string' || value.length <= n) return value;
      return truncate(value, n, [' ', '-', '_', '.']);
    }
    case 'default':
      return (value === undefined || value === null || value === '')
        ? (filter.arg || '')
        : value;
    default:
      return value;
  }
}

/**
 * Resolve a token name against the context. Returns the raw string
 * value before any filter pipeline runs. Date-family tokens accept
 * a format string (legacy colon shortcut: `{date:YYYY-MM-DD}`).
 */
function resolveTokenValue(name, legacyFmt, ctx) {
  switch (name) {
    case 'title':    return ctx.title || '';
    case 'host':     return ctx.host;
    case 'domain':   return ctx.domain;
    case 'path':     return ctx.path;
    case 'slug':     return ctx.slug;
    case 'date':     return formatDate(ctx.date, legacyFmt || DEFAULT_DATE_FORMAT);
    case 'time':     return formatDate(ctx.date, legacyFmt || DEFAULT_TIME_FORMAT);
    case 'datetime': return formatDate(ctx.date, legacyFmt || DEFAULT_DATETIME_FORMAT);
    default:         return '';
  }
}

/**
 * Parse one `{...}` body into its name, legacy date-format shortcut, and
 * a filter chain. The legacy `:fmt` only applies to date-family tokens —
 * for non-date tokens we emit nothing (the colon-shortcut never made sense
 * for them). Pipe filters always work.
 *
 * Supported forms:
 *   "title"                       → { name: 'title' }
 *   "date:YYYY-MM-DD"             → { name: 'date', dateFormat: 'YYYY-MM-DD' }
 *   "title|max:50"                → { name: 'title', filters: [{ name: 'max', arg: '50' }] }
 *   "date:YYYY-MM-DD|max:8"       → both
 */
function parseTokenBody(body) {
  const parts = body.split('|');
  const head = parts[0];
  const filters = parts.slice(1).map(parseFilter);

  const colonIdx = head.indexOf(':');
  if (colonIdx < 0) return { name: head.trim(), dateFormat: null, filters };
  return {
    name: head.substring(0, colonIdx).trim(),
    dateFormat: head.substring(colonIdx + 1),
    filters
  };
}

/**
 * Expand `{...}` placeholders in a template against the resolved context.
 * Unknown tokens render as empty string. Literal characters between tokens
 * are preserved as-is.
 */
function expandTemplate(template, context) {
  if (typeof template !== 'string') return '';
  const ctx = resolveContext(context);
  return template.replace(TEMPLATE_TOKEN_RE, (match, body) => {
    const parsed = parseTokenBody(body);

    let value = resolveTokenValue(parsed.name, parsed.dateFormat, ctx);

    // Apply the default title cap when the user hasn't supplied an explicit
    // `max:N` filter. This keeps `{title}` from blowing past the filename
    // length cap on pages with absurdly long titles (e.g. X tweet pages).
    if (parsed.name === 'title' && !parsed.filters.some(f => f.name === 'max')) {
      value = applyFilter({ name: 'max', arg: String(DEFAULT_TITLE_MAX) }, value);
    }

    for (const filter of parsed.filters) {
      value = applyFilter(filter, value);
    }

    // Title fallback. Done after filters so `{title|default:foo}` works
    // explicitly, but a bare `{title}` with no value still becomes "page"
    // (preserves prior behavior).
    if (parsed.name === 'title' && !value && !parsed.filters.some(f => f.name === 'default')) {
      return 'page';
    }

    return value == null ? '' : String(value);
  });
}

function stylePreserve(str) {
  return str
    .replace(CONTROL_CHARS_RE, '')
    .replace(FS_ILLEGAL_RE, '-')
    .replace(/\s+/g, ' ')
    .replace(/^[.\s]+|[.\s]+$/g, '');
}

/**
 * Slugify with a chosen separator. NFKD-normalizes, strips combining
 * marks (so `é` → `e`), lowercases, replaces non-alphanumeric runs
 * with the separator, trims separators from edges.
 */
function slugify(str, sep) {
  let result = str
    .normalize('NFKD')
    .replace(COMBINING_MARKS_RE, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, sep);
  while (result.length && result[0] === sep) result = result.slice(1);
  while (result.length && result[result.length - 1] === sep) result = result.slice(0, -1);
  return result;
}

function applyStyle(str, style) {
  switch (style) {
    case 'kebab': return slugify(str, '-');
    case 'snake': return slugify(str, '_');
    case 'preserve':
    default:      return stylePreserve(str);
  }
}

/**
 * Truncate to maxLen. If `sepChars` are provided and the cut lands
 * mid-segment, walks back to the nearest separator within the last 30%
 * for cleaner output.
 */
function truncate(str, maxLen, sepChars) {
  if (str.length <= maxLen) return str;
  let truncated = str.substring(0, maxLen);
  if (sepChars && sepChars.length) {
    const minBoundary = Math.floor(maxLen * 0.7);
    let boundary = -1;
    for (let i = truncated.length - 1; i >= minBoundary; i--) {
      if (sepChars.indexOf(truncated[i]) !== -1) {
        boundary = i;
        break;
      }
    }
    if (boundary > 0) truncated = truncated.substring(0, boundary);
  }
  return truncated;
}

/**
 * Compose a sanitized markdown filename from the user's template,
 * style preference, and page context.
 *
 * @param {string} template - e.g. `{title} - {date}`
 * @param {'preserve'|'kebab'|'snake'} style
 * @param {{title?: string, url?: string, date?: Date}} context
 * @returns {string} filename ending in `.md`, never empty
 */
function formatFilename(template, style, context) {
  const expanded = expandTemplate(template, context);
  const styled = applyStyle(expanded, style);
  const bodyMaxLen = MAX_FILENAME_LENGTH - EXTENSION.length;
  const sepChars =
    style === 'snake' ? ['_'] :
      style === 'kebab' ? ['-'] :
        [' ', '-', '_', '.'];
  const truncated = truncate(styled, bodyMaxLen, sepChars);
  // Always strip trailing separators / whitespace / dots — trailing
  // decorative chars are rarely intentional and look broken.
  const body = truncated.replace(/[\s\-_.]+$/, '');
  if (!body) return FALLBACK_FILENAME;
  return body + EXTENSION;
}

module.exports = {
  formatFilename,
  formatDate,
  expandTemplate,
  applyStyle,
  slugify,
  applyFilter,
  parseFilter,
  parseTokenBody,
  // Exposed for advanced callers / tests:
  MAX_FILENAME_LENGTH,
  DEFAULT_TITLE_MAX,
  FALLBACK_FILENAME,
  DEFAULT_DATE_FORMAT,
  DEFAULT_TIME_FORMAT,
  DEFAULT_DATETIME_FORMAT
};
