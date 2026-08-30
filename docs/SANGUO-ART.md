# 火柴三國 — the art system (SANGUO-ART)

The visual contract for the 火柴三國 page. Covers the **unit/figure
system**, the **flag system**, the **environment catalogue**, the
**UI art**, and the **portraits** — every picture the game draws, plus
how to add more.

The look is the boil line (§Hard constraints in `AGENTS.md`):
wobbly ink on a paper palette, re-jittered ~7x/second. Every art
piece is drawn through `ZS.sketch` (`wline`, `wcirc`, `wpoly`,
`sketchRect`, `lerpC`) and `ZS.boilText`. Nothing is pre-baked; the
same call drawn twice is the same picture, and the `seed` keeps the
wobble stable per render.

| Module | What it draws | Read first if you need… |
|---|---|---|
| `js/figure/figure.js` | the stickman baseline + the 9 unit types + the rank marks | …to add a new unit type or change a silhouette |
| `js/figure/portrait.js` | headshot portraits of the 23 named generals | …a general's face in the menu or after-action card |
| `js/art/flag.js` | flags — chrome (frame) + text (mark) as independent parts | …a faction banner, a province chip, or a planted battle marker |
| `js/art/environment.js` | trees, hills, rivers, camps, walls, gates, bridges, ruins, roads | …the look of a battle field or a campaign map |
| `js/art/ui.js` | the menu's title banner, save-slot thumbnails, button glyphs | …a new chrome icon or save-slot art |

The other three pages (`zombiesim.html`, `battle.html`, `hold.html`)
do not load any of these. The art system is 火柴三國-only.

---

## 1. The unit / figure system (`js/figure/figure.js`)

The matchstick figure is the same primitive every unit is built on. One
body; the **weapon and stance** carry the type read. No unique bodies,
no per-unit artwork.

### 1.1 The baseline (`drawFoot`)

A unit is anchored at `(a.x, a.y)` = the point between the feet, ~20 px
tall at scale 1, drawn with:

- a ground shadow (a `wcirc` at `rgba(40,35,25,0.14)`)
- two `wline` legs that swing with the gait
- a `wline` torso
- a `wcirc` head with one eye dot on the forward side
- a `wline` arm + the type's weapon (see §1.3)
- a `wcirc` ground anchor

Every part takes `a.seed + <fixed offset>` as its wobble seed, so a
unit's silhouette is stable per render — the lines don't redraw
randomly from frame to frame.

The rider variant (`drawRider`) is the same body on a 4-legged wobbly
horse. The two new equipment variants (`drawCatapult` and `drawRam`)
replace the stickman with a wobbly wagon; the standard bearer
(`drawStandard`) keeps the body and swaps the weapon for a tall pole
with a faction cloth.

### 1.2 Rank tiers (§7.4)

A `tier` field on the agent scales the body. The same drawing at four
sizes — no per-tier artwork.

