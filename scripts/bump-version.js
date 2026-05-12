#!/usr/bin/env node
// Bump the extension version across manifest.json, package.json, and
// CHANGELOG.md in one step. Migrates the [Unreleased] section under the
// new version with today's date and re-creates an empty [Unreleased]
// above it. Updates link refs at the bottom of CHANGELOG. Leaves the
// working tree dirty for the maintainer to review, commit, and tag.
//
// Usage:
//   node scripts/bump-version.js patch        # 1.0.1 -> 1.0.2
//   node scripts/bump-version.js minor        # 1.0.1 -> 1.1.0
//   node scripts/bump-version.js major        # 1.0.1 -> 2.0.0
//   node scripts/bump-version.js 1.2.3        # explicit
//   node scripts/bump-version.js patch --dry-run

const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const MANIFEST = path.join(ROOT, 'manifest.json');
const PACKAGE = path.join(ROOT, 'package.json');
const CHANGELOG = path.join(ROOT, 'CHANGELOG.md');
const REPO_URL = 'https://github.com/jaredatch/page-content-to-markdown';

function die(msg) {
  console.error(`bump-version: ${msg}`);
  process.exit(1);
}

function parseArgs(argv) {
  const args = argv.slice(2);
  const dryRun = args.includes('--dry-run');
  const positional = args.filter((a) => !a.startsWith('--'));
  if (positional.length !== 1) {
    die('Usage: bump-version.js <patch|minor|major|x.y.z> [--dry-run]');
  }
  return { spec: positional[0], dryRun };
}

function parseSemver(v) {
  const m = /^(\d+)\.(\d+)\.(\d+)$/.exec(v);
  if (!m) die(`not a valid semver: "${v}"`);
  return [Number(m[1]), Number(m[2]), Number(m[3])];
}

function bumpVersion(current, spec) {
  if (/^\d+\.\d+\.\d+$/.test(spec)) {
    const [a, b, c] = parseSemver(spec);
    const [ca, cb, cc] = parseSemver(current);
    // Reject downgrades — almost always an accident.
    if (a < ca || (a === ca && b < cb) || (a === ca && b === cb && c <= cc)) {
      die(`explicit version ${spec} is not strictly greater than current ${current}`);
    }
    return spec;
  }
  const [maj, min, pat] = parseSemver(current);
  switch (spec) {
    case 'patch': return `${maj}.${min}.${pat + 1}`;
    case 'minor': return `${maj}.${min + 1}.0`;
    case 'major': return `${maj + 1}.0.0`;
    default: die(`unknown spec "${spec}" — use patch | minor | major | x.y.z`);
  }
}

