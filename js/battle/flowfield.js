/* ZS.FlowField — group movement without per-agent A* (docs/SANGUO-DESIGN.md §4.4).

   `ZS.Nav.astar` is a fine path for one man and a terrible one for two hundred
   moving to the same place: the same search, two hundred times, against a
   shared per-frame budget. A flow field inverts it — one Dijkstra pass *from*
   the destination over the whole walkable grid, after which every cell already
   knows which way is downhill. A unit reads its own cell and steers; the
   existing separation pass keeps the crowd from stacking.

   One pass costs a few ms on a 160x120 grid and happens only when a unit is
   given a new destination, not per frame. `ZS.Nav.astar` stays for single
   generals and edge routing.

   Fields share the nav grid's 20 px cells, so `nav.isWalkable` is the only
   passability opinion in the system.

     const ff = new ZS.FlowField(nav);
     ff.build(goalX, goalY);
     ff.sample(x, y, out);   // out.x, out.y = unit vector downhill; false if unreachable
     ff.distAt(x, y);        // path cost to the goal, or Infinity */
(() => {
  "use strict";
  const ZS = (window.ZS = window.ZS || {});

  const CELL = 20; // must match js/nav.js
  const INF = Infinity;
  /* 8-neighbourhood, integer-ish costs (10 / 14) so the heap compares cleanly. */
  const DX = [1, -1, 0, 0, 1, 1, -1, -1];
  const DY = [0, 0, 1, -1, 1, -1, 1, -1];
  const DC = [10, 10, 10, 10, 14, 14, 14, 14];
  const INV = 1 / Math.SQRT2;

  class FlowField {
    constructor(nav) {
      this.nav = nav;
      this.w = nav.w | 0;
      this.h = nav.h | 0;
      this.n = this.w * this.h;
      this.cost = new Float32Array(this.n);
      this.dir = new Int8Array(this.n); // index into DX/DY, -1 = none
      this.done = new Uint8Array(this.n); // settled: pop it again and skip
      /* Binary min-heap. Two parallel arrays, because both of the obvious
         shortcuts are wrong here:

         - Sizing it `n + 1` drops pushes on the floor. This is
           decrease-key-by-reinsertion, so a cell is pushed once per improving
           edge; the bound is edges, not cells, and a typed array silently
           ignores out-of-range writes. It grows on demand instead (the live
           frontier is small, so in practice it never does).
         - Keying entries by reading `cost[cell]` at compare time re-keys
           entries that are *already in the heap* the moment a shorter path to
           that cell is found. The ordering silently breaks, cells settle at
           the wrong cost, and whole regions of the map stop expanding. The key
           is therefore copied in at push time and never moves. */
      this.heapI = new Int32Array(Math.max(1024, (this.n >> 2) + 1));
      this.heapK = new Float32Array(this.heapI.length);
      this.hn = 0;
      this.goalI = -1;
      this.goalX = 0;
      this.goalY = 0;
      this.reqI = -1; // the cell that was *asked* for, before any relocation
      this.navV = -1;
      this.built = false;
    }

    /* True when a rebuild would be wasted: the same goal cell was asked for,
       against the same nav version. Comparing against the *resolved* goal
       instead would miss every time the request had to be relocated onto open
       ground, and rebuild the identical field on every order. */
    isFor(x, y) {
      return this.built && this.navV === this.nav.version && this.nav.idx(x, y) === this.reqI;
    }

    build(x, y) {
      const nav = this.nav;
      this.reqI = nav.idx(x, y);
      /* A build that cannot start invalidates the field. Leaving `built` set
         meant the previous goal's costs were still sitting in the arrays, so
         `distAt` cheerfully answered for a destination this field knows
         nothing about — and an impossible order was accepted as reachable. */
      let gi = this.reqI;
      if (gi < 0 || !nav.isWalkable(x, y, false)) {
        /* Ordered onto a wall or off the map: aim at the nearest open ground
           instead of refusing the order outright. */
        const p = nav.nearestWalkable(x, y, 400, false);
        if (!p) {
          this.built = false;
          return false;
        }
        x = p.x;
        y = p.y;
        gi = nav.idx(x, y);
        if (gi < 0) {
          this.built = false;
          return false;
        }
      }
      this.goalI = gi;
      this.goalX = x;
      this.goalY = y;
      this.navV = nav.version;
      this.cost.fill(INF);
      this.dir.fill(-1);
      this.done.fill(0);
      this.hn = 0;
      this.cost[gi] = 0;
      this._push(gi, 0);

      const w = this.w,
        h = this.h;
      while (this.hn > 0) {
        const i = this._pop();
        if (this.done[i]) continue; // a stale entry from before a shorter path
        this.done[i] = 1;
        const ci = this.cost[i];
        const ix = i % w,
          iy = (i / w) | 0;
        for (let d = 0; d < 8; d++) {
          const nx = ix + DX[d],
            ny = iy + DY[d];
          if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
          const ni = ny * w + nx;
          /* Walkability is asked in world coordinates so doors, water and
             building interiors all answer through the one nav opinion. */
          if (!nav.isWalkable(nx * CELL + 10, ny * CELL + 10, false)) continue;
          if (d >= 4) {
            /* No cutting a diagonal between two blocked orthogonals. */
            if (
              !nav.isWalkable(nx * CELL + 10, iy * CELL + 10, false) ||
              !nav.isWalkable(ix * CELL + 10, ny * CELL + 10, false)
            )
              continue;
          }
          const nc = ci + DC[d];
          if (nc < this.cost[ni]) {
            this.cost[ni] = nc;
            /* The neighbour's downhill direction points back at `i`, i.e. the
               opposite of the direction we expanded in. */
            this.dir[ni] = OPP[d];
            this._push(ni, nc);
          }
        }
      }
      this.built = true;
      return true;
    }

    distAt(x, y) {
      if (!this.built) return INF;
      const i = this.nav.idx(x, y);
      return i < 0 ? INF : this.cost[i];
    }

    /* Writes the downhill unit vector into `out` and returns true. At (or
       beyond) the goal, and on unreachable ground, returns false and leaves
       `out` alone — the caller decides whether to hold or fall back. */
    sample(x, y, out) {
      const i = this.nav.idx(x, y);
      if (i < 0 || !this.built) return false;
      if (i === this.goalI) return false;
      const d = this.dir[i];
      if (d < 0) return false;
      const dx = DX[d],
        dy = DY[d];
      if (dx && dy) {
        out.x = dx * INV;
        out.y = dy * INV;
      } else {
        out.x = dx;
        out.y = dy;
      }
      return true;
    }

    /* ---- heap ---- */

    _push(i, key) {
      if (this.hn + 2 >= this.heapI.length) {
        const bi = new Int32Array(this.heapI.length * 2);
        bi.set(this.heapI);
        this.heapI = bi;
        const bk = new Float32Array(bi.length);
        bk.set(this.heapK);
        this.heapK = bk;
      }
      const hi = this.heapI,
        hk = this.heapK;
      let k = ++this.hn;
      hi[k] = i;
      hk[k] = key;
      while (k > 1) {
        const p = k >> 1;
        if (hk[p] <= hk[k]) break;
        const ti = hi[p],
          tk = hk[p];
        hi[p] = hi[k];
        hk[p] = hk[k];
        hi[k] = ti;
        hk[k] = tk;
        k = p;
      }
    }

    _pop() {
      const hi = this.heapI,
        hk = this.heapK;
      const top = hi[1];
      hi[1] = hi[this.hn];
      hk[1] = hk[this.hn];
      this.hn--;
      let k = 1;
      for (;;) {
        const l = k << 1,
          r = l + 1;
        let m = k;
        if (l <= this.hn && hk[l] < hk[m]) m = l;
        if (r <= this.hn && hk[r] < hk[m]) m = r;
        if (m === k) break;
        const ti = hi[m],
          tk = hk[m];
        hi[m] = hi[k];
        hk[m] = hk[k];
        hi[k] = ti;
        hk[k] = tk;
        k = m;
      }
      return top;
    }
  }

  /* Opposite of each direction index, so a cell points back the way we came. */
  const OPP = new Int8Array(8);
  for (let d = 0; d < 8; d++) {
    for (let e = 0; e < 8; e++) if (DX[e] === -DX[d] && DY[e] === -DY[d]) OPP[d] = e;
  }

  ZS.FlowField = FlowField;
})();
