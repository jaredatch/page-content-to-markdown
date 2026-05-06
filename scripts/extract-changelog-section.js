#!/usr/bin/env node
// Extract a single version's section from CHANGELOG.md.
// Usage: node scripts/extract-changelog-section.js 1.0.0
// Prints the section body to stdout. Used by the release workflow to feed
// `gh release create --notes-file`.

const fs = require('fs');
const path = require('path');

const version = process.argv[2];
if (!version) {
  console.error('Usage: extract-changelog-section.js <version>');
  process.exit(1);
}

const changelogPath = path.join(__dirname, '..', 'CHANGELOG.md');
const md = fs.readFileSync(changelogPath, 'utf8');
const lines = md.split('\n');

const startIdx = lines.findIndex((l) => l.startsWith(`## [${version}]`));
if (startIdx === -1) {
  console.error(`Version ${version} not found in CHANGELOG.md`);
  process.exit(1);
}

const out = [];
for (let i = startIdx + 1; i < lines.length; i++) {
  const line = lines[i];
  if (line.startsWith('## ')) break;
  if (/^\[[^\]]+\]:\s/.test(line)) break;
  out.push(line);
}

const body = out.join('\n').replace(/^\n+|\n+$/g, '');
process.stdout.write(body + '\n');
