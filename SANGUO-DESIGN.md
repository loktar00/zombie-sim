# 火柴三國 — Matchstick Three Kingdoms (design)

Working title: **火柴三國** (_huǒchái sānguó_) · English: **Matchstick Three Kingdoms**.

A hand-drawn, boiling-line game built on the same engine as *The Outbreak* /
*Cannae* / *The Hold*. It takes the `battle.html` demo scene (Cannae, 781
figures, formations + morale + rout) and turns it into the **real-time battle
layer** of a larger game whose **meta layer** is a turn-based map-strategy RPG:
you run a warlord faction across Han China, grow your generals like RPG
characters, and when armies meet you drop into a live tactical battle you
actually command.

> Status: **v0.1 — scaffolding the four pillars the user named.** Nothing built
> yet. This doc is the contract; it will grow round-by-round like
> `OUTBREAK-DESIGN.md`.

---

## 0. The four requirements this version locks down

| # | Requirement | Section |
|---|---|---|
| 1 | Save works on **localStorage or a server**, behind an abstract data layer so the backend can switch later with no gameplay-code changes | §5 |
| 2 | Two languages: **English** and **繁體中文 (zh-tw)** — **zh-tw is the default** | §6 |
| 3 | A documented **stickman art baseline** everything else is drawn against | §7 |
| 4 | The game is a **hybrid**: real-time strategy battle **+** turn-based map-strategy RPG | §4 |

---

## 1. The loop (the whole game in one sentence)

> On the map you plan in turns — grow generals, move armies, pick your fights.
> When an army meets an army, time turns real and you command the line until it
> breaks. Then it's a turn again, and your veterans are stronger or dead.

```
CAMPAIGN TURN (map, turn-based, player-paced)
  recruit / march / develop / assign generals / diplomacy
        │
        ▼  two armies occupy the same field
BATTLE (real-time tactics, the Cannae engine)
  deploy → command formations & abilities → one side routs
        │
        ▼  casualties, captures, general wounds/deaths, territory
CAMPAIGN TURN +1  (AI factions also moved; the map has changed)
```

A full campaign is many turns; a battle is **60–180 s** (inherited Cannae
pacing). The player can also just play **skirmish battles** straight from a
menu — that's `battle.html` with a commander attached, and it's the first
milestone (§10 P1).

---

## 2. Two modes, one shell

`sanguo.html` is the only page. It hosts two **views** that never run at once:

| View | Engine reuse | New |
|---|---|---|
| **Campaign** (`campaign` view) | `ZS.sketch` primitives, `ZS.Camera` (pan/zoom the map), paper pre-render, `ZS.sound` | province graph, army tokens, turn resolver, general roster UI |
| **Battle** (`battle` view) | The whole agent sim: `ZS.Grid`, `ZS.Nav`, `ZS.updateAgents`, `ZS.drawScene`, separation, the scenario contract | `ScenarioSanguo` pack, the command layer (select/order/formation), general abilities, duels |

A `ZS.App` state machine owns the switch: `MENU → CAMPAIGN ↔ BATTLE → RESULT`.
Only one view's `update`/`draw` is wired into the `main.js` rAF loop at a time;
the other is fully torn down (no hidden sim running).

**Why one page, not two like the other sims:** the campaign and battle share
save state, localization, art, and audio, and the handoff between them (§4.3)
is the whole point. Splitting them into two `*.html` files would fork all four.

---

## 3. Hard constraints

Inherited from `AGENTS.md`, non-negotiable:

1. **Double-clickable (`file://`).** Classic `<script src>` + IIFEs on
   `window.ZS`. **No ES modules, no bundler, no build step.** This drives every
   decision below — localization files are JS, not JSON fetches; remote save is
   `fetch()` to an _optional_ endpoint, never required.
2. **The boil is the product.** Everything visible is drawn with
   `wline/wcirc/wpoly/sketchRect` and the paper palette (§7). Colour lives in
   low-alpha washes and faction sashes; the ink line stays.
3. **No per-frame allocation in hot loops.** Battle can field 800+ figures.
   Reuse records; decay-and-prune. (Campaign turn resolution is not a hot loop
   and may allocate freely.)
4. **Core (`js/*.js`) stays scenario-agnostic.** The battle is a scenario pack
   (`js/scenarios/sanguo.js`) implementing the existing contract. The campaign
   is *new* top-level code (`js/campaign/*`), not a scenario.
5. **Format oxfmt, lint oxlint, both clean.** Playwright for verification.

New constraint for this game:

6. **The battle is deterministic** from `(seed, both armies' composition, the
   player's order stream)`. Same inputs → same fight. This makes battle
   outcomes reproducible for tests and lets a saved mid-battle be *re-simulated*
   from an order log rather than snapshotted pixel-for-pixel later (§5.4).
   Requires a seeded PRNG everywhere in battle sim — **no bare `Math.random()`**
   (use `ZS.rng32`).

---

## 4. Pillar 4 — the hybrid: campaign RPG ⇄ real-time battle

### 4.1 Campaign layer (turn-based strategy RPG)

The meta game. Turn = one **season** (4 turns/year). Order of a turn:

```
1. Player phase   — issue orders (below), unlimited thinking time
2. Resolve phase  — marches move, developments tick, then battles fire
3. AI phase       — each AI faction runs the same order set via a simple planner
4. World phase    — income, food, loyalty drift, random events, season advance
```

**Map.** A graph of ~40–60 **provinces** (漢 administrative commanderies),
nodes = cities, edges = marching routes with a distance in turns. Drawn as a
paper map: wobbly province borders (`wpoly`), ink city glyphs, a brushed river.
Camera is the existing `ZS.Camera` with the world sized to the map bitmap.

