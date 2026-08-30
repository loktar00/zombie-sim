/* ZS.App — the shell (SANGUO-DESIGN.md §2).

   One page, several views, only ever one of them running:

     MENU  ->  CAMPAIGN  <->  BATTLE  ->  RESULT

   A view is `{ enter, exit, update(dt, t), draw(c, t), resize(w, h) }`; the
   view that is not current is fully torn down, so no hidden sim keeps running.
   P0 registers only the menu view — P1 adds `battle`, P3 adds `campaign`, and
   neither has to touch this file beyond a registerView() call.

   App also owns boot order, which matters: store -> identity -> save manager
   -> locale -> UI -> first view. */
(() => {
  "use strict";
  const ZS = (window.ZS = window.ZS || {});

  const STATE = { MENU: "menu", CAMPAIGN: "campaign", BATTLE: "battle", RESULT: "result" };
  /* Settings live in the save snapshot (§5.3) *and* standalone, so the menu
     remembers volume and language before any campaign exists. The snapshot
     stays authoritative when a game is loaded. */
  const SETTINGS_KEY = ZS.Store.PREFIX + "settings";
  const INK = "#3d342b";
  const INK_SOFT = "rgba(61,52,43,0.5)";
  const PAPER = "#f3edde";

  const App = {
    STATE,
    state: null,
    views: new Map(),
    view: null,
    cv: null,
    ctx: null,
    W: 0,
    H: 0,
    DPR: 1,
    paper: null, // offscreen paper pre-render, rebuilt on resize
    t0: 0,
    last: 0,
    running: false,
    storageWarning: false,

    /* Persisted player settings. The locale lives here *and* in a standalone
       store key, so the very first menu can render before any save loads. */
    settings: {
      locale: "zh-tw",
      master: 0.8,
      sfx: 0.9,
      music: 0.5,
      autoResolveDefault: false,
    },

    /* ---- boot ------------------------------------------------------- */

    async boot(opts) {
      opts = opts || {};
      this.cv = document.getElementById("c");
      this.ctx = this.cv.getContext("2d");

      const store = opts.store || makeStore(this);
      ZS.Auth.bind(store);
      await ZS.Auth.init();

      ZS.SaveManager.bind(store, ZS.Auth);
      ZS.SaveManager.register("settings", {
        capture: () => this.captureSettings(),
        apply: (data) => this.applySettings(data),
      });

      await this.loadSettings(store);
      await ZS.i18n.boot(store);
      this.settings.locale = ZS.i18n.locale;
      ZS.i18n.onChange((loc) => {
        this.settings.locale = loc;
      });

      if (ZS.Fonts) await ZS.Fonts.load();

      window.addEventListener("resize", () => this.resize());
      this.resize();

      if (ZS.UI) ZS.UI.build(this);

      ZS.debug = {
        app: this,
        store,
        auth: ZS.Auth,
        save: ZS.SaveManager,
        i18n: ZS.i18n,
        fonts: ZS.Fonts,
      };
      this.booted = true;

      this.go(STATE.MENU);
      this.start();
      return this;
    },

    captureSettings() {
      return {
        locale: ZS.i18n.locale,
        master: this.settings.master,
        sfx: this.settings.sfx,
        music: this.settings.music,
        autoResolveDefault: this.settings.autoResolveDefault,
      };
    },

    async loadSettings(store) {
      try {
        const raw = await store.get(SETTINGS_KEY);
        if (raw) this.applySettings(JSON.parse(raw));
      } catch {
        /* A corrupt settings blob is not worth blocking boot over. */
      }
    },

    persistSettings() {
      const store = ZS.SaveManager.store;
      if (!store) return Promise.resolve(false);
      return store
        .set(SETTINGS_KEY, JSON.stringify(this.captureSettings()))
        .then(() => true)
        .catch(() => false);
    },

    applySettings(data) {
      if (!data || typeof data !== "object") return;
      const s = this.settings;
      if (typeof data.master === "number") s.master = data.master;
      if (typeof data.sfx === "number") s.sfx = data.sfx;
      if (typeof data.music === "number") s.music = data.music;
      if (typeof data.autoResolveDefault === "boolean") {
        s.autoResolveDefault = data.autoResolveDefault;
      }
      if (data.locale && ZS.i18n._tables[data.locale]) ZS.i18n.set(data.locale);
    },

    /* ---- views ------------------------------------------------------ */

    registerView(name, view) {
      this.views.set(name, view);
      return this;
    },

    go(state, payload) {
      if (this.state === state) return false;
      /* Look before tearing anything down. An unbuilt phase (campaign, until
         P3) must leave the current view exactly as it was — exiting first and
         re-entering on failure silently restarted whatever was running, which
         for the battle view meant throwing the fight away and deploying a new
         one. */
      const next = this.views.get(state);
      if (!next) return false;
      if (this.view && this.view.exit) this.view.exit();
      this.state = state;
      this.view = next;
      /* A view may own the frame loop itself — the battle hands it to
         js/main.js, which is the engine's. Two loops are never live at once
         (SANGUO-DESIGN.md §2: the other view is fully torn down). */
      if (next.ownsLoop) this.stop();
      if (next.resize) next.resize(this.W, this.H);
      if (next.enter) next.enter(payload);
      if (!next.ownsLoop) this.start();
      if (ZS.UI) ZS.UI.onState(state);
      return true;
    },

    /* ---- frame ------------------------------------------------------ */

    resize() {
      this.DPR = Math.min(2, window.devicePixelRatio || 1);
      this.W = window.innerWidth;
      this.H = window.innerHeight;
      this.cv.width = Math.max(1, this.W * this.DPR);
      this.cv.height = Math.max(1, this.H * this.DPR);
      this.cv.style.width = this.W + "px";
      this.cv.style.height = this.H + "px";
      // the backdrop is the menu's; a loop-owning view draws its own world
      if (!(this.view && this.view.ownsLoop)) this.paper = buildPaper(this.W, this.H);
      if (this.view && this.view.resize) this.view.resize(this.W, this.H);
    },

    start() {
      if (this.running) return;
      this.running = true;
      this.t0 = performance.now() / 1000;
      this.last = this.t0;
      const frame = () => {
        if (!this.running) return;
        const now = performance.now() / 1000;
        let dt = now - this.last;
        if (dt > 0.05) dt = 0.05; // same clamp as main.js
        this.last = now;
        this.step(dt, now - this.t0);
        requestAnimationFrame(frame);
      };
      requestAnimationFrame(frame);
    },

    stop() {
      this.running = false;
    },

    step(dt, t) {
      ZS.setBoil(t);
      ZS.SaveManager.tick(dt);
      if (this.view && this.view.update) this.view.update(dt, t);
      const c = this.ctx;
      c.setTransform(this.DPR, 0, 0, this.DPR, 0, 0);
      c.fillStyle = PAPER;
      c.fillRect(0, 0, this.W, this.H);
      if (this.paper) c.drawImage(this.paper, 0, 0, this.W, this.H);
      if (this.view && this.view.draw) this.view.draw(c, t);
    },
  };

  /* localStorage can be missing outright (opaque file:// origin, private
     mode). Falling back to memory keeps the game playable — the menu says so
     rather than pretending the save worked. */
  function makeStore(app) {
    if (ZS.LocalStore.available()) return new ZS.LocalStore();
    app.storageWarning = true;
    return new ZS.MemoryStore();
  }

  /* A static (sjit, not jit) paper wash: speckle plus a few fibres. Rebuilt
     only on resize; it never enters the per-frame path. */
  function buildPaper(w, h) {
    const cv = document.createElement("canvas");
    cv.width = Math.max(1, w);
    cv.height = Math.max(1, h);
    const c = cv.getContext("2d");
    c.fillStyle = PAPER;
    c.fillRect(0, 0, w, h);
    const n = Math.min(2600, Math.round((w * h) / 900));
    for (let i = 0; i < n; i++) {
      const x = ((ZS.sjit(i * 1.7) + 1) / 2) * w;
      const y = ((ZS.sjit(i * 3.9 + 11) + 1) / 2) * h;
      const a = 0.02 + ((ZS.sjit(i * 5.1 + 3) + 1) / 2) * 0.05;
      c.fillStyle = "rgba(120,105,80," + a.toFixed(3) + ")";
      c.fillRect(x, y, 1, 1);
    }
    c.strokeStyle = "rgba(120,105,80,0.06)";
    c.lineWidth = 1;
    for (let i = 0; i < 26; i++) {
      const y = ((ZS.sjit(i * 2.3 + 90) + 1) / 2) * h;
      const x = ((ZS.sjit(i * 7.7 + 40) + 1) / 2) * w;
      ZS.wline(c, x, y, x + 40 + ZS.sjit(i) * 30, y + ZS.sjit(i * 1.3) * 6, i * 13.1, 1.2);
    }
    return cv;
  }

  /* ---- the MENU view ------------------------------------------------ */

  /* Canvas is the backdrop and the title; the buttons themselves are DOM
     (js/ui/menu.js) so they get focus, keyboard and data-i18n for free. */
  const MenuView = {
    tt: 0,
    enter() {
      this.tt = 0;
    },
    exit() {},
    resize() {},
    update(dt) {
      this.tt += dt;
    },
    draw(c, t) {
      const W = App.W,
        H = App.H;
      const M = Math.min(48, W * 0.06);

      c.lineCap = "round";
      c.lineJoin = "round";
      c.strokeStyle = INK_SOFT;
      ZS.sketchRect(c, M, M, W - M * 2, H - M * 2);

      const cx = W * 0.5;
      const titleY = Math.min(H * 0.34, M + 190);
      const title = ZS.i18n.t("app.title");
      /* Fit the title to the page: four glyphs of 火柴三國 and the much longer
         English name have to live under the same banner. */
      const maxW = W - M * 4;
      let titleSize = Math.max(30, Math.min(112, W * 0.11));
      const measured = ZS.measureText(c, title, titleSize);
      if (measured > maxW) titleSize = Math.max(22, (titleSize * maxW) / measured);
      const titleW = ZS.measureText(c, title, titleSize);

      /* Banner pole + cloth behind the title — §7.4's vocabulary, drawn once
         at menu scale so the title screen reads as the same hand. */
      drawBanner(c, cx, titleY, titleSize, titleW, t);

      c.fillStyle = INK;
      ZS.boilText(c, title, cx, titleY, titleSize, 11.3, "center");

      c.fillStyle = INK_SOFT;
      ZS.boilText(
        c,
        ZS.i18n.t("app.subtitle"),
        cx,
        titleY + titleSize * 0.62,
        Math.max(14, titleSize * 0.22),
        27.9,
        "center",
      );

      c.strokeStyle = INK_SOFT;
      c.lineWidth = 1.4;
      const ruleY = titleY + titleSize * 0.95;
      const ruleW = Math.min(maxW, Math.max(titleW * 1.15, titleSize * 5));
      ZS.wline(c, cx - ruleW / 2, ruleY, cx + ruleW / 2, ruleY, 41.5, 1.5);
    },
  };

  function drawBanner(c, cx, baseY, size, titleW, t) {
    const half = Math.max(titleW / 2 + size * 0.35, size * 1.2);
    const top = baseY - size * 1.05;
    const bot = baseY + size * 0.35;
    const x = cx - half;
    const x2 = cx + half;
    c.strokeStyle = INK_SOFT;
    c.lineWidth = 1.6;
    ZS.wline(c, x, top, x, bot, 71.1, 1.4);
    ZS.wline(c, x2, top, x2, bot, 73.7, 1.4);
    const sway = Math.sin(t * 0.6) * size * 0.05;
    const pts = [
      { x: x + 6, y: top + size * 0.1 },
      { x: x2 - 6, y: top + size * 0.1 + sway },
      { x: x2 - 6, y: top + size * 0.26 + sway },
      { x: x + 6, y: top + size * 0.26 },
    ];
    ZS.wpoly(c, pts, 88.2, 1.6, true);
    c.fillStyle = "rgba(150,54,44,0.10)";
    c.fill();
    c.strokeStyle = INK_SOFT;
    c.lineWidth = 1.2;
    c.stroke();
  }

  App.registerView(STATE.MENU, MenuView);

  /* ---- the BATTLE view ------------------------------------------------ */

  /* Owns the frame loop: js/main.js builds the world, wires input and runs the
     engine, and hands back a handle. Leaving the battle stops it and removes
     every listener, so nothing sims behind the menu.

     `fixedStep` is what makes the fight reproducible (§8): the sim advances in
     whole 1/30 s ticks off an accumulator rather than on the frame delta, so
     the same seed and the same order log produce the same battle — and
     pause / 2x / 4x are just a multiplier on what the accumulator is fed. */
  const BattleView = {
    ownsLoop: true,
    engine: null,
    scen: null,

    enter(payload) {
      const setup =
        (payload && payload.setup) ||
        ZS.ScenarioSanguo.defaultSetup((Math.random() * 0x7fffffff) | 0);
      this.scen = new ZS.ScenarioSanguo(setup);
      this.engine = ZS.Engine.start({
        scenario: this.scen,
        seed: setup.seed,
        fixedStep: 1 / 30,
      });
      App.battle = { engine: this.engine, scen: this.scen, setup };
      return this.engine;
    },

    exit() {
      if (ZS.Command) ZS.Command.detach();
      if (this.engine) this.engine.stop();
      if (ZS.fx) ZS.fx.length = 0;
      this.engine = null;
      this.scen = null;
      App.battle = null;
    },
  };

  App.registerView(STATE.BATTLE, BattleView);

  ZS.App = App;
  ZS.INK = INK;
  ZS.INK_SOFT = INK_SOFT;
  ZS.PAPER = PAPER;
})();
