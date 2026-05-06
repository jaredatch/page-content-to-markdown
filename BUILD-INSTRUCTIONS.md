# Build Instructions

How to build Page Content to Markdown from source. These instructions exist primarily for Mozilla AMO reviewers who need to verify that the submitted addon zip matches the source archive, but they work for anyone.

## Requirements

- **Node.js** 20 or newer (CI uses Node 22)
- **npm** (ships with Node)
- A POSIX-ish shell (macOS, Linux, or WSL on Windows)

## Build

```bash
npm install
npm run build
```

`npm install` installs the bundled `package-lock.json` lockfile, so the dependency tree is deterministic. `npm run build` runs `webpack --mode=production` and writes the four bundled entry points to `dist/`:

- `dist/manifest.json` (copied from the repo root)
- `dist/background.js`
- `dist/content-script.js`
- `dist/popup.html` + `dist/popup.js` + supporting CSS
- `dist/options.html` + `dist/options.js`
- `dist/icons/` (copied from the repo root)

The `dist/` directory is what gets loaded as the unpacked extension and what gets zipped for store submission.

## Verifying the build matches a submitted addon

The Chrome and Firefox addon zips are produced from the contents of `dist/` (everything inside, no `dist/` parent directory). To verify a submitted zip matches what you'd build from this source:

```bash
npm install
npm run build
cd dist && zip -r ../my-build.zip . && cd ..
# Compare my-build.zip against the submitted zip — same file list, same file contents.
```

For exact reproducibility from a git tag, the `npm run package` script does this end-to-end and produces `release/page-content-to-markdown-<version>-{chrome,firefox,source}.zip` plus a `SHA256SUMS` file.

## Tested on

- macOS 15 (Sonoma / Sequoia) with Node 20–22
- Ubuntu 24.04 (GitHub Actions `ubuntu-latest`) with Node 22

No platform-specific code in the build pipeline; any modern POSIX system should work.
