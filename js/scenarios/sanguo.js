/* SCENARIO PACK: 火柴三國 — the real-time battle (SANGUO-DESIGN.md §4.4)
 *
 * Cannae taught this engine how to fight a large battle; this pack keeps the
 * machinery and takes the script away. In `cannae.js` every unit runs a baked
 * step list — HOLD, ADV, CHARGE — and the famous shape emerges from it. Here
 * the steps come from the player (js/battle/command.js) on one side and a
 * small planner on the other, and the shape is whatever the two commanders
 * make of it.
 *
 * What is inherited: the slot-in-a-formation body, the unit centroid drive,
 * local combat (nearest enemy in reach), local morale, the rout / flee-to-the-
 * edge / hunt cycle, and the scenario contract itself.
 *
 * What is new here:
 *   - orders instead of a script; a queue per unit, issued live
 *   - formations as data (js/battle/formation.js), changeable mid-fight
 *   - flow-field group movement (js/battle/flowfield.js) instead of per-agent A*
 *   - unit types by weapon silhouette (§7.3), drawn through ZS.figure (§7)
 *   - determinism: one seeded ZS.rng32 stream, no bare Math.random anywhere in
 *     the sim, so a battle replays exactly from (seed, army, order log) (§3.6)
 *
 * The pack is driven by a BattleSetup (§4.3) — the same record the campaign
 * will hand it at P4. P1 builds a default skirmish one.
 *
 * Core-owned agent fields (don't clobber): x y vx vy a st seed gait id
 * wantMove dead free gone path pi gx gy navV0 planFailT stuckT wx wt px py
 * bld, plus flash / say / sayT.
 */
