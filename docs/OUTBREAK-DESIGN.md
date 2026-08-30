# OUTBREAK-DESIGN.md — defender corps, outside horde, generative land, fire

Work order (user priority): **F1 defenders → F2 outside horde → F3 generative
landscape → F4 fire/grenades**. All of it lands on `zombiesim.html` (the outbreak).
`battle.html` and `hold.html` keep working unchanged. Same engine, same
sketch style, same file:// classic-script rules (see AGENTS.md hard
constraints).

Two workstreams, disjoint files:

| stream | files owned | features |
|---|---|---|
| **Horde** | `js/scenarios/zombie.js` only | F1, F2, F4 |
| **Land** | `js/world.js`, `js/buildings.js`, `js/main.js` (seed line only) | F3 |

## Shared contracts (both streams must honor)

- `world.towns` stays an array of `{x, y, n, spread}` district anchors
  (Land may change count to 4–7 and positions; Horde must key off the
  array, never hard-code 6 districts or 12 buildings).
- Building records stay `{x, y, w, h, rooms, runs, door, seed, inCount,
  escape}`. Horde reads `ZS.Buildings.list`, `door.front/inner`,
  `cellBldAt`.
- Horde reads land only through: `world.nav` (`nearestWalkable`,
  `randLand`, `los`, `isWalkable`, `astar`), `world.w/h`,
  `world.inForest`, `world.buildings`, `ZS.Buildings`. Nothing else.
- **No per-frame allocations in hot loops** (910 agents): preallocate
  squad/pack/gfire records in `init`/`maintain`; decay-and-prune arrays.
- **The frozen agent look**: the figure, gait, zombie arms/face in
  `draw` stay verbatim. New visuals are additive `if` blocks:
  (a) weapon/hat variants inside the existing `a.gun` kit section
  (the shotgun already adds a second barrel style — same pattern),
  (b) a stationary turret emplacement drawn instead of a figure,
  (c) a flame overlay after the transformation flash scribble. No
  restyling of existing strokes.
- Fire/explosion ink stays in the palette register: amber
  `rgba(176,110,40,α)` (muzzle flash), blood red `#8c2b1e` /
  `rgba(150,40,30,α)`, soot `rgba(50,42,34,α)`, plus `ZS.lerpC` inks.
- Every new constant lives at the top of its file (house style: tunable
  block with inline comments).

---

## F1 — the defender corps (`zombie.js`)

**The ask**: more armed people; they form defensive perimeters that
protect the people; when a whole group falls, survivors fall back to a
more defensible position and re-form.

### Roster (ported from the Hold's clicker roster, scaled to this sim)

| class | `a.wep` | range | cd | dmg | notes |
|---|---|---|---|---|---|
| Rifleman | `"rifle"` | 300 | 0.9 | 1 | existing behavior, unchanged |
| Shotgunner | `"shotgun"` | 165 | 1.35 | 2 (3 pellets) | existing, unchanged |
| MG gunner | `"smg"` | 220 | 0.30 | 1 | rapid: 2 short tracers per shot, muzzle 0.08 |
| Grenadier | `"grenade"` | 380 (throw) | 3.2 | 3 in 90px | sidearm: SMG shots under 130px; throw at packs (≥3 zombies within 90px of each other, in range, LoS to cluster centroid) — range/gap tuned post-LOS-fix: the tactical standoff ring (zombies massing on doors 300–450px from the arc) sits outside the original 280/50 values, so the F4 chain never fired |
| Turret | `"turret"` | 260 | 0.85 | 2 | fixed emplacement (stationary agent, `maxSpeed` 0), hp 8, zombies in contact deal 1 dmg per 1.5s; no retreat, no turn (a dead turret is `dead`, drawn as a broken post) |

All human classes: hp 3 (mortal — a bite turns them, same as today),
`SOLD_SPEED` 84 standing / 108 falling back. Turrets: hp 8.

**Numbers**: initial armed ≈ one squad per district (below) + 1 turret
per district with ≥2 buildings; plus "arming the town": `maintain`
converts 1 unarmed survivor near a live squad (within 300px of the
squad centroid) to a rifleman every 4–8s until armed count reaches
`ARMED_CAP = max(24, floor(baseCount * 0.07))`. New gunner shouts
`"i've got one!"` (new phrase array `ARMED_PHRASES`:
`"i've got one!"`, `"picked up a rifle!"`, `"we're arming up!"`).

### Squads and lines

- **Squad**: one per district (`world.towns` entry with ≥1 building).
  Members: armed agents with `a.sid` = district index (0-based),
  `a.rank` = 0..n-1. Squad size `n = clamp(buildingsInDistrict, 3, 6)`
  by class mix:
  - n=3: rifle, rifle, shotgun
  - n=4: smg, rifle, shotgun, rifle
  - n=5: grenade, smg, rifle, shotgun, rifle
  - n=6: grenade, smg, rifle, shotgun, rifle, rifle
- A squad record is preallocated in `init`:
  `this.sq[i] = { ax, ay (anchor), cx, cy (centroid), n0, alive,
  thx, thy, thd (nearest threat, recomputed per frame via one
  grid.query around the anchor at SQUAD_PANIC 300), state (0 post /
  1 fallback), line, lines: [ {x,y} ... ], lastKillT }`.
- **Lines**: `lines[0]` = district anchor (the front line). `lines[1]` =
  centroid of that district's buildings. `lines[2]` = the town core:
  centroid of ALL buildings (every district shares it as last stand).
  Fallback advances `line` by 1; on the last line they hold and die.
- **Perimeter geometry**: the squad forms an arc centered on
  `lines[line]` facing the threat. `thA = atan2(thy-ay, thx-ax)`
  (no threat: face the town core, i.e. `atan2(core-ay, ...)`). Slot
  radius `ARC_R = 58 + n * 9` (line 0 only; inner lines use 40 + n*8).
  Arc spread `min(1.9, 0.52 * n)` radians. Member `i` of `alive`
  (use `rank` as stable identity; if a member is down the arc just
  thins): `ang = thA + (rank - (n-1)/2) * spread/(n-1)`,
  slot = anchor + polar(ARC_R, ang) → `nav.nearestWalkable(slot, 90)`.
  Cache slots: recompute a member's slot only when `line` changes, when
  `|ΔthA| > 0.6` rad (store `a.slotA`), or on `init`.
