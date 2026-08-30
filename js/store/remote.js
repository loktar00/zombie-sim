/* ZS.RemoteStore — optional server backing for ZS.Store (SANGUO-DESIGN.md §5.2, §5.5).

   Never required: the game is fully playable with LocalStore forever. This
   exists so switching backends is one line at boot. Wire-up is deliberately
   boring REST:

     GET    <base>/saves/<key>   -> 200 body = the blob, ETag: <version>
                                   404 = absent (resolves to null)
     PUT    <base>/saves/<key>   body = the blob, If-Match: <etag> when known
     DELETE <base>/saves/<key>
     GET    <base>/saves?prefix= -> JSON string[] of keys

   Authorization comes from ZS.Auth.getToken() — an anonymous deviceId token in
   Stage 1, an OAuth bearer in Stage 2. RemoteStore does not care which.

   Not exercised until P6; it is written now so the seam is real rather than
   theoretical. */
(() => {
  "use strict";
  const ZS = (window.ZS = window.ZS || {});

  const RETRIES = 3;
  const BACKOFF_MS = 300;

  function sleep(ms) {
    return new Promise((r) => setTimeout(r, ms));
  }

  class RemoteStore {
    constructor(baseUrl, opts) {
      this.name = "remote";
      this.base = String(baseUrl || "").replace(/\/+$/, "");
      this.auth = (opts && opts.auth) || ZS.Auth;
      this.fetch = (opts && opts.fetch) || window.fetch.bind(window);
      this.etags = new Map();
      this.capabilities = { cloud: true, quotaBytes: null, atomic: true };
    }

    async _headers(extra) {
      const h = { "Content-Type": "text/plain;charset=utf-8" };
      const token = this.auth ? await this.auth.getToken() : null;
      if (token) h.Authorization = "Bearer " + token;
      if (extra) Object.assign(h, extra);
      return h;
    }

    /* One request with bounded retry/backoff. 4xx never retries (it is our
       fault, not the network's); 5xx and network faults do. */
    async _req(path, init, okNull) {
      let lastErr = null;
      for (let attempt = 0; attempt < RETRIES; attempt++) {
        try {
          const res = await this.fetch(this.base + path, init);
          if (res.status === 404 && okNull) return null;
          if (res.status === 412) {
            const err = new Error("store_conflict");
            err.code = "conflict";
            throw err;
          }
          if (res.status >= 400 && res.status < 500) {
            const err = new Error("store_http_" + res.status);
            err.code = "http";
            err.status = res.status;
            throw err;
          }
          if (!res.ok) throw new Error("store_http_" + res.status);
          return res;
        } catch (e) {
          if (e.code === "http" || e.code === "conflict") throw e;
          lastErr = e;
          // no point waiting out a backoff we are never going to use
          if (attempt < RETRIES - 1) await sleep(BACKOFF_MS * Math.pow(2, attempt));
        }
      }
      const err = new Error("store_unreachable");
      err.code = "unreachable";
      err.cause = lastErr;
      throw err;
    }

    async get(key) {
      const res = await this._req(
        "/saves/" + encodeURIComponent(key),
        { method: "GET", headers: await this._headers() },
        true,
      );
      if (!res) return null;
      const tag = res.headers && res.headers.get("ETag");
      if (tag) this.etags.set(key, tag);
      return await res.text();
    }

    async set(key, value) {
      const tag = this.etags.get(key);
      const res = await this._req("/saves/" + encodeURIComponent(key), {
        method: "PUT",
        headers: await this._headers(tag ? { "If-Match": tag } : null),
        body: String(value),
      });
      const next = res.headers && res.headers.get("ETag");
      if (next) this.etags.set(key, next);
    }

    async remove(key) {
      await this._req(
        "/saves/" + encodeURIComponent(key),
        { method: "DELETE", headers: await this._headers() },
        true,
      );
      this.etags.delete(key);
    }

    async keys(prefix) {
      const res = await this._req(
        "/saves?prefix=" + encodeURIComponent(prefix || ""),
        { method: "GET", headers: await this._headers() },
        true,
      );
      if (!res) return [];
      const list = await res.json();
      return Array.isArray(list) ? list.map(String).sort() : [];
    }
  }

  ZS.RemoteStore = RemoteStore;
})();