**Faction (the player + AI warlords).** Owns provinces, a treasury (金), food
(糧), a general roster, and armies. **Start = 194 CE**, so factions are the
*warlords* of that year, not the later kingdoms: 曹操, 袁紹, 袁術, 呂布,
劉表, 劉備 (weak), 孫策/孫氏, 劉璋, 馬騰, 公孫瓚, 陶謙… The player picks one.
(魏/蜀/吳 as states never appear — the game ends by conquest before then.)

**Armies.** A stack of troops + **1–3 assigned generals** + a composition
(spear / dao / crossbow / cavalry ratios). Armies sit in a province or march
along an edge. Two hostile armies in the same province at resolve →
**battle** (§4.3).

**Scale (DECIDED — Q2: 1 figure = 1 man).** Troop counts are literal men, and
each man is one drawn figure in battle. No abstract-count ↔ figure conversion
anywhere — losses, kills and captures are all 1:1.

- **On-field cap: `FIELD_CAP = 2000` per side** (≈ 4 000 figures in a big
  set-piece). A stack over the cap deploys the overflow as **reserves** that
  reinforce from the back edge mid-fight (the Cannae `maintain` path already
  does this).
- Army sizes therefore run **~200 men (first affordable) → ~4 000 (a stacked
  main force)**; a strong province garrison ~300–1 500.
- **Perf caveat.** 4 000 agents is ~4–5× the engine's proven envelope
  (`AGENTS.md`: 910 agents ≈ 40–50 fps fit-view). Hitting frame rate at
  `FIELD_CAP = 2000` is a **P2 deliverable, not an assumption** — it needs the
  fixed sim-step (§8), flow-field group movement (no per-agent A*), cheap
  slot-follow AI, and **render LOD** (distant ranks drawn as a few `wpoly`
  block-shapes / a hatched mass, full stickmen only near the camera). If P2
  can't hold ~60 fps at 2000, the fallback is `FIELD_CAP ≈ 800` with the same
  reserve mechanic — the design doesn't change, only the number.

**Generals are the RPG characters.** This is where the `rpg` skill applies —
derived stats from base attributes, an XP curve, an equipment/skill modifier
layer that is **pushed/popped, never baked into base**:

| General field | Meaning | RPG analogue |
|---|---|---|
| `wu` 武力 | melee power, duel strength, cavalry punch | STR |
| `tong` 統率 | command — troop morale ceiling, rout resistance, formation cohesion | VIT/leadership |
| `zhi` 智力 | tactics — ability potency, ambush, fire, sees through enemy ability | INT |
| `zheng` 政治 | governance — province income/food/development while stationed | (map-only) |
| `level`, `xp` | grows from battles won and enemies felled; quadratic curve `xp_to_next = 100·L²` | leveling |
| `loyalty` 忠誠 0–100 | drops on defeat, unpaid troops, incompatible lord; low loyalty → defection offer to enemy | morale/allegiance |
| `skills[]` | passive/active battle abilities unlocked by level or item (§4.2) | skills |
| `items[]` | weapon (sets battle weapon silhouette + `wu` mod), mount (cav speed), book (`zhi` mod) — each is a **modifier**, layered | equipment |
| `injury` | `none/wounded/maimed`; wounded = stat penalty for N turns, healed by resting in a city | status effect |
| `location` | province id, or `army:<id>`, or `captured:<factionId>` | — |

Derived, recomputed on read (never stored as truth):

```
army_morale_max   = 50 + tong·0.4 + (leader bonus)      // ceiling the battle uses
army_cohesion     = 0.6 + tong·0.003                    // formation spring stiffness
duel_attack       = wu·2 + weapon_mod + rng(±10%)
ability_potency   = zhi / 100
province_income    = base · (1 + zheng·0.01)  // when general is governing, not marching
```

**Turn orders (player phase):** `Recruit` (spend 金/糧 → troops, capped by
province size), `March` (send army along edges), `Develop` (province → +income
/ +food / +recruit cap / +wall), `Assign` (move a general between roster / army
/ governor seat), `Diplomacy-lite` (truce, gift, demand — v2), `Rest` (heal
injuries, recover loyalty).

**Save:** the campaign snapshot is the authoritative save (§5.3). Battles are
transient.

### 4.2 General skills / battle abilities

Data-defined (`js/campaign/data/skills.js`, a plain `ZS` object). Two kinds:

- **Passive** — always on in battle when the general is on the field:
  `鐵壁` +rout resistance to their unit, `驍勇` +duel attack, `疾風` +march &
  charge speed, `治軍` slower fatigue.
- **Active** — player triggers during battle, cost = a cooldown + the general
  must be alive and un-routed; potency scales with `zhi`:
  `突擊` (charge order with a damage/morale spike), `火計` (ignite a patch —
  reuses the Outbreak fire model, LOS-gated), `伏兵` (a hidden reserve unit
  revealed), `鼓舞` (AoE morale heal), `亂` (enemy unit cohesion drop).

Abilities are the RTS-side expression of the RPG progression: a level-1 general
has one weak active; a legendary general (關羽/呂布 tier) has three and a
strong passive.

### 4.3 The handoff contract (both directions)

**Campaign → Battle** builds a `BattleSetup`:

```js
{
  seed,                         // hash(campaignSeed, turn, atkArmyId, defArmyId) — deterministic
  field: { kind, terrain, biome },   // kind: "open" | "town" | "fort"  (see below)
  sides: [
    { factionId, banner, comp:{spear,dao,crossbow,cav},   // comp -> integer men per type
      onField, reserve,                                    // men deployed now vs streaming in
      generals:[<resolved general snapshot>] },
    { ... }
  ],
  objective,                    // "annihilate" | "rout" | "hold N turns" (fort) | "break through"
}
```