function todayLocal() {
  const d = new Date();
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

// Replace the version string in a JSON file's top-level `version` field
// without disturbing surrounding formatting / key order. The pattern
// anchors on the version field's first occurrence at column-2 indent —
// matches our project's manifest and package files. Returns the new
// file contents.
function rewriteJsonVersion(filePath, newVersion) {
  const src = fs.readFileSync(filePath, 'utf8');
  const re = /^(\s*"version"\s*:\s*")(\d+\.\d+\.\d+)(")/m;
  if (!re.test(src)) die(`no top-level "version" field in ${filePath}`);
  return src.replace(re, `$1${newVersion}$3`);
}

// Migrate the [Unreleased] section into a new versioned section.
// Returns the new CHANGELOG.md content. Throws if:
//   - [Unreleased] section missing
//   - [<newVersion>] section already exists (would clobber)
//   - [Unreleased] section has no entries (no point releasing nothing)
function rewriteChangelog(currentSrc, newVersion, today) {
  const lines = currentSrc.split('\n');

  const unreleasedIdx = lines.findIndex((l) => /^## \[Unreleased\]\s*$/.test(l));
  if (unreleasedIdx === -1) die('no "## [Unreleased]" section found in CHANGELOG.md');

  if (lines.some((l) => l.startsWith(`## [${newVersion}]`))) {
    die(`section "## [${newVersion}]" already exists in CHANGELOG.md`);
  }

  // Find the boundary of the [Unreleased] section: next `## [` heading
  // or end of file (whichever comes first).
  let endIdx = lines.length;
  for (let i = unreleasedIdx + 1; i < lines.length; i++) {
    if (lines[i].startsWith('## [')) { endIdx = i; break; }
  }

  // Slice the [Unreleased] body — everything between the header and the
  // next section header — and trim surrounding blank lines.
  const bodyLines = lines.slice(unreleasedIdx + 1, endIdx);
  while (bodyLines.length && bodyLines[0].trim() === '') bodyLines.shift();
  while (bodyLines.length && bodyLines[bodyLines.length - 1].trim() === '') bodyLines.pop();

  if (bodyLines.length === 0) {
    die('[Unreleased] section is empty — add CHANGELOG entries before bumping');
  }

  // Compose the new section structure:
  //   ## [Unreleased]
  //   (blank)
  //   ## [newVersion] - YYYY-MM-DD
  //   (blank)
  //   <body lines>
  //   (blank)
  //   ## [next existing version] ...
  const newSection = [
    '## [Unreleased]',
    '',
    `## [${newVersion}] - ${today}`,
    '',
    ...bodyLines,
    ''
  ];

  // endIdx is either a `## [` line (existing version) or EOF. Splice
  // [unreleasedIdx, endIdx) and replace with newSection.
  const head = lines.slice(0, unreleasedIdx);
  const tail = lines.slice(endIdx);
  let merged = [...head, ...newSection, ...tail];

  // Update link refs at the bottom of the file. Find the `[Unreleased]:`
  // line and update its compare URL. Insert a `[newVersion]:` line just
  // below it (above the previous-version line) so newest-first ordering
  // is preserved.
  const unreleasedRefRe = /^\[Unreleased\]:\s*.+$/;
  const unreleasedRefIdx = merged.findIndex((l) => unreleasedRefRe.test(l));
  if (unreleasedRefIdx === -1) {
    // No link refs at all — append a fresh block at EOF.
    if (merged[merged.length - 1] !== '') merged.push('');
    merged.push(`[Unreleased]: ${REPO_URL}/compare/v${newVersion}...HEAD`);
    merged.push(`[${newVersion}]: ${REPO_URL}/releases/tag/v${newVersion}`);
  } else {
    merged[unreleasedRefIdx] = `[Unreleased]: ${REPO_URL}/compare/v${newVersion}...HEAD`;
    const newRef = `[${newVersion}]: ${REPO_URL}/releases/tag/v${newVersion}`;
    // Skip if it somehow already exists.
    if (!merged.includes(newRef)) {
      merged.splice(unreleasedRefIdx + 1, 0, newRef);
    }
  }

  // Normalize trailing newline — keep exactly one.
  while (merged.length > 1 && merged[merged.length - 1] === '' && merged[merged.length - 2] === '') {
    merged.pop();
  }
  if (merged[merged.length - 1] !== '') merged.push('');

  return merged.join('\n');
}

function readManifestVersion() {
  const src = fs.readFileSync(MANIFEST, 'utf8');
  const m = /"version"\s*:\s*"(\d+\.\d+\.\d+)"/.exec(src);
  if (!m) die('could not read current version from manifest.json');
  return m[1];
}

function main() {
  const { spec, dryRun } = parseArgs(process.argv);
  const current = readManifestVersion();
  const next = bumpVersion(current, spec);
  const today = todayLocal();

  const manifestSrc = rewriteJsonVersion(MANIFEST, next);
  const packageSrc = rewriteJsonVersion(PACKAGE, next);
  const changelogSrc = rewriteChangelog(fs.readFileSync(CHANGELOG, 'utf8'), next, today);

  if (dryRun) {
    console.log(`bump-version: ${current} -> ${next} (dry-run, no files written)`);
    console.log(`  manifest.json: ${MANIFEST}`);
    console.log(`  package.json:  ${PACKAGE}`);
    console.log(`  CHANGELOG.md:  ${CHANGELOG} (section dated ${today})`);
    return;
  }

  fs.writeFileSync(MANIFEST, manifestSrc);
  fs.writeFileSync(PACKAGE, packageSrc);
  fs.writeFileSync(CHANGELOG, changelogSrc);

  console.log(`bump-version: ${current} -> ${next}`);
  console.log(`  manifest.json bumped`);
  console.log(`  package.json bumped`);
  console.log(`  CHANGELOG.md migrated [Unreleased] -> [${next}] - ${today}`);
  console.log(`\nNext steps:`);
  console.log(`  git diff                                 # review`);
  console.log(`  git add -p && git commit -m "Release: v${next}"`);
  console.log(`  git push origin master`);
  console.log(`  git tag -a v${next} -m "v${next}" && git push origin v${next}`);
}

main();
