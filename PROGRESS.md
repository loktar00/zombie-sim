# 火柴三國 — build progress

Living status file for the build described in [`SANGUO-DESIGN.md`](SANGUO-DESIGN.md).
**Read this first when resuming.** It is updated as work lands, so a fresh
session (or one after a usage-limit reset) can pick up mid-phase without
re-deriving anything.

- Design contract: `SANGUO-DESIGN.md` (§10 has the phase table)
- Engine rules: `AGENTS.md` (hard constraints — file://, no build step, oxfmt/oxlint)

---

## Current position

| | |
|---|---|
| **Phase** | **P1 — the skirmish battle** |
| **Status** | ✅ **complete** (P0 ✅ too) |
| **Verify** | `node .verify/sanguo-p1.js` → **51 passed, 0 failed**<br>`node .verify/sanguo-p0.js` → **45 / 0 / 0**<br>`node .verify/pages-regression.js` → **23 / 0** (the other three pages) |
| **Updated** | 2026-08-30 |

### Next action

**Start P2 — battle depth.** The pieces, roughly in order:

1. **Morale / fatigue / rout rewrite** (§4.4). P1 ships Cannae's local-press
   model plus fatigue; P2 wants the unit morale pool fed by casualties, flank
   and rear hits, general proximity and local outnumbering, with
   `wavering -> routing -> rally`, and rally only near a general.
2. **General units** — one figure per assigned general at tier 將, the name
   banner and the aura ring (`ZS.figure` already draws all three; nothing
   creates a general yet), plus the morale shock when one falls.
3. **One active ability**, through `js/battle/ability.js`.
4. **Game feel** — screenshake on charges, hitstop on a general kill, `ZS.fx`
   bursts along the hit vector.
5. **Render LOD + the `FIELD_CAP` fps probe.** `ZS.figure.drawFoot` is the
   near-detail case; add mid (head/torso/weapon) and far (`wpoly` mass shapes)
   buckets keyed on camera distance, then probe 2000/side and either confirm
   the cap or set the fallback of about 800 (the perf caveat in §4.1).
6. Formation tuning: P1 wires all five generators and really only tunes
   `line` and `wedge`.

The fixed sim step P2 also lists is **already done** — P1's determinism test
needed it. See decision 12 below.

---

## Phase ledger

Legend: ☐ not started · 🚧 in progress · ✅ done · ⛔ blocked

| Phase | Deliverable | Status |
|---|---|---|
| P0 | boot to MENU, font, i18n, Auth/Store/SaveManager round-trip | ✅ |
| P1 | Skirmish battle: `ScenarioSanguo` + command layer | ✅ |
| P2 | Battle depth: formations, morale, abilities, fixed step, LOD | ☐ |
| P3 | Campaign skeleton: map, provinces, armies, turn phases | ☐ |
| P4 | The handoff: `BattleSetup`/`BattleResult`, field kinds, auto-resolve | ☐ |
| P5 | Generals as RPG: xp, skills, items, loyalty, duels | ☐ |
| P6 | AI factions, events, after-action card, `RemoteStore` | ☐ |
| P7 | Balance, content, audio | ☐ |

---

## P0 task board

| # | Task | Status | Files |
|---|---|---|---|
| 0.1 | `ZS.Store` contract + `MemoryStore` | ✅ | `js/store/store.js` |
| 0.2 | `ZS.LocalStore` | ✅ | `js/store/local.js` |
| 0.3 | `ZS.RemoteStore` (written, unexercised until P6) | ✅ | `js/store/remote.js` |
| 0.4 | `ZS.Auth` seam + `AnonAuth` deviceId | ✅ | `js/auth/auth.js` |
| 0.5 | `ZS.SaveManager` schema/migrate/capture/apply/autosave | ✅ | `js/save/save-manager.js` |
| 0.6 | `ZS.i18n` t/n/nc/set/fallback/date | ✅ | `js/i18n/i18n.js` |
| 0.7 | zh-tw + en string tables | ✅ | `js/i18n/zh-tw.js`, `js/i18n/en.js` |
| 0.8 | `ZS.App` state machine + MENU view | ✅ | `js/app.js` |
| 0.9 | DOM menu overlay (locale toggle, slots, about) | ✅ | `js/ui/menu.js` |
| 0.10 | `sanguo.html` page + `@font-face` + palette CSS | ✅ | `sanguo.html` |
| 0.11 | Boiling canvas type (`ZS.boilText`) | ✅ | `js/text.js` |
| 0.12 | Font loader (data-URI path for file://) | ✅ | `js/fonts/font.js` |
| 0.13 | Font subset tooling + `--check` coverage mode | ✅ | `tools/subset-font.py` |
| 0.14 | Font subset asset (65 KB woff2, 299 glyphs) + OFL text | ✅ | `fonts/`, `js/fonts/subset-data.js` |
| 0.15 | Playwright P0 verification | ✅ | `.verify/sanguo-p0.js` |
| 0.16 | oxfmt + oxlint clean | ✅ | — |

### What P0 actually proves (the verify script's assertions)

- boots into `MENU`, canvas sized, main panel on screen
- `LocalStore` is the bound backend, over **http and file://** alike
- zh-tw is the default; `<html lang>` tracks it; the title resolves through `t()`
- a `deviceId` is minted, persisted at `hsg:v1:device`, and **stable across reload**
- locale toggle refills the DOM both directions; locale persists standalone
- number formats: en `80,000` / `80K`, zh-tw `8萬`; unknown keys render visibly
- bilingual content objects (`{ "zh-tw": "關羽", en: "Guan Yu" }`) resolve by locale
- save → reload → load restores settings and locale
- the shadow→main→bak dance leaves no `:shadow` and does leave a `:bak`
- a **torn main key recovers from `:bak`**
- a **future-version save is refused whole** (`future_version`), a missing slot is `not_found`
- `MemoryStore` honours the same contract; `deleteSlot` clears all three rungs
- LXGW WenKai TC actually renders — over http **and** on `file://`, where the
  data-URI path is the only one that can work
- every glyph the i18n tables can produce is inside the built subset
- no unexpected console errors

---

## P1 task board

| # | Task | Status | Files |
|---|---|---|---|
| 1.1 | `ZS.Engine.start/stop` — the engine bootstrap made callable | ✅ | `js/main.js` |
| 1.2 | Fixed sim step + `speed` (0 / 1x / 2x / 4x) + headless `step(dt)` | ✅ | `js/main.js` |
| 1.3 | `ZS.FlowField` — Dijkstra group movement | ✅ | `js/battle/flowfield.js` |
| 1.4 | `ZS.Formation` — five slot generators + greedy re-solve | ✅ | `js/battle/formation.js` |
| 1.5 | `ZS.figure` — the §7 stickman baseline made executable | ✅ | `js/figure/figure.js` |
| 1.6 | `ScenarioSanguo` — orders, combat, morale, rout, deployment | ✅ | `js/scenarios/sanguo.js` |
| 1.7 | `ZS.Command` — selection, control groups, orders, overlay | ✅ | `js/battle/command.js` |
| 1.8 | BATTLE view + skirmish entry + battle bar | ✅ | `js/app.js`, `js/ui/menu.js` |
| 1.9 | Battle i18n keys (both tables) + font subset rebuild | ✅ | `js/i18n/*`, `fonts/` |
| 1.10 | Playwright P1 verification (51 assertions) | ✅ | `.verify/sanguo-p1.js` |
| 1.11 | Regression suite for the three original pages | ✅ | `.verify/pages-regression.js` |

### What P1 proves

- the shell hands the frame loop to the engine and takes it back; **never two
  loops**, and leaving a battle removes every listener the engine added
- 640 men deploy as 12 blocks of four types, 1 figure = 1 man
- click-select, box-select, control groups, select-all, halt, formation cycle
- right-click attack-moves, right-click on an enemy charges, ctrl+right marches,
  shift queues — and every order lands in the replay log
- **active pause**: orders still work while the sim is frozen (Q5)
- a battle runs about 96 s to a decision, both sides bleed, the loser breaks
  rather than dying to the last man, and the ledger balances
- **determinism**: same seed + same orders gives the same duration, the same
  winner, the same casualties, and the same men in the same places (a position
  digest over every agent) — while a different seed fights a different battle
- the three original pages are untouched by the core changes

---

## Core changes made for P1

`AGENTS.md` allows core changes that stay scenario-agnostic. Three were needed;
all are opt-in and no-ops for `index.html` / `battle.html` / `hold.html`, and
`.verify/pages-regression.js` exists to keep it that way.

| File | Change | Why |
|---|---|---|
| `js/main.js` | body wrapped in `ZS.Engine.start(opts)`, auto-starting unless the page sets `ZS_MANUAL_BOOT`. Adds `stop()`, `step(dt)`, `speed`, `fixedStep`. | The shell has a MENU before it has a battle, and rebuilds the battle every time one is fought. |
| `js/draw.js` | `hand()` returns `ZS.scenario.hudFont` when a pack sets one; new `scenario.drawWorld(c, t)` hook after `drawFX`. | The HUD is Chinese and needs the kai stack; the command overlay has to draw even on a frame with no effects pending. |
| `js/agents.js` | the exact-overlap separation nudge is `ZS.hash(a.id, b.id)` instead of `Math.random()`. | It was the last thing keeping a fixed-seed battle from replaying identically. Just as arbitrary, now reproducible. |

---

## Decisions made during build

Implementation-level choices the design doc did not pin down. (Design decisions
live in `SANGUO-DESIGN.md` §11.)

1. **`SCHEMA_VERSION = 1`.** §5.3's snapshot example shows `version: 3`
   illustratively; the first shipped schema is 1. The `migrateUp` chain is in
   place and empty, per §5.4's "exists from v1".
2. **The shadow+bak dance lives in `SaveManager`, not `LocalStore`.** The Store
   contract stays "dumb key/blob persistence" (§5.2). `SaveManager` branches on
   `store.capabilities.atomic`: false (localStorage) → shadow→main→bak; true
   (a server `PUT`) → a single write. `_read` falls back to `:bak` when the main
   key is missing or unparseable.
3. **Snapshots are assembled from registered sections.** `SaveManager.register
   (name, {capture, apply})` instead of a hard-coded field list, so P3 adds the
   campaign and P5 the roster without editing `save-manager.js`. P0 registers
   `settings` only.
4. **Settings persist standalone as well** (`hsg:v1:settings`), alongside the
   designed `hsg:v1:locale` key. The menu has to remember volume and language
   before any campaign exists; the save snapshot stays authoritative once a game
   is loaded.
5. **The font ships two ways** (§6.3 assumed one). A `@font-face` whose `src` is
   a `file://` URL is a CORS-mode fetch from an opaque origin and browsers
   refuse it — which would silently kill the brush-kai on a double-clicked page,
   the exact case `AGENTS.md` constraint 1 protects. So `tools/subset-font.py`
   emits **both** `fonts/lxgw-wenkai-tc.subset.woff2` (used when served over
   http, via the `@font-face` rule) **and** `js/fonts/subset-data.js`, the same
   bytes as a `data:` URI loaded through the `FontFace` API. `ZS.Fonts.via`
   reports which path won (`"data" | "css" | "fallback"`).
6. **`js/text.js` is a new file** not in the §9 file plan. §6.3 requires canvas
   type drawn per-glyph with a jit offset/rotation; that is a drawing primitive,
   not stickman art, so it did not belong in `js/figure/figure.js`. It is
   additive — only `sanguo.html` loads it, `js/sketch.js` is untouched.
7. **`ZS.App` runs its own rAF loop in P0.** `main.js` builds a world and a
   scenario at load, which the menu has no use for. P1 wires the engine loop for
   the BATTLE view; `App.stop()` exists so the two never run at once (§2).
8. **`ZS.i18n.nc()`** is the compact number form (`8萬` / `80K`); `n()` stays
   exact and grouped. §6.4 asked for locale-configured grouping without naming
   the split.
9. **`open` is a bare plain in P1, not the river/hills/forest §4.3 describes.**
   `world.water()` only runs its pinned, scenario-placed path when *both*
   `riverBaseX` and `lake` are passed; with one of them missing it falls
   through to the generative branch, which laid a river diagonally across the
   middle of the battlefield. The two armies then deployed on opposite banks,
   and remnants that drifted into the water were pinned there by the core's
   walkability clamp — a battle that could never end. Terrain comes back at P4
   with `town` and `fort`, when the flow field routes around it and the
   deployment respects it. `_findField` (ported from `cannae.js`) already
   searches for dry ground, so the seam is in place.
10. **The battle ends on the rout, not on annihilation.** Cannae runs until one
    side is literally dead or off the field; a side here is beaten when nobody
    on it is still fighting (`sides[s].alive <= 0`). The same story told at
    skirmish length — about 96 s, inside the design's 60-180 s window (§1).
11. **`ScenarioSanguo` reads a `BattleSetup` from the start** (§4.3), even
    though P1 has no campaign to build one. `defaultSetup()` produces the
    skirmish, so P4's handoff has nothing left to invent.
12. **The fixed sim step landed in P1, not P2.** §8 files it under P2's
    performance work, but P1's own verify row asks for a "deterministic-seed
    replay test", which is not possible on a variable frame delta. It is
    `ZS.Engine`'s `fixedStep` option, off by default, and it also buys the
    active pause and 2x/4x for free.
13. **"Is the real face loaded?" is answered with pixels, not widths.** The usual
   trick — measure the string in the family, measure it in a generic, compare —
   cannot work for CJK: every glyph is exactly 1em wide in LXGW WenKai TC *and*
   in every system fallback, so both measure identically. `document.fonts.check`
   is also unreliable while the CSS `@font-face` sits unloaded beside the
   JS-added face. `ZS.Fonts.check()` rasterizes 火柴三國 twice and diffs the
   alpha channel instead.

---

## Gotchas for the next session

- **Do not run `oxfmt js/`.** It rewrites all 17 pre-existing core files to LF
  line endings (content unchanged, but 17 files show as modified). Format the
  sanguo files only:

  ```bash
  node node_modules/oxfmt/bin/oxfmt js/app.js js/text.js js/store js/auth js/save js/i18n js/ui js/fonts
  ```

  `node node_modules/oxlint/bin/oxlint js/` over everything is safe.
- **Backslashes get mangled in Bash heredocs here.** Write JS/regex files with
  the Write tool, not `cat <<'EOF'`.
- Chromium keeps `localStorage` working on `file://`, so a double-clicked page
  gets real `LocalStore`, not the memory fallback (the verify script asserts
  both paths).

## Open / blocked

- Nothing blocking P2.
- **Rebuild the font subset whenever `js/i18n/*.js` or `js/campaign/data/*.js`
  gains new text** — new glyphs silently fall back otherwise. `.verify/sanguo-p0.js`
  runs the coverage check for you; standalone it is
  `python tools/subset-font.py --check`. Rebuilding needs the source face
  (LXGWWenKaiTC-Regular.ttf v1.522, ~15 MB) re-downloaded from
  <https://github.com/lxgw/LxgwWenkaiTC/releases> — it is deliberately not
  committed. See `fonts/README.md`.

---

## Bugs worth remembering

Four in the movement layer. Every one of them presented as "the battle stalls
and never ends", and none was where it looked:

1. **The flow field's heap was keyed by reading `cost[cell]` at compare time.**
   This is decrease-key-by-reinsertion, so improving a cell's cost silently
   re-keyed entries already sitting in the heap; the ordering broke and whole
   regions of the map stopped expanding. The key is now copied in at push time.
2. **The same heap was sized `n + 1`.** A cell is pushed once per improving
   edge, so the bound is edges, not cells — and a typed array drops
   out-of-range writes without a word. It grows on demand now.
3. **`Formation.slots()` did not centre its output.** The wedge grows backwards
   from its point, so every man sought a slot offset behind the unit centroid,
   the centroid followed them back, and the block crawled off the map under its
   own formation. Centring happens inside `slots()` now, so a new generator
   cannot reintroduce it.
4. **Retargeting did not rebuild the flow field.** The hunt and the AI wrote
   `u.tx` / `u.ty` directly, which left the block steering down the *previous*
   goal's field. Every goal change goes through `_setGoal()` now, which
   rebuilds and records whether the goal is reachable at all.

## Session log

- **2026-08-30** — read `SANGUO-DESIGN.md`; created this file; built P0:
  store/auth/save seams, i18n with both tables, the app shell and menu view,
  `sanguo.html`, boiling canvas type, the font loader and subset tool, and the
  Playwright P0 check (42 pass / 0 fail / 1 warn). oxfmt + oxlint clean.
  Screenshots in `.verify/sanguo-menu-{zh,en}.png`, `.verify/sanguo-settings.png`.
  Then downloaded LXGW WenKai TC v1.522, built the 52 KB / 255-glyph subset
  (both the `.woff2` and the `data:` URI), added `--check` coverage mode and the
  OFL text, and fixed the font detector — the original width probe could never
  work, because every CJK glyph is exactly 1em wide in the real face *and* in
  every system fallback, so it now compares rasterized pixels. Final: 45 pass /
  0 fail / 0 warn. Committed to `main`.
- **2026-08-30 (cont.)** — built P1: the engine bootstrap seam, flow-field group
  movement, formations as data, the §7 stickman baseline, `ScenarioSanguo`, the
  command layer, the BATTLE view, and the fixed sim step that makes a battle
  replayable. Four movement bugs found and fixed (see above). 51 / 0 on P1,
  45 / 0 / 0 on P0, 23 / 0 on the pages regression. Screenshots in
  `.verify/sanguo-battle-*.png`.
