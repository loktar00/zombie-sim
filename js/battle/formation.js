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

  function gap(o) {
    const value = Number(o.spacing);
    return value > 0 ? value : SP;
  }

  /* Each generator fills `out` with {x, y} records and returns it. They are
     called on re-solve only, so allocating the records is fine. */
  const KINDS = {
    /* Wide and shallow: the default battle line. */
    line(n, o) {
      const ranks = Math.min(n, Math.max(1, o.ranks || 4));
      const cols = Math.max(1, Math.ceil(n / ranks));
      const spacing = gap(o);
      return grid(n, cols, spacing, spacing, 0);
    },
    /* Narrow and deep: marches through gaps, weak frontage. */
    column(n, o) {
      const cols = Math.min(n, Math.max(1, o.cols || Math.round(Math.sqrt(n) * 0.5)));
      const spacing = gap(o);
      return grid(n, cols, spacing, spacing, 0);
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
    /* Concentric perimeter ranks: the outside stays visibly square while the
       open centre and outward facings distinguish it from a deep line. */
    square(n, o) {
      return square(n, o);
    },
    /* Loose order: broad but bounded, with staggered ranks. Deriving the
       frontage from sqrt(n) avoids the kilometre-wide three-rank strip the
       original generator made for large units. */
    skirmish(n, o) {
      const spacing = gap(o);
      const cols = Math.min(n, Math.max(1, o.cols || Math.ceil(Math.sqrt(n * 2.1))));
      return looseGrid(n, cols, spacing * 1.65, spacing * 1.55);
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

  function looseGrid(n, cols, sx, sy) {
    const out = [];
    const rows = Math.ceil(n / cols);
    for (let row = 0, placed = 0; row < rows; row++) {
      const count = Math.min(cols, n - placed);
      const stagger = (row & 1 ? 0.22 : -0.22) * sx;
      for (let col = 0; col < count; col++, placed++) {
        out.push({
          x: (col - (count - 1) / 2) * sx + stagger,
          y: ((rows - 1) / 2 - row) * sy,
        });
      }
    }
    return out;
  }

  function perimeterCount(side) {
    if (side <= 0) return 0;
    if (side === 1) return 1;
    return side * 4 - 4;
  }

  function squareCapacity(side, depth) {
    let total = 0;
    for (let ring = 0; ring < depth; ring++) total += perimeterCount(side - ring * 2);
    return total;
  }

  function squareRing(side, ring, spacing) {
    const out = [];
    const lo = ring;
    const hi = side - 1 - ring;
    const half = (side - 1) / 2;
    if (lo > hi) return out;
    if (lo === hi) return [{ x: 0, y: 0, face: 0 }];
    for (let x = lo; x <= hi; x++) {
      out.push({ x: (x - half) * spacing, y: (hi - half) * spacing, face: 0 });
    }
    for (let y = hi - 1; y >= lo; y--) {
      out.push({ x: (hi - half) * spacing, y: (y - half) * spacing, face: -Math.PI / 2 });
    }
    for (let x = hi - 1; x >= lo; x--) {
      out.push({ x: (x - half) * spacing, y: (lo - half) * spacing, face: Math.PI });
    }
    for (let y = lo + 1; y < hi; y++) {
      out.push({ x: (lo - half) * spacing, y: (y - half) * spacing, face: Math.PI / 2 });
    }
    return out;
  }

  function square(n, o) {
    if (!n) return [];
    const spacing = gap(o);
    const depth = Math.max(1, o.depth || Math.min(4, Math.max(2, Math.round(Math.sqrt(n) / 4))));
    let side = 1;
    while (squareCapacity(side, depth) < n) side++;

    const out = [];
    for (let ring = 0; ring < depth && out.length < n; ring++) {
      const candidates = squareRing(side, ring, spacing);
      const remaining = n - out.length;
      if (remaining >= candidates.length) {
        out.push(...candidates);
        continue;
      }
      /* Spread an incomplete inner rank around all four faces instead of
         filling one side first. That keeps casualty-resolved squares balanced. */
      for (let i = 0; i < remaining; i++) {
        out.push(candidates[Math.floor((i * candidates.length) / remaining)]);
      }
    }
    return out;
  }

  const Formation = {
    SP,
    KINDS: Object.keys(KINDS),

    /* n slots for `kind`. `opts` is per-kind (ranks / cols / depth / spacing).

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
      const order = slots
        .slice()
        .sort((a, b) => b.y - a.y)
        .slice(0, live.length);
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
        live[best].sf = s.face || 0;
      }
      return live.length;
    },
  };

  ZS.Formation = Formation;
})();
