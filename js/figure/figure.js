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
    HBOW = 5, // 弓騎兵
    // Heavy equipment / special — same body, weapon is the read
    CATAPULT = 6, // 投石車 — operated by a crew
    RAM = 7, // 衝車 — the siege ram
    STANDARD = 8; // 旗手 — the standard bearer (any unit type)

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

  function wash(i, alpha) {
    const c = FACTIONS[i % FACTIONS.length];
    return "rgba(" + c[0] + "," + c[1] + "," + c[2] + "," + alpha + ")";
  }

  /* ---------- the base figure (§7.1) ---------- */

  /* Draws body and weapon. `k` is the tier scale; everything below is written
     at k = 1 and multiplied, so a general is the same drawing 25% larger. */
  function drawFoot(c, a, moving) {
    // Equipment types replace the stickman entirely (one figure = one wagon)
    if (a.type === CATAPULT) {
      drawCatapult(c, a);
      return;
    }
    if (a.type === RAM) {
      drawRam(c, a);
      return;
    }
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

    // standard bearers replace the personal weapon with a tall pole + cloth
    if (a.type === STANDARD) {
      drawStandard(c, a, hx, hy, k);
    } else {
      drawWeapon(c, a, hx, hy, k);
    }

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

  /* ---------- equipment: catapult + ram (drawn as a footprint that
                 replaces the stickman when a.type is CATAPULT or RAM) ----- */

  /* Catapult — 投石車. A small wobbly frame on two wheels, an arm angled
     up, and a counterweight. Drawn around (a.x, a.y), facing a.a. */
  function drawCatapult(c, a, t) {
    void t; // reserved for a future "winding up" pose
    const s = a.seed;
    const k = TIER_SCALE[a.tier || 0] * 1.1;
    const ca = Math.cos(a.a),
      sa = Math.sin(a.a);
    // chassis
    c.strokeStyle = INK;
    c.lineWidth = 1.5;
    ZS.wline(c, a.x - 14 * k, a.y + 4, a.x + 14 * k, a.y + 4, s + 1, 0.8);
    ZS.wline(c, a.x - 10 * k, a.y + 4, a.x - 10 * k, a.y + 8, s + 2, 0.5);
    ZS.wline(c, a.x + 10 * k, a.y + 4, a.x + 10 * k, a.y + 8, s + 3, 0.5);
    // wheels
    c.lineWidth = 1.2;
    ZS.wcirc(c, a.x - 9 * k, a.y + 9, 3.5 * k, s + 4, 0.5);
    ZS.wcirc(c, a.x + 9 * k, a.y + 9, 3.5 * k, s + 5, 0.5);
    // the A-frame
    ZS.wline(c, a.x - 8 * k, a.y + 4, a.x, a.y - 14 * k, s + 6, 0.6);
    ZS.wline(c, a.x + 8 * k, a.y + 4, a.x, a.y - 14 * k, s + 7, 0.6);
    // the arm (a single wline from the fulcrum angled up + a counterweight)
    const armX1 = a.x - ca * 4 * k,
      armY1 = a.y - 14 * k - sa * 4 * k;
    const armX2 = a.x + ca * 16 * k,
      armY2 = a.y - 14 * k + sa * 16 * k;
    c.lineWidth = 1.4;
    ZS.wline(c, armX1, armY1, armX2, armY2, s + 8, 0.6);
    // counterweight
    c.fillStyle = wash(a.faction, 0.4);
    ZS.wcirc(c, armX1, armY1, 3.2 * k, s + 9, 0.5);
    c.fill();
    c.stroke();
    // the stone (a small ball at the end of the arm)
    c.fillStyle = "rgba(120,110,90,0.7)";
    c.beginPath();
    c.arc(armX2, armY2, 2.2 * k, 0, 6.29);
    c.fill();
    c.stroke();
  }

  /* Ram — 衝車. A wobbly shed on wheels, a long log hanging from the
     roof. Crew visible as two stickmen behind. */
  function drawRam(c, a, t) {
    void t; // reserved for a future impact recoil
    const s = a.seed;
    const k = TIER_SCALE[a.tier || 0] * 1.05;
    const ca = Math.cos(a.a),
      sa = Math.sin(a.a);
    c.strokeStyle = INK;
    c.lineWidth = 1.5;
    // the shed (a small rectangle)
    ZS.wline(c, a.x - 12 * k, a.y - 6, a.x + 10 * k, a.y - 6, s + 1, 0.6);
    ZS.wline(c, a.x - 12 * k, a.y - 6, a.x - 12 * k, a.y + 6, s + 2, 0.5);
    ZS.wline(c, a.x + 10 * k, a.y - 6, a.x + 10 * k, a.y + 6, s + 3, 0.5);
    // the sloped roof
    ZS.wline(c, a.x - 12 * k, a.y - 6, a.x - 8 * k, a.y - 12 * k, s + 4, 0.5);
    ZS.wline(c, a.x + 10 * k, a.y - 6, a.x + 6 * k, a.y - 12 * k, s + 5, 0.5);
    ZS.wline(c, a.x - 8 * k, a.y - 12 * k, a.x + 6 * k, a.y - 12 * k, s + 6, 0.5);
    // the wheels
    c.lineWidth = 1.2;
    ZS.wcirc(c, a.x - 8 * k, a.y + 7, 3.5 * k, s + 7, 0.5);
    ZS.wcirc(c, a.x + 6 * k, a.y + 7, 3.5 * k, s + 8, 0.5);
    // the ram log — a long wline sticking out the front
    const tipX = a.x + ca * 22 * k,
      tipY = a.y + sa * 22 * k;
    c.lineWidth = 1.6;
    ZS.wline(c, a.x + 10 * k, a.y, tipX, tipY, s + 9, 0.7);
    // the metal head
    c.fillStyle = "rgba(120,110,90,0.7)";
    c.beginPath();
    c.arc(tipX, tipY, 2.2 * k, 0, 6.29);
    c.fill();
    c.stroke();
  }

  /* Standard bearer — replaces the body weapon with a tall banner pole
     that has the faction flag on it. Keeps the same stickman body so it
     reads as a "man with a flag" rather than a new unit.

     If `a.flag` is set, the cloth is drawn from the full ZS.flag system
     (shape, color, text, all from a preset like `shu` / `cao_cao` /
     `flag_wei_cao`). Otherwise the bearer carries the generic faction
     sash — backwards compatible with callers that never set a.flag. */
  function drawStandard(c, a, hx, hy, k) {
    const s = a.seed;
    c.strokeStyle = INK;
    c.lineWidth = 1.4;
    // the pole
    const poleX = hx - 4 * k,
      poleTop = hy - 30 * k;
    const poleBot = hy + 5 * k;
    ZS.wline(c, poleX, poleBot, poleX, poleTop, s + 31, 0.5);
    const w = 12 * k;
    if (a.flag && ZS.flag && ZS.flag.draw) {
      // the full flag, scaled to the bearer's reach
      const fy = poleTop - 1;
      ZS.flag.draw(c, a.flag, poleX - w, fy, w * 1.6, 18 * k, 0);
    } else {
      // the cloth: two wpoly waves on the pole
      c.fillStyle = wash(a.faction, 0.6);
      ZS.wpoly(
        c,
        [
          { x: poleX, y: poleTop + 2 },
          { x: poleX - w, y: poleTop + 2 + ZS.sjit(s) * 0.6 },
          { x: poleX - w, y: poleTop + 18 * k },
          { x: poleX, y: poleTop + 16 * k },
        ],
        s + 33,
        0.6,
        true,
      );
      c.fill();
      c.stroke();
      // a glyph square — a single wline on the cloth (e.g. a 將 character mark)
      c.strokeStyle = INK_SOFT;
      c.lineWidth = 1.2;
      ZS.wline(
        c,
        poleX - w * 0.5,
        poleTop + 6 * k,
        poleX - w * 0.5,
        poleTop + 12 * k,
        s + 35,
        0.4,
      );
      ZS.wline(
        c,
        poleX - w * 0.7,
        poleTop + 9 * k,
        poleX - w * 0.3,
        poleTop + 9 * k,
        s + 36,
        0.4,
      );
    }
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
    const str = a.name;
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
    CATAPULT,
    RAM,
    STANDARD,
    TROOPER,
    NCO,
    OFFICER,
    GENERAL,
    TIER_SCALE,
    FACTIONS,
    INK,
    wash,
    drawFoot,
    drawRider,
    drawMarks,
    drawWeapon,
    drawShield,
    drawCatapult,
    drawRam,
    drawStandard,
  };
})();
