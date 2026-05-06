#!/usr/bin/env bash
# Builds the extension and produces the artifacts needed for store
# submission and GitHub releases:
#
#   release/page-content-to-markdown-<version>-chrome.zip
#   release/page-content-to-markdown-<version>-firefox.zip
#   release/page-content-to-markdown-<version>-source.zip
#   release/SHA256SUMS
#
# The chrome and firefox zips are byte-identical (same dist/ contents);
# they're named separately because the stores expect that. The source
# zip is built via `git archive HEAD`, so it always reflects the current
# commit and never includes uncommitted working-tree changes or anything
# in .gitignore (notably `private/` and `node_modules/`).

set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

NAME="page-content-to-markdown"
VERSION="$(node -p "require('./package.json').version")"
MANIFEST_VERSION="$(node -p "require('./manifest.json').version")"
OUT_DIR="release"

if [[ "$VERSION" != "$MANIFEST_VERSION" ]]; then
  echo "ERROR: package.json version ($VERSION) doesn't match manifest.json ($MANIFEST_VERSION)" >&2
  exit 1
fi

if ! git diff --quiet || ! git diff --cached --quiet; then
  echo "WARNING: working tree has uncommitted changes — source.zip will reflect HEAD only" >&2
fi

rm -rf "$OUT_DIR"
mkdir -p "$OUT_DIR"

CHROME_ZIP="$OUT_DIR/${NAME}-${VERSION}-chrome.zip"
FIREFOX_ZIP="$OUT_DIR/${NAME}-${VERSION}-firefox.zip"
SOURCE_ZIP="$OUT_DIR/${NAME}-${VERSION}-source.zip"

echo "==> Building dist/"
npm run build

echo "==> Packaging Chrome zip"
(cd dist && zip -rq "../$CHROME_ZIP" .)

echo "==> Packaging Firefox zip (identical contents)"
cp "$CHROME_ZIP" "$FIREFOX_ZIP"

echo "==> Packaging source zip from git HEAD"
git archive --format=zip --output="$SOURCE_ZIP" HEAD

echo "==> Generating SHA-256 checksums"
(cd "$OUT_DIR" && shasum -a 256 ./*.zip > SHA256SUMS)

echo
echo "Done. Artifacts in $OUT_DIR/:"
ls -lh "$OUT_DIR"
