/* ZS.BattleAbilities — active general abilities (SANGUO-DESIGN.md §4.2).
 *
 * P2 starts with one data-defined active: inspire. The selected unit's
 * commander (or the first living player commander) spends a cooldown to
 * restore nearby unit morale. Routing units still obey the core rule — they
 * only rally while physically inside a living general's aura.
 */
(() => {
  "use strict";
  const ZS = (window.ZS = window.ZS || {});

  const DEFS = {
    inspire: { cooldown: 24, radius: 190, baseHeal: 0.16, potencyHeal: 0.12 },
  };

  class BattleAbilities {
    constructor(scenario) {
      this.scenario = scenario;
    }

    init() {
      const generals = this.scenario.generals;
      for (let i = 0; i < generals.length; i++) generals[i].abilityCd = 0;
    }

    update(dt) {
      const generals = this.scenario.generals;
      for (let i = 0; i < generals.length; i++) {
        const g = generals[i];
        g.abilityCd = Math.max(0, g.abilityCd - dt);
      }
    }

    use(id, general) {
      const def = DEFS[id];
      if (!def || this.scenario.over) return false;
      const g = general || this._playerGeneral();
      if (!g || g.dead || g.routFlag || g.gone || g.abilityCd > 0) return false;
      const potency = ZS.clamp(g.zhi / 100, 0, 1);
      const units = this.scenario.units;
      for (let i = 0; i < units.length; i++) {
        const u = units[i];
        if (u.side !== g.side || (!u.alive && !u.routAlive)) continue;
        const d = Math.hypot(u.cx - g.x, u.cy - g.y);
        if (d > def.radius) continue;
        const falloff = 1 - d / def.radius;
        const heal =
          u.moraleMax * (def.baseHeal + def.potencyHeal * potency) * (0.55 + falloff * 0.45);
        u.morale = Math.min(u.moraleMax, u.morale + heal);
        if (u.morState === ZS.BattleMorale.ROUTING) {
          u.rallyProgress += 0.35 + potency * 0.2;
        }
      }
      g.abilityCd = def.cooldown;
      g.flash = 0.65;
      this.scenario.fx.push({
        x: g.x,
        y: g.y,
        r: def.radius,
        t: 0.85,
        inspire: true,
        seed: g.seed + this.scenario.bt,
      });
      this.scenario.orderLog.push({
        t: Math.round(this.scenario.bt * 100) / 100,
        k: "ability",
        id,
        g: g.generalId,
      });
      return true;
    }

    _playerGeneral() {
      const selected = ZS.Command && ZS.Command.selection;
      if (selected) {
        for (let i = 0; i < selected.length; i++) {
          const g = selected[i].general;
          if (g && !g.dead && !g.routFlag && !g.gone) return g;
        }
      }
      const generals = this.scenario.generals;
      for (let i = 0; i < generals.length; i++) {
        const g = generals[i];
        if (g.side === 0 && !g.dead && !g.routFlag && !g.gone) return g;
      }
      return null;
    }
  }

  BattleAbilities.DEFS = DEFS;
  ZS.BattleAbilities = BattleAbilities;
})();