- **Overwhelmed → fallback** (checked per frame per squad in
  `frame()`, only when `line < lines.length - 1`):
  - `alive < n0 * 0.5` (the group is breaking), OR
  - ≥3 zombies inside 70px of the anchor (the line is breached).
  On trigger: `state = 1`, `line++`, recompute slots. State resets to
  0 once all live members are within 26px of their new slots AND no
  zombie is within 90px of the anchor (the line re-forms; the ring
  closing back up is the satisfying beat — same as the Hold's ring).
- **Wounded**: human defender with `hp == 1` disengages (Hold's
  morale): run to the nearest building door (`_pickShelter`, existing)
  while still firing; inside, hold the floor.
- **Protecting people**: the arc bulges toward the threat (buildings
  sit behind it), and survivors already flee to the nearest building —
  their district's. No new survivor logic needed.

### Where the code goes

- `makeAgent`: new fields `sid: -1, rank: 0, sx: 0, sy: 0, slotA: 0,
  packT: 0, burn: 0, burnDir: 0, grnCd: 0, tAtk: 0, hp3`... keep it
  flat on the record (scenario-owned fields, like today).
- `init`: build squads/turrets after survivors.
- `frame`: keep the existing shout-propagation loop, then: squad
  aggregation (single pass over agents accumulating `alive`, centroid;
  then per-squad: threat query, fallback test, re-form test), gfire
  tick, grenade-throw resolution (see F4), pack bookkeeping.
- `update`: `a.gun && st===0` → `_updateDefender` (replaces
  `_updateSoldier`; keep `_updateSoldier` behavior inside it for
  rifle/shotgun so existing feel survives). Burning agents take the
  frantic branch first (F4).
- `counts`/`hud`: keep the stats line; append `turrets N` when present.
- `maxSpeed`: `a.gun ? (a.wep === "turret" ? 0 : a.state-ish 108 or
  SOLD_SPEED)` — keep it simple: burning → 110; turret → 0; gunner →
  108 if squad state 1 else SOLD_SPEED (store nothing: read the squad
  via `a.sid`).

## F2 — the horde comes from outside (`zombie.js`)

**The ask**: zombies arrive from off-map, inward, in groups — not just
internal random spawns.

- **Packs**: `maintain` drives `this.packTimer`. On expiry:
  - side = 0..3 uniform; spawn center along that side at 15–85% of its
    length, 30px inside the border; target = a uniform-random district
    anchor (the districts are military posts — a pack presses one
    regardless of population; the anchor is resolved to a walkable cell
    so the ±30 member jitter can't land in the river). **The first
    three packs are the directed opening strike**: they target the
    grenadier's district (`this.grenDi`, resolved in `init`) so the
    horde's first contact is the grenade's moment.
  - size `clamp(5 + wave, 6, 12)` — a 4-pack shreds itself on the arc's
    fire zone before it can cluster; **the opening packs are bigger**:
    `clamp(9 + wave, 10, 12)` (the district must actually feel hit, and
    the cluster must survive the approach). Spawn each member with
    `nearestWalkable(center ± 70, 300)`, `st = 2`, `a.tx/a.ty` =
    target + per-member jitter ±30, `a.tAge = 0`, `a.packT = 75` for
    the opening packs (40 otherwise) — 40s let a long approach drop
    the anchor mid-walk and scatter the pack into single hunters.
  - While `packT > 0` a zombie steers at its pack target even with no
    prey in sight (extend the last-known-point window: use
    `a.packT > 0 || a.tAge < 2.5` as the "pursue" condition in
    `_updateZombie`). Members converge on the district, read as a
    blob pushing in, and peel off into normal hunts as they close
    (sight 340 picks up the town) — pack dissolves into the attack.
  - Interval `ZS.rnd(9, 15) / (1 + (wave - 1) * 0.15)`, max 3 packs
    un-spent at once; **zombie cap** `min(120 + wave * 15, 320)` live
    zombies (skip a pack when over); total agents soft cap 1050.
- **Round start** (`init`): keep the original center outbreak (index
  case at the thickest crowd) AND arm the invasion early: first packs
  at ~2s and ~6s (`this.packTimer = 2`).
- **`tap` is unchanged** (converts a survivor to index case) — it is
  the existing player-interaction surface; future player control hooks
  in here and at the scenario pointer hooks, not in the core.

## F3 — generative landscape (`world.js`, `buildings.js`, `main.js`)

**The ask**: river/buildings/water are generative each run — today the
seed varies but the *topology* is fixed (one vertical river, one lake
up-right, six pinned town anchors). Vary the topology per seed.

- **Seed** (`main.js`, one line): honor `?seed=N` in the URL
  (`URLSearchParams` — works on file://), else the current random.
  `world.seed` unchanged otherwise.
- **River**: pick an orientation per seed: vertical (45%), horizontal
  (35%), diagonal (20%). Build the centerline as before (sum of two
  sines along the long axis) with wider parameter ranges: base
  position centered on the perpendicular axis (clamped so the whole
  ribbon stays ≥40px in-bounds), `a1: 60–260`, `a2: 30–160`,
  frequencies ±40% varied, `baseW: 45–130`. Keep the `pts` (closed
  ribbon polygon) + `samples` (`{x, y, hw}` every 120px along the
  axis) model — `markWater`, `build()`, `drawWater` consume it and stay
  untouched. `nearRiver` is upgraded from the vertical strip test to a
  radial (squared-distance) test against the samples so clearance works
  for horizontal/diagonal rivers too (Cannae never calls it: `towns:false`
  + `layoutForest({none:true})`). River ripples: place along
  `samples` (drop the `riverX()` dependency; keep `riverX/riverW`
  functions working for the vertical case — other code may call them).
- **Lakes**: main lake 55% of maps (was: always), position uniform
  10–90% of the map (was: right half only), clear of the river
  (`hw + r + 60` from every sample) and of districts
  (`r + spread * 0.5 + 160`); second small pond 25% of maps,
  `r: 80–150`, same clearance + ≥200px from the main lake rim.
  Ripples scale with lake count.
- **Districts** (replaces the 6 fixed anchors): 4–7 districts,
  anchors uniform 8–92% of the map with ≥450px pairwise spacing,
  ≥160px from the border, clear of the river (120 pad via
  `nearRiver` on the anchor ±spread*0.3 ring) and lakes; per-district
  `n: 1–5`, `spread: 280–480` — total buildings ≈10–20. (n reaches 5 so
  the 5-man squad mix — the only one carrying a grenadier — is reachable.)
  `water()`'s default path (it already jitters `this.towns`; make it
  build the array from scratch when no `opts` pins are given). Keep
  the constructor default array as a fallback (Cannae sets
  `world.towns = []` itself).
- **Archetypes** (`buildings.js`): add 3 more rooms to
  `SECTION_LIBRARY`: `warehouse` (one big room 300×130), `chapel`
  (nave 140×240 + transept 220×110 crossing), `mill` (220×120 + 100×90
  offset wing). Placement picks the archetype with a weighted random
  (existing 5 at weight 2, new 3 at weight 1) instead of the fixed
  round-robin — the mix varies per map.
- **Invariants (pinned terrains stay bit-identical)**: when
  `opts` are given (Cannae: `riverBaseX`, `lake`, `towns: false`,
  `grovePos`; Hold: none — tiles own the ground), generation must
  behave exactly as today. All new randomness lives in the no-opts
  default path only. `layoutForest` and `placeAllTrees` may get
  slightly wider variety (grove count 5–10, forest r 300–520) but
  must respect the existing `opts` pins (`none`, `grovePos`).
- **Verification**: two `?seed=A` loads of `zombiesim.html` render
  identically; different seeds differ in river orientation/lake
  presence/district count. `battle.html` (Cannae) boots unchanged.

## F4 — grenades and fire (`zombie.js`)

**The ask**: grenades and fire in the sketch style; zombies and people
can catch fire and run around frantically if they do.

- **Grenade throw** (grenadier): fx record
  `{x0, y0, x1, y1, t: 0.9, grn: true, seed}` — `drawFX` draws a 2.5px
  ink circle arcing along a quadratic (midpoint lifted 34px) with a
  short fading trail; the explosion is NOT applied by `drawFX` —
  `frame()` keeps `this.gren = []` throw records `{x, y, t, seed}` and
  detonates on expiry:
  - fx `{x, y, t: 0.6, boom: true, seed}` — expanding wobbly ring
    (6→40px, ink α 0.8→0), 8 radial scribble strokes, 6 grey smoke
    circles drifting up.
  - `st.splat(x, y, "scorch", seed)` — new stain painter: dark blob
    `rgba(50,42,34,0.22)` + speckles + a few hatch ticks.
  - damage: agents within 70px (one grid.query): zombies `hp -= 3`
    (instant kill at hp 3), 45% catch fire; civilians: no hp damage,
    25% catch fire (friendly fire is sparks, not bullets).
  - 80% chance of a ground-fire patch: fx record
    `{x, y, t: 6, gfire: true, seed}` (the patches ARE fx records —
    the core decays/prunes them; there is no separate `this.gfire`
    array).
  - **Ground fire**: the fx gfire records are scanned in `frame()`:
    agents within 40px (`GROUND_FIRE_R`) of a live patch catch fire at
    0.6/s (`GROUND_FIRE`) (one grid.query per patch per frame; patches
    are rare and short-lived).
    `drawFX` (branch `sh.gfire`): a wobbly flame tuft — 9 strokes
    fanned up from the patch center, alternating amber
    `rgba(176,110,40,α)` / red `rgba(150,40,30,α)`, α fading with
    `t/6`, plus a soot base `wcirc` — all boil-jittered. A zombie
    killed by the fire also leaves a short-lived patch (the
    `_killZombie` tuft).
- **Burn state** (`a.burn` seconds, 6–9 on ignition):
  - any agent (st 0/1/2): while `burn > 0`, decay; deal 0.4 hp/s to
    the agent's `hp` (everyone carries hp 3 — a burning agent dies in
    ~7.5s; the fire is the one thing that kills civilians standing
    still).
  - **frantic**: burning agents ignore all other AI (the first branch
    in `update`): run at 105 in `a.burnDir`, re-rolled every 0.3s
    (±1.2 rad jitter, never a full stop — pure panic), `wantMove`,
    gait driven. Survivors/gunners shout `FIRE_PHRASES`
    (`"fire!"`, `"it's on fire!"`, `"oh god, it's on me!"`,
    `"burning!"`) at high rate. A burning zombie stops hunting
    (`a.tAge = 2.5` each frame).
  - **spreading**: a burning agent ignites others it touches — in the
    existing touch queries (zombie infect query covers st 0; add a
    small `INFECT`-radius query when `a.burn > 0`: any other non-burned
    agent, 0.35/s chance). Fireball chains through packs is the
    desired spectacle.
  - **flame overlay** in `draw` (after the flash scribble, additive —
    the frozen figure underneath is untouched): 3 wobbly flame strokes
    from the shoulders to a flickering tip 8–13px up, seeds re-keyed
    by `((t * 12) | 0)` for a 12fps flicker, amber/red strokes + a
    faint `wcirc` base; α scales with `burn` (fades in the last 1s).
- **Turret death**: broken post (two splayed strokes) + smoke poof.

## Round 2 — the user watched a live run (seed 100) and asked for ten

### Auto camera (default; `camera.js`, `main.js`)

The outbreak page starts with `cam.auto = true` (only when the scenario
defines `camInterest`). `ZS.debug.scenario.camInterest()` returns the most
interesting point each frame: a live boom/grenade fx (zoom 1.9), a shaking
door (1.7), or the squad with the smallest live threat distance (1.6),
else null (camera holds). `cam.autoSeek` glides to it with exponential
smoothing (pos tau 0.7s, zoom tau 0.9s) then `clamp`s. Any pointer press
or wheel zoom sets `cam.auto = false` for the rest of the session — the
HUD says so ("auto-camera — drag to take control"). battle/hold have no
`camInterest`, so they stay manual.

### Sound (`js/sound.js`, new)

Zero-asset WebAudio synth, `ZS.sound = { event(name, x, y), tick(dt),
unlock(), unlocked }`. The AudioContext is created lazily in `unlock()`,
which the first pointer-down calls (file:// autoplay policy). Every event
is attenuated and panned against the camera (`base * max(0, 1 - d/700)`,
StereoPanner, boom exempt from the cutoff and ×1.2). Voices are all
synth: rifle = noise highpass + 130→55Hz thump; shotgun = louder lowpass
burst; smg = 45ms tick; grenade = short noise plink; boom = lowpassed
noise + 55→28Hz sub + highpass crackle; moan = low sawtooth; shout =
bandpassed noise tick; door_break = thump + creak; fire = tiny crackles.
Per-name cooldown map (0.05–0.45s) + a 28-voice cap keep the mix sparse.
`tick(dt)` adds ambient crackle near burning agents/gfire patches.
Call sites are guarded one-liners (`if (ZS.sound) …`) in `zombie.js`.

### In-building pathing (`nav.js`, `agents.js`, `zombie.js`)

The floors (nav cell 2) and intact doors (cell 3) are now solid to
zombies: `isWalkable` returns `!isZombie` for v2/v3, and A*'s `free`
matches. Consequence: a zombie can never path across a wall into a
building — it walks to the door front and gnaws (existing door logic).
Interior semantics: a zombie that is *already on a floor* (got in
through a broken door) may move through the interior — A* gets an
`inB` start-cell exception (floor target + floor path free, intact doors
still blocked), `hardClamp`/`corePush` allow floor→floor steps when the
current cell is a floor, and the "trapped" nudge skips floor-standing
agents so they path out instead of teleporting. Pack spawn now passes
`isZ=true` so packs never spawn on floors; the tap-spawn stays
`false` (it moves a survivor).

### Guards: proactive, cooperative, door defense (`zombie.js`)

- **Door sentry**: each squad picks its nearest intact district door
  (<550px from the anchor); the last-rank guard holds a slot in front of
  it, is exempt from the fallback triggers until the door breaks, then
  rejoins the arc. A new sentry is re-picked after each break.
- **Focus fire**: guards prefer the squad's shared threat (s.thx/thy)
  when it is alive and within weapon range + 200px, else the nearest;
  wounded zombies (hp ≤ 1) get +25% effective range.
- **Proactive advance**: when the shared threat is live at 260–800px,
  line-0 slots push up to +70px closer as it nears.
- **Personalities** (`a.pers`, deterministic from the agent seed):
  FIGHTER 12% / STEADY 26% / CAUTIOUS 22% / PANICKED 22% / STOIC 18%.
  FIGHTER civilians within 400px of a district anchor pick up a
  shotgun/smg at init (≤10 per district) and fight via the defender
  firing path (sid -1, break for the door at hp ≤ 1).
- **Dialogue**: every PHRASES bucket expanded to 8–15 sketch-voice
  lines plus per-personality pools; `_tryShout` tries the
  personality-filtered event pool first, then generic.

### Sightline semantics + the F4 chain actually fires (`zombie.js`)

The floor-blocking pathing fix has one consequence for sight:
`nav.los(x, y, x2, y2, true)` now means *zombie* walkability (floors
solid), so a human weapon sightline that passed `true` went deaf
across any building interior. All four defender trigger pulls (turret,
grenade sidearm, grenade throw, generic shot) pass `false` (human
walkability — the pre-fix effective behavior); the zombie bite/infect
check keeps `true` (a zombie outside must not see through a wall).

Two dynamics fixes landed so the grenade → boom → ground-fire chain
actually triggers on the seed-100 map (it never did before: the horde
held a 300–600px standoff ring and the packs chased fleeing survivors
out to the river corridor, so no cluster ever came inside throw range):

- **Pack cohesion**: a converging pack ignores prey farther than
  `PACK_CLOSE` (200px) while `packT > 0` — a fleeing survivor out in
  the open no longer drags the whole blob off the district. `PACK_T`
  25→40s so packs still coherent when they arrive; they engage and
  peel off into normal hunts at close range.
- **Grenade crisis targeting** (`_grenadeThrow`): the sidearm shot is
  unchanged (SMG at singles under 130px). The throw fires at the
  district's crisis — first priority: ≥3 zombies gnawing the squad's
  door front within `GRN_DOOR_R` (600px); else the densest 90px pack
  within `GRN_RANGE` (380px), found by a 64-slot preallocated density
  scan (`this.glist`, no per-frame allocs).

Two more reliability fixes (found by seed-100 forensics: the squad
sizes come out 3–4 per district, so the size-5+ mix — the only one
carrying a grenade — often never materializes, and even a directed
pack's 40s `packT` expired mid-approach, scattering the blob before it
clustered):

- **Grenadier guarantee** (`init`): if no squad drew the grenade from
  the size-5+ mix, the biggest squad's rank-0 is promoted to the
  grenade (sidearm included). The town always has a thrower.
- **The opening strike meets the thrower**: directed opening packs
  (above) + bigger opening packs + 75s `packT` — the first cluster
  forms on the thrower's door front (the door-gnaw trigger fires at
  ≥3 zombies within 150px of the front, door within 600px of the
  thrower). Verified across runs: first boom t+12s, t+19s, t+20s,
  t+31s on seed 100 (tool-watch + `.verify/f4-check.js` — the check
  latches `saw {grn, boom, gfire, burn}` from a 500ms fx poll and
  passes on all of them); the auto-camera lands on the blast.
  The boom-roll was also raised 0.55 → 0.8 so a blast reliably leaves a
  ground-fire patch, and `.verify/diag-throw.js` samples the gate
  inputs every 10s for forensics.
- **Grenadier survivability** (`_updateDefender`): the gate forensics
  (`.verify/diag-throw.js`, 5s cadence) showed the silent runs — the
  opening packs (30 zombies) converge on the thrower's district and
  bite the grenadier (a line-0 front slot) to death at ~t+25-35s,
  before a door cluster forms; dead thrower = no chain for the rest of
  the wave. The front arc also steps *out* toward a closing threat,
  meeting the pack at the thrower's post, and `nearestWalkable` pulled
  the back-row slot forward to ~60px from the anchor even at a +80
  offset. Fix: the grenadier's arc slot sits 140px back from the line
  (deep, to beat the walkable clamp), he is excluded from the front
  step-out, and he breaks for cover at hp ≤ 2 (others: hp ≤ 1) — a
  wounded defender still fires and throws while running. He still
  throws first (the pack gate fires at ~380px before the bite ring),
  and a wounded run ends the run, not the show.
- **Pack blob convergence** (`_pack`): the pack members' individual
  targets jittered ±30px around the shared anchor, and the
  zombie-walkable clamp resolved each jitter to a *different*
  perimeter point around a building — the pack fanned into a ring and
  never formed the 3-in-90px cluster the throw gate needs. Targets now
  jitter ±12px around the shared walkable point (a tight blob), which
  guarantees the cluster on the third arrival: the first boom lands on
  the pack's arrival (t≈25-47s across runs), and each following pack
  gets the same treatment at the district door.


### Turret restyle + bigger booms (`zombie.js`)

The "little tank" turret is redrawn as a hand-sketched sandbag
emplacement: squashed bag ellipses (door-brown fill, wall-brown
outlines), a post, a rifle line with a sight tick, one crate. Shadow,
muzzle flash, tracers and the broken state are unchanged. Explosion fx
are scaled up: ring 6→90px, 12 radial scribbles 18→46px, 10 smoke
circles, a new 0.15s white `flash` fill (r12→60), a second fainter
scorch; gfire gains a core stroke + soot circle; the per-agent burn
overlay gets an inner hot core.

### River edge-to-edge + no buildings on water (`world.js`)

The river ribbon now overshoots the map rim by ±40px (off-map samples
are safe: `markWater` only tests in-grid cells, the canvas clips), so it
runs corner to corner instead of stopping ~120px short. `clearOfWater`
gains a strict `pointInPoly` membership test (building perimeter +
bbox center against the river/lake/pond centerline polygons) alongside
the radial ring, closing the holes a meander left between ring samples.
The pinned Cannae branch is untouched.

### Doors never land on water or on neighbors (`buildings.js`)

Two latent bugs behind the "the river has a door" report:

- `wallRuns`'s scan band had a missing `/ CELL` division in its lower
  row bound (`iy1`), so the door search scanned from the building's
  south wall to the map rim. Water cells are `v0`, exactly like wall
  cells, so a long riverbank run could out-bid the building's own
  walls and the door was stamped onto the bank. The band is now
  bbox±1 cell as designed.
- A later building's `wallRing`/`markFloors` could paint over an
  earlier door's open front cell when the two bboxes landed ~56px
  apart (the `overlapsAny` pad). `placeDoor` now claims the front cell
  in `B.doorBld`, and `wallRing`/`markFloors` skip claimed fronts, so
  a door always opens onto standing land.

## Round 3 — water is a soft block (`nav.js`, `agents.js`, `zombie.js`)

**The ask**: zombies and humans are completely blocked by the river and
the lake. Water should be a "soft" block — swimming allowed, at a very
reduced speed.

- **Water mask** (`nav.js`): `Nav` gains `this.wm` (Uint8, 1 = water
  cell); `markWater()` sets it wherever it sets `val` to 0 (river, lake,
  ponds — the same polygons that drive the drawing, so mask and art
  agree exactly). `isWater(x, y)` = blocked cell **and** water-masked:
  wall cells are blocked but not water, and door-front cells carved into
  the river read as land, so neither is "swimmable". Hold's dug moats
  mark `val` 0 through `ZS.Tiles` and never touch the water mask, so
  they stay hard blocks there.
- **A* economics** (`astar(x1,y1,x2,y2,isZ,maxExpand,swim)`): with the
  flag, water cells pass at **4x cell cost** (1/SWIM_FRAC). The unit-cost
  octile heuristic stays admissible, so paths stay optimal: the swim is
  taken exactly when it beats the detour (a 280px crossing costs 1120;
  a 320px bank walk costs 320 — walk; a 1180px meander with no other
  route costs 4720 — swim). Water targets are reachable (`tw`), a
  swimming agent can replan from a water cell, and corner-cutting rules
  apply to water exactly as to land. Without the flag the mask is
  untouched — cannae and hold are bit-identical.
- **LOS** (`los(..., isZ, swim)`): water is transparent to sight for
  swim-capable callers — a zombie 300px out on the far bank is visible
  and chased (zombie sight is distance-only anyway, so the chase forms
  naturally; guard/turret fire keeps its old water-blocking sight).
- **Core integration** (`agents.js`): `SWIM_FRAC = 0.25` — in-water
  speed caps at `maxSpeed × 0.25` (measured ≈ 14-15 px/s for the
  120-cap zombie, vs ~65+ on land). `hardClamp`, `corePush` and the
  walkability fix-up accept a destination in water when the scenario
  swims, and the stuck timer doesn't count slow swimmers.
  `planAndFollow` threads the flag into `astar`/`los` and stops treating
  water waypoints as stale paths.
- **Scenario opt-in** (`zombie.js`): `swim = true` on the outbreak pack
  (the only swimmer today); the pack spawn route check
  (`nav.astar(..., true, 6000, this.swim)`) now succeeds across the
  river, so packs can invade districts on the far side.
- **Verification** (`.verify/swim-probe.js`): `isWater` marks the band;
  A* always returns a route (detour or swim); a zombie teleported mid-
  river chases a scent and swims the crossing at ~1/8 of its land speed,
  exiting on the far bank. `errors: none`.

## Round 4 — the town defends itself (`zombie.js`, `agents.js`, `nav.js`)

Watched runs surfaced seven problems: zombies locking through walls,
door-jitter crowds, the whole town funneling into one building, fire
chaining into a town-wide blaze, no in-wave pressure, defenders welded
to one building, and the auto-camera parked on a single door.

### Walls & funnel (`zombie.js`, `agents.js`)

- **No sight through walls**: zombie prey-sight (and survivor panic)
  now require `nav.los(agent, prey, true)` — the zombie mask, so intact
  doors and walls block the lock. A zombie that loses sight keeps
  chasing its last-known point (unchanged), it just never acquired
  through a wall in the first place.
- **Scent, fixed for real**: the pack-arrival conversion scan (packs
  gnawing a door inside an occupied house convert survivors) went
  whole-town — the old 400px `SNIFF_R` scan missed houses 800px away,
  so packs camped on last-seen street points and never breached. The
  root cause of the *dead* scent symptom was occupancy: the
  `inCount`/`survCount` tallies were reset at the top of the frame, so
  the AI pass always read fresh zeroes. The reset moved to *after* the
  AI pass (refill happens during integration) — the pass now sees the
  previous frame's tallies. This also fixed a latent `inCount`
  staleness bug in the in-house flee logic.
- **Occupancy-aware shelter**: `_pickShelter` scores
  `dist + inCount*600 + survCount*60` — a full house loses to an empty
  one next door, so the town spreads out instead of stacking one door.
- **Wall-aware separation**: the soft push (and hard `corePush`) now
  checks `nav.isWalkable` at the push midpoint — crowds at a doorway
  no longer inflate through the wall (the jitter at door frames was
  agents shoving each other across solid geometry).

### Fire & escalation (`zombie.js`)

- **Fire is self-limiting**: every ignition/spread rate cut 2–4×
  (`GRN_IGNITE` 0.45→0.25, `GRN_CIV_IGNITE` 0.25→0.12, `BURN_SPREAD`
  0.35→0.15, `GROUND_FIRE` 0.6→0.15, burning-corpsse 0.4→0.25, boom
  tuft 0.8→0.5). Verified: a burn peak of 116 agents dies to 0 in
  30s; ground-fire patches stay 1–2 (no chaining).
- **Grenadiers look like soldiers**: no separate "grenadier" class —
  one soldier per district is quietly promoted to `wep="grenade"`
  (rank 0, except size-4 squads keep the SMG up front) and renders as
  an ordinary rifleman. Behavior unchanged: sits back from the line,
  sidearm at singles, throws at the district's crisis (door pack first,
  else densest pack).
