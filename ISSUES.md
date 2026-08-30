# Open issues

Known-open items across the repo. Bugs that have been **fixed** are not here —
they live in `PROGRESS.md` under "Bugs worth remembering", which is the record
of what went wrong and why. This file is only what is still outstanding.

Design decisions that were made deliberately live in `SANGUO-DESIGN.md` §11.
Something only belongs here if it is genuinely unresolved, or is a limitation
someone could reasonably trip over.

| Status | Meaning |
|---|---|
| **DECIDE** | blocked on a call the maintainer has to make |
| **OPEN** | real, actionable, nobody is on it |
| **DEFERRED** | known limitation, already scheduled into a later phase |
| **NIT** | minor; fix if you are in the area |

| # | Status | Area | Summary |
|---|---|---|---|
| [1](#1) | **DECIDE** | tooling | `.verify/` is gitignored, so no test suite is committed |
| [2](#2) | OPEN | tooling | The font subset can silently fall out of date |
| [3](#3) | OPEN | battle | Battle pacing constants are untuned guesses |
| [4](#4) | DEFERRED | battle | `open` battlefields are a bare plain — no river, hills or forest |
| [5](#5) | DEFERRED | battle | `FIELD_CAP = 2000` is unvalidated; P1 fields 320/side |
| [6](#6) | DEFERRED | battle | Enemy commander AI is a placeholder |
| [7](#7) | DEFERRED | structure | Battle systems that §9 wants split still live in `sanguo.js` |
| [8](#8) | NIT | tooling | `oxfmt js/` rewrites line endings across every core file |
| [9](#9) | NIT | render | `scenario.hud()` allocates per frame |

---

## 1

**DECIDE · tooling · the verification suites are not committed**

`.gitignore` excludes `.verify/`, so none of these are in the repository:

```
.verify/sanguo-p0.js          45 assertions
.verify/sanguo-p1.js          62 assertions
.verify/pages-regression.js   23 assertions — guards the other three pages
.verify/sanguo-seed-sweep.js  16-seed no-hang sweep
.verify/sanguo-shot.js        screenshot helper
.verify/sanguo-battle-shot.js screenshot helper
```

They exist in the current working copy only. A fresh clone gets the game and
none of its tests.

This is the project's own convention — `AGENTS.md` calls `.verify/` the scratch
area, and describes it as the place one-off diff scripts get deleted from and
reusable checks stay. The three sanguo suites are firmly in the "reusable
checks stay" category, and `PROGRESS.md` opens by telling a resuming session to
run them, which a fresh clone cannot do.

**Why it matters now rather than later.** `pages-regression.js` is the only
thing standing between the three original pages and the core changes 火柴三國
made to `main.js`, `draw.js` and `agents.js`. If it is not in the repo, the
next person to touch the core has no way to know they broke `index.html`.

**Options**

1. Un-ignore the four suites specifically, e.g. add negations to `.gitignore`
   (`!.verify/*.js` plus a rule keeping the screenshots and scratch out), or
   move them to a committed `test/` directory and leave `.verify/` as true
   scratch. The second is tidier and matches what the directory is documented
   to be.
2. Leave as-is and accept that the tests are machine-local.

**Recommendation:** move the four suites to `test/`, keep `.verify/` for
scratch and screenshots, and update the `PROGRESS.md` / `AGENTS.md` paths. Low
cost, and it makes the regression guard real.

**Raised:** 2026-08-30, after the P1 bug sweep. Not actioned — this is the
maintainer's call about repo layout.

---

## 2

**OPEN · tooling · the font subset can silently fall out of date**

`fonts/lxgw-wenkai-tc.subset.woff2` is cut to exactly the characters found in
`js/i18n/*.js`, `js/campaign/data/*.js` and `sanguo.html`. Add a string with a
new Han character and that glyph falls back to system kai — visibly a different
face, with no error anywhere.

`python tools/subset-font.py --check` catches it, and `.verify/sanguo-p0.js`
runs that check, so it is caught **if someone runs the suite**. Nothing enforces
it. It has already happened once: the P1 battle strings added 44 glyphs outside
the subset.

Rebuilding also needs the ~15 MB source face re-downloaded (deliberately not
committed — see `fonts/README.md`), so the fix is not something a contributor
can do without going and fetching it.

**Options:** a pre-commit hook running `--check`; or CI; or accept the P0 suite
as the gate and make sure it is run. Interacts with issue 1 — a hook is no use
if the suite is not in the repo.

---

## 3

**OPEN · battle · pacing constants are untuned guesses**

Three numbers were picked to make the battle stop hanging, not because they are
right:

| Constant | File | Value | Concern |
|---|---|---|---|
| `STALEMATE` | `js/scenarios/sanguo.js` | 45 s | how long with no casualty before the field is called |
| `STALL_GIVEUP` | `js/scenarios/sanguo.js` | 12 s | how long a unit may make no progress before its order is dropped |
| `HP` | `js/scenarios/sanguo.js` | `[5,6,3,5,7,4]` | the main pacing lever |

Across the 16-seed sweep battles resolve in **30–186 s**. The design wants
60–180 s (§1), so the fast tail is out of range — two seeds finished in 30 s and
35 s. Nothing is broken; it is just quicker than intended at the low end.

`STALL_GIVEUP` in particular is a backstop, not a mechanism: if it is firing
often in normal play, something else is wrong and it is hiding it. Worth
instrumenting how often it triggers before trusting it.

**Next step:** P2 rewrites morale and fatigue (§4.4), which changes all of this.
Retune after that, not before.

---

## 4

**DEFERRED · battle · `open` battlefields are a bare plain**

§4.3 wants `open` to lay plain / river / hills / forest. It currently lays a
plain and nothing else.

`world.water()` only runs its pinned, scenario-placed path when given **both**
`riverBaseX` and `lake`; with one missing it falls through to the generative
branch, which put a river diagonally across the middle of the battlefield. Both
armies then deployed on opposite banks, and remnants that drifted into the
water were pinned there by the core's walkability clamp — a battle that could
never end.

`_findField` (ported from `cannae.js`) already searches for dry ground, so the
seam for bringing terrain back exists. Scheduled for **P4**, alongside `town`
(reuses `ZS.Buildings`, the Outbreak) and `fort` (reuses `ZS.Tiles` + blocks,
the Hold), by which point the flow field routes around obstacles and the
deployment respects them.

Recorded as decision 9 in `PROGRESS.md`.

---

## 5

**DEFERRED · battle · `FIELD_CAP = 2000` is unvalidated**

§4.1 sets the on-field cap at 2000 per side (~4000 figures) and flags it as
provisional on P2 hitting frame rate, with a fallback of ~800. P1 fields
**320 per side / 640 total** and has never been near the cap.

The pieces the cap depends on: the fixed sim step (done, P1), flow-field group
movement (done, P1), and render LOD (**not started** — `ZS.figure.drawFoot` is
the only detail level there is).

**Next step:** P2's fps probe at 2000/side on real hardware, headed Chrome with
GPU per `AGENTS.md`. Confirm the cap or set the fallback.

---

## 6

**DEFERRED · battle · the enemy commander is a placeholder**

`ScenarioSanguo._commanderAI` marches at the nearest enemy block, charges
inside 190 px, and sends mounted units around a flank beyond 260 px. It
re-plans only when a unit is idle, on a 1.1 s tick.

§4.4 wants an influence map (threat / friendly strength / objective value)
driving a small behaviour tree — hold, press the weak flank, commit the
reserve, retreat when army morale collapses — scaled by the enemy's best
general's `zhi`. Scheduled for **P2**.

It is good enough that player orders matter, and it does not cheat. It also
does not coordinate: two blocks will happily pick the same target.

---

## 7

**DEFERRED · structure · battle systems §9 wants split still live in `sanguo.js`**

The file plan lists `js/battle/morale.js`, `js/battle/duel.js`,
`js/battle/commander-ai.js` and `js/battle/ability.js`. Morale and the
commander AI are currently methods on `ScenarioSanguo`; duels and abilities do
not exist yet.

Deliberate for P1 — splitting a system before it has grown is how you get the
wrong seam. P2 rewrites morale and adds abilities, which is the natural moment
to pull them out. `js/battle/flowfield.js`, `formation.js` and `command.js` did
get their own files, because they were self-contained from the start.

---

## 8

**NIT · tooling · `oxfmt js/` rewrites every core file**

Running it across the whole directory normalises all 17 pre-existing core files
to LF, so they show as modified with no content change. Format only the sanguo
paths:

```bash
node node_modules/oxfmt/bin/oxfmt js/app.js js/text.js js/store js/auth js/save js/i18n js/ui js/fonts js/figure js/battle js/scenarios/sanguo.js
```

`node node_modules/oxlint/bin/oxlint js/` over everything is safe.

A `.gitattributes` pinning line endings would settle it properly.

---

## 9

**NIT · render · `scenario.hud()` allocates per frame**

`js/draw.js` calls it every frame and `ScenarioSanguo.hud()` builds a fresh
object with two closures each time. `AGENTS.md` constraint 5 bans per-frame
allocation in hot loops; this is once per frame rather than once per agent, and
the zombie, cannae and hold packs all do the same, so it is consistent with the
codebase rather than a new sin. Worth hoisting into a reused record if the HUD
grows.
