# Vendored fonts

These files are self-hosted subsets of the two font families the CoreZ app shell
actually renders (see `../fonts.css`):

| File | Family | Subset | Bytes |
| --- | --- | --- | --- |
| `outfit-latin-var.woff2` | Outfit | latin | 32,292 |
| `outfit-latin-ext-var.woff2` | Outfit | latin-ext | 14,808 |
| `jetbrains-mono-latin-var.woff2` | JetBrains Mono | latin | 31,432 |
| `jetbrains-mono-latin-ext-var.woff2` | JetBrains Mono | latin-ext | 11,624 |

Both are **variable** fonts (`font-weight: 400 900` / `400 600`), so a single
file covers every weight the UI uses at no extra request.

- Source: Google Fonts CSS API v2 (`family=Outfit:wght@400..900`,
  `family=JetBrains+Mono:wght@400..600`), downloaded with a Chromium user agent
  so the woff2 endpoints were served.
- License: SIL Open Font License 1.1 — self-hosting and redistribution are
  permitted. Upstream projects: <https://github.com/Outfitio/Outfit-Fonts> and
  <https://github.com/JetBrains/JetBrainsMono>.
- Refresh: re-run the download step if a family is updated upstream, then keep
  the `unicode-range` values in `src/fonts.css` in sync.

`Inter` is deliberately absent: `--font-sans` in `src/index.css` is a system
stack and never referenced Inter, so the family was downloaded on every page
load and never used. Adding it here is a design decision, not a performance one.