(() => {
  "use strict";
  const ZS = (window.ZS = window.ZS || {});

  const F = () => ZS.figure;

  /* ---------- unit states ---------- */

  const HOLD = 0, // stand and fight what comes
    MOVE = 1, // march to a point, ignore what you pass
    ATTACK = 2, // march to a point, stop and fight what you meet
    CHARGE = 3, // run at a point; the impact is the point
    ROUT = 4; // broken

  /* ---------- per-type tuning ---------- */
  /* index = ZS.figure type: SPEAR, DAO, BOW, JI, CAV, HBOW */

  /* Hit points are the main pacing lever. Cannae's numbers (3-4) resolve a
     781-man battle by annihilation in 60-100 s; this pack ends on the rout
     instead, which arrives sooner, so men take a little more killing to land
     inside the design's 60-180 s window (§1). */
  const HP = [5, 6, 3, 5, 7, 4];
  const REACH = [21, 17, 16, 24, 20, 16]; // melee reach; 戟 outranges 槍 outranges 刀
  const ATK_CD = [0.8, 0.62, 0, 0.9, 0.5, 0];
  const DMG = [1, 1, 1, 1, 2, 1];
  const SPD = [64, 70, 72, 60, 132, 140]; // walking cap
  const CHARGE_SPD = [96, 104, 0, 92, 180, 150];
  const FLEE_SPD = [116, 120, 124, 112, 152, 156];
  const SEP_SLOT = 58; // how hard a man seeks his slot when not fighting

  /* 弩兵 / 弓騎兵: ranged */
  const SHOOT_R = [0, 0, 230, 0, 0, 170];
  const SHOOT_CD = [0, 0, 2.1, 0, 0, 1.8];
  const SHOOT_MIN = [0, 0, 60, 0, 0, 55]; // back off inside this

  /* 槍 beats 騎: a spear wall doubles damage against a mounted charge. */
  const ANTI_CAV = [2, 1, 1, 2.2, 1, 1];

  const EXIT_PAD = 30;
  const HUNT_FRAC = 0.65;
  const HUNT_R = 900;
  const HUNT_CD = 0.7;
  const ARRIVE = 26; // unit centroid within this = the order is done
  const SLOT_PAD = 30; // no slot is ever placed closer than this to a map edge
  const STALL_GIVEUP = 12; // seconds of no progress before an order is dropped
  const STALEMATE = 45; // seconds without a casualty before the field is called
  const STALEMATE_EDGE = 0.1; // strength gap below which a called field is a draw

  const TG = { x: 0, y: 0 }; // scratch: no per-frame allocation
  const FLOW = { x: 0, y: 0 };

  /* A default skirmish, used when nothing hands us a BattleSetup (§4.3). */
  function defaultSetup(seed) {
    const comp = { spear: 0.42, dao: 0.24, crossbow: 0.2, cav: 0.14 };
    return {
      seed: seed | 0 || 20250830,
      field: { kind: "open", terrain: "plain", biome: "central" },
      sides: [
        {
          factionId: 0,
          comp,
          onField: 320,
          reserve: 0,
          generals: [
            {
              id: "fire_general",
              name: "battle.general.fire",
              wu: 82,
              tong: 86,
              zhi: 74,
              unitType: "dao",
            },
          ],
        },
        {
          factionId: 1,
          comp,
          onField: 320,
          reserve: 0,
          generals: [
            {
              id: "edge_general",
              name: "battle.general.edge",
              wu: 88,
              tong: 82,
              zhi: 78,
              unitType: "cav",
            },
          ],
        },
      ],
      objective: "rout",
    };
  }

  class ScenarioSanguo {
    constructor(setup) {
      this.setup = setup || null;
      this.fx = null; // set by the engine: the core's effect record array
      this.stains = null;
      this.units = [];
      this.generals = [];
      this.sides = [];
      this.sepR = 13; // packed ranks sit at slot spacing (inherited from Cannae)
      this.hudFont = ZS.CJK_STACK; // the HUD is Chinese; draw.js asks for this
      this.t0 = null;
      this.bt = 0;
      this.over = false;
      this.result = -1;
      this.stalemate = false;
      this.lastBloodT = 0;
      this.w = 0;
      this.h = 0;
      this.paused = false;
      this.rng = null;
      this.nextUid = 1;
      this.orderLog = []; // (t, unit, order) — the replay record (§3.6)
      this.morale = null;
      this.abilities = null;
    }

    /* ---------- deterministic randomness (§3.6) ---------- */

    /* Every roll in the sim comes through here. A bare Math.random() anywhere
       below would silently break replay, so there are none. */
    rnd(a, b) {
      const v = this.rng();
      return a === undefined ? v : a + v * ((b === undefined ? 1 : b) - a);
    }

    /* ---------- contract: setup ---------- */

    attachStains(st) {
      this.stains = st;
      st.register("cut", (sc, x, y, seed) => {
        const rot = ZS.hash(seed) * Math.PI * 2;
        const len = 7 + ZS.hash(seed + 1) * 6;
        sc.strokeStyle = "rgba(122,42,36," + (0.35 + ZS.hash(seed + 2) * 0.2) + ")";
        sc.lineWidth = 2.5;
        ZS.wline(
          sc,
          x - Math.cos(rot) * len * 0.5,
          y - Math.sin(rot) * len * 0.5,
          x + Math.cos(rot) * len * 0.5,
          y + Math.sin(rot) * len * 0.5,
          seed,
          1.2,
        );
        const n = 3 + ((ZS.hash(seed + 3) * 3) | 0);
        for (let i = 0; i < n; i++) {
          const an = ZS.hash(seed + 10 + i) * 6.283;
          const d = ZS.hash(seed + 20 + i) * 10;
          st.fillBlob(
            x + Math.cos(an) * d,
            y + Math.sin(an) * d,
            0.7 + ZS.hash(seed + 30 + i) * 1.3,
            seed + 40 + i,
            "rgba(92,30,26," + (0.4 + ZS.hash(seed + 30 + i) * 0.2) + ")",
          );
        }
      });
      st.register("corpse", (sc, a) => {
        const seed = a.seed;
        const rot = ZS.hash(seed) * 6.283;
        const pts = [];
        const nPts = 7 + ((ZS.hash(seed + 1) * 3) | 0);
        const radius = 12 + ZS.hash(seed + 2) * 5;
        for (let i = 0; i < nPts; i++) {
          const an = (i / nPts) * 6.283 + rot;
          const rr = radius * (0.8 + ZS.hash(seed + 10 + i) * 0.4);
          pts.push({ x: a.x + Math.cos(an) * rr * 1.25, y: a.y + Math.sin(an) * rr * 0.8 });
        }
        sc.fillStyle = "rgba(112,38,32,0.28)";
        ZS.wpoly(sc, pts, seed + 20, 2, true);
        sc.fill();
        sc.strokeStyle = "rgb(70,58,48)";
        sc.lineWidth = 2;
        const hx = a.x + Math.cos(rot) * 13,
          hy = a.y + Math.sin(rot) * 13;
        const tx = a.x - Math.cos(rot) * 12,
          ty = a.y - Math.sin(rot) * 12;
        ZS.wline(sc, hx, hy, tx, ty, seed + 100, 1.5);
        ZS.wcirc(sc, hx, hy, 4.2, seed + 101, 0.7);
        ZS.wline(
          sc,
          hx,
          hy,
          hx + Math.cos(rot + 1.4) * 9,
          hy + Math.sin(rot + 1.4) * 9,
          seed + 102,
          1.2,
        );
        ZS.wline(
          sc,
          hx,
          hy,
          hx + Math.cos(rot - 1.4) * 9,
          hy + Math.sin(rot - 1.4) * 9,
          seed + 103,
          1.2,
        );
        ZS.wline(
          sc,
          tx,
          ty,
          tx + Math.cos(rot + 2.5) * 10,
          ty + Math.sin(rot + 2.5) * 10,
          seed + 104,
          1.2,
        );
        ZS.wline(
          sc,
          tx,
          ty,
          tx + Math.cos(rot - 2.5) * 10,
          ty + Math.sin(rot - 2.5) * 10,
          seed + 105,
          1.2,
        );
        // the dropped shield keeps the faction read on the ground
        const sx = a.x + Math.cos(rot + 1.9) * 16,
          sy = a.y + Math.sin(rot + 1.9) * 16;
        sc.fillStyle = F().wash(a.faction, 0.28);
        sc.strokeStyle = "rgb(80,70,60)";
        sc.lineWidth = 1.3;
        ZS.wcirc(sc, sx, sy, 5.5, seed + 110, 0.8);
        sc.fill();
        sc.stroke();
      });
    }

    /* `open`: a clean plain, and deliberately nothing else yet.

       Water and a town were both tried here first and both were wrong for a
       skirmish. `world.water()` only runs its pinned, scenario-placed path
       when *both* `riverBaseX` and `lake` are given; with one of them missing
       it falls through to the generative branch, which laid a river diagonally
       across the middle of the battlefield. Two armies then deploy on opposite
       banks, and remnants that drift into the water get pinned there by the
       core's walkability clamp with no way back — a battle that can never end.

       So `open` is open. The river, hills and forest that §4.3 wants under
       this field kind come back at P4 alongside `town` (ZS.Buildings, the
       Outbreak) and `fort` (ZS.Tiles + blocks, the Hold), by which point the
       flow field routes around them and the deployment respects them.
       `_findField` already searches for dry ground, so it is ready for that. */
    terrain(world, _nav) {
      world.towns = [];
      world.layoutForest({ none: true });
      world.placeAllTrees({
        grovePos: [
          { x: 240, y: 380 },
          { x: world.w - 280, y: 300 },
          { x: world.w - 300, y: world.h - 420 },
        ],
      });
    }

    /* ---------- contract: agents ---------- */

    makeAgent(x, y, st, extra) {
      return {
        x,
        y,
        a: extra.head || 0,
        vx: 0,
        vy: 0,
        st,
        seed: this.rnd(0, 997),
        gait: 0,
        id: 0,
        wantMove: false,
        dead: false,
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
        flash: 0,
        say: null,
        sayT: 0,
        sayMax: 0,
        // sanguo fields
        side: extra.side,
        faction: extra.faction,
        type: extra.type,
        tier: extra.tier || 0,
        un: extra.un,
        sx: extra.sx,
        sy: extra.sy, // slot offsets, unit-local (+x right, +y forward)
        sx2: 0,
        sy2: 0, // slot world position (scratch)
        hp: extra.hp,
        hp0: extra.hp,
        atkCd: this.rnd(0, 0.4),
        atk: 0,
        thrCd: this.rnd(0, 0.6),
        thr: 0,
        hitCd: 0,
        routFlag: 0,
        fleeing: false,
        rallyT: 0,
        morT: this.rnd(0, 0.5),
        fatigue: 0,
        fdirC: -999,
        fdir: 0,
        name: extra.name || null,
        auraR: extra.auraR || 0,
        general: !!extra.general,
        generalId: extra.generalId || null,
        wu: extra.wu || 0,
        tong: extra.tong || 0,
        zhi: extra.zhi || 0,
        commandLost: false,
      };
    }

    hostile(_a) {
      return false; // open field: nobody needs the A* budget
    }

    walkBlocked(_a) {
      return true;
    }

    maxSpeed(a) {
      if (a.fleeing) return FLEE_SPD[a.type];
      const u = this.units[a.un];
      const base = u && u.st === CHARGE ? CHARGE_SPD[a.type] || SPD[a.type] : SPD[a.type];
      // fatigue costs up to a third of the top speed
      const nerve = u && u.morState === ZS.BattleMorale.WAVERING ? 0.82 : 1;
      return base * nerve * (1 - 0.33 * Math.min(1, a.fatigue));
    }

    /* ---------- orders (the whole point of the pack) ---------- */

    /* The one door orders come through — the player's command layer and the
       enemy planner both call this, and it is what the replay log records. */
    order(unit, kind, x, y, opts) {
      if (!unit || unit.st === ROUT || this.over) return false;
      opts = opts || {};
      const o = { kind, x, y, form: opts.form || null };
      if (opts.queue && unit.orders.length) unit.orders.push(o);
      else {
        unit.orders.length = 0;
        unit.orders.push(o);
        this._beginOrder(unit, o);
      }
      this.orderLog.push({
        t: Math.round(this.bt * 100) / 100,
        u: unit.uid,
        k: kind,
        x: Math.round(x),
        y: Math.round(y),
        f: o.form,
      });
      return true;
    }

    setFormation(unit, kind) {
      if (!unit || unit.st === ROUT) return false;
      unit.form = kind;
      unit.slots = ZS.Formation.slots(kind, unit.mem.length, unit.formOpts);
      unit.reslot = 0;
      this.orderLog.push({ t: Math.round(this.bt * 100) / 100, u: unit.uid, k: "form", f: kind });
      return true;
    }

    useAbility(id, general) {
      return this.abilities ? this.abilities.use(id, general) : false;
    }

    _beginOrder(u, o) {
      u.tx = o.x;
      u.ty = o.y;
      u.st =
        o.kind === "hold"
          ? HOLD
          : o.kind === "charge"
            ? CHARGE
            : o.kind === "attack"
              ? ATTACK
              : MOVE;
      if (o.form && o.form !== u.form) this.setFormation(u, o.form);
      if (u.st === HOLD) {
        /* Halting empties the queue rather than occupying it. A hold order can
           never "complete" — the arrival test skips HOLD — so leaving it in
           place left the unit permanently carrying one, which reads as "busy"
           to anything that asks whether it has orders. */
        u.orders.length = 0;
        u.tx = u.cx;
        u.ty = u.cy;
        u.reach = true;
      } else {
        this._setGoal(u, o.x, o.y);
      }
    }

    /* The single place a unit's destination changes. Every goal gets its own
       Dijkstra pass, and the unit records whether the goal is reachable from
       where it stands.

       Both halves matter. Retargeting without rebuilding leaves the block
       steering down the *previous* goal's field, which is how a pursuit ended
       up grinding into the riverbank while its stated target sat on dry ground
       behind it. And a goal on the far side of water has to be admitted as
       unreachable rather than marched at forever — that is the whole reason
       the movement runs on a field instead of a straight line. */
    _setGoal(u, x, y) {
      if (!u.ff) u.ff = new ZS.FlowField(this._nav);
      if (!u.ff.isFor(x, y) && !u.ff.build(x, y)) {
        u.reach = false;
        return false;
      }
      /* Decide before committing: a refused goal must leave the unit's
         existing orders untouched, or a HOLD block ends up carrying a stale
         destination it will never march to. */
      if (u.ff.distAt(u.cx, u.cy) === Infinity) {
        u.reach = false;
        return false;
      }
      u.tx = x;
      u.ty = y;
      u.turn = Math.atan2(y - u.cy, x - u.cx);
      u.reach = true;
      u.best = Infinity; // a fresh goal gets a fresh progress watchdog
      u.stallT = 0;
      return true;
    }

    _nextOrder(u) {
      u.orders.shift();
      if (u.orders.length) this._beginOrder(u, u.orders[0]);
      else {
        u.st = HOLD;
        u.tx = u.cx;
        u.ty = u.cy;
        u.turn = u.head;
      }
    }

    /* ---------- contract: frame ---------- */

    frame(agents, dt, t, grid) {
      if (this.t0 === null) this.t0 = t;
      this.bt = t - this.t0;

      // routed men who leave the field are gone for good
      for (let i = 0; i < agents.length; i++) {
        const a = agents[i];
        if (
          a.free &&
          !a.dead &&
          !a.gone &&
          (a.x < -EXIT_PAD || a.x > this.w + EXIT_PAD || a.y < -EXIT_PAD || a.y > this.h + EXIT_PAD)
        ) {
          a.gone = true;
          this.sides[a.side].gone++;
        }
      }

      // Unit centroids, strength and average fatigue. Routing blocks keep a
      // centroid over their on-field fugitives so a nearby general can rally
      // them; gone men never come back.
      for (const u of this.units) {
        let sx = 0,
          sy = 0,
          n = 0,
          rsx = 0,
          rsy = 0,
          rn = 0,
          fatigue = 0;
        for (let i = 0; i < u.mem.length; i++) {
          const m = u.mem[i];
          if (m.dead || m.gone) continue;
          fatigue += m.fatigue;
          if (m.routFlag) {
            rsx += m.x;
            rsy += m.y;
            rn++;
          } else {
            sx += m.x;
            sy += m.y;
            n++;
          }
        }
        if (n) {
          u.cx = sx / n;
          u.cy = sy / n;
        } else if (rn) {
          u.cx = rsx / rn;
          u.cy = rsy / rn;
        }
        u.alive = n;
        u.routAlive = rn;
        u.avgFatigue = fatigue / Math.max(1, n + rn);
      }

      if (this.morale) this.morale.frame(dt);
      if (this.abilities) this.abilities.update(dt);

      // formations wheel toward their heading rather than snapping
      for (const u of this.units) {
        if (u.turn == null) continue;
        let d = u.turn - u.head;
        while (d > Math.PI) d -= 2 * Math.PI;
        while (d < -Math.PI) d += 2 * Math.PI;
        if (d > 0.01) u.head = Math.min(u.head + dt * 1.8, u.head + d);
        else if (d < -0.01) u.head = Math.max(u.head + dt * -1.8, u.head + d);
      }

      for (const u of this.units) {
        // "my front rank is fighting" — set by any member who lands a blow,
        // decayed here, read by an ATTACK order to know when to stop marching
        u.contact = Math.max(0, u.contact - dt);
        this._driveUnit(u, dt, grid);
      }

      for (const u of this.units) {
        if (u.st !== ROUT && u.alive === 0) u.st = ROUT;
      }

      if (!this.over) this._commanderAI(dt, grid);
      this._checkEnd();
    }

    /* Move the unit's centroid along its flow field, or hold. */
    _driveUnit(u, dt, grid) {
      if (u.st === ROUT) {
        u.dx *= 1 - Math.min(1, dt * 3);
        u.dy *= 1 - Math.min(1, dt * 3);
        return;
      }
      if (!u.alive) return;

      // re-solve slot assignment when the block has thinned enough to gap
      u.reslot -= dt;
      if (u.reslot <= 0) {
        u.reslot = 2.5;
        if (u.alive !== u.slotN) {
          ZS.Formation.assign(u.mem, u.slots, u.cx, u.cy, u.head);
          u.slotN = u.alive;
        }
      }

      // the winners hunt what is left of a broken enemy, or the field never clears
      const foe = this.sides[1 - u.side];
      if (
        u.st === HOLD &&
        !u.orders.length &&
        foe.total0 > 0 &&
        foe.dead + foe.routed >= foe.total0 * HUNT_FRAC
      ) {
        u.huntT -= dt;
        if (u.huntT <= 0) {
          u.huntT = HUNT_CD;
          let be = null,
            bd = HUNT_R * HUNT_R;
          grid.query(u.cx, u.cy, HUNT_R, (b) => {
            if (b.side === u.side || b.dead || !b.fleeing) return;
            const dx = b.x - u.cx,
              dy = b.y - u.cy;
            const d2 = dx * dx + dy * dy;
            if (d2 < bd) {
              bd = d2;
              be = b;
            }
          });
          if (be && this._setGoal(u, be.x, be.y)) {
            u.st = ATTACK;
            u.hunting = true;
          }
        }
      }

      const dx = u.tx - u.cx,
        dy = u.ty - u.cy;
      const d = Math.hypot(dx, dy);
      /* Nothing to march at: end the order so the next plan picks a target
         this unit can actually walk to. Re-read from the field rather than
         trusting the flag set when the order was issued — a block can be
         pushed into a pocket it cannot path out of after the fact, and one
         array index is cheaper than discovering it by never arriving. */
      if (u.st !== HOLD) {
        u.reach = !u.ff || u.ff.distAt(u.cx, u.cy) < Infinity;
        if (!u.reach) {
          u.hunting = false;
          this._nextOrder(u);
          return;
        }
      }
      /* Progress watchdog. A marching block that has come no closer to its
         goal for a while has met something the planner did not predict; drop
         the order so the next plan can try something else. Without this any
         future "unit wedged somewhere unexpected" bug becomes a battle that
         never ends, which is the worst way for one to fail. */
      if (u.st !== HOLD) {
        if (d < u.best - 4) {
          u.best = d;
          u.stallT = 0;
        } else {
          u.stallT += dt;
          if (u.stallT > STALL_GIVEUP) {
            u.hunting = false;
            this._nextOrder(u);
            return;
          }
        }
      }

      if (u.st !== HOLD && d < ARRIVE) {
        if (u.hunting) {
          u.hunting = false;
          u.st = HOLD;
          u.tx = u.cx;
          u.ty = u.cy;
        } else this._nextOrder(u);
        return;
      }

      // an ATTACK order stops the block once its front rank is in contact
      if (u.st === ATTACK && u.contact > 0) {
        u.dx *= 1 - Math.min(1, dt * 4);
        u.dy *= 1 - Math.min(1, dt * 4);
        return;
      }

      let spd = 0;
      if (u.st === MOVE || u.st === ATTACK) spd = u.typeSpd * 0.62;
      else if (u.st === CHARGE) spd = u.typeChargeSpd * 0.86;
      if (spd <= 0 || d <= 2) {
        u.dx *= 1 - Math.min(1, dt * 3);
        u.dy *= 1 - Math.min(1, dt * 3);
        return;
      }

      // direction: the flow field where it has an opinion, straight line
      // otherwise (open ground, or standing on the goal cell)
      let ux = dx / d,
        uy = dy / d;
      if (u.ff && u.ff.sample(u.cx, u.cy, FLOW)) {
        ux = FLOW.x;
        uy = FLOW.y;
      }
      const k = Math.min(1, dt * 1.6);
      u.dx += (ux * spd - u.dx) * k;
      u.dy += (uy * spd - u.dy) * k;
    }

    _breakUnit(u) {
      if (u.st === ROUT) return;
      u.st = ROUT;
      u.morState = ZS.BattleMorale.ROUTING;
      u.morale = Math.min(u.morale, u.moraleMax * 0.18);
      u.rallyProgress = 0;
      u.orders.length = 0;
      for (let i = 0; i < u.mem.length; i++) if (!u.mem[i].dead) this._setRout(u.mem[i]);
    }

    _rallyUnit(u) {
      if (u.st !== ROUT || !u.routAlive) return false;
      const side = this.sides[u.side];
      let rallied = 0;
      for (let i = 0; i < u.mem.length; i++) {
        const a = u.mem[i];
        if (a.dead || a.gone || !a.routFlag) continue;
        a.routFlag = 0;
        a.fleeing = false;
        a.free = false;
        a.rallyT = 6;
        a.fdirC = -999;
        a.vx *= 0.35;
        a.vy *= 0.35;
        side.routed--;
        side.alive++;
        rallied++;
      }
      if (!rallied) return false;
      u.st = HOLD;
      u.orders.length = 0;
      u.tx = u.cx;
      u.ty = u.cy;
      u.turn = u.head;
      u.alive = rallied;
      u.routAlive = 0;
      u.morState = ZS.BattleMorale.WAVERING;
      u.morale = Math.max(u.morale, u.moraleMax * 0.38);
      u.waveringT = 0;
      u.rallyProgress = 0;
      return true;
    }

    /* A side is beaten when nobody on it is still fighting: the men are dead,
       fled the field, or running. Cannae waits for literal annihilation; a
       skirmish that ends on the rout is the same story told at battle length.

       And a battle that neither side can finish still has to end. Two spent
       remnants that cannot reach or break each other would otherwise run for
       ever — so a field where nobody has fallen for STALEMATE seconds is
       called: the stronger remnant holds it, or it is a draw if they are
       evenly matched. `BattleResult.winner` already admits "draw" (§4.3). */
    _checkEnd() {
      if (this.over) return;
      for (let s = 0; s < 2; s++) {
        if (this.sides[s].total0 > 0 && this.sides[s].alive <= 0) {
          this._finish(1 - s);
          return;
        }
      }
      if (this.bt - this.lastBloodT > STALEMATE) {
        const a0 = this.sides[0].alive,
          a1 = this.sides[1].alive;
        const gap = Math.abs(a0 - a1) / Math.max(1, a0 + a1);
        this._finish(gap < STALEMATE_EDGE ? -1 : a0 > a1 ? 0 : 1, true);
      }
    }

    _finish(winner, stalemate) {
      this.over = true;
      this.result = winner;
      this.stalemate = !!stalemate;
      this.overT = this.bt;
      for (const u of this.units) {
        if (u.st === ROUT || u.side === 1 - winner) continue;
        u.st = HOLD;
        u.orders.length = 0;
        u.tx = u.cx;
        u.ty = u.cy;
        u.turn = null;
      }
    }

    /* ---------- the enemy commander (P1: deliberately simple) ---------- */

    /* P2 replaces this with an influence map feeding a behaviour tree (§4.4).
       For now: march at the nearest enemy unit, charge when close, and let the
       cavalry go around. It is enough to make the player's orders matter. */
    _commanderAI(dt, _grid) {
      this.aiT -= dt;
      if (this.aiT > 0) return;
      this.aiT = 1.1;
      for (const u of this.units) {
        if (u.side !== 1 || u.st === ROUT || !u.alive) continue;
        if (u.orders.length && u.st !== HOLD) continue;
        /* Nearest enemy block first, but fall through to the next one when
           the field says it cannot be reached — otherwise a unit stranded
           across the water re-issues the same impossible order forever. */
        const foes = [];
        for (const e of this.units) {
          if (e.side === u.side || e.st === ROUT || !e.alive) continue;
          foes.push(e);
        }
        if (!foes.length) continue;
        foes.sort(
          (a, b) => Math.hypot(a.cx - u.cx, a.cy - u.cy) - Math.hypot(b.cx - u.cx, b.cy - u.cy),
        );
        const mounted = u.type === F().CAV || u.type === F().HBOW;
        for (let k = 0; k < Math.min(3, foes.length); k++) {
          const best = foes[k];
          const bd = Math.hypot(best.cx - u.cx, best.cy - u.cy);
          if (mounted && bd > 260) {
            // ride around the flank rather than into the spears
            const flank = u.cy < best.cy ? -1 : 1;
            this.order(u, "attack", best.cx + (best.cx - u.cx) * 0.15, best.cy + flank * 230);
          } else if (bd < 190 && CHARGE_SPD[u.type] > 0) {
            this.order(u, "charge", best.cx, best.cy);
          } else {
            this.order(u, "attack", best.cx, best.cy);
          }
          if (u.reach) break;
        }
        /* Every candidate refused: rather than stand in whatever corner it
           chased its last target into, fall back to the middle of the field
           where the enemy actually is. */
        if (!u.reach && this.field) this.order(u, "attack", this.field.x, this.field.y);
      }
    }

    /* ---------- contract: per-agent AI ---------- */

    update(a, dt, t, grid, nav, _world, _buildings, _wave) {
      /* The core's AI pass walks the whole array and does not skip the dead —
         a man killed earlier in this same pass still gets his turn, and the
         compaction that removes him only runs at the end of the frame. Left
         alone he could rout after dying, decrementing `alive` for a man
         already counted in `dead`, and the side ledger drifted negative. */
      if (a.dead) return;
      a.rallyT = Math.max(0, a.rallyT - dt);
      const u = this.units[a.un];
      // fatigue accrues while sprinting or swinging, and recovers standing still
      const sp = Math.hypot(a.vx, a.vy);
      a.fatigue = ZS.clamp(a.fatigue + (sp > 90 ? dt * 0.05 : -dt * 0.03), 0, 1);

      if (a.fleeing && a.rallyT <= 0) {
        this._flee(a, dt, grid);
        return;
      }
      if (this.over) {
        this._seekSlot(a, u, dt, 40, true);
        return;
      }
      if (a.type === F().CAV || a.type === F().HBOW) this._updateRider(a, dt, t, grid, nav, u);
      else if (SHOOT_R[a.type] > 0) this._updateShooter(a, dt, grid, u);
      else this._updateFoot(a, dt, t, grid, nav, u);
    }

    /* ---------- movement ---------- */

    _seekSlot(a, u, dt, sp, faceHead) {
      const ch = Math.cos(u.head),
        sh = Math.sin(u.head);
      /* Slot targets are clamped inside the field. A block driven into a
         corner otherwise puts half its slots outside the world; those men
         cannot reach them, keep pulling outward, and because the slot pull
         (SEP_SLOT) is stronger than the march drive the whole block deadlocks
         against the edge and the battle can never end. */
      const sx = ZS.clamp(u.cx + a.sx * sh + a.sy * ch, SLOT_PAD, this.w - SLOT_PAD);
      const sy = ZS.clamp(u.cy - a.sx * ch + a.sy * sh, SLOT_PAD, this.h - SLOT_PAD);
      a.sx2 = sx;
      a.sy2 = sy;
      const dx = sx - a.x,
        dy = sy - a.y;
      const d = Math.hypot(dx, dy);
      const k = Math.min(1, dt * 2.4);
      // the unit drive carries the block; the slot seek only shapes the edges
      let txv = u.dx,
        tyv = u.dy;
      if (d > 9) {
        const cohesion = u.cohesion || 0.72;
        txv += (dx / d) * sp * cohesion;
        tyv += (dy / d) * sp * cohesion;
        a.a = faceHead ? u.head : Math.atan2(dy, dx);
      } else if (faceHead) a.a = u.head;
      a.vx += (txv - a.vx) * k;
      a.vy += (tyv - a.vy) * k;
      a.wantMove = d > 9 || u.dx * u.dx + u.dy * u.dy > 16;
    }

    _flee(a, dt, grid) {
      if (a.rallyT > 0) return;
      if (a.fdirC < -900) {
        // aim once, at the rout, and keep it: re-aiming lets a clump orbit
        // its pursuit forever and the field never clears (learned at Cannae)
        let be = null,
          bd = 200 * 200;
        grid.query(a.x, a.y, 200, (b) => {
          if (b.side === a.side || b.dead) return;
          const dx = b.x - a.x,
            dy = b.y - a.y;
          const d2 = dx * dx + dy * dy;
          if (d2 < bd) {
            bd = d2;
            be = b;
          }
        });
        const away = be ? Math.atan2(a.y - be.y, a.x - be.x) : a.a + Math.PI;
        const W = this.w,
          H = this.h;
        const cands = [
          { an: Math.PI, d: a.x + EXIT_PAD },
          { an: 0, d: W + EXIT_PAD - a.x },
          { an: -Math.PI / 2, d: a.y + EXIT_PAD },
          { an: Math.PI / 2, d: H + EXIT_PAD - a.y },
        ];
        let best = cands[0],
          bs = -2;
        for (let i = 0; i < cands.length; i++) {
          const sc = Math.cos(cands[i].an - away) * 2 - cands[i].d / (W + H);
          if (sc > bs) {
            bs = sc;
            best = cands[i];
          }
        }
        a.fdirC = best.an + (ZS.hash(a.seed + 11) * 2 - 1) * 0.3;
      }
      a.fdir = a.fdirC;
      const sp = FLEE_SPD[a.type];
      const k = Math.min(1, dt * 4);
      a.a = a.fdir;
      a.vx += (Math.cos(a.fdir) * sp - a.vx) * k;
      a.vy += (Math.sin(a.fdir) * sp - a.vy) * k;
      a.wantMove = true;
    }

    /* ---------- per-type steering ---------- */

    _updateFoot(a, dt, t, grid, nav, u) {
      a.atkCd -= dt;
      a.atk = Math.max(0, a.atk - dt);
      const reach = REACH[a.type];
      let be = null,
        bd = reach * reach;
      grid.query(a.x, a.y, reach + 5, (b) => {
        if (b.side === a.side || b.dead) return;
        const dx = b.x - a.x,
          dy = b.y - a.y;
        const d2 = dx * dx + dy * dy;
        if (d2 < bd) {
          bd = d2;
          be = b;
        }
      });
      /* A man in reach is struck either way — a spear in the back of someone
         running is the cheapest kill on the field. What changes is whether he
         is worth *stopping* for. */
      if (be && a.atkCd <= 0 && bd < reach * reach) {
        a.atkCd = ATK_CD[a.type] * (0.8 + ZS.hash(a.seed) * 0.5);
        a.atk = 0.16;
        a.fatigue = Math.min(1, a.fatigue + 0.012);
        this._hit(a, be, DMG[a.type]);
      }

      if (be && !be.fleeing) {
        /* A fighting line: brace, close the last few px, hold the front. */
        u.contact = 0.6;
        a.a = Math.atan2(be.y - a.y, be.x - a.x);
        const d = Math.sqrt(bd);
        const k = Math.max(0, 1 - dt * 7);
        a.vx *= k;
        a.vy *= k; // brace: shed momentum into the line
        if (d > reach - 5) {
          a.vx += Math.cos(a.a) * 46 * dt;
          a.vy += Math.sin(a.a) * 46 * dt;
          a.wantMove = true;
        }
      } else {
        /* Nobody, or only men running away: keep the stride and the shape.
           Braking for routers froze whole blocks mid-march (the drive said 43
           px/s while the men moved at 4), and chasing them individually tore
           formations apart across the field. Pursuit is a *unit* decision —
           see the hunt in _driveUnit — not something each man freelances. */
        this._seekSlot(a, u, dt, SEP_SLOT, true);
        if (a.stuckT > 1.2) {
          TG.x = a.sx2;
          TG.y = a.sy2;
          ZS.planAndFollow(a, TG, true, SEP_SLOT, dt, t, nav);
        }
      }
    }

    _updateShooter(a, dt, grid, u) {
      a.thrCd -= dt;
      a.thr = Math.max(0, a.thr - dt);
      const R = SHOOT_R[a.type];
      let be = null,
        bd = R * R;
      grid.query(a.x, a.y, R, (b) => {
        if (b.side === a.side || b.dead) return;
        const dx = b.x - a.x,
          dy = b.y - a.y;
        const d2 = dx * dx + dy * dy;
        if (d2 < bd) {
          bd = d2;
          be = b;
        }
      });
      if (be && be.fleeing && bd > SHOOT_MIN[a.type] * SHOOT_MIN[a.type]) {
        // shoot him in the back, but do not give ground for him
        if (a.thrCd <= 0) {
          a.thrCd = SHOOT_CD[a.type] * (0.85 + ZS.hash(a.seed) * 0.3);
          a.thr = 0.22;
          a.a = Math.atan2(be.y - a.y, be.x - a.x);
          this.fx.push({
            x0: a.x + Math.cos(a.a) * 10,
            y0: a.y - 8,
            x1: be.x,
            y1: be.y - 4,
            t: 0.22,
            bolt: true,
            seed: this.rnd(0, 997),
          });
          this._hit(a, be, 1);
        }
        this._seekSlot(a, u, dt, 40, true);
      } else if (be) {
        a.a = Math.atan2(be.y - a.y, be.x - a.x);
        const d = Math.sqrt(bd);
        if (d < SHOOT_MIN[a.type]) {
          // 弩兵 do not want a melee: give ground
          const fa = a.a + Math.PI;
          const k = Math.min(1, dt * 3);
          a.vx += (Math.cos(fa) * 84 - a.vx) * k;
          a.vy += (Math.sin(fa) * 84 - a.vy) * k;
          a.wantMove = true;
        } else if (a.thrCd <= 0) {
          a.thrCd = SHOOT_CD[a.type] * (0.85 + ZS.hash(a.seed) * 0.3);
          a.thr = 0.22;
          this.fx.push({
            x0: a.x + Math.cos(a.a) * 10,
            y0: a.y - 8,
            x1: be.x,
            y1: be.y - 4,
            t: 0.22,
            bolt: true,
            seed: this.rnd(0, 997),
          });
          this._hit(a, be, 1);
        } else {
          this._seekSlot(a, u, dt, 30, true);
        }
      } else {
        this._seekSlot(a, u, dt, 40, true);
      }
    }

    _updateRider(a, dt, t, grid, nav, u) {
      a.hitCd -= dt;
      if (u.st !== CHARGE) {
        /* Not charging: a horse archer kites, everyone else fights and forms
           up by the same rules as the infantry (which is what keeps a halted
           squadron from standing idle while men die next to it). */
        if (SHOOT_R[a.type] > 0) this._updateShooter(a, dt, grid, u);
        else this._updateFoot(a, dt, t, grid, nav, u);
        return;
      }
      {
        a.a = u.head;
        const sp = CHARGE_SPD[a.type];
        const k = Math.min(1, dt * 2.6);
        a.vx += (Math.cos(u.head) * sp - a.vx) * k;
        a.vy += (Math.sin(u.head) * sp - a.vy) * k;
        a.wantMove = true;
        a.fatigue = Math.min(1, a.fatigue + dt * 0.08);
        if (a.hitCd <= 0) {
          const R = REACH[a.type];
          let be = null,
            bd = R * R;
          grid.query(a.x, a.y, R + 4, (b) => {
            if (b.side === a.side || b.dead) return;
            const dx = b.x - a.x,
              dy = b.y - a.y;
            const d2 = dx * dx + dy * dy;
            if (d2 < bd) {
              bd = d2;
              be = b;
            }
          });
          if (be) {
            a.hitCd = 0.4;
            if (!be.fleeing) u.contact = 0.6;
            this._hit(a, be, DMG[a.type]);
            be.vx += Math.cos(u.head) * 130;
            be.vy += Math.sin(u.head) * 130;
          }
        }
      }
    }

    /* ---------- combat ---------- */

    _hit(a, be, dmg) {
      let d = dmg;
      if (be.fleeing) d += 1; // a spear in the back of a running man
      // a braced spear wall against a horse
      if (
        (a.type === F().SPEAR || a.type === F().JI) &&
        (be.type === F().CAV || be.type === F().HBOW)
      ) {
        d *= ANTI_CAV[a.type];
      }
      be.hp -= d;
      be.flash = 0.3;
      if (this.morale) this.morale.hit(be, a, d);
      this.fx.push({
        x: (a.x + be.x) / 2,
        y: (a.y + be.y) / 2,
        t: 0.22,
        clash: true,
        seed: this.rnd(0, 997),
      });
      if (this.rnd() < 0.5) {
        this.fx.push({ x: be.x, y: be.y - 4, t: 0.4, blood: 2, seed: this.rnd(0, 997) });
        if (this.stains && this.rnd() < 0.5) this.stains.splat(be.x, be.y, "cut", this.rnd(0, 997));
      }
      if (be.hp <= 0) this._kill(be, a);
    }

    _kill(a, killer) {
      if (a.dead) return; // two men can land the killing blow in one frame
      a.dead = true;
      a.hp = 0;
      this.lastBloodT = this.bt;
      const s = this.sides[a.side];
      s.dead++;
      // invariant: dead + routed + alive = total0
      if (a.routFlag) s.routed--;
      else s.alive--;
      if (this.morale) this.morale.casualty(a);
      if (this.stains) this.stains.corpse(a);
      this.fx.push({ x: a.x, y: a.y, t: 0.3, poof: true, seed: a.seed });
      this.fx.push({ x: a.x, y: a.y - 4, t: 0.45, blood: 2, seed: a.seed + 11 });
      if (killer && !killer.dead) killer.flash = 0.1;
    }

    _setRout(a) {
      if (a.routFlag || a.dead) return;
      a.routFlag = 1;
      a.fleeing = true;
      a.free = true;
      const s = this.sides[a.side];
      s.routed++;
      s.alive--;
      if (a.general && this.morale) this.morale.generalLost(a);
      this.fx.push({ x: a.x, y: a.y - 6, t: 0.3, poof: true, seed: a.seed });
    }

    /* ---------- deployment ---------- */

    _addUnit(agents, opt) {
      const type = opt.type;
      const u = {
        uid: this.nextUid++,
        side: opt.side,
        faction: opt.faction,
        type,
        name: opt.name || null,
        cx: opt.x,
        cy: opt.y,
        tx: opt.x,
        ty: opt.y,
        head: opt.head,
        turn: opt.head,
        st: HOLD,
        dx: 0,
        dy: 0,
        orders: [],
        form: opt.form || "line",
        formOpts: opt.formOpts || {},
        slots: null,
        slotN: 0,
        reslot: 2.5,
        size0: opt.n,
        alive: opt.n,
        routAlive: 0,
        avgFatigue: 0,
        moraleMax: 0,
        morale: 0,
        moraleShock: 0,
        morState: ZS.BattleMorale.STEADY,
        waveringT: 0,
        rallyProgress: 0,
        nearGeneral: null,
        cohesion: 0.72,
        general: null,
        contact: 0,
        hunting: false,
        huntT: 0,
        ff: null,
        reach: true,
        best: Infinity, // closest this unit has come to its current goal
        stallT: 0, // seconds since that got any better
        sel: false,
        mem: [],
        typeSpd: SPD[type],
        typeChargeSpd: CHARGE_SPD[type] || SPD[type],
      };
      u.slots = ZS.Formation.slots(u.form, opt.n, u.formOpts);
      u.slotN = opt.n;
      this.units.push(u);
      const un = this.units.length - 1;

      const ch = Math.cos(opt.head),
        sh = Math.sin(opt.head);
      const nav = this._nav;
      for (let k = 0; k < opt.n; k++) {
        const s = u.slots[k];
        const lx = s.x + this.rnd(-1.5, 1.5);
        const ly = s.y + this.rnd(-1.5, 1.5);
        let x = opt.x + lx * sh + ly * ch;
        let y = opt.y - lx * ch + ly * sh;
        const p = nav.nearestWalkable(x, y, 240, true);
        if (p) {
          x = p.x;
          y = p.y;
        }
        // one 什長 at the head of the block; the rest are 兵
        const a = this.makeAgent(x, y, 0, {
          side: opt.side,
          faction: opt.faction,
          type,
          tier: k === 0 ? F().NCO : F().TROOPER,
          un,
          sx: s.x,
          sy: s.y,
          hp: HP[type],
          head: opt.head,
        });
        agents.push(a);
        u.mem.push(a);
        this.sides[opt.side].alive++;
      }
      return u;
    }

    _assignGenerals(units, specs) {
      if (!units.length || !specs || !specs.length) return;
      const typeByName = {
        spear: F().SPEAR,
        dao: F().DAO,
        crossbow: F().BOW,
        halberd: F().JI,
        cav: F().CAV,
        hbow: F().HBOW,
      };
      for (let i = 0; i < specs.length; i++) {
        const spec = specs[i] || {};
        const wanted = typeByName[spec.unitType];
        let unit = null;
        if (wanted !== undefined) {
          for (let k = 0; k < units.length; k++) {
            if (units[k].type === wanted && !units[k].general) {
              unit = units[k];
              break;
            }
          }
        }
        if (!unit) {
          for (let k = 0; k < units.length; k++) {
            const candidate = units[(i + k) % units.length];
            if (!candidate.general) {
              unit = candidate;
              break;
            }
          }
        }
        if (!unit) unit = units[i % units.length];
        const a = unit.mem[0];
        if (!a) continue;
        const tong = ZS.clamp(Number(spec.tong) || 50, 1, 100);
        a.tier = F().GENERAL;
        a.general = true;
        a.generalId = spec.id || "general_" + a.side + "_" + i;
        a.name = spec.name || "battle.general.unknown";
        a.wu = ZS.clamp(Number(spec.wu) || 50, 1, 100);
        a.tong = tong;
        a.zhi = ZS.clamp(Number(spec.zhi) || 50, 1, 100);
        a.auraR = 70 + tong * 0.9;
        a.hp += 5 + Math.round(a.wu * 0.04);
        a.hp0 = a.hp;
        unit.general = a;
        unit.name = a.name;
        this.generals.push(a);
      }
    }

    /* Turn a side's `comp` percentages into whole men, then into blocks.
       1 figure = 1 man throughout (§4.1, Q2) — no conversion anywhere. */
    _deploySide(agents, side, spec, x, y, head, span) {
      const n = spec.onField | 0;
      const comp = spec.comp;
      const order = [
        ["spear", F().SPEAR, 4],
        ["dao", F().DAO, 4],
        ["crossbow", F().BOW, 3],
        ["cav", F().CAV, 3],
      ];
      /* Ratios -> whole men by largest remainder, normalised first so a comp
         that does not sum to 1 still fields exactly `onField` soldiers. */
      let total = 0;
      for (const row of order) total += comp[row[0]] || 0;
      if (total <= 0) total = 1;
      const want = order.map((row) => (n * (comp[row[0]] || 0)) / total);
      const men = want.map((v) => Math.floor(v));
      let left = n - men.reduce((p, q) => p + q, 0);
      const rem = want.map((v, i) => ({ i, r: v - men[i] })).sort((a, b) => b.r - a.r);
      for (let i = 0; left > 0; i = (i + 1) % rem.length, left--) men[rem[i].i]++;

      /* Blocks laid across the front: infantry in the centre, crossbows a step
         behind, horse on the wings. */
      const ch = Math.cos(head),
        sh = Math.sin(head);
      const place = (across, back) => ({
        x: x + across * sh + back * ch,
        y: y - across * ch + back * sh,
      });
      const built = [];
      const spear = men[0],
        dao = men[1],
        bow = men[2],
        cav = men[3];
      if (spear > 0) {
        const half = Math.ceil(spear / 2);
        const p1 = place(-span * 0.22, 0);
        built.push(
          this._addUnit(agents, {
            side,
            faction: spec.factionId,
            type: F().SPEAR,
            n: half,
            x: p1.x,
            y: p1.y,
            head,
            form: "line",
            formOpts: { ranks: 4 },
          }),
        );
        if (spear - half > 0) {
          const p2 = place(span * 0.22, 0);
          built.push(
            this._addUnit(agents, {
              side,
              faction: spec.factionId,
              type: F().SPEAR,
              n: spear - half,
              x: p2.x,
              y: p2.y,
              head,
              form: "line",
              formOpts: { ranks: 4 },
            }),
          );
        }
      }
      if (dao > 0) {
        const p = place(0, -30);
        built.push(
          this._addUnit(agents, {
            side,
            faction: spec.factionId,
            type: F().DAO,
            n: dao,
            x: p.x,
            y: p.y,
            head,
            form: "line",
            formOpts: { ranks: 4 },
          }),
        );
      }
      if (bow > 0) {
        const p = place(0, -110);
        built.push(
          this._addUnit(agents, {
            side,
            faction: spec.factionId,
            type: F().BOW,
            n: bow,
            x: p.x,
            y: p.y,
            head,
            form: "line",
            formOpts: { ranks: 3 },
          }),
        );
      }
      if (cav > 0) {
        const half = Math.ceil(cav / 2);
        const p1 = place(-span * 0.62, -40);
        built.push(
          this._addUnit(agents, {
            side,
            faction: spec.factionId,
            type: F().CAV,
            n: half,
            x: p1.x,
            y: p1.y,
            head,
            form: "wedge",
          }),
        );
        if (cav - half > 0) {
          const p2 = place(span * 0.62, -40);
          built.push(
            this._addUnit(agents, {
              side,
              faction: spec.factionId,
              type: F().CAV,
              n: cav - half,
              x: p2.x,
              y: p2.y,
              head,
              form: "wedge",
            }),
          );
        }
      }
      this._assignGenerals(built, spec.generals);
      return built;
    }

    /* Find a dry band wide enough for both lines and the ground between them.
       Ported from `cannae.js` (which learned it the hard way): the world's
       river wanders, and deploying on the world centre can put the two armies
       on opposite banks — where they march into the water, the flow field
       correctly reports the enemy as unreachable, and the battle never starts.
       Sampling a rectangle that spans both lines rules that out. */
    _findField(world, nav) {
      const S = [1, 0.85, 0.7, 0.55];
      const need = [1, 0.97, 0.93, 0.88];
      const NX = 10,
        NY = 10;
      for (let i = 0; i < S.length; i++) {
        const s = S[i];
        const hw = 720 * s,
          hh = 640 * s;
        let best = null,
          bs = -1;
        for (let gy = 380; gy <= world.h - 380; gy += 220) {
          for (let gx = 380; gx <= world.w - 380; gx += 220) {
            if (gx - hw < 60 || gx + hw > world.w - 60 || gy - hh < 60 || gy + hh > world.h - 60) {
              continue;
            }
            let ok = 0;
            for (let iy = 0; iy < NY; iy++) {
              for (let ix = 0; ix < NX; ix++) {
                const x = gx - hw + (2 * hw * ix) / (NX - 1);
                const y = gy - hh + (2 * hh * iy) / (NY - 1);
                if (nav.isWalkable(x, y, true)) ok++;
              }
            }
            const sc = ok / (NX * NY);
            if (sc < need[i]) continue;
            const c =
              1 - Math.hypot(gx - world.w / 2, gy - world.h / 2) / Math.hypot(world.w, world.h);
            const score = sc * 10 + c;
            if (score > bs) {
              bs = score;
              best = { x: gx, y: gy, s };
            }
          }
        }
        if (best) return best;
      }
      return { x: world.w / 2, y: world.h / 2, s: 0.55 };
    }

    init(agents, world, _vw, _vh, _wave) {
      const setup = this.setup || (this.setup = defaultSetup(world.seed));
      this.rng = ZS.rng32(setup.seed | 0);
      this.t0 = null;
      this.bt = 0;
      this.over = false;
      this.result = -1;
      this.stalemate = false;
      this.overT = 0;
      this.lastBloodT = 0;
      this.aiT = 1.5;
      this.units = [];
      this.generals = [];
      this.nextUid = 1;
      this.orderLog = [];
      this.sides = [
        { total0: 0, dead: 0, routed: 0, alive: 0, gone: 0 },
        { total0: 0, dead: 0, routed: 0, alive: 0, gone: 0 },
      ];
      this.w = world.w;
      this.h = world.h;
      if (this.fx) this.fx.length = 0;
      this._nav = world.nav;

      const f = this._findField(world, world.nav);
      this.field = f;
      const gap = 560 * f.s;
      const span = 620 * f.s;
      // side 0 (the player) deploys west facing east; side 1 east facing west
      this._deploySide(agents, 0, setup.sides[0], f.x - gap / 2, f.y, 0, span);
      this._deploySide(agents, 1, setup.sides[1], f.x + gap / 2, f.y, Math.PI, span);
      for (let i = 0; i < 2; i++) this.sides[i].total0 = this.sides[i].alive;
      this.morale = new ZS.BattleMorale(this);
      this.morale.init();
      this.abilities = new ZS.BattleAbilities(this);
      this.abilities.init();
      if (ZS.Command) ZS.Command.attach(this);
    }

    maintain() {
      // P1 has no reserves; the reserve stream arrives with FIELD_CAP at P4
    }

    left(_agents) {
      // never auto-restart: the shell decides what happens after a battle
      return 1;
    }

    counts(agents) {
      let a0 = 0,
        a1 = 0,
        dead = 0;
      for (const a of agents) {
        if (a.dead) {
          dead++;
          continue;
        }
        if (a.side === 0) a0++;
        else a1++;
      }
      return { a0, a1, dead, bt: this.bt };
    }

    /* Pointer gestures belong to the command layer; claiming a gesture stops
       the camera panning under a drag-select. */
    pointerDown(x, y, e) {
      return ZS.Command ? ZS.Command.pointerDown(x, y, e) : false;
    }

    pointerMove(x, y, e) {
      if (ZS.Command) ZS.Command.pointerMove(x, y, e);
    }

    pointerUp(x, y, e) {
      if (ZS.Command) ZS.Command.pointerUp(x, y, e);
    }

    tap() {
      // a plain tap is a select; the command layer already handled it
    }

    /* ---------- presentation ---------- */

    hud(_agents, _wave) {
      const t = ZS.i18n ? (k, p) => ZS.i18n.t(k, p) : (k) => k;
      const s0 = this.sides[0],
        s1 = this.sides[1];
      const mm = ((this.bt / 60) | 0).toString().padStart(2, "0");
      const ss = ((this.bt % 60) | 0).toString().padStart(2, "0");
      const sel = ZS.Command ? ZS.Command.selection.length : 0;
      return {
        title: t("battle.title"),
        stats: t("battle.stats", {
          own: s0.alive,
          ownLost: s0.dead,
          foe: s1.alive,
          foeLost: s1.dead,
          time: mm + ":" + ss,
        }),
        hint: sel ? t("battle.hint.selected", { n: sel }) : t("battle.hint"),
        legend: (cc, y, fs) => this._legend(cc, y, fs),
        overlay: () => {
          if (!this.over) return null;
          const draw = this.result < 0;
          const win = this.result === 0;
          const lost = this.sides[win ? 1 : 0];
          return {
            main: t(draw ? "battle.draw" : win ? "battle.win" : "battle.lose"),
            sub: this.stalemate
              ? t("battle.stalemate")
              : t("battle.result", { dead: lost.dead, fled: lost.routed + lost.gone }),
          };
        },
      };
    }

    _legend(c, y, fs) {
      c.lineCap = "round";
      c.lineWidth = 1.2;
      const rows = [0, 1];
      for (const s of rows) {
        const yy = y + s * fs * 1.35;
        c.strokeStyle = "rgba(60,58,50,0.75)";
        ZS.wcirc(c, 16, yy, 3.2, 5 + s * 4, 0.5);
        ZS.wline(c, 16, yy + 3, 16, yy + 9, 6 + s * 4, 0.4);
        c.fillStyle = F().wash(s, 0.4);
        ZS.wcirc(c, 10, yy + 5, 3.8, 11 + s * 4, 0.5);
        c.fill();
        c.stroke();
      }
    }

    draw(c, a, t) {
      const moving = Math.hypot(a.vx, a.vy);
      if (a.type === F().CAV || a.type === F().HBOW) F().drawRider(c, a, moving);
      else F().drawFoot(c, a, moving);
      F().drawMarks(c, a, t, moving);
    }

    drawFX(c, fx) {
      for (const sh of fx) {
        if (sh.inspire) {
          const k = sh.t / 0.85;
          const eased = 1 - k * k;
          c.strokeStyle = F().wash(0, 0.2 + k * 0.45);
          c.lineWidth = 1.6;
          ZS.wcirc(c, sh.x, sh.y, 18 + eased * sh.r, sh.seed, 2.2);
          for (let i = 0; i < 8; i++) {
            const an = (i / 8) * Math.PI * 2 + ZS.hash(sh.seed) * 0.4;
            const d = 12 + eased * 42;
            ZS.wline(
              c,
              sh.x + Math.cos(an) * d,
              sh.y + Math.sin(an) * d,
              sh.x + Math.cos(an) * (d + 7 * k),
              sh.y + Math.sin(an) * (d + 7 * k),
              sh.seed + i * 5,
              0.8,
            );
          }
        } else if (sh.bolt) {
          // a crossbow bolt: a hard straight tick, not the sling's lob
          const k = 1 - sh.t / 0.22;
          const bx = sh.x0 + (sh.x1 - sh.x0) * k,
            by = sh.y0 + (sh.y1 - sh.y0) * k;
          const dx = sh.x1 - sh.x0,
            dy = sh.y1 - sh.y0;
          const d = Math.hypot(dx, dy) || 1;
          c.strokeStyle = "rgba(60,52,40,0.75)";
          c.lineWidth = 1.1;
          ZS.wline(c, bx, by, bx - (dx / d) * 9, by - (dy / d) * 9, sh.seed, 0.5);
        } else if (sh.clash) {
          const k = sh.t / 0.22;
          c.strokeStyle = "rgba(70,58,44," + (0.8 * k).toFixed(2) + ")";
          c.lineWidth = 1.2;
          for (let i = 0; i < 3; i++) {
            const an = ZS.hash(sh.seed + i) * 6.283;
            ZS.wline(
              c,
              sh.x + Math.cos(an) * 2,
              sh.y + Math.sin(an) * 2,
              sh.x + Math.cos(an) * 7,
              sh.y + Math.sin(an) * 7,
              sh.seed + i * 3,
              0.7,
            );
          }
        } else if (sh.poof) {
          const k = sh.t / 0.3;
          c.strokeStyle = "rgba(120,110,90," + (0.45 * k).toFixed(2) + ")";
          c.lineWidth = 1;
          ZS.wcirc(c, sh.x, sh.y, 5 + (1 - k) * 9, sh.seed, 1.4);
        } else if (sh.blood) {
          const k = sh.t / 0.45;
          c.fillStyle = "rgba(140,44,36," + (0.5 * k).toFixed(2) + ")";
          for (let i = 0; i < 3; i++) {
            const an = ZS.hash(sh.seed + i) * 6.283;
            const d = (1 - k) * 9;
            c.beginPath();
            c.arc(sh.x + Math.cos(an) * d, sh.y + Math.sin(an) * d, 1.3, 0, 6.29);
            c.fill();
          }
        }
      }
    }

    /* Runs every frame, in world space, effects or not (js/draw.js). */
    drawWorld(c, t) {
      if (ZS.Command) ZS.Command.drawWorld(c, this, t);
    }
  }

  ScenarioSanguo.defaultSetup = defaultSetup;
  ScenarioSanguo.STATES = { HOLD, MOVE, ATTACK, CHARGE, ROUT };
  ZS.ScenarioSanguo = ScenarioSanguo;
})();
