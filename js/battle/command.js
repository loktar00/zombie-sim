/* ZS.Command — selection and orders (SANGUO-DESIGN.md §4.4).

   The difference between watching a battle and commanding one. Cannae's units
   run a script; here the player picks blocks up and tells them where to go,
   and `ScenarioSanguo.order()` is the only door those instructions come
   through — which is also what makes the order log a replay (§3.6).

     left drag            box-select
     left click           select the block under the cursor (shift adds)
     right click          attack-move there; on an enemy block, charge it
     ctrl + right click   plain move — march, ignore what you pass
     shift + right click  queue the order behind the current one
     1-9 / ctrl+1-9       recall / assign a control group
     A                    select everything you own
     H                    halt where you stand
     F                    cycle the selection's formation
     space / , / .        pause, slower, faster
     esc                  clear the selection

   The pointer hooks return true to claim the gesture, which is how the camera
   knows not to pan under a drag-select (the scenario contract's
   pointerDown/Move/Up, already used by the Hold's dig-drag). */
(() => {
  "use strict";
  const ZS = (window.ZS = window.ZS || {});

  const PICK_R = 46; // click-select radius around a block's men
  const EXT = { hw: 0, hd: 0 }; // scratch: the drawn footprint, no per-frame alloc

  /* Half-width across the front and half-depth back, from the slot offsets. */
  function extents(slots) {
    let lx = 0,
      hx = 0,
      ly = 0,
      hy = 0;
    for (const s of slots) {
      if (s.x < lx) lx = s.x;
      if (s.x > hx) hx = s.x;
      if (s.y < ly) ly = s.y;
      if (s.y > hy) hy = s.y;
    }
    EXT.hw = (hx - lx) / 2;
    EXT.hd = (hy - ly) / 2;
    return EXT;
  }
  const DRAG_MIN = 10; // world px before a click becomes a drag
  const FORMS = ["line", "column", "wedge", "square", "skirmish"];

  const Command = {
    scen: null,
    selection: [],
    groups: new Map(),
    drag: null, // { x0, y0, x1, y1 } world-space box while dragging
    marks: [], // recent order markers, decayed for feedback
    hoverForm: 0,
    bound: false,

    attach(scen) {
      this.scen = scen;
      this.selection.length = 0;
      this.groups.clear();
      this.marks.length = 0;
      this.drag = null;
      if (this.bound) return this;
      this.bound = true;
      this._onKey = (e) => this.key(e);
      this._onCtx = (e) => e.preventDefault();
      window.addEventListener("keydown", this._onKey);
      const cv = document.getElementById("c");
      if (cv) cv.addEventListener("contextmenu", this._onCtx);
      return this;
    },

    detach() {
      if (!this.bound) return;
      this.bound = false;
      window.removeEventListener("keydown", this._onKey);
      const cv = document.getElementById("c");
      if (cv) cv.removeEventListener("contextmenu", this._onCtx);
      this.scen = null;
      this.selection.length = 0;
      this.groups.clear();
      this.marks.length = 0;
      this.drag = null;
    },

    /* ---------- selection ---------- */

    own(u) {
      return u.side === 0 && u.st !== ZS.ScenarioSanguo.STATES.ROUT && u.alive > 0;
    },

    select(units, add) {
      if (!add) {
        for (const u of this.selection) u.sel = false;
        this.selection.length = 0;
      }
      for (const u of units) {
        if (!this.own(u) || u.sel) continue;
        u.sel = true;
        this.selection.push(u);
      }
      return this.selection.length;
    },

    clear() {
      this.select([], false);
    },

    /* Drop blocks that have died or broken since they were picked. */
    prune() {
      let w = 0;
      for (let i = 0; i < this.selection.length; i++) {
        const u = this.selection[i];
        if (this.own(u)) this.selection[w++] = u;
        else u.sel = false;
      }
      this.selection.length = w;
    },

    unitAt(x, y, side) {
      if (!this.scen) return null;
      let best = null,
        bd = PICK_R * PICK_R;
      for (const u of this.scen.units) {
        if (!u.alive) continue;
        if (side !== undefined && u.side !== side) continue;
        for (const m of u.mem) {
          if (m.dead || m.routFlag) continue;
          const dx = m.x - x,
            dy = m.y - y;
          const d2 = dx * dx + dy * dy;
          if (d2 < bd) {
            bd = d2;
            best = u;
          }
        }
      }
      return best;
    },

    inBox(x0, y0, x1, y1) {
      const out = [];
      if (!this.scen) return out;
      const lx = Math.min(x0, x1),
        hx = Math.max(x0, x1);
      const ly = Math.min(y0, y1),
        hy = Math.max(y0, y1);
      for (const u of this.scen.units) {
        if (!this.own(u)) continue;
        for (const m of u.mem) {
          if (m.dead || m.routFlag) continue;
          if (m.x >= lx && m.x <= hx && m.y >= ly && m.y <= hy) {
            out.push(u);
            break;
          }
        }
      }
      return out;
    },

    /* ---------- pointer ---------- */

    pointerDown(x, y, e) {
      if (!this.scen) return false;
      if (e && e.button === 2) {
        this.issue(x, y, e);
        return true; // claimed: no camera pan on an order
      }
      if (e && e.button !== 0) return false;
      this.drag = { x0: x, y0: y, x1: x, y1: y, add: !!(e && e.shiftKey) };
      return true;
    },

    pointerMove(x, y) {
      if (this.drag) {
        this.drag.x1 = x;
        this.drag.y1 = y;
      }
    },

    pointerUp(x, y, e) {
      if (!this.drag) return;
      const d = this.drag;
      this.drag = null;
      const moved = Math.hypot(x - d.x0, y - d.y0);
      if (moved < DRAG_MIN) {
        const u = this.unitAt(x, y, 0);
        this.select(u ? [u] : [], d.add || (e && e.shiftKey));
      } else {
        this.select(this.inBox(d.x0, d.y0, x, y), d.add);
      }
    },

    /* ---------- orders ---------- */

    issue(x, y, e) {
      this.prune();
      if (!this.selection.length) return;
      const queue = !!(e && e.shiftKey);
      const plain = !!(e && (e.ctrlKey || e.metaKey));
      const foe = this.unitAt(x, y, 1);
      const kind = foe ? "charge" : plain ? "move" : "attack";
      const tx = foe ? foe.cx : x;
      const ty = foe ? foe.cy : y;
      /* Several blocks ordered to one point would grind into each other, so
         they fan out along the line perpendicular to the march. */
      const n = this.selection.length;
      const spread = n > 1 ? 110 : 0;
      for (let i = 0; i < n; i++) {
        const u = this.selection[i];
        const ang = Math.atan2(ty - u.cy, tx - u.cx);
        const px = -Math.sin(ang),
          py = Math.cos(ang); // perpendicular to the march
        const off = (i - (n - 1) / 2) * spread;
        this.scen.order(u, kind, tx + px * off, ty + py * off, { queue });
      }
      this.marks.push({ x: tx, y: ty, t: 1.1, kind });
      if (this.marks.length > 12) this.marks.shift();
    },

    halt() {
      this.prune();
      for (const u of this.selection) this.scen.order(u, "hold", u.cx, u.cy);
    },

    cycleFormation() {
      this.prune();
      if (!this.selection.length) return;
      this.hoverForm = (this.hoverForm + 1) % FORMS.length;
      for (const u of this.selection) this.scen.setFormation(u, FORMS[this.hoverForm]);
    },

    /* ---------- keyboard ---------- */

    key(e) {
      if (!this.scen) return;
      const eng = ZS.engine;
      const k = e.key;
      if (k >= "1" && k <= "9") {
        const g = +k;
        if (e.ctrlKey || e.metaKey) {
          this.prune();
          this.groups.set(g, this.selection.slice());
        } else {
          const list = (this.groups.get(g) || []).filter((u) => this.own(u));
          this.select(list, e.shiftKey);
        }
        e.preventDefault();
        return;
      }
      switch (k.toLowerCase()) {
        case "a":
          this.select(
            this.scen.units.filter((u) => this.own(u)),
            false,
          );
          break;
        case "h":
          this.halt();
          break;
        case "f":
          this.cycleFormation();
          break;
        case "escape":
          this.clear();
          break;
        case " ":
          if (eng) eng.speed = eng.speed > 0 ? 0 : 1;
          e.preventDefault();
          break;
        case ",":
          if (eng) eng.speed = Math.max(0.5, (eng.speed || 1) / 2);
          break;
        case ".":
          if (eng) eng.speed = Math.min(4, (eng.speed || 0.5) * 2);
          break;
        default:
          return;
      }
    },

    /* ---------- world-space overlay ---------- */

    drawWorld(c, scen) {
      if (!scen) return;
      this.prune();
      c.lineCap = "round";

      // order markers: a wobbly ring where the last order landed
      for (let i = this.marks.length - 1; i >= 0; i--) {
        const m = this.marks[i];
        m.t -= 1 / 60;
        if (m.t <= 0) {
          this.marks.splice(i, 1);
          continue;
        }
        const k = m.t / 1.1;
        const r = 10 + (1 - k) * 16;
        c.strokeStyle =
          m.kind === "charge"
            ? "rgba(150,54,44," + (0.7 * k).toFixed(2) + ")"
            : "rgba(61,52,43," + (0.55 * k).toFixed(2) + ")";
        c.lineWidth = 1.4;
        ZS.wcirc(c, m.x, m.y, r, 300 + i * 7, 1.6);
      }

      // the selected blocks
      for (const u of this.selection) {
        /* The marker is the formation's own footprint, rotated to the unit's
           heading — a circle around a 17-wide, 4-deep battle line says nothing
           about which way it is facing or how much ground it holds. */
        const ext = extents(u.slots);
        const across = Math.max(18, ext.hw + 10);
        const deep = Math.max(12, ext.hd + 10);
        const ch = Math.cos(u.head),
          sh = Math.sin(u.head);
        const corner = (ax, dy) => ({
          x: u.cx + ax * sh + dy * ch,
          y: u.cy - ax * ch + dy * sh,
        });
        c.strokeStyle = ZS.figure.wash(u.faction, 0.75);
        c.lineWidth = 1.5;
        ZS.wpoly(
          c,
          [
            corner(-across, deep),
            corner(across, deep),
            corner(across, -deep),
            corner(-across, -deep),
          ],
          u.uid * 13.7,
          1.8,
          true,
        );
        c.stroke();

        // facing tick off the front edge, so a wheeling block reads early
        c.strokeStyle = ZS.figure.wash(u.faction, 0.5);
        c.lineWidth = 1.2;
        const f0 = corner(0, deep),
          f1 = corner(0, deep + 22);
        ZS.wline(c, f0.x, f0.y, f1.x, f1.y, u.uid * 5.3, 1);

        // strength bar: how much of the block is still standing
        const frac = u.size0 ? u.alive / u.size0 : 0;
        const bw = 34,
          by = u.cy - Math.max(across, deep) - 14;
        c.strokeStyle = "rgba(61,52,43,0.35)";
        c.lineWidth = 1;
        ZS.wline(c, u.cx - bw / 2, by, u.cx + bw / 2, by, u.uid * 3.1, 0.6);
        c.strokeStyle = ZS.figure.wash(u.faction, 0.85);
        c.lineWidth = 2.4;
        if (frac > 0) {
          ZS.wline(c, u.cx - bw / 2, by, u.cx - bw / 2 + bw * frac, by, u.uid * 3.1 + 1, 0.5);
        }

        // the order it is carrying out
        if (u.orders.length) {
          const o = u.orders[0];
          c.strokeStyle = "rgba(61,52,43,0.28)";
          c.lineWidth = 1.1;
          c.setLineDash([5, 6]);
          c.beginPath();
          c.moveTo(u.cx, u.cy);
          c.lineTo(o.x, o.y);
          c.stroke();
          c.setLineDash([]);
        }
      }

      // the drag box
      if (this.drag) {
        const d = this.drag;
        const x = Math.min(d.x0, d.x1),
          y = Math.min(d.y0, d.y1);
        const w = Math.abs(d.x1 - d.x0),
          h = Math.abs(d.y1 - d.y0);
        c.strokeStyle = "rgba(61,52,43,0.55)";
        c.lineWidth = 1.3;
        ZS.wpoly(
          c,
          [
            { x, y },
            { x: x + w, y },
            { x: x + w, y: y + h },
            { x, y: y + h },
          ],
          77.7,
          1.4,
          true,
        );
        c.stroke();
      }
    },
  };

  ZS.Command = Command;
})();
