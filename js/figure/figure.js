/* ZS.figure — the stickman baseline (SANGUO-DESIGN.md §7).

   §7 freezes the Cannae matchstick figure as *the* spec: one body, and every
   unit type, rank and faction is a small cheap variation on it. This file is
   that spec made executable, so nothing else in the game invents its own
   soldier. New art has to justify itself against what is here.

     drawFoot(c, a, moving)   the base body + this type's weapon    (§7.1, §7.3)
     drawRider(c, a, moving)  the mounted variant                   (§7.3)
     drawMarks(c, a, t, mv)   flash, panic, rank, sash, banner, aura(§7.4)

   Anchored at (a.x, a.y) = the point between the feet; ~20 px tall at scale 1
   and zoom 1. Every part takes `a.seed + <fixed offset>` so it boils stably
   instead of re-seeding each frame.

   The agent fields this reads: x y a seed gait vx vy side type tier flash
   fleeing rallyT atk thr hp. */
(() => {
  "use strict";
  const ZS = (window.ZS = window.ZS || {});

  const INK = "rgb(61,52,43)";
  const SHADOW = "rgba(40,35,25,0.14)";

  /* Unit types — silhouette is the read (§7.3). */
  const SPEAR = 0, // 槍兵
    DAO = 1, // 刀盾兵
    BOW = 2, // 弩兵
    JI = 3, // 戟兵
    CAV = 4, // 騎兵
    HBOW = 5; // 弓騎兵

  /* Rank tiers — size plus marks, still one body (§7.4). */
  const TROOPER = 0,
    NCO = 1,
    OFFICER = 2,
    GENERAL = 3;
  const TIER_SCALE = [1, 1.05, 1.12, 1.25];

  /* Faction ramp (§7.2). Assigned at campaign start; the player's faction
     always takes slot 0. Used as a low-alpha wash plus the ink line. */
  const FACTIONS = [
    [70, 96, 150], // blue
    [150, 54, 44], // red
    [64, 132, 74], // green
    [150, 120, 60], // ochre
    [120, 80, 140], // violet
    [60, 130, 130], // teal
    [120, 86, 60], // brown
    [96, 104, 120], // slate
  ];

  // Reused geometry for the render LODs. These arrays are mutated in place;
  // a 4,000-figure fit view must not trade stroke cost for garbage collection.
  const MID_HORSE = [
    { x: 0, y: 0 },
    { x: 0, y: 0 },
    { x: 0, y: 0 },
    { x: 0, y: 0 },
  ];
  const MASS_QUAD = [
    { x: 0, y: 0 },
    { x: 0, y: 0 },
    { x: 0, y: 0 },
    { x: 0, y: 0 },
  ];
  const MASS_FLAG = [
    { x: 0, y: 0 },
    { x: 0, y: 0 },
    { x: 0, y: 0 },
  ];

  function wash(i, alpha) {
    const c = FACTIONS[i % FACTIONS.length];
    return "rgba(" + c[0] + "," + c[1] + "," + c[2] + "," + alpha + ")";
  }

  /* ---------- the base figure (§7.1) ---------- */

  /* Draws body and weapon. `k` is the tier scale; everything below is written
     at k = 1 and multiplied, so a general is the same drawing 25% larger. */
  function drawFoot(c, a, moving) {
    const s = a.seed;
    const k = TIER_SCALE[a.tier || 0];
    const g = Math.sin(a.gait) * 3 * k * Math.min(1, moving / 26 + 0.25);

    c.strokeStyle = SHADOW;
    c.lineWidth = 1.2;
    ZS.wcirc(c, a.x, a.y + 5.5 * k, 5.5 * k, s + 3, 1.4);

    c.strokeStyle = INK;
    c.lineWidth = 1.5;
    c.lineCap = "round";
    const hx = a.x + ZS.sjit(s) * 0.4,
      hy = a.y - 14 * k;
    // legs
    ZS.wline(c, a.x, a.y - 1, a.x + g + ZS.sjit(s + 1) * 0.5, a.y + 5.5 * k, s + 11, 1.1);
    ZS.wline(c, a.x, a.y - 1, a.x - g + ZS.sjit(s + 2) * 0.5, a.y + 5.5 * k, s + 17, 1.1);
    // torso + head
    ZS.wline(c, hx, hy + 4 * k, a.x, a.y - 1, s + 23, 1);
    ZS.wcirc(c, hx, hy, 4.2 * k, s + 29, 0.8);

    drawWeapon(c, a, hx, hy, k);

    // face: one dot on the forward side
    const ca = Math.cos(a.a);
    c.fillStyle = INK;
    c.beginPath();
    c.arc(hx + ca * 1.6 * k - 0.8, hy - 0.6, 0.6 * k, 0, 6.29);
    c.fill();
    c.beginPath();
    c.arc(hx + ca * 1.6 * k + 0.9, hy - 0.3, 0.6 * k, 0, 6.29);
    c.fill();
  }

  /* Mid LOD: keep exactly the silhouette-bearing parts — head, torso and
     weapon — while omitting gait, face, shadow and small horse anatomy. */
  function drawMid(c, a) {
    if (a.type === CAV || a.type === HBOW) {
      drawMidRider(c, a);
      return;
    }
    const s = a.seed;
    const k = TIER_SCALE[a.tier || 0];
    const hx = a.x + ZS.sjit(s) * 0.3;
    const hy = a.y - 14 * k;
    c.strokeStyle = INK;
    c.lineWidth = 1.4;
    c.lineCap = "round";
    ZS.wline(c, hx, hy + 4 * k, a.x, a.y, s + 23, 0.8);
    ZS.wcirc(c, hx, hy, 4 * k, s + 29, 0.65);
    drawWeapon(c, a, hx, hy, k);
  }

  function drawMidRider(c, a) {
    const s = a.seed;
    const ca = Math.cos(a.a);
    const sa = Math.sin(a.a);
    const px = -sa;
    const py = ca;
    const bx = a.x;
    const by = a.y - 6;
    setPoint(MID_HORSE[0], bx - ca * 11 - px * 4, by - sa * 11 - py * 4);
    setPoint(MID_HORSE[1], bx - ca * 8 + px * 4, by - sa * 8 + py * 4);
    setPoint(MID_HORSE[2], bx + ca * 10 + px * 4, by + sa * 10 + py * 4);
    setPoint(MID_HORSE[3], bx + ca * 7 - px * 4, by + sa * 7 - py * 4);
    c.fillStyle = wash(a.faction, 0.16);
    c.strokeStyle = INK;
    c.lineWidth = 1.2;
    ZS.wpoly(c, MID_HORSE, s + 5, 0.65, true);
    c.fill();
    c.stroke();
    const rx = bx - px;
    const ry = by - 8;
    ZS.wline(c, rx, ry, rx - px * 1.5, ry - 7, s + 31, 0.55);
    ZS.wcirc(c, rx - px * 1.5, ry - 10, 3, s + 33, 0.5);
    if (a.type === HBOW) {
      ZS.wcirc(c, rx + ca * 7, ry - 5 + sa * 4, 3.4, s + 36, 0.5);
      c.stroke();
    } else {
      ZS.wline(c, rx, ry - 5, rx + ca * 16, ry - 5 + sa * 9, s + 36, 0.6);
    }
  }

  /* Far LOD: one call represents an entire still-formed unit as three rank
     washes with ink hatching and a single flag. Routed units deliberately do
     not use this path; the scenario keeps a sparse set of individual bodies. */
  function drawFarUnit(c, u) {
    const ch = Math.cos(u.head);
    const sh = Math.sin(u.head);
    let minL = Infinity;
    let maxL = -Infinity;
    let minF = Infinity;
    let maxF = -Infinity;
    let alive = 0;
    for (let i = 0; i < u.mem.length; i++) {
      const a = u.mem[i];
      if (a.dead || a.gone || a.fleeing) continue;
      const dx = a.x - u.cx;
      const dy = a.y - u.cy;
      const l = dx * sh - dy * ch;
      const f = dx * ch + dy * sh;
      if (l < minL) minL = l;
      if (l > maxL) maxL = l;
      if (f < minF) minF = f;
      if (f > maxF) maxF = f;
      alive++;
    }
    if (!alive) return;
    if (maxL - minL < 20) {
      minL -= 10;
      maxL += 10;
    }
    if (maxF - minF < 18) {
      minF -= 9;
      maxF += 9;
    }
    const bands = alive > 24 ? 3 : 2;
    const seed = u.uid * 97;
    c.fillStyle = wash(u.faction, 0.2);
    c.strokeStyle = wash(u.faction, 0.58);
    c.lineWidth = 1.15;
    for (let b = 0; b < bands; b++) {
      const f0 = minF + ((maxF - minF) * b) / bands;
      const f1 = minF + ((maxF - minF) * (b + 0.78)) / bands;
      setUnitPoint(MASS_QUAD[0], u, minL, f0, ch, sh);
      setUnitPoint(MASS_QUAD[1], u, maxL, f0, ch, sh);
      setUnitPoint(MASS_QUAD[2], u, maxL, f1, ch, sh);
      setUnitPoint(MASS_QUAD[3], u, minL, f1, ch, sh);
      ZS.wpoly(c, MASS_QUAD, seed + b * 11, 1.1, true);
      c.fill();
      c.stroke();
      const fm = (f0 + f1) * 0.5;
      setUnitPoint(MASS_QUAD[0], u, minL, fm, ch, sh);
      setUnitPoint(MASS_QUAD[1], u, maxL, fm, ch, sh);
      ZS.wline(
        c,
        MASS_QUAD[0].x,
        MASS_QUAD[0].y,
        MASS_QUAD[1].x,
        MASS_QUAD[1].y,
        seed + b * 11 + 5,
        0.7,
      );
    }
    if (u.general && !u.general.dead) {
      c.strokeStyle = wash(u.faction, 0.14);
      c.lineWidth = 1.2;
      ZS.wcirc(c, u.general.x, u.general.y, u.general.auraR || 90, seed + 61, 1.4);
    }
    const fx = u.cx + 5;
    const fy = u.cy - 25;
    c.strokeStyle = INK;
    c.lineWidth = 1.1;
    ZS.wline(c, fx, u.cy, fx, fy, seed + 71, 0.6);
    setPoint(MASS_FLAG[0], fx, fy);
    setPoint(MASS_FLAG[1], fx + 10, fy + 2);
    setPoint(MASS_FLAG[2], fx, fy + 6);
    c.fillStyle = wash(u.faction, 0.52);
    ZS.wpoly(c, MASS_FLAG, seed + 73, 0.55, true);
    c.fill();
    c.stroke();
  }

  function setPoint(p, x, y) {
    p.x = x;
    p.y = y;
  }

  function setUnitPoint(p, u, l, f, ch, sh) {
    p.x = u.cx + l * sh + f * ch;
    p.y = u.cy - l * ch + f * sh;
  }

  /* ---------- weapons: the type read (§7.3) ---------- */

  function drawWeapon(c, a, hx, hy, k) {
    const s = a.seed;
    const ca = Math.cos(a.a),
      sa = Math.sin(a.a);
    const shx = hx + ca * 3 * k,
      shy = hy + 5 * k + sa * 2 * k;
    c.lineWidth = 1.2;
    c.strokeStyle = INK;

    switch (a.type) {
      case DAO: {
        // short blade forward, shield on the off-arm
        const thrust = a.atk > 0 ? 4 : 0;
        ZS.wline(
          c,
          shx,
          shy,
          shx + ca * (7 + thrust) * k,
          shy + sa * (4 + thrust * 0.5) * k,
          s + 31,
          0.7,
        );
        ZS.wline(c, hx, hy + 5 * k, shx, shy, s + 39, 0.8);
        drawShield(c, a, hx, hy, k);
        break;
      }
      case BOW: {
        // crossbow held level; the tick is the stock
        const wind = a.thr > 0 ? 1.6 : 0;
        ZS.wline(
          c,
          shx - ca * 3 * k,
          shy,
          shx + ca * (8 + wind) * k,
          shy + sa * 4 * k,
          s + 31,
          0.7,
        );
        ZS.wline(
          c,
          shx + ca * 5 * k - sa * 3 * k,
          shy + sa * 3 * k + ca * 3 * k,
          shx + ca * 5 * k + sa * 3 * k,
          shy + sa * 3 * k - ca * 3 * k,
          s + 34,
          0.6,
        );
        ZS.wline(c, hx, hy + 5 * k, shx, shy, s + 39, 0.8);
        break;
      }
      case JI: {
        // halberd: the long shaft plus a cross near the tip
        const thrust = a.atk > 0 ? 6 : 0;
        const tipX = shx + ca * (15 + thrust) * k,
          tipY = shy + sa * (8 + thrust * 0.5) * k;
        ZS.wline(c, shx - ca * 5 * k, shy - sa * 3 * k, tipX, tipY, s + 31, 0.7);
        const bx = tipX - ca * 3.5 * k,
          by = tipY - sa * 3.5 * k;
        ZS.wline(
          c,
          bx - sa * 3.4 * k,
          by + ca * 3.4 * k,
          bx + sa * 2 * k,
          by - ca * 2 * k,
          s + 34,
          0.5,
        );
        ZS.wline(c, hx, hy + 5 * k, shx, shy, s + 39, 0.8);
        break;
      }
      default: {
        // 槍 — the long spear, angled up at rest, level in the thrust
        const thrust = a.atk > 0 ? 6 : 0;
        const rest = a.atk > 0 ? 0 : -4 * k;
        ZS.wline(
          c,
          shx - ca * 4 * k,
          shy - sa * 2 * k - rest * 0.4,
          shx + ca * (13 + thrust) * k,
          shy + sa * (7 + thrust * 0.5) * k + rest,
          s + 31,
          0.7,
        );
        ZS.wline(c, hx, hy + 5 * k, shx, shy, s + 39, 0.8);
        drawShield(c, a, hx, hy, k);
      }
    }
  }

  /* Round shield in the faction wash, on the off-arm. */
  function drawShield(c, a, hx, hy, k) {
    const ca = Math.cos(a.a),
      sa = Math.sin(a.a);
    const px = -sa,
      py = ca;
    const ox = hx - px * 6 * k,
      oy = hy + 4 * k - py * 6 * k;
    c.lineWidth = 1.2;
    c.strokeStyle = INK;
    c.fillStyle = wash(a.faction, 0.34);
    ZS.wcirc(c, ox, oy, 5 * k, a.seed + 33, 0.8);
    c.fill();
    c.stroke();
    ZS.wline(c, hx, hy + 5 * k, ox, oy, a.seed + 37, 0.8);
  }

  /* ---------- the mounted variant (§7.3) ---------- */

  function drawRider(c, a, moving) {
    const s = a.seed;
    const g = Math.sin(a.gait * 1.4) * 4 * Math.min(1, moving / 90 + 0.3);
    const ca = Math.cos(a.a),
      sa = Math.sin(a.a);
    const px = -sa,
      py = ca;
    c.strokeStyle = SHADOW;
    c.lineWidth = 1.2;
    ZS.wcirc(c, a.x, a.y + 4, 12, s + 3, 1.6);
    c.strokeStyle = INK;
    c.lineWidth = 1.4;
    c.lineCap = "round";
    const bx = a.x,
      by = a.y - 6;
    // horse body
    ZS.wpoly(
      c,
      [
        { x: bx - ca * 12 - px * 4.5, y: by - sa * 12 - py * 4.5 },
        { x: bx - ca * 8 + px * 4.5, y: by - sa * 8 + py * 4.5 },
        { x: bx + ca * 11 + px * 4, y: by + sa * 11 + py * 4 },
        { x: bx + ca * 7 - px * 4, y: by + sa * 7 - py * 4 },
      ],
      s + 5,
      0.8,
      true,
    );
    c.stroke();
    // neck, head
    const nx = bx + ca * 12,
      ny = by + sa * 12;
    ZS.wline(c, nx, ny, nx + ca * 7 - px * 4, ny + sa * 7 - py * 4, s + 9, 0.7);
    ZS.wline(
      c,
      nx + ca * 7 - px * 4,
      ny + sa * 7 - py * 4,
      nx + ca * 11 - px * 6,
      ny + sa * 11 - py * 1,
      s + 13,
      0.6,
    );
    // legs, striding with the gait
    const hfx = bx + ca * 9,
      hfy = by + sa * 9;
    const hrx = bx - ca * 9,
      hry = by - sa * 9;
    ZS.wline(
      c,
      hfx + px * 2.5,
      hfy + py * 2.5,
      hfx + px * 2.5 + ca * g,
      hfy + py * 2.5 + 8,
      s + 15,
      0.9,
    );
    ZS.wline(
      c,
      hfx - px * 2.5,
      hfy - py * 2.5,
      hfx - px * 2.5 - ca * g,
      hfy - py * 2.5 + 8,
      s + 19,
      0.9,
    );
    ZS.wline(
      c,
      hrx + px * 2.5,
      hry + py * 2.5,
      hrx + px * 2.5 - ca * g,
      hry + py * 2.5 + 8,
      s + 21,
      0.9,
    );
    ZS.wline(
      c,
      hrx - px * 2.5,
      hry - py * 2.5,
      hrx - px * 2.5 + ca * g,
      hry - py * 2.5 + 8,
      s + 23,
      0.9,
    );
    // tail
    ZS.wline(c, bx - ca * 12, by - sa * 12, bx - ca * 17, by - sa * 17 + 3, s + 25, 0.8);
    // rider
    const rx = bx - px,
      ry = by - 8;
    c.lineWidth = 1.3;
    ZS.wline(c, rx, ry, rx - px * 1.5, ry - 7, s + 31, 0.6);
    ZS.wcirc(c, rx - px * 1.5, ry - 10, 3, s + 33, 0.6);
    if (a.type === HBOW) {
      // bow held across: two short arms and a curve
      ZS.wline(c, rx, ry - 5, rx + ca * 5 - px * 3, ry - 5 + sa * 3, s + 35, 0.7);
      c.lineWidth = 1;
      ZS.wcirc(c, rx + ca * 7, ry - 5 + sa * 4, 3.4, s + 36, 0.6);
      c.stroke();
    } else {
      // lance, couched
      ZS.wline(c, rx, ry - 5, rx + ca * 6, ry - 5 + sa * 3, s + 35, 0.7);
      ZS.wline(c, rx + ca * 6, ry - 5 + sa * 3, rx + ca * 16, ry - 5 + sa * 9, s + 36, 0.7);
      c.lineWidth = 1.1;
      c.fillStyle = wash(a.faction, 0.3);
      ZS.wcirc(c, rx - px * 4, ry - 4 - py, 3.6, s + 37, 0.5);
      c.fill();
      c.stroke();
    }
  }

  /* ---------- rank marks, sash, banner, aura (§7.4) ---------- */

  function drawMarks(c, a, t, moving) {
    const s = a.seed;
    const k = TIER_SCALE[a.tier || 0];

    // panic: motion ticks trailing a running man
    if (a.fleeing && a.rallyT <= 0 && moving > 40) {
      c.strokeStyle = "rgba(60,55,45,0.5)";
      c.lineWidth = 1;
      const bx = -Math.cos(a.a),
        by = -Math.sin(a.a);
      ZS.wline(c, a.x + bx * 9, a.y - 14 + by * 5, a.x + bx * 15, a.y - 15 + by * 5, s + 47, 0.7);
      ZS.wline(c, a.x + bx * 8, a.y - 10 + by * 4, a.x + bx * 14, a.y - 11 + by * 4, s + 53, 0.7);
    }

    // hit flash: a red scribble blooming outward
    if (a.flash > 0) {
      c.strokeStyle = "rgba(150,40,30," + Math.min(0.8, a.flash).toFixed(2) + ")";
      c.lineWidth = 1.3;
      const r = 8 + (1 - a.flash) * 14;
      for (let i = 0; i < 6; i++) {
        const an = (i / 6) * 6.283 + a.seed;
        ZS.wline(
          c,
          a.x + Math.cos(an) * r * 0.4,
          a.y - 6 + Math.sin(an) * r * 0.4,
          a.x + Math.cos(an) * r,
          a.y - 6 + Math.sin(an) * r,
          s + i * 3,
          0.8,
        );
      }
    }

    const tier = a.tier || 0;
    if (tier === TROOPER) return;

    // 什長 and up carry the little unit flag
    c.strokeStyle = INK;
    c.lineWidth = 1.1;
    const fx = a.x + 5 * k,
      fy = a.y - 30 * k;
    ZS.wline(c, fx, a.y - 18 * k, fx, fy, s + 59, 0.5);
    c.fillStyle = wash(a.faction, 0.55);
    ZS.wpoly(
      c,
      [
        { x: fx, y: fy },
        { x: fx + (7 + ZS.jit(s) * 1.2) * k, y: fy + 2 },
        { x: fx, y: fy + 4.5 * k },
      ],
      s + 60,
      0.4,
      true,
    );
    c.fill();

    // 校尉 and up wear the faction sash across the torso
    if (tier >= OFFICER) {
      c.strokeStyle = wash(a.faction, 0.75);
      c.lineWidth = 1.6;
      ZS.wline(c, a.x - 3.5 * k, a.y - 12 * k, a.x + 3.5 * k, a.y - 5 * k, s + 63, 0.7);
    }

    // 將: the leadership aura and a named banner
    if (tier === GENERAL) {
      const r = a.auraR || 90;
      c.strokeStyle = wash(a.faction, 0.16);
      c.lineWidth = 1.4;
      ZS.wcirc(c, a.x, a.y, r, s + 71, r * 0.02);
      if (a.name) drawBanner(c, a, k, t);
    }
  }

  /* Vertical pole and cloth, the general's name written down it. */
  function drawBanner(c, a, k, t) {
    const s = a.seed;
    const px = a.x - 11 * k;
    const top = a.y - 46 * k;
    const bot = a.y - 16 * k;
    c.strokeStyle = INK;
    c.lineWidth = 1.2;
    ZS.wline(c, px, top, px, bot, s + 77, 0.7);
    const sway = Math.sin(t * 1.7 + s) * 0.9;
    const w = 11 * k;
    ZS.wpoly(
      c,
      [
        { x: px, y: top + 1 },
        { x: px - w, y: top + 1 + sway },
        { x: px - w, y: top + 26 * k + sway },
        { x: px, y: top + 26 * k },
      ],
      s + 79,
      0.9,
      true,
    );
    c.fillStyle = wash(a.faction, 0.22);
    c.fill();
    c.strokeStyle = INK;
    c.lineWidth = 1;
    c.stroke();
    // the name, written down the cloth
    c.fillStyle = INK;
    const size = 8 * k;
    const str = ZS.i18n ? ZS.i18n.t(a.name) : String(a.name);
    for (let i = 0; i < str.length && i < 3; i++) {
      ZS.boilText(c, str[i], px - w / 2, top + 9 * k + i * size * 1.15, size, s + 90 + i, "center");
    }
  }

  ZS.figure = {
    SPEAR,
    DAO,
    BOW,
    JI,
    CAV,
    HBOW,
    TROOPER,
    NCO,
    OFFICER,
    GENERAL,
    TIER_SCALE,
    FACTIONS,
    INK,
    wash,
    drawFoot,
    drawMid,
    drawFarUnit,
    drawRider,
    drawMarks,
    drawWeapon,
    drawShield,
  };
})();
