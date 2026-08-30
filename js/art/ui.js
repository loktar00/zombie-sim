/* ZS.uiArt — UI icons and badges for 火柴三國.
 *
 * Reusable little pieces: faction banners, save-slot thumbnails, button
 * glyphs (the sword-and-shield for "battle", the scroll for "campaign"), and
 * a few decorative bits (a brushstroke seal, a tally mark). Everything is
 * drawn through the same sketch primitives, with a `seed` for the boil.
 */
(() => {
  "use strict";
  const ZS = (window.ZS = window.ZS || {});

  const INK = "rgb(61,52,43)";
  const INK_SOFT = "rgba(61,52,43,0.5)";
  const PAPER = "#f3edde";

  const FACTIONS = [
    [70, 96, 150], [150, 54, 44], [64, 132, 74], [150, 120, 60],
    [120, 80, 140], [60, 130, 130], [120, 86, 60], [96, 104, 120],
  ];
  function wash(i, a) {
    const c = FACTIONS[i % FACTIONS.length];
    return "rgba(" + c[0] + "," + c[1] + "," + c[2] + "," + a + ")";
  }

  /* ---------- faction banner ----------
   *
   * A small vertical banner with a triangular cut at the bottom — a faction's
   * "flag" badge. Used in save-slot rows, the campaign roster, and the menu
   * pick-faction panel.
   *
   *   banner(c, faction, x, y, w, h, seed)
   */
  function banner(c, faction, x, y, w, h, seed) {
    c.strokeStyle = INK;
    c.lineWidth = 1.3;
    // the pole
    ZS.wline(c, x - w * 0.45, y - h * 0.5, x - w * 0.45, y + h * 0.55, seed, 0.4);
    // the finial
    c.beginPath();
    c.arc(x - w * 0.45, y - h * 0.55, w * 0.08, 0, 6.29);
    c.fillStyle = INK;
    c.fill();
    // the cloth
    c.fillStyle = wash(faction, 0.75);
    ZS.wpoly(
      c,
      [
        { x: x - w * 0.4, y: y - h * 0.45 },
        { x: x + w * 0.5, y: y - h * 0.42 },
        { x: x + w * 0.5, y: y + h * 0.2 },
        { x: x + w * 0.05, y: h > 0 ? y + h * 0.32 : y + h * 0.32 },
        { x: x - w * 0.4, y: y + h * 0.25 },
      ],
      seed + 1,
      0.6,
      true,
    );
    c.fill();
    c.stroke();
    // a single brushstroke "seal" on the cloth — a circle + a slash
    c.strokeStyle = INK;
    c.lineWidth = 1.4;
    c.beginPath();
    c.arc(x + w * 0.05, y - h * 0.12, w * 0.18, 0, 6.29);
    c.stroke();
    ZS.wline(
      c,
      x - w * 0.05,
      y - h * 0.2,
      x + w * 0.18,
      y - h * 0.05,
      seed + 7,
      0.5,
    );
  }

  /* ---------- save-slot thumbnail ----------
   *
   * A small landscape: a hill, a couple of trees, the player's banner
   * flying. Used in the load-game panel.
   */
  function saveThumb(c, x, y, w, h, faction, seed) {
    c.fillStyle = PAPER;
    c.fillRect(x, y, w, h);
    // a frame
    c.strokeStyle = INK_SOFT;
    c.lineWidth = 1.2;
    ZS.sketchRect(c, x + 2, y + 2, w - 4, h - 4);
    // a hill
    ZS.env.hill(c, x + w * 0.5, y + h * 0.65, w * 0.85, h * 0.5, seed);
    // a banner
    banner(c, faction, x + w * 0.78, y + h * 0.55, w * 0.25, h * 0.45, seed + 9);
  }

  /* ---------- icons (the chrome glyphs) ---------- */

  /* sword + shield — the "battle" button glyph */
  function iconBattle(c, x, y, size, seed) {
    c.strokeStyle = INK;
    c.lineWidth = 1.4;
    // the sword: a vertical line + crossguard
    ZS.wline(c, x, y - size * 0.45, x, y + size * 0.4, seed, 0.4);
    ZS.wline(c, x - size * 0.18, y - size * 0.15, x + size * 0.18, y - size * 0.15, seed + 1, 0.3);
    // the shield: a small rounded square
    c.fillStyle = "rgba(150,54,44,0.35)";
    ZS.wpoly(
      c,
      [
        { x: x + size * 0.18, y: y - size * 0.3 },
        { x: x + size * 0.45, y: y - size * 0.2 },
        { x: x + size * 0.45, y: y + size * 0.15 },
        { x: x + size * 0.3, y: y + size * 0.3 },
        { x: x + size * 0.18, y: y + size * 0.18 },
      ],
      seed + 3,
      0.4,
      true,
    );
    c.fill();
    c.stroke();
  }

  /* a scroll — the "campaign" button glyph */
  function iconCampaign(c, x, y, size, seed) {
    c.strokeStyle = INK;
    c.lineWidth = 1.4;
    // the rolled ends
    ZS.wline(c, x - size * 0.35, y - size * 0.3, x - size * 0.35, y + size * 0.3, seed, 0.4);
    ZS.wline(c, x + size * 0.35, y - size * 0.3, x + size * 0.35, y + size * 0.3, seed + 1, 0.4);
    // the body
    c.fillStyle = "rgba(220,210,180,0.6)";
    ZS.wpoly(
      c,
      [
        { x: x - size * 0.35, y: y - size * 0.3 },
        { x: x + size * 0.35, y: y - size * 0.3 },
        { x: x + size * 0.35, y: y + size * 0.3 },
        { x: x - size * 0.35, y: y + size * 0.3 },
      ],
      seed + 3,
      0.4,
      true,
    );
    c.fill();
    c.stroke();
    // text lines
    c.strokeStyle = INK_SOFT;
    c.lineWidth = 1.0;
    for (let i = 0; i < 3; i++) {
      const yy = y - size * 0.18 + i * size * 0.18;
      ZS.wline(c, x - size * 0.25, yy, x + size * 0.18, yy, seed + 11 + i, 0.3);
    }
  }

  /* a flag — the "settings" or "factions" button glyph */
  function iconFlag(c, x, y, size, seed) {
    c.strokeStyle = INK;
    c.lineWidth = 1.4;
    ZS.wline(c, x - size * 0.15, y - size * 0.5, x - size * 0.15, y + size * 0.45, seed, 0.4);
    c.fillStyle = "rgba(70,96,150,0.55)";
    ZS.wpoly(
      c,
      [
        { x: x - size * 0.15, y: y - size * 0.45 },
        { x: x + size * 0.35, y: y - size * 0.35 },
        { x: x + size * 0.35, y: y - size * 0.05 },
        { x: x - size * 0.15, y: y - size * 0.1 },
      ],
      seed + 1,
      0.4,
      true,
    );
    c.fill();
    c.stroke();
  }

  /* a small "music on / off" toggle — a quaver note or a slash */
  function iconMusic(c, x, y, size, seed, on) {
    c.strokeStyle = INK;
    c.lineWidth = 1.4;
    ZS.wline(c, x - size * 0.2, y + size * 0.4, x - size * 0.2, y - size * 0.3, seed, 0.4);
    ZS.wline(c, x - size * 0.2, y - size * 0.3, x + size * 0.2, y - size * 0.4, seed + 1, 0.4);
    // the head
    c.beginPath();
    c.arc(x - size * 0.2, y + size * 0.4, size * 0.12, 0, 6.29);
    c.fillStyle = INK;
    c.fill();
    if (!on) {
      // a slash through it
      c.strokeStyle = "rgba(150,54,44,0.85)";
      c.lineWidth = 1.8;
      ZS.wline(c, x - size * 0.4, y - size * 0.4, x + size * 0.4, y + size * 0.4, seed + 3, 0.3);
    }
  }

  /* a brushstroke seal — a square stamp with a single character mark */
  function seal(c, x, y, size, seed) {
    c.fillStyle = "rgba(150,54,44,0.7)";
    c.fillRect(x - size / 2, y - size / 2, size, size);
    c.strokeStyle = INK;
    c.lineWidth = 1.0;
    ZS.sketchRect(c, x - size / 2 + 1, y - size / 2 + 1, size - 2, size - 2);
    // a single wline in white inside the seal — abstract, just a texture
    c.strokeStyle = PAPER;
    c.lineWidth = 1.6;
    ZS.wline(c, x - size * 0.2, y - size * 0.1, x + size * 0.1, y + size * 0.2, seed, 0.4);
  }

  /* a tally mark (troop count read in the campaign) — a small group of
     vertical strokes, 5 with a slash */
  function tally(c, x, y, h, count, seed) {
    c.strokeStyle = INK;
    c.lineWidth = 1.4;
    const bundle = Math.floor(count / 5);
    const rem = count % 5;
    for (let b = 0; b < bundle; b++) {
      const bx = x + b * h * 0.55;
      for (let i = 0; i < 4; i++) {
        const xx = bx + i * (h * 0.12);
        ZS.wline(c, xx, y, xx, y - h, seed + b * 9 + i, 0.3);
      }
      // the slash
      ZS.wline(c, bx, y - h, bx + h * 0.4, y, seed + b * 9 + 7, 0.4);
      // the 5th
      ZS.wline(c, bx + h * 0.4, y, bx + h * 0.4, y - h, seed + b * 9 + 8, 0.3);
    }
    if (rem > 0) {
      const bx = x + bundle * h * 0.55;
      for (let i = 0; i < rem; i++) {
        const xx = bx + i * (h * 0.12);
        ZS.wline(c, xx, y, xx, y - h, seed + 100 + i, 0.3);
      }
    }
  }

  /* ---------- the menu's title banner ----------
   *
   * The big cloth banner behind the title. Mirrors the one app.js draws but
   * with more layered detail — the corners are tied, a faint pattern is
   * woven in. Used at the top of the menu, and reused on the result card.
   */
  function titleBanner(c, cx, baseY, size, titleW, t) {
    const half = Math.max(titleW / 2 + size * 0.35, size * 1.2);
    const top = baseY - size * 1.05;
    const bot = baseY + size * 0.35;
    const x = cx - half;
    const x2 = cx + half;
    c.strokeStyle = INK_SOFT;
    c.lineWidth = 1.6;
    // the two poles
    ZS.wline(c, x, top, x, bot, 71.1, 1.4);
    ZS.wline(c, x2, top, x2, bot, 73.7, 1.4);
    // pole caps
    c.beginPath();
    c.arc(x, top, 3, 0, 6.29);
    c.fillStyle = INK;
    c.fill();
    c.beginPath();
    c.arc(x2, top, 3, 0, 6.29);
    c.fill();
    // the cloth, with a sway
    const sway = Math.sin(t * 0.6) * size * 0.05;
    const pts = [
      { x: x + 6, y: top + size * 0.1 },
      { x: x2 - 6, y: top + size * 0.1 + sway },
      { x: x2 - 6, y: top + size * 0.26 + sway },
      { x: x + 6, y: top + size * 0.26 },
    ];
    ZS.wpoly(c, pts, 88.2, 1.6, true);
    c.fillStyle = "rgba(150,54,44,0.10)";
    c.fill();
    c.strokeStyle = INK_SOFT;
    c.lineWidth = 1.2;
    c.stroke();
    // a faint woven pattern — a few cross-hatches
    c.strokeStyle = "rgba(150,54,44,0.18)";
    c.lineWidth = 0.9;
    const cy0 = top + size * 0.16;
    for (let i = 0; i < 5; i++) {
      const xx = x + 12 + i * ((x2 - x - 24) / 5);
      ZS.wline(c, xx, cy0, xx + 6, cy0 + size * 0.04, 90 + i, 0.3);
    }
  }

  ZS.uiArt = {
    banner,
    saveThumb,
    iconBattle,
    iconCampaign,
    iconFlag,
    iconMusic,
    seal,
    tally,
    titleBanner,
    wash,
  };
})();