- **In-wave escalation**: the invasion escalates within a wave, not
  just between waves. New `waveAge` (seconds into the wave): pack size
  `5 + wave + waveAge/30` (capped 12), cadence shortens with waveAge
  and wave, a once-per-wave **surge** at `waveAge > 60` strikes the
  weakest post (size `PACK_CAP + wave`, capped 22), and after 120s
  packs spawn in doubles. Verified: horde snowballs 8→143 over the
  first 200s while the squads bleed — pressure is visible and
  compounding.

### Defenders & camera (`zombie.js`, `main.js`)

- **Rovers** (`ROVER_N = 4`, `ROVER_SEE = 400`): four unattached
  riflemen spawned on open land at wave start. A zombie within
  `ROVER_SEE` overrides everything — close to a 100px standoff and let
  the shared defender fire section do the rest (focus-free grid
  query, LOS-gated shots); with no threat, work the district posts in
  turn (`rvI % squad count`), 5s dwell per post. They take the same
  damage as soldiers (bite → turn, shots → hp) and count in the
  `guard` tally. Verified: all four patrol (up to 500×1300px of travel
  in 60s), close to contact with the horde, and attrit normally.
- **Auto-camera heat** (replaces the "most-pressured squad" tier):
  the camera keeps a zone list — every district post plus the town
  core, built in `init`. `frame()` accumulates heat per zone:
  `zombies_in_200px * 0.6/s`, `+5/s` while a squad fights there,
  `+6/s` per door being gnawed, all decaying at `e^(-0.06·dt)`; a
  grenade blast adds a flat `+25` to the nearest zone.
  `camInterest(dt)` dwells on the current zone for `CAM_DWELL = 9s`
  (zoom 1.5), then tours to the hottest *other* zone; a live boom or
  in-flight grenade still hard-overrides at zoom 1.9. Idle = a slow
  9s-per-zone watch of the posts. `main.js` passes the frame `dt`
  through (the only call site; the other scenarios don't define
  `camInterest`). Verified: the camera visits 7 distinct regions in
  60s with 5 zone switches, tracking the hot district.