`onField = min(troops, FIELD_CAP=2000)`, `reserve = troops - onField` (feeds in
via the Cannae `maintain` edge path). 1 man = 1 figure — `comp` percentages
become integer per-type men directly, and the Cannae formation code already
lays men into slots. (`FIELD_CAP` is provisional — see the perf caveat in §4.1.)

**Field kinds (DECIDED — Q4), each reusing an existing page's terrain:**

| `kind` | When | Reuses | Notes |
|---|---|---|---|
| `open` | armies clash in open country | the Cannae battlefield (`ScenarioSanguo.terrain` lays plain/river/hills/forest) | the default; `objective` = `annihilate` / `rout` / `break through` |
| `town` | battle inside a held city with no standing wall | **`index.html` / the Outbreak town** — `ZS.Buildings.generate` streets, buildings, doors; `walkBlocked` per unit | street fighting: LOS matters, cavalry weak, `objective` usually `rout` |
| `fort` | attacking a walled/besieged city | **`hold.html` / the Hold** — `ZS.Tiles` ground grid + `js/blocks.js` wall/gate blocks with door-HP; defender deploys on the ring | attacker must breach a gate/wall (block HP, reuse the Outbreak door-chew + grenade/fire), defender gets a morale bonus; `objective` = `hold N turns` (defender) / `break through` (attacker). Wall-assault *tech* (ladders/rams/towers) is deferred — v1 breach = focus-fire a gate block. |

`ScenarioSanguo` picks its `terrain()` implementation off `field.kind`, so all
three share one scenario pack. The province record carries `hasWall` and a
`biome` that decide `kind` at handoff time.

**Battle → Campaign** returns a `BattleResult`:

```js
{
  winner: factionId | "draw",
  losses: { [factionId]: menKilled },          // applied to army troop counts
  generals: [ { id, outcome: "ok"|"wounded"|"captured"|"killed", xpGained, killScore } ],
  territory: "attacker_takes" | "defender_holds" | "attacker_retreats",
  duelLog: [...],                              // for the after-action card
}
```

Losses are the sim's actual dead tally, 1:1 (dead figures = dead men), clamped
so a decisive win still costs *some* men. General outcome (DECIDED — Q7:
permadeath is real): **killed** if their figure died and a `zhi`-vs-`zhi` save
fails — the general is gone from the roster for good; **captured** if their
side routed and the `HUNT` sweep caught them (Cannae already does this for
routers) — held by the enemy faction, recruitable or executable by them;
**wounded** on a passed death-save.

**Auto-resolve.** The player may skip a battle; a closed-form model
(`troops·quality·morale·terrain·general` → expected losses + outcome, with a
small RNG band) produces the same `BattleResult` shape. AI-vs-AI battles always
auto-resolve. The closed-form model is tuned to *roughly* match played-out
results so skipping isn't strictly better or worse.

### 4.4 Real-time battle layer (the command game)

The Cannae pack today runs a **baked step script** (`HOLD/ADV/RET/CHARGE/…`).
`ScenarioSanguo` keeps the same per-unit step *machine* but the steps come from
**the player**, not a script. New systems, informed by the installed
`game-ai`, `ai-behavior-trees-utility-ai`, `game-feel`, `game-ui-ux`,
`tower-defense` skills and the earlier web research:

