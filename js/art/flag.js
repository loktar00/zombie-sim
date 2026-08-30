/* ZS.flag — procedurally-generated faction flags for 火柴三國.
 *
 * The flag is split into two independent parts, on purpose:
 *
 *   chrome  = the outer frame:  shape, fill color, border, tassels, pole
 *   text    = the mark on the cloth:  a single character + a render style
 *
 * Any chrome can carry any text. Swap the chrome to get a different banner
 * silhouette; swap the text to get a different inscription. The presets in
 * `presets` are just `{text, chrome}` records — the same chrome rendered
 * with `{text:'蜀'}` is a state flag, with `{text:'劉'}` is a family flag,
 * and with `{text:'備'}` is a personal flag.
 *
 *   draw(c, flag, x, y, w, h, t)
 *
 *     flag = {
 *       chrome: { shape, color, border, pole, tassels, sash },
 *       text:   { char, style, color }
 *     }
 *
 * The available shapes are the seven most common ancient-Chinese banner
 * silhouettes (rect, shield, square, swallowtail, round, pennant, diamond).
 * Borders can be `none`, `thin`, or `double`. Tassels (0..2) hang from
 * the bottom corners. A pole is drawn when `chrome.pole` is true.
 *
 * The cloth fill, the text, the pole, and the tassels all take a tiny
 * wobble from `ZS.jit` so the flag still belongs in the boil look. Nothing
 * is pre-rendered; the same record drawn twice is the same picture, but a
 * different `seed` (or `t`) gives the cloth its sway.
 */
