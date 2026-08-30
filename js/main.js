/* Bootstrap: canvas + DPR, world, camera, input, main loop.
   Input: drag to pan, wheel to zoom (at cursor), two-finger pinch to zoom,
   tap/click — what it does is up to the scenario pack.

   Three of the four pages want exactly one world that starts at load and runs
   forever, and they still get it: this file auto-starts unless the page sets
   `window.ZS_MANUAL_BOOT = true` before loading it. 火柴三國 sets that, because
   its shell (ZS.App) owns a MENU that must exist before any battle does, and a
   battle that is torn down and rebuilt every time one is fought. For those
   pages the same bootstrap is a function:

     const engine = ZS.Engine.start({ scenario, worldW, worldH, seed, fixedStep });
     engine.step(dt) / engine.speed = 0..4 / engine.stop()

   `stop()` cancels the frame loop and removes every listener this file added,
   so nothing keeps simming behind a menu. */
(() => {
  "use strict";
  const ZS = window.ZS;
  const params = new URLSearchParams(location.search);

  function start(opts) {
    opts = opts || {};

    const cv = document.getElementById("c");
    const ctx = cv.getContext("2d");
    let W = 0,
      H = 0,
      DPR = 1;

    // a page may size its own world; a caller may override either
    const world = new ZS.World(
      opts.worldW || window.ZS_WW || 3200,
      opts.worldH || window.ZS_WH || 2400,
    );
    // ?seed=N pins the map (reproducible runs); otherwise a fresh world on every refresh
    world.seed =
      opts.seed | 0 || parseInt(params.get("seed"), 10) | 0 || (Math.random() * 0x7fffffff) | 0;
    const nav = new ZS.Nav(world);
    world.nav = nav;
    // scenario: which pack this page runs. Each HTML page sets
    // window.ZS_SCEN to a scenario class name before this file loads
    // (defaults to the outbreak when unset); a caller may pass an instance.
    const scenario =
      opts.scenario || new (window.ZS_SCEN ? ZS[window.ZS_SCEN] : ZS.ScenarioZombie)();
    ZS.scenario = scenario;
    // terrain: a scenario may lay its own battlefield (river, lake, forest,
    // town — or none of them); the default is the seeded random town
    const customTerrain = typeof scenario.terrain === "function";
    if (customTerrain) scenario.terrain(world, nav);
    else {
      world.water();
      nav.markWater();
      world.layoutForest();
      ZS.Buildings.generate(world, nav);
    }
    world.build();
    world.stains = new ZS.Stains(world);
    scenario.attachStains(world.stains);
    ZS.stains = world.stains; // legacy debug handle
    scenario.fx = ZS.fx; // transient effects live with the scenario
    if (!customTerrain) world.placeAllTrees();

    const cam = new ZS.Camera(world);

    function resize() {
      DPR = Math.min(2, window.devicePixelRatio || 1);
      W = window.innerWidth;
      H = window.innerHeight;
      cv.width = Math.max(1, W * DPR);
      cv.height = Math.max(1, H * DPR);
      cv.style.width = W + "px";
      cv.style.height = H + "px";
      cam.clamp(W, H);
    }
    window.addEventListener("resize", resize);

    resize();
    cam.fit(W, H);
    cam.minZoom = cam.zoom * 0.8; // a little paper margin around the world frame
    ZS.Sim.wave = 1;
    ZS.Sim.waveTimer = 0;
    ZS.Sim.init(world, W, H);

    // debug/verification handle (also a hook for future player/vehicle work).
    // Merged, not replaced: a shell may already have put its own handles here.
    ZS.debug = Object.assign(ZS.debug || {}, {
      cam,
      world,
      nav,
      buildings: ZS.Buildings,
      scenario,
    });
    // Recording-only controls. They exist only behind ?record=1 and let the
    // capture harness advance the simulation without waiting in real time.
    // Normal play keeps the exact same clock and surface.
    let recordingOffset = 0;
    if (params.get("record") === "1") {
      ZS.recording = {
        advance(seconds) {
          const step = 1 / 30;
          const n = Math.max(0, Math.ceil(seconds / step));
          const event = ZS.sound && ZS.sound.event;
          if (event) ZS.sound.event = () => {};
          try {
            for (let i = 0; i < n; i++) {
              recordingOffset += step;
              const t = performance.now() / 1000 + recordingOffset;
              ZS.setBoil(t);
              ZS.Sim.update(step, t, world, W, H);
            }
          } finally {
            if (event) ZS.sound.event = event;
          }
          ZS.drawScene(ctx, cam, world, ZS.Sim, performance.now() / 1000 + recordingOffset, W, H);
        },
        fit() {
          cam.auto = false;
          cam.fit(W, H);
        },
        focus(x, y, zoom) {
          cam.auto = false;
          cam.x = x;
          cam.y = y;
          cam.zoom = ZS.clamp(zoom, cam.minZoom, cam.maxZoom);
          cam.clamp(W, H);
        },
      };
    }
    // default to the auto camera when the scenario can point at the action;
    // drag/zoom input hands control back for the session — a tap doesn't
    // (it's an action, e.g. sound unlock or the artillery call)
    cam.auto = typeof scenario.camInterest === "function";

    const pointers = new Map();
    let pinch = null;
    let tap = null;
    const eaten = new Set(); // pointer ids a scenario gesture has claimed

    function onPointerDown(e) {
      if (ZS.sound) ZS.sound.unlock(); // first gesture may unlock audio
      cv.setPointerCapture(e.pointerId);
      pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (pointers.size === 1) {
        tap = { x: e.clientX, y: e.clientY, t: performance.now() };
        // a scenario may claim the gesture (building mode); then it never pans
        if (scenario.pointerDown) {
          const p = cam.toWorld(e.clientX, e.clientY, W, H);
          if (scenario.pointerDown(p.x, p.y, e)) eaten.add(e.pointerId);
        }
      }
      if (pointers.size === 2) {
        tap = null;
        eaten.clear();
        if (cam.auto) cam.auto = false; // pinch zoom takes the camera
        const [p1, p2] = [...pointers.values()];
        pinch = {
          d: Math.hypot(p1.x - p2.x, p1.y - p2.y) || 1,
          x: (p1.x + p2.x) / 2,
          y: (p1.y + p2.y) / 2,
        };
      }
    }
    cv.addEventListener("pointerdown", onPointerDown);

    function onPointerMove(e) {
      const prev = pointers.get(e.pointerId);
      if (!prev) return;
      const dx = e.clientX - prev.x,
        dy = e.clientY - prev.y;
      prev.x = e.clientX;
      prev.y = e.clientY;
      if (pointers.size === 1) {
        if (eaten.has(e.pointerId) && scenario.pointerMove) {
          const p = cam.toWorld(e.clientX, e.clientY, W, H);
          scenario.pointerMove(p.x, p.y, e);
        } else {
          cam.panBy(dx, dy, W, H);
          if (tap && Math.hypot(e.clientX - tap.x, e.clientY - tap.y) > 8) {
            tap = null; // a real pan, not a tap
            if (cam.auto) cam.auto = false; // pan takes the camera
          }
        }
      } else if (pointers.size === 2) {
        const [p1, p2] = [...pointers.values()];
        const d = Math.hypot(p1.x - p2.x, p1.y - p2.y) || 1;
        const mx = (p1.x + p2.x) / 2,
          my = (p1.y + p2.y) / 2;
        if (pinch) {
          cam.zoomAt(mx, my, d / pinch.d, W, H);
          cam.panBy(mx - pinch.x, my - pinch.y, W, H);
        }
        pinch = { d, x: mx, y: my };
      }
    }
    cv.addEventListener("pointermove", onPointerMove);

    function endPointer(e) {
      pointers.delete(e.pointerId);
      if (pointers.size < 2) pinch = null;
      if (pointers.size === 0) {
        const p = cam.toWorld(e.clientX, e.clientY, W, H);
        if (eaten.delete(e.pointerId)) {
          if (scenario.pointerUp) scenario.pointerUp(p.x, p.y, e);
        } else if (tap && performance.now() - tap.t < 400) {
          // quick, stationary press = tap
          ZS.Sim.tap(world, p.x, p.y, e);
        }
        tap = null;
      }
    }
    cv.addEventListener("pointerup", endPointer);
    cv.addEventListener("pointercancel", endPointer);

    function onWheel(e) {
      e.preventDefault();
      if (cam.auto) cam.auto = false;
      const f = ZS.clamp(Math.exp(-e.deltaY * 0.0012), 0.4, 2.5);
      cam.zoomAt(e.clientX, e.clientY, f, W, H);
    }
    cv.addEventListener("wheel", onWheel, { passive: false });

    /* ---------- main loop ---------- */

    /* `fixedStep` (seconds) runs the sim on an accumulator instead of the raw
       frame delta: identical maths every run, so a battle is reproducible from
       its seed, and `speed` (0 = paused, 1x/2x/4x) costs nothing but a
       multiplier on what the accumulator is fed. Unset = the original
       variable-dt behaviour, which is what the other three pages use. */
    const engine = {
      cv,
      ctx,
      world,
      nav,
      cam,
      scenario,
      fixedStep: opts.fixedStep || 0,
      speed: 1,
      simT: 0, // seconds of simulation actually run (not wall clock)
      acc: 0,
      running: true,
      get W() {
        return W;
      },
      get H() {
        return H;
      },
      /* Advance the sim by `dt` seconds of *simulated* time and nothing else.
         The verification harness drives battles through this. */
      step(dt) {
        this.simT += dt;
        ZS.setBoil(this.simT);
        ZS.Sim.update(dt, this.simT, world, W, H);
      },
      render(t) {
        ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
        ZS.drawScene(ctx, cam, world, ZS.Sim, t, W, H);
      },
      stop() {
        if (!this.running) return;
        this.running = false;
        if (raf) cancelAnimationFrame(raf);
        raf = 0;
        window.removeEventListener("resize", resize);
        cv.removeEventListener("pointerdown", onPointerDown);
        cv.removeEventListener("pointermove", onPointerMove);
        cv.removeEventListener("pointerup", endPointer);
        cv.removeEventListener("pointercancel", endPointer);
        cv.removeEventListener("wheel", onWheel);
      },
    };

    let raf = 0;
    let last = performance.now();
    function loop(now) {
      const t = now / 1000 + recordingOffset;
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      ZS.setBoil(t);
      ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
      const feedback =
        typeof scenario.frameFeedback === "function" ? scenario.frameFeedback(dt, t) : null;
      cam.shakeX = feedback ? feedback.x || 0 : 0;
      cam.shakeY = feedback ? feedback.y || 0 : 0;
      if (engine.fixedStep > 0) {
        const fs = engine.fixedStep;
        if (!(feedback && feedback.hold)) engine.acc += dt * engine.speed;
        // a hard cap so a stalled tab does not try to catch up forever
        if (engine.acc > fs * 12) engine.acc = fs * 12;
        while (engine.acc >= fs && !(feedback && feedback.hold)) {
          engine.acc -= fs;
          engine.simT += fs;
          ZS.Sim.update(fs, engine.simT, world, W, H);
          // A scenario may request a real-time impact hold during this tick.
          // Stop before consuming another fixed step; frameFeedback releases
          // it from wall time, so a zero simulation scale cannot deadlock it.
          if (scenario.simHold) break;
        }
      } else {
        engine.simT += dt;
        ZS.Sim.update(dt, t, world, W, H);
      }
      if (cam.auto) {
        const ti = typeof scenario.camInterest === "function" ? scenario.camInterest(dt) : null;
        if (ti) cam.autoSeek(ti.x, ti.y, ti.zoom, dt, W, H, ti.ease);
      }
      if (ZS.sound) ZS.sound.tick(dt);
      ZS.drawScene(ctx, cam, world, ZS.Sim, t, W, H);
      raf = requestAnimationFrame(loop);
    }
    raf = requestAnimationFrame(loop);

    ZS.engine = engine;
    ZS.debug.engine = engine;
    return engine;
  }

  ZS.Engine = { start };
  if (!window.ZS_MANUAL_BOOT) start();
})();
