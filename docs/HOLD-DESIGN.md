# The Hold — a sketch-style zombie clicker (design)

Working title: **The Hold**. One screen, one settlement, night after night.

Same boiling-line paper style as *The Outbreak* / *Cannae*. Same engine.
New: a tile map you can reshape, buildings you build from blocks, a ring of
soldiers, and a day/night economy where zombies attack every night.

---

## 1. The loop (the whole game in one sentence)

> Click and build by day, hold the line by night. Every dawn you're richer
> and weaker, and the horde is bigger.

```
DAY (build/click, player-paced)
  └─ press "DARKNESS FALLS" ──▶ DUSK (3s warning, camera to core)
NIGHT (90s, waves + click-combat, hands mostly off the mouse)
  └─ 90s or all-zombies-dead ──▶ DAWN (loot tally, results card)
DAY+1 (harder, one new thing unlocked)
```

Day length is **player-controlled** (standard "run trigger" pattern —
*Kittens Game*, *Zombicide clicker*): the player clicks "start night" when
ready. Nights are fixed 90s so the pace never drags.

---

## 2. What the engine already gives us (reuse, don't reinvent)

| Need | Engine piece | Note |
|---|---|---|
| Boiling-line drawing | `ZS.sketch` (sjit/wline/wcirc/sketchRect/wpoly) | every new visual uses these |
| Paper + stains + trees | `ZS.World` pre-render (SS=1.25) | new: tile-aware pre-render |
| Pathfinding + walkability | `ZS.Nav` (20px grid, `planAndFollow`) | **zombies path around player-dug moats for free** — the tile modularity is tactical, not cosmetic |
| No-overlap agents | `ZS.updateAgents` (SEP_R 18 / SEP_CORE 10) | soldiers + zombies inherit the spacing fix |
| Pan/zoom/pinch | `ZS.Camera` | night: camera eases to core; day: free |
| Y-sorted rendering | `ZS.drawScene` | blocks, trees, agents interleave correctly |
| Scenario selection | `window.ZS_SCEN` | `hold.html` sets `"ScenarioHold"` |
| Agent look | `drawAgent` | soldiers = survivor variant; zombies = existing st=2 |
| Damageable doors | `ZS.Buildings` door-HP pattern | precedent for HP'd blocks; new block module draws the same way |

