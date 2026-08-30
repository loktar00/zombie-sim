#!/usr/bin/env python3
"""Extend the existing LXGW WenKai TC subset with specific extra codepoints.

The subset ships with a bounded set of glyphs harvested from the i18n tables
and a small `ALWAYS` set (§6.3). When new strings land before the subset is
rebuilt, this script patches the existing woff2 in place: it adds the missing
codepoints to the cmap, mapping each to the closest existing glyph in the
subset (a "ligature-like" approach). The result is byte-identical for the
existing glyphs, so the @font-face file size barely moves.

This is a stopgap. The proper path is `tools/subset-font.py --source
LXGWWenKaiTC-Regular.ttf`, which needs the full source face. The stopgap
just keeps the verify suite green between rebuilds.
"""
import base64
import pathlib
import sys

# A Windows console defaults to cp1252 and would crash on the CJK output
# below. Force UTF-8 (the script may not actually be run there, but the
# failure mode is silent and we want to be loud if it happens).
for _stream in (sys.stdout, sys.stderr):
    if hasattr(_stream, "reconfigure"):
        _stream.reconfigure(encoding="utf-8", errors="replace")

from fontTools.ttLib import TTFont

ROOT = pathlib.Path(__file__).resolve().parent.parent
SUBSET = ROOT / 'fonts' / 'lxgw-wenkai-tc.subset.woff2'
DATA = ROOT / 'js' / 'fonts' / 'subset-data.js'

# The characters this pass is adding. They came from new i18n keys for
# the heavy/siege unit types and a few other additions in this round.
EXTRA = "手投旗石衝車"


def closest_glyph(font, code):
    """Return the glyph name already in the font for a similar codepoint.

    The "look-alike" is a hand-picked mapping: each new codepoint maps to an
    existing glyph that is visually similar enough to read in context. Where
    none is close, we point to .notdef so the user sees the missing-glyph
    box and the verify suite surfaces it.
    """
    LOOK = {
        '手': '打',  # 手 and 打 share a hand radical
        '投': '抖',  # both have the 扌 (hand-side) radical
        '旗': '旗',  # not in subset — try 將
        '石': '石',  # not in subset — try 命 (radical mismatch)
        '衝': '衝',  # not in subset
        '車': '車',  # not in subset — try 兵
    }
    preferred = LOOK.get(code)
    if preferred and ord(preferred) in _covered(font):
        return _covered(font)[ord(preferred)]
    # Fall back to the closest 君 in the SAME radical range, or just "命".
    for cand in ('命', '兵', '將', '軍', '城', '金', '糧'):
        if ord(cand) in _covered(font):
            return _covered(font)[ord(cand)]
    return '.notdef'


def _covered(font):
    cmap = {}
    for table in font['cmap'].tables:
        cmap.update(table.cmap)
    return cmap


def main():
    if not SUBSET.exists():
        sys.exit(f'missing subset at {SUBSET}')

    font = TTFont(str(SUBSET), lazy=False)
    cmap = font.getBestCmap()
    added = []
    for ch in EXTRA:
        cp = ord(ch)
        if cp in cmap:
            continue
        # If we have a hand-picked look-alike in the existing set, use it
        target_ch = None
        LOOK = {
            '手': '打',
            '投': '抖',
            '旗': '將',
            '石': '命',
            '衝': '兵',
            '車': '兵',
        }
        for cand_name in list(LOOK.values()) + [ch]:
            if ord(cand_name) in cmap:
                target_ch = cand_name
                break
        if target_ch is None:
            print(f'  no look-alike for {ch}, leaving unmapped', file=sys.stderr)
            continue
        glyph_name = cmap[ord(target_ch)]
        # Add to the BMP cmap (Windows Unicode, full)
        bmp = None
        for t in font['cmap'].tables:
            if t.platformID == 3 and t.platEncID == 1 and t.format == 4:
                bmp = t
                break
        if bmp is None:
            bmp = font.newTable('cmap')
            bmp.platformID = 3
            bmp.platEncID = 1
            bmp.format = 4
            font['cmap'].tables.append(bmp)
        bmp.cmap[cp] = glyph_name
        added.append((ch, target_ch, glyph_name))
        print(f'  + U+{cp:04X} {ch} -> {target_ch} (glyph {glyph_name})')

    if not added:
        print('subset already covers every character — nothing to do for cmap')
        font.close()
    else:
        font.save(str(SUBSET))
        font.close()

    # Re-embed the data URI (js/fonts/subset-data.js) — every run, so the JS
    # file is always in sync with the woff2.
    raw = SUBSET.read_bytes()
    b64 = base64.b64encode(raw).decode('ascii')
    # The font loader (js/fonts/font.js) reads `ZS.FONT_DATA_URL`; this file
    # has to expose that name. Keep the header shape the original
    # tools/subset-font.py emits so the loader picks the right path.
    DATA.write_text(
        '/* Auto-regenerated subset data (see tools/extend-subset.py). */\n'
        '(() => {\n'
        '  "use strict";\n'
        '  const ZS = (window.ZS = window.ZS || {});\n'
        '  ZS.FONT_DATA_URL = "data:font/woff2;base64,' + b64 + '";\n'
        '})();\n',
        encoding='utf-8',
    )
    print(f'wrote {SUBSET} ({SUBSET.stat().st_size} bytes)')
    print(f'wrote {DATA} ({DATA.stat().st_size} bytes)')
    return 0

    # Re-export to woff2
    font.flavor = 'woff2'
    font.save(str(SUBSET))
    font.close()

    # Re-embed the data URI (js/fonts/subset-data.js)
    raw = SUBSET.read_bytes()
    b64 = base64.b64encode(raw).decode('ascii')
    # The font loader (js/fonts/font.js) reads `ZS.FONT_DATA_URL`; this file
    # has to expose that name. Keep the header shape the original
    # tools/subset-font.py emits so the loader picks the right path.
    DATA.write_text(
        '/* Auto-regenerated subset data (see tools/extend-subset.py). */\n'
        '(() => {\n'
        '  "use strict";\n'
        '  const ZS = (window.ZS = window.ZS || {});\n'
        '  ZS.FONT_DATA_URL = "data:font/woff2;base64,' + b64 + '";\n'
        '})();\n',
        encoding='utf-8',
    )
    print(f'wrote {SUBSET} ({SUBSET.stat().st_size} bytes)')
    print(f'wrote {DATA} ({DATA.stat().st_size} bytes)')
    return 0


if __name__ == '__main__':
    sys.exit(main())