### Fire respects walls (`zombie.js`, `nav.js`)

- **The ask**: people were burning *through* walls — all three fire
  paths were wall-blind. Every ignition path is now gated on
  `nav.los(source, target, true)` (zombie mask: intact doors and
  walls block; a broken door passes): the ground-fire tuft loop in
  `frame()`, the burning-contact spread in `_updateBurning`, and the
  blast damage/ignition in `_boom`. Verified (`.verify/wallfire-probe.js`):
  a tuft at a sealed door never ignites the survivor 20px inside
  (5s, `burn: 0`); a blast at the sealed door leaves an interior agent
  unharmed; break the door the real way and the same blast kills it
  (`hp 3 → 0`).
- **LOS endpoint fix** (`nav.js`): `los()` tested the *endpoint*
  against the ray's own mask — so any zombie-side ray ending at a
  floor point (v2) returned false, even through a **broken** door.
  That silently killed zombie sight after a breach and the new fire
  gates. The endpoint now tests the human mask (agents are clamped to
  their own cells, so a human-walkable endpoint is sightable from
  every side); intermediate cells still carry the ray's mask.

### Round 4 verification

`walls-probe` (90s): `sniffing 0→14, gnawing 1, broken 2 doors,
fixedHidden 0`. `synth-sniff`: full chain convert → walk → gnaw 16s →
door breaks t=19s → breach inside. `fire-gren-smoke`: burn 116 → 0 in
30s, 6 carriers, no chaining. `escalation-probe`: zomb 8→42→78→124→
143 (t=120→200s). `wallfire-probe`: sealed door blocks tuft and blast,
broken door passes the blast. `rover-cam-probe`: 4 armed rovers
patrolling, camera tours 7 regions. Full battery green: regression
(fps 55, no errors), guards (inIntact 0), hold, door-audit (0/0 all
seeds), f4-check (full chain ~16s), cannae gate (pinned terrain
intact, CARTHAGE 31.3s, no errors). `oxfmt` + `oxlint` 0/0.


