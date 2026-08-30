/* ZS.BattleMorale — unit morale / rout / rally (SANGUO-DESIGN.md §4.4).
 *
 * Morale belongs to the block, not to 4 000 individual figures. The scenario
 * reports casualties and flank/rear hits here; this system samples the small
 * unit list four times a second and derives the current nerve from:
 *
 *   casualties + local odds + flank/rear pressure + fatigue + commander loss
 *
 * A unit moves STEADY -> WAVERING -> ROUTING. A routing block can return only
 * while some of its men are still on the field and a living, unbroken general
 * is close enough to rally them. General attributes are inputs; moraleMax and
 * cohesion are recomputed battle values, never written back to campaign data.
 */
(() => {
  "use strict";
  const ZS = (window.ZS = window.ZS || {});

  const STEADY = 0;
  const WAVERING = 1;
  const ROUTING = 2;
  const TICK = 0.25;
  const LOCAL_R = 250;
  const ROUT_CONTAGION_R = 210;

  function angleDiff(a, b) {
    let d = a - b;
    while (d > Math.PI) d -= Math.PI * 2;
    while (d < -Math.PI) d += Math.PI * 2;
    return d;
  }

  class BattleMorale {
    constructor(scenario) {
      this.scenario = scenario;
      this.tickT = TICK;
    }

    init() {
      const scen = this.scenario;
      const sides = scen.sides;
      for (let side = 0; side < sides.length; side++) {
        let bestTong = 50;
        for (let i = 0; i < scen.generals.length; i++) {
          const g = scen.generals[i];
          if (g.side === side && g.tong > bestTong) bestTong = g.tong;
        }
        sides[side].moraleMax = 50 + bestTong * 0.4;
      }

      for (let i = 0; i < scen.units.length; i++) {
        const u = scen.units[i];
        const leaderBonus = u.general ? 8 : 0;
        u.moraleMax = sides[u.side].moraleMax + leaderBonus;
        u.morale = u.moraleMax;
        u.moraleShock = 0;
        u.morState = STEADY;
        u.waveringT = 0;
        u.rallyProgress = 0;
        u.nearGeneral = null;
        u.cohesion = u.general ? 0.6 + u.general.tong * 0.003 : 0.72;
      }
    }

    frame(dt) {
      this.tickT -= dt;
      if (this.tickT > 0) return;
      const elapsed = TICK - this.tickT;
      this.tickT = TICK;
      const units = this.scenario.units;
      for (let i = 0; i < units.length; i++) this._updateUnit(units[i], elapsed);
    }

    /* A hit from the flank or rear is frightening even when it is not fatal.
       The queued shock is consumed on the next unit tick. */
    hit(victim, attacker, damage) {
      if (!victim || victim.dead || victim.routFlag) return;
      const u = this.scenario.units[victim.un];
      if (!u || u.morState === ROUTING) return;
      const incoming = Math.atan2(attacker.y - victim.y, attacker.x - victim.x);
      const arc = Math.abs(angleDiff(incoming, victim.a));
      const scale = arc > 2.25 ? 1.15 : arc > 1.15 ? 0.6 : 0.12;
      u.moraleShock += Math.max(0.15, damage * scale);
    }

    casualty(a) {
      const u = this.scenario.units[a.un];
      if (!u) return;
      u.moraleShock += u.moraleMax * (0.3 / Math.max(1, u.size0));
      if (a.general) this.generalLost(a);
    }

    generalLost(general) {
      if (!general || general.commandLost) return;
      general.commandLost = true;
      const units = this.scenario.units;
      for (let i = 0; i < units.length; i++) {
        const u = units[i];
        if (u.side === general.side && u.morState !== ROUTING) {
          u.moraleShock += u.moraleMax * 0.27;
        }
      }
    }

    _updateUnit(u, dt) {
      if (!u || (!u.alive && !u.routAlive)) return;
      if (u.morState === ROUTING) {
        this._updateRally(u, dt);
        return;
      }

      const units = this.scenario.units;
      let friend = u.alive;
      let enemy = 0;
      let rear = 0;
      let routedFriend = 0;
      for (let i = 0; i < units.length; i++) {
        const v = units[i];
        if (v === u || (!v.alive && !v.routAlive)) continue;
        const dx = v.cx - u.cx;
        const dy = v.cy - u.cy;
        const d = Math.hypot(dx, dy);
        if (v.side === u.side) {
          if (v.morState === ROUTING && d < ROUT_CONTAGION_R) routedFriend += v.routAlive || 1;
          else if (d < LOCAL_R) friend += v.alive * (1 - d / LOCAL_R);
          continue;
        }
        if (v.morState === ROUTING || d >= LOCAL_R) continue;
        const weight = 1 - d / LOCAL_R;
        enemy += v.alive * weight;
        const arc = Math.abs(angleDiff(Math.atan2(dy, dx), u.head));
        if (arc > 1.85) rear += v.alive * weight;
      }

      const general = this._nearestGeneral(u);
      u.nearGeneral = general;
      u.cohesion = general ? 0.6 + general.tong * 0.003 : 0.72;
      const loss = 1 - u.alive / Math.max(1, u.size0);
      const odds = Math.max(0, enemy / Math.max(1, friend) - 0.7);
      const rearPress = rear / Math.max(1, friend + enemy);
      const routPress = Math.min(1, routedFriend / Math.max(1, u.size0 * 0.3));
      let target =
        u.moraleMax *
        (1 - loss * 0.7 - u.avgFatigue * 0.22 - Math.min(0.3, odds * 0.16) - rearPress * 0.28);
      target -= u.moraleMax * routPress * 0.14;
      if (general) target += 4 + general.tong * 0.04;
      target = ZS.clamp(target, 0, u.moraleMax);

      u.morale = Math.max(0, u.morale - u.moraleShock);
      u.moraleShock = 0;
      const rate = target < u.morale ? 8 : general ? 3.2 : 1.2;
      const step = rate * dt;
      if (u.morale < target) u.morale = Math.min(target, u.morale + step);
      else u.morale = Math.max(target, u.morale - step);

      const fraction = u.morale / Math.max(1, u.moraleMax);
      if (fraction <= 0.44) {
        u.morState = WAVERING;
        u.waveringT += dt;
      } else if (fraction >= 0.57) {
        u.morState = STEADY;
        u.waveringT = 0;
      }

      const breakNow =
        fraction <= 0.2 || (u.morState === WAVERING && u.waveringT >= 5 && fraction <= 0.35);
      if (breakNow) this.scenario._breakUnit(u);
    }

    _nearestGeneral(u) {
      const generals = this.scenario.generals;
      let best = null;
      let bestD = Infinity;
      for (let i = 0; i < generals.length; i++) {
        const g = generals[i];
        if (g.side !== u.side || g.dead || g.routFlag || g.gone) continue;
        const d = Math.hypot(g.x - u.cx, g.y - u.cy);
        if (d <= g.auraR && d < bestD) {
          best = g;
          bestD = d;
        }
      }
      return best;
    }

    _updateRally(u, dt) {
      const general = this._nearestGeneral(u);
      u.nearGeneral = general;
      if (!general || !u.routAlive) {
        u.rallyProgress = Math.max(0, u.rallyProgress - dt * 0.5);
        return;
      }
      u.morale = Math.min(u.moraleMax * 0.4, u.morale + dt * 10);
      u.rallyProgress += dt;
      if (u.rallyProgress >= 0.8 && u.morale >= u.moraleMax * 0.26) {
        this.scenario._rallyUnit(u);
      }
    }
  }

  BattleMorale.STEADY = STEADY;
  BattleMorale.WAVERING = WAVERING;
  BattleMorale.ROUTING = ROUTING;
  ZS.BattleMorale = BattleMorale;
})();
