/* ZS.i18n — localization (docs/SANGUO-DESIGN.md §6).

   zh-tw is the default and the design language; en is the fallback table for
   any key zh-tw is missing (a dev safety net, never the default shown).

   Tables are plain JS assigned by js/i18n/<loc>.js — no fetch, no JSON import,
   because the page must stay double-clickable on file://.

   Two kinds of localized text:
     UI chrome   t("menu.play")            -> from the locale table
     Content     t({ "zh-tw": "關羽", en: "Guan Yu" })
                                           -> bilingual data straight out of
                                              js/campaign/data/*.js (§6.2)

   Sentences are never concatenated — a full templated key with {params} per
   sentence, because grammar order differs between en and zh. */
(() => {
  "use strict";
  const ZS = (window.ZS = window.ZS || {});

  const LOCALE_KEY = ZS.Store.PREFIX + "locale";
  const DEFAULT = "zh-tw";
  const FALLBACK = "en";

  /* Per-locale number formatting (§6.4). `compact` is the 8萬 / 80K form used
     for troop counts and treasury; plain `n()` stays exact and grouped. */
  const NUMFMT = {
    "zh-tw": {
      group: ",",
      units: [
        [1e8, "億"],
        [1e4, "萬"],
      ],
    },
    en: {
      group: ",",
      units: [
        [1e9, "B"],
        [1e6, "M"],
        [1e3, "K"],
      ],
    },
  };

  const i18n = {
    locale: DEFAULT,
    DEFAULT,
    FALLBACK,
    LOCALE_KEY,
    _tables: {},
    _listeners: [],
    missing: new Set(), // dev aid: keys that fell through to the fallback

    locales() {
      return Object.keys(this._tables);
    },

    has(key) {
      const tb = this._tables[this.locale];
      return !!(tb && Object.prototype.hasOwnProperty.call(tb, key));
    },

    /* key -> string. `key` may also be a bilingual content object. */
    t(key, params) {
      if (key && typeof key === "object") return this._content(key);
      const tb = this._tables[this.locale];
      let s = tb && tb[key];
      if (s === undefined) {
        const fb = this._tables[FALLBACK];
        s = fb && fb[key];
        if (s !== undefined) this.missing.add(this.locale + ":" + key);
      }
      if (s === undefined) return String(key); // visible, greppable, never blank
      return params ? interp(s, params) : s;
    },

    /* Bilingual data object -> the current locale's field, then the fallback,
       then whatever field exists (a half-authored almanac entry still reads). */
    _content(obj) {
      const v = obj[this.locale];
      if (typeof v === "string") return v;
      const f = obj[FALLBACK];
      if (typeof f === "string") return f;
      for (const k in obj) if (typeof obj[k] === "string") return obj[k];
      return "";
    },

    /* Exact, grouped: 12345 -> "12,345". */
    n(num) {
      const f = NUMFMT[this.locale] || NUMFMT[FALLBACK];
      const neg = num < 0;
      const s = String(Math.round(Math.abs(num)));
      let out = "";
      for (let i = 0; i < s.length; i++) {
        if (i > 0 && (s.length - i) % 3 === 0) out += f.group;
        out += s[i];
      }
      return (neg ? "-" : "") + out;
    },

    /* Short form: zh-tw 80000 -> "8萬"; en 80000 -> "80K". */
    nc(num) {
      const f = NUMFMT[this.locale] || NUMFMT[FALLBACK];
      const neg = num < 0;
      const abs = Math.abs(num);
      for (let i = 0; i < f.units.length; i++) {
        const [mag, suffix] = f.units[i];
        if (abs >= mag) {
          const v = abs / mag;
          const txt = v >= 10 ? String(Math.round(v)) : String(Math.round(v * 10) / 10);
          return (neg ? "-" : "") + txt + suffix;
        }
      }
      return this.n(num);
    },

    /* "興平元年 春" / "Spring, 194 CE" — one templated key, so the order is
       the translator's to decide. */
    date(year, season) {
      return this.t("time.date", { year: this.n(year), season: this.t("time.season." + season) });
    },

    /* Swap the table, refill the DOM, persist. Canvas labels call t() at draw
       time so they pick the new locale up on the next frame for free. */
    set(loc) {
      if (!this._tables[loc]) return false;
      this.locale = loc;
      document.documentElement.setAttribute("lang", loc);
      this.applyDom(document);
      for (const fn of this._listeners) fn(loc);
      if (ZS.SaveManager && ZS.SaveManager.store) {
        ZS.SaveManager.store.set(LOCALE_KEY, loc).catch(() => {});
      }
      return true;
    },

    onChange(fn) {
      this._listeners.push(fn);
      return fn;
    },

    /* data-i18n="key" fills textContent; data-i18n-<attr>="key" fills that
       attribute (title, placeholder, aria-label). */
    applyDom(root) {
      if (!root || !root.querySelectorAll) return;
      const nodes = root.querySelectorAll("[data-i18n]");
      for (const el of nodes) el.textContent = this.t(el.getAttribute("data-i18n"));
      const attrs = root.querySelectorAll(
        "[data-i18n-title],[data-i18n-placeholder],[data-i18n-aria-label]",
      );
      for (const el of attrs) {
        const title = el.getAttribute("data-i18n-title");
        if (title) el.setAttribute("title", this.t(title));
        const ph = el.getAttribute("data-i18n-placeholder");
        if (ph) el.setAttribute("placeholder", this.t(ph));
        const al = el.getAttribute("data-i18n-aria-label");
        if (al) el.setAttribute("aria-label", this.t(al));
      }
    },

    /* Read the standalone locale key so the very first menu renders correctly
       before any save is loaded (§6.1). */
    async boot(store) {
      let loc = null;
      try {
        loc = store ? await store.get(LOCALE_KEY) : null;
      } catch {
        loc = null;
      }
      this.set(this._tables[loc] ? loc : DEFAULT);
      return this.locale;
    },
  };

  /* "{n} 名士兵" + {n:120} -> "120 名士兵". Missing params are left visible. */
  function interp(s, params) {
    return s.replace(/\{(\w+)\}/g, (m, k) => (params[k] === undefined ? m : String(params[k])));
  }

  ZS.i18n = i18n;
})();
