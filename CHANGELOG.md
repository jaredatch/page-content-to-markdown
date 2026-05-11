# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Fixed

- **General extractor picks the largest matching candidate per selector, not the first.** On The Verge, the first `<article>` on a story page is a related-cards stub — first-match-wins picked it and returned empty markdown. Score every match by `textContent.length` and pick the largest qualifying candidate.
- **Tighter content-significance threshold.** Bump the `hasSignificantContent` floor to ≥3 `<p>` descendants and ≥500 chars of trimmed text. Rejects related-card grids that previously slipped through because their aggregated link text passed the old 50-char gate.
- **SVG elements no longer crash Turndown mid-traversal.** SVG `className` is a `SVGAnimatedString`, not a string; calling `.toLowerCase()` on it threw and Turndown returned `''` for the whole page. Read class via `getAttribute('class')` throughout the converter, with a fallback to `.baseVal` for safety. Eliminates a silent empty-output failure mode on news sites that ship inline SVG icons.

## [1.0.0] - 2026-05-06

First public release. Firefox-first, Chrome supported.

### Added

- **General actions on any page.** Extract the main content of a page to clean Markdown, skipping nav, ads, footers, comments, and other chrome.
- **Selection mode.** Shadow-DOM element picker with hover/selected overlays and a floating action bar — pick exactly what you want and Copy or Save without leaving the page. The selection persists across actions so you can fire both on the same set.
- **Right-click selected text → "Copy selection as Markdown".**
- **Right-click any element → "Select element for Markdown"** (picker activates with the right-clicked element pre-selected).
- **Site actions for X, Claude, Grok, and ChatGPT.** Per-site extractors handle threads, quote tweets, Community Notes, conversation roles, reasoning blocks, code panels, citations, and other site-specific structure that the general path can't.
- **Smart popup detection.** On supported sites, the popup probes the live DOM and only shows the content types that are actually present (single tweet vs. thread vs. article, etc.).
- **Quick Extract keyboard shortcut.** Configurable via the browser's extension-shortcuts UI; runs the same selection logic as the popup with a system notification on completion.
- **Output to clipboard or file.** Per-action choice via the popup; default ("filled primary") configurable in options.
- **Customizable filename templates.** Pipe-filter syntax (`{title|max:50|default:Untitled}`), Moment-style date tokens, style transforms (kebab/snake/etc.).
- **Page-info header.** Optional Title/URL/Date block, either inline (`**Key:** value`) or YAML frontmatter.
- **Link and image modes.** Keep, strip, bare-URL, or alt-text-only.
- **Tracking-parameter stripping.** Removes `utm_*`, `fbclid`, `gclid`, `msclkid`, and ~20 other well-known tracking params from extracted URLs.
- **URL scheme allowlist.** Emitted links are restricted to `http`/`https`/`mailto`; images to `http`/`https`. Other schemes (`javascript:`, `data:`, etc.) are textified or dropped.
- **Modern Markdown output.** GitHub Flavored Markdown via Turndown — tables, strikethrough, task lists, fenced code blocks.
- **Browser support.** Firefox MV3 and Chromium-based browsers (Chrome, Edge, Brave, Arc, etc.).
- **No telemetry.** Everything runs locally in the browser. No servers, no third parties.

[Unreleased]: https://github.com/jaredatch/page-content-to-markdown/compare/v1.0.0...HEAD
[1.0.0]: https://github.com/jaredatch/page-content-to-markdown/releases/tag/v1.0.0
