'use strict';

const XExtractor = require('./x-extractor');
const XFormatter = require('./x-formatter');

// /{user}/status/{id} carries tweets, threads, AND inline articles —
// the popup can't disambiguate without DOM, so all three are offered there.
const STATUS_PATH = /^\/[^/]+\/status\/\d+/i;
const ARTICLE_PATHS = [
  /^\/i\/article\//i,
  STATUS_PATH,
  /^\/[^/]+\/article\/\d+/i
];

module.exports = {
  id: 'x',
  name: 'X / Twitter',
  hostnames: [
    'x.com', 'www.x.com', 'mobile.x.com',
    'twitter.com', 'www.twitter.com', 'mobile.twitter.com'
  ],
  icon: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 448 512"><path fill="currentColor" d="M357.2 48L427.8 48 273.6 224.2 455 464 313 464 201.7 318.6 74.5 464 3.8 464 168.7 275.5-5.2 48 140.4 48 240.9 180.9 357.2 48zM332.4 421.8l39.1 0-252.4-333.8-42 0 255.3 333.8z"/></svg>',
  contentTypes: [
    {
      id: 'single-tweet',
      label: 'Tweet',
      icon: '<svg class="btn-icon" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>',
      pathPatterns: [STATUS_PATH]
    },
    {
      id: 'thread',
      label: 'Thread',
      icon: '<svg class="btn-icon" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="8" y1="6" x2="21" y2="6"/><line x1="8" y1="12" x2="21" y2="12"/><line x1="8" y1="18" x2="21" y2="18"/><line x1="3" y1="6" x2="3.01" y2="6"/><line x1="3" y1="12" x2="3.01" y2="12"/><line x1="3" y1="18" x2="3.01" y2="18"/></svg>',
      pathPatterns: [STATUS_PATH]
    },
    {
      id: 'article',
      label: 'Article',
      icon: '<svg class="btn-icon" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/></svg>',
      pathPatterns: ARTICLE_PATHS
    }
  ],
  Extractor: XExtractor,
  Formatter: XFormatter
};
