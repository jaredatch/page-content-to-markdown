#!/usr/bin/env node
// Upload a packaged release to addons.mozilla.org as a new version on
// the existing listed addon.
//
// Prerequisites:
//   - `npm run package` has produced release/{name}-{version}-firefox.zip
//     and release/{name}-{version}-source.zip
//   - Environment variables AMO_JWT_ISSUER and AMO_JWT_SECRET are set
//     (obtained from https://addons.mozilla.org/developers/addon/api/key/)
//
// Usage:
//   node scripts/release-amo.js                 # upload current version
//   node scripts/release-amo.js --dry-run       # validate inputs only,
//                                                 mint JWT, skip uploads
//
// Direct AMO API v5 client — no external dependencies. Uses Node's
// built-in fetch / FormData (Node >= 20) and crypto for HS256 JWT.

const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const { execSync } = require('node:child_process');

const ROOT = path.join(__dirname, '..');
const AMO_BASE = 'https://addons.mozilla.org/api/v5';
const ADDON_ID = 'page-content-to-markdown@extension';  // browser_specific_settings.gecko.id
const POLL_INTERVAL_MS = 5000;
const POLL_TIMEOUT_MS = 10 * 60 * 1000;  // 10 minutes

function die(msg) {
  console.error(`release-amo: ${msg}`);
  process.exit(1);
}

function readJson(p) {
  return JSON.parse(fs.readFileSync(p, 'utf8'));
}

// Mint a fresh AMO JWT. AMO requires HS256 with a short-lived payload
// (60s window). Each API call should mint its own — JWTs can't be reused
// across the multi-step submission flow because polling alone can take
// minutes.
function mintJwt(issuer, secret) {
  const header = { alg: 'HS256', typ: 'JWT' };
  const now = Math.floor(Date.now() / 1000);
  const payload = {
    iss: issuer,
    jti: crypto.randomBytes(16).toString('hex'),
    iat: now,
    exp: now + 60
  };
  const enc = (o) => Buffer.from(JSON.stringify(o)).toString('base64url');
  const signingInput = `${enc(header)}.${enc(payload)}`;
  const sig = crypto
    .createHmac('sha256', secret)
    .update(signingInput)
    .digest('base64url');
  return `${signingInput}.${sig}`;
}

function authHeaders(issuer, secret) {
  return { Authorization: `JWT ${mintJwt(issuer, secret)}` };
}

async function uploadXpi(issuer, secret, xpiPath) {
  const buf = fs.readFileSync(xpiPath);
  const fd = new FormData();
  fd.append('upload', new Blob([buf], { type: 'application/zip' }), path.basename(xpiPath));
  fd.append('channel', 'listed');

  const r = await fetch(`${AMO_BASE}/addons/upload/`, {
    method: 'POST',
    headers: authHeaders(issuer, secret),
    body: fd
  });
  const text = await r.text();
  if (!r.ok) die(`upload failed: HTTP ${r.status}\n${text}`);
  return JSON.parse(text);
}

async function pollUpload(issuer, secret, uuid) {
  const deadline = Date.now() + POLL_TIMEOUT_MS;
  while (Date.now() < deadline) {
    await new Promise((res) => setTimeout(res, POLL_INTERVAL_MS));
    const r = await fetch(`${AMO_BASE}/addons/upload/${uuid}/`, {
      headers: authHeaders(issuer, secret)
    });
    if (!r.ok) {
      const t = await r.text();
      die(`poll failed: HTTP ${r.status}\n${t}`);
    }
    const data = await r.json();
    const status = data.processed ? (data.valid ? 'valid' : 'invalid') : 'processing';
    process.stdout.write(`\r  validation: ${status}     `);
    if (data.processed) {
      process.stdout.write('\n');
      if (!data.valid) {
        const errs = (data.validation && data.validation.messages) || [];
        const summary = errs.slice(0, 5).map((m) => `    [${m.type || '?'}] ${m.message}`).join('\n');
        die(`validation failed:\n${summary}`);
      }
      return data;
    }
  }
  die('validation timed out after 10 minutes');
}

