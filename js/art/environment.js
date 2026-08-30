/* ZS.env — environment art for 火柴三國.
 *
 * A reusable catalogue of trees, mountains, rivers, camps, walls, bridges, and
 * ruins, drawn with the same sketch primitives as the rest of the game. The
 * campaign map and the battle field use these. The Outbreak page is not
 * affected (it loads nothing from this file).
 *
 * The look is the boil ink line: a wash in the paper palette for the body
 * and a thin jittered ink line for the contour. Each art piece takes a
 * `seed` so the boil is stable per call.
 *
 *   tree(c, x, y, r, kind, seed)        — kind: pine, oak, plum
 *   rock(c, x, y, r, seed)              — a boulder
 *   hill(c, x, y, w, h, seed)           — a low hill silhouette
 *   river(c, points, w, seed)           — a winding waterway through points
 *   pond(c, x, y, r, seed)              — a circular pond
 *   camp(c, x, y, w, h, faction, seed)  — a tent camp, banner included
 *   wall(c, x1, y1, x2, y2, hp, seed)  — a wall segment, hp shown as cracks
 *   gate(c, x, y, w, seed)              — a gate with closed door
 *   bridge(c, x, y, w, seed)            — a small wooden bridge
 *   ruins(c, x, y, r, seed)             — a small ruined building
 *   road(c, points, w, seed)            — a worn dirt road
 */
