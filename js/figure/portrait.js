/* ZS.portrait — headshot portraits for the named generals.
 *
 * SANGUO-DESIGN.md §7.5 deliberately keeps the battle figure a single
 * silhouette (no portraits, no unique bodies). The portraits live outside the
 * battle — they are drawn in the menu's "Choose your warlord" panel, the
 * after-action card, the save-slot icon, the campaign roster, and any cutaway
 * where the player sees a general up close. There, a 60-80 px head shot of
 * brush-ink, wobbly, in the faction sash, is a better read than the
 * 20-px stickman.
 *
 * Each portrait is a deterministic draw — `seed` keeps the line wobble stable
 * per render. The variations live in the headgear, beard, expression, and
 * silhouette. Every portrait uses the same primitives as the rest of the
 * engine (wline, wcirc, wpoly, boilText), the same palette, the same boil.
 *
 *   draw(c, general, x, y, w, h, t)
 *
 * `general` is a record with bilingual name + stats (so portraits can be drawn
 * from the same data the almanac uses). Faction colour comes from the same
 * FACTIONS ramp the figure module uses.
 */
(() => {
  "use strict";
  const ZS = (window.ZS = window.ZS || {});

  const INK = "rgb(61,52,43)";
  const INK_SOFT = "rgba(61,52,43,0.5)";
  const SHADOW = "rgba(40,35,25,0.16)";

  // mirror of ZS.figure.FACTIONS so the module is self-sufficient
  const FACTIONS = [
    [70, 96, 150],
    [150, 54, 44],
    [64, 132, 74],
    [150, 120, 60],
    [120, 80, 140],
    [60, 130, 130],
    [120, 86, 60],
    [96, 104, 120],
  ];
  function wash(i, a) {
    const c = FACTIONS[i % FACTIONS.length];
    return "rgba(" + c[0] + "," + c[1] + "," + c[2] + "," + a + ")";
  }

  /* ----- per-portrait parts (the vocabulary) ----- */

  // round face
  function face(c, x, y, r, seed) {
    c.strokeStyle = INK;
    c.lineWidth = 1.5;
    ZS.wcirc(c, x, y, r, seed, 0.6);
  }

  // a long beard (most generals of the era)
  function beard(c, x, y, r, seed, type) {
    c.strokeStyle = INK;
    c.lineWidth = 1.3;
    if (type === "long") {
      // the famous 關羽 / 張飛 long beard
      const pts = [
        { x: x - r * 0.7, y: y + r * 0.4 },
        { x: x - r * 0.55, y: y + r * 1.1 },
        { x: x - r * 0.2, y: y + r * 1.4 },
        { x: x, y: y + r * 1.5 },
        { x: x + r * 0.2, y: y + r * 1.4 },
        { x: x + r * 0.55, y: y + r * 1.1 },
        { x: x + r * 0.7, y: y + r * 0.4 },
      ];
      ZS.wpoly(c, pts, seed, 0.8, true);
      // texture lines
      for (let i = 0; i < 5; i++) {
        const yy = y + r * (0.5 + i * 0.18);
        ZS.wline(
          c,
          x - r * 0.55,
          yy,
          x + r * 0.55,
          yy + ZS.sjit(seed + i) * 0.6,
          seed + 10 + i,
          0.5,
        );
      }
    } else if (type === "chin") {
      // shorter, scholarly
      ZS.wpoly(
        c,
        [
          { x: x - r * 0.45, y: y + r * 0.3 },
          { x: x - r * 0.3, y: y + r * 0.75 },
          { x: x, y: y + r * 0.85 },
          { x: x + r * 0.3, y: y + r * 0.75 },
          { x: x + r * 0.45, y: y + r * 0.3 },
        ],
        seed,
        0.6,
        true,
      );
    } else if (type === "goatee") {
      // a small tuft
      ZS.wpoly(
        c,
        [
          { x: x - r * 0.25, y: y + r * 0.55 },
          { x: x, y: y + r * 0.85 },
          { x: x + r * 0.25, y: y + r * 0.55 },
        ],
        seed,
        0.5,
        true,
      );
    } else if (type === "moustache") {
      // a sweeping one (Cao Cao style)
      ZS.wline(c, x - r * 0.35, y + r * 0.2, x - r * 0.55, y + r * 0.35, seed, 0.4);
      ZS.wline(c, x + r * 0.35, y + r * 0.2, x + r * 0.55, y + r * 0.35, seed + 1, 0.4);
    }
  }

  // headgear — generals wore simple cloth caps or formal crowns; we keep
  // the silhouette readable, not realistic.
  function cap(c, x, y, r, seed, type) {
    c.strokeStyle = INK;
    c.lineWidth = 1.5;
    if (type === "turban") {
      // the wraparound cloth cap (most common)
      ZS.wpoly(
        c,
        [
          { x: x - r * 0.95, y: y - r * 0.3 },
          { x: x - r * 0.7, y: y - r * 0.85 },
          { x: x, y: y - r * 1.05 },
          { x: x + r * 0.7, y: y - r * 0.85 },
          { x: x + r * 0.95, y: y - r * 0.3 },
        ],
        seed,
        0.7,
        true,
      );
      // the wrap detail
      ZS.wline(c, x - r * 0.6, y - r * 0.55, x + r * 0.6, y - r * 0.5, seed + 9, 0.5);
    } else if (type === "crown") {
      // the formal flat-top crown, with two side wings (進賢冠)
      const top = y - r * 1.1;
      ZS.wline(c, x - r, y - r * 0.35, x - r, top, seed, 0.6);
      ZS.wline(c, x + r, y - r * 0.35, x + r, top, seed + 1, 0.6);
      ZS.wline(c, x - r, top, x + r, top, seed + 2, 0.6);
      // a small bump in the middle
      ZS.wpoly(
        c,
        [
          { x: x - r * 0.4, y: top },
          { x: x, y: top - r * 0.25 },
          { x: x + r * 0.4, y: top },
        ],
        seed + 3,
        0.5,
        true,
      );
    } else if (type === "helmet") {
      // a dome helmet with side flaps (戰盔)
      const top = y - r * 1.05;
      ZS.wpoly(
        c,
        [
          { x: x - r * 0.95, y: y - r * 0.1 },
          { x: x - r * 0.7, y: y - r * 0.7 },
          { x: x, y: top },
          { x: x + r * 0.7, y: y - r * 0.7 },
          { x: x + r * 0.95, y: y - r * 0.1 },
        ],
        seed,
        0.7,
        true,
      );
      // a red tassel on top
      c.strokeStyle = "rgba(150,54,44,0.7)";
      c.lineWidth = 1.4;
      ZS.wline(c, x, top, x, top - r * 0.45, seed + 4, 0.4);
    } else if (type === "band") {
      // a thin cloth band, scholarly style
      ZS.wline(c, x - r * 0.95, y - r * 0.35, x + r * 0.95, y - r * 0.3, seed, 0.5);
    }
  }

  // the eyes — a single horizontal stroke each, ink dot for pupil
  function eyes(c, x, y, r, seed) {
    c.strokeStyle = INK;
    c.lineWidth = 1.4;
    // brows
    ZS.wline(c, x - r * 0.55, y - r * 0.1, x - r * 0.15, y - r * 0.15, seed, 0.4);
    ZS.wline(c, x + r * 0.15, y - r * 0.15, x + r * 0.55, y - r * 0.1, seed + 1, 0.4);
    // eye strokes
    ZS.wline(c, x - r * 0.5, y + r * 0.05, x - r * 0.2, y + r * 0.05, seed + 2, 0.3);
    ZS.wline(c, x + r * 0.2, y + r * 0.05, x + r * 0.5, y + r * 0.05, seed + 3, 0.3);
    // pupils
    c.fillStyle = INK;
    c.beginPath();
    c.arc(x - r * 0.35, y + r * 0.05, 0.7, 0, 6.29);
    c.fill();
    c.beginPath();
    c.arc(x + r * 0.35, y + r * 0.05, 0.7, 0, 6.29);
    c.fill();
  }

  // nose — a small angled stroke
  function nose(c, x, y, r, seed) {
    c.strokeStyle = INK_SOFT;
    c.lineWidth = 1.2;
    ZS.wline(c, x, y - r * 0.1, x + r * 0.05, y + r * 0.25, seed, 0.4);
    c.strokeStyle = INK;
    c.lineWidth = 1.2;
    ZS.wline(c, x + r * 0.05, y + r * 0.25, x - r * 0.08, y + r * 0.32, seed + 1, 0.3);
  }

  // shoulders + sash — the bottom of the headshot
  function shoulders(c, x, y, r, seed, faction) {
    // the shoulders: a downward wobbly curve
    c.strokeStyle = INK;
    c.lineWidth = 1.5;
    ZS.wline(c, x - r * 2.4, y + r * 3.0, x - r * 0.6, y + r * 1.6, seed, 1);
    ZS.wline(c, x + r * 2.4, y + r * 3.0, x + r * 0.6, y + r * 1.6, seed + 1, 1);
    // the collar: a small V
    ZS.wpoly(
      c,
      [
        { x: x - r * 0.55, y: y + r * 1.6 },
        { x: x, y: y + r * 2.1 },
        { x: x + r * 0.55, y: y + r * 1.6 },
      ],
      seed + 2,
      0.5,
      true,
    );
    // the faction sash across the chest (the read)
    c.strokeStyle = wash(faction, 0.75);
    c.lineWidth = 4.5;
    ZS.wline(c, x - r * 1.6, y + r * 2.2, x + r * 1.6, y + r * 2.7, seed + 3, 0.6);
    c.lineWidth = 1.2;
    c.strokeStyle = INK;
    ZS.wline(c, x - r * 1.6, y + r * 2.2, x + r * 1.6, y + r * 2.7, seed + 4, 0.4);
  }

  /* ----- the named-generals catalogue -----
   *
   * The figures who matter at P5: 20 named generals + a fallback. Each entry
   * picks a headgear, beard, and a small personality cue (expression tilt).
   * The data here is the source of truth for the campaign roster — the same
   * record is used by ZS.i18n.t(name) in the body of the portrait.
   *
   * The faction index is the row in ZS.figure.FACTIONS. The stats wu/tong/zhi
   * are the RTK baseline (194 CE warlords); the actual snapshot the player
   * sees is the live record, but the portrait belongs to the historical
   * person, not the current stats.
   */
  const CATALOGUE = {
    /* Shu-Han (劉備 faction) */
    liu_bei: {
      name: { "zh-tw": "劉備", en: "Liu Bei" },
      style: { "zh-tw": "玄德", en: "Xuande" },
      faction: 2, // green
      wu: 75,
      tong: 90,
      zhi: 76,
      zheng: 85,
      portrait: { cap: "turban", beard: "chin", cue: "kind" },
    },
    guan_yu: {
      name: { "zh-tw": "關羽", en: "Guan Yu" },
      style: { "zh-tw": "雲長", en: "Yunchang" },
      faction: 2,
      wu: 97,
      tong: 95,
      zhi: 75,
      zheng: 62,
      portrait: { cap: "turban", beard: "long", cue: "stern" },
    },
    zhang_fei: {
      name: { "zh-tw": "張飛", en: "Zhang Fei" },
      style: { "zh-tw": "翼德", en: "Yide" },
      faction: 2,
      wu: 96,
      tong: 88,
      zhi: 40,
      zheng: 50,
      portrait: { cap: "turban", beard: "long", cue: "angry" },
    },
    zhao_yun: {
      name: { "zh-tw": "趙雲", en: "Zhao Yun" },
      style: { "zh-tw": "子龍", en: "Zilong" },
      faction: 2,
      wu: 96,
      tong: 92,
      zhi: 76,
      zheng: 65,
      portrait: { cap: "helmet", beard: "chin", cue: "calm" },
    },
    ma_chao: {
      name: { "zh-tw": "馬超", en: "Ma Chao" },
      style: { "zh-tw": "孟起", en: "Mengqi" },
      faction: 2,
      wu: 95,
      tong: 88,
      zhi: 60,
      zheng: 50,
      portrait: { cap: "helmet", beard: "moustache", cue: "proud" },
    },
    huang_zhong: {
      name: { "zh-tw": "黃忠", en: "Huang Zhong" },
      style: { "zh-tw": "漢升", en: "Hansheng" },
      faction: 2,
      wu: 92,
      tong: 80,
      zhi: 60,
      zheng: 55,
      portrait: { cap: "helmet", beard: "long", cue: "aged" },
    },
    fa_zheng: {
      name: { "zh-tw": "法正", en: "Fa Zheng" },
      style: { "zh-tw": "孝直", en: "Xiaozhi" },
      faction: 2,
      wu: 35,
      tong: 70,
      zhi: 95,
      zheng: 80,
      portrait: { cap: "crown", beard: "chin", cue: "clever" },
    },

    /* Wei (曹操 faction) */
    cao_cao: {
      name: { "zh-tw": "曹操", en: "Cao Cao" },
      style: { "zh-tw": "孟德", en: "Mengde" },
      faction: 1, // red
      wu: 78,
      tong: 96,
      zhi: 96,
      zheng: 92,
      portrait: { cap: "crown", beard: "moustache", cue: "scheming" },
    },
    xiahou_dun: {
      name: { "zh-tw": "夏侯惇", en: "Xiahou Dun" },
      style: { "zh-tw": "元讓", en: "Yuanrang" },
      faction: 1,
      wu: 92,
      tong: 90,
      zhi: 55,
      zheng: 70,
      portrait: { cap: "helmet", beard: "moustache", cue: "fierce" },
    },
    xiahou_yuan: {
      name: { "zh-tw": "夏侯淵", en: "Xiahou Yuan" },
      style: { "zh-tw": "妙才", en: "Miaocai" },
      faction: 1,
      wu: 90,
      tong: 88,
      zhi: 60,
      zheng: 60,
      portrait: { cap: "helmet", beard: "moustache", cue: "stern" },
    },
    zhang_liao: {
      name: { "zh-tw": "張遼", en: "Zhang Liao" },
      style: { "zh-tw": "文遠", en: "Wenyuan" },
      faction: 1,
      wu: 94,
      tong: 90,
      zhi: 75,
      zheng: 65,
      portrait: { cap: "helmet", beard: "moustache", cue: "calm" },
    },
    xu_chu: {
      name: { "zh-tw": "許褚", en: "Xu Chu" },
      style: { "zh-tw": "仲康", en: "Zhongkang" },
      faction: 1,
      wu: 96,
      tong: 80,
      zhi: 30,
      zheng: 40,
      portrait: { cap: "turban", beard: "moustache", cue: "fierce" },
    },
    zhou_yu: {
      name: { "zh-tw": "周瑜", en: "Zhou Yu" },
      style: { "zh-tw": "公瑾", en: "Gongjin" },
      faction: 1,
      wu: 80,
      tong: 92,
      zhi: 96,
      zheng: 75,
      portrait: { cap: "crown", beard: "moustache", cue: "clever" },
    },
    sima_yi: {
      name: { "zh-tw": "司馬懿", en: "Sima Yi" },
      style: { "zh-tw": "仲達", en: "Zhongda" },
      faction: 1,
      wu: 70,
      tong: 90,
      zhi: 98,
      zheng: 88,
      portrait: { cap: "crown", beard: "long", cue: "scheming" },
    },

    /* Wu (孫權 faction) */
    sun_quan: {
      name: { "zh-tw": "孫權", en: "Sun Quan" },
      style: { "zh-tw": "仲謀", en: "Zhongmou" },
      faction: 0, // blue
      wu: 70,
      tong: 88,
      zhi: 88,
      zheng: 90,
      portrait: { cap: "crown", beard: "moustache", cue: "regal" },
    },
    sun_ce: {
      name: { "zh-tw": "孫策", en: "Sun Ce" },
      style: { "zh-tw": "伯符", en: "Bofu" },
      faction: 0,
      wu: 92,
      tong: 85,
      zhi: 65,
      zheng: 60,
      portrait: { cap: "crown", beard: "moustache", cue: "bold" },
    },
    zhou_tai: {
      name: { "zh-tw": "周泰", en: "Zhou Tai" },
      style: { "zh-tw": "幼平", en: "Youping" },
      faction: 0,
      wu: 90,
      tong: 85,
      zhi: 50,
      zheng: 60,
      portrait: { cap: "helmet", beard: "moustache", cue: "fierce" },
    },
    gan_ning: {
      name: { "zh-tw": "甘寧", en: "Gan Ning" },
      style: { "zh-tw": "興霸", en: "Xingba" },
      faction: 0,
      wu: 92,
      tong: 78,
      zhi: 55,
      zheng: 50,
      portrait: { cap: "helmet", beard: "moustache", cue: "wild" },
    },
    lu_xun: {
      name: { "zh-tw": "陸遜", en: "Lu Xun" },
      style: { "zh-tw": "伯言", en: "Boyan" },
      faction: 0,
      wu: 70,
      tong: 90,
      zhi: 95,
      zheng: 80,
      portrait: { cap: "crown", beard: "chin", cue: "scholarly" },
    },

    /* Other (袁紹, 呂布, 劉表, 袁術, 陶謙) */
    yuan_shao: {
      name: { "zh-tw": "袁紹", en: "Yuan Shao" },
      style: { "zh-tw": "本初", en: "Benchu" },
      faction: 3, // ochre
      wu: 70,
      tong: 75,
      zhi: 60,
      zheng: 85,
      portrait: { cap: "crown", beard: "long", cue: "pompous" },
    },
    lv_bu: {
      name: { "zh-tw": "呂布", en: "Lü Bu" },
      style: { "zh-tw": "奉先", en: "Fengxian" },
      faction: 4, // violet
      wu: 100,
      tong: 50,
      zhi: 30,
      zheng: 20,
      portrait: { cap: "helmet", beard: "moustache", cue: "wild" },
    },
    dian_wei: {
      name: { "zh-tw": "典韋", en: "Dian Wei" },
      style: { "zh-tw": "君明", en: "Junming" },
      faction: 4,
      wu: 98,
      tong: 80,
      zhi: 30,
      zheng: 30,
      portrait: { cap: "helmet", beard: "moustache", cue: "fierce" },
    },
    hua_tuo: {
      name: { "zh-tw": "華佗", en: "Hua Tuo" },
      style: { "zh-tw": "元化", en: "Yuanhua" },
      faction: 6, // brown
      wu: 25,
      tong: 40,
      zhi: 90,
      zheng: 80,
      portrait: { cap: "band", beard: "long", cue: "aged" },
    },
  };

  /* a fallback for any general the catalogue doesn't list — a generic
     young commander, in faction colour. */
  function _fallback(id) {
    return {
      name: { "zh-tw": id || "武將", en: id || "General" },
      style: { "zh-tw": "—", en: "—" },
      faction: 0,
      wu: 70,
      tong: 70,
      zhi: 60,
      zheng: 60,
      portrait: { cap: "turban", beard: "moustache", cue: "calm" },
    };
  }

  /* get(id) — the data record for a general. Falls back to a generic. */
  function get(id) {
    return CATALOGUE[id] || _fallback(id);
  }

  /* draw(c, general, x, y, w, h, t)
   *
   * Anchored at (x, y) = top-left of the box. `w` and `h` size the head
   * inside (default 80x100). The portrait is meant to read at 60-120 px.
   *
   * `t` is the time in seconds; used for the boil-only call (which is
   * already what jit() does, so the parameter is here for future ambient
   * motion — a banner sway, an eye blink).
   */
  function draw(c, general, x, y, w, h, t) {
    const g = general || _fallback();
    const seed = g.seed || hashId(g);
    const r = Math.min(w, h) * 0.22; // face radius
    const cx = x + w / 2;
    const cy = y + h * 0.42;
    const p = g.portrait || { cap: "turban", beard: "moustache" };
    void t; // reserved for future ambient motion (banner sway, eye blink)

    // a faint paper backing
    c.fillStyle = "rgba(243,237,222,0.0)";
    // ground shadow under the bust
    c.strokeStyle = SHADOW;
    c.lineWidth = 1.2;
    ZS.wcirc(c, cx, cy + r * 2.2, r * 1.6, seed + 1, 0.5);

    // shoulders + sash (drawn first so the head overlaps)
    shoulders(c, cx, cy, r, seed + 30, g.faction);
    // head
    face(c, cx, cy, r, seed);
    // eyes (the cue is here — tilted brows, etc.)
    _expression(c, cx, cy, r, seed, p.cue);
    nose(c, cx, cy + r * 0.05, r, seed + 5);
    // headgear
    cap(c, cx, cy, r, seed + 40, p.cap);
    // beard
    beard(c, cx, cy + r * 0.4, r, seed + 50, p.beard);

    // name banner below the head — a small ink strip
    if (w > 50) {
      const nm = ZS.i18n ? ZS.i18n.t(g.name) : g.name.zh || g.name["zh-tw"] || g.name.en;
      c.fillStyle = INK;
      ZS.boilText(c, nm, cx, y + h - 4, Math.max(8, Math.min(14, w * 0.18)), seed + 60, "center");
    }
  }

  function _expression(c, cx, cy, r, seed, cue) {
    eyes(c, cx, cy - r * 0.1, r, seed);
    // brow tilts per cue — a tiny personality read
    if (cue === "stern" || cue === "fierce" || cue === "angry") {
      c.strokeStyle = INK;
      c.lineWidth = 1.6;
      // brows angled inward
      ZS.wline(c, cx - r * 0.55, cy - r * 0.3, cx - r * 0.15, cy - r * 0.15, seed + 6, 0.4);
      ZS.wline(c, cx + r * 0.15, cy - r * 0.15, cx + r * 0.55, cy - r * 0.3, seed + 7, 0.4);
    } else if (cue === "kind" || cue === "calm" || cue === "regal" || cue === "scholarly") {
      // brows level (default)
    } else if (cue === "clever" || cue === "scheming") {
      // one brow raised — a thin curve
      c.strokeStyle = INK;
      c.lineWidth = 1.4;
      ZS.wline(c, cx - r * 0.55, cy - r * 0.2, cx - r * 0.15, cy - r * 0.3, seed + 6, 0.4);
    } else if (cue === "proud" || cue === "pompous" || cue === "bold") {
      // chin up: head shifted up a touch, brows up
      // (we just raise the eyes slightly here)
    } else if (cue === "wild" || cue === "aged") {
      // a wrinkle, a scar — drawn as a wobbly line
      c.strokeStyle = INK_SOFT;
      c.lineWidth = 1.1;
      ZS.wline(c, cx - r * 0.4, cy - r * 0.2, cx - r * 0.15, cy - r * 0.4, seed + 6, 0.5);
    }
  }

  // deterministic id -> seed (so the same general always looks the same)
  function hashId(g) {
    const s = (g.name && (g.name["zh-tw"] || g.name.zh || g.name.en)) || "general";
    let h = 0;
    for (let i = 0; i < s.length; i++) h = ((h << 5) - h + s.charCodeAt(i)) | 0;
    return Math.abs(h) * 0.01 + 1;
  }

  ZS.portrait = {
    draw,
    get,
    CATALOGUE,
  };
})();