## Round 5 — the camera settles, the turrets have crews (`zombie.js`, `camera.js`, `sim.js`, `main.js`, `draw.js`, `sound.js`)

Watched runs surfaced two more problems: the camera kept juggling
zones ("a lot of camera juggling"), and the turrets read as unmanned
robots. The user also picked four extras: a dawn report card, tap =
artillery, a threat arrow, and sound cues.

### Camera easing (`zombie.js`, `camera.js`, `main.js`)

- **The tour is gone**: `camInterest` no longer dwells and tours
  between zones. It computes the heat-weighted centroid of the hot
  zones (`h > 10`, two no-alloc passes) and eases the camera focal
  point toward it (τ = 1.4 s via `CI.ease`). Zoom is a function of
  the heat's *spread*: one hot zone or < 140 px apart → 1.45,
  < 260 px → 1.15, else → 0.95 — events in close proximity zoom
  **out**, not in. Nothing hot (no zone `h > 10`, no pulse) → return
  null: the camera simply holds still.
- **Boom/grenade pulses**: a live boom or an in-flight grenade still
  commands attention, but as a *pulse* (1.1 s) toward the blast /
  arc midpoint at τ 0.35 / 0.5 and zoom 1.9 / 1.7 — then the focal
  easing takes back over. No more permanent parking.