New files (all vanilla JS, classic scripts, `ZS` namespace, file:// safe):

```
hold.html               entry page: canvas + <div id="ui"> overlay
js/tiles.js             tile grid, palette/paint, tile-aware terrain pre-render,
                        writes walkability into ZS.Nav
js/blocks.js            block catalog, placement validation, block HP/cracks,
                        building = set of blocks on the grid
js/hold.js              ScenarioHold: day/night state machine, wave spawner,
                        soldier ring AI, economy (costs, income, prestige),
                        achievements, save/load (localStorage), offline earnings
js/ui.js                DOM overlay: side panel, cost buttons (1/10/max),
                        toasts, floating +N, results card, tutorial, tooltips
```

`js/scenarios/zombie.js`, `cannae.js`, and every engine file stay untouched.
`hold.html` + the four new files are the whole feature.

---

## 3. The three pillars

### 3.1 Modular tiles — the map you can reshape

- Grid: **40×30 tiles of 40px** → world 1600×1200 (fits a laptop at zoom ~1;
  camera can still zoom to 2.5×). 1 tile = 2 nav cells — `ZS.Nav` works
  unchanged, and moats are ≥1 tile wide so pathfinding respects them.
- Tile types: `grass` (default), `water`, `sand`, `road`, `rubble` (from
  destroyed blocks), `built` (block footprint).
- Water/sand/road tiles are **pre-rendered into the paper canvas** in the
  existing water/grass style (pastel wash + boiling outline per tile edge).
  Changing a tile redraws only that tile's neighborhood (cheap: ~9 rects).
- **Dredging budget**: the player earns `dig` points (start 20/day, +5/day,
  capped 50). Each water/sand/road tile placed or removed costs 5 dig.
  This keeps the map *mostly* stable (fairness) while letting the player
  shape kill zones:
  - cut a **moat** around the courtyard → all zombies funnel to the gate
  - dam a pond in front of a turret → cover
  - road is purely cosmetic (and a bit of fun)
- Spawns: zombies always spawn on grass tiles at the map edge (4 sides).
  If the player walls in an entire edge, that edge's quota redistributes.

### 3.2 Modular blocks — buildings you build

Everything built is a **square block** (1 tile) placed on the grid.
A "building" = adjacent blocks of the same kind; stats scale with count.

| Block | Cost (scrap) | Effect | Unlocks |
|---|---|---|---|
| **Wall** | 15 | 200 HP; zombies attack blocks before agents | day 1 |
| **Gate** | 40 | 120 HP, passable when broken; the intended choke | day 1 |
| **Scrap yard** | 60 | +0.4 scrap/s passive per yard (clicker "generator") | day 1 |
| **Farm** | 80 | +0.5 food/s | day 3 |
| **Barracks** | 150 | +8 soldier cap; trains 1 soldier / 10s | day 1 |
| **Turret** | 400 | 22 dmg @ 1/s, range 3.5 tiles | day 4 |
| **Workshop** | 900 | −15% all costs (stacks, ×0.85^n) | day 8 |
| **Core** | — | 1000 HP, fixed, 2×2 in the middle; **the settlement** | given |

- Each block: `hp`, `maxHp`, `cracks` (0–3, drawn as sketch hatches as HP
  drops — the "it's about to break" read), destroyed → rubble tile + the
  block is gone (refunds nothing; rebuild cost full).
- Core destroyed = the night is **lost** (see §7 soft-fail).
- Ghost preview on hover (green/red), left-click place, right-click remove
  (50% refund, day only). Build mode = default day mode; no separate "mode".
- Placement rules: on grass/sand/road only; walls/gates must touch the
  settlement or an existing block (no floating walls); generators need one
  block of open sky around them (visual: they're drawn slightly bigger).

### 3.3 The soldier ring

- Soldiers stand in **slots arranged in a circle** around the core
  (default ring radius 3 tiles, N slots = current cap, evenly spaced,
  slot i drawn at angle i·2π/N).
- Behavior (reuses agent physics; AI in `hold.js`):
  1. **Hold**: stand in slot, look at nearest zombie.
  2. **Engage**: nearest zombie within weapon range → step out to intercept
     (path via `planAndFollow` if blocked), attack, and **re-slot** when the
     threat is gone (the ring visibly closing back up = the satisfying beat).
  3. **Down**: at 0 HP the soldier leaves a small × mark (fades over 20s).
- Cap = 12 + 8×barracks. Training is a visible progress bar on the barracks
  (standard idle "production" pattern) — no queue UI, it just fills.
- Soldiers fight in priority order: turret > ring soldier > core (zombies
  pick nearest: block in path > turret > soldier > core).
- **Click-combat at night**: clicking a zombie = one hit (1 dmg × combo).
  Combo: clicks within 1.2s chain, multiplier ×1→×5, drawn as a small
  tally scribble near the cursor. This is the "clicker during the run"
  pattern (*Vampire Survivors* mash feel): nights reward active play,
  but a night is still winnable hands-off (idle standard).

---

## 4. Economy

### Currencies

| | Scrap | Food | Legacy |
|---|---|---|---|
| Earned | clicks (day), kills (night), scrap yards | farms | "Relocate" (prestige) |
| Spent | everything | soldier upkeep: 0.05/s per soldier, day only | — |
| Runs out? | no floor | **yes** — at 0 food, new soldiers train 50% slower and soldier HP regen stops (soft pressure, never a hard wall) | permanent |

Scrap is the only spendable; food is a **soft brake on army size** —
the classic growth-vs-upkeep tension, introduced day 3 (with the farm).
Day 1–2 are single-resource so the first session has zero confusion.

### Cost curves (geometric, per-kind coefficient)

- `cost = base × c^owned` per kind — the coefficient is *lower* for the
  expensive content so the late game stays smooth (AdVenture Capitalist
  runs 1.15 on cheap businesses down to 1.07–1.08 on the big ones):

  | kind | base | c |
  |---|---|---|
  | scrap yard | 60 | 1.15 |
  | farm | 80 | 1.15 |
  | barracks | 150 | 1.12 |
  | turret | 400 | 1.10 |
  | workshop | 900 | 1.10 |

- Wall/gate stay flat (15/40) × workshop discount — they're rebuilt
  constantly, so a per-buy curve would tax the defense loop.
- All scrap **bonuses** stack additively (×3 + ×5 = ×8, not ×15) —
  AdVenture's anti-snowball rule; the workshop stays multiplicative
  because it's a cost *discount*.
- Upgrades: one-shot tiers, flat cost scaling with night number
  (`cost = base × night^0.9`) so they feel earned.

### Upgrades (side panel, tiered, max level shown)

| Upgrade | Tiers | Effect |
|---|---|---|
| **Gloves** (click power) | 1,2,3,4,5 | click = 1,2,4,8,16 scrap |
| **Weapon** | club → machete → pistol → shotgun → SMG | dmg 3→6→10→14(3-tile splash)→18; range 1→1.3→3→3.2→3.5 tiles; fire 0.8→1→1.4→0.9→2.5/s |
| **Armor** | none → vest → plate | soldier HP 40 → 70 → 120 |
| **Training** | 5 levels | +15% soldier DPS each |
| **Morale** | 3 levels | soldiers keep fighting below 30%/15%/0% HP |
| **Reinforced blocks** | 3 levels | block HP ×1.5 / ×2.5 / ×4 |

Soldiers regen 2 HP/s during day (food-gated). Night damage carries over —
a wounded ring is a *real* reason to spend morning on food.

### Kill rewards

walker 2, runner 3, brute 6, boss 40 (+ `+ night × 0.15` flat).
Every kill pops a floating `+N` at the corpse (standard dopamine).

---

## 5. Zombies and waves

Types (drawAgent st=2, sized/tinted per type — same sketch, no restyle):

| Type | Night | HP | Speed | Note |
|---|---|---|---|---|
| Walker | 1 | 30 | 120 | the baseline |
| Runner | 5 | 18 | 210 | pink-ink tint, long stride |
| Brute | 10 | 240 | 70 | 1.6× scale; 2× damage to blocks |
| Boss (named) | every 5th | 20× night-scaled | 90 | big sketch, name above it |

- Night length fixed **90s**. Spawns: 65% spread over the night, 35% as
  2–3 "surge" bursts (a toast: *"they're coming — second wave!"*).
- Scaling: `count = 10 + night×4 + floor(night^1.4)`; `hp ×= 1 + night×0.12`;
  `speed ×= 1 + night×0.01` (capped ×1.3).
- Night 1: 14 walkers vs 12 clubbed soldiers + 8 walls → comfortable win.
  Night 5: ~35 with runners → needs turret + ~20 soldiers.
  Night 10: brutes arrive → walls need reinforcing **or** the moat exists.
- Zombies never stack on blocks: the existing separation keeps a crowd
  reading; block damage ticks per zombie-in-contact (so a mob on one wall
  breaks it fast — "spread your walls or they'll eat one spot").
- **Night modifiers** ("weather") from night 3, one every 3rd night:
  deterministic (fixed by night number) and shown on the dawn card so
  the player can prepare — FOG (zombie sight −25%), RAIN (soldier fire
  rate −15%), STENCH (zombie speed +10%), CALM (+10% kill reward).
  Randomness-or-clock pattern (Kittens' Redmoon / Melvor's raid
  modifiers): nights stay fair, replay doesn't stay static.

---

## 6. Standard clicker patterns (the checklist)

1. **Geometric cost curve** 1.15× per generator — done (§4).
2. **Floating +N** on every click/kill; click does a tiny ink-splat + paper
   dent (3-frame scale squish on the scrap pile) — the "stamp" feel.
3. **Buy 1 / 10 / max** toggle on generator rows; buttons show cost in red
   when unaffordable, pulse green when affordable.
4. **Tooltips**: per-unit production + total ("farm: +0.5 food/s × 3 = 1.5/s").
5. **Golden supply cache** (golden-cookie pattern): every 90–240s a
   sketched supply crate appears on a random grass tile for 15s; click →
   one of: +5 min of current production (instant), *rush* (2× scrap
   clicks 60s), *medkit* (ring fully heals). Never during night (keep
   nights honest). Streak prevention: after collecting one, the same
   effect has an 80% reduced chance on the next spawn (Cookie Clicker).
6. **Offline earnings**: on load, grant day-only passive (yards/farms) for
   time away at 100% rate, **capped at 24h** (AdVenture/Melvor standard),
   in a "while you were away" card. Nights never happen offline.
7. **Autosave**: localStorage every 10s + on night end + on `beforeunload`;
   versioned payload; "reset settlement" button (with confirm, drawn as a
   little match icon).
8. **Milestones** (~24, one-line sketched badges in a strip): "first blood",
   "night 10", "100 kills", "moat dug", "50 blocks"… each +1% scrap,
   additive. Intentionally small: Cookie Clicker's +4%-per-achievement
   milk grew into a second endgame that shadows the core loop, and
   Clicker Heroes *removed* achievement DPS in 1.0 — keep achievements a
   wallpaper of pride, not a power source.
9. **Prestige — "Relocate"**: available after night 15 or after a lost
   night. `legacy = floor(sqrt(totalKills / 50))` earned on relocate;
   each legacy = +5% all scrap. Relocate resets the settlement (new map
   seed) and **difficulty +1** (zombies +10% HP/count) — the standard
   risk/reward rebirth. The button always shows the *projected* legacy,
   and the panel nudges the standard timing rule: only relocate when
   you'll at least double your legacy count (AdVenture's angel rule).
10. **Number formatting** 1.2k / 3.4M / 9.9B everywhere.
11. **Tutorial**: 3 toasts on first run (click the pile → build a wall →
    press darkness falls). Skippable; stored as a flag.
12. **Soft-fail, no game over** (idle standard): core destroyed → the night
    ends, you lose 40% scrap and 30% food, the core is rebuilt free,
    and the *Relocate* option is highlighted. The run never ends.

---

## 7. Night flow (the 90 seconds)

```
t=0    dusk: sky washes to a deeper paper tone (one global overlay alpha),
       camera eases to core, "NIGHT N" written large, then fades
t=0–90 waves per §5; soldiers auto-fight; player clicks zombies for combo
       damage; toasts at surge times; boss intro at its spawn
end    all dead (early end, bonus: +10% scrap for "cleared early")
       or t=90: remaining zombies vanish in a puff (they "regroup")
dawn   results card (sketched, center, dismiss on click):
       NIGHT N SURVIVED · kills · blocks lost · soldiers down ·
       +scrap +food · next unlock · tomorrow: FOG (modifier preview)
```

- While the results card is up the sim is paused (day resumes on dismiss).
- Camera: free pan/zoom at any time (no lock), a small "⌂ core" button
  returns to the core.

---

## 8. UI layout (sketch DOM over the canvas)

```
┌────────────────────────────────────────────────────────────┐
│  DAY 3 · 06:12          ┌ scrap 1.2k ┐┌ food 84 ┐┌ dig 20┐ │  top strip:
│  NIGHT 4 IN 00:00  [DARKNESS FALLS ▸]└────────────┘└───────┘└────────┘  counters +
│ ┌──────────┐                                                    night button
│ │ BUILD    │                                                    (disabled at night)
│ │ ▢ wall   15                                       canvas
│ │ ▢ gate   40                                     (the whole
│ │ ▢ turret 400                                    settlement,
│ │ FARM +0.5/s ×3 [1|10|MAX]  80                     boiling lines)
│ │ BARRACKS cap 28 [1|10|MAX] 150
│ │ UPGRADES ▾
│ │ gloves ×2  120   weapon: machete→pistol  340
│ │ ...                                             floating +N,
│ │ MILESTONES ▾  ■■■□□                             toasts, results
│ └──────────┘                                       card, supply crate
└────────────────────────────────────────────────────────────┘
```

- Left panel ≈ 260px, paper-textured `div`, Segoe Script, 17px (matches HUD).
- Collapsible (button = a folded-paper icon) for small screens.
- Night: BUILD rows disable themselves (grey + a little "by day" note);
  a COMBO meter appears in the panel while clicking.
- Every BUILD row shows its live production in green, always visible
  (AdVenture's "accountant" pattern — ROI at a glance), and the
  Relocate button shows projected legacy, not just the word "relocate".
- Everything the sim writes (results, toasts) is drawn *on canvas* in the
  sketch font; DOM is only for persistent controls.

---

## 9. Pacing targets (first-time player)

| Session time | Where they are |
|---|---|
| 0:00 | tutorial toasts, first clicks, place 6 walls + gate (cost 130, ~90 clicks + 2 scrap yards' worth… actually: start with 40 scrap so the first wall costs less than one minute) |
| ~3:00 | 14 sold… first night starts early (player-pressed), wins with margin |
| ~8:00 | day 3: farm + food pressure introduced, 20 soldiers |
| ~15:00 | turret online, first runner night (night 5) — first *real* tension |
| ~25:00 | digging a moat (the "aha"), night 7–8 |
| session 2 | brutes, first lost wall, workshop, first supply-crate luck |
| ~hour 1 | night 12–15, Relocate option live, prestige decision |

Tuning knobs all live in one `BAL = {...}` object at the top of `hold.js`
(counts, scaling exponents, costs, night length) — same discipline as the
scenario packs.

---

## 10. Build order (phases, each one playable + verifiable)

1. **P1 — tile foundation**: `tiles.js` + tile-aware pre-render + paint
   (day-only), dig budget. Verify: paint water, see outline, nav avoids it
   (drop in the existing outbreak zombie pack temporarily to watch pathing).
2. **P2 — blocks + economy**: `blocks.js`, placement, HP/cracks, scrap
   clicks + yards, day counter, autosave. Verify: place/remove, HP drains
   from a test zombie, save/reload round-trip.
3. **P3 — the ring (shipped)**: soldier slots, engage/re-slot AI, the
   larder (farms/food, day-only upkeep + regen, half-speed hungry
   barracks), the full upgrades panel (gloves, weapon tiers, armor,
   training, morale, reinforced), save v2. Zombies now eat soldiers.
   Verified: 15/15 Playwright checks (training, ring geometry, combat
   both directions, upgrades, reinforced HP, save v2 round-trip).
4. **P4 — the night**: wave spawner, dusk/dawn, results card, kill rewards,
   soft-fail. Verify: scripted night 1 through dawn, numbers match BAL.
5. **P5 — the rest of the checklist**: supply crate, offline earnings,
   milestones, prestige, tutorial, buy-max, number formatting,
   runner/brute/boss types.
6. **P6 — balance pass**: play 15 minutes straight, adjust BAL, screenshots.

Each phase: `node --check` + `npx oxfmt js/` + `npx oxlint js/`, and a
Playwright smoke (headless chrome, `file:///…/hold.html`) before moving on.

---

## 11. Open questions (answer when it matters, defaults shown)

1. **Fail state** — soft-fail, run never ends (default, idle standard) vs
   hard game over at core loss? → default stands unless you object.
2. **Food** — soft pressure only (default: 0 food slows training/regen) vs
   hard (soldiers stop training)? → default stands.
3. **Sound** — none for v1 (sketch = silent paper); a tiny "thock" on
   clicks is a 5-line WebAudio add if wanted. → default: none.
4. **World size** — 1600×1200 (40×30×40px, default) vs the 3200×2400 we
   already use? → default: smaller; a hold needs to be *holdable* on screen.
   (Zoom still lets you wander; moats read better at this scale.)

---

## 12. Research: the 5 most popular clickers

Researched Aug 2026 from official wikis, Steam/SteamDB data, and dev
blogs. Per-title detail below; full raw reports in the session transcript.

### 12.1 The five (popularity)

| Title | Dev, year | Scale | Signature |
|---|---|---|---|
| **Cookie Clicker** | Orteil, 2013 | ~2.5–3.1M Steam copies, ~$10M+ rev, 8–9.5k daily CCU, peak 67,867, 96% pos | the archetype: 1.15^n curve, golden cookies, ascension, 643 achievements |
| **Clicker Heroes** | Gas Station Games, 2015 | peak ~65.9k CCU (SteamDB), 3–6k today | combat runs + two-tier prestige (ascension→transcendence), relic affixes |
| **AdVenture Capitalist** | Hyper Hippo, 2015 | peak 22,998 CCU, millions of mobile installs | the "no-clicker clicker": managers automate 100%, additive multipliers, planet ladder |
| **Melvor Idle** | Games by Malcs, 2020/21 | ~500k+ players, 92% pos (8.5k reviews) | no-prestige linear depth, 26 skills, auto-combat party of 5, raid modifiers |
| **Kittens Game** | Nuclear Unicorn, 2015 (web) | small, very dedicated; 50+ resources, ~200 techs | pure zero-click idle, research tree, two-tier prestige, Shatter Engine |

### 12.2 Per-title pattern highlights

| | CC | CH | AC | Melvor | Kittens |
|---|---|---|---|---|---|
| Cost curve | 1.15^n (everything) | 1.07^n (hero levels) | 1.07–1.15 per business (cheaper = higher c) | flat / none | hyperbolic diminishing returns |
| Prestige formula | ⌊(all-time/1T)^⅓⌋, +1%/chip | HS = levels/2k (+10%); AS = 5·log10(HS) | ~150·√(quadrillions), +2%/angel | **none** (linear + DLC) | Paragon threshold + transcendence tiers |
| Resets vs persists | cookies/buildings vs chips, milk, achievements | gold/levels/zones vs ancients, rubies, clan | cash/businesses vs angels, gold, planets | — | everything vs paragon/karma/chronosphere carry (1.5% each) |
| Golden bonus | 75–210s spawns, weighted table, **80% streak prevention** | RNG treasure chests → rubies | x2 for 4h (opt-in), additive, 5/day cap | deterministic raid modifiers | none (scheduled Redmoon instead) |
| Achievements | 643, +4% milk each (grew into a second endgame) | ~100+; click-damage bonuses (DPS bonuses removed in 1.0) | grant gold + time warps | 86 Steam + 40+ pets | 37 Steam + challenge system |
| Offline | 2h full → penalty, extendable to 7d8h | no cap, idle DPS only, no clicks | no cap, **requires managers**, 100% rate | 24h cap, 100% rate, simulates everything | full idle, no cap |
| Runs/bosses | none | zones, Primal Bosses on milestones (guaranteed drops) | none | dungeons, 100+ monsters, no fail | none |
| Hard fail state | none | none | none | none (death drops 1 item) | none |

### 12.3 Common patterns (what 4+ of 5 do)

1. **Geometric per-buy cost** (c ≈ 1.07–1.15); pricier content uses the
   *lower* end so the late game stays smooth (AC).
2. **Prestige = one formula + an explicit reset/persist list**; best
   practice: show the projected gain on the reset button and teach "only
   reset when you at least double it" (AC).
3. **2–4 currencies, each pressuring a different loop** (spendable / soft
   brake / prestige / optional premium); never one resource doing all jobs.
4. **Offline = rate × time, ~24h cap, no runs/bosses offline, claim card
   on return** (AC, Melvor; CC's penalty curve is the aggressive outlier).
5. **A periodic clickable bonus with variance + anti-repeat** (CC's
   weights + streak prevention); the zero-RNG games substitute a
   *scheduled* version (Redmoon, raid modifiers) — randomness **or** a
   clock, one of the two.
6. **A big wall of small achievements granting small permanent bonuses**
   — the two warnings: +4% each (CC) shadows the core loop; big DPS
   bonuses get taken back (CH 1.0).
7. **Always-visible ROI**: CpS / cash-per-second per row, handmade-vs-
   total split (AC's accountant is the best version).
8. **Content drip on a visible ladder** — new type/building/zone roughly
   every 2–3 in-game days; endgame is an infinite scaling loop, not a
   final boss (Shatter Engine, zone 100k).
9. **No hard fail state** (5/5): loss = item drop, resource penalty, or
   nothing.
10. **K/M/B/T → scientific notation** (universal) and **buy 1/10/max**
    (universal).
11. **Bosses on a guaranteed milestone schedule** (CH's Primal Bosses):
    periodic guaranteed big reward, not RNG.

### 12.4 What this changed in this design

- §4 cost curves → per-kind coefficients (1.15 cheap → 1.10 expensive);
  scrap bonuses stack **additively** (AC's anti-snowball rule).
- §5 → **night modifiers** ("weather") every 3rd night, deterministic and
  previewed on the dawn card (Redmoon/raid-modifier pattern).
- §6 supply crate: 90–240s spawn + 80% streak prevention (CC); offline
  24h cap (AC/Melvor); milestones stay +1% additive (CC/CH lesson).
- §6/§8 Relocate: projected-legacy display + "double it" timing nudge (AC).
- §8 UI: per-row live production always visible (AC accountant).
- Confirmed as-is by research: 1.15-class curve, soft-fail, player-
  triggered nights, boss every 5th night, k/M/B formatting, buy 1/10/max.
- Rejected for v1 (noted for later): per-building mastery (Melvor),
  two-tier prestige (CH/Kittens), equipment affixes (CH relics) — scope.
