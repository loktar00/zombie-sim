/* ZS.UI — the DOM overlay (SANGUO-DESIGN.md §2, §6.1).

   The canvas draws the world and the title; everything you click is DOM. That
   buys focus order, keyboard access, and `data-i18n` re-fill on a locale
   switch for free, and it is how the Hold's UI already works.

   P0 ships the menu shell: main / settings / load / about panels, the locale
   toggle, and the save-slot list. Later phases add their own panels and the
   HUD; this file stays the place the overlay is assembled. */
(() => {
  "use strict";
  const ZS = (window.ZS = window.ZS || {});

  function el(tag, attrs, kids) {
    const n = document.createElement(tag);
    if (attrs) {
      for (const k in attrs) {
        const v = attrs[k];
        if (v === null || v === undefined || v === false) continue;
        if (k === "class") n.className = v;
        else if (k === "text") n.textContent = v;
        else n.setAttribute(k, v === true ? "" : String(v));
      }
    }
    if (kids) for (const kid of kids) if (kid) n.appendChild(kid);
    return n;
  }

  /* A menu button. `i18n` is the key; the text refills on locale change. */
  function btn(id, key, onClick, cls) {
    const b = el("button", { id, class: "mbtn" + (cls ? " " + cls : ""), "data-i18n": key });
    b.textContent = ZS.i18n.t(key);
    b.addEventListener("click", onClick);
    return b;
  }

  function fmtPlaytime(sec) {
    const m = Math.floor(sec / 60);
    if (m < 60) return ZS.i18n.t("time.ms", { m });
    return ZS.i18n.t("time.hms", { h: Math.floor(m / 60), m: m % 60 });
  }

  const UI = {
    app: null,
    root: null,
    panels: {},
    panel: "main",
    toastT: null,

    build(app) {
      this.app = app;
      this.root = document.getElementById("ui");
      this.root.textContent = "";

      this.panels.main = this._main();
      this.panels.settings = this._settings();
      this.panels.load = this._load();
      this.panels.about = this._about();
      for (const k in this.panels) this.root.appendChild(this.panels[k]);

      this.toast = el("div", { id: "toast", class: "toast" });
      this.root.appendChild(this.toast);

      ZS.i18n.onChange(() => {
        ZS.i18n.applyDom(this.root);
        this._syncLang();
        if (this.panel === "load") this.refreshSlots();
        this._syncAbout();
      });

      this.show("main");
      this.refreshContinue();
      if (app.storageWarning) this.say(ZS.i18n.t("err.noStorage"), 6000);
      return this;
    },

    onState() {
      /* P0 has one state; later phases hide the menu here. */
    },

    show(name) {
      this.panel = name;
      for (const k in this.panels) this.panels[k].classList.toggle("on", k === name);
      if (name === "load") this.refreshSlots();
      if (name === "about") this._syncAbout();
      if (name === "settings") this._syncLang();
    },

    say(msg, ms) {
      this.toast.textContent = msg;
      this.toast.classList.add("on");
      if (this.toastT) clearTimeout(this.toastT);
      this.toastT = setTimeout(() => this.toast.classList.remove("on"), ms || 2600);
    },

    /* ---- panels ------------------------------------------------------ */

    _main() {
      const soon = () => this.say(ZS.i18n.t("common.soon"));
      const cont = btn("btn-continue", "menu.continue", () => this.continueGame(), "primary");
      cont.hidden = true;
      this.btnContinue = cont;
      return el("div", { class: "panel main on", "data-panel": "main" }, [
        cont,
        btn("btn-campaign", "menu.campaign", soon),
        btn("btn-skirmish", "menu.skirmish", soon),
        btn("btn-load", "menu.load", () => this.show("load")),
        btn("btn-settings", "menu.settings", () => this.show("settings")),
        btn("btn-about", "menu.about", () => this.show("about")),
      ]);
    },

    _settings() {
      const langRow = el("div", { class: "row langs", id: "lang-row" });
      for (const loc of ["zh-tw", "en"]) {
        const b = el("button", {
          id: "btn-lang-" + loc,
          class: "chip",
          "data-i18n": "locale." + loc,
          "data-locale": loc,
        });
        b.textContent = ZS.i18n.t("locale." + loc);
        b.addEventListener("click", () => {
          ZS.i18n.set(loc);
          this.app.persistSettings();
        });
        langRow.appendChild(b);
      }
      this.langRow = langRow;

      const sliders = ["master", "sfx", "music"].map((k) => this._slider(k));
      const auto = this._toggle("autoResolveDefault", "settings.autoResolve");

      return el("div", { class: "panel", "data-panel": "settings" }, [
        el("h2", { "data-i18n": "settings.title", text: ZS.i18n.t("settings.title") }),
        el("h3", { "data-i18n": "settings.language", text: ZS.i18n.t("settings.language") }),
        langRow,
        el("h3", { "data-i18n": "settings.audio", text: ZS.i18n.t("settings.audio") }),
        ...sliders,
        auto,
        btn("btn-settings-back", "menu.back", () => this.show("main")),
      ]);
    },

    _slider(key) {
      const input = el("input", {
        type: "range",
        id: "set-" + key,
        min: "0",
        max: "100",
        value: String(Math.round(this.app.settings[key] * 100)),
      });
      input.addEventListener("input", () => {
        this.app.settings[key] = input.valueAsNumber / 100;
      });
      input.addEventListener("change", () => this.app.persistSettings());
      return el("label", { class: "row slider" }, [
        el("span", { "data-i18n": "settings." + key, text: ZS.i18n.t("settings." + key) }),
        input,
      ]);
    },

    _toggle(key, i18nKey) {
      const input = el("input", { type: "checkbox", id: "set-" + key });
      input.checked = !!this.app.settings[key];
      input.addEventListener("change", () => {
        this.app.settings[key] = input.checked;
        this.app.persistSettings();
      });
      return el("label", { class: "row toggle" }, [
        input,
        el("span", { "data-i18n": i18nKey, text: ZS.i18n.t(i18nKey) }),
      ]);
    },

    _load() {
      this.slotList = el("div", { class: "slots", id: "slot-list" });
      return el("div", { class: "panel", "data-panel": "load" }, [
        el("h2", { "data-i18n": "load.title", text: ZS.i18n.t("load.title") }),
        this.slotList,
        btn("btn-load-back", "menu.back", () => this.show("main")),
      ]);
    },

    _about() {
      this.aboutFacts = el("dl", { class: "facts", id: "about-facts" });
      return el("div", { class: "panel", "data-panel": "about" }, [
        el("h2", { "data-i18n": "about.title", text: ZS.i18n.t("about.title") }),
        el("p", { "data-i18n": "about.body", text: ZS.i18n.t("about.body") }),
        this.aboutFacts,
        btn("btn-about-back", "menu.back", () => this.show("main")),
      ]);
    },

    _syncLang() {
      if (!this.langRow) return;
      for (const b of this.langRow.children) {
        b.classList.toggle("on", b.getAttribute("data-locale") === ZS.i18n.locale);
      }
    },

    _syncAbout() {
      if (!this.aboutFacts) return;
      const store = ZS.SaveManager.store;
      const where = store ? "about.storage." + store.name : "about.storage.local";
      const rows = [
        [ZS.i18n.t("about.storage"), ZS.i18n.t(where)],
        [ZS.i18n.t("about.device"), String(ZS.Auth.deviceId || "").slice(0, 8)],
        [ZS.i18n.t("about.build"), "P0"],
      ];
      this.aboutFacts.textContent = "";
      for (const [k, v] of rows) {
        this.aboutFacts.appendChild(el("dt", { text: k }));
        this.aboutFacts.appendChild(
          el("dd", { id: k === ZS.i18n.t("about.device") ? "about-device" : null, text: v }),
        );
      }
    },

    /* ---- saves -------------------------------------------------------- */

    async refreshContinue() {
      try {
        const has = await ZS.SaveManager.has(ZS.SaveManager.AUTOSAVE_SLOT);
        this.btnContinue.hidden = !has;
      } catch {
        this.btnContinue.hidden = true;
      }
    },

    async refreshSlots() {
      const list = this.slotList;
      if (!list) return;
      let slots = [];
      try {
        slots = await ZS.SaveManager.listSlots();
      } catch {
        slots = [];
      }
      list.textContent = "";
      if (!slots.length) {
        list.appendChild(el("p", { class: "empty", text: ZS.i18n.t("load.empty") }));
        return;
      }
      for (const s of slots) {
        const isAuto = s.slot === ZS.SaveManager.AUTOSAVE_SLOT;
        const name = isAuto ? ZS.i18n.t("load.slotAuto") : ZS.i18n.t("load.slot", { n: s.slot });
        const meta =
          s.meta.turn === null
            ? ZS.i18n.t("load.playtime", { time: fmtPlaytime(s.meta.playtime) })
            : ZS.i18n.t("load.meta", { year: s.meta.year, turn: s.meta.turn });
        const open = el("button", { class: "slot", "data-slot": s.slot }, [
          el("span", { class: "slot-name", text: name }),
          el("span", { class: "slot-meta", text: meta }),
        ]);
        open.addEventListener("click", () => this.loadSlot(s.slot));
        const del = el("button", { class: "slot-del", "data-del": s.slot, text: "×" });
        del.setAttribute("aria-label", ZS.i18n.t("load.delete"));
        del.addEventListener("click", async (e) => {
          e.stopPropagation();
          await ZS.SaveManager.deleteSlot(s.slot);
          this.refreshSlots();
          this.refreshContinue();
        });
        list.appendChild(el("div", { class: "slot-row" }, [open, del]));
      }
    },

    async loadSlot(slot) {
      try {
        await ZS.SaveManager.load(slot);
        this.say(ZS.i18n.t("load.title"));
        this.show("main");
      } catch (e) {
        const key = e.code === "future_version" ? "err.futureSave" : "err.loadFailed";
        this.say(ZS.i18n.t(key, { code: e.code || "?" }), 5000);
      }
    },

    continueGame() {
      this.loadSlot(ZS.SaveManager.AUTOSAVE_SLOT);
    },
  };

  ZS.UI = UI;
})();