(() => {
  "use strict";
  const ZS = (window.ZS = window.ZS || {});

  const INK = "rgb(61,52,43)";
  const INK_SOFT = "rgba(61,52,43,0.5)";

  // the same palette the rest of the project uses
  const FACTIONS = [
    [70, 96, 150],   // 0  blue    (Wu 吳)
    [150, 54, 44],   // 1  red     (Wei 魏)
    [64, 132, 74],   // 2  green   (Shu 蜀)
    [150, 120, 60],  // 3  ochre   (Yuan 袁)
    [120, 80, 140],  // 4  violet  (Lü 呂)
    [60, 130, 130],  // 5  teal    (Liu Biao 劉表)
    [120, 86, 60],   // 6  brown   (Liu Zhang 劉璋)
    [96, 104, 120],  // 7  slate   (Ma 馬)
  ];
  // Each entry in NAMED is a (r, g, b) tuple used as the cloth fill. The
  // catalogue is wider than the figure's 8-color ramp because the campaign
  // has more than 8 factions; the stickman sash reuses the 8-color ramp,
  // but flags get their own palette so every warlord reads as their own.
  const NAMED = {
    // — the 3 kingdoms —
    shu: FACTIONS[2],
    wei: FACTIONS[1],
    wu: FACTIONS[0],

    // — the major families —
    liu: FACTIONS[2],
    cao: FACTIONS[1],
    sun: FACTIONS[0],
    yuan: FACTIONS[3],
    lv: FACTIONS[4],
    ma: FACTIONS[7],
    gongsun: [40, 80, 110],
    tao: [180, 130, 90],
    liu_biao: FACTIONS[5],
    liu_zhang: FACTIONS[6],
    hua: [180, 90, 90],
    zhang: [110, 100, 130],     // 張 — a dusty purple (Zhang family, generic)
    wang: [160, 110, 80],       // 王 — a sandy brown
    kong: [70, 110, 90],        // 孔 — a sage
    yan: [150, 90, 60],         // 嚴 — a burnt orange (Yan family, distinct from Yan Liang)
    han: [140, 130, 70],        // 韓 — an olive (Han Sui's family)
    dong: [100, 30, 30],        // 董 — a dark crimson (Dong Zhuo)

    // — sub-faction variants (darker / differentiated) —
    cao_alt: [120, 40, 35],     // Wei sub-factions (Xiahou, Cao Ren, etc.)
    wu_alt: [50, 75, 130],      // Wu sub-factions (Zhou Yu, etc.)
    yuan_alt: [120, 95, 45],    // Yuan sub-factions (Yan Liang, Wen Chou)
    shu_alt: [40, 100, 60],     // Shu sub-factions (a darker green)
    ma_alt: [80, 90, 110],      // Ma Chao (a different slate from Ma Teng)

    // — specific warlords (194 CE start + a few late entries) —
    ma_teng: [96, 104, 120],
    han_sui: [140, 130, 70],
    gongsun_zan: [40, 80, 110],
    gongsun_du: [50, 90, 120],
    tao_qian: [180, 130, 90],
    zhang_miao: [110, 100, 130],
    zhang_yang: [100, 95, 125],
    zhang_yan: [90, 85, 110],   // Black Mountain bandits — a darker purple
    zhang_lu: [80, 60, 100],    // the Taoist of Hanzhong
    wang_lang: [160, 100, 70],
    kong_rong: [70, 110, 90],
    liu_yao: [80, 130, 110],
    yan_baihu: [150, 90, 60],

    // — major generals —
    // Wei
    xiahou_dun: [120, 40, 35],
    xiahou_yuan: [120, 40, 35],
    zhang_liao: [110, 50, 40],
    xu_chu: [130, 45, 35],
    sima_yi: [60, 50, 50],       // Sima Yi — the charcoal schemer
    zhang_he: [115, 45, 40],
    xu_huang: [125, 50, 40],
    yu_jin: [115, 45, 40],
    le_jin: [120, 50, 40],
    cao_ren: [120, 40, 35],
    cao_hong: [120, 40, 35],
    dian_wei: [50, 40, 40],      // the Madman — very dark
    hua_xiong: [110, 35, 30],    // Hua Xiong — dark crimson
    yan_liang: [120, 100, 50],   // Yuan's general
    wen_chou: [110, 90, 45],
    // Wu
    zhou_yu: [50, 75, 130],
    lu_su: [55, 80, 135],
    lv_meng: [55, 75, 130],
    gan_ning: [60, 80, 140],
    taishi_ci: [55, 75, 130],
    cheng_pu: [55, 80, 135],
    huang_gai: [60, 80, 140],
    lu_xun: [55, 80, 135],
    // Shu
    guan_yu: [64, 132, 74],
    zhang_fei: [60, 120, 70],
    zhao_yun: [65, 125, 75],
    huang_zhong: [70, 130, 80],
    fa_zheng: [60, 120, 70],
    wei_yan: [60, 120, 70],
    pang_tong: [60, 120, 70],
    xu_shu: [60, 120, 70],
    zhuge_liang: [55, 110, 65], // 亮 — a deeper green (the strategist)
    jiang_wei: [60, 120, 70],

    // — the 13 Han provinces (state banners) —
    yi:    FACTIONS[6],          // 益  — Liu Zhang's
    jing:  FACTIONS[5],          // 荊  — Liu Biao's
    liang: FACTIONS[7],          // 涼  — Ma's
    ji:    FACTIONS[3],          // 冀  — Yuan's
    yang:  [160, 110, 90],       // 揚  — sandy rose (a new one)
    you:   [40, 80, 110],        // 幽  — Gongsun's
    yan_province: [140, 130, 70], // 兗  — olive (Cao's base)
    xu:    [180, 130, 90],       // 徐  — tan (Tao Qian's)
    yu:    [120, 100, 80],       // 豫  — neutral, contested
    bing:  [90, 80, 70],         // 并  — dark
    qing:  [70, 100, 90],        // 青  — dark teal
    jiao:  [100, 60, 50],        // 交  — dark brown (southern)
    si:    [110, 90, 60],        // 司  — medium brown (the central province)
    lu:    [100, 100, 60],       // 魯  — dark olive (Confucius' homeland)

    // — imperial + rebellion banners —
    han_imperial: [200, 170, 50],  // 漢 — the imperial yellow
    huang_jin:    [190, 150, 40],  // 黃巾 — mustard (the Yellow Turbans)
    tian_gong:    [200, 170, 50],  // 天公 — same imperial yellow (Lord of Heaven)
    yi_jiao:      [110, 50, 50],   // 義 — a dark crimson (righteous army generic)
    zei:          [80, 60, 60],    // 賊 — a dirty grey (bandit generic)
  };
  function wash(rgb, a) {
    if (!rgb) return "rgba(0,0,0,0)";
    return "rgba(" + rgb[0] + "," + rgb[1] + "," + rgb[2] + "," + a + ")";
  }

  /* ---------- the chrome: the outer frame ---------- */

  /* A `chrome` describes the outer frame only. It has no knowledge of the
     text — that's the caller's job to compose. Every shape takes a
     (x, y, w, h) box and a base color (rgb 0..255) plus a border style. */

  function _clothFill(c, color, alpha) {
    c.fillStyle = wash(color, alpha);
  }

  // The 7 shapes. Each draws a fill, returns the path's bounds for the
  // text layer to compose over, and is followed by an outline pass that
  // honours `border` ("none" / "thin" / "double"). All paths are wobble-
  // aware so the cloth looks hand-stitched.

  // 1. rect — a flat rectangle. Most common ancient banner.
  function shape_rect(c, x, y, w, h, color, border, seed) {
    _clothFill(c, color, 0.78);
    c.beginPath();
    c.rect(x, y, w, h);
    c.fill();
    _strokeShape(c, border, color, () => {
      ZS.wpoly(
        c,
        [
          { x: x, y: y },
          { x: x + w, y: y },
          { x: x + w, y: y + h },
          { x: x, y: y + h },
        ],
        seed,
        0.6,
        true,
      );
    });
    return { x, y, w, h };
  }

  // 2. shield — a heraldic shield, rounded top, pointed bottom.
  function shape_shield(c, x, y, w, h, color, border, seed) {
    _clothFill(c, color, 0.78);
    c.beginPath();
    c.moveTo(x, y);
    c.lineTo(x + w, y);
    c.lineTo(x + w, y + h * 0.55);
    c.quadraticCurveTo(x + w, y + h * 0.85, x + w * 0.5, y + h);
    c.quadraticCurveTo(x, y + h * 0.85, x, y + h * 0.55);
    c.closePath();
    c.fill();
    _strokeShape(c, border, color, () => {
      ZS.wpoly(
        c,
        [
          { x: x, y: y + 2 },
          { x: x + w, y: y + 2 },
          { x: x + w, y: y + h * 0.55 },
          { x: x + w * 0.5, y: y + h },
          { x: x, y: y + h * 0.55 },
        ],
        seed,
        0.7,
        true,
      );
    });
    return { x, y, w, h: h * 0.92 };
  }

  // 3. square — a compact square, no tail. The "seal" feel.
  function shape_square(c, x, y, w, h, color, border, seed) {
    const s = Math.min(w, h);
    const px = x + (w - s) / 2;
    const py = y + (h - s) / 2;
    _clothFill(c, color, 0.78);
    c.beginPath();
    c.rect(px, py, s, s);
    c.fill();
    _strokeShape(c, border, color, () => {
      ZS.wpoly(
        c,
        [
          { x: px, y: py },
          { x: px + s, y: py },
          { x: px + s, y: py + s },
          { x: px, y: py + s },
        ],
        seed,
        0.5,
        true,
      );
    });
    return { x: px, y: py, w: s, h: s };
  }

  // 4. swallowtail — a banner with a deep V cut at the bottom.
  function shape_swallowtail(c, x, y, w, h, color, border, seed) {
    _clothFill(c, color, 0.78);
    c.beginPath();
    c.moveTo(x, y);
    c.lineTo(x + w, y);
    c.lineTo(x + w, y + h);
    c.lineTo(x + w * 0.5, y + h * 0.7);
    c.lineTo(x, y + h);
    c.closePath();
    c.fill();
    _strokeShape(c, border, color, () => {
      ZS.wpoly(
        c,
        [
          { x: x, y: y + 2 },
          { x: x + w, y: y + 2 },
          { x: x + w, y: y + h },
          { x: x + w * 0.5, y: y + h * 0.7 },
          { x: x, y: y + h },
        ],
        seed,
        0.6,
        true,
      );
    });
    return { x, y, w, h: h * 0.75 };
  }

  // 5. round — a circular flag (a roundel).
  function shape_round(c, x, y, w, h, color, border, seed) {
    const r = Math.min(w, h) / 2;
    const cx = x + w / 2;
    const cy = y + h / 2;
    _clothFill(c, color, 0.78);
    c.beginPath();
    c.arc(cx, cy, r, 0, Math.PI * 2);
    c.fill();
    _strokeShape(c, border, color, () => {
      ZS.wcirc(c, cx, cy, r, seed, 0.6);
    });
    return { x: cx - r, y: cy - r, w: r * 2, h: r * 2 };
  }

  // 6. pennant — a long, narrow triangle. For fast cavalry.
  function shape_pennant(c, x, y, w, h, color, border, seed) {
    _clothFill(c, color, 0.78);
    c.beginPath();
    c.moveTo(x, y);
    c.lineTo(x + w, y);
    c.lineTo(x + w, y + h);
    c.closePath();
    c.fill();
    _strokeShape(c, border, color, () => {
      ZS.wpoly(
        c,
        [
          { x: x, y: y + 2 },
          { x: x + w, y: y + 2 },
          { x: x + w, y: y + h },
        ],
        seed,
        0.6,
        true,
      );
    });
    return { x, y, w, h };
  }

  // 7. diamond — a lozenge. For special units / general markers.
  function shape_diamond(c, x, y, w, h, color, border, seed) {
    const cx = x + w / 2;
    const cy = y + h / 2;
    _clothFill(c, color, 0.78);
    c.beginPath();
    c.moveTo(cx, y);
    c.lineTo(x + w, cy);
    c.lineTo(cx, y + h);
    c.lineTo(x, cy);
    c.closePath();
    c.fill();
    _strokeShape(c, border, color, () => {
      ZS.wpoly(
        c,
        [
          { x: cx, y: y + 2 },
          { x: x + w, y: cy },
          { x: cx, y: y + h },
          { x: x, y: cy },
        ],
        seed,
        0.5,
        true,
      );
    });
    return { x, y, w, h };
  }

  // the border pass — called by every shape. Honour "none" / "thin" / "double".
  function _strokeShape(c, border, color, drawPath) {
    c.strokeStyle = INK;
    if (border === "none") return;
    c.lineWidth = border === "double" ? 1.6 : 1.2;
    drawPath();
    c.stroke();
    if (border === "double") {
      // a second inset line for the double-border
      c.lineWidth = 0.9;
      c.strokeStyle = wash(color, 0.55);
      drawPath();
      c.stroke();
    }
  }

  const SHAPES = {
    rect: shape_rect,
    shield: shape_shield,
    square: shape_square,
    swallowtail: shape_swallowtail,
    round: shape_round,
    pennant: shape_pennant,
    diamond: shape_diamond,
  };

  /* ---------- the chrome extras: pole, tassels, sash ---------- */

  function _drawPole(c, x, y, w, h, seed) {
    // the vertical pole on the left edge
    c.strokeStyle = "rgba(110, 80, 50, 0.85)";
    c.lineWidth = 2.4;
    ZS.wline(c, x - 6, y - 4, x - 6, y + h + 6, seed + 1, 0.4);
    // finial (a small knob on top)
    c.fillStyle = INK;
    c.beginPath();
    c.arc(x - 6, y - 4, 2.5, 0, Math.PI * 2);
    c.fill();
  }

  function _drawTassel(c, x, y, seed) {
    c.strokeStyle = INK;
    c.lineWidth = 1.0;
    // the cord
    ZS.wline(c, x, y, x + 1.5, y + 6, seed + 7, 0.3);
    // the bead
    c.fillStyle = "rgba(150, 54, 44, 0.7)";
    c.beginPath();
    c.arc(x + 1.5, y + 8, 1.6, 0, Math.PI * 2);
    c.fill();
    // a few threads
    c.strokeStyle = "rgba(150, 54, 44, 0.6)";
    c.lineWidth = 0.8;
    ZS.wline(c, x + 1.5, y + 9.5, x + 0.5, y + 13, seed + 9, 0.3);
    ZS.wline(c, x + 1.5, y + 9.5, x + 2.5, y + 13, seed + 11, 0.3);
  }

  function _drawSash(c, x, y, w, h, color, seed) {
    c.fillStyle = wash(color, 0.55);
    c.beginPath();
    c.rect(x, y + h * 0.42, w, h * 0.16);
    c.fill();
    c.strokeStyle = INK;
    c.lineWidth = 0.9;
    ZS.wline(c, x, y + h * 0.42, x + w, y + h * 0.42, seed + 5, 0.4);
    ZS.wline(c, x, y + h * 0.58, x + w, y + h * 0.58, seed + 7, 0.4);
  }

  /* ---------- the text: the inscription on the cloth ---------- */

  // The text is independent of the chrome. A few render styles:
  //   plain — single big character, ink color
  //   seal  — character in a small red stamp at the corner
  //   bold  — character fills most of the cloth, faction color
  function drawText(c, textRec, bounds, seed) {
    if (!textRec || !textRec.char) return;
    const { x, y, w, h } = bounds;
    const ch = textRec.char;
    const color = textRec.color || INK;
    const style = textRec.style || "plain";

    if (style === "seal") {
      // a small red stamp in the bottom-right corner
      const sz = Math.min(w, h) * 0.22;
      const px = x + w - sz - 2;
      const py = y + h - sz - 2;
      c.fillStyle = "rgba(150, 54, 44, 0.7)";
      c.fillRect(px, py, sz, sz);
      c.strokeStyle = INK;
      c.lineWidth = 0.9;
      c.strokeRect(px, py, sz, sz);
      ZS.boilText(c, ch, px + sz / 2, py + sz * 0.78, sz * 0.6, seed + 13, "center", "400");
      return;
    }

    if (style === "bold") {
      // a big character that fills the cloth
      const size = Math.min(w, h) * 0.7;
      c.fillStyle = color;
      c.save();
      c.globalAlpha = 0.92;
      ZS.boilText(c, ch, x + w / 2, y + h * 0.78, size, seed + 1, "center", "400");
      c.restore();
      // a subtle outline so the character reads against the wash
      c.strokeStyle = INK_SOFT;
      c.lineWidth = 0.7;
      ZS.wline(c, x + w / 2 - size * 0.25, y + h * 0.78, x + w / 2 + size * 0.25, y + h * 0.78, seed + 9, 0.3);
      return;
    }

    // plain (default): a single character, ink color, centred
    const size = Math.min(w, h) * 0.55;
    c.fillStyle = color;
    ZS.boilText(c, ch, x + w / 2, y + h * 0.72, size, seed + 1, "center", "400");
  }

  /* ---------- the public draw() ---------- */

  /* Draw a flag at (x, y) sized to (w, h). Returns the chrome's bounds so a
     caller can place a label or another element relative to the flag. */
  function draw(c, flag, x, y, w, h, t) {
    if (!flag) return null;
    const chrome = flag.chrome || {};
    const text = flag.text || null;
    const shape = SHAPES[chrome.shape] || shape_rect;
    const color = chrome.color || [120, 120, 120];
    const border = chrome.border || "thin";
    const seed = (flag.seed || 1) + 0.13;
    void t; // reserved for a future cloth-sway animation

    // pole (drawn first so the cloth overlaps the bottom of it)
    if (chrome.pole) _drawPole(c, x, y, w, h, seed);

    // cloth (the shape)
    const bounds = shape(c, x, y, w, h, color, border, seed);

    // optional sash — a horizontal stripe through the middle
    if (chrome.sash) {
      _drawSash(c, bounds.x, bounds.y, bounds.w, bounds.h, chrome.sash, seed + 21);
    }

    // the inscription
    drawText(c, text, bounds, seed + 41);

    // tassels at the bottom corners
    if (chrome.tassels === 1) {
      _drawTassel(c, bounds.x + bounds.w * 0.5, bounds.y + bounds.h, seed + 51);
    } else if (chrome.tassels === 2) {
      _drawTassel(c, bounds.x + 4, bounds.y + bounds.h, seed + 51);
      _drawTassel(c, bounds.x + bounds.w - 4, bounds.y + bounds.h, seed + 53);
    }

    return bounds;
  }

  /* ---------- the preset catalogue ----------
   *
   * Every preset is `{text, chrome}`. Mix-and-match: take any chrome and
   * substitute a different `text` to make a new flag.
   *
   *   `state`     — the 3 kingdoms (蜀 / 魏 / 吳)
   *   `family`    — the major families (劉 / 曹 / 孫 / 袁 / 呂 / 馬 / 公孫)
   *   `warlord`   — specific warlord personal flags (備 / 操 / 權 ...)
   */
  const CHROME = {
    plain:     { shape: "rect",       border: "thin",    pole: true,  tassels: 0 },
    banner:    { shape: "rect",       border: "thin",    pole: true,  tassels: 2 },
    shield:    { shape: "shield",     border: "double",  pole: false, tassels: 0 },
    great:     { shape: "swallowtail",border: "double",  pole: true,  tassels: 2 },
    seal:      { shape: "square",     border: "thin",    pole: false, tassels: 0 },
    round:     { shape: "round",      border: "thin",    pole: true,  tassels: 0 },
    pennant:   { shape: "pennant",    border: "none",    pole: true,  tassels: 0 },
    diamond:   { shape: "diamond",    border: "thin",    pole: false, tassels: 0 },
  };
  // a chrome always needs a color — defaulted below per-preset.

  function _mk(chr, color, key) {
    return {
      text: { char: chr, style: "bold", color: INK },
      chrome: Object.assign({ color }, CHROME[key]),
    };
  }

  // the canonical 3 states
  const PRESETS = {
    // — the 3 kingdoms (state name) —
    shu:    _mk("蜀", NAMED.shu,   "great"),
    wei:    _mk("魏", NAMED.wei,   "great"),
    wu:     _mk("吳", NAMED.wu,    "great"),

    // — major families (single surname character) —
    liu:    _mk("劉", NAMED.liu,   "banner"),
    cao:    _mk("曹", NAMED.cao,   "banner"),
    sun:    _mk("孫", NAMED.sun,   "banner"),
    yuan:   _mk("袁", NAMED.yuan,  "banner"),
    lv:     _mk("呂", NAMED.lv,    "shield"),
    ma:     _mk("馬", NAMED.ma,    "pennant"),
    gongsun:_mk("公", NAMED.gongsun,"plain"),
    tao:    _mk("陶", NAMED.tao,   "plain"),
    hua:    _mk("華", NAMED.hua,   "seal"),
    zhang:  _mk("張", NAMED.zhang, "plain"),
    wang:   _mk("王", NAMED.wang,  "plain"),
    kong:   _mk("孔", NAMED.kong,  "plain"),
    yan_f:  _mk("嚴", NAMED.yan,   "plain"),
    han_f:  _mk("韓", NAMED.han,   "plain"),
    dong:   _mk("董", NAMED.dong,  "shield"),

    // — the 194 CE warlord roster (personal flags, second char) —
    liu_bei:    _mk("備", NAMED.liu,   "shield"),
    cao_cao:    _mk("操", NAMED.cao,   "shield"),
    sun_quan:   _mk("權", NAMED.sun,   "shield"),
    sun_ce:     _mk("策", NAMED.sun,   "shield"),
    yuan_shao:  _mk("紹", NAMED.yuan,  "shield"),
    yuan_shu:   _mk("術", NAMED.yuan,  "shield"),
    lv_bu:      _mk("布", NAMED.lv,    "round"),
    ma_chao:    _mk("超", NAMED.ma_alt,"pennant"),
    ma_teng:    _mk("騰", NAMED.ma_teng,"pennant"),
    han_sui:    _mk("遂", NAMED.han_sui,"plain"),
    gongsun_zan:_mk("瓚", NAMED.gongsun_zan,"plain"),
    gongsun_du: _mk("度", NAMED.gongsun_du,"plain"),
    tao_qian:   _mk("謙", NAMED.tao,   "plain"),
    zhang_miao: _mk("邈", NAMED.zhang_miao,"plain"),
    zhang_yang: _mk("楊", NAMED.zhang_yang,"plain"),
    zhang_yan:  _mk("燕", NAMED.zhang_yan,"shield"),
    zhang_lu:   _mk("魯", NAMED.zhang_lu,"plain"),
    wang_lang:  _mk("朗", NAMED.wang_lang,"plain"),
    kong_rong:  _mk("融", NAMED.kong_rong,"plain"),
    liu_yao:    _mk("繇", NAMED.liu_yao,"plain"),
    yan_baihu:  _mk("虎", NAMED.yan_baihu,"shield"),

    // — the Wei general roster —
    xiahou_dun:  _mk("惇", NAMED.xiahou_dun, "shield"),
    xiahou_yuan: _mk("淵", NAMED.xiahou_yuan,"shield"),
    zhang_liao:  _mk("遼", NAMED.zhang_liao, "shield"),
    xu_chu:      _mk("褚", NAMED.xu_chu,     "shield"),
    sima_yi:     _mk("懿", NAMED.sima_yi,    "shield"),
    zhang_he:    _mk("郃", NAMED.zhang_he,   "shield"),
    xu_huang:    _mk("晃", NAMED.xu_huang,   "shield"),
    yu_jin:      _mk("禁", NAMED.yu_jin,     "shield"),
    le_jin:      _mk("進", NAMED.le_jin,     "shield"),
    cao_ren:     _mk("仁", NAMED.cao_ren,    "shield"),
    cao_hong:    _mk("洪", NAMED.cao_hong,   "shield"),
    dian_wei:    _mk("韋", NAMED.dian_wei,   "round"),
    hua_xiong:   _mk("雄", NAMED.hua_xiong,  "shield"),
    yan_liang:   _mk("良", NAMED.yan_liang,  "shield"),
    wen_chou:    _mk("醜", NAMED.wen_chou,   "shield"),

    // — the Wu general roster —
    zhou_yu:     _mk("瑜", NAMED.zhou_yu,    "shield"),
    lu_su:       _mk("肅", NAMED.lu_su,      "shield"),
    lv_meng:     _mk("蒙", NAMED.lv_meng,    "shield"),
    gan_ning:    _mk("寧", NAMED.gan_ning,   "shield"),
    taishi_ci:   _mk("慈", NAMED.taishi_ci,  "shield"),
    cheng_pu:    _mk("普", NAMED.cheng_pu,   "shield"),
    huang_gai:   _mk("蓋", NAMED.huang_gai,  "shield"),
    lu_xun:      _mk("遜", NAMED.lu_xun,     "shield"),

    // — the Shu general roster —
    guan_yu:     _mk("羽", NAMED.guan_yu,    "shield"),
    zhang_fei:   _mk("飛", NAMED.zhang_fei,  "shield"),
    zhao_yun:    _mk("雲", NAMED.zhao_yun,   "shield"),
    huang_zhong: _mk("忠", NAMED.huang_zhong,"shield"),
    fa_zheng:    _mk("正", NAMED.fa_zheng,   "shield"),
    wei_yan:     _mk("延", NAMED.wei_yan,    "shield"),
    pang_tong:   _mk("統", NAMED.pang_tong,  "shield"),
    xu_shu:      _mk("庶", NAMED.xu_shu,     "shield"),
    zhuge_liang: _mk("亮", NAMED.zhuge_liang,"shield"),
    jiang_wei:   _mk("維", NAMED.jiang_wei,  "shield"),

    // — the 13 Han provinces (state banners) —
    yi:    _mk("益", NAMED.yi,   "banner"),
    jing:  _mk("荊", NAMED.jing, "banner"),
    liang: _mk("涼", NAMED.liang,"pennant"),
    ji:    _mk("冀", NAMED.ji,   "banner"),
    yang:  _mk("揚", NAMED.yang, "banner"),
    you:   _mk("幽", NAMED.you,  "plain"),
    yan:   _mk("兗", NAMED.yan_province,  "banner"),
    xu:    _mk("徐", NAMED.xu,   "banner"),
    yu:    _mk("豫", NAMED.yu,   "banner"),
    bing:  _mk("并", NAMED.bing, "plain"),
    qing:  _mk("青", NAMED.qing, "plain"),
    jiao:  _mk("交", NAMED.jiao, "plain"),
    si:    _mk("司", NAMED.si,   "seal"),

    // — imperial + rebellion banners —
    han_imperial: _mk("漢", NAMED.han_imperial, "great"),
    huang_jin:    _mk("巾", NAMED.huang_jin,    "pennant"),
    tian_gong:    _mk("天", NAMED.tian_gong,    "pennant"),
    yi_jiao:      _mk("義", NAMED.yi_jiao,      "plain"),
    zei:          _mk("賊", NAMED.zei,          "plain"),

    // — cross-overs: same chrome, different text (useful presets) —
    shu_liu:    _mk("蜀", NAMED.liu,   "banner"),
    wei_cao:    _mk("魏", NAMED.cao,   "banner"),
    wu_sun:     _mk("吳", NAMED.sun,   "banner"),
    liu_empire: _mk("漢", NAMED.liu,   "great"),  // Liu Bei claiming the Han
  };

  // quick lookup: faction name -> preset
  function get(name) {
    return PRESETS[name] || null;
  }

  /* ---------- forFaction: map a figure.FACTIONS id to a flag ----------
   *
   * The figure module has 8 faction slots (its FACTIONS ramp). Each slot
   * maps to a flag here — the campaign uses these slots for "the player's
   * faction", the menu pick, and the stickman sash, so a single id
   * produces a coherent read across the page.
   */
  function forFaction(factionId) {
    switch (factionId | 0) {
      case 0: return PRESETS.wu;
      case 1: return PRESETS.wei;
      case 2: return PRESETS.shu;
      case 3: return PRESETS.yuan;
      case 4: return PRESETS.lv;
      case 5: return PRESETS.liu_biao;
      case 6: return PRESETS.liu_zhang;
      case 7: return PRESETS.ma;
      default: return PRESETS.shu;
    }
  }

  /* ---------- plant: a flag in the ground, for in-world markers ----------
   *
   * Used by the battle to mark a deployment zone or a captured position,
   * and by the campaign map to flag a city or a held province.
   *
   *   plant(c, flag, x, y, h, t)
   *     x, y — the *base* of the pole (where it meets the ground)
   *     h    — total height of the pole+flag
   *     t    — time, for the cloth sway
   *
   * The flag is drawn at the top quarter of the pole, extending to the
   * right. A small finial sits on the very top, and a faint ground
   * shadow anchors the base.
   */
  function plant(c, flag, x, y, h, t) {
    if (!flag) return;
    const sway = Math.sin((t || 0) * 1.7) * 0.6;
    void sway;
    const poleH = h * 0.78;
    const top = y - poleH;
    // ground shadow
    c.strokeStyle = "rgba(40,35,25,0.16)";
    c.lineWidth = 1.2;
    ZS.wcirc(c, x, y + 1.4, 5, (flag.seed || 1) + 5, 0.6);
    // the pole
    c.strokeStyle = "rgba(110, 80, 50, 0.85)";
    c.lineWidth = 2.4;
    ZS.wline(c, x, y, x, top, (flag.seed || 1) + 1, 0.4);
    // finial
    c.fillStyle = INK;
    c.beginPath();
    c.arc(x, y - poleH - 1, 2.5, 0, Math.PI * 2);
    c.fill();
    // the flag at the top
    const flagW = h * 0.32;
    const flagH = h * 0.22;
    const fx = x;
    const fy = y - poleH;
    // pull the draw to a known seed, with a tiny sway
    const drawX = fx + 1;
    const drawY = fy - flagH;
    draw(c, flag, drawX, drawY, flagW, flagH, t);
  }

  /* ---------- bearer: factory for a STANDARD unit carrying this flag ----------
   *
   * The figure module's STANDARD type already draws a stickman holding a
   * tall pole+cloth. This factory returns the unit spec the scenario
   * adds to its agents; the unit carries the given flag and the figure
   * renderer picks it up via `a.flag`.
   *
   *   bearer(flag, x, y, opts) — returns a unit record, ready to push
   *   opts: { faction?, tier?, seed?, team? }
   *
   * The factory doesn't add the unit to anything — the scenario
   * (`init`/`maintain`) is still the one that owns the agents array.
   */
  function bearer(flag, x, y, opts) {
    const o = opts || {};
    return {
      x: x, y: y,
      vx: 0, vy: 0,
      type: 8, // STANDARD (ZS.figure.STANDARD)
      tier: typeof o.tier === "number" ? o.tier : 1, // NCO by default
      faction: typeof o.faction === "number" ? o.faction : 0,
      flag: flag,
      seed: typeof o.seed === "number" ? o.seed : Math.random() * 99 + 1,
      a: 0, gait: 0,
      hp: 8, atk: 0, hit: 0, thr: 0,
      flash: 0, flee: 0,
      free: false, gone: false, dead: false,
      // `team` lets the scenario bucket bearers to a side
      team: typeof o.team === "number" ? o.team : 0,
    };
  }

  ZS.flag = {
    draw,
    drawText,
    plant,
    bearer,
    forFaction,
    SHAPES,
    CHROME,
    NAMED,
    PRESETS,
    get,
  };
})();
