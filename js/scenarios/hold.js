/* The Hold — a tile-based base defense (a testbed for the tile engine, not a
   full game; design: docs/HOLD-DESIGN.md).
   P1: the day phase — a 40x30 grid of 40px tiles, dig water/sand/road on a
   per-day budget (water is a hard block in the nav grid, so a moat holds).
   P2: the block layer — walls, gates, scrap yards, barracks, turrets,
   workshops on the tile grid around a 2x2 core; the scrap economy (click
   the pile +1; yards 0.4/s; costs curve per owned unit, workshops -15%
   each); the day counter (DARKNESS FALLS: dusk 2s -> night 3s -> dawn
   1.5s; dig +5/day, cap 50); test zombies that chew through whatever
   stands nearest (broken blocks become rubble, cleared by dig 4);
   autosave to localStorage (10s, on changes, on unload).
   P3 (this build): the soldier ring — barracks train soldiers onto slots
   on a 3-tile ring around the core (cap 12 + 8/barracks); they engage
   zombies in range (club/machete/pistol), fall back wounded (morale),
   zombies now eat soldiers; the larder — farms grow food, the ring eats
   it (day only), hungry barracks train half-speed, food regen; upgrades
   (gloves x2 click, weapon tiers, armor 40/70/120, training +15% dmg,
   morale, reinforced block HP) bought with scrap, costs scale with the
   day; save v2 carries the larder, upgrades, and the surviving ring.
   P4 swaps the 3s night for the real 90s wave night + the dawn results
   card; P5 adds crates, offline progress, prestige, milestones. */
