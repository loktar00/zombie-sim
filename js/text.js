/* ZS.boilText — canvas text in the boiling-line style (docs/SANGUO-DESIGN.md §6.3).

   The sketch primitives wobble; system-rendered glyphs do not, so a plain
   fillText sits dead on the paper next to them. Drawing per glyph with a tiny
   jit-driven offset and rotation (<= 0.6 px, <= 1.5 deg) puts the type back on
   the same shimmer as the strokes, at a cost of one fillText per character —
   fine at label volumes, and no glyph atlas needed.

   Additive: only index.html loads this file; the other three pages are
   untouched. */
(() => {
  "use strict";
  const ZS = (window.ZS = window.ZS || {});

  const CJK_STACK =
    '"LXGW WenKai TC","LXGW WenKai","DFKai-SB","BiauKai","Kaiti TC",KaiTi,STKaiti,serif';
  const MAX_OFF = 0.6; // px
  const MAX_ROT = (1.5 * Math.PI) / 180; // rad

  function font(px, weight) {
    return (weight ? weight + " " : "") + Math.round(px) + "px " + CJK_STACK;
  }

  /* Draw `str` with the current fillStyle. `align` is "left" | "center" |
     "right" about x; y is the baseline. `seed` keeps the wobble stable per
     label (pass a different one per label so they don't shimmer in lockstep).
     Returns the advance width. */
  function boilText(c, str, x, y, px, seed, align, weight) {
    c.save();
    c.font = font(px, weight);
    c.textBaseline = "alphabetic";
    c.textAlign = "left";
    const total = c.measureText(str).width;
    let cx = align === "center" ? x - total / 2 : align === "right" ? x - total : x;
    const s = seed === undefined ? 3.1 : seed;
    for (let i = 0; i < str.length; i++) {
      const ch = str[i];
      const w = c.measureText(ch).width;
      const ox = ZS.jit(s + i * 5.7) * MAX_OFF;
      const oy = ZS.jit(s + i * 9.1 + 40) * MAX_OFF;
      const rot = ZS.jit(s + i * 3.3 + 80) * MAX_ROT;
      c.save();
      c.translate(cx + w / 2 + ox, y + oy);
      c.rotate(rot);
      c.fillText(ch, -w / 2, 0);
      c.restore();
      cx += w;
    }
    c.restore();
    return total;
  }

  function measure(c, str, px, weight) {
    c.save();
    c.font = font(px, weight);
    const w = c.measureText(str).width;
    c.restore();
    return w;
  }

  ZS.textFont = font;
  ZS.boilText = boilText;
  ZS.measureText = measure;
  ZS.CJK_STACK = CJK_STACK;
})();
