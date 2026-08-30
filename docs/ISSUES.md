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
| [7](#7) | DEFERRED | structure | Duels still need their §9 file |
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
next person to touch the core has no way to know they broke `zombiesim.html`.

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
`js/i18n/*.js`, `js/campaign/data/*.js` and `index.html`. Add a string with a
new Han character and that glyph falls back to system kai — visibly a different
face, with no error anywhere.

`python tools/subset-font.py --check` catches it, and `.verify/sanguo-p0.js`
runs that check, so it is caught **if someone runs the suite**. Nothing enforces
it. It has already happened once: the P1 battle strings added 44 glyphs outside
the subset.

Rebuilding also needs the ~15 MB source face re-downloaded (deliberately not
committed — see `FONTS.md`), so the fix is not something a contributor
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

The old P1 16-seed sweep resolved in **30–186 s**. With P2 morale and the new
commander active, a six-seed passive-player sample resolves in **62–119 s**,
inside the design's 60–180 s target. That is encouraging but not a retune: the
full sweep still needs to run after formation work stops moving the pressure
curve.

`STALL_GIVEUP` in particular is a backstop, not a mechanism: if it is firing
often in normal play, something else is wrong and it is hiding it.

The formation pass added a per-battle `scenario.stallGiveups` counter. A
16-seed deliberately aggressive opening (every player block attack-moves at its
nearest enemy, then receives no more orders) resolved all battles in
**40.8–129.6 s** with no stalemates, but recorded **20 watchdog drops across 15
battles**. That order pattern intentionally creates congestion, so it proves the
backstop is active but does not yet prove ordinary play is broken. The exact
documented passive-player suite is absent from this checkout because of issue
1, so its earlier 62–119 s sample could not be rerun with the new counter.

**Next step:** recover or commit the canonical seed probe, record which units
and order modes trigger each drop, then fix the movement/congestion cause before
retuning `STALL_GIVEUP` or `HP`.

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

## 7

**DEFERRED · structure · duels still need their §9 file**

The file plan lists `js/battle/morale.js`, `js/battle/duel.js`,
`js/battle/commander-ai.js` and `js/battle/ability.js`. P2 has now split morale,
the first active ability and the influence-map commander into those intended
files. Duels do not exist yet.

The remaining structural work follows its feature phase: duels arrive with
general RPG depth in P5. `js/battle/flowfield.js`, `formation.js`, `command.js`,
`morale.js`, `ability.js` and `commander-ai.js` are already self-contained.

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
