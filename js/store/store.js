/* ZS.Store — the persistence seam (SANGUO-DESIGN.md §5.2).

   A Store is dumb key/blob persistence. Gameplay code NEVER touches
   localStorage or fetch directly; it goes through ZS.SaveManager, which talks
   to whichever Store was bound at boot. Swapping local -> server is one line
   at boot and zero gameplay changes.

   Contract (every implementation honours this exactly):
     async get(key)          -> string | null
     async set(key, value)   -> void    (durable before it resolves)
     async remove(key)       -> void
     async keys(prefix)      -> string[]
     capabilities            -> { cloud, quotaBytes, atomic }

   Keys are namespaced by ZS.Store.PREFIX ("hsg:v1:"). */
(() => {
  "use strict";
  const ZS = (window.ZS = window.ZS || {});

  const PREFIX = "hsg:v1:";

  /* MemoryStore: a Map. Used by tests/probes and as the always-available
     fallback when localStorage is unavailable (private mode, file:// quirks). */
  class MemoryStore {
    constructor() {
      this.name = "memory";
      this.map = new Map();
      this.capabilities = { cloud: false, quotaBytes: null, atomic: true };
    }
    async get(key) {
      const v = this.map.get(key);
      return v === undefined ? null : v;
    }
    async set(key, value) {
      this.map.set(key, String(value));
    }
    async remove(key) {
      this.map.delete(key);
    }
    async keys(prefix) {
      const out = [];
      for (const k of this.map.keys()) if (!prefix || k.startsWith(prefix)) out.push(k);
      out.sort();
      return out;
    }
  }

  ZS.Store = { PREFIX };
  ZS.MemoryStore = MemoryStore;
})();
