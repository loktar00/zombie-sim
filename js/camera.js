/* Camera: pan + zoom over the world. Screen center maps to world (x, y).
   All input (drag, wheel, pinch) funnels through zoomAt/panBy/toWorld. */
(() => {
  "use strict";
  const ZS = (window.ZS = window.ZS || {});

  class Camera {
    constructor(world) {
      this.world = world;
      this.x = world.w / 2;
      this.y = world.h / 2;
      this.zoom = 1;
      this.minZoom = 0.1;
      this.maxZoom = 2.5;
      this.auto = false;
      // Render-only feedback offset in screen pixels. It is additive after
      // follow/clamp and never changes the simulated camera focus.
      this.shakeX = 0;
      this.shakeY = 0;
    }

    // fit the whole world into the viewport, centered
    fit(vw, vh) {
      this.zoom = Math.min(vw / this.world.w, vh / this.world.h);
      this.x = this.world.w / 2;
      this.y = this.world.h / 2;
    }

    // keep zoom and the view rect inside the world
    clamp(vw, vh) {
      this.zoom = ZS.clamp(this.zoom, this.minZoom, this.maxZoom);
      const hw = vw / this.zoom / 2,
        hh = vh / this.zoom / 2;
      this.x = hw * 2 >= this.world.w ? this.world.w / 2 : ZS.clamp(this.x, hw, this.world.w - hw);
      this.y = hh * 2 >= this.world.h ? this.world.h / 2 : ZS.clamp(this.y, hh, this.world.h - hh);
    }

    toWorld(sx, sy, vw, vh) {
      return {
        x: (sx - vw / 2 - this.shakeX) / this.zoom + this.x,
        y: (sy - vh / 2 - this.shakeY) / this.zoom + this.y,
      };
    }

    // zoom so the world point under screen (sx, sy) stays fixed
    zoomAt(sx, sy, factor, vw, vh) {
      const p = this.toWorld(sx, sy, vw, vh);
      this.zoom = ZS.clamp(this.zoom * factor, this.minZoom, this.maxZoom);
      this.x = p.x - (sx - vw / 2) / this.zoom;
      this.y = p.y - (sy - vh / 2) / this.zoom;
      this.clamp(vw, vh);
    }

    panBy(dx, dy, vw, vh) {
      this.x -= dx / this.zoom;
      this.y -= dy / this.zoom;
      this.clamp(vw, vh);
    }

    // auto-follow: exponential smoothing toward the scenario's interest
    // point so the camera glides instead of snapping; the scenario tunes
    // the time constant via the ease arg; main() calls this while cam.auto
    autoSeek(tx, ty, tz, dt, vw, vh, ease) {
      // exponential smoothing toward the target: the camera glides instead
      // of leaping (ease = the time constant in seconds, the scenario tunes
      // it; the default keeps the classic 0.7s)
      const e = ease || 0.7,
        kx = 1 - Math.exp(-dt / e),
        kz = 1 - Math.exp(-dt / (e * 1.286));
      this.x += (tx - this.x) * kx;
      this.y += (ty - this.y) * kx;
      this.zoom += (tz - this.zoom) * kz;
      this.clamp(vw, vh);
    }

    apply(c, vw, vh) {
      c.translate(vw / 2 + this.shakeX, vh / 2 + this.shakeY);
      c.scale(this.zoom, this.zoom);
      c.translate(-this.x, -this.y);
    }

    // world-space rect currently on screen (+margin), for draw culling
    visible(vw, vh, margin) {
      const hw = vw / this.zoom / 2 + margin,
        hh = vh / this.zoom / 2 + margin;
      return { x0: this.x - hw, y0: this.y - hh, x1: this.x + hw, y1: this.y + hh };
    }
  }

  ZS.Camera = Camera;
})();
