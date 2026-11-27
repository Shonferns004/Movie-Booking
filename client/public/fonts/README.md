# Tempting display font

`Tempting` is a script typeface distributed under a personal/commercial license; it is
not available on Google Fonts. Add the licensed webfont file here:

- `Tempting.woff2` (preferred), or
- `Tempting.woff` / `Tempting.otf`

The `@font-face` rule in `src/styles.css` loads `/fonts/Tempting.woff2` first, then
`.woff` and `.otf`. Until the file is present, display headings fall back to Georgia.