| Tier | Scale | Marks added on the marks layer |
|---|---|---|
| 兵 TROOPER | 1.00 | — |
| 什長 / 隊長 NCO | 1.05 | a small `wpoly` flag on the back |
| 校尉 OFFICER | 1.12 | flag + a coloured `wline` sash across the torso |
| 將 GENERAL | 1.25 | sash + **aura ring** (`wcirc` at the faction colour, radius from `tong`) + **name banner** (a vertical pole + `wpoly` cloth with the general's name boiled on it) |

`drawMarks` is the layer that adds all of the above; `drawFoot` draws
the body, then `drawMarks` decorates. The two are always called
together, in that order.

### 1.3 Unit types (§7.3)

| Type | id | Weapon | Stance tweak |
|---|---|---|---|
| 槍兵 spear | `SPEAR = 0` | long `wline`, ~14 px, angled up at rest, level in the thrust | tight rank spacing (`sepR` low) |
| 刀盾 sword & shield | `DAO = 1` | short `wline` blade + `wcirc` / `wpoly` shield on the off-arm | — |
| 弩兵 crossbow | `BOW = 2` | short horizontal `wline` + tick; a tracer `fx` on shot | halts to fire |
| 戟兵 halberd | `JI = 3` | `wline` + a small cross `wline` near the tip | anti-cav bonus |
| 騎兵 cavalry | `CAV = 4` | rider body on a horse (reuses `_drawCav`) + lance | fast, wedge default |
| 弓騎 horse archer | `HBOW = 5` | cav body + bow tick | kite |
| 投石車 catapult | `CATAPULT = 6` | the stickman is replaced by a wobbly A-frame on two wheels, an arm angled up, a counterweight, a stone | — |
| 衝車 battering ram | `RAM = 7` | the stickman is replaced by a wobbly shed on wheels, a long log hanging from the front, a metal head | — |
| 旗手 standard bearer | `STANDARD = 8` | the personal weapon is replaced by a tall pole carrying the faction's flag cloth | the flag carries the faction's read |

The `drawFoot` function dispatches on `a.type`: equipment types
(`CATAPULT`, `RAM`) take the whole body; the standard bearer
(`STANDARD`) keeps the stickman and swaps the weapon.

### 1.4 The faction colour ramp (§7.2)

Eight colours, assigned at campaign start; the player faction always
takes slot 0. Reused as a low-alpha wash plus the ink line — sash,
name-banner cloth, province fill, and now the flag cloth.

```
blue rgba(70,96,150) · red rgba(150,54,44) · green rgba(64,132,74) ·
ochre rgba(150,120,60) · violet rgba(120,80,140) · teal rgba(60,130,130) ·
brown rgba(120,86,60) · slate rgba(96,104,120)
```

`ZS.figure.wash(i, alpha)` returns the wash string for any ramp entry
at the requested alpha. The flag system has its own wider palette
(`ZS.flag.NAMED`) — see §2.6.

### 1.5 Adding a new unit type

1. Add the constant to the type block at the top of `js/figure/figure.js`.
2. Add a `drawXxx(c, a)` function that follows the §1.1 anchor contract
   (`a.x`, `a.y` is between the feet).
3. Branch in `drawFoot` on `a.type` to dispatch to your drawer (see the
   `CATAPULT` / `RAM` precedent for "replace the whole body" and the
   `STANDARD` precedent for "keep the body, swap the weapon").
4. Tune the per-type stats in `js/scenarios/sanguo.js` (`HP`, `REACH`,
   `DMG`, `SPD`, etc.).
5. Add the i18n key (`battle.type.xxx`) to `js/i18n/{zh-tw,en}.js`.
6. Rebuild the font subset with `python tools/subset-font.py --source
   LXGWWenKaiTC-Regular.ttf` if your type label has new glyphs.

---

## 2. The flag system (`js/art/flag.js`)

Flags are a small generative system. A flag is **two independent record
fields** — `text` (the inscription) and `chrome` (the outer frame) —
and the system renders any combination of them.

```
flag = {
  text:   { char: '蜀', style: 'bold', color: 'rgb(61,52,43)' },
  chrome: { shape: 'swallowtail', border: 'double', pole: true,
            tassels: 2, color: [64, 132, 74] }
}
ZS.flag.draw(c, flag, x, y, w, h, t)
```

The draw call fills the cloth, draws the border, plants the pole,
hangs the tassels, writes the text — all from the data. No image is
loaded; no asset is pre-baked.

### 2.1 The text layer

`text` is a single CJK character (the inscription) plus a render
style:

| `style` | What it draws |
|---|---|
| `bold` (default) | a big character that fills the cloth, in `text.color` (defaults to ink). Used by all presets. |
| `plain` | a smaller character, centred, in ink. |
| `seal` | a small red stamp at the bottom-right corner with the character in white. |

The character is rendered with `ZS.boilText`, so the same call wobbles
in step with the rest of the boil.

### 2.2 The chrome layer

`chrome` is the outer frame:

| Field | Values | Default |
|---|---|---|
| `shape` | `rect` / `shield` / `square` / `swallowtail` / `round` / `pennant` / `diamond` | `rect` |
| `border` | `none` / `thin` / `double` | `thin` |
| `pole` | boolean — vertical pole on the left edge with a finial | `false` |
| `tassels` | 0 / 1 / 2 — bottom-corner tassels (a cord + bead + threads) | 0 |
| `sash` | a colour `[r, g, b]` — draws a horizontal stripe through the middle | — |
| `color` | the cloth fill (an `[r, g, b]` tuple) | — |

The seven shapes (the meaningful vocabulary for ancient Chinese
banners):

- **rect** — the flat rectangle. Most common.
- **shield** — a heraldic shield (rounded top, pointed bottom).
- **square** — a compact square; the "seal" feel.
- **swallowtail** — a banner with a deep V cut at the bottom.
- **round** — a circular roundel.
- **pennant** — a long, narrow triangle. For fast cavalry.
- **diamond** — a lozenge. For special units / general markers.

### 2.3 The eight chrome presets

`ZS.flag.CHROME` carries the canonical combinations a campaign or
battle usually wants:

| Preset | shape | border | pole | tassels | feel |
|---|---|---|---|---|---|
| `plain` | rect | thin | yes | 0 | small flat banner |
| `banner` | rect | thin | yes | 2 | standard banner with corner tassels |
| `shield` | shield | double | no | 0 | the personal flag of a general |
| `great` | swallowtail | double | yes | 2 | the state banner (the big ceremonial one) |
| `seal` | square | thin | no | 0 | a compact square seal |
| `round` | round | thin | yes | 0 | a roundel |
| `pennant` | pennant | none | yes | 0 | a cavalry pennant |
| `diamond` | diamond | thin | no | 0 | a special-unit lozenge |

The presets are layered with `Object.assign` against a `{color}` field
to produce a flag instance — exactly the same pattern as the
`{text, chrome}` split.

### 2.4 The preset catalogue

`ZS.flag.PRESETS` is the named catalogue: 94 entries at last count.
Three groups:

- **3 kingdoms** — `shu` 蜀, `wei` 魏, `wu` 吳 (state names, on the
  `great` chrome).
- **Major families** — `liu` 劉, `cao` 曹, `sun` 孫, `yuan` 袁, `lv` 呂,
  `ma` 馬, `gongsun` 公, `tao` 陶, `hua` 華, `zhang` 張, `wang` 王,
  `kong` 孔, `yan_f` 嚴, `han_f` 韓, `dong` 董 (family names).
- **194 CE warlord roster** — 22 personal flags, one per warlord
  (`liu_bei` 備, `cao_cao` 操, `sun_quan` 權, …, `yan_baihu` 虎).
- **Generals** — 34 entries covering the major rosters of each
  kingdom (Wei: 16, Wu: 8, Shu: 10). The second character of the
  given name is the inscription (`xiahou_dun` 惇, `guan_yu` 羽, …).
- **13 Han provinces** — `yi` 益, `jing` 荊, `liang` 涼, `ji` 冀,
  `yang` 揚, `you` 幽, `yan` 兗, `xu` 徐, `yu` 豫, `bing` 并,
  `qing` 青, `jiao` 交, `si` 司.
- **Imperial + rebellion** — `han_imperial` 漢, `huang_jin` 巾,
  `tian_gong` 天, `yi_jiao` 義, `zei` 賊.

### 2.5 Public API

```js
ZS.flag.draw(c, flag, x, y, w, h, t)    // draw one flag
ZS.flag.plant(c, flag, x, y, h, t)     // a flag planted in the ground
ZS.flag.bearer(flag, x, y, opts)       // factory for a STANDARD unit
ZS.flag.forFaction(factionId)         // faction id -> flag
ZS.flag.get(name)                     // name -> preset
ZS.flag.PRESETS                       // the catalogue (mutable)
ZS.flag.NAMED                         // the colour palette (mutable)
ZS.flag.CHROME                        // the chrome presets
ZS.flag.SHAPES                        // the shape functions
ZS.flag.wash(rgb, alpha)              // rgb + alpha -> "rgba(...)"
```

#### `forFaction(factionId)` — the campaign-pick panel

The figure module's 8-slot `FACTIONS` ramp maps to a flag here. Same id,
same colour in the stickman sash and the flag — the campaign pick
panel, the save-slot thumbnail, the in-battle STANDARD unit all read
from the same place.

#### `plant(c, flag, x, y, h, t)` — in-world markers

`x, y` is the **base of the pole** (where it meets the ground), `h` is
the total height. The pole is 78% of `h`; the flag is the upper 22%.
A ground shadow anchors the base. Used by:

- the battle view, to mark a deployment zone or a captured position
- the campaign map, to flag a held city or province
- the after-action card, to anchor the result line

#### `bearer(flag, x, y, opts)` — battle unit factory

Returns a STANDARD unit spec carrying the given flag. The scenario's
`init` / `maintain` still owns the agents array — this just produces
the record to push.

```
opts: { faction?, tier?, seed?, team? }
returns: { x, y, type: 8 (STANDARD), tier, faction, flag, seed, … }
```

The figure's `drawStandard` checks `a.flag`; if set, the cloth is
rendered through the full `ZS.flag.draw` (shape, color, text); if not,
it falls back to the original generic faction sash. Backwards
compatible with every existing STANDARD unit.

### 2.6 The colour palette

`ZS.flag.NAMED` carries 30+ `[r, g, b]` tuples, wider than the
figure's 8-slot `FACTIONS` ramp because the campaign has more than
8 factions. The figure's stickman sash still reuses the 8-colour
ramp; flags get their own.

```
shu / liu:           [64, 132, 74]    green
wei / cao:          [150, 54, 44]    red
wu / sun:           [70, 96, 150]    blue
yuan:               [150, 120, 60]   ochre
lv:                 [120, 80, 140]   violet
ma:                 [96, 104, 120]   slate
gongsun:            [40, 80, 110]    navy
tao:                [180, 130, 90]   tan
liu_biao:           [60, 130, 130]   teal
liu_zhang:          [120, 86, 60]    brown
hua:                [180, 90, 90]    brick red
zhang:              [110, 100, 130]  dusty purple
wang:               [160, 110, 80]   sandy brown
kong:               [70, 110, 90]    sage
yan_f:              [150, 90, 60]    burnt orange
han_f:              [140, 130, 70]   olive
dong:               [100, 30, 30]    dark crimson
…
(sub-faction variants — darker shades of the kingdom's colour)
…
han_imperial:       [200, 170, 50]   imperial yellow
huang_jin:          [190, 150, 40]   mustard
```

### 2.7 Adding a new flag preset

1. Pick the character (state, family, given-name second char, or
   region).
2. Pick the colour — add it to `ZS.flag.NAMED` if it's new.
3. Pick the chrome — use one of the 8 `ZS.flag.CHROME` presets, or
   build a `{shape, border, pole, tassels, color}` directly.
4. Add the entry to `ZS.flag.PRESETS`:
   ```js
   my_new_flag: _mk("新", NAMED.my_color, "shield"),
   ```
5. Use it: `ZS.flag.draw(c, ZS.flag.get("my_new_flag"), ...)`.

To map it to a figure.FACTIONS id (for the campaign pick panel),
extend `ZS.flag.forFaction` with a new `case` if it should be a player
faction.

---

## 3. Environment art (`js/art/environment.js`)

Reusable world pieces, all drawn through the same primitives. Used by
the campaign map (where they paint the paper Han) and the battle field
(where they dress the open country / fort / town kinds).

| Function | What it draws | Used by |
|---|---|---|
| `tree(c, x, y, r, kind, seed)` | `kind` = `pine` / `oak` / `plum`; `random` chooses | campaign map |
| `pine(c, x, y, r, seed)` | the conical 松 — three triangle layers | campaign map |
| `oak(c, x, y, r, seed)` | a broad 槐 — overlapping foliage blobs | campaign map |
| `plum(c, x, y, r, seed)` | a wobbly 梅 with pink blossoms | campaign map |
| `rock(c, x, y, r, seed)` | a boulder with cracks | campaign map / fort wall |
| `hill(c, x, y, w, h, seed)` | a low hill with a few trees on the ridge | campaign map |
| `river(c, points, w, seed)` | a polyline waterway with a wash + a current line + ripples | campaign map |
| `pond(c, x, y, r, seed)` | a circular pond (river oxbow, lake) | campaign map |
| `camp(c, x, y, w, h, faction, seed)` | a tent camp (3 tents + central banner) | campaign map / fort |
| `wall(c, x1, y1, x2, y2, hp, seed)` | a crenellated wall segment, hp-aware cracks | fort field |
| `gate(c, x, y, w, seed)` | a closed gate with a centre seam + studs | fort field |
| `bridge(c, x, y, w, seed)` | a small wooden bridge with planks | campaign map |
| `ruins(c, x, y, r, seed)` | a small ruined building — broken walls + fallen pillar | campaign map |
| `road(c, points, w, seed)` | a worn dirt road with a centre cart track | campaign map |

`ZS.env.wash(i, a)` is the same wash helper as the figure module,
mirrored so the module is self-sufficient.

---

## 4. UI art (`js/art/ui.js`)

Chrome that doesn't live in the world. Reused by the menu, the
settings panel, the load-game panel, the after-action card.

| Function | What it draws |
|---|---|
| `banner(c, faction, x, y, w, h, seed)` | a small vertical faction banner — pole + finial + cloth + a single "seal" mark |
| `saveThumb(c, x, y, w, h, faction, seed)` | a small landscape: a hill + trees + the player's banner flying |
| `iconBattle(c, x, y, size, seed)` | sword + shield glyph — the **battle** button |
| `iconCampaign(c, x, y, size, seed)` | a scroll glyph — the **campaign** button |
| `iconFlag(c, x, y, size, seed)` | a flag glyph — the **factions** button |
| `iconMusic(c, x, y, size, seed, on)` | a quaver note (or with a slash through it when off) — the **music** toggle |
| `seal(c, x, y, size, seed)` | a red stamp — a brushy ink mark inside a square frame |
| `tally(c, x, y, h, count, seed)` | a group of vertical strokes bundled by fives (with a slash) — troop counts |
| `titleBanner(c, cx, baseY, size, titleW, t)` | the menu's big cloth banner behind the title — two poles + cloth + woven hatches + a sway |

---

## 5. Portraits (`js/figure/portrait.js`)

A small system for the headshot portraits of the 23 named generals,
drawn at 60–120 px. Used outside the battle (per §7.5) — the menu's
"Choose your warlord" panel, the after-action card, the save-slot
icon, the campaign roster.

### 5.1 The vocabulary

Each portrait is a combination of:

- **headgear** — `turban` (the cloth wrap, the common one), `crown` (the
  flat-top 進賢冠), `helmet` (a dome with side flaps + a red tassel),
  `band` (a thin scholarly band).
- **beard** — `long` (the famous 關羽 / 張飛 long beard), `chin` (a
  shorter scholarly one), `goatee` (a small tuft), `moustache` (a
  sweeping Cao Cao style).
- **expression** (a `cue` string) — `kind`, `calm`, `regal`, `stern`,
  `fierce`, `angry`, `clever`, `scheming`, `proud`, `pompous`, `bold`,
  `wild`, `aged`, `scholarly`. The expression drives the brow tilt and
  any extra marks (a scar for `wild` / `aged`).

All four pieces take a deterministic `seed` (hashed from the general's
name) so the portrait is stable per render.

### 5.2 The catalogue

23 generals: Liu Bei, Guan Yu, Zhang Fei, Zhao Yun, Ma Chao, Huang
Zhong, Fa Zheng (Shu); Cao Cao, Xiahou Dun, Xiahou Yuan, Zhang Liao,
Xu Chu, Zhou Yu, Sima Yi (Wei); Sun Quan, Sun Ce, Zhou Tai, Gan Ning,
Lu Xun (Wu); Yuan Shao, Lü Bu, Dian Wei, Hua Tuo (other).

`ZS.portrait.get(id)` returns the record. `ZS.portrait.draw(c, g, x,
y, w, h, t)` draws the headshot.

### 5.3 Adding a new portrait

1. Add a record to `ZS.portrait.CATALOGUE`:
   ```js
   my_general: {
     name:  { "zh-tw": "名", "en": "Name" },
     style: { "zh-tw": "字", "en": "zi" },
     faction: 2,        // the FACTIONS ramp index
     wu: 80, tong: 80, zhi: 70, zheng: 60,
     portrait: { cap: "crown", beard: "long", cue: "scholarly" },
   },
   ```
2. Use it: `ZS.portrait.draw(c, ZS.portrait.get("my_general"), ...)`.

---

## 6. Integration patterns

### 6.1 The campaign-pick panel

```js
// show the 8 possible starting factions
for (let fid = 0; fid < 8; fid++) {
  const f = ZS.flag.forFaction(fid);
  // f is the canonical flag for that faction slot
  ZS.flag.draw(c, f, panelX + col * 200, panelY, 180, 220, t);
}
```

### 6.2 The campaign map — province chip

```js
// each province has a bannerKey; the campaign data stores the
// preset name in its record
const provFlag = ZS.flag.get(province.bannerKey);  // e.g. "jing"
ZS.flag.draw(c, provFlag, provX, provY, 40, 30, t);
```

### 6.3 The battle — deployment zone marker

```js
// at the start of a battle, plant the player's flag at the back
// of their deployment area
ZS.flag.plant(
  c,
  ZS.flag.forFaction(scenario.player),
  1000, 600, 80, t
);
```

### 6.4 The battle — flag-wielding unit

```js
// a STANDARD unit carrying the faction's flag; the scenario's
// init / maintain still owns the agents array
const standard = ZS.flag.bearer(
  ZS.flag.get("wei"),
  unitX, unitY,
  { faction: 1, tier: 3, team: 0 }
);
scenario.agents.push(standard);
```

### 6.5 The after-action card

```js
// the loser's flag, drooped, on the result line
const losFlag = ZS.flag.get(loserFaction.bannerKey);
ZS.flag.plant(c, losFlag, cardX, cardY, 60, t);
```

### 6.6 The menu — title banner

`ZS.uiArt.titleBanner(c, cx, baseY, size, titleW, t)` — the menu
view calls this; the cloth is bigger and more layered than the
`banner()` chrome. The `t` parameter drives a small sway.

---

## 7. The contract with the rest of the engine

- **Nothing here loads external assets.** All drawing is procedural;
  the boil look is the look, no images, no sprite sheets, no fetched
  SVGs. This is the file:// contract (§Hard constraints in
  `AGENTS.md`).
