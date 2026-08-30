# fonts/

## LXGW WenKai TC — 霞鶩文楷 台灣繁體

The game's brush-kai face (`SANGUO-DESIGN.md` §6.3).

| | |
|---|---|
| Upstream | <https://github.com/lxgw/LxgwWenkaiTC> |
| Version | v1.522 (`LXGWWenKaiTC-Regular.ttf`, 25 764 glyphs, ~15 MB) |
| Licence | SIL Open Font License 1.1 — full text in [`OFL.txt`](../fonts/OFL.txt) |

### What is committed here

`lxgw-wenkai-tc.subset.woff2` — a glyph subset of the Regular weight, cut to
exactly the characters the game can render. The full font is far too large to
ship, and the game's vocabulary is bounded, so `tools/subset-font.py` harvests
every character in `js/i18n/*.js`, `js/campaign/data/*.js` and `index.html`
and cuts the font to those.

The same bytes are also committed as `js/fonts/subset-data.js`, a `data:` URI.
That exists because a `@font-face` whose `src` is a `file://` URL is a
CORS-mode fetch from an opaque origin and browsers refuse it — without the
data URI, a double-clicked `index.html` would silently drop to system kai.
`js/fonts/font.js` tries both and reports which won via `ZS.Fonts.via`.

### Rebuilding

Whenever `js/i18n/*.js` or `js/campaign/data/*.js` gains new text, new glyphs
fall outside the subset and quietly render in the fallback face. Check with:

```bash
python tools/subset-font.py --check
```

To rebuild, download the source face from the upstream release page above and:

```bash
python tools/subset-font.py --source /path/to/LXGWWenKaiTC-Regular.ttf
```

The source `.ttf` is **not** committed — only the subset is. `.verify/sanguo-p0.js`
runs `--check` as part of the P0 suite.
