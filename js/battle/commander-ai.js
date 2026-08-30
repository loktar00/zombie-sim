/* ZS.SanguoCommanderAI — enemy command brain (docs/SANGUO-DESIGN.md §4.4).
 *
 * Decision and motion stay separate: this module chooses a block-level intent;
 * ScenarioSanguo.order() and the existing flow fields carry it out. A shallow
 * priority tree handles army collapse / reserve crises / ordinary pressure,
 * while a small influence map gives target utility its local strength facts.
 * The tree ticks a few times per second, scaled by the best general's zhi.
 */
(() => {
  "use strict";
  const ZS = (window.ZS = window.ZS || {});

  const COLS = 18;
  const ROWS = 14;
  const RETREAT_MORALE = 0.24;
  const CHARGE_R = 190;

  class SanguoCommanderAI {
    constructor(scenario) {
      this.scenario = scenario;
      this.friendly = new Float32Array(COLS * ROWS);
      this.threat = new Float32Array(COLS * ROWS);
      this.objective = new Float32Array(COLS * ROWS);
      this.cellW = 1;
      this.cellH = 1;
      this.tickT = 1.2;
      this.period = 0.8;
      this.zhi = 50;
      this.skill = 0.5;
      this.openingT = 39;
      this.armyMorale = 1;
      this.planCount = 0;
      this.actions = { probe: 0, hold: 0, press: 0, commit: 0, retreat: 0 };
    }

    init() {
      const s = this.scenario;
      this.cellW = s.w / COLS;
      this.cellH = s.h / ROWS;
      this.zhi = 50;
      for (let i = 0; i < s.generals.length; i++) {
        const g = s.generals[i];
        if (g.side === 1 && g.zhi > this.zhi) this.zhi = g.zhi;
      }
      this.skill = ZS.clamp((this.zhi - 35) / 65, 0, 1);
      this.period = 1.18 - this.skill * 0.58;
      this.openingT = 41 - this.skill * 4;
      this.tickT = 1.1;
      this._rebuildInfluence();
    }

    update(dt) {
      this.tickT -= dt;
      if (this.tickT > 0) return;
      this.tickT = this.period;
      this.planCount++;
      this._rebuildInfluence();
      this.armyMorale = this._armyMorale();

      const units = this.scenario.units;
      for (let i = 0; i < units.length; i++) units[i].aiClaims = 0;
      for (let i = 0; i < units.length; i++) {
        const u = units[i];
        if (u.side !== 1 || !u.alive || u.st === this._states().ROUT) continue;
        // The opening probe is deliberately finite. If contact held its short
        // ATTACK order open, release it when the assessment beat ends so the
        // ordinary selector can choose a fresh intent immediately.
        if (u.aiMode === "probe" && this.scenario.bt >= this.openingT) {
          u.orders.length = 0;
          u.st = this._states().HOLD;
        }
        // An issued order is a RUNNING action. The tree only re-enters when
        // that action completes, unless the high-priority retreat abort fires.
        if (this.armyMorale >= RETREAT_MORALE && u.orders.length && u.st !== this._states().HOLD) {
          continue;
        }
        this._tickUnit(u);
      }
    }

    sample(x, y) {
      const i = this._cell(x, y);
      return {
        friendly: this.friendly[i],
        threat: this.threat[i],
        objective: this.objective[i],
      };
    }

    _tickUnit(u) {
      // Selector, highest priority first:
      //   retreat on army collapse
      //   commit a rear block to a wavering line
      //   run the staged opening probe
      //   hold an overmatched wavering block
      //   press the best utility target
      if (this.armyMorale < RETREAT_MORALE) {
        this._retreat(u);
        return;
      }
      const crisis = this._crisis();
      if (crisis && this._isReserve(u, crisis) && this._commit(u, crisis)) return;
      if (this.scenario.bt < this.openingT) {
        this._probe(u);
        return;
      }
      const local = this._cell(u.cx, u.cy);
      const morale = u.morale / Math.max(1, u.moraleMax);
      if (morale < 0.52 && this.threat[local] > this.friendly[local] * 1.35) {
        this._hold(u);
        return;
      }
      if (!this._press(u, crisis)) this._hold(u);
    }

    _probe(u) {
      if (!u.aiProbeStage) {
        u.aiProbeStage = 1;
        u.aiMode = "probe";
        this.actions.probe++;
        // Side 1 faces west. Move only a fraction of the deployment gap: the
        // formation is doing something on screen, while the player still has
        // a clear first command beat before the general commitment.
        this.scenario.order(u, "attack", Math.max(80, u.cx - 135), u.cy);
      } else if (u.aiProbeStage === 1 && this.scenario.bt >= this.openingT * 0.52) {
        u.aiProbeStage = 2;
        u.aiMode = "probe";
        this.actions.probe++;
        this.scenario.order(u, "attack", Math.max(80, u.cx - 95), u.cy);
      } else if (!u.orders.length) {
        this._hold(u);
      }
    }

    _rebuildInfluence() {
      this.friendly.fill(0);
      this.threat.fill(0);
      this.objective.fill(0);
      const units = this.scenario.units;
      for (let i = 0; i < units.length; i++) {
        const u = units[i];
        if (!u.alive || u.st === this._states().ROUT) continue;
        const morale = u.moraleMax ? u.morale / u.moraleMax : 1;
        const mounted = u.type === ZS.figure.CAV || u.type === ZS.figure.HBOW;
        const power =
          u.alive * (0.55 + morale * 0.45) * (1 - u.avgFatigue * 0.28) * (mounted ? 1.12 : 1);
        const cx = ZS.clamp((u.cx / this.cellW) | 0, 0, COLS - 1);
        const cy = ZS.clamp((u.cy / this.cellH) | 0, 0, ROWS - 1);
        const map = u.side === 1 ? this.friendly : this.threat;
        for (let oy = -2; oy <= 2; oy++) {
          const y = cy + oy;
          if (y < 0 || y >= ROWS) continue;
          for (let ox = -2; ox <= 2; ox++) {
            const x = cx + ox;
            if (x < 0 || x >= COLS) continue;
            const d = Math.hypot(ox, oy);
            if (d > 2.4) continue;
            map[y * COLS + x] += power * (1 - d / 2.6);
          }
        }
      }
      for (let i = 0; i < this.objective.length; i++) {
        const enemy = this.threat[i];
        const support = this.friendly[i];
        // High where an enemy body exists and our nearby strength can exploit
        // it; normalized facts keep neither term numerically dominant.
        this.objective[i] = enemy > 0 ? enemy / (enemy + 70) + support / (support + enemy + 70) : 0;
      }
    }

    _armyMorale() {
      const units = this.scenario.units;
      let weighted = 0;
      let men = 0;
      for (let i = 0; i < units.length; i++) {
        const u = units[i];
        if (u.side !== 1 || !u.alive || !u.moraleMax) continue;
        weighted += u.alive * (u.morale / u.moraleMax);
        men += u.alive;
      }
      return men ? weighted / men : 0;
    }

    _crisis() {
      const units = this.scenario.units;
      let best = null;
      let score = 0.58;
      for (let i = 0; i < units.length; i++) {
        const u = units[i];
        if (u.side !== 1 || !u.alive || !u.moraleMax) continue;
        const danger =
          1 - u.morale / u.moraleMax + (u.morState === ZS.BattleMorale.WAVERING ? 0.22 : 0);
        if (danger > score) {
          score = danger;
          best = u;
        }
      }
      return best;
    }

    _isReserve(u, crisis) {
      if (u === crisis || u.contact > 0 || u.orders.length) return false;
      // Side 1 deploys in the east and faces west: a block still east of the
      // crisis is the nearest thing this skirmish has to an uncommitted reserve.
      return u.cx > crisis.cx + 90;
    }

    _commit(u, crisis) {
      const target = this._nearestEnemy(crisis.cx, crisis.cy);
      if (!target) return false;
      this.actions.commit++;
      u.aiMode = "commit";
      return this._orderToward(u, target, true);
    }

    _press(u, crisis) {
      const units = this.scenario.units;
      let best = null;
      let bestScore = -Infinity;
      for (let i = 0; i < units.length; i++) {
        const e = units[i];
        if (e.side === u.side || !e.alive || e.st === this._states().ROUT) continue;
        const d = Math.hypot(e.cx - u.cx, e.cy - u.cy);
        const cell = this._cell(e.cx, e.cy);
        const morale = e.moraleMax ? e.morale / e.moraleMax : 1;
        const weakness = (1 - morale) * 80 + (1 - e.alive / Math.max(1, e.size0)) * 55;
        // Weak points influence the choice without overruling battlefield
        // geometry. Overweighting this term made every free block pivot onto
        // the first wobble and collapse a flank before the battle was legible.
        const intelligence = weakness * this.skill * 0.15 + this.objective[cell] * 18 * this.skill;
        // Coordination means distributing pressure, not dogpiling the first
        // wavering block. A claimed target stays possible, but only after the
        // other viable enemy blocks have somebody facing them.
        const claimPenalty = e.aiClaims * (65 + this.skill * 55);
        const crisisBias = crisis && Math.hypot(e.cx - crisis.cx, e.cy - crisis.cy) < 230 ? 24 : 0;
        const hysteresis = u.aiTarget === e.uid ? 40 : 0;
        const score =
          intelligence + crisisBias + hysteresis - d * (0.08 - this.skill * 0.025) - claimPenalty;
        if (score > bestScore) {
          bestScore = score;
          best = e;
        }
      }
      if (!best) return false;
      best.aiClaims++;
      u.aiTarget = best.uid;
      u.aiMode = "press";
      this.actions.press++;
      return this._orderToward(u, best, false);
    }

    _orderToward(u, target, committed) {
      const d = Math.hypot(target.cx - u.cx, target.cy - u.cy);
      const mounted = u.type === ZS.figure.CAV || u.type === ZS.figure.HBOW;
      if (mounted && d > 250 && !committed) {
        const north = this._cell(target.cx, target.cy - 230);
        const south = this._cell(target.cx, target.cy + 230);
        const flank = this.threat[north] <= this.threat[south] ? -1 : 1;
        // Ride beyond the enemy line before turning in. Cutting this corner
        // short makes cavalry connect before the infantry fronts have formed,
        // producing abrupt thirty-second routs instead of a readable battle.
        this.scenario.order(
          u,
          "attack",
          target.cx + (target.cx - u.cx) * 0.15,
          target.cy + flank * 230,
        );
      } else if (d < CHARGE_R && u.type !== ZS.figure.BOW) {
        this.scenario.order(u, "charge", target.cx, target.cy);
      } else {
        this.scenario.order(u, "attack", target.cx, target.cy);
      }
      if (u.reach) return true;
      if (this.scenario.field) {
        this.scenario.order(u, "attack", this.scenario.field.x, this.scenario.field.y);
      }
      return u.reach;
    }

    _retreat(u) {
      const morale = u.morale / Math.max(1, u.moraleMax);
      if (u.aiMode === "retreat" && u.orders.length) return;
      this.actions.retreat++;
      u.aiMode = "retreat";
      if (morale < 0.32 || u.morState === ZS.BattleMorale.WAVERING) {
        this.scenario._breakUnit(u);
        return;
      }
      this.scenario.order(
        u,
        "move",
        this.scenario.w - 80,
        ZS.clamp(u.cy, 80, this.scenario.h - 80),
      );
    }

    _hold(u) {
      if (u.aiMode !== "hold") this.actions.hold++;
      u.aiMode = "hold";
      if (u.st !== this._states().HOLD || u.orders.length) {
        this.scenario.order(u, "hold", u.cx, u.cy);
      }
    }

    _nearestEnemy(x, y) {
      const units = this.scenario.units;
      let best = null;
      let bestD = Infinity;
      for (let i = 0; i < units.length; i++) {
        const u = units[i];
        if (u.side !== 0 || !u.alive || u.st === this._states().ROUT) continue;
        const d = Math.hypot(u.cx - x, u.cy - y);
        if (d < bestD) {
          bestD = d;
          best = u;
        }
      }
      return best;
    }

    _cell(x, y) {
      const cx = ZS.clamp((x / this.cellW) | 0, 0, COLS - 1);
      const cy = ZS.clamp((y / this.cellH) | 0, 0, ROWS - 1);
      return cy * COLS + cx;
    }

    _states() {
      return this.scenario.constructor.STATES;
    }
  }

  SanguoCommanderAI.COLS = COLS;
  SanguoCommanderAI.ROWS = ROWS;
  ZS.SanguoCommanderAI = SanguoCommanderAI;
})();