- **`Camera.autoSeek(x, y, z, dt, vw, vh, ease)`** (`camera.js`):
  exponential ease with a time constant in seconds (`ease`, default
  0.7 s → zoom τ 0.9 s — the classic behavior cannae/hold keep; the
  zombie pack passes its own τ).
- **`beatT` / `skipBeat`** (`sim.js`): the town-fall beat is now the
  scenario's `beatT || 3` (zombie: 4.5 s — room for the dawn card),
  and `skipBeat` (consumed on the `wave++`) lets the scenario dismiss
  the beat early — a tap on the card.

### Turrets have crews (`zombie.js`)

- Each emplacement spawns a **gunner**: an ordinary rifleman
  (`wep="rifle"`, `a.crewFor = tId`) seeded 30 px from the gun toward
  the town core. He walks to his slot and holds within 16 px of it
  (`_updateCrew`), facing what the barrel tracks. The gun only fires
  while **manned** — crew alive, `st < 2`, within 120 px of the gun
  (`_shot` also takes the `turret` sound while the gunner aims the
  barrel). An unmanned emplacement is silent and drawn dark: barrel
  laid across the sandbags, two cold smoke puffs drifting.
  Verified: the uncrewed draw pass runs ~1/10 the canvas ops of the
  manned one (11 vs 118), and a zombie pinned 80 px out drew 0 shots
  from a dead crew against live fire from a live one.
