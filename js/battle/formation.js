/* ZS.Formation — formations as data (docs/SANGUO-DESIGN.md §4.4).

   Cannae bakes each unit's shape into its deployment; here a formation is a
   pure slot-offset generator the player can change mid-battle. Offsets are
   unit-local, in the same frame the Cannae slot seek already uses:

     +x = the unit's right,  +y = the unit's facing (forward)

   so `_seekSlot` rotating by the unit heading is unchanged.

   `assign()` re-solves which man stands in which slot. It runs whenever the
   formation changes or the unit's count drops enough to leave holes — greedy
   nearest-first, which is O(n·k) but only on re-solve, never per frame, and
   gives visibly sensible movement (nobody crosses the whole block to reach a
   slot someone else was standing next to). */
(() => {
  "use strict";
  const ZS = (window.ZS = window.ZS || {});

  const SP = 13; // slot spacing; matches the packed-rank sepR the engine uses

  /* Each generator fills `out` with {x, y} records and returns it. They are
     called on re-solve only, so allocating the records is fine. */
  const KINDS = {
    /* Wide and shallow: the default battle line. */
    line(n, o) {
      const ranks = Math.max(1, o.ranks || 4);
      const cols = Math.max(1, Math.ceil(n / ranks));
      return grid(n, cols, SP, SP, 0);
    },
    /* Narrow and deep: marches through gaps, weak frontage. */
    column(n, o) {
      const cols = Math.max(1, o.cols || 6);
      return grid(n, cols, SP, SP, 0);
    },
    /* A blunt arrowhead: fewer men in front, mass behind. Cavalry default. */
    wedge(n) {
      const out = [];
      let row = 0,
        placed = 0;
      while (placed < n) {
        const wide = row + 1;
        for (let i = 0; i < wide && placed < n; i++, placed++) {
          out.push({ x: (i - (wide - 1) / 2) * SP, y: -row * SP * 0.86 });
        }
        row++;
      }
      return out;
    },
    /* A hollow-ish box facing every way: slow, hard to flank. */
    square(n) {
      const side = Math.max(2, Math.round(Math.sqrt(n)));
      return grid(n, side, SP, SP, 0);
    },
    /* Loose order: the same footprint at double spacing, so missiles and
       charges bite less and the block moves through broken ground. */
    skirmish(n, o) {
      const ranks = Math.max(1, o.ranks || 3);
      const cols = Math.max(1, Math.ceil(n / ranks));
      return grid(n, cols, SP * 1.9, SP * 1.7, 0);
    },
  };

  function grid(n, cols, sx, sy, bulge) {
    const out = [];
    const rows = Math.ceil(n / cols);
    for (let k = 0; k < n; k++) {
      const col = k % cols;
      const row = (k / cols) | 0;
      const bx = cols > 1 && bulge ? bulge * Math.sin((Math.PI * col) / (cols - 1)) : 0;
      out.push({
        x: (col - (cols - 1) / 2) * sx,
        y: ((rows - 1) / 2 - row) * sy + bx,
      });
    }
    return out;
  }

  const Formation = {
    SP,
    KINDS: Object.keys(KINDS),

    /* n slots for `kind`. `opts` is per-kind (ranks / cols).

       Always re-centred on the slots' own centroid. A generator that is not
       balanced about the origin — the wedge grows backwards from its point —
       otherwise starts a runaway: every man seeks a slot offset behind the
       unit centroid, the centroid follows them back, the slots move again, and
       the block crawls off the field under its own formation. Centring here
       means a new generator cannot reintroduce it. */
    slots(kind, n, opts) {
      const gen = KINDS[kind] || KINDS.line;
      const out = gen(Math.max(0, n | 0), opts || {});
      if (!out.length) return out;
      let mx = 0,
        my = 0;
      for (const s of out) {
        mx += s.x;
        my += s.y;
      }
      mx /= out.length;
      my /= out.length;
      for (const s of out) {
        s.x -= mx;
        s.y -= my;
      }
      return out;
    },

    /* The front rank's half-width — what the unit's frontage marker draws. */
    frontage(slots) {
      let lo = 0,
        hi = 0;
      for (const s of slots) {
        if (s.x < lo) lo = s.x;
        if (s.x > hi) hi = s.x;
      }
      return (hi - lo) / 2;
    },

    /* Greedy nearest assignment of living members to slots, in the unit's
       current world frame. Writes `sx`/`sy` onto each member. Front slots are
       filled first, so a thinned unit closes up from the back. */
    assign(members, slots, cx, cy, head) {
      const ch = Math.cos(head),
        sh = Math.sin(head);
      const live = [];
      for (const m of members) if (!m.dead && !m.routFlag) live.push(m);
      /* Slots nearest the front go first. */
      const order = slots.slice(0, live.length).sort((a, b) => b.y - a.y);
      const taken = new Uint8Array(live.length);
      for (const s of order) {
        const wx = cx + s.x * sh + s.y * ch;
        const wy = cy - s.x * ch + s.y * sh;
        let best = -1,
          bd = Infinity;
        for (let i = 0; i < live.length; i++) {
          if (taken[i]) continue;
          const dx = live[i].x - wx,
            dy = live[i].y - wy;
          const d2 = dx * dx + dy * dy;
          if (d2 < bd) {
            bd = d2;
            best = i;
          }
        }
        if (best < 0) break;
        taken[best] = 1;
        live[best].sx = s.x;
        live[best].sy = s.y;
      }
      return live.length;
    },
  };

  ZS.Formation = Formation;
})();
