/* ZS.SaveManager — the only persistence surface gameplay code may touch
   (SANGUO-DESIGN.md §5).

   It owns the schema, the migration chain, and the durability dance; the Store
   under it stays dumb. Switching local -> server is `bind(otherStore)` at boot
   and nothing else.

   Sections. A snapshot is assembled from registered sections rather than from
   a hard-coded list, so P3 can add the campaign and P5 the general roster
   without editing this file:

     ZS.SaveManager.register("campaign", { capture() {...}, apply(data) {...} })

   Durability (§5.4). When the bound store reports `capabilities.atomic ===
   false` (localStorage), a write goes shadow -> main -> bak: a crash leaves a
   whole old or a whole new save, never a torn one, and `:bak` is read as a
   fallback when the main key is missing or unparseable. An atomic store
   (a server PUT) skips the dance entirely. */
(() => {
  "use strict";
  const ZS = (window.ZS = window.ZS || {});

  const P = ZS.Store.PREFIX;
  const SCHEMA_VERSION = 1;
  const AUTOSAVE_SLOT = "auto";
  const AUTOSAVE_MIN_MS = 5000; // throttle; the caller fires once per World phase
  const APP_BUILD = "sanguo-p0";

  /* Ordered pure v -> v+1 upgrades. Empty at v1 on purpose: the chain exists
     from the first commit so that retrofitting it later never has to happen. */
  const MIGRATIONS = {
    // 1: (s) => { s.version = 2; ...; return s; },
  };

  function slotKey(slot) {
    return P + "slot:" + String(slot);
  }

  function isPlainObject(v) {
    return !!v && typeof v === "object" && !Array.isArray(v);
  }

  class SaveError extends Error {
    constructor(code, message, cause) {
      super(message || code);
      this.code = code;
      if (cause) this.cause = cause;
    }
  }

  const SaveManager = {
    SCHEMA_VERSION,
    AUTOSAVE_SLOT,
    store: null,
    auth: null,
    sections: new Map(),
    playtimeSec: 0,
    createdAt: null,
    lastAutosaveAt: 0,
    lastError: null,

    /* ---- wiring ---------------------------------------------------- */

    bind(store, auth) {
      this.store = store;
      this.auth = auth || ZS.Auth;
      return this;
    },

    register(name, section) {
      if (
        !section ||
        typeof section.capture !== "function" ||
        typeof section.apply !== "function"
      ) {
        throw new SaveError("bad_section", "section " + name + " needs capture() and apply()");
      }
      this.sections.set(name, section);
      return this;
    },

    tick(dt) {
      this.playtimeSec += dt;
    },

    /* ---- snapshot -------------------------------------------------- */

    /* Plain data only — no live agents, no canvas state, no functions.
       Content that never changes (skills, place names, the almanac) is code,
       and the save references it by id. */
    capture() {
      const now = new Date().toISOString();
      if (!this.createdAt) this.createdAt = now;
      const snap = {
        version: SCHEMA_VERSION,
        meta: {
          createdAt: this.createdAt,
          updatedAt: now,
          playtimeSec: Math.round(this.playtimeSec),
          appBuild: APP_BUILD,
          deviceId: (this.auth && this.auth.deviceId) || null,
        },
        settings: null,
        campaign: null,
        battle: null,
      };
      for (const [name, sec] of this.sections) snap[name] = sec.capture();
      return snap;
    },

    apply(snap) {
      if (!isPlainObject(snap)) throw new SaveError("bad_snapshot", "not an object");
      this.createdAt = (snap.meta && snap.meta.createdAt) || this.createdAt;
      this.playtimeSec = (snap.meta && snap.meta.playtimeSec) || 0;
      for (const [name, sec] of this.sections) {
        if (Object.prototype.hasOwnProperty.call(snap, name)) sec.apply(snap[name]);
      }
      return snap;
    },

    /* ---- versioning ------------------------------------------------ */

    migrateUp(snap) {
      if (!isPlainObject(snap)) throw new SaveError("bad_snapshot", "not an object");
      let v = snap.version | 0;
      if (v < 1) throw new SaveError("bad_version", "missing version");
      if (v > SCHEMA_VERSION) {
        /* A save from a newer build is refused whole, never half-read. */
        throw new SaveError("future_version", "save v" + v + " > build v" + SCHEMA_VERSION);
      }
      while (v < SCHEMA_VERSION) {
        const step = MIGRATIONS[v];
        if (typeof step !== "function") {
          throw new SaveError("no_migration", "v" + v + " -> v" + (v + 1));
        }
        snap = step(snap);
        v = snap.version | 0;
      }
      return snap;
    },

    validate(snap) {
      if (!isPlainObject(snap)) return "not an object";
      if ((snap.version | 0) !== SCHEMA_VERSION) return "version mismatch";
      if (!isPlainObject(snap.meta)) return "missing meta";
      return null;
    },

    /* ---- read / write ---------------------------------------------- */

    async _write(key, text) {
      const st = this.store;
      if (!st) throw new SaveError("no_store", "SaveManager.bind() was never called");
      if (st.capabilities && st.capabilities.atomic) {
        await st.set(key, text);
        return;
      }
      /* shadow -> main -> bak (§5.4). The previous value is preserved as :bak
         before main is overwritten, so a crash at any point leaves one whole
         readable save. */
      const prev = await st.get(key);
      await st.set(key + ":shadow", text);
      if (prev !== null) await st.set(key + ":bak", prev);
      await st.set(key, text);
      await st.remove(key + ":shadow");
    },

    async _read(key) {
      const st = this.store;
      if (!st) throw new SaveError("no_store", "SaveManager.bind() was never called");
      const tryParse = (text) => {
        if (text === null) return null;
        try {
          return JSON.parse(text);
        } catch {
          return null;
        }
      };
      let snap = tryParse(await st.get(key));
      if (snap) return snap;
      /* Main key absent or unparseable — fall back to the previous good save. */
      snap = tryParse(await st.get(key + ":bak"));
      return snap;
    },

    /* ---- public API ------------------------------------------------- */

    async save(slot) {
      const snap = this.capture();
      const problem = this.validate(snap);
      if (problem) throw new SaveError("invalid_capture", problem);
      await this._write(slotKey(slot), JSON.stringify(snap));
      return snap;
    },

    async load(slot) {
      const raw = await this._read(slotKey(slot));
      if (!raw) throw new SaveError("not_found", "no save in slot " + slot);
      const snap = this.migrateUp(raw);
      const problem = this.validate(snap);
      if (problem) throw new SaveError("invalid_save", problem);
      return this.apply(snap);
    },

    async has(slot) {
      return (await this._read(slotKey(slot))) !== null;
    },

    async deleteSlot(slot) {
      const k = slotKey(slot);
      await this.store.remove(k);
      await this.store.remove(k + ":shadow");
      await this.store.remove(k + ":bak");
    },

    /* [{ slot, meta:{ turn, faction, playtime, updatedAt } }], newest first. */
    async listSlots() {
      const keys = await this.store.keys(P + "slot:");
      const out = [];
      for (const k of keys) {
        if (k.endsWith(":shadow") || k.endsWith(":bak")) continue;
        const snap = await this._read(k);
        if (!snap) continue;
        const c = isPlainObject(snap.campaign) ? snap.campaign : {};
        out.push({
          slot: k.slice((P + "slot:").length),
          meta: {
            turn: c.turn === undefined ? null : c.turn,
            year: c.year === undefined ? null : c.year,
            faction: c.playerFactionId === undefined ? null : c.playerFactionId,
            playtime: (snap.meta && snap.meta.playtimeSec) || 0,
            updatedAt: (snap.meta && snap.meta.updatedAt) || null,
            version: snap.version | 0,
          },
        });
      }
      out.sort((a, b) => String(b.meta.updatedAt).localeCompare(String(a.meta.updatedAt)));
      return out;
    },

    /* Called only at the end of a World phase — a safe boundary, never
       mid-resolve. Throttled so a fast-clicked turn cannot thrash the store. */
    async autosave(force) {
      const now = Date.now();
      if (!force && now - this.lastAutosaveAt < AUTOSAVE_MIN_MS) return false;
      this.lastAutosaveAt = now;
      try {
        await this.save(AUTOSAVE_SLOT);
        this.lastError = null;
        return true;
      } catch (e) {
        this.lastError = e;
        return false;
      }
    },
  };

  ZS.SaveError = SaveError;
  ZS.SaveManager = SaveManager;
})();