- Records: `sc.turrets[i] = { gun, crew, sx, sy }`; agents carry
  `a.tId` / `a.crewFor`. The gunner counts in the `guard` tally
  (`st < 2` armed).

### Extras (user-picked)

- **Dawn report card**: when the last survivor falls, `frame()`
  latches `fell` with the wave's tally (`wLost`), doors held, and the
  weakest squad's district direction ("the horde swells from the
  north west"). `hud().overlay()` then serves a sketched card —
  "night N — the town has fallen" + three lines — in place of the old
  text overlay, and the extended beat (`beatT` 4.5 s) holds it up
  while the world keeps moving; a **tap dismisses** (`skipBeat` →
  `wave++` on the next frame). Verified: card shape (42 / 5 / north
  west) and tap → wave 1→2 in under 1.5 s.
- **Tap = artillery**: a tap calls a sky-fall strike — a 0.9 s
  sky-fall grenade fx (the arc draws with `k = 1 - t/0.9`, so that
  constant is part of the contract) landing on the shared `_boom`,
  with an 8 s cooldown (`artCd`); a double-tap doesn't double the
  strike. Verified: cd 8, one grenade, boom, the struck zombie down,
  horde 20→10, camera pulse to zoom 1.79.
- **Threat arrow**: `hud.legend` now takes `(c, y, fs, vw, vh)` and,
  after the three glyphs, draws a sketched red pointer at the screen
  edge aimed at the hottest zone that's off-screen (inverse of the
  HUD transform, `_threatArrow`). Cannae/hold legends ignore the extra
  args.
- **Sound cues** (`sound.js`): a wave-start **horn** (sawtooth slide,
  felt across the map — `Math.max(B, 0.5)` gain floor), a **turret**
  cadence (low thunk, 0.3 s cooldown), and a fix: `_shot` was calling
  event names that don't exist (`shot` / `shot_sg` / `shot_civ` — the
  switch has no default, so every gun was silent). Now `shot_rifle` /
  `shot_shotgun` / `shot_smg` / `turret` / `shot_gren` — the full map
  is `shot_rifle, shot_shotgun, shot_smg, shot_gren, boom, moan,
  shout, door_break, fire, turret, horn`. Audio still unlocks on the
  first pointerdown.

### Round 5 verification

`.verify/round5-probe.js` (seed 100; deterministic heat injection,
`scenario.paused` freezing the sim for the camera phases): the focal
eases to the heat-weighted centroid (max 81 px per 600 ms — no
jumps), spread zoom 0.95 at 357 px → 1.4 for a single zone → exactly
0 px drift when nothing is hot. Crews 4/4 at their slots (9–16 px).
Fire gate: manned 1+ shots, uncrewed 0. Artillery: cd 8, no
double-strike, target down, camPulse 1.79. Dawn card: shape +
tap → wave 1→2. Full battery green: regression (fps 57, no errors),
cannae (CARTHAGE 30.9 s, pinned terrain bit-identical — no
`camInterest`, so the camera stays put; legend extra args harmless),
hold (clean), `oxfmt` + `oxlint` 0/0.


## Round 5.5 — the townsfolk actually talk (`sound.js`, `zombie.js`, `main.js`)