async function submitVersion(issuer, secret, uuid, sourcePath, releaseNotes) {
  const buf = fs.readFileSync(sourcePath);
  const fd = new FormData();
  fd.append('upload', uuid);
  fd.append('source', new Blob([buf], { type: 'application/zip' }), path.basename(sourcePath));
  fd.append('release_notes', JSON.stringify({ 'en-US': releaseNotes }));

  const guid = encodeURIComponent(ADDON_ID);
  const r = await fetch(`${AMO_BASE}/addons/addon/${guid}/versions/`, {
    method: 'POST',
    headers: authHeaders(issuer, secret),
    body: fd
  });
  const text = await r.text();
  if (!r.ok) die(`version submit failed: HTTP ${r.status}\n${text}`);
  return JSON.parse(text);
}

function getReleaseNotes(version) {
  // Reuse the existing CHANGELOG slicer the GH Actions release workflow uses.
  const script = path.join(__dirname, 'extract-changelog-section.js');
  try {
    const body = execSync(`node "${script}" ${version}`, { encoding: 'utf8' });
    return body.trim();
  } catch (e) {
    die(`could not extract CHANGELOG section for ${version}: ${e.message}`);
  }
}

async function main() {
  const dryRun = process.argv.includes('--dry-run');

  const issuer = process.env.AMO_JWT_ISSUER;
  const secret = process.env.AMO_JWT_SECRET;
  if (!issuer || !secret) {
    die('missing AMO_JWT_ISSUER and/or AMO_JWT_SECRET environment variables');
  }

  const manifest = readJson(path.join(ROOT, 'manifest.json'));
  const pkg = readJson(path.join(ROOT, 'package.json'));
  const version = manifest.version;
  if (pkg.version !== version) {
    die(`version mismatch: manifest.json=${version}, package.json=${pkg.version}`);
  }

  const releaseDir = path.join(ROOT, 'release');
  const firefoxZip = path.join(releaseDir, `${pkg.name}-${version}-firefox.zip`);
  const sourceZip = path.join(releaseDir, `${pkg.name}-${version}-source.zip`);
  if (!fs.existsSync(firefoxZip)) die(`missing firefox zip: ${firefoxZip}\nrun "npm run package" first.`);
  if (!fs.existsSync(sourceZip)) die(`missing source zip: ${sourceZip}\nrun "npm run package" first.`);

  const releaseNotes = getReleaseNotes(version);
  if (!releaseNotes) die(`empty release notes for ${version} — CHANGELOG section missing or blank`);

  console.log(`release-amo: v${version}`);
  console.log(`  firefox:       ${firefoxZip}`);
  console.log(`  source:        ${sourceZip}`);
  console.log(`  release notes: ${releaseNotes.split('\n').length} lines, ${releaseNotes.length} chars`);
  console.log(`  addon id:      ${ADDON_ID}`);

  if (dryRun) {
    const jwt = mintJwt(issuer, secret);
    console.log(`  JWT (HS256):   ok (${jwt.length} chars)`);
    console.log('\ndry-run: skipping upload + version submission');
    return;
  }

  console.log('\nstep 1/3: uploading xpi…');
  const upload = await uploadXpi(issuer, secret, firefoxZip);
  console.log(`  uuid: ${upload.uuid}`);

  console.log('step 2/3: waiting for AMO validation…');
  await pollUpload(issuer, secret, upload.uuid);

  console.log('step 3/3: submitting new version…');
  const ver = await submitVersion(issuer, secret, upload.uuid, sourceZip, releaseNotes);
  console.log(`\n✓ version ${ver.version} submitted (id ${ver.id})`);
  console.log(`  edit url: ${ver.edit_url || `${AMO_BASE}/addons/addon/${encodeURIComponent(ADDON_ID)}/versions/${ver.id}/`}`);
  console.log('\nAMO will email a review-pending notification shortly. Reviewer turnaround is typically hours to a couple days for patch updates on an existing listing.');
}

main().catch((e) => die(e.stack || e.message || String(e)));
