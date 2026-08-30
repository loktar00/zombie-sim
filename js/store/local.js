/* ZS.LocalStore — localStorage backing for ZS.Store (SANGUO-DESIGN.md §5.2).

   Dumb key/blob persistence, exactly the ZS.Store contract. It declares
   `atomic:false`, which is the signal SaveManager reads to run its
   shadow+swap+bak dance (§5.4) — the store itself stays dumb.

   localStorage is synchronous; the async signatures exist so a remote backend
   drops into the same shape with no gameplay change. */
(() => {
  "use strict";
  const ZS = (window.ZS = window.ZS || {});

  /* file:// pages get an opaque origin in some browsers, where touching
     localStorage throws outright. Probe once so boot can fall back cleanly. */
  function probe() {
    try {
      const k = "hsg:v1:__probe";
      window.localStorage.setItem(k, "1");
      window.localStorage.removeItem(k);
      return true;
    } catch {
      return false;
    }
  }

  class LocalStore {
    constructor() {
      this.name = "local";
      this.ls = window.localStorage;
      this.capabilities = { cloud: false, quotaBytes: 5 * 1024 * 1024, atomic: false };
    }

    static available() {
      return probe();
    }

    async get(key) {
      const v = this.ls.getItem(key);
      return v === null ? null : v;
    }

    async set(key, value) {
      try {
        this.ls.setItem(key, String(value));
      } catch (e) {
        const err = new Error("store_quota");
        err.cause = e;
        err.code = "quota";
        throw err;
      }
    }

    async remove(key) {
      this.ls.removeItem(key);
    }

    async keys(prefix) {
      const out = [];
      for (let i = 0; i < this.ls.length; i++) {
        const k = this.ls.key(i);
        if (k !== null && (!prefix || k.startsWith(prefix))) out.push(k);
      }
      out.sort();
      return out;
    }
  }

  ZS.LocalStore = LocalStore;
})();