(() => {
  "use strict";
  const ZS = (window.ZS = window.ZS || {});

  const INK = "rgb(61,52,43)";
  const INK_SOFT = "rgba(61,52,43,0.5)";
  const INK_FAINT = "rgba(61,52,43,0.16)";

  // the same faction ramp the figure uses
  const FACTIONS = [
    [70, 96, 150], [150, 54, 44], [64, 132, 74], [150, 120, 60],
    [120, 80, 140], [60, 130, 130], [120, 86, 60], [96, 104, 120],
  ];
  function wash(i, a) {
    const c = FACTIONS[i % FACTIONS.length];
    return "rgba(" + c[0] + "," + c[1] + "," + c[2] + "," + a + ")";
  }

  /* ---------- trees ---------- */

  /* A pine (松). Tall, conical, with a visible trunk. */
  function pine(c, x, y, r, seed) {
    // trunk
    c.strokeStyle = INK;
    c.lineWidth = 1.4;
    ZS.wline(c, x, y, x, y - r * 1.6, seed, 0.6);
    // the foliage — three wobbly triangles
    c.fillStyle = "rgba(112,148,72,0.42)";
    const layers = [
      { y: y - r * 0.4, w: r * 1.2, h: r * 0.7 },
      { y: y - r * 0.9, w: r * 0.95, h: r * 0.7 },
      { y: y - r * 1.3, w: r * 0.65, h: r * 0.6 },
    ];
    for (let i = 0; i < layers.length; i++) {
      const L = layers[i];
      ZS.wpoly(
        c,
        [
          { x: x - L.w, y: L.y },
          { x: x, y: L.y - L.h },
          { x: x + L.w, y: L.y },
        ],
        seed + i * 7,
        1.0,
        true,
      );
      c.fill();
      c.stroke();
    }
  }

  /* An oak (槐). Broad canopy, thick trunk, more rounded. */
  function oak(c, x, y, r, seed) {
    c.strokeStyle = INK;
    c.lineWidth = 1.5;
    // trunk
    ZS.wline(c, x - r * 0.1, y, x, y - r * 0.8, seed, 0.7);
    ZS.wline(c, x + r * 0.1, y, x + r * 0.1, y - r * 0.8, seed + 1, 0.7);
    // canopy: a few overlapping wcircles
    c.fillStyle = "rgba(122,148,84,0.32)";
    const blobs = [
      { dx: -r * 0.5, dy: -r * 0.9, r: r * 0.7 },
      { dx: 0, dy: -r * 1.1, r: r * 0.85 },
      { dx: r * 0.5, dy: -r * 0.95, r: r * 0.7 },
      { dx: -r * 0.2, dy: -r * 1.3, r: r * 0.55 },
      { dx: r * 0.3, dy: -r * 1.4, r: r * 0.5 },
    ];
    for (let i = 0; i < blobs.length; i++) {
      const b = blobs[i];
      c.beginPath();
      // a stable jittered circle, not a wcirc (so the foliage reads softer)
      const n = 12;
      for (let k = 0; k <= n; k++) {
        const a = (k / n) * Math.PI * 2;
        const rr = b.r + (ZS.sjit(seed + i * 5 + k) * 0.18);
        const px = x + b.dx + Math.cos(a) * rr;
        const py = y + b.dy + Math.sin(a) * rr;
        if (k) c.lineTo(px, py);
        else c.moveTo(px, py);
      }
      c.closePath();
      c.fill();
    }
    c.stroke();
  }

  /* A plum (梅). A small wobbly trunk with a few sparse blossoms. */
  function plum(c, x, y, r, seed) {
    c.strokeStyle = INK;
    c.lineWidth = 1.4;
    // the trunk — a wobbly vertical with a kink
    ZS.wline(c, x, y, x - r * 0.1, y - r * 0.6, seed, 0.7);
    ZS.wline(c, x - r * 0.1, y - r * 0.6, x + r * 0.2, y - r * 1.0, seed + 1, 0.6);
    ZS.wline(c, x + r * 0.2, y - r * 1.0, x + r * 0.1, y - r * 1.4, seed + 2, 0.5);
    // a branch
    ZS.wline(c, x - r * 0.1, y - r * 0.6, x - r * 0.5, y - r * 0.8, seed + 3, 0.5);
    // blossoms: 5-7 small pink circles
    c.fillStyle = "rgba(220,160,170,0.7)";
    const n = 6;
    for (let i = 0; i < n; i++) {
      const a = ZS.sjit(seed + 7 + i) * Math.PI * 2;
      const d = r * (0.3 + ZS.sjit(seed + 11 + i) * 0.8);
      const px = x + Math.cos(a) * d * 0.6;
      const py = y - r * (0.4 + ZS.sjit(seed + 17 + i) * 0.8);
      c.beginPath();
      c.arc(px, py, 1.5 + ZS.sjit(seed + 19 + i) * 0.8, 0, 6.29);
      c.fill();
    }
    c.stroke();
  }

  /* The dispatcher. `kind` is "pine" | "oak" | "plum" | a random choice. */
  function tree(c, x, y, r, kind, seed) {
    if (!kind || kind === "random") {
      const k = Math.abs(ZS.sjit((seed || 1) * 3.7));
      kind = k < 0.55 ? "pine" : k < 0.85 ? "oak" : "plum";
    }
    if (kind === "pine") return pine(c, x, y, r, seed);
    if (kind === "plum") return plum(c, x, y, r, seed);
    return oak(c, x, y, r, seed);
  }

  /* ---------- rocks and hills ---------- */

  function rock(c, x, y, r, seed) {
    c.strokeStyle = INK;
    c.lineWidth = 1.4;
    c.fillStyle = "rgba(150,140,120,0.30)";
    ZS.wpoly(
      c,
      [
        { x: x - r, y: y + r * 0.2 },
        { x: x - r * 0.7, y: y - r * 0.6 },
        { x: x - r * 0.1, y: y - r },
        { x: x + r * 0.6, y: y - r * 0.7 },
        { x: x + r, y: y + r * 0.1 },
        { x: x + r * 0.5, y: y + r * 0.5 },
      ],
      seed,
      0.7,
      true,
    );
    c.fill();
    c.stroke();
    // a couple of cracks
    c.strokeStyle = INK_FAINT;
    c.lineWidth = 1;
    ZS.wline(c, x - r * 0.3, y - r * 0.3, x + r * 0.1, y + r * 0.3, seed + 5, 0.4);
    ZS.wline(c, x + r * 0.1, y - r * 0.5, x + r * 0.4, y + r * 0.1, seed + 6, 0.4);
  }

  /* a low hill — a wobbly arc with a few trees on top */
  function hill(c, x, y, w, h, seed) {
    c.strokeStyle = INK;
    c.lineWidth = 1.5;
    c.fillStyle = "rgba(122,148,84,0.16)";
    ZS.wpoly(
      c,
      [
        { x: x - w / 2, y: y + h * 0.3 },
        { x: x - w * 0.4, y: y - h * 0.3 },
        { x: x - w * 0.1, y: y - h * 0.6 },
        { x: x + w * 0.15, y: y - h * 0.7 },
        { x: x + w * 0.4, y: y - h * 0.4 },
        { x: x + w / 2, y: y + h * 0.2 },
      ],
      seed,
      1.2,
      true,
    );
    c.fill();
    c.stroke();
    // a few trees along the ridge
    const n = 2 + Math.abs(ZS.sjit(seed * 1.3)) * 3;
    for (let i = 0; i < n; i++) {
      const t = (i + 0.5) / n;
      const tx = x - w * 0.4 + t * w * 0.85;
      const ty = y - h * (0.2 + ZS.sjit(seed + 11 + i) * 0.5);
      const kind = ZS.sjit(seed + 23 + i) < 0.6 ? "pine" : "oak";
      tree(c, tx, ty, h * 0.18, kind, seed * 0.7 + i + 1);
    }
  }

  /* ---------- water ---------- */

  /* a river — a polyline through `points` (array of {x, y}), with a wash
     and a darker wobbly current line on top. */
  function river(c, points, w, seed) {
    if (!points || points.length < 2) return;
    // the wash body
    c.fillStyle = "rgba(96,138,166,0.20)";
    c.strokeStyle = "rgba(70,110,140,0.55)";
    c.lineWidth = w;
    c.lineCap = "round";
    c.lineJoin = "round";
    ZS.wpoly(c, points, seed, w * 0.4, false);
    c.stroke();
    // a faint current line down the middle
    c.strokeStyle = "rgba(70,110,140,0.40)";
    c.lineWidth = 1.0;
    ZS.wpoly(c, points, seed + 11, 1.0, false);
    c.stroke();
    // a couple of ripple ticks
    c.strokeStyle = "rgba(70,110,140,0.30)";
    c.lineWidth = 0.9;
    for (let i = 0; i < points.length - 1; i++) {
      const a = points[i],
        b = points[i + 1];
      const mx = (a.x + b.x) / 2,
        my = (a.y + b.y) / 2;
      const dx = b.x - a.x,
        dy = b.y - a.y;
      const len = Math.hypot(dx, dy);
      if (len < 6) continue;
      const px = -dy / len,
        py = dx / len;
      ZS.wline(c, mx - px * 2, my - py * 2, mx + px * 2, my + py * 2, seed + 31 + i, 0.4);
    }
  }

  /* a circular pond (river oxbow, lake) */
  function pond(c, x, y, r, seed) {
    c.fillStyle = "rgba(96,138,166,0.22)";
    c.strokeStyle = "rgba(70,110,140,0.55)";
    c.lineWidth = 1.4;
    c.beginPath();
    const n = 18;
    for (let i = 0; i <= n; i++) {
      const a = (i / n) * Math.PI * 2;
      const rr = r + ZS.sjit(seed + i * 1.3) * 0.6;
      const px = x + Math.cos(a) * rr;
      const py = y + Math.sin(a) * rr;
      if (i) c.lineTo(px, py);
      else c.moveTo(px, py);
    }
    c.closePath();
    c.fill();
    c.stroke();
    // ripples
    c.strokeStyle = "rgba(70,110,140,0.32)";
    c.lineWidth = 0.9;
    ZS.wcirc(c, x - r * 0.2, y - r * 0.1, r * 0.35, seed + 33, 0.5);
    ZS.wcirc(c, x + r * 0.25, y + r * 0.1, r * 0.25, seed + 35, 0.4);
  }

  /* ---------- camp ---------- */

  /* A small camp: a few tents (the triangular kind) around a banner pole. */
  function camp(c, x, y, w, h, faction, seed) {
    const t = (faction | 0) % FACTIONS.length;
    c.strokeStyle = INK;
    c.lineWidth = 1.4;
    // the ground — a soft rectangle (the camp footprint)
    c.fillStyle = "rgba(180,165,135,0.18)";
    ZS.sketchRect(c, x - w / 2, y - h / 2, w, h);
    // a few tents
    const tents = [
      { dx: -w * 0.3, dy: -h * 0.1, r: h * 0.15 },
      { dx: w * 0.25, dy: -h * 0.2, r: h * 0.13 },
      { dx: -w * 0.1, dy: h * 0.2, r: h * 0.16 },
    ];
    for (let i = 0; i < tents.length; i++) {
      const T = tents[i];
      c.fillStyle = "rgba(150,130,100,0.4)";
      ZS.wpoly(
        c,
        [
          { x: x + T.dx - T.r, y: y + T.dy + T.r * 0.5 },
          { x: x + T.dx, y: y + T.dy - T.r },
          { x: x + T.dx + T.r, y: y + T.dy + T.r * 0.5 },
        ],
        seed + i * 7,
        0.6,
        true,
      );
      c.fill();
      c.stroke();
      // a small flag on top
      c.strokeStyle = INK;
      ZS.wline(c, x + T.dx, y + T.dy - T.r, x + T.dx, y + T.dy - T.r * 1.6, seed + 23 + i, 0.4);
      c.fillStyle = wash(t, 0.7);
      ZS.wpoly(
        c,
        [
          { x: x + T.dx, y: y + T.dy - T.r * 1.6 },
          { x: x + T.dx + T.r * 0.5, y: y + T.dy - T.r * 1.5 },
          { x: x + T.dx, y: y + T.dy - T.r * 1.4 },
        ],
        seed + 25 + i,
        0.4,
        true,
      );
      c.fill();
    }
    // the central banner pole
    c.strokeStyle = INK;
    c.lineWidth = 1.5;
    ZS.wline(c, x, y - h * 0.4, x, y - h * 0.5, seed + 31, 0.4);
    c.fillStyle = wash(t, 0.7);
    ZS.wpoly(
      c,
      [
        { x: x, y: y - h * 0.5 },
        { x: x + w * 0.15, y: y - h * 0.48 },
        { x: x + w * 0.15, y: y - h * 0.3 },
        { x: x, y: y - h * 0.32 },
      ],
      seed + 33,
      0.5,
      true,
    );
    c.fill();
    c.stroke();
  }

  /* ---------- walls, gates, bridges ---------- */

  /* a wall segment, oriented from (x1, y1) to (x2, y2). `hp` is 0..1 — the
     lower it is, the more cracks are drawn. */
  function wall(c, x1, y1, x2, y2, hp, seed) {
    const dx = x2 - x1,
      dy = y2 - y1;
    const len = Math.hypot(dx, dy);
    if (len < 4) return;
    // the top of the wall
    c.strokeStyle = INK;
    c.lineWidth = 1.6;
    c.fillStyle = "rgba(160,140,110,0.32)";
    const nx = -dy / len,
      ny = dx / len;
    const h = 14;
    ZS.wpoly(
      c,
      [
        { x: x1, y: y1 },
        { x: x2, y: y2 },
        { x: x2 - nx * h, y: y2 - ny * h },
        { x: x1 - nx * h, y: y1 - ny * h },
      ],
      seed,
      0.7,
      true,
    );
    c.fill();
    c.stroke();
    // crenellations along the top
    const steps = Math.max(1, Math.floor(len / 18));
    for (let i = 0; i <= steps; i++) {
      const t = i / steps;
      const cx = x1 + dx * t,
        cy = y1 + dy * t;
      const skip = i % 2 === 0;
      if (skip) continue;
      // small notch
      ZS.wline(c, cx, cy, cx - nx * 4, cy - ny * 4, seed + 7 + i, 0.3);
    }
    // cracks, scaled by damage
    if (hp < 1) {
      c.strokeStyle = INK_SOFT;
      c.lineWidth = 1.0;
      const n = Math.floor((1 - hp) * 6);
      for (let i = 0; i < n; i++) {
        const t = ZS.sjit(seed + 11 + i * 3);
        const cx = x1 + dx * t,
          cy = y1 + dy * t;
        const off = h * (0.3 + ZS.sjit(seed + 13 + i) * 0.5);
        ZS.wline(
          c,
          cx + nx * off * 0.2,
          cy + ny * off * 0.2,
          cx - nx * off,
          cy - ny * off,
          seed + 17 + i,
          0.5,
        );
      }
    }
  }

  /* a closed gate — a wobbly rectangle with a centre seam */
  function gate(c, x, y, w, seed) {
    c.strokeStyle = INK;
    c.lineWidth = 1.6;
    c.fillStyle = "rgba(120,90,60,0.5)";
    ZS.wpoly(
      c,
      [
        { x: x - w / 2, y: y - 14 },
        { x: x + w / 2, y: y - 14 },
        { x: x + w / 2, y: y + 6 },
        { x: x - w / 2, y: y + 6 },
      ],
      seed,
      0.6,
      true,
    );
    c.fill();
    c.stroke();
    // the seam
    ZS.wline(c, x, y - 14, x, y + 6, seed + 9, 0.5);
    // studs
    for (let i = 0; i < 3; i++) {
      const yy = y - 11 + i * 6;
      c.fillStyle = INK;
      c.beginPath();
      c.arc(x - w / 2 + 4, yy, 1, 0, 6.29);
      c.fill();
      c.beginPath();
      c.arc(x + w / 2 - 4, yy, 1, 0, 6.29);
      c.fill();
    }
  }

  /* a small wooden bridge */
  function bridge(c, x, y, w, seed) {
    c.strokeStyle = INK;
    c.lineWidth = 1.4;
    c.fillStyle = "rgba(120,90,60,0.5)";
    // the deck
    ZS.wpoly(
      c,
      [
        { x: x - w / 2, y: y - 4 },
        { x: x + w / 2, y: y - 4 },
        { x: x + w / 2, y: y + 4 },
        { x: x - w / 2, y: y + 4 },
      ],
      seed,
      0.5,
      true,
    );
    c.fill();
    c.stroke();
    // planks
    c.strokeStyle = INK_SOFT;
    c.lineWidth = 1.0;
    const planks = Math.max(2, Math.floor(w / 6));
    for (let i = 1; i < planks; i++) {
      const xx = x - w / 2 + (w * i) / planks;
      ZS.wline(c, xx, y - 3, xx, y + 3, seed + 5 + i, 0.3);
    }
    // the two side rails
    c.strokeStyle = INK;
    c.lineWidth = 1.3;
    ZS.wline(c, x - w / 2, y - 5, x + w / 2, y - 5, seed + 13, 0.3);
    ZS.wline(c, x - w / 2, y + 5, x + w / 2, y + 5, seed + 15, 0.3);
  }

  /* ---------- ruins + road ---------- */

  /* a small ruined building — a couple of broken walls */
  function ruins(c, x, y, r, seed) {
    c.strokeStyle = INK;
    c.lineWidth = 1.4;
    c.fillStyle = "rgba(160,140,110,0.28)";
    // three broken wall segments around a courtyard
    const segs = [
      [
        { x: x - r, y: y },
        { x: x - r * 0.5, y: y - r * 0.5 },
      ],
      [
        { x: x - r * 0.5, y: y - r * 0.5 },
        { x: x + r * 0.3, y: y - r * 0.7 },
      ],
      [
        { x: x + r * 0.3, y: y - r * 0.7 },
        { x: x + r, y: y - r * 0.4 },
      ],
    ];
    for (let i = 0; i < segs.length; i++) {
      const [a, b] = segs[i];
      ZS.wline(c, a.x, a.y, b.x, b.y, seed + i * 5, 0.5);
      ZS.wline(c, a.x, a.y + 5, b.x, b.y + 5, seed + i * 5 + 1, 0.5);
      // fill the segment
      ZS.wpoly(c, [a, b, { x: b.x, y: b.y + 5 }, { x: a.x, y: a.y + 5 }], seed + 30 + i, 0.5, true);
      c.fill();
      c.stroke();
    }
    // a fallen pillar
    c.lineWidth = 1.4;
    ZS.wline(c, x + r * 0.4, y + r * 0.1, x + r * 0.9, y + r * 0.5, seed + 17, 0.5);
  }

  /* a worn dirt road through a list of points */
  function road(c, points, w, seed) {
    if (!points || points.length < 2) return;
    c.fillStyle = "rgba(180,160,130,0.42)";
    c.strokeStyle = INK_SOFT;
    c.lineWidth = w;
    c.lineCap = "round";
    c.lineJoin = "round";
    ZS.wpoly(c, points, seed, w * 0.35, false);
    c.stroke();
    // a faint centre line (a tire track / cart track feel)
    c.strokeStyle = "rgba(120,100,80,0.32)";
    c.lineWidth = 0.8;
    ZS.wpoly(c, points, seed + 21, 0.9, false);
    c.stroke();
  }

  ZS.env = {
    tree,
    pine,
    oak,
    plum,
    rock,
    hill,
    river,
    pond,
    camp,
    wall,
    gate,
    bridge,
    ruins,
    road,
    wash,
  };
})();