(() => {
  "use strict";
  const ZS = (window.ZS = window.ZS || {});

  const SAVE_KEY = "zs.hold.v1";
  const T = ZS.Tiles; // GRASS / WATER / SAND / ROAD / RUBBLE

  // tunables — all the Hold's numbers live here
  const BAL = {
    SCRAP0: 40, // starting scrap
    CLICK: 1, // click the pile: base scrap (gloves: ×2 per level)
    FOOD0: 300, // starting larder
    DIG0: 20, // day 1 dig
    DIG_GROW: 5, // dig grows by this each dawn
    DIG_CAP: 50,
    DIG_COST: 5, // per tile
    NIGHT_LEN: window.ZS_NIGHT_LEN || 90, // the full wave night (tests may shorten)
    DUSK: 3, // the warning: wash, camera to the core, "NIGHT N"
    DAWN: 1.5,
    KILL: 2, // scrap per walker (runners/brutes/bosses in P5)
    CLEAR_BONUS: 0.1, // +10% of the night's kill scrap for ending it early
    FAIL_SCRAP: 0.4, // the soft-fail: lost when the core falls
    FAIL_FOOD: 0.3,
    CLICK_DMG: 1, // click-combat: one hit per click
    COMBO_WIN: 1.2, // clicks within this window chain
    COMBO_MAX: 5,
    COST: {
      wall: { base: 15, c: 1 },
      gate: { base: 40, c: 1 },
      yard: { base: 60, c: 1.15 },
      farm: { base: 80, c: 1.15 },
      barracks: { base: 100, c: 1.2 },
      turret: { base: 150, c: 1.2 },
      workshop: { base: 120, c: 1.1 },
    },
    WORKSHOP_DISC: 0.85, // per owned workshop, applied to all costs
    YIELD: { yard: 0.4, farm: 0.5 }, // scrap/s per yard, food/s per farm
    UPKEEP: 0.05, // food/s per soldier (day only)
    REGEN: 2, // soldier HP/s in the day (food-gated)
    TRAIN_TIME: 10, // s of training per soldier, per barracks
    CAP0: 12, // soldier cap with no barracks
    CAP_PER: 8, // cap bonus per barracks
    RING_R: 120, // the ring: 3 tiles out from the core
    Z_SPD: 120, // walker
    Z_DMG: 4, // per hit
    Z_ATK_CD: 1,
    Z_REACH: 22, // from the block's edge (ring cells sit 20px off the edge)
    Z_PERC: 260, // block/core search radius
    Z_HP: 30, // walker (P4 scales it per night)
    SOLD_HP: 40, // armor 0 (armor tiers: 70, 120)
  };

  // soldier weapons, by upgrade level (design §4)
  const WEAPONS = [
    { name: "club", dmg: 3, range: 40, rate: 0.8 },
    { name: "machete", dmg: 6, range: 52, rate: 1 },
    { name: "pistol", dmg: 10, range: 120, rate: 1.4 },
    { name: "shotgun", dmg: 14, range: 128, rate: 0.9, splash: 120 },
    { name: "SMG", dmg: 18, range: 140, rate: 2.5 },
  ];
  const UPG = {
    gloves: { name: "gloves", base: 25, max: 5 }, // click 1,2,4,8,16
    weapon: { name: "weapon", base: 150, max: 5 },
    armor: { name: "armor", base: 120, max: 3 },
    training: { name: "training", base: 100, max: 5 },
    morale: { name: "morale", base: 90, max: 3 },
    reinforced: { name: "reinforced", base: 150, max: 3 },
  };
  const RETREAT = [0.5, 0.3, 0.15, 0]; // disengage below this HP fraction, by morale level
  const REINF = [1, 1.5, 2.5, 4]; // block HP multiplier, by reinforced level
  // the night weather (design §5): one modifier every third night from
  // night 3, deterministic in the night number, previewed on the dawn card
  const MODS = [
    { name: "FOG", desc: "zombie sight −25%", sight: 0.75 },
    { name: "RAIN", desc: "soldier fire rate −15%", rate: 0.85 },
    { name: "STENCH", desc: "zombie speed +10%", spd: 1.1 },
    { name: "CALM", desc: "kill reward +10%", kill: 1.1 },
  ];
  const TURRET = { dmg: 22, rate: 1, range: T.TILE * 3.5 }; // design §3.2

  const ST = { SOLDIER: 1, ZOMBIE: 2 };
  const BUILD_KINDS = ["wall", "gate", "yard", "farm", "barracks", "turret", "workshop"];
  const UNLOCK = { wall: 1, gate: 1, yard: 1, farm: 3, barracks: 1, turret: 4, workshop: 8 };
  const DIG_TOOLS = [T.WATER, T.SAND, T.ROAD, T.GRASS];
  const TOOL_NAME = { 0: "clear", 1: "water", 2: "sand", 3: "road" };
  const H = (n) => {
    const x = Math.sin(n * 127.1 + 311.7) * 43758.5453;
    return x - Math.floor(x);
  };
  // distance from a point to the block's rect (0 when inside)
  const rectDist = (b, px, py) => {
    const dx = Math.max(b.x0 - px, 0, px - b.x1);
    const dy = Math.max(b.y0 - py, 0, py - b.by);
    return Math.hypot(dx, dy);
  };

  class ScenarioHold {
    constructor() {
      this.saved = this._load();
      this.day = 1;
      this.scrap = BAL.SCRAP0;
      this.dig = BAL.DIG0;
      this.phase = "day"; // day -> dusk -> night -> dawn
      this.phaseT = 0;
      this.nightT = 0;
      this.paused = false; // the sim holds while the results card is up
      this.card = null; // dawn results card (canvas-drawn, click to dismiss)
      this.combo = { n: 0, t: -9, x: 0, y: 0 }; // click-combat combo
      this._n = null; // the night's tally
      this._sq = []; // the wave spawn queue
      this._coreEase = 0; // seconds left easing the camera home to the core
      this.tool = T.WATER; // number = dig tool, string = build kind, null = pan
      this.tiles = null;
      this.blocks = null;
      this.hover = null;
      this.px = 0;
      this.py = 0;
      this.toastTxt = "";
      this.toastT = 0;
      this.saveT = 0;
      this._brows = {};
      this._drows = {};
      this.food = BAL.FOOD0;
      this.up = { gloves: 0, weapon: 0, armor: 0, training: 0, morale: 0, reinforced: 0 };
      this._urows = {};

      window.addEventListener("keydown", (e) => {
        if (e.key >= "1" && e.key <= "4") this._selectTool(DIG_TOOLS[+e.key - 1]);
        else if (e.key === "0" || e.key === "Escape") this._selectTool(null);
        else if (e.key === "b") this._selectTool("wall");
        else if (e.key === "g") this._selectTool("gate");
        else if (e.key === "y") this._selectTool("yard");
        else if (e.key === "v") this._selectTool("farm");
        else if (e.key === "f") this._selectTool("barracks");
        else if (e.key === "t") this._selectTool("turret");
        else if (e.key === "w") this._selectTool("workshop");
      });
      const cv = document.getElementById("c");
      cv.addEventListener("mousemove", (e) => {
        const cam = window.ZS.debug && window.ZS.debug.cam;
        if (!cam) return;
        this.hover = cam.toWorld(e.clientX, e.clientY, cv.clientWidth, cv.clientHeight);
      });
      cv.addEventListener("contextmenu", (e) => {
        e.preventDefault();
        const cam = window.ZS.debug && window.ZS.debug.cam;
        if (!cam) return;
        const p = cam.toWorld(e.clientX, e.clientY, cv.clientWidth, cv.clientHeight);
        this._rightRemove(p.x, p.y);
      });
      window.addEventListener("beforeunload", () => this.save());
      this._panel();
    }

    // the scenario clocks run even with zero agents (P2 has no players yet)
    tickEmpty() {
      return true;
    }

    /* ---------- the battlefield ---------- */

    // the tile grid is the world (no river, no forest); saved state applies
    terrain(world, nav) {
      this.nav = nav;
      const tiles = (this.tiles = new T(world, nav));
      const s = this.saved;
      if (s && s.tiles) for (const [tx, ty, tv] of s.tiles) tiles.set(tx, ty, tv);
      const blocks = (this.blocks = new ZS.Blocks(world, nav, tiles));
      world.blocks = blocks; // draw.js y-sorts world.blocks with the agents
      blocks.placeCore();
      if (s && s.blocks)
        for (const [tx, ty, kind, hp] of s.blocks) {
          const r = blocks.place(tx, ty, kind);
          if (r.ok && hp !== undefined) r.b.hp = hp;
        }
      this.day = (s && s.day) || 1;
      this.scrap = s ? s.scrap : BAL.SCRAP0;
      this.dig = s ? s.dig : BAL.DIG0;
      this.food = s && typeof s.food === "number" ? s.food : BAL.FOOD0;
      if (s && s.up) Object.assign(this.up, s.up);
      if (s && s.coreHp && blocks.core) blocks.core.hp = s.coreHp;
      // the ring: surviving soldiers rejoin their slots (spawned in init,
      // once the sim's agent list exists)
      this._restored = s && s.soldiers ? s.soldiers : null;
    }

    /* ---------- scenario contract (sim.js / draw.js / main.js) ---------- */

    init(agents) {
      // dig is owned by terrain (load) and _newDay (dawn) — never reset per round
      if (this._restored) {
        for (const [x, y, hp, slot] of this._restored) {
          const a = this.makeAgent(x, y, ST.SOLDIER);
          a.slot = slot;
          a.maxHp = this.soldierMaxHp();
          a.hp = Math.min(hp, a.maxHp);
          agents.push(a);
        }
        this._restored = null;
      }
    }

    counts(agents) {
      return { n: agents.length };
    }

    left(_agents) {
      return 1; // the settlement stands (P3: the soldiers' count)
    }

    hostile(a) {
      return a.st === ST.ZOMBIE;
    }

    walkBlocked(a) {
      return a.st === ST.ZOMBIE; // zombies don't pass door cells
    }

    maxSpeed(a) {
      return a.st === ST.ZOMBIE ? this._zspd() : 120;
    }

    makeAgent(x, y, st) {
      const a = {
        x,
        y,
        a: ZS.rnd(0, 6.28),
        vx: 0,
        vy: 0,
        st,
        hp: st === ST.ZOMBIE ? BAL.Z_HP : BAL.SOLD_HP,
        maxHp: st === ST.ZOMBIE ? BAL.Z_HP : BAL.SOLD_HP,
        seed: Math.random() * 997,
        gait: ZS.rnd(0, 6.28),
        flash: 0,
        ph: ZS.rnd(0, 6.28),
        tx: null,
        ty: null,
        tAge: 99,
        path: null,
        pi: 0,
        gx: null,
        gy: null,
        navV0: 0,
        planFailT: 0,
        stuckT: 0,
        wx: null,
        wt: 0,
        bld: -1,
        px: 0,
        py: 0,
        wantMove: false,
        say: null,
        sayT: 0,
        sayMax: 0,
        id: 0,
      };
      if (a.st === ST.ZOMBIE || a.st === ST.SOLDIER) a.atkT = ZS.rnd(0, 1);
      return a;
    }

    // day/night clock, the waves, the economy, toasts, autosave
    maintain(agents, dt, _world, _vw, _vh) {
      if (this.card) return; // the results card: the world waits for a click
      this.phaseT += dt;
      if (this.phase === "dusk") {
        if (this.phaseT < 1.6) this._easeCore(dt, 2.5); // camera home to the core
        if (this.phaseT >= BAL.DUSK) {
          this.phase = "night";
          this.phaseT = 0;
          this.nightT = 0;
        }
      } else if (this.phase === "night") {
        this.nightT += dt;
        // the wave schedule: the spread spawns plus the surge bursts
        while (this._sq.length && this._sq[0].t <= this.nightT) {
          const s = this._sq.shift();
          this._spawnWalker();
          if (s.surge !== null && !this._n.surged[s.surge]) {
            this._n.surged[s.surge] = true;
            this.toast("they're coming — " + (s.surge === 1 ? "second" : "third") + " wave!");
          }
        }
        if (!this.blocks.core) return this._endNight(false, true); // the core fell
        if (this.nightT >= BAL.NIGHT_LEN) return this._endNight(false, false);
        // everything that came out of the dark is dead: the night ends early
        if (!this._sq.length) {
          let alive = 0;
          for (const a of agents) if (a.st === ST.ZOMBIE && !a.dead) alive++;
          if (alive === 0) return this._endNight(true, false);
        }
      } else if (this.phase === "dawn" && !this.card && this.phaseT >= BAL.DAWN) {
        this._newDay();
      }
      // the "⌂ core" button easing (and anything else that wants it home)
      if (this._coreEase > 0) {
        this._coreEase = Math.max(0, this._coreEase - dt);
        this._easeCore(dt, 4);
      }
      // the economy runs day and night
      const y = this._count("yard");
      if (y) this.scrap += BAL.YIELD.yard * y * dt;
      // the larder: farms feed it, the ring eats it (day only)
      const fm = this._count("farm");
      if (fm) this.food += BAL.YIELD.farm * fm * dt;
      const sld = this._soldiers();
      if (this.phase === "day" && sld.length) {
        this.food = Math.max(0, this.food - BAL.UPKEEP * sld.length * dt);
        if (this.food > 0)
          for (const a of sld) if (a.hp < a.maxHp) a.hp = Math.min(a.maxHp, a.hp + BAL.REGEN * dt);
      }
      // training: each barracks readsies a soldier every 10s (slower on an
      // empty larder), up to the cap
      if (sld.length < this.soldierCap())
        for (const b of this.blocks.list) {
          if (b.kind !== "barracks") continue;
          b.trainT = (b.trainT || 0) + dt * (this.food > 0 ? 1 : 0.5);
          if (b.trainT >= BAL.TRAIN_TIME) {
            b.trainT = 0;
            this.spawnSoldier(b);
          }
        }
      // a core that fell in the day (test zombies) is rebuilt free; the
      // night's loss is handled by the soft-fail in _endNight
      if (this.blocks && !this.blocks.core && this.phase === "day") {
        this.blocks.placeCore();
        this.toast("the core is rebuilt");
      }
      this.toastT = Math.max(0, this.toastT - dt);
      this.saveT += dt;
      if (this.saveT >= 10) {
        this.saveT = 0;
        this.save();
      }
      const bg = this.phase === "day" ? "#efe8d8" : this.phase === "dawn" ? "#e2dac6" : "#d3cab2";
      if (document.body.style.background !== bg) document.body.style.background = bg;
    }

    update(a, dt, t, _grid, nav, _world, _buildings, _wave) {
      if (a.st === ST.ZOMBIE) this._zombie(a, dt, t, _grid, nav);
      else if (a.st === ST.SOLDIER) this._soldier(a, dt, t, _grid, nav);
    }

    // scenario-wide per-frame logic: muzzle flashes, the turrets
    frame(agents, dt, _t, grid) {
      for (const a of agents) if (a.muz > 0) a.muz = Math.max(0, a.muz - dt);
      // turrets: 22 dmg @ 1/s on the nearest walker in 3.5 tiles (design §3.2)
      for (const b of this.blocks.list) {
        if (b.kind !== "turret") continue;
        b.atkT = (b.atkT || 0) - dt;
        const cx = (b.x0 + b.x1) / 2,
          cy = (b.y0 + b.by) / 2;
        let bz = null,
          bd = 1e9;
        grid.query(cx, cy, TURRET.range, (o) => {
          if (o.st !== ST.ZOMBIE || o.dead) return;
          const d = Math.hypot(o.x - cx, o.y - cy);
          if (d < bd) {
            bd = d;
            bz = o;
          }
        });
        if (bz) {
          b.aim = Math.atan2(bz.y - cy, bz.x - cx);
          if (b.atkT <= 0) {
            b.atkT = 1 / TURRET.rate;
            this._hitZombie(bz, TURRET.dmg);
          }
        } else if (b.aim !== undefined) b.aim += dt * 0.4; // idle sweep
      }
    }

    attachStains(_s) {}

    drawGround(c, world, _t) {
      this.tiles.drawAll(c);
      // ghost preview for build tools
      if (this.phase === "day" && this.hover && typeof this.tool === "string") {
        const [tx, ty] = this.tiles.tileAt(this.hover.x, this.hover.y);
        const ok = this.blocks.checkPlace(tx, ty, this.tool).ok;
        c.fillStyle = ok ? "rgba(112,148,72,0.22)" : "rgba(150,60,40,0.22)";
        c.fillRect(tx * T.TILE, ty * T.TILE, T.TILE, T.TILE);
        c.strokeStyle = ok ? "rgba(92,122,58,0.9)" : "rgba(150,60,40,0.9)";
        c.lineWidth = 1.5;
        ZS.sketchRect(c, tx * T.TILE + 2, ty * T.TILE + 2, T.TILE - 4, T.TILE - 4);
      }
      // dusk/night wash over the world (camera transform already applied)
      const al =
        this.phase === "dusk"
          ? 0.45 * Math.min(1, this.phaseT / BAL.DUSK)
          : this.phase === "night"
            ? 0.45
            : this.phase === "dawn"
              ? 0.45 * Math.max(0, 1 - this.phaseT / BAL.DAWN)
              : 0;
      if (al > 0.01) {
        c.fillStyle = "rgba(28,32,50," + al.toFixed(3) + ")";
        c.fillRect(0, 0, world.w, world.h);
      }
    }

    draw(c, a, t) {
      if (a.st === ST.SOLDIER) {
        this._soldierDraw(c, a, t);
        return;
      }
      if (a.st !== ST.ZOMBIE) return;
      // ---- the zombie look, ported verbatim from ScenarioZombie.draw (st===2) ----
      const s = a.seed;
      const moving = Math.hypot(a.vx, a.vy);
      const sway = Math.sin(t * 3 + s) * 1.6 * 0.5;
      const hx = a.x + sway,
        hy = a.y - 15;
      const g = Math.sin(a.gait) * 3.2 * Math.min(1, moving / 25 + 0.3);

      c.strokeStyle = "rgba(40,35,25,0.14)";
      c.lineWidth = 1.2;
      ZS.wcirc(c, a.x, a.y + 6.5, 5.5, s + 3, 1.4);

      c.strokeStyle = "rgba(150,40,30," + (0.1 + 0.06 * Math.sin(t * 2 + a.ph)).toFixed(3) + ")";
      c.lineWidth = 1;
      ZS.wcirc(c, a.x, a.y - 4, 17, s + 9, 2.5);

      c.strokeStyle = "rgb(72,102,58)";
      c.lineWidth = 1.5;
      c.lineCap = "round";

      ZS.wline(c, a.x, a.y - 1, a.x + g + ZS.sjit(s) * 0.5, a.y + 6, s + 11, 1.2);
      ZS.wline(c, a.x, a.y - 1, a.x - g + ZS.sjit(s + 1) * 0.5, a.y + 6, s + 17, 1.2);
      ZS.wline(c, hx, hy + 4, a.x, a.y - 1, s + 23, 1.1);
      ZS.wcirc(c, hx, hy, 4.6, s + 29, 0.9);

      const shx = hx,
        shy = hy + 6;
      const reach = 10 + Math.sin(t * 4 + a.ph) * 2;
      ZS.wline(
        c,
        shx,
        shy,
        shx + Math.cos(a.a - 0.5) * reach + sway,
        shy + Math.sin(a.a - 0.5) * reach * 0.4 - 3,
        s + 31,
        1.3,
      );
      ZS.wline(
        c,
        shx,
        shy,
        shx + Math.cos(a.a + 0.5) * reach + sway,
        shy + Math.sin(a.a + 0.5) * reach * 0.4 - 3,
        s + 37,
        1.3,
      );

      c.lineWidth = 1.1;
      c.fillStyle = "#8c2b1e";
      const ex = Math.cos(a.a),
        ey = Math.sin(a.a) * 0.5;
      c.beginPath();
      c.arc(hx - 1.7 + ex, hy - 0.5 + ey, 1, 0, 6.29);
      c.fill();
      c.beginPath();
      c.arc(hx + 1.7 + ex, hy - 0.5 + ey, 1, 0, 6.29);
      c.fill();
      ZS.wline(c, hx - 1.5, hy + 2, hx + 1.5, hy + 2.5, s + 41, 0.5);

      if (a.flash > 0) {
        c.strokeStyle = "rgba(150,40,30," + Math.min(0.8, a.flash).toFixed(2) + ")";
        c.lineWidth = 1.3;
        const r = 8 + (1 - a.flash) * 16;
        for (let i = 0; i < 7; i++) {
          const an = (i / 7) * 6.283 + a.ph;
          ZS.wline(
            c,
            a.x + Math.cos(an) * r * 0.4,
            a.y - 6 + Math.sin(an) * r * 0.4,
            a.x + Math.cos(an) * r,
            a.y - 6 + Math.sin(an) * r,
            s + i * 3,
            0.8,
          );
        }
      }
    }

    // the guard: the same skeleton as the zombie port in the guard's kit —
    // khaki instead of green, a cap, a weapon line for the armory level
    _soldierDraw(c, a, t) {
      const s = a.seed;
      const moving = Math.hypot(a.vx, a.vy);
      const sway = Math.sin(t * 3 + s) * 1.6 * 0.5;
      const hx = a.x + sway,
        hy = a.y - 15;
      const g = Math.sin(a.gait) * 3.2 * Math.min(1, moving / 25 + 0.3);

      c.strokeStyle = "rgba(40,35,25,0.14)";
      c.lineWidth = 1.2;
      ZS.wcirc(c, a.x, a.y + 6.5, 5.5, s + 3, 1.4);

      c.strokeStyle = "rgb(128,112,76)";
      c.lineWidth = 1.5;
      c.lineCap = "round";

      ZS.wline(c, a.x, a.y - 1, a.x + g + ZS.sjit(s) * 0.5, a.y + 6, s + 11, 1.2);
      ZS.wline(c, a.x, a.y - 1, a.x - g + ZS.sjit(s + 1) * 0.5, a.y + 6, s + 17, 1.2);
      ZS.wline(c, hx, hy + 4, a.x, a.y - 1, s + 23, 1.1);
      ZS.wcirc(c, hx, hy, 4.6, s + 29, 0.9);

      // arms: off-hand at the hip, weapon arm aimed at the threat
      const shx = hx,
        shy = hy + 6;
      const reach = 10 + Math.sin(t * 4 + a.ph) * 2;
      ZS.wline(
        c,
        shx,
        shy,
        shx - Math.cos(a.a) * 3 + sway,
        shy + Math.sin(a.a) * 3 * 0.4 + 3,
        s + 31,
        1.3,
      );
      const wl = [7, 9, 12][Math.min(2, this.up.weapon)]; // club / machete / barrel
      ZS.wline(
        c,
        shx,
        shy,
        shx + Math.cos(a.a) * reach + sway,
        shy + Math.sin(a.a) * reach * 0.4 - 3,
        s + 37,
        1.3,
      );
      ZS.wline(
        c,
        shx + Math.cos(a.a) * (reach - 4),
        shy + Math.sin(a.a) * (reach - 4) * 0.4 - 3,
        shx + Math.cos(a.a) * (reach - 4 + wl),
        shy + Math.sin(a.a) * (reach - 4 + wl) * 0.4 - 3,
        s + 39,
        1.4,
      );
      // muzzle flash while firing
      if (a.muz > 0) {
        c.strokeStyle = "rgba(190,150,60," + ((0.9 * a.muz) / 0.12).toFixed(2) + ")";
        c.lineWidth = 1.3;
        const fx = shx + Math.cos(a.a) * (reach - 2 + wl),
          fy = shy + Math.sin(a.a) * (reach - 2 + wl) * 0.4 - 3;
        ZS.wline(c, fx, fy, fx + Math.cos(a.a) * 6, fy + Math.sin(a.a) * 3 - 2, s + 40, 0.5);
      }

      // face + the khaki cap
      c.lineWidth = 1.1;
      c.fillStyle = "#8c2b1e";
      const ex = Math.cos(a.a),
        ey = Math.sin(a.a) * 0.5;
      c.beginPath();
      c.arc(hx - 1.7 + ex, hy - 0.5 + ey, 1, 0, 6.29);
      c.fill();
      c.beginPath();
      c.arc(hx + 1.7 + ex, hy - 0.5 + ey, 1, 0, 6.29);
      c.fill();
      ZS.wline(c, hx - 1.5, hy + 2, hx + 1.5, hy + 2.5, s + 41, 0.5);
      c.fillStyle = "rgba(148,132,76,0.85)";
      c.beginPath();
      c.arc(hx, hy - 1.4, 4.4, Math.PI, 0);
      c.closePath();
      c.fill();
      c.strokeStyle = "rgba(60,50,40,0.7)";
      c.lineWidth = 1;
      ZS.wline(c, hx - 4.8, hy - 1.4, hx + 4.8, hy - 1.4, s + 43, 0.4);

      if (a.flash > 0) {
        c.strokeStyle = "rgba(150,40,30," + Math.min(0.8, a.flash).toFixed(2) + ")";
        c.lineWidth = 1.3;
        const r = 8 + (1 - a.flash) * 16;
        for (let i = 0; i < 7; i++) {
          const an = (i / 7) * 6.283 + a.ph;
          ZS.wline(
            c,
            a.x + Math.cos(an) * r * 0.4,
            a.y - 6 + Math.sin(an) * r * 0.4,
            a.x + Math.cos(an) * r,
            a.y - 6 + Math.sin(an) * r,
            s + i * 3,
            0.8,
          );
        }
      }
    }
    // blocks are y-sorted with the trees/buildings/agents (draw.js pushes
    // them in; the block's bottom edge is the sort key)
    drawBlock(c, b, _t) {
      switch (b.kind) {
        case "wall":
        case "gate":
          this._wall(c, b, b.kind === "gate");
          break;
        case "yard":
          this._pile(c, b);
          break;
        case "farm":
          this._farm(c, b);
          break;
        case "barracks":
        case "workshop":
          this._hut(c, b, b.kind === "workshop");
          break;
        case "turret":
          this._turret(c, b);
          break;
        case "core":
          this._core(c, b);
          break;
      }
      // cracks: one scratch per damage tier
      const s0 = b.tx * 13.1 + b.ty * 7.7;
      c.strokeStyle = "rgba(60,50,40,0.6)";
      c.lineWidth = 1.2;
      for (let i = 0; i < b.cracks; i++) {
        const s = s0 + i * 31;
        const x = b.x0 + (b.x1 - b.x0) * (0.15 + 0.3 * H(s)),
          y = b.y0 + (b.by - b.y0) * (0.15 + 0.3 * H(s + 5));
        ZS.wline(c, x, y, x + 7 + ZS.sjit(s) * 3, y + 9 + ZS.sjit(s + 1) * 3, s, 1);
        ZS.wline(c, x + 3, y + 2, x + 1, y + 8, s + 2, 0.8);
      }
    }

    drawFX(c, fx) {
      const HAND = '"Segoe Print","Bradley Hand","Comic Sans MS",cursive';
      for (const f of fx) {
        if (f.kind === "x") {
          // the fallen: a fading X mark
          const k = 1 - f.t / 20;
          c.strokeStyle = "rgba(60,50,40," + (0.7 * (1 - k)).toFixed(2) + ")";
          c.lineWidth = 2;
          const r = 5 + k * 4;
          ZS.wline(c, f.x - r, f.y - r, f.x + r, f.y + r, f.x * 0.31, 0.8);
          ZS.wline(c, f.x + r, f.y - r, f.x - r, f.y + r, f.y * 0.29, 0.8);
          continue;
        }
        if (f.kind === "puff") {
          // a walker that regrouped at dawn: a small dissolving scribble
          const k = 1 - f.t / 0.5;
          c.strokeStyle = "rgba(90,80,60," + (0.55 * (1 - k)).toFixed(2) + ")";
          c.lineWidth = 1.2;
          ZS.wcirc(c, f.x, f.y, 4 + k * 12, f.x * 0.31, 1.1);
          continue;
        }
        if (f.kind === "gain") {
          // the kill scrap, floating up off the corpse
          const k = 1 - f.t / 1.2;
          c.fillStyle = "rgba(92,60,28," + (0.95 * (1 - k)).toFixed(2) + ")";
          c.font = "italic 13px " + HAND;
          c.textAlign = "center";
          c.fillText(f.txt, f.x, f.y - k * 22);
          c.textAlign = "left";
          continue;
        }
        if (f.kind === "combo") {
          // the click-combo tally, a small scribble of strokes at the hit
          const k = 1 - f.t / BAL.COMBO_WIN;
          c.strokeStyle = "rgba(150,40,30," + (0.8 * (1 - k)).toFixed(2) + ")";
          c.lineWidth = 1.3;
          for (let i = 0; i < f.n; i++)
            ZS.wline(
              c,
              f.x - 6 + i * 3.4,
              f.y + 2 + ZS.sjit(f.x + i) * 1.5,
              f.x - 6 + i * 3.4 + 1.5,
              f.y - 8,
              f.x * 0.37 + i,
              0.5,
            );
          continue;
        }
        if (f.kind !== "hit") continue;
        const k = 1 - f.t / 0.25;
        c.strokeStyle = "rgba(90,40,30," + (0.7 * (1 - k)).toFixed(2) + ")";
        c.lineWidth = 1.2;
        for (let i = 0; i < 3; i++)
          ZS.wline(c, f.x - 3 + i * 3, f.y + 2, f.x - 6 + i * 5, f.y - 4 - i, f.x * 0.37 + i, 0.6);
      }
    }

    /* ---------- input ---------- */

    // a quick click (no drag): place with a build tool, dig with a dig tool
    tap(_agents, _world, x, y, e) {
      if (e && e.button === 2) return; // RMB is dismantle (the contextmenu)
      if (this.phase !== "day" || !this.tiles) return;
      if (typeof this.tool === "string") this._placeAt(x, y);
      else this.digTo(x, y, null);
    }

    // Pointer hooks (main.js): the results card swallows any click; at
    // night a click on a walker is a hit (1 dmg × combo); in the day phase,
    // dragging the ground digs. Returning false hands the gesture back to
    // the camera pan; build tools never claim the pointer (placement goes
    // through the tap), so a drag with a build tool selected just pans.
    pointerDown(x, y) {
      if (this.card) {
        this._dismissCard();
        return true;
      }
      if (this.phase === "night" || this.phase === "dusk") return this._combatClick(x, y);
      if (this.phase !== "day" || typeof this.tool !== "number") return false;
      const n = this.digTo(x, y, null);
      this.px = x;
      this.py = y;
      return n > 0;
    }

    // click-combat (design §3.3): one hit on the walker under the cursor,
    // 1 dmg × the combo level. Misses (open ground) fall through to the pan.
    _combatClick(x, y) {
      let bz = null,
        bd = 1e9;
      for (const o of ZS.Sim.agents) {
        if (o.st !== ST.ZOMBIE || o.dead) continue;
        const d = Math.hypot(o.x - x, o.y - y);
        if (d < bd) {
          bd = d;
          bz = o;
        }
      }
      if (!bz || bd > 22) return false;
      const now = performance.now() / 1000;
      this.combo.n =
        now - this.combo.t <= BAL.COMBO_WIN ? Math.min(BAL.COMBO_MAX, this.combo.n + 1) : 1;
      this.combo.t = now;
      this._hitZombie(bz, BAL.CLICK_DMG * this.combo.n);
      this.fx.push({ t: BAL.COMBO_WIN, x: bz.x, y: bz.y - 12, kind: "combo", n: this.combo.n });
      return true;
    }

    pointerMove(x, y) {
      if (this.phase !== "day") return;
      this.digTo(x, y, { x: this.px, y: this.py });
      this.px = x;
      this.py = y;
    }

    pointerUp(_x, _y) {}

    _selectTool(t) {
      if (typeof t === "string" && UNLOCK[t] && this.day < UNLOCK[t]) {
        this.toast("unlocks on day " + UNLOCK[t]);
        return;
      }
      this.tool = t;
    }

    _placeAt(x, y) {
      const [tx, ty] = this.tiles.tileAt(x, y);
      const kind = this.tool;
      const un = UNLOCK[kind];
      if (un && this.day < un) {
        this.toast("unlocks on day " + un);
        return;
      }
      const cost = this._cost(kind);
      if (this.scrap < cost) {
        this.toast("not enough scrap (" + cost + ")");
        return;
      }
      const r = this.blocks.place(tx, ty, kind, REINF[this.up.reinforced]);
      if (!r.ok) {
        this.toast(r.err);
        return;
      }
      this.scrap -= cost;
      this.save();
    }

    _rightRemove(x, y) {
      if (this.phase !== "day" || !this.tiles) return;
      const [tx, ty] = this.tiles.tileAt(x, y);
      const b = this.blocks.at(tx, ty);
      if (!b || b.kind === "core") return;
      const refund = Math.floor(this._cost(b.kind) / 2);
      this.blocks.remove(b);
      this.scrap += refund;
      this.toast("dismantled · +" + refund);
      this.save();
    }

    /* ---------- digging (P1) ---------- */

    // dig one tile (from = null) or one stroke segment; returns tiles changed
    digTo(x, y, from) {
      if (typeof this.tool !== "number" || !this.tiles || this.dig < BAL.DIG_COST) return 0;
      const n = from
        ? this.tiles.stroke(from.x, from.y, x, y, this.tool)
        : this.tiles.set(Math.floor(x / T.TILE), Math.floor(y / T.TILE), this.tool);
      if (n > 0) this.dig = Math.max(0, this.dig - n * BAL.DIG_COST);
      return n;
    }

    /* ---------- economy ---------- */

    _count(kind) {
      let n = 0;
      for (const b of this.blocks.list) if (b.kind === kind) n++;
      return n;
    }

    _cost(kind) {
      const c = BAL.COST[kind];
      return Math.ceil(
        c.base *
          Math.pow(c.c, this._count(kind)) *
          Math.pow(BAL.WORKSHOP_DISC, this._count("workshop")),
      );
    }

    _upCost(k) {
      const u = UPG[k];
      return Math.ceil(u.base * Math.pow(this.day, 0.9));
    }

    _buyUp(k) {
      const u = UPG[k];
      if (this.up[k] >= u.max) return;
      const cost = this._upCost(k);
      if (this.scrap < cost) {
        this.toast("not enough scrap (" + cost + ")");
        return;
      }
      this.scrap -= cost;
      this.up[k]++;
      // armor: the whole ring wears the new kit (heal the difference)
      if (k === "armor") {
        const nh = this.soldierMaxHp();
        for (const a of this._soldiers()) {
          const gain = nh - a.maxHp;
          a.maxHp = nh;
          a.hp = Math.min(nh, a.hp + Math.max(0, gain));
        }
      }
      this.toast(u.name + " → level " + this.up[k]);
      this._refresh();
      this.save();
    }

    _upLabel(k) {
      const n = this.up[k] + 1;
      switch (k) {
        case "gloves":
          return "click +" + BAL.CLICK * Math.pow(2, n);
        case "weapon":
          return WEAPONS[n].name + " · " + WEAPONS[n].dmg + " dmg";
        case "armor":
          return "soldier HP " + [40, 70, 120][n];
        case "training":
          return "+" + 15 * n + "% dmg";
        case "morale":
          return "fight to " + Math.round(RETREAT[n] * 100) + "% HP";
        default:
          return "block HP ×" + REINF[n];
      }
    }

    _digMax() {
      return Math.min(BAL.DIG_CAP, BAL.DIG0 + (this.day - 1) * BAL.DIG_GROW);
    }

    toast(txt) {
      this.toastTxt = txt;
      this.toastT = 2.5;
    }

    startNight() {
      if (this.phase !== "day") return;
      this._planNight();
      this.phase = "dusk";
      this.phaseT = 0;
      this.toast("night " + this.day + " comes…");
      this.save();
    }

    // the night's wave schedule (design §5): 65% spread over the 90s, 35% as
    // 2–3 surge bursts. Deterministic in the night number (no RNG: the save
    // never has to remember a schedule mid-flight)
    _planNight() {
      const day = this.day;
      const total = Math.round(10 + day * 4 + Math.pow(day, 1.4));
      const spread = Math.round(total * 0.65);
      const surges = 2 + (H(day * 3.3) < 0.5 ? 0 : 1);
      const surgeN = Math.max(1, Math.floor((total - spread) / surges));
      const q = [];
      for (let i = 0; i < spread; i++)
        q.push({ t: ((i + 0.5) / spread) * BAL.NIGHT_LEN, surge: null });
      for (let s = 0; s < surges; s++) {
        const t0 = (0.2 + 0.55 * H(day * 7.1 + s * 2.3)) * BAL.NIGHT_LEN;
        for (let i = 0; i < surgeN; i++) q.push({ t: t0 + i * 0.2, surge: s });
      }
      q.sort((a, b) => a.t - b.t);
      this._sq = q;
      this._n = {
        kills: 0,
        blocks: 0,
        down: 0,
        scrap: 0,
        scrap0: this.scrap,
        food0: this.food,
        surged: {},
      };
    }

    _spawnWalker() {
      const p = this._spawnPoint();
      const z = this.makeAgent(p.x, p.y, ST.ZOMBIE);
      const hp = BAL.Z_HP * (1 + this.day * 0.12);
      z.hp = z.maxHp = hp;
      ZS.Sim.agents.push(z);
    }

    // walkers come from the map edge: a walkable spot 300–540px out from the
    // core, rejection-sampled (a full moat keeps them at the water's edge)
    _spawnPoint() {
      const c = this.blocks.core,
        w = this.tiles.cols * T.TILE,
        h = this.tiles.rows * T.TILE;
      const cx = c ? (c.x0 + c.x1) / 2 : w / 2,
        cy = c ? (c.y0 + c.by) / 2 : h / 2;
      for (let i = 0; i < 40; i++) {
        const an = ZS.rnd(0, 6.283),
          r = ZS.rnd(300, 540);
        const x = cx + Math.cos(an) * r,
          y = cy + Math.sin(an) * r;
        if (x < 40 || y < 40 || x > w - 40 || y > h - 40) continue;
        if (this.nav.isWalkable(x, y, true)) return { x, y };
      }
      return { x: cx + 320, y: cy + 320 };
    }

    // the night is over: a card at dawn. lost = the core fell (soft-fail,
    // design §7: lose 40% scrap + 30% food, the core is rebuilt free)
    _endNight(early, lost) {
      for (const a of ZS.Sim.agents)
        if (a.st === ST.ZOMBIE && !a.dead) {
          // what's left at dawn vanishes in a puff — they regroup
          a.dead = true;
          this.fx.push({ t: 0.5, x: a.x, y: a.y, kind: "puff" });
        }
      this._sq = [];
      const n = this._n || {
        kills: 0,
        blocks: 0,
        down: 0,
        scrap: 0,
        scrap0: this.scrap,
        food0: this.food,
      };
      if (early && !lost) {
        const bonus = Math.round(n.scrap * BAL.CLEAR_BONUS);
        if (bonus) this.scrap += bonus;
      }
      if (lost) {
        this.scrap = Math.floor(this.scrap * (1 - BAL.FAIL_SCRAP));
        this.food = Math.max(0, this.food * (1 - BAL.FAIL_FOOD));
        this.blocks.placeCore(); // the core is rebuilt free
      }
      const mod = this._nightMod(this.day + 1);
      this.card = {
        title: lost ? "night " + this.day + " lost" : "night " + this.day + " survived",
        lost,
        lines: [
          "kills " + n.kills + (early && !lost ? " · cleared early" : ""),
          "blocks lost " + n.blocks + " · soldiers down " + n.down,
          "scrap " +
            (this.scrap - n.scrap0 >= 0 ? "+" : "") +
            Math.round(this.scrap - n.scrap0) +
            " · food " +
            (this.food - n.food0 >= 0 ? "+" : "") +
            Math.round(this.food - n.food0),
          this._nextUnlock() || "",
          mod ? "tomorrow: " + mod.name + " (" + mod.desc + ")" : "tomorrow: clear skies",
        ].filter(Boolean),
      };
      this.phase = "dawn";
      this.phaseT = 0;
      this.paused = true; // the sim holds while the card is up
      this.save();
    }

    _dismissCard() {
      this.card = null;
      this.paused = false;
      this._newDay();
    }

    // ease the camera toward the core (dusk warning + the "⌂ core" button)
    _easeCore(dt, k) {
      const cam = ZS.debug && ZS.debug.cam,
        c = this.blocks && this.blocks.core;
      if (!cam || !c) return;
      const cx = (c.x0 + c.x1) / 2,
        cy = (c.y0 + c.by) / 2,
        f = Math.min(1, dt * k);
      cam.x += (cx - cam.x) * f;
      cam.y += (cy - cam.y) * f;
    }

    _newDay() {
      this.day += 1;
      this.dig = this._digMax();
      this.phase = "day";
      this.phaseT = 0;
      this._n = null;
      this._sq = [];
      this.toast("day " + this.day + " — dig " + this.dig);
      this.save();
    }

    // tonight's weather (design §5): from night 3, one every third night
    _nightMod(n) {
      if (n < 3 || (n - 3) % 3 !== 0) return null;
      return MODS[Math.floor(H(n * 7.77) * MODS.length)];
    }

    _zspd() {
      const m = this._nightMod(this.day);
      return BAL.Z_SPD * (m && m.spd ? m.spd : 1);
    }

    _srate(w) {
      const m = this._nightMod(this.day);
      return w.rate * (m && m.rate ? m.rate : 1);
    }

    // what the settlement unlocks next (the dawn card line)
    _nextUnlock() {
      let best = null;
      for (const k of BUILD_KINDS)
        if (UNLOCK[k] > this.day && (!best || UNLOCK[k] < UNLOCK[best])) best = k;
      return best ? "next: " + best + " (day " + UNLOCK[best] + ")" : null;
    }

    /* ---------- save / load ---------- */

    save() {
      if (this._wiped || !this.tiles || !this.blocks) return;
      const t = this.tiles,
        b = this.blocks;
      const tiles = [];
      for (let ty = 0; ty < t.rows; ty++)
        for (let tx = 0; tx < t.cols; tx++) {
          const tv = t.typeAt(tx, ty);
          if (tv !== 0) tiles.push([tx, ty, tv]);
        }
      const blocks = [];
      for (const bl of b.list) if (bl.kind !== "core") blocks.push([bl.tx, bl.ty, bl.kind, bl.hp]);
      try {
        localStorage.setItem(
          SAVE_KEY,
          JSON.stringify({
            v: 2,
            day: this.day,
            dig: Math.max(0, Math.ceil(this.dig)),
            scrap: Math.floor(this.scrap),
            food: Math.floor(this.food),
            coreHp: b.core ? b.core.hp : 0,
            tiles,
            blocks,
            up: this.up,
            soldiers: this._soldiers().map((a) => [
              Math.round(a.x),
              Math.round(a.y),
              Math.round(a.hp),
              a.slot,
            ]),
          }),
        );
      } catch {}
    }

    _load() {
      try {
        const s = JSON.parse(localStorage.getItem(SAVE_KEY));
        return s && s.v === 2 ? s : null;
      } catch {
        return null;
      }
    }

    // test hook (console / Playwright): a walker at world (x, y)
    debugSpawnZombie(x, y) {
      const a = this.makeAgent(x, y, ST.ZOMBIE);
      ZS.Sim.agents.push(a);
      return a;
    }

    // test hook: a soldier at world (x, y) in the first free slot
    debugSpawnSoldier(x, y) {
      const a = this.makeAgent(x, y, ST.SOLDIER);
      a.slot = this.freeSlot();
      a.maxHp = this.soldierMaxHp();
      a.hp = a.maxHp;
      ZS.Sim.agents.push(a);
      return a;
    }

    /* ---------- the zombie AI: chew through whatever stands nearest ---------- */

    _zombie(a, dt, t, _grid, nav) {
      const B = this.blocks;
      const mod = this._nightMod(this.day);
      const perc = BAL.Z_PERC * (mod && mod.sight ? mod.sight : 1);
      const spd = this._zspd();
      // the meal: the nearest chewable thing — a block (the core included)
      // or a soldier standing in the way
      let best = null, // a block
        prey = null, // a soldier
        bd = 1e9;
      for (const b of B.list) {
        const d = rectDist(b, a.x, a.y);
        if (d < bd) {
          bd = d;
          best = b;
          prey = null;
        }
      }
      for (const o of ZS.Sim.agents) {
        if (o.st !== ST.SOLDIER || o.dead) continue;
        const d = Math.hypot(o.x - a.x, o.y - a.y);
        if (d < bd) {
          bd = d;
          best = null;
          prey = o;
        }
      }
      if ((!best && !prey) || bd >= perc) {
        // nothing in sight: march on the settlement itself
        const c = B.core;
        if (c) {
          const ap = this._approach(a, c, nav);
          if (ap) {
            ZS.planAndFollow(a, ap, true, spd, dt, t, nav);
            return;
          }
        }
        ZS.wander(a, dt);
        return;
      }
      const cx = prey ? prey.x : (best.x0 + best.x1) / 2,
        cy = prey ? prey.y : (best.y0 + best.by) / 2;
      a.a = Math.atan2(cy - a.y, cx - a.x); // face the meal
      if (bd <= BAL.Z_REACH) {
        a.wantMove = false;
        a.atkT -= dt;
        if (a.atkT <= 0) {
          a.atkT = BAL.Z_ATK_CD;
          this.fx.push({ t: 0.25, x: a.x, y: a.y - 6, kind: "hit" });
          if (prey) this._hitSoldier(prey);
          else {
            const dead = B.damage(best, BAL.Z_DMG);
            if (dead) {
              if (best.kind === "core") this.toast("the core has fallen…");
              else if (this.phase === "night" && this._n) this._n.blocks++;
            }
          }
        }
        return;
      }
      if (prey) {
        ZS.planAndFollow(a, { x: prey.x, y: prey.y }, true, spd, dt, t, nav);
        return;
      }
      const ap = this._approach(a, best, nav);
      if (ap) ZS.planAndFollow(a, ap, true, spd, dt, t, nav);
      else a.wantMove = false;
    }

    // approach point: a walkable cell on the ring around the footprint that
    // is in reach of the block's edge (nearest such, else the best tradeoff)
    _approach(a, b, nav) {
      let best = null,
        bs = 1e9;
      for (let ty = b.ty - 1; ty <= b.ty + b.h; ty++)
        for (let tx = b.tx - 1; tx <= b.tx + b.w; tx++) {
          if (tx >= b.tx && tx < b.tx + b.w && ty >= b.ty && ty < b.ty + b.h) continue;
          if (!this.blocks.inGrid(tx, ty)) continue;
          const x = (tx + 0.5) * T.TILE,
            y = (ty + 0.5) * T.TILE;
          if (!nav.isWalkable(x, y, true)) continue;
          const rd = rectDist(b, x, y);
          const wd = Math.hypot(x - a.x, y - a.y);
          const score = (rd <= BAL.Z_REACH ? 0 : 1000) + wd + rd;
          if (score < bs) {
            bs = score;
            best = { x, y };
          }
        }
      return best;
    }

    /* ---------- the soldier ring: hold the line, engage, re-slot ---------- */

    _soldiers() {
      const out = [];
      for (const a of ZS.Sim.agents) if (a.st === ST.SOLDIER && !a.dead) out.push(a);
      return out;
    }

    soldierCap() {
      return BAL.CAP0 + BAL.CAP_PER * this._count("barracks");
    }

    soldierMaxHp() {
      return [40, 70, 120][this.up.armor];
    }

    // ring geometry: N slots on a circle 3 tiles out from the core
    slotPos(i, n) {
      const c = this.blocks.core;
      const cx = (c.x0 + c.x1) / 2,
        cy = (c.y0 + c.by) / 2,
        an = (i / Math.max(1, n)) * Math.PI * 2 - Math.PI / 2;
      return { x: cx + Math.cos(an) * BAL.RING_R, y: cy + Math.sin(an) * BAL.RING_R };
    }

    freeSlot() {
      const used = new Set(this._soldiers().map((a) => a.slot));
      for (let i = 0; i < this.soldierCap(); i++) if (!used.has(i)) return i;
      return 0;
    }

    spawnSoldier(b) {
      const cx = (b.x0 + b.x1) / 2,
        cy = (b.y0 + b.by) / 2;
      const a = this.makeAgent(cx + ZS.rnd(-8, 8), cy + ZS.rnd(-8, 8), ST.SOLDIER);
      a.slot = this.freeSlot();
      a.maxHp = this.soldierMaxHp();
      a.hp = a.maxHp;
      ZS.Sim.agents.push(a);
    }

    _soldier(a, dt, t, grid, nav) {
      const w = WEAPONS[this.up.weapon];
      const ret = RETREAT[this.up.morale];
      const wounded = ret > 0 && a.hp / a.maxHp <= ret;
      // nearest zombie in earshot
      let bz = null,
        bd = 1e9;
      grid.query(a.x, a.y, 320, (o) => {
        if (o.st !== ST.ZOMBIE || o.dead) return;
        const d = Math.hypot(o.x - a.x, o.y - a.y);
        if (d < bd) {
          bd = d;
          bz = o;
        }
      });
      if (bz && bd <= w.range + (wounded ? 0 : 20)) {
        // engage: intercept, then fire
        a.a = Math.atan2(bz.y - a.y, bz.x - a.x);
        if (bd > w.range) {
          ZS.planAndFollow(a, { x: bz.x, y: bz.y }, false, 100, dt, t, nav);
        } else {
          a.wantMove = false;
          a.atkT -= dt;
          if (a.atkT <= 0) {
            a.atkT = 1 / this._srate(w);
            a.muz = 0.12;
            this._hitZombie(bz, w.dmg * (1 + 0.15 * this.up.training), w.splash);
          }
        }
        return;
      }
      // hold the ring (or fall back to it when wounded)
      const p = this.slotPos(a.slot, this.soldierCap());
      if (Math.hypot(p.x - a.x, p.y - a.y) > 8) ZS.planAndFollow(a, p, false, 85, dt, t, nav);
      else a.wantMove = false;
      if (bz) a.a = Math.atan2(bz.y - a.y, bz.x - a.x); // watch the horizon
    }

    _hitZombie(z, dmg, splash) {
      this.fx.push({ t: 0.25, x: z.x, y: z.y - 6, kind: "hit" });
      const kill = (o, d) => {
        o.hp -= d;
        o.flash = 1;
        if (o.hp <= 0 && !o.dead) this._killZombie(o);
      };
      kill(z, dmg);
      if (splash) {
        const r2 = splash * splash;
        for (const o of ZS.Sim.agents) {
          if (o === z || o.st !== ST.ZOMBIE || o.dead) continue;
          const dx = o.x - z.x,
            dy = o.y - z.y;
          if (dx * dx + dy * dy <= r2) kill(o, dmg);
        }
      }
    }

    // a zombie dies: the X mark, the kill scrap, the floating +N
    _killZombie(o) {
      o.dead = true;
      this.fx.push({ t: 20, x: o.x, y: o.y, kind: "x" });
      const m = this._nightMod(this.day);
      const reward = Math.round(BAL.KILL * (m && m.kill ? m.kill : 1));
      this.scrap += reward;
      this.fx.push({ t: 1.2, x: o.x, y: o.y - 16, kind: "gain", txt: "+" + reward });
      if (this.phase === "night" && this._n) {
        this._n.kills++;
        this._n.scrap += reward;
      }
    }

    _hitSoldier(s) {
      s.hp -= BAL.Z_DMG;
      s.flash = 1;
      if (s.hp <= 0 && !s.dead) {
        s.dead = true;
        this.fx.push({ t: 20, x: s.x, y: s.y, kind: "x" });
        if (this.phase === "night" && this._n) this._n.down++;
      }
    }

    /* ---------- block drawings ---------- */

    _wall(c, b, gate) {
      const s = b.tx * 13.1 + b.ty * 7.7;
      const x = b.x0 + 2,
        y = b.y0 + 2,
        w = b.x1 - b.x0 - 4,
        h = b.by - b.y0 - 4;
      c.fillStyle = "rgba(150,142,122,0.28)";
      c.fillRect(x, y, w, h);
      c.strokeStyle = "rgba(60,50,40,0.8)";
      c.lineWidth = 2;
      ZS.sketchRect(c, x, y, w, h);
      c.lineWidth = 1.1;
      ZS.wline(c, x + 3, y + h * 0.5, x + w - 3, y + h * 0.5, s + 3, 0.8);
      if (gate) {
        // the doorway: dark and open (humans pass, zombies chew)
        const dw = 14,
          dx = x + (w - dw) / 2;
        c.fillStyle = "rgba(50,42,34,0.4)";
        c.fillRect(dx, y + h - 16, dw, 16);
        c.strokeStyle = "rgba(60,50,40,0.8)";
        c.lineWidth = 1.4;
        c.beginPath();
        c.arc(dx + dw / 2, y + h - 16, dw / 2, Math.PI, 0);
        c.stroke();
      }
    }

    _pile(c, b) {
      const s = b.tx * 13.1 + b.ty * 7.7;
      const cx = (b.x0 + b.x1) / 2,
        cy = (b.y0 + b.by) / 2;
      c.fillStyle = "rgba(140,130,110,0.22)";
      c.beginPath();
      c.ellipse(cx, cy + 4, 13, 9, 0, 0, 6.29);
      c.fill();
      c.strokeStyle = "rgba(70,60,45,0.7)";
      c.lineWidth = 1.4;
      ZS.wcirc(c, cx - 5, cy + 3, 5.5, s + 1, 0.8);
      ZS.wcirc(c, cx + 5, cy + 4, 5, s + 2, 0.8);
      ZS.wcirc(c, cx, cy - 2, 5.5, s + 3, 0.8);
      ZS.wline(c, cx - 13, cy + 11, cx + 13, cy + 11, s + 4, 0.8);
    }

    _farm(c, b) {
      const s = b.tx * 13.1 + b.ty * 7.7;
      const x = b.x0 + 4,
        y = b.y0 + 4,
        w = b.x1 - b.x0 - 8,
        h = b.by - b.y0 - 8;
      c.fillStyle = "rgba(122,148,84,0.25)";
      c.fillRect(x, y, w, h);
      c.strokeStyle = "rgba(60,50,40,0.7)";
      c.lineWidth = 1.4;
      ZS.sketchRect(c, x, y, w, h);
      // crop rows
      c.lineWidth = 1.1;
      c.strokeStyle = "rgba(95,120,60,0.8)";
      for (let i = 1; i <= 3; i++)
        ZS.wline(c, x + 3, y + (h * i) / 4, x + w - 3, y + (h * i) / 4, s + i, 0.7);
      // the little hut in the corner
      c.fillStyle = "rgba(160,145,115,0.5)";
      c.fillRect(x, y, 9, 7);
      c.lineWidth = 1.2;
      c.strokeStyle = "rgba(60,50,40,0.8)";
      ZS.sketchRect(c, x, y, 9, 7);
    }

    _hut(c, b, workshop) {
      const s = b.tx * 13.1 + b.ty * 7.7;
      const x = b.x0 + 6,
        y = b.y0 + 10,
        w = b.x1 - b.x0 - 12,
        h = b.by - b.y0 - 16;
      c.fillStyle = "rgba(160,145,115,0.3)";
      c.fillRect(x, y, w, h);
      c.strokeStyle = "rgba(60,50,40,0.8)";
      c.lineWidth = 1.6;
      ZS.sketchRect(c, x, y, w, h);
      c.lineWidth = 1.8;
      ZS.wline(c, x - 3, y, x + w / 2, y - 8, s + 1, 1);
      ZS.wline(c, x + w / 2, y - 8, x + w + 3, y, s + 2, 1);
      c.fillStyle = "rgba(50,42,34,0.35)";
      c.fillRect(x + w / 2 - 4, y + h - 11, 8, 11);
      if (workshop) {
        c.strokeStyle = "rgba(60,50,40,0.7)";
        c.lineWidth = 1.3;
        ZS.wline(c, x + 6, y + 9, x + 13, y + 3, s + 3, 0.5);
        c.fillStyle = "rgba(60,50,40,0.5)";
        c.fillRect(x + 10, y, 4, 5);
      }
    }

    _turret(c, b) {
      const s = b.tx * 13.1 + b.ty * 7.7;
      const cx = (b.x0 + b.x1) / 2,
        cy = (b.y0 + b.by) / 2;
      c.fillStyle = "rgba(150,142,122,0.3)";
      c.fillRect(cx - 9, cy - 7, 18, 14);
      c.strokeStyle = "rgba(60,50,40,0.8)";
      c.lineWidth = 1.5;
      ZS.wcirc(c, cx, cy, 9, s + 1, 1);
      c.lineWidth = 2.2;
      ZS.wline(c, cx, cy, cx + Math.cos(b.aim) * 15, cy + Math.sin(b.aim) * 15, s + 4, 0.5);
    }

    _core(c, b) {
      const s = b.tx * 13.1 + b.ty * 7.7;
      const x = b.x0 + 4,
        y = b.y0 + 4,
        w = b.x1 - b.x0 - 8,
        h = b.by - b.y0 - 8;
      c.fillStyle = "rgba(160,150,128,0.3)";
      c.fillRect(x, y, w, h);
      c.strokeStyle = "rgba(50,42,34,0.9)";
      c.lineWidth = 3;
      ZS.sketchRect(c, x, y, w, h);
      c.lineWidth = 1.2;
      ZS.sketchRect(c, x + 6, y + 6, w - 12, h - 12);
      c.fillStyle = "rgba(50,42,34,0.9)";
      for (let i = 0; i < 3; i++) c.fillRect(x + w * (0.15 + 0.32 * i) - 3, y - 5, 6, 5);
      c.strokeStyle = "rgba(50,42,34,0.9)";
      c.lineWidth = 1.4;
      ZS.wline(c, x + w - 9, y, x + w - 9, y - 14, s + 3, 0.5);
      c.fillStyle = "rgba(120,60,40,0.75)";
      c.beginPath();
      c.moveTo(x + w - 9, y - 14);
      c.lineTo(x + w + 1, y - 11);
      c.lineTo(x + w - 9, y - 8);
      c.closePath();
      c.fill();
    }

    /* ---------- panel + HUD ---------- */

    _panel() {
      const ui = document.getElementById("ui");
      if (!ui) return;
      ui.innerHTML =
        '<div class="pile" id="pile">scrap 0</div>' +
        '<div class="day" id="dayrow"></div>' +
        '<button id="night">darkness falls ▸</button>' +
        '<button id="core" title="return the camera to the core">⌂ core</button>' +
        '<button id="reset" title="wipe the save and start over">↻ start over</button>' +
        '<div class="lbl">build <span class="keys">b g y v f t w</span></div>' +
        '<div id="brows"></div>' +
        '<div class="lbl">upgrades</div>' +
        '<div id="urows"></div>' +
        '<div class="lbl">dig <span class="keys">1-4</span></div>' +
        '<div id="drows"></div>' +
        '<div class="hint">LMB: dig / place · RMB: dismantle (½ scrap)<br>0 / esc: pan · night: LMB hit walkers (combo)</div>' +
        '<div class="toast" id="toast"></div>';
      const brows = ui.querySelector("#brows");
      const drows = ui.querySelector("#drows");
      const urows = ui.querySelector("#urows");
      for (const k of BUILD_KINDS) {
        const d = document.createElement("div");
        d.className = "row";
        d.dataset.kind = k;
        d.innerHTML = "<span>" + k + "</span><span class='prod'></span><span class='cost'></span>";
        d.onclick = () => this._selectTool(k);
        brows.appendChild(d);
        this._brows[k] = d;
      }
      for (const k of Object.keys(UPG)) {
        const d = document.createElement("div");
        d.className = "row";
        d.dataset.up = k;
        d.innerHTML =
          "<span>" + UPG[k].name + "</span><span class='prod'></span><span class='cost'></span>";
        d.onclick = () => this._buyUp(k);
        urows.appendChild(d);
        this._urows[k] = d;
      }
      DIG_TOOLS.forEach((tt, i) => {
        const d = document.createElement("div");
        d.className = "row";
        d.dataset.tool = tt;
        d.innerHTML = "<span>" + (i + 1) + " · " + TOOL_NAME[tt] + "</span>";
        d.onclick = () => this._selectTool(tt);
        drows.appendChild(d);
        this._drows[tt] = d;
      });
      this._el = {
        pile: ui.querySelector("#pile"),
        dayrow: ui.querySelector("#dayrow"),
        night: ui.querySelector("#night"),
        core: ui.querySelector("#core"),
        reset: ui.querySelector("#reset"),
        toast: ui.querySelector("#toast"),
      };
      this._el.night.onclick = () => this.startNight();
      this._el.core.onclick = () => {
        this._coreEase = 2.5;
      };
      // two-stage: a stray click must not burn a long run
      this._el.reset.onclick = () => {
        const b = this._el.reset;
        if (b.classList.contains("warn")) {
          this._wiped = true; // stop the beforeunload autosave from restoring
          try {
            localStorage.removeItem(SAVE_KEY);
          } catch {}
          location.reload();
          return;
        }
        b.classList.add("warn");
        b.textContent = "really? click again";
        clearTimeout(this._resetT);
        this._resetT = setTimeout(() => {
          b.classList.remove("warn");
          b.textContent = "↻ start over";
        }, 2500);
      };
      this._el.pile.addEventListener("mousedown", (e) => {
        e.preventDefault();
        this.scrap += BAL.CLICK * Math.pow(2, this.up.gloves);
        this._pulse();
      });
      setInterval(() => this._refresh(), 150);
    }

    _refresh() {
      const el = this._el;
      if (!el || !this.tiles) return;
      el.pile.textContent = "scrap " + Math.floor(this.scrap);
      if (this.phase !== "day") {
        // night: what was the canvas HUD's stats line (left + countdown)
        // joins kills/down; the weather mod rides along when present
        let left = this._sq.length;
        for (const a of ZS.Sim.agents) if (a.st === ST.ZOMBIE && !a.dead) left++;
        const s = Math.max(0, Math.ceil(BAL.NIGHT_LEN - this.nightT));
        const mod = this._nightMod(this.day);
        el.dayrow.textContent =
          "night " +
          this.day +
          " · left " +
          left +
          " · " +
          Math.floor(s / 60) +
          ":" +
          String(s % 60).padStart(2, "0") +
          " · kills " +
          (this._n ? this._n.kills : 0) +
          " · down " +
          (this._n ? this._n.down : 0) +
          (mod ? " · " + mod.name : "");
        el.night.textContent = "night in progress…";
      } else {
        const tn =
          this.tool === null
            ? "pan"
            : typeof this.tool === "string"
              ? this.tool
              : TOOL_NAME[this.tool];
        el.dayrow.textContent =
          "day " +
          this.day +
          " · dig " +
          Math.max(0, Math.ceil(this.dig)) +
          " / " +
          this._digMax() +
          " · food " +
          Math.floor(this.food) +
          " · " +
          tn;
        el.night.textContent = "darkness falls ▸";
      }
      el.night.disabled = this.phase !== "day";
      for (const k of BUILD_KINDS) {
        const row = this._brows[k];
        const un = UNLOCK[k] && this.day < UNLOCK[k];
        const cost = this._cost(k);
        const costEl = row.querySelector(".cost");
        costEl.textContent = un ? "day " + UNLOCK[k] : String(cost);
        costEl.className = "cost" + (!un && this.scrap < cost ? " no" : "");
        const cnt = this._count(k);
        row.querySelector(".prod").textContent =
          k === "yard" && cnt > 0
            ? "+" + (BAL.YIELD.yard * cnt).toFixed(1) + "/s"
            : k === "farm" && cnt > 0
              ? "+" + (BAL.YIELD.farm * cnt).toFixed(1) + " food/s"
              : k === "barracks" && cnt > 0
                ? "cap " + this.soldierCap() + " · " + this._soldiers().length
                : "";
        row.className = "row" + (un ? " lock" : "") + (this.tool === k ? " on" : "");
      }
      for (const tt of DIG_TOOLS)
        this._drows[tt].className = "row" + (this.tool === tt ? " on" : "");
      for (const k of Object.keys(UPG)) {
        const u = UPG[k],
          row = this._urows[k],
          maxed = this.up[k] >= u.max;
        row.querySelector(".prod").textContent = maxed ? "max" : this._upLabel(k);
        const cost = this._upCost(k);
        const costEl = row.querySelector(".cost");
        costEl.textContent = maxed ? "" : String(cost);
        costEl.className = "cost" + (!maxed && this.scrap < cost ? " no" : "");
        row.className = "row" + (maxed ? " lock" : "");
      }
      el.toast.textContent = this.toastT > 0 ? this.toastTxt : "";
    }

    _pulse() {
      const p = this._el && this._el.pile;
      if (!p) return;
      p.classList.remove("sq");
      void p.offsetWidth;
      p.classList.add("sq");
    }

    _toolName() {
      if (this.tool === null) return "pan";
      if (typeof this.tool === "string") {
        const un = UNLOCK[this.tool] && this.day < UNLOCK[this.tool];
        return this.tool + " (" + (un ? "day " + UNLOCK[this.tool] : this._cost(this.tool)) + ")";
      }
      return TOOL_NAME[this.tool];
    }

    hud(_agents, _wave) {
      // the stats live in the DOM panel (top-left) — the canvas keeps only
      // the bottom hint and the phase overlays
      const mod = this.phase !== "day" ? this._nightMod(this.day) : null;
      return {
        hidden: true,
        hint:
          this.phase !== "day"
            ? "LMB: hit the walkers (fast clicks combo) · drag: pan · wheel: zoom"
            : "b g y v f t w: build · 1-4: dig · 0/esc: pan · LMB dig/place · RMB dismantle",
        overlay: () => {
          if (this.card) return { card: this.card };
          if (this.phase === "dusk")
            return {
              main: "NIGHT " + this.day,
              sub: mod ? mod.name + " — " + mod.desc : "darkness falls…",
              big: true,
            };
          if (this.phase === "night" && this.nightT < 4)
            return {
              main: "NIGHT " + this.day,
              sub: mod ? mod.name : "",
              fade: 1 - this.nightT / 4,
            };
          if (this.phase === "dawn")
            return { main: "dawn", sub: "day " + (this.day + 1) + " — dig refreshed" };
          return null;
        },
      };
    }
  }

  ZS.ScenarioHold = ScenarioHold;
})();
