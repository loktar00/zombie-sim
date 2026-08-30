/* ZS.BattleFeel — transient battle feedback (SANGUO-DESIGN.md §4.4).
 *
 * Simulation emits discrete events; this layer turns only the important ones
 * into a proportional bundle: charge = directional burst + light trauma,
 * general kill = larger burst + stronger trauma + a 90 ms real-time hold.
 * Camera shake is render-only and hitstop never enters deterministic sim time.
 */
(() => {
  "use strict";
  const ZS = (window.ZS = window.ZS || {});

  const FRAME = { x: 0, y: 0, hold: false };

  class BattleFeel {
    constructor(scenario) {
      this.scenario = scenario;
      this.trauma = 0;
      this.hitstopT = 0;
      this.phase = 0;
      this.chargeCount = 0;
      this.generalKills = 0;
      this.eventSeq = 0;
    }

    charge(x, y, dx, dy) {
      this.trauma = Math.min(1, this.trauma + 0.22);
      this.chargeCount++;
      this._burst(x, y, dx, dy, 1);
    }

    generalKill(victim, killer) {
      let dx = Math.cos(victim.a);
      let dy = Math.sin(victim.a);
      if (killer) {
        dx = victim.x - killer.x;
        dy = victim.y - killer.y;
        const d = Math.hypot(dx, dy) || 1;
        dx /= d;
        dy /= d;
      }
      this.trauma = Math.min(1, this.trauma + 0.68);
      this.hitstopT = Math.max(this.hitstopT, 0.09);
      this.scenario.simHold = true;
      this.generalKills++;
      this._burst(victim.x, victim.y - 6, dx, dy, 2);
    }

    frame(dt, _t) {
      this.phase += dt * 29;
      this.trauma = Math.max(0, this.trauma - dt * 1.45);
      this.hitstopT = Math.max(0, this.hitstopT - dt);
      this.scenario.simHold = this.hitstopT > 0;
      const shake = this.trauma * this.trauma;
      FRAME.x = Math.sin(this.phase * 1.7) * 7 * shake;
      FRAME.y = Math.sin(this.phase * 2.31 + 0.8) * 5 * shake;
      FRAME.hold = this.scenario.simHold;
      return FRAME;
    }

    _burst(x, y, dx, dy, impact) {
      this.eventSeq++;
      this.scenario.fx.push({
        x,
        y,
        dx,
        dy,
        impact,
        t: impact === 2 ? 0.52 : 0.34,
        // Feedback must not advance the battle's PRNG: adding or removing a
        // particle cannot change the next damage roll. Event geometry plus a
        // local sequence gives this visual its own deterministic seed.
        seed: ZS.hash(x * 0.13 + y * 0.17 + impact * 31 + this.eventSeq * 7.1) * 997,
      });
    }
  }

  ZS.BattleFeel = BattleFeel;
})();