- **Selection & orders.** Box-select + click-select + `Ctrl+1–9` groups; the
  scenario's `pointerDown/Move/Up` hooks (already in the contract) claim the
  drag so the camera doesn't pan. Right-click = move / attack-move; shift =
  queue waypoints. A bottom **unit tray** (DOM overlay, like the Hold's UI).
- **Active pause (DECIDED — Q5).** `Space` fully freezes the sim; orders,
  formation changes, ability targeting and camera all still work while paused
  (Total War / RTW style). Also exposes 1× / 2× / 4× speed. The fixed sim step
  (§8) makes this free — pause is `accumulator` not advancing.
- **Formations as data.** `line / column / wedge / square / skirmish`, each a
  slot-offset generator. Re-solve slot assignment (greedy nearest) when a
  unit's count changes. This is the Cannae `slot` field made dynamic.
- **Movement at scale.** Replace per-agent A* for group moves with a
  **flow field**: one Dijkstra pass from the order destination, each grid cell
  stores a direction; units sample their cell + steer with the existing
  separation. Keep `ZS.Nav.astar` only for single generals and edge routing.
  (`ZS.FlowField`, new, sits beside `ZS.Nav`.)
- **Morale / fatigue / rout.** Deepen Cannae's model: morale pool fed by
  casualties, flank/rear hits, general proximity, local outnumbering; fatigue
  drains on sprint/melee and multiplies rout chance; `wavering → routing →
  rally` (rally only near a general). Ceiling = `army_morale_max` from `tong`.
- **General units.** One figure per assigned general — bigger, name banner,
  weapon silhouette from their item, a faint **leadership aura ring** (radius
  from `tong`) that buffs morale/cohesion inside it. If the general figure
  dies/routs, their command takes a big morale hit.
- **Duels.** When two enemy general figures are within reach and both willing
  (trait / `zhi` roll), a **單挑**: a short auto-resolved exchange (best of N,
  `duel_attack` each round ±crit), camera pushes in (`ZS.Camera.autoSeek`),
  everything else keeps simming. Loser: wounded/captured/killed; their unit
  eats a morale shock. Straight from the RTK model.
- **Enemy commander AI.** An **influence map** (threat / friendly-strength /
  objective-value per cell, recomputed a few times/sec) drives a small
  behaviour tree: hold / press weak flank / commit reserve / retreat when
  army morale collapses. `zhi` of the enemy's best general scales how good the
  commitments are and whether it reacts to the player's ability tells.
- **Game feel.** Exponential-decay screenshake on charges/duels/ability
  impacts; brief hitstop on a general kill; `ZS.fx` particle bursts along the
  hit vector (records already exist). Sketch-quiet, per the style rules.

### 4.5 Turn-based ↔ real-time: what each layer owns

| Concern | Campaign (turn) | Battle (real-time) |
|---|---|---|
| Troop counts | authoritative | 1 figure = 1 man; dead figures subtract 1:1 |
| General stats | authoritative, persisted | read-only snapshot; only `xp`, `injury`, `captured` flow back |
| Terrain | province type | generates the field |
| RNG | `campaignSeed` + turn | derived `BattleSetup.seed`, deterministic |
| Time | discrete seasons | `dt`-clamped rAF, fixed sim step (§8) |
| Save | every turn (autosave) | not saved by default; optional mid-battle snapshot (§5.4) |

---

## 5. Pillar 1 — save / data-layer architecture

### 5.1 The rule

**Game logic never touches `localStorage` or `fetch` directly.** It calls
`ZS.SaveManager`, which talks to a swappable `Store`. Switching from local to
server is: construct a different `Store` at boot. No gameplay code changes.

### 5.2 Interfaces

```js
// A Store is dumb key/blob persistence. Async so a remote backend fits the
// same shape. All implementations honour this exactly.
ZS.Store = {
  async get(key)            // -> string | null
  async set(key, value)     // string; must be durable before it resolves
  async remove(key)
  async keys(prefix)        // -> string[]
  capabilities              // { cloud:bool, quotaBytes:int|null, atomic:bool }
}

// Implementations (js/store/*.js):
ZS.LocalStore   // localStorage; keys "hsg:v1:<...>"; atomic:false, cloud:false
ZS.RemoteStore  // fetch(baseUrl + key), Bearer token; cloud:true; ret/backoff
ZS.MemoryStore  // Map; for Playwright probes and deterministic tests

// SaveManager is the only thing gameplay imports. It owns the schema.
ZS.SaveManager = {
  SCHEMA_VERSION,           // integer, bumped on every save-shape change
  bind(store),              // pick the backend once, at boot
  async listSlots()         // -> [{slot, meta:{turn, faction, playtime, updatedAt}}]
  async save(slot)          // capture() -> migrate-noop -> write (shadow+swap / PUT)
  async load(slot)          // read -> parse -> migrateUp -> validate -> apply()
  async deleteSlot(slot)
  autosave(),               // throttled; called at end of World phase only
  capture(), apply(state),  // live game  <->  plain-data snapshot
}
```

### 5.3 Snapshot shape (what `capture()` returns)

```js
{
  version: 3,
  meta:    { createdAt, updatedAt, playtimeSec, appBuild },
  settings:{ locale:"zh-tw", master:0.8, sfx:0.9, music:0.5, autoResolveDefault:false },
  campaign:{
    seed, year, season, turn, playerFactionId, difficulty,
    factions:  [ { id, name, colorId, treasury, food, ai } ],
    provinces: [ { id, ownerId, dev:{econ,food,recruit,wall}, garrison } ],
    armies:    [ { id, factionId, loc, troops, comp, generalIds, orders } ],
    generals:  [ { id, nameKey, wu,tong,zhi,zheng, level,xp, loyalty,
                   skillIds, itemIds, injury, injuryT, location } ],
    relations: {...}, flags: {...}, eventQueue: [...]
  },
  battle: null   // or a mid-battle snapshot, see §5.4
}
```

Only **data** — no live agent objects, no canvas state, no functions. Content
that never changes (skill definitions, place names, the general almanac) is
**not** in the save; it's code. The save references it by id/key.

### 5.4 Durability, versioning, mid-battle

- **Atomic-ish local write:** write `hsg:v1:slot:<n>:shadow`, then set
  `hsg:v1:slot:<n>` to it, then keep the previous value as `…:bak`. A crash
  leaves a whole old or whole new save, never a torn one. (localStorage writes
  are synchronous per key — the risk is a crash *between* keys, which the
  shadow+bak dance covers.)
- **Remote write:** `PUT` the blob with an `If-Match: <version>` header;
  last-write-wins with a conflict surfaced to the player. `RemoteStore`
  retries with backoff; on total failure `SaveManager` falls back to
  `LocalStore` and flags "cloud out of sync".
- **Versioning:** every snapshot carries `version`. `migrateUp` runs an ordered
  chain of pure `v → v+1` functions. A save from a *newer* build is refused
  with a clear message, never half-read. This exists from v1 even though v1 has
  only one version — retrofitting it is the classic trap.
- **Mid-battle:** default is **don't save during a battle** — quitting a battle
  forfeits it (auto-resolve from the current state). Optional later: because
  battles are deterministic (§3.6), `battle` can store
  `{ setup, orderLog, elapsed }` and *resume by fast re-simulation*. Not v1.
- **Autosave:** one dedicated slot, written only at the end of the World phase
  (a safe boundary — never mid-resolve), throttled to once per turn.

### 5.5 Identity & the server backend (staged)

**Stage 1 (v1, build now): anonymous, local only.** No accounts, no login. On
first run `SaveManager` mints a random `deviceId` (`crypto.randomUUID()`) into
`hsg:v1:device` and stamps it on every snapshot's `meta`. `LocalStore` is the
only binding. Nothing to authenticate.

**Stage 2 (later): OAuth for cloud saves + multiplayer.** Adds a `ZS.Auth` seam
— `getToken()` / `isSignedIn()` / `signIn()` / `signOut()` — with two
implementations: `AnonAuth` (returns the `deviceId`, Stage 1) and `OAuthAuth`
(PKCE flow, returns a bearer token). `RemoteStore` calls `ZS.Auth.getToken()`
for its `Authorization` header and is otherwise unchanged. Switching a player
from anon → signed-in migrates the local `deviceId` save up to their account on
first sync. The `Store` interface (§5.2) never changes.

**Server shape** `RemoteStore` will expect (so it's the only new client code):
`GET/PUT/DELETE /saves/{slot}` on the raw snapshot string, `GET /saves` for the
index, bearer auth (anon device token *or* OAuth token — server treats both as
opaque principals), `ETag`/`If-Match` for conflict detection. RESTful and
boring. The game stays fully playable with no server — `LocalStore` is the
default binding forever.

---

## 6. Pillar 2 — localization (zh-tw default, en)

### 6.1 Module

```js
// js/i18n/i18n.js
ZS.i18n = {
  locale: "zh-tw",                 // default; overridden by settings on load
  set(loc),                        // swaps table, re-renders DOM UI, persists to settings
  t(key, params)                   // "unit.spearmen" -> "槍兵"; {n} interpolation
  n(num), date(...)                // locale-aware number/season formatting
  has(key)
}
// Tables are plain JS, assigned on load order — NO fetch, NO JSON import (file://).
// js/i18n/zh-tw.js  ->  ZS.i18n._tables["zh-tw"] = { "menu.play": "開始", ... }
// js/i18n/en.js     ->  ZS.i18n._tables["en"]    = { "menu.play": "Play",  ... }
```

- **Default is `zh-tw`.** English is the fallback table for any missing key
  (dev safety), never the default shown.
- `locale` lives in `settings` in the save (§5.3) and in a standalone
  `hsg:v1:locale` key so the very first menu can render before any save loads.
- DOM UI: elements carry `data-i18n="key"`; `ZS.i18n.set` re-walks and fills.
  Canvas-drawn labels call `ZS.i18n.t` at draw time (cheap, cached per frame).

### 6.2 Content is bilingual data, not translated strings

Names of people and places are **content**, and both scripts are canonical:

```js
// js/campaign/data/generals.js
{ id:"guan_yu", name:{ "zh-tw":"關羽", "en":"Guan Yu" },
  style:{ "zh-tw":"雲長", "en":"Yunchang" }, wu:97, tong:95, zhi:75, zheng:62, ... }
```

`ZS.i18n.t` resolves `name` objects by current locale. UI chrome
("Recruit", "Loyalty") lives in the `zh-tw.js` / `en.js` tables; the almanac
of generals, provinces, skills, events lives in `data/*` with `{zh-tw, en}`
fields. One `t()` path handles both.

### 6.3 Fonts on `file://`

The look wants a **brush-kai (楷體) calligraphic** face, not a gothic sans.

**Chosen face: LXGW WenKai TC — 霞鶩文楷 台灣繁體** ([GitHub](https://github.com/lxgw/LxgwWenkaiTC),
[Google Fonts](https://fonts.google.com/specimen/LXGW+WenKai+TC)).
- **SIL Open Font License 1.1** — free commercial use, embeddable, no notice.
- Brush-kai style (derived from Fontworks' Klee One), which already sits close
  to the hand-drawn boil aesthetic.
- Traditional Chinese coverage: ~9 810 IICore Han + Big5 + HK/TW supplementary
  + GB/T — enough for zh-tw UI and the general/place almanac.
- Fallback chain (kai first, then any CJK):
  `"LXGW WenKai TC","LXGW WenKai","DFKai-SB","BiauKai","Kaiti TC",KaiTi,STKaiti,serif`.
  (Latin/numerals: a hand-drawn stroke face later; fine as fallback for now.)

**Shipping it without a build step / without a fetch:** the full Regular woff2
is ~8–10 MB — too big to bundle whole. The game's text is a *bounded* set (the
`i18n` tables + every `{zh-tw}` string in `data/*`), so an **asset-time subset**
(dev tooling — `pyftsubset` / `hb-subset`, same category as oxfmt/oxlint, not a
runtime build) produces a `fonts/lxgw-wenkai-tc.subset.woff2` of ~0.3–1 MB
covering exactly the glyphs used, refreshed whenever `data/*` gains names. One
`@font-face` in `sanguo.html`'s inline CSS points at that local file; a
`.verify/` check fails the build if any rendered string contains a glyph
outside the subset (falls back to system kai, but we want to know).

**Canvas text** passes the same family to `ctx.font`. To keep it in the boil
style, draw per-glyph with a tiny `ZS.jit`-driven offset/rotation (≤0.6 px,
≤1.5°) so headings shimmer like the strokes. A glyph atlas is **not** needed —
`fillText` with the subset font is fine at the label volumes here.

### 6.4 Rules

- No string concatenation for sentences — full templated keys with `{params}`
  (grammar order differs between en and zh).
- Every player-visible string goes through `t()` from the first commit. A lint
  pass / grep in `.verify/` flags raw CJK or quoted UI text in `js/` outside
  `data/` and `i18n/`.
- Numbers (troop counts, 金/糧) through `ZS.i18n.n` — zh-tw may want 萬
  grouping (8 萬) vs en "80,000". Config per locale.

---

## 7. Pillar 3 — the stickman art baseline

The Cannae `_drawSoldier` is already a matchstick figure. This section
**freezes it as the spec** so every unit, general, and faction is a small,
cheap variation and the look stays coherent. New art must be justified against
this baseline (same rule as `AGENTS.md` §3 for the zombie pack).

### 7.1 The base figure (`ZS.figure.drawBody`)

Anchored at `(a.x, a.y)` = the point between the feet. Units below are px at
zoom 1. All strokes via `wline/wcirc`, `lineCap:"round"`, colour `INK`
`#3d342b`, `lineWidth 1.5` (body) / `1.2` (kit).

| Part | Construction | Notes |
|---|---|---|
| ground shadow | `wcirc(x, y+5.5, r 5.5)` at `rgba(40,35,25,0.14)` | sells contact |
| legs | two `wline` from `(x, y-1)` to `(x ± g, y+5.5)` | `g = sin(gait)·3·min(1, speed/26+0.25)` — the walk |
| torso | `wline` `(hx, hy+4) → (x, y-1)` | `hx = x + sjit·0.4`, `hy = y-14` |
| head | `wcirc(hx, hy, r 4.2, amp 0.8)` | |
| face | single `INK` dot, forward side | facing = `a.a` |
| arms/weapon | `wline` from shoulder `(hx, hy+5)` outward along `a.a` | weapon = §7.3 |

Total height ≈ 20 px. Boil: every part takes `a.seed + <fixed offset>` so it
wobbles *stably* (no per-frame reseed).

### 7.2 Palette (extends the paper palette, does not replace it)

```
paper      #f3edde     ink        #3d342b     ink-soft  rgba(61,52,43,0.5)
blood      (reuse Outbreak fx)    dust       rgba(120,110,90,0.5)
```

**Faction colours** — each warlord faction gets one colour from a fixed
~8-entry ramp, assigned at campaign start (player faction always gets the same
slot). Used for the sash `wline`, the name banner cloth, and the map province
fill (all as a low-alpha wash + ink outline):

```
blue rgba(70,96,150) · green rgba(64,132,74) · red rgba(150,54,44) ·
ochre rgba(150,120,60) · violet rgba(120,80,140) · teal rgba(60,130,130) ·
brown rgba(120,86,60) · slate rgba(96,104,120)
```

Ground/terrain washes stay in the existing register (water/grass/tree/tan).

### 7.3 Unit types — silhouette is the read

Same body; the **weapon and stance** carry the type. No new body art.

| Type | zh-tw | Weapon draw | Stance tweak |
|---|---|---|---|
| 槍兵 spear | 槍兵 | long `wline`, ~14 px, angled up when idle | tight rank spacing (`sepR` low) |
| 刀盾 dao+shield | 刀盾兵 | short `wline` blade + `wcirc`/`wpoly` shield on off-arm (reuse `_shield`) | — |
| 弩兵 crossbow | 弩兵 | short horizontal `wline` + tick; a tracer `fx` on shot | halts to fire |
| 戟兵 halberd | 戟兵 | `wline` + a small cross `wline` near the tip | anti-cav bonus |
| 騎兵 cavalry | 騎兵 | rider body on a horse (reuse Cannae `_drawCav`) + lance | fast, wedge default |
| 弓騎 horse archer | 弓騎兵 | cav body + bow tick | kite |

### 7.4 Rank tiers — size + marks, still one body

| Tier | Body scale | Adds |
|---|---|---|
| 兵 trooper | 1.0 | nothing |
| 什長/隊長 NCO (slot leader) | 1.05 | the small `wpoly` flag already in `_drawMarks` |
| 校尉 officer (sub-command) | 1.12 | flag + a coloured sash `wline` across the torso |
| 將 general (named) | 1.25 | sash + **name banner** (vertical `wline` pole + `wpoly` cloth, `ZS.i18n.t(name)` drawn along it) + **aura ring** `wcirc` at `rgba(faction,0.12)`, radius ∝ `tong` |

### 7.5 Named generals

A general figure = base body at 1.25 + tier-將 marks + **one distinguishing
weapon silhouette** from their equipped item (青龍偃月刀 = an oversized dao
curve; 蛇矛 = a long wavy `wline`; 方天畫戟 = the halberd cross, doubled). That
plus the name banner and faction sash is the entire visual identity. **No
portraits, no unique bodies** — the boil style and the read from silhouette do
the work, and it stays cheap at 800 figures.

### 7.6 Campaign-map art

Same primitives, larger: provinces = `wpoly` blobs with a faction-wash fill and
ink border; cities = a 3-`wline` gate glyph; armies = a single scaled general
figure holding the faction banner, standing on the map; marching = a dotted
`wline` along the route edge. The map is one paper pre-render (`sjit`, static)
with the dynamic tokens drawn on top each frame.

---

## 8. Simulation & timing

- **Campaign** is event-driven; a turn resolves in one synchronous pass
  (allowed to allocate). No loop pressure.
- **Battle** moves to a **fixed sim step** (accumulator, e.g. 30 Hz) with the
  rAF frame **interpolating** between the last two sim states for render — the
  `physics-tuning` pattern. Buys deterministic morale/combat maths, free
  pause / slow-mo / 2× / 4×, and reproducible tests. Agents already store
  `px,py` (stuck detection) so the render lerp is nearly free.
- Determinism: seeded `ZS.rng32(battleSeed)` threaded through the pack; assert
  in `.verify/` that a fixed setup + fixed order log → identical `BattleResult`
  across runs.
- **Render LOD** (needed for `FIELD_CAP = 2000`, §4.1): the draw pass buckets
  visible agents by camera distance — near = full boiling stickman, mid =
  head+torso+weapon only, far = the unit's rank drawn as 2–3 `wpoly`
  mass-shapes with a hatched fill and one banner. Sim fidelity is unchanged;
  only the drawing degrades with distance. The existing camera cull stays.

---

## 9. File plan

```
sanguo.html                       the only page: canvas + <div id="ui">, sets ZS_SCEN;
                                  inline @font-face -> fonts/lxgw-wenkai-tc.subset.woff2
fonts/lxgw-wenkai-tc.subset.woff2 asset-time glyph subset of LXGW WenKai TC (OFL)  (§6.3)
tools/subset-font.sh              dev-only: rebuild the subset from data/* + i18n/* (pyftsubset)
js/store/store.js                 ZS.Store contract + MemoryStore
js/store/local.js                 ZS.LocalStore   (localStorage, shadow+bak)
js/store/remote.js                ZS.RemoteStore  (fetch, optional, backoff; calls ZS.Auth)
js/auth/auth.js                   ZS.Auth seam + AnonAuth (deviceId); OAuthAuth added in Stage 2  (§5.5)
js/save/save-manager.js           ZS.SaveManager: schema, migrate chain, capture/apply, autosave
js/i18n/i18n.js                   ZS.i18n: t / n / set / fallback
js/i18n/zh-tw.js  js/i18n/en.js   UI string tables
js/figure/figure.js              ZS.figure: drawBody, weapon table, rank marks, banner, aura  (§7)
js/app.js                        ZS.App: MENU→CAMPAIGN↔BATTLE→RESULT state machine, view wiring
js/campaign/map.js               province graph, paper map pre-render, tokens
js/campaign/turn.js              player/resolve/ai/world phases
js/campaign/general.js           general model: derived stats, xp, modifier layer, injuries
js/campaign/army.js              army stacks, marching, composition
js/campaign/ai.js                AI faction planner (v1: greedy heuristics)
js/campaign/autoresolve.js       closed-form battle model -> BattleResult
js/campaign/handoff.js           BattleSetup build + BattleResult apply  (§4.3)
js/campaign/data/*.js            generals.js, provinces.js, skills.js, items.js, events.js  (bilingual data)
js/scenarios/sanguo.js           ScenarioSanguo — the real-time battle pack (existing contract);
                                  terrain() branches on field.kind: open / town / fort  (§4.3)
js/battle/command.js             selection, control groups, order queue, unit tray
js/battle/formation.js           formation presets + slot re-solve
js/battle/flowfield.js           ZS.FlowField — Dijkstra field for group moves
js/battle/morale.js              morale/fatigue/rout/rally
js/battle/duel.js                單挑 resolver + camera push
js/battle/commander-ai.js        influence map + behaviour tree for the enemy
js/battle/ability.js             active/passive general abilities
js/ui/*.js                       DOM overlay: menus, HUD, rosters, after-action card
```

Untouched: every existing `js/*.js` core file, `js/scenarios/{zombie,cannae,hold}.js`,
and the other three HTML pages. `sanguo.js` implements the scenario contract;
everything else is new top-level code on `window.ZS`.

---

## 10. Build phases (each one playable + verifiable)

| Phase | Deliverable | Verify |
|---|---|---|
| **P0** | `sanguo.html` boots to a MENU; LXGW WenKai TC subset loads via local `@font-face`; `ZS.i18n` zh-tw/en toggle; `ZS.Auth`=`AnonAuth` mints a `deviceId`; `ZS.Store`+`LocalStore`+`SaveManager` round-trips a stub snapshot | Playwright: font renders (not fallback), switch locale, save, reload, load, assert state + `deviceId` stable |
| **P1** | **Skirmish battle**: `ScenarioSanguo` = Cannae figures + `js/battle/command.js` (box-select, right-click move via flow field, control groups) + one formation. No campaign yet. | play a battle end-to-end with mouse; deterministic-seed replay test |
| **P2** | Battle depth: formations, morale/fatigue/rout rewrite, general units + aura, one active ability, screenshake/hitstop; **fixed sim-step + flow-field movement + render LOD** | battle feels like command, not watching; morale curve probe; **fps probe at `FIELD_CAP` 2000/side — hold ~60 fps or set the fallback cap** |
| **P3** | **Campaign skeleton**: paper map, provinces, 3 factions, armies, march, turn phases, recruit/develop — battles still skirmish-only | play 10 turns, autosave each World phase, reload mid-campaign |
| **P4** | **The handoff**: `BattleSetup`/`BattleResult`, campaign battles drop into P2 battle and feed losses/xp/injuries/territory back; `field.kind` = `open` first, then `town` (Outbreak buildings) + `fort` (Hold walls); auto-resolve model | win a province by playing the battle; skip one, compare outcomes; fight a `fort` breach |
| **P5** | Generals as RPG: xp/level curve, skill unlocks, item modifiers, loyalty + defection, duels | a general levels from lvl 1→5 over a campaign; a duel kills one |
| **P6** | AI factions plan and fight; events; after-action card; `RemoteStore` written + tested against a mock endpoint | AI takes a province from the player; swap to RemoteStore, save/load works unchanged |
| **P7** | Balance, pacing, content pass (fill the general/province almanac), audio | full campaign playable start to a win condition |

P0–P2 stand alone as a commandable skirmish game — the same "playable at every
phase" discipline as `HOLD-DESIGN.md` §10.

---

## 11. Open questions

### Decided (v0.1)

- **Q1 — Campaign map scope:** **~40–60 provinces, one scenario / one start
  date.** No multi-era campaign. (Start date TBD — leaning 194 CE, post-Dong
  Zhuo, three powers already forming.)
- **Q2 — Battle troop model:** **1 figure = 1 man.** No abstract count. Army
  sizes in the low hundreds, on-field cap ~500/side with the rest as
  reinforcing reserves, ≤ ~1 000 figures total per battle. Ripples through
  §4.1 (scale), §4.3 (`BattleSetup`/`BattleResult` are 1:1), campaign
  economy (recruit costs/caps in men).
- **Q5 — Real-time pause:** **active pause** — `Space` freezes the sim; orders,
  formations, ability targeting, camera still work while paused. Plus
  1× / 2× / 4×. Free given the fixed sim step (§8). See §4.4.
- **Q7 — General permadeath:** **yes, killed generals are gone for good.**
  Captured generals are held by the enemy (recruitable/executable by them);
  wounded on a passed `zhi` death-save. See §4.3.
- **Q — CJK font:** **LXGW WenKai TC (霞鶩文楷, SIL OFL 1.1)**, brush-kai style,
  shipped as an asset-time glyph subset (~0.3–1 MB woff2), one local
  `@font-face`, system-kai fallback chain. No glyph atlas. See §6.3.
- **Q — Auto-resolve fidelity:** **±15% on losses, same winner ~95% of the
  time.** Tuned in P4.
- **Q — Multiplayer:** **out of scope for v1.** Keep it *possible*: battles stay
  deterministic (seeded `ZS.rng32`, order log, no bare `Math.random`), the
  `Store`/`Auth` seams stay clean. Not designed-for beyond that.
- **Q — Field kinds / sieges:** **`open` / `town` / `fort`**, reusing the
  Cannae, Outbreak (`index.html`) and Hold (`hold.html`) terrain respectively.
  Wall-assault tech (ladders/rams/towers) deferred; v1 breach = focus-fire a
  gate block. See §4.3.
- **Q — Identity:** **Stage 1 anonymous local `deviceId`, no accounts.**
  Stage 2 adds a `ZS.Auth` seam + OAuth (PKCE) for cloud saves / multiplayer;
  `Store` interface unchanged; anon save migrates up on first sign-in. See §5.5.
- **Q — Start date:** **194 CE** (Xingping 1) — post-Dong Zhuo, Cao Cao holding
  Yan province, Liu Bei not yet a power, the warlord field still wide. Fixes
  which generals/provinces/factions the almanac authors (P3, P7).
- **Q — `FIELD_CAP`:** **2 000 per side** (≈ 4 000 figures), *provisional* on
  P2 hitting frame rate with fixed-step + flow-field + render LOD; fallback
  `≈ 800`. See the perf caveat in §4.1.
- **Q — Campaign win condition:** **conquest only** for v1 — control every
  province (or every enemy capital). Keep it pluggable: the turn resolver asks
  a `winCheck(state)` predicate and the AI reads a `goal` object, so a turn
  limit / score / historical objectives can be added later without touching
  the loop.

### Still open

*(none blocking — the next move is P0)*

---

## 12. What the engine already gives us (reuse, don't reinvent)

| Need | Engine piece | Note |
|---|---|---|
| Boiling-line drawing | `ZS.sketch` (`wline/wcirc/wpoly/sketchRect/lerpC`) | every new visual, map + battle |
| Deterministic RNG | `ZS.rng32` (mulberry32) | battle seed, campaign seed, map gen |
| Pan/zoom/pinch camera | `ZS.Camera` (`fit/zoom/toWorld/autoSeek`) | map view and battle view both |
| Spatial hash | `ZS.Grid` | battle neighbour queries, separation |
| Pathfinding + walkability + LOS | `ZS.Nav` (`astar/los/isWalkable`) | single generals, fire/ability LOS gating; group moves use the new flow field |
| No-overlap crowd | `ZS.updateAgents` (`SEP_R/SEP_CORE`, `sepR` override) | Cannae already tunes `sepR:13` for packed ranks |
| Formation slots + step machine | `js/scenarios/cannae.js` | the `slot` + per-unit step script — swap the script source for player orders |
| Large-battle choreography reference | `cannae.js` crescent/rout/hunt | morale, `a.free` routers, edge-stream, `HUNT_FRAC` all reusable |
| `town` battlefield | `js/buildings.js` (`ZS.Buildings.generate`), the Outbreak town | streets/buildings/doors + `walkBlocked`; from `index.html` |
| `fort` battlefield | `js/tiles.js` (`ZS.Tiles`) + `js/blocks.js`, the Hold | ring wall / gate blocks with door-HP, tile ground; from `hold.html` |
| Y-sorted scene + HUD pipeline | `ZS.drawScene`, `scenario.hud` | battle HUD, after-action card via `overlay()` |
| Transient FX | `ZS.fx` (`{t}` decay/prune) | tracers, blood, dust, ability bursts |
| Spatialized audio, no assets | `ZS.sound` (`event/tick`, formant voices) | battle cues; the scenario names events |
| Scenario selection | `window.ZS_SCEN` → `ZS[name]` in `main.js` | `sanguo.html` sets `"ScenarioSanguo"` |
| Page-side inspection | `ZS.debug` `{cam,world,nav,buildings,scenario}` | Playwright audits, determinism probes |

Nothing in `js/*.js` core changes for this game except, possibly, a fixed
sim-step option in `main.js` (§8) — added as an opt-in flag, no-op for the
other three pages, per the `AGENTS.md` core-change rule.