**The ask**: non-verbal voice lines when speech bubbles appear ("not the
actual words but just silly noises that make it seem as if they're
talking"), plus a real explosion for the grenades. The lines were
developed in a standalone listen-first playground (`.verify/voices.html`)
until the user picked them; they are ported into `sound.js` **1:1**.

### The formant engine (`js/sound.js`)

- **How a synth "speaks"**: moving bandpass formants. Each syllable
  (`vsyl`) drives three bandpass resonators (F1/F2/F3, Q 8/10/12, gains
  1.0/0.55/0.3) from a detuned double-saw glottis (±1–3.5 cents) with an
  F0 contour and a 3.5–7 Hz wobble LFO; `slow` lines glide the formants
  over ~95% of the syllable (the zombies), fast lines settle by ~65%.
  Vowel tables `VOW` (ee/eh/ah/aah/oh/uh/oo/er) + darkened `ZVOW` (F2
  pulled ~0.6×). A per-syllable `bus` sums glottis + breath; the whole
  phrase shares one panner + gain into a shared "room" (38 ms feedbacked
  delay, lowpassed at 2400 Hz, wet 0.3) — built lazily on first use.
  Consonants are filtered-noise puffs (`vpuff`/`VC` kit: h/m/p/s/t/b) and
  low sine thuds (`vthud`). No per-frame allocation: nodes are created on
  events only, and at most 5 phrases are live at once (`vlive`).
- **The 12 lines** (`VL`): survivors `mumble/shout/gasp/laugh/grunt/
  callout` (bright, fast F0 200–900 Hz); zombies `groan/growl/chomp/
  mama/spit/zedshout` (dark, F0 55–120 Hz, slow glides, wet puffs).

### Wiring (`zombie.js`)

- **Buckets → lines** (`_shout`): `gun` → `v_callout` (orders cut
  through the panic), `panic`/`grenade` → `v_shout` (the scream),
  `alarm`/`infected`/`door` → `v_gasp` (the sharp "what?!").
- **The bite**: `v_chomp` fires at the exact `b.st = 1` moment (inside
  the `b.inf >= 1` guard, with the "it bit me" shout).
- **The breach**: `v_zedshout` after `door_break` — the pack roars when a
  door splinters.
- **Ambient horde**: the `moan` event (module-throttled 0.4 s) now picks
  a weighted dark line: groan 42%, growl 20%, mama/spit 12% each,
  zedshout 8%, chomp 6%.
- `v_mumble`/`v_laugh`/`v_grunt` are in the engine for the player-chatter
  phase; nothing in the sim fires them yet.

### The explosion as a phrase (`sound.js`)

The first attempt (five `voice()` blips) still read as a blip — the
helper's one-shot exponential envelopes can't carry an explosion, and its
noise source was cut at the 0.6 s buffer (the tail died at 0.6 s). `boom`
(grenades **and** the artillery strike) is now a dedicated phrase builder
(`vboom`, same design language as the voice lines):

- **the crack** — a broadband noise burst, hard-attacked (4 ms) and
  **soft-clipped** (tanh(3.2x) WaveShaper): the shock front.
- **the body** — a falling bandpass (1100–1600 → 360 Hz, 0.3 s) shaped
  by the same shaper: the blast rolling past.
- **the sub** — two detuned saws (80→27 Hz and 40→14 Hz) through a
  closing lowpass: the thump with body (a bare sine reads as a beep).
- **the tail** — a ~2 s rumble: a looped noise floor (two-stage gain)
  under a detuned low saw drone through a resonant bandpass
  (140–180 → 70 Hz): the building settling.
- **debris** — two scattered `vpuff` shards as the dust settles, plus a
  distant low echo (the blast reflecting off the far side).

The noise buffer grew 0.6 → 2.0 s so the tail has room. Verified by
`.verify/boom-check.js` (output tapped, sim frozen): broadband crack
(high-band energy fraction 0.80–0.84 — a tone would be <0.03), crack RMS
~0.21, decay real, tail RMS 0.0024–0.0040 alive past 1 s (before the
rebuild it was ~0.00003).

### Tap ≠ camera input (`main.js`)

The sound-unlock click used to hand the camera to the user for the whole
session. A tap is now an **action** (sound unlock, the artillery call,
dawn-card dismiss): only a drag (>8 px cumulative), a 2-pointer pinch, or
the wheel takes the auto camera. Verified: two taps keep `auto: true`; a
drag or wheel flips it to `false`.

### Round 5.5 verification

`.verify/voices-sim-probe.js` (headless, seed 100, 75 s, output tapped
via an `AnalyserNode` inserted at `master.connect(destination)`):
unlock ok, all event types fired (`v_gasp 667, v_shout 78, v_callout 40,
v_chomp 21, moan 21, boom 14, door_break 1, v_zedshout 1`), `peakRms
0.021` on a `running` context (audible signal), zero errors. The earlier
page-side bugs were a dropped `ctx()` call (audio never initialized) and
two declarations lost in the rewrite (`bus`/`pan` in `syl`) — every click
threw before the fix; the VU meter on `voices.html` exists so silence can
be diagnosed (bar moves = system output, dead = real bug). Battery green:
regression (fps 40 headless, no errors), cannae (CARTHAGE 31.3 s, pinned
terrain invariants intact — riverBaseX 230, lake 2112/2040 r210, groves
fixed; tree *count* jitters per run by design), hold (clean), `oxfmt` +
`oxlint` 0/0.

## Player interaction (stepping stone — NOT built now)

The groundwork this design leaves: `tap()` stays the interaction
surface; `ZS.debug` exposes cam/world/nav/scenario; squads are
coherent units a controlled character could later join (`sid`/`rank`
slots); defender targeting is grid-based, so a "player" agent is just
another record with `a.free`-style movement. Nothing here should make
that harder.

## Verification checklist (run at the end, after both streams)

1. `node node_modules/oxfmt/bin/oxfmt js/` + `node
   node_modules/oxlint/bin/oxlint js/` → clean.
2. `.verify/regression.js` → boots, agents separated, no page errors,
   fps sane (fit view 30+ on this box; the sim is heavier now — expect
   ~35–45).
3. Headed Chrome (channel chrome) on `zombiesim.html`: watch a full round —
   packs arriving from the edges in groups, defender arcs around the
   districts, a squad breaking and falling back to the next line,
   grenades arcing, a burning agent sprinting, a turret holding a
   choke. Screenshots to `.verify/`.
4. `?seed=` reproducibility: two loads of the same seed = same map.
   (Terrain-only by design: `world.seed` pins river/lake/districts;
   behavior stays on unseeded `Math.random` — same seed, different
   fight. Seeding the behavioral RNG is a known, deferred change.)
5. `battle.html` + `hold.html` boot with zero page errors (terrain
   pins intact).
