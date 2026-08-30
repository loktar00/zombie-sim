# 火柴三國 — build progress

Living status file for the build described in [`SANGUO-DESIGN.md`](SANGUO-DESIGN.md).
**Read this first when resuming.** It is updated as work lands, so a fresh
session (or one after a usage-limit reset) can pick up mid-phase without
re-deriving anything.

- Design contract: `SANGUO-DESIGN.md` (§10 has the phase table)
- Engine rules: `AGENTS.md` (hard constraints — file://, no build step, oxfmt/oxlint)
- Open issues: [`ISSUES.md`](ISSUES.md) — one needs a decision (issue 1)

---

## Current position

| | |
|---|---|
| **Phase** | **P2 — battle depth** |
| **Status** | 🚧 **in progress** (P0–P1 ✅) |
| **Verify** | P2 local browser probe: **6/6 seeds resolve in 62–119 s**, fixed-seed replay is identical, every commander branch and the feedback clock pass; headed Chrome holds **60.0 fps at 2,000/side**; original three pages boot clean<br>P1 baseline (machine-local suites): 62 / 45 / 23 assertions; 16-seed sweep green before P2 |
| **Updated** | 2026-08-30 |

### Next action

**Continue P2 — formation tuning.** Morale, generals, the first active ability,
combat feedback, the enemy commander and render LOD are complete. One P2 item
remains:

1. **Formation tuning** — P1 wires all five generators and really only tunes
   `line` and `wedge`; tune column / square / skirmish and visually verify every
   transition under movement and casualties.

The fixed sim step P2 also lists is **already done** — P1's determinism test
needed it. See decision 12 below.

---

## Phase ledger

Legend: ☐ not started · 🚧 in progress · ✅ done · ⛔ blocked

| Phase | Deliverable | Status |
|---|---|---|
| P0 | boot to MENU, font, i18n, Auth/Store/SaveManager round-trip | ✅ |
| P1 | Skirmish battle: `ScenarioSanguo` + command layer | ✅ |
| P2 | Battle depth: formations, morale, abilities, fixed step, LOD | 🚧 |
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
| 0.10 | `index.html` page + `@font-face` + palette CSS | ✅ | `index.html` |
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
| 1.10 | Playwright P1 verification (62 assertions) | ✅ | `.verify/sanguo-p1.js` |
| 1.11 | Regression suite for the three original pages | ✅ | `.verify/pages-regression.js` |
| 1.12 | Bug sweep: 12 fixed, each one now an assertion | ✅ | see below |
| 1.13 | Seed sweep — no battle may hang | ✅ | `.verify/sanguo-seed-sweep.js` |

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
- **no battle hangs**: eight seeds fought out against a completely passive
  player all reach a decision, in 20-200 s
- the side ledger never goes negative and always sums to what was deployed
- an advance is not halted by a man running away; hotkeys stay out of form
  fields; order markers fade on elapsed time; `go()` to an unbuilt phase leaves
  a running battle untouched; an unreachable goal is refused and leaves the
  current order intact
- the three original pages are untouched by the core changes

---

## P2 task board

| # | Task | Status | Files |
|---|---|---|---|
| 2.1 | Unit morale pool: casualties, odds, flank/rear pressure and fatigue | ✅ | `js/battle/morale.js` |
| 2.2 | `steady → wavering → routing → rally`; rally only inside a living general's aura | ✅ | `js/battle/morale.js`, `js/scenarios/sanguo.js` |
| 2.3 | General figures from `BattleSetup.generals`: tier 將, name banner, derived aura/cohesion, command-loss shock | ✅ | `js/scenarios/sanguo.js`, `js/figure/figure.js` |
| 2.4 | First active ability: deterministic, cooldown-gated inspire / 將令 morale heal | ✅ | `js/battle/ability.js`, `js/battle/command.js` |
| 2.5 | Morale bar + inspire ring/tick feedback | ✅ | `js/battle/command.js`, `js/scenarios/sanguo.js` |
| 2.6 | Charge shake, general-kill hitstop and hit-vector bursts | ✅ | `js/battle/feel.js`, `js/camera.js`, `js/main.js`, `js/scenarios/sanguo.js` |
| 2.7 | Influence-map enemy commander | ✅ | `js/battle/commander-ai.js` |
| 2.8 | Render LOD + headed `FIELD_CAP` fps probe | ✅ | `js/figure/figure.js`, `js/scenarios/sanguo.js` |
| 2.9 | Tune column / square / skirmish formations | ☐ | `js/battle/formation.js` |

### What the P2 slice proves so far

- the default 640-man skirmish still fields exactly 640 figures; one figure on
  each side is promoted to the general supplied by `BattleSetup`, not added as
  a free extra body
- morale is updated per unit four times per second rather than by a hot-loop
  neighbour scan on every agent; no per-frame records or arrays are allocated
- casualty rate, local odds, rear pressure and average fatigue lower the pool;
  a living general raises its ceiling/recovery and formation cohesion
- a general death or rout shocks every still-fighting friendly unit exactly
  once; routed blocks can recover only while on-field fugitives remain inside
  another living general's aura
- `G` invokes inspire through `js/battle/ability.js`; it scales from `zhi`,
  respects a 24 s cooldown, writes to the deterministic order log, and gives a
  short sketch-ring/tick response that returns to rest
- charge contact emits one directional sketch burst per order and adds
  render-only camera trauma; a general kill adds a stronger burst and a 90 ms
  real-time hitstop without advancing simulation time or consuming the battle
  PRNG. Pointer-to-world mapping remains exact while the camera is displaced
- the enemy commander's best `zhi` sets its decision cadence; three reused
  18×14 typed influence maps feed a shallow probe / hold / press / reserve /
  retreat tree, while all movement still goes through the existing flow field
- a six-seed passive-player probe resolves every battle in 62–119 s; seed 47
  replayed with the same duration, winner and agent-position digest. Forced
  branch probes cover hold, reserve commitment and retreat
- close zoom still uses the exact full stickman; mid zoom keeps
  head/torso/weapon silhouettes, and only large fit-view fields collapse formed
  ranks into reused `wpoly` washes. Routed troops stay as sparse individuals
- at 4,000 figures in headed Chrome, fit-view render submission fell from
  **12.4 ms to 0.8 ms** while close zoom stayed effectively flat
  (**7.2 → 7.0 ms**). The real rAF probe held **60.0 fps**, p95 16.8 ms and max
  17.7 ms, so `FIELD_CAP = 2000` per side is confirmed
- `zombiesim.html`, `battle.html` and `hold.html` still boot their own scenario
  with their expected populations, zero shake offsets and no page errors

---

## Core changes made for P1

`AGENTS.md` allows core changes that stay scenario-agnostic. Three were needed;
all are opt-in and no-ops for `zombiesim.html` / `battle.html` / `hold.html`, and
`.verify/pages-regression.js` exists to keep it that way.

| File | Change | Why |
|---|---|---|
| `js/main.js` | body wrapped in `ZS.Engine.start(opts)`, auto-starting unless the page sets `ZS_MANUAL_BOOT`. Adds `stop()`, `step(dt)`, `speed`, `fixedStep`. | The shell has a MENU before it has a battle, and rebuilds the battle every time one is fought. |
| `js/draw.js` | `hand()` returns `ZS.scenario.hudFont` when a pack sets one; new `scenario.drawWorld(c, t)` hook after `drawFX`. | The HUD is Chinese and needs the kai stack; the command overlay has to draw even on a frame with no effects pending. |
| `js/agents.js` | the exact-overlap separation nudge is `ZS.hash(a.id, b.id)` instead of `Math.random()`. | It was the last thing keeping a fixed-seed battle from replaying identically. Just as arbitrary, now reproducible. |

P2 adds two more opt-in core hooks. `Camera` carries render offsets and removes
them again in `toWorld()`, so feedback never changes simulation coordinates or
pointer accuracy. The fixed-step rAF loop asks an optional
`scenario.frameFeedback(dt, t)` for those offsets and a real-time hold; packs
without the hook keep `[0, 0]` and run exactly as before. Headless
`engine.step(dt)` deliberately ignores feedback time, preserving fast,
deterministic probes.

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
   additive — only `index.html` loads it, `js/sketch.js` is untouched.
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
14. **Battle feedback owns a separate deterministic sequence.** Charge and
    general-kill bursts derive their seeds from event geometry plus a local
    counter; they never call the scenario RNG. Turning a particle on or off
    therefore cannot change the next combat roll.
15. **The commander opens with two short probes before committing.** A fully
    coordinated six-block advance made contact too efficiently and collapsed
    sampled battles in 32–40 s. The staged probe remains active on screen,
    gives the player a first-command beat, and keeps passive-player battles in
    the designed 60–180 s window. A crisis can still promote a reserve before
    the opening completes.
16. **Far mass LOD is population-aware.** At the normal 640-man skirmish, fit
    view keeps individual mid-detail silhouettes; rank masses activate at fit
    zoom only on fields above 1,200 figures. Close zoom always uses the frozen
    full figure. This preserves the product look where the renderer has budget
    and spends the abstraction only where the 4,000-figure cap needs it.

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

Tracked in [`ISSUES.md`](ISSUES.md). Nothing blocks P2; issue 1 (the test
suites are not committed) is waiting on a call about repo layout.
- **Rebuild the font subset whenever `js/i18n/*.js` or `js/campaign/data/*.js`
  gains new text** — new glyphs silently fall back otherwise. `.verify/sanguo-p0.js`
  runs the coverage check for you; standalone it is
  `python tools/subset-font.py --check`. Rebuilding needs the source face
  (LXGWWenKaiTC-Regular.ttf v1.522, ~15 MB) re-downloaded from
  <https://github.com/lxgw/LxgwWenkaiTC/releases> — it is deliberately not
  committed. See `fonts/README.md`.

---

## Bugs worth remembering

### The stall family

Six separate faults, every one of which presented as "the battle stalls and
never ends". They were found by sweeping seeds with a passive player and
watching where blocks ended up, not by reading code — the endpoints all looked
the same and the causes were all different. `.verify/sanguo-seed-sweep.js` is
that sweep, kept; the P1 suite runs a shorter version every time.

The tell that broke it open was instrumenting a stuck block: **unit drive 43
px/s, average member speed 4 px/s**. The unit was being commanded correctly and
the men were not going. Once that was measured the rest fell out quickly.

5. **Men braked to a halt to fight people who were running away.** The melee
   branch sheds momentum on purpose — that is how a line braces — but it fired
   for any enemy in reach, routers included. A block standing in a rout froze
   mid-march. Its mirror image: a *stationary* block's men chased routers
   individually (drive 0, member speed 55) and tore the formation across the
   map. Now a man in reach is struck either way, and only a *fighting* enemy is
   worth stopping for; pursuit is a unit decision, not each man's.
6. **Slot targets could fall outside the map.** A block pushed into a corner put
   half its slots off-world; those men could never reach them, kept pulling
   outward, and because the slot pull (58) beats the march drive (40) the whole
   block deadlocked against the edge. Slots are clamped inside the field now.
7. **`_setGoal` moved the goal before deciding it was reachable**, so a refused
   goal still overwrote `tx`/`ty` and left a HOLD block carrying a destination
   it would never march to.
8. **A `FlowField.build()` that failed left the previous field in place.**
   `built` stayed set, the old costs stayed in the arrays, and `distAt`
   cheerfully answered for a goal the field knew nothing about — so an
   impossible order was accepted as reachable. A failed build invalidates the
   field, `distAt` returns Infinity when it is not built, and `_setGoal` honours
   what `build()` returned.
9. **A battle neither side could finish had no ending.** Two spent remnants that
   cannot reach or break each other are a real outcome, not a bug — but running
   for ever is. A field where nobody has fallen for 45 s is now called: the
   stronger remnant holds it, or it is a draw. `BattleResult.winner` already
   admitted `"draw"` (§4.3).
10. **No watchdog.** Any *future* "unit wedged somewhere we did not predict" bug
    would again become an unkillable battle, so an order that has made no
    progress for 12 s is dropped and re-planned. This is the backstop, not the
    fix.

### The ledger

11. **The dead kept taking their AI turn.** The core's AI pass walks the whole
    array without skipping the dead, and compaction only runs at end of frame —
    so a man killed earlier in the same pass could still rout, decrementing
    `alive` for someone already counted in `dead`. Side counts drifted negative
    (`standing -3`). `update()` returns early for the dead now, and both
    `_kill` and `_setRout` are idempotent.

### The rest

12. **Battle hotkeys fired while typing in a form field** — pressing "A" in the
    settings panel selected the whole army.
13. **Order markers decayed by an assumed 1/60 per draw**, so they lasted twice
    as long at 30 fps and half as long at 120.
14. **`App.go()` to a phase with no view tore the current one down first**, then
    re-entered it on failure. From the menu that was invisible; from a battle it
    would have thrown the fight away and deployed a new one.
15. **`FlowField.isFor()` compared against the *resolved* goal**, so any order
    whose target had to be relocated onto open ground rebuilt an identical
    field on every issue.
16. **A save that ran out of quota part-way could leave a `:shadow` key behind**,
    which the next read would have to step over.
17. **`RemoteStore` slept out a backoff after its final attempt** before giving
    up.
18. **Halting left an order in the queue that could never complete** — the
    arrival test skips HOLD — so a halted block read as "busy" to anything
    asking whether it had orders.
19. **Nothing told the player how to move the camera.** Left-drag is box-select
    and right-drag is an order, so both are claimed; middle-drag and the wheel
    were the only ways to pan and neither was mentioned. The hint says so now.

### The original four, from the P1 build

Every one of these also presented as "the battle stalls":

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
  `index.html`, boiling canvas type, the font loader and subset tool, and the
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
- **2026-08-30 (cont.)** — bug sweep. 15 more fixed (see above), the worst of
  them a family of six that all showed up as a battle that would not end: half
  the seeds tested hung for ever. All 16 seeds now resolve in 30-186 s. Each fix
  is an assertion in the P1 suite, which is up from 51 to 62.
- **2026-08-30 (cont.)** — page rename: the outbreak moved to `zombiesim.html`
  and 火柴三國 became `index.html`, the entry point. 45 references updated
  across docs, the font tool, the scenario headers, the verify suites and
  `.vscode/launch.json` (which now has a config per page). `example/index.html`
  is untouched — it is the frozen reference original. All suites re-run green.
- **2026-08-30 (cont.)** — started P2. Replaced per-agent local-press morale
  with `js/battle/morale.js`: a unit pool driven by losses, odds, rear pressure,
  fatigue and commander presence, with wavering, routing and general-gated
  rally. Promoted `BattleSetup.generals` into real tier-將 figures with derived
  aura/cohesion and command-loss shock. Added the first cooldown active in
  `js/battle/ability.js` (`G`: inspire / 將令), its deterministic order-log
  entry, morale bar and sketch-ring feedback. Six fixed seeds resolve in
  80–151 s; seed 47 replays identically; the three earlier pages boot clean.
- **2026-08-30 (cont.)** — continued P2. Added proportional charge/general-kill
  feedback (`js/battle/feel.js`), render-only camera trauma, and a 90 ms
  real-time hitstop that leaves fixed simulation time and replay RNG alone.
  Replaced the nearest-target placeholder with `js/battle/commander-ai.js`:
  reused influence-map buffers, `zhi`-scaled planning, staged probes and a
  shallow morale-aware priority tree. Six seeds now resolve in 62–119 s; seed
  47 repeats exactly; forced hold/commit/retreat checks and all three legacy
  page boots pass.
- **2026-08-30 (cont.)** — completed P2 render LOD. Kept the close figure
  unchanged, added the specified mid silhouette and far rank-mass paths with
  reused geometry, and retained sparse individual fugitives for routed blocks.
  On headed Chrome at 2,000/side, fit render cost dropped 12.4 → 0.8 ms and an
  actual 180-frame rAF sample held 60.0 fps (p95 16.8 ms, max 17.7 ms), so the
  provisional `FIELD_CAP = 2000` is accepted. Normal 640-man fit view remains
  individual, not massed.
