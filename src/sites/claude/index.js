'use strict';

const ClaudeExtractor = require('./claude-extractor');
const ClaudeFormatter = require('./claude-formatter');

module.exports = {
  id: 'claude',
  name: 'Claude',
  hostnames: [
    'claude.ai', 'www.claude.ai'
  ],
  contentTypes: [
    {
      id: 'conversation',
      label: 'Conversation',
      icon: '<svg class="btn-icon" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>',
      // Claude conversations only extract from share pages.
      pathPatterns: [/^\/share\//i]
    }
  ],
  Extractor: ClaudeExtractor,
  Formatter: ClaudeFormatter
};
