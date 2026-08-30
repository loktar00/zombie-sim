/* ZS.Auth — the identity seam (docs/SANGUO-DESIGN.md §5.5).

   Stage 1 (now): AnonAuth. No accounts, no login. First run mints a random
   deviceId into "hsg:v1:device"; it is the principal stamped on every snapshot
   and the token RemoteStore would send.

   Stage 2 (later): OAuthAuth (PKCE) drops in behind the same four methods and
   RemoteStore is unchanged. Migrating an anon player to a signed-in account is
   "push the deviceId save up on first sync" — the Store contract never moves.

     bind(store)      pick the backing store (once, at boot)
     init()           load-or-mint; resolves to the deviceId
     getToken()       -> string | null   (Authorization: Bearer <token>)
     isSignedIn()     -> bool            (anon is NOT signed in)
     signIn()/signOut()                  (no-ops for anon) */
(() => {
  "use strict";
  const ZS = (window.ZS = window.ZS || {});

  const DEVICE_KEY = ZS.Store.PREFIX + "device";

  /* crypto.randomUUID is the happy path; getRandomValues covers older engines;
     the Math.random tail exists so a locked-down file:// page still boots. */
  function uuid() {
    const c = window.crypto || window.msCrypto;
    if (c && typeof c.randomUUID === "function") return c.randomUUID();
    const b = new Uint8Array(16);
    if (c && typeof c.getRandomValues === "function") c.getRandomValues(b);
    else for (let i = 0; i < 16; i++) b[i] = (Math.random() * 256) | 0;
    b[6] = (b[6] & 0x0f) | 0x40;
    b[8] = (b[8] & 0x3f) | 0x80;
    const h = [];
    for (let i = 0; i < 16; i++) h.push(b[i].toString(16).padStart(2, "0"));
    return (
      h.slice(0, 4).join("") +
      "-" +
      h.slice(4, 6).join("") +
      "-" +
      h.slice(6, 8).join("") +
      "-" +
      h.slice(8, 10).join("") +
      "-" +
      h.slice(10, 16).join("")
    );
  }

  class AnonAuth {
    constructor() {
      this.kind = "anon";
      this.store = null;
      this.deviceId = null;
      this.minted = false; // true when this boot created the id (first run)
    }

    bind(store) {
      this.store = store;
      return this;
    }

    async init() {
      if (this.deviceId) return this.deviceId;
      let id = this.store ? await this.store.get(DEVICE_KEY) : null;
      if (!id || typeof id !== "string" || id.length < 8) {
        id = uuid();
        this.minted = true;
        if (this.store) await this.store.set(DEVICE_KEY, id);
      }
      this.deviceId = id;
      return id;
    }

    async getToken() {
      return this.deviceId || (await this.init());
    }

    isSignedIn() {
      return false;
    }

    async signIn() {
      /* Stage 2: OAuthAuth replaces this instance. Anon has nothing to do. */
      return false;
    }

    async signOut() {
      return false;
    }
  }

  ZS.AnonAuth = AnonAuth;
  ZS.Auth = new AnonAuth(); // the live instance; swapped wholesale in Stage 2
  ZS.Auth.DEVICE_KEY = DEVICE_KEY;
  ZS.uuid = uuid;
})();