- **No per-frame allocation in hot loops.** The catalogue data is
  shared; the only per-frame allocation is the wrapper object the
  `draw*` functions receive as arguments. The figure pipeline
  (re-using `wline` / `wcirc` / `wpoly`) and the flag pipeline
  (re-using `drawStandard` + `ZS.flag.draw`) both follow the rule.
- **Format with oxfmt, lint with oxlint.** Both must be clean. Run
  before finishing any change. From non-TTY automation, call the
  bins directly (`node node_modules/oxfmt/bin/oxfmt js/art js/figure`
  and `node node_modules/oxlint/bin/oxlint js/art js/figure`).
- **Re-run the font subset when glyphs change.** If you add a new
  character to any i18n key or to a portrait / flag catalogue entry
  that isn't already in the LXGW WenKai TC subset, the missing glyph
  silently falls back to system kai. Run
  `python tools/extend-subset.py` to patch the subset in place
  (stopgap) or `python tools/subset-font.py --source
  LXGWWenKaiTC-Regular.ttf` for a real rebuild from the source
  face.

---

## 8. Quick reference — where things live

```
js/figure/figure.js        — ZS.figure
  drawFoot(c, a, moving)      stickman body + weapon (or equipment)
  drawRider(c, a, moving)     mounted variant
  drawMarks(c, a, t, moving)  banner, aura, sash, panic ticks, hit flash
  drawStandard(c, a, hx, hy, k)   the flag-bearing variant; honours a.flag
  drawShield(c, a, hx, hy, k)
  drawCatapult(c, a) / drawRam(c, a)
  wash(i, alpha)              FACTION colour at the given alpha

js/figure/portrait.js     — ZS.portrait
  draw(c, g, x, y, w, h, t)   one headshot
  get(id)                     name -> record
  CATALOGUE                   23 named generals

js/art/flag.js            — ZS.flag
  draw(c, flag, x, y, w, h, t)  one flag
  plant(c, flag, x, y, h, t)   in-world planted flag
  bearer(flag, x, y, opts)    STANDARD unit factory
  forFaction(id)              faction id -> flag
  get(name)                   name -> preset
  drawText(c, t, bounds, s)   the inscription only
  SHAPES, CHROME, NAMED, PRESETS

js/art/environment.js     — ZS.env
  tree, pine, oak, plum, rock, hill, river, pond, camp, wall, gate,
  bridge, ruins, road, wash

js/art/ui.js              — ZS.uiArt
  banner, saveThumb, iconBattle, iconCampaign, iconFlag, iconMusic,
  seal, tally, titleBanner, wash
```

Verification scripts:

```
.verify/flag-grid.js        — render the full flag catalogue + planted + bearer + forFaction
.verify/portrait-grid.js    — render all 23 portraits
.verify/sanguo-shot.js      — screenshot the menu (both locales)
```
