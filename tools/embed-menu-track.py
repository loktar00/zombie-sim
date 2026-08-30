"""Reassemble js/music/menu-track-data.js from the generated base64."""
import os
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
B64_PATH = os.path.join(ROOT, 'assets', 'menu.b64.txt')
OUT_PATH = os.path.join(ROOT, 'js', 'music', 'menu-track-data.js')

HEADER = '''/* ZS.music.realMenu — the one real menu track (SANGUO design §P7 audio).
 *
 * A 22.6 s guzheng-flavored piece in C major pentatonic, generated offline by
 * `tools/build-menu-track.py` (Karplus-Strong, 22050 Hz, 16-bit mono). The
 * bytes live as a base64 string so the page can stay double-clickable
 * (file:// refuses CORS-mode fetches, so a real `.wav` next to the HTML would
 * not load on a double-clicked run; cf. AGENTS.md constraint 1).
 *
 * The music engine decodes this once via AudioContext.decodeAudioData on the
 * first play("menu"); the procedural menu carries on afterwards.
 *
 * Regenerate with:    python tools/build-menu-track.py --also-data
 *                     python tools/embed-menu-track.py
 */
(() => {
  "use strict";
  const ZS = (window.ZS = window.ZS || {});
  ZS.music = ZS.music || {};
  ZS.music.realMenu =
'''
FOOTER = ';\n})();\n'

if not os.path.exists(B64_PATH):
    print('error: missing', B64_PATH, file=sys.stderr)
    print('run tools/build-menu-track.py --also-data first', file=sys.stderr)
    sys.exit(1)

with open(B64_PATH, 'r', encoding='ascii') as f:
    b64 = f.read().strip()

with open(OUT_PATH, 'w', encoding='utf-8', newline='\n') as f:
    f.write(HEADER)
    # Open the template-literal string and concatenate per-line with `+` so
    # the bytes never leave the string. (A bare "..." across many lines is
    # not valid JS — a stray newline ends the literal.)
    f.write('(\n  `')
    chunk = 76
    for i in range(0, len(b64), chunk):
        seg = b64[i:i + chunk]
        f.write(seg)
        if i + chunk < len(b64):
            f.write('` +\n  `')
    f.write('`\n)')
    f.write(FOOTER)

size = os.path.getsize(OUT_PATH)
print(f'wrote {OUT_PATH}  {size} bytes  ({len(b64)} b64 chars)')
