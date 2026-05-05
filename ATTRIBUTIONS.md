# Attributions

This extension uses third-party icon assets, redistributed under their original licenses.

## Brand icons

The "Available on …" divider in the popup renders brand marks for supported sites. These marks identify the upstream service (nominative use); the underlying trademarks remain the property of their respective owners.

### Font Awesome 7.x — Free brands

Used for the X/Twitter, Claude, and OpenAI marks.

- Source: <https://github.com/FortAwesome/Font-Awesome>
- License: [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/) (icons), MIT (code), SIL OFL 1.1 (fonts)
- Copyright: © Fonticons, Inc.

The original SVGs are redistributed in `src/sites/{x,claude,chatgpt}/index.js` (`icon` field). Modifications: license comment and `xmlns` declaration retained at the path level; no path data altered.

### Lobe Icons

Used for the Grok mark.

- Source: <https://github.com/lobehub/lobe-icons>
- License: MIT
- Copyright: © LobeHub

The original SVG is redistributed in `src/sites/grok/index.js` (`icon` field). Modifications: layout attributes (`height="1em"`, inline `style`) replaced with `viewBox`-only sizing; no path data altered.
