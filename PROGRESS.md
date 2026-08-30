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
| **Phase** | **P0 — boot, i18n, store/save, identity** |
| **Status** | ✅ **complete** |
| **Verify** | `node .verify/sanguo-p0.js` → **45 passed, 0 failed, 0 warned** |
| **Updated** | 2026-08-30 |

### Next action

**Start P1 — the skirmish battle.** Its first moves, in order:
1. `js/scenarios/sanguo.js` — copy `js/scenarios/cannae.js`, rename the class to
   `ScenarioSanguo`, strip the baked Cannae step script, keep the formation/slot
   machinery and `sepR: 13`.
2. Teach `sanguo.html` to load the engine (`grid/nav/camera/world/buildings/
   stains/agents/sim/draw/sound/main.js`) and set `var ZS_SCEN =
   "ScenarioSanguo"` — but only for the BATTLE view. `ZS.App.go()` already
   tears the previous view down; register `battle` as a view that owns the
   `main.js` loop, and stop `App`'s own rAF while it runs (§2: never two loops).
3. `js/battle/flowfield.js` — one Dijkstra pass from the order destination.
4. `js/battle/command.js` — box-select, click-select, `Ctrl+1–9` groups,
   right-click move via the flow field, using the scenario's
   `pointerDown/Move/Up` hooks so the camera does not pan on a drag-select.
5. One formation (line), then the deterministic-seed replay test.

---

## Phase ledger

Legend: ☐ not started · 🚧 in progress · ✅ done · ⛔ blocked

| Phase | Deliverable | Status |
|---|---|---|
| P0 | boot to MENU, font, i18n, Auth/Store/SaveManager round-trip | ✅ |
| P1 | Skirmish battle: `ScenarioSanguo` + command layer | ☐ |
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
| 0.14 | Font subset asset (52 KB woff2, 255 glyphs) + OFL text | ✅ | `fonts/`, `js/fonts/subset-data.js` |
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
9. **"Is the real face loaded?" is answered with pixels, not widths.** The usual
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

- Nothing blocking P1.
- **Rebuild the font subset whenever `js/i18n/*.js` or `js/campaign/data/*.js`
  gains new text** — new glyphs silently fall back otherwise. `.verify/sanguo-p0.js`
  runs the coverage check for you; standalone it is
  `python tools/subset-font.py --check`. Rebuilding needs the source face
  (LXGWWenKaiTC-Regular.ttf v1.522, ~15 MB) re-downloaded from
  <https://github.com/lxgw/LxgwWenkaiTC/releases> — it is deliberately not
  committed. See `fonts/README.md`.

---

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
