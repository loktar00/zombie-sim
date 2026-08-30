/* Core entity engine — scenario-agnostic. Runs the per-frame pipeline the
   scenario can't own: the spatial grid, the AI pass (hostiles first, for
   A* budget priority), separation (every unordered pair, soft force plus a
   hard positional core so crowds never collapse into one blob), the
   hard walkability clamp, and the dead compaction.
   Everything about WHO the agents are — appearance, behavior, weapons,
   speech, waves, HUD — lives in the scenario pack (ZS.scenario), loaded
   after this file. See js/scenarios/zombie.js for the full contract.
   Movement primitives shared with scenarios: ZS.planAndFollow,
   ZS.wander, ZS.wanderTarget. */
(() => {
  "use strict";
  const ZS = (window.ZS = window.ZS || {});

  const SEP_R = 18; // keep this much room between any two agents
  const SEP_CORE = 10; // hard core: agents never visually overlap
  const SEP_FORCE = 130; // separation push strength
  const CELL = 26; // spatial-hash cell size (>= SEP_R)
  const NAV_BUDGET = 14; // A* searches per frame, shared, hostiles first (the corps + packs need the headroom)
  const SWIM_FRAC = 0.25; // speed multiplier in water, swim-capable scenarios only

  let navBudget = 0;
  const fx = []; // transient effect records (tracers, poofs, blood), decayed per frame

  function makeAgent(x, y, st, extra) {
    return ZS.scenario.makeAgent(x, y, st, extra);
  }

  function steerToward(a, tx, ty, sp, dt) {
    a.a = Math.atan2(ty - a.y, tx - a.x);
    a.vx += (Math.cos(a.a) * sp - a.vx) * dt * 2.2;
    a.vy += (Math.sin(a.a) * sp - a.vy) * dt * 2.2;
  }

  function wander(a, dt) {
    a.a += ZS.jit(a.seed + 9) * dt * 2.4;
    a.vx += (Math.cos(a.a) * 22 - a.vx) * dt * 1.6;
    a.vy += (Math.sin(a.a) * 22 - a.vy) * dt * 1.6;
  }

  /* ---------- path following ---------- */

  // Steer toward a world-space target: replan with A* when stale, follow
  // path waypoints, or go straight when line-of-sight is clear.
  // Returns "arrived" | "path" | "direct" | "fail" | "wait" | "blocked".
  function planAndFollow(a, tg, isZ, sp, dt, t, nav) {
    const swim = ZS.scenario.swim;
    const d = Math.hypot(tg.x - a.x, tg.y - a.y);
    if (d < 16) return "arrived";
    const moved =
      a.gx === null || (a.gx - tg.x) * (a.gx - tg.x) + (a.gy - tg.y) * (a.gy - tg.y) > 1600;
    let need = !a.path || moved || a.navV0 !== nav.version || a.stuckT > 0.7;
    if (!need && a.path) {
      const np = a.path[Math.min(a.pi + 1, a.path.length - 1)];
      if (np && !nav.isWalkable(np.x, np.y, isZ) && !(swim && nav.isWater(np.x, np.y))) need = true;
    }
    if (need) {
      a.gx = tg.x;
      a.gy = tg.y;
      a.navV0 = nav.version;
      a.stuckT = 0;
      if (navBudget > 0 && (!a.planFailT || t > a.planFailT || moved)) {
        navBudget--;
        const p = nav.astar(a.x, a.y, tg.x, tg.y, isZ, 0, swim);
        if (p && p.length) {
          a.path = p;
          a.pi = 0;
          return "path";
        }
        a.path = null;
        a.planFailT = t + 1;
        return "fail";
      }
      if (navBudget <= 0) return "wait";
    }
    if (a.path && a.pi < a.path.length) {
      let wp = a.path[a.pi];
      if (Math.hypot(wp.x - a.x, wp.y - a.y) < 16) {
        a.pi++;
        if (a.pi >= a.path.length) {
          a.path = null;
          return "arrived";
        }
        wp = a.path[a.pi];
      }
      steerToward(a, wp.x, wp.y, sp, dt);
      return "path";
    }
    if (nav.los(a.x, a.y, tg.x, tg.y, isZ, swim)) {
      steerToward(a, tg.x, tg.y, sp, dt);
      return "direct";
    }
    // no path, no line of sight: drift toward the target; the hard clamp
    // stops us against the obstacle and the stuck timer forces a replan.
    steerToward(a, tg.x, tg.y, sp * 0.5, dt);
    return "blocked";
  }

  function wanderTarget(a, nav, isZ, buildings) {
    for (let i = 0; i < 6; i++) {
      const an = Math.random() * Math.PI * 2;
      const rr = 60 + Math.random() * 200;
      const px = a.x + Math.cos(an) * rr;
      const py = a.y + Math.sin(an) * rr;
      if (!nav.isWalkable(px, py, isZ)) continue;
      // blocked agents can't path into a sealed building; don't waste A* on it
      if (isZ) {
        const bi = ZS.Buildings.cellBldAt(nav, px, py);
        if (bi >= 0) {
          const b = buildings[bi];
          if (!b.door || !b.door.broken) continue;
        }
      }
      return { x: px, y: py };
    }
    return (
      nav.nearestWalkable(
        a.x + (Math.random() - 0.5) * 120,
        a.y + (Math.random() - 0.5) * 120,
        240,
        isZ,
      ) || { x: a.x, y: a.y }
    );
  }

  // the final word on position: a blocked destination slides or stops. An
  // agent already inside a building (standing on a floor cell) may move
  // through the interior; walls only exclude agents outside it
  function hardClamp(a, nx, ny, isZ, nav) {
    const swim = ZS.scenario.swim;
    const inB = isZ && nav.cellAt(a.x, a.y) === 2;
    if (
      nav.isWalkable(nx, ny, isZ) ||
      (inB && nav.cellAt(nx, ny) === 2) ||
      (swim && nav.isWater(nx, ny))
    ) {
      a.x = nx;
      a.y = ny;
      return;
    }
    if (
      nav.isWalkable(nx, a.y, isZ) ||
      (inB && nav.cellAt(nx, a.y) === 2) ||
      (swim && nav.isWater(nx, a.y))
    ) {
      a.x = nx;
      a.vy *= -0.3; // slide along the edge
      return;
    }
    if (
      nav.isWalkable(a.x, ny, isZ) ||
      (inB && nav.cellAt(a.x, ny) === 2) ||
      (swim && nav.isWater(a.x, ny))
    ) {
      a.y = ny;
      a.vx *= -0.3;
      return;
    }
    a.vx *= 0.3;
    a.vy *= 0.3; // dead stop against the obstacle
  }

  // positional separation push that never carries an agent into water or a
  // wall: try the full push, then each axis, then drop it
  function corePush(a, dx, dy, nav) {
    const isZ = ZS.scenario.walkBlocked(a);
    const swim = ZS.scenario.swim;
    const inB = isZ && nav.cellAt(a.x, a.y) === 2;
    const nx = a.x + dx,
      ny = a.y + dy;
    if (
      nav.isWalkable(nx, ny, isZ) ||
      (inB && nav.cellAt(nx, ny) === 2) ||
      (swim && nav.isWater(nx, ny))
    ) {
      a.x = nx;
      a.y = ny;
      return;
    }
    if (
      nav.isWalkable(nx, a.y, isZ) ||
      (inB && nav.cellAt(nx, a.y) === 2) ||
      (swim && nav.isWater(nx, a.y))
    ) {
      a.x = nx;
      return;
    }
    if (
      nav.isWalkable(a.x, ny, isZ) ||
      (inB && nav.cellAt(a.x, ny) === 2) ||
      (swim && nav.isWater(a.x, ny))
    ) {
      a.y = ny;
    }
  }

  /* ---------- frame ---------- */

  function updateAgents(agents, dt, t, world, wave) {
    if (!agents.length) return;
    const S = ZS.scenario;
    const nav = world.nav;
    const buildings = world.buildings;
    navBudget = NAV_BUDGET;
    const grid = new ZS.Grid(CELL);
    for (let i = 0; i < agents.length; i++) {
      const a = agents[i];
      a.id = i;
      a.flash = Math.max(0, a.flash - dt);
      a.sayT = Math.max(0, a.sayT - dt);
      grid.insert(a);
    }
    // scenario-wide logic (panic propagation, timers) before the AI pass
    S.frame(agents, dt, t, grid, nav);

    // two passes: the scenario's hostiles are the few and get A* budget
    // priority
    for (let pass = 0; pass < 2; pass++) {
      for (let i = 0; i < agents.length; i++) {
        const a = agents[i];
        a.wantMove = false;
        const h = S.hostile(a);
        if (pass === 0 ? h : !h) S.update(a, dt, t, grid, nav, world, buildings, wave);
      }
    }
    // door shakes fade
    for (const b of buildings) if (b.door && b.door.shake > 0) b.door.shake -= dt;
    // fade transient effects
    for (let i = fx.length - 1; i >= 0; i--) {
      fx[i].t -= dt;
      if (fx[i].t <= 0) fx.splice(i, 1);
    }

    // separation: every unordered pair once, pushing both agents apart.
    // scenarios may tighten the radius (formations sit at slot spacing and
    // would otherwise inflate until their ranks collide with each other)
    const sepR = S.sepR || SEP_R;
    for (let i = 0; i < agents.length; i++) {
      const a = agents[i];
      a.px = a.x;
      a.py = a.y;
      grid.query(a.x, a.y, sepR, (b) => {
        if (b.id <= a.id) return;
        let sx = a.x - b.x,
          sy = a.y - b.y;
        let sd2 = sx * sx + sy * sy;
        if (sd2 < 0.0001) {
          // exact overlap: nudge in an arbitrary but *reproducible* direction.
          // (Math.random() here was the last thing keeping a fixed-seed battle
          // from replaying identically; the pair's ids are just as arbitrary.)
          const an = ZS.hash(a.id * 7.31 + b.id * 13.17) * 6.283;
          sx = Math.cos(an);
          sy = Math.sin(an);
          sd2 = 1;
        }
        const sd = Math.sqrt(sd2);
        if (sd >= sepR) return;
        const ux = sx / sd,
          uy = sy / sd;
        if (sd < SEP_CORE) {
          const push = (SEP_CORE - sd) * 0.5;
          corePush(a, ux * push, uy * push, nav);
          corePush(b, -ux * push, -uy * push, nav);
        }
        const f = ((sepR - sd) / sepR) * SEP_FORCE * dt;
        // the soft push is wall-aware: a pair across a wall or door must not
        // be shoved at each other through it (doorfront jitter)
        if (nav.isWalkable(a.x + ux * 4, a.y + uy * 4, S.walkBlocked(a))) {
          a.vx += ux * f;
          a.vy += uy * f;
        }
        if (nav.isWalkable(b.x - ux * 4, b.y - uy * 4, S.walkBlocked(b))) {
          b.vx -= ux * f;
          b.vy -= uy * f;
        }
      });
    }
    // the core push is positional; nobody may end up inside a wall. If the
    // pre-push spot is itself blocked (we were already trapped), nudge to
    // the nearest walkable cell instead of staying put
    for (let i = 0; i < agents.length; i++) {
      const a = agents[i];
      if (a.free) continue;
      const blk = S.walkBlocked(a);
      if (
        !nav.isWalkable(a.x, a.y, blk) &&
        !(blk && nav.cellAt(a.x, a.y) === 2) &&
        !(S.swim && nav.isWater(a.x, a.y))
      ) {
        if (nav.isWalkable(a.px, a.py, blk)) {
          a.x = a.px;
          a.y = a.py;
        } else {
          const p = nav.nearestWalkable(a.x, a.y, 80, blk);
          if (p) {
            a.x = p.x;
            a.y = p.y;
          }
        }
      }
    }

    // occupancy counts: reset now (after the AI pass — the pass must read
    // the previous frame's tallies, not zeroes) and refill below
    for (const b of buildings) {
      b.inCount = 0;
      b.survCount = 0;
    }
    // page margin, speed cap, integrate through the hard clamp
    const m = 26;
    for (let i = 0; i < agents.length; i++) {
      const a = agents[i];
      if (a.free) {
        a.x += a.vx * dt;
        a.y += a.vy * dt;
        a.gait += dt * (2 + Math.hypot(a.vx, a.vy) * 0.13);
        continue;
      }
      const blk = S.walkBlocked(a);
      if (a.x < m) a.vx += (m - a.x) * dt * 8;
      if (a.x > world.w - m) a.vx -= (a.x - (world.w - m)) * dt * 8;
      if (a.y < m) a.vy += (m - a.y) * dt * 8;
      if (a.y > world.h - m) a.vy -= (a.y - (world.h - m)) * dt * 8;
      const v = Math.hypot(a.vx, a.vy);
      let maxv = S.maxSpeed(a);
      if (S.swim && nav.isWater(a.x, a.y)) maxv *= SWIM_FRAC; // swimmers
      if (v > maxv) {
        a.vx *= maxv / v;
        a.vy *= maxv / v;
      }
      const nx = ZS.clamp(a.x + a.vx * dt, 12, world.w - 12);
      const ny = ZS.clamp(a.y + a.vy * dt, 12, world.h - 12);
      hardClamp(a, nx, ny, blk, nav);
      a.gait += dt * (2 + Math.hypot(a.vx, a.vy) * 0.13);
      // track cell + building for occupancy counts and shelter logic
      a.bld = ZS.Buildings.cellBldAt(nav, a.x, a.y);
      if (a.bld >= 0) {
        if (blk) buildings[a.bld].inCount++;
        else buildings[a.bld].survCount++;
      }
      const sp = Math.hypot(a.vx, a.vy);
      if (a.wantMove && sp < 22 && !(S.swim && nav.isWater(a.x, a.y))) a.stuckT += dt;
      else a.stuckT = Math.max(0, a.stuckT - dt * 2);
    }
    // the fallen are lifted from the field
    let w = 0;
    for (let i = 0; i < agents.length; i++) {
      const a = agents[i];
      if (a.dead || a.gone) continue;
      if (w !== i) agents[w] = a;
      w++;
    }
    if (w < agents.length) agents.length = w;
  }

  ZS.makeAgent = makeAgent;
  ZS.updateAgents = updateAgents;
  ZS.fx = fx;
  ZS.planAndFollow = planAndFollow;
  ZS.wander = wander;
  ZS.wanderTarget = wanderTarget;
})();
