/* Rendering: everything in the sketch style — agents, trees, buildings,
   water, HUD. drawScene() is the per-frame pipeline: camera transform,
   pre-rendered ground, boiling water, then trees/buildings/agents sorted by
   y (painter's order) so people walk behind the town, not through it. */
(() => {
  "use strict";
  const ZS = (window.ZS = window.ZS || {});

  const HAND_DEFAULT = '"Segoe Script","Bradley Hand","Comic Sans MS",cursive';
  /* A scenario may name its own HUD face — 火柴三國 draws Chinese chrome and
     needs the brush-kai stack instead of a Latin script font. Unset (the other
     three packs) keeps the original exactly. */
  function hand() {
    return (ZS.scenario && ZS.scenario.hudFont) || HAND_DEFAULT;
  }

  /* ---------- world furniture ---------- */

  function drawWater(c, world) {
    if (!world.lake && !world.river) return; // tile worlds have no river
    c.lineCap = "round";
    c.lineWidth = 2;
    c.strokeStyle = "rgba(64,102,132,0.75)";
    if (world.lake && world.lake.pts.length) {
      ZS.wpoly(c, world.lake.pts, 71, 2.2, true);
      c.stroke();
    }
    ZS.wpoly(c, world.river.pts, 731, 2.2, true);
    c.stroke();
    // smaller ponds boil with their own seeds
    if (world.ponds)
      for (let i = 0; i < world.ponds.length; i++) {
        ZS.wpoly(c, world.ponds[i].pts, 77 + i * 13, 2.2, true);
        c.stroke();
      }
    // boiling ripples
    c.strokeStyle = "rgba(64,102,132,0.4)";
    c.lineWidth = 1.1;
    for (const rp of world.ripples) {
      ZS.wline(c, rp.x - rp.w / 2, rp.y, rp.x, rp.y - 2, rp.s, 1.2);
      ZS.wline(c, rp.x, rp.y - 2, rp.x + rp.w / 2, rp.y, rp.s + 9, 1.2);
    }
  }

  function drawTree(c, tr, t) {
    const sway = Math.sin(t * 0.8 + tr.seed) * 1.6;
    const cx = tr.x + sway,
      cy = tr.y - tr.r * 1.15;

    // ground scribble
    c.strokeStyle = "rgba(40,35,25,0.12)";
    c.lineWidth = 1.2;
    ZS.wcirc(c, tr.x, tr.y + 2, tr.r * 0.75, tr.seed + 3, 1.2);

    // trunk
    c.strokeStyle = "rgba(96,74,50,0.9)";
    c.lineWidth = 1.6;
    ZS.wline(c, tr.x, tr.y + 2, tr.x + ZS.sjit(tr.seed) * 2, cy + tr.r * 0.55, tr.seed + 5, 0.7);

    // canopy: jittered blob, green wash under a darker outline
    const pts = [];
    for (let i = 0; i < 8; i++) {
      const an = (i / 8) * Math.PI * 2;
      pts.push({ x: cx + Math.cos(an) * tr.pts[i], y: cy + Math.sin(an) * tr.pts[i] * 0.92 });
    }
    c.lineCap = "round";
    c.strokeStyle = "rgba(74,108,48,0.8)";
    c.lineWidth = 1.5;
    ZS.wpoly(c, pts, tr.seed * 13.7, 1.6, true);
    c.fillStyle = "rgba(112,148,72,0.32)";
    c.fill();
    c.stroke();

    // inner scribble
    c.strokeStyle = "rgba(74,108,48,0.35)";
    c.lineWidth = 1;
    ZS.wcirc(c, cx - tr.r * 0.2, cy - tr.r * 0.15, tr.r * 0.45, tr.seed + 31, 0.5);
  }

  // buildings: pre-rendered floor wash underneath; boiling wall runs and
  // the door (leaf, damage scratches, or splinters when broken) per frame
  function drawBuilding(c, b) {
    c.lineCap = "round";
    c.strokeStyle = "rgba(92,72,50,0.8)";
    c.lineWidth = 2;
    for (let i = 0; i < b.runs.length; i++) {
      const r = b.runs[i];
      ZS.wline(c, r.x1, r.y1, r.x2, r.y2, b.seed + i * 3.1, 1.1);
    }
    if (b.door) drawDoor(c, b, b.door);
  }

  function drawDoor(c, b, d) {
    const seed = b.seed + 55;
    const hz = d.face === "n" || d.face === "s";
    c.lineCap = "round";
    // while something gnaws, the whole leaf shakes
    const sh = d.shake > 0 ? Math.min(1, d.shake * 6) : 0;
    const x = d.x + (hz ? 0 : sh * ZS.jit(seed) * 1.6);
    const y = d.y + (hz ? sh * ZS.jit(seed + 1) * 1.6 : 0);
    if (!d.broken) {
      const dmg = 1 - d.hp / d.maxHp;
      // wooden leaf filling the opening
      const p = hz
        ? [
            { x: x - 19, y: y - 9 },
            { x: x + 19, y: y - 9 },
            { x: x + 19, y: y + 9 },
            { x: x - 19, y: y + 9 },
          ]
        : [
            { x: x - 9, y: y - 19 },
            { x: x + 9, y: y - 19 },
            { x: x + 9, y: y + 19 },
            { x: x - 9, y: y + 19 },
          ];
      ZS.wpoly(c, p, seed, 0.9, true);
      c.fillStyle = "rgba(138,98,52," + (0.42 + dmg * 0.25).toFixed(2) + ")";
      c.fill();
      c.strokeStyle = "rgba(84,56,26,0.85)";
      c.lineWidth = 1.6;
      c.stroke();
      // planks + X brace
      c.strokeStyle = "rgba(84,56,26,0.5)";
      c.lineWidth = 1;
      if (hz) {
        ZS.wline(c, x - 17, y - 4.5, x + 17, y - 4.5, seed + 2, 0.5);
        ZS.wline(c, x - 17, y + 4.5, x + 17, y + 4.5, seed + 3, 0.5);
        ZS.wline(c, x - 15, y - 7.5, x + 15, y + 7.5, seed + 4, 0.6);
        ZS.wline(c, x - 15, y + 7.5, x + 15, y - 7.5, seed + 5, 0.6);
      } else {
        ZS.wline(c, x - 4.5, y - 17, x - 4.5, y + 17, seed + 2, 0.5);
        ZS.wline(c, x + 4.5, y - 17, x + 4.5, y + 17, seed + 3, 0.5);
        ZS.wline(c, x - 7.5, y - 15, x + 7.5, y + 15, seed + 4, 0.6);
        ZS.wline(c, x - 7.5, y + 15, x + 7.5, y - 15, seed + 5, 0.6);
      }
      // knob
      c.strokeStyle = "rgba(84,56,26,0.9)";
      c.lineWidth = 1.1;
      ZS.wcirc(c, x + (hz ? 13 : 0), y + (hz ? 0 : 13), 1.8, seed + 7, 0.3);
      // damage: scratches, then a proper crack
      if (dmg > 0.15) {
        c.strokeStyle = "rgba(60,40,18,0.6)";
        c.lineWidth = 1;
        const k = dmg > 0.6 ? 3 : 2;
        for (let i = 0; i < k; i++) {
          const off = -10 + i * 8 + ZS.sjit(seed + i) * 3;
          if (hz) ZS.wline(c, x + off, y - 4, x + off + 3, y + 4, seed + 20 + i, 0.5);
          else ZS.wline(c, x - 4, y + off, x + 4, y + off + 3, seed + 20 + i, 0.5);
        }
      }
      if (dmg > 0.55) {
        c.strokeStyle = "rgba(40,26,10,0.7)";
        c.lineWidth = 1.2;
        if (hz) {
          ZS.wline(c, x - 4, y - 9, x - 1, y - 1, seed + 61, 0.7);
          ZS.wline(c, x - 1, y - 1, x + 2, y + 9, seed + 62, 0.7);
        } else {
          ZS.wline(c, x - 9, y - 4, x - 1, y - 1, seed + 61, 0.7);
          ZS.wline(c, x - 1, y - 1, x + 9, y + 2, seed + 62, 0.7);
        }
      }
    } else {
      // broken: leaves swung open off their hinges + splinters + debris
      const dy = d.face === "n" ? -1 : 1,
        dx = d.face === "w" ? -1 : 1;
      c.fillStyle = "rgba(120,84,40,0.5)";
      c.strokeStyle = "rgba(84,56,26,0.8)";
      c.lineWidth = 1.4;
      if (hz) {
        ZS.wpoly(
          c,
          [
            { x: x - 19, y },
            { x: x - 24, y: y + dy * 13 },
            { x: x - 16, y: y + dy * 13 },
            { x: x - 11, y },
          ],
          seed + 71,
          0.6,
          true,
        );
        c.fill();
        c.stroke();
        ZS.wpoly(
          c,
          [
            { x: x + 19, y },
            { x: x + 24, y: y + dy * 13 },
            { x: x + 16, y: y + dy * 13 },
            { x: x + 11, y },
          ],
          seed + 72,
          0.6,
          true,
        );
        c.fill();
        c.stroke();
      } else {
        ZS.wpoly(
          c,
          [
            { x, y: y - 19 },
            { x: x + dx * 13, y: y - 24 },
            { x: x + dx * 13, y: y - 16 },
            { x, y: y - 11 },
          ],
          seed + 71,
          0.6,
          true,
        );
        c.fill();
        c.stroke();
        ZS.wpoly(
          c,
          [
            { x, y: y + 19 },
            { x: x + dx * 13, y: y + 24 },
            { x: x + dx * 13, y: y + 16 },
            { x, y: y + 11 },
          ],
          seed + 72,
          0.6,
          true,
        );
        c.fill();
        c.stroke();
      }
      c.strokeStyle = "rgba(92,72,50,0.8)";
      c.lineWidth = 1.6;
      if (hz) {
        ZS.wline(c, x - 20, y, x - 8, y - 9, seed + 31, 0.6);
        ZS.wline(c, x - 20, y, x - 9, y + 7, seed + 33, 0.6);
        ZS.wline(c, x + 20, y, x + 8, y + 9, seed + 37, 0.6);
        ZS.wline(c, x + 20, y, x + 9, y - 7, seed + 39, 0.6);
      } else {
        ZS.wline(c, x, y - 20, x - 9, y - 8, seed + 31, 0.6);
        ZS.wline(c, x, y - 20, x + 7, y - 9, seed + 33, 0.6);
        ZS.wline(c, x, y + 20, x + 9, y + 8, seed + 37, 0.6);
        ZS.wline(c, x, y + 20, x - 7, y + 9, seed + 39, 0.6);
      }
      c.fillStyle = "rgba(92,72,50,0.5)";
      for (let i = 0; i < 3; i++) {
        const ox = ZS.sjit(seed + 50 + i) * 14;
        const oy = ZS.sjit(seed + 53 + i) * 14;
        ZS.wcirc(c, x + (hz ? ox : 0), y + (hz ? 0 : oy), 1.2, seed + 41 + i, 0.3);
      }
    }
  }

  /* ---------- speech bubbles (world space) ---------- */

  // hand-drawn thought bubbles above whoever is mid-shout
  function drawBubbles(c, agents, vis) {
    for (let i = 0; i < agents.length; i++) {
      const a = agents[i];
      if (a.sayT <= 0 || !a.say) continue;
      if (a.x < vis.x0 || a.x > vis.x1 || a.y < vis.y0 || a.y > vis.y1) continue;
      const age = a.sayMax - a.sayT;
      const sc = Math.min(1, age / 0.18); // pop in
      const al = Math.min(1, a.sayT / 0.4); // fade out
      c.font = "11px " + hand();
      const w = c.measureText(a.say).width + 12,
        h = 16;
      const bx = a.x + ZS.jit(a.seed) * 0.8,
        by = a.y - 27 - (Math.floor(a.seed) % 2) * 13 + ZS.jit(a.seed + 1) * 0.8;
      c.save();
      c.globalAlpha = al * Math.max(0.25, sc);
      c.translate(bx, by);
      c.scale(sc, sc);
      // tail down to the head
      c.strokeStyle = "rgba(46,44,40,0.75)";
      c.lineWidth = 1.2;
      ZS.wline(c, -3, h / 2, -1, h / 2 + 6, a.seed + 21, 0.5);
      ZS.wline(c, 3, h / 2, 1, h / 2 + 6, a.seed + 22, 0.5);
      // wobbly rounded body
      ZS.wpoly(
        c,
        [
          { x: -w / 2 + 4, y: -h / 2 },
          { x: w / 2 - 4, y: -h / 2 },
          { x: w / 2, y: -h / 2 + 4 },
          { x: w / 2, y: h / 2 - 4 },
          { x: w / 2 - 4, y: h / 2 },
          { x: -w / 2 + 4, y: h / 2 },
          { x: -w / 2, y: h / 2 - 4 },
          { x: -w / 2, y: -h / 2 + 4 },
        ],
        a.seed + 31,
        0.7,
        true,
      );
      c.fillStyle = "rgba(252,248,238,0.94)";
      c.fill();
      c.strokeStyle = "rgba(46,44,40,0.8)";
      c.lineWidth = 1.3;
      c.stroke();
      c.fillStyle = "rgba(46,44,40,0.92)";
      c.textAlign = "center";
      c.textBaseline = "middle";
      c.fillText(a.say, 0, 0.5);
      c.textAlign = "left";
      c.textBaseline = "alphabetic";
      c.restore();
    }
  }

  /* ---------- HUD (screen space) ---------- */

  function drawHUD(c, t, vw, vh, wave, agents) {
    const hud = ZS.scenario.hud(agents, wave);
    const fs = Math.max(11, Math.min(15, vw / 42));
    // a scenario may hide the top-left block (its stats live in the DOM panel)
    if (!hud.hidden) {
      c.save();
      c.translate(20, 24);
      c.rotate(-0.015);
      c.fillStyle = "rgba(46,44,40,0.85)";
      c.font = "italic " + fs + "px " + hand();
      c.fillText(hud.title, 0, 0);
      c.font = "italic " + fs * 0.85 + "px " + hand();
      c.fillStyle = "rgba(60,58,50,0.8)";
      c.fillText(hud.stats, 0, fs * 1.35);
      // the scenario's own mini legend (its glyphs, its labels)
      hud.legend(c, fs * 2.6, fs, vw, vh);
      c.restore();
    }

    // controls hint (+ engine-level hints: auto camera, sound lock)
    c.save();
    c.translate(20, vh - 18);
    c.fillStyle = "rgba(60,58,50,0.55)";
    c.font = "italic 12px " + hand();
    let hint = hud.hint;
    if (ZS.debug && ZS.debug.cam && ZS.debug.cam.auto)
      hint += "  ·  auto-camera — drag to take control";
    if (ZS.sound && !ZS.sound.unlocked) hint += "  ·  click for sound";
    c.fillText(hint, 0, 0);
    c.restore();

    const ov = hud.overlay();
    if (ov) {
      if (ov.card) {
        drawCard(c, ov.card, vw, vh);
      } else {
        c.save();
        c.globalAlpha = ov.fade !== undefined ? ov.fade : 0.6 + 0.3 * Math.sin(t * 3);
        c.translate(vw / 2, vh / 2);
        c.rotate(-0.03);
        c.textAlign = "center";
        c.fillStyle = "rgba(90,40,30,0.85)";
        c.font =
          "italic " + Math.max(18, Math.min(34, vw / 18) * (ov.big ? 1.7 : 1)) + "px " + hand();
        c.fillText(ov.main, 0, 0);
        if (ov.sub) {
          c.font = "italic 14px " + hand();
          c.fillText(ov.sub, 0, 28);
        }
        c.restore();
      }
    }
  }

  // the dawn results card: a sheet of paper with the night's tally —
  // any click dismisses it and starts the next day
  function drawCard(c, card, vw, vh) {
    const fs = Math.max(13, Math.min(17, vw / 60));
    const w = Math.max(360, vw * 0.44),
      h = 132 + card.lines.length * (fs * 1.6);
    c.save();
    c.translate(vw / 2, vh / 2);
    c.rotate(-0.018 + ZS.jit(7.7) * 0.004);
    // the sheet: a wobbling rounded rect of paper
    const r = 10,
      x = -w / 2,
      y = -h / 2;
    ZS.wpoly(
      c,
      [
        { x: x + r, y },
        { x: x + w - r, y },
        { x: x + w, y: y + r },
        { x: x + w, y: y + h - r },
        { x: x + w - r, y: y + h },
        { x: x + r, y: y + h },
        { x, y: y + h - r },
        { x, y: y + r },
      ],
      42,
      1.3,
      true,
    );
    c.fillStyle = card.lost ? "rgba(250,240,228,0.97)" : "rgba(252,248,238,0.97)";
    c.fill();
    c.strokeStyle = "rgba(60,50,40,0.85)";
    c.lineWidth = 1.6;
    c.stroke();
    // the tally
    c.textAlign = "center";
    c.fillStyle = card.lost ? "rgba(140,50,30,0.95)" : "rgba(70,58,40,0.95)";
    c.font = "italic " + fs * 1.5 + "px " + hand();
    c.fillText(card.title, 0, y + fs * 1.7);
    c.font = "italic " + fs + "px " + hand();
    c.fillStyle = "rgba(60,52,40,0.85)";
    let ly = y + fs * 3.4;
    for (const line of card.lines) {
      if (!line) continue;
      c.fillText(line, 0, ly);
      ly += fs * 1.6;
    }
    // the dismiss prompt, breathing
    c.fillStyle =
      "rgba(60,52,40," +
      (0.45 + 0.25 * Math.sin((performance.now() / 1000) * 2.4)).toFixed(2) +
      ")";
    c.font = "italic " + fs * 0.85 + "px " + hand();
    c.fillText("click to continue", 0, y + h - fs * 0.9);
    c.restore();
  }

  /* ---------- per-frame pipeline ---------- */

  function drawScene(c, cam, world, sim, t, vw, vh) {
    c.clearRect(0, 0, vw, vh);
    c.save();
    cam.apply(c, vw, vh);

    // pre-rendered ground
    c.drawImage(world.canvas, 0, 0, world.w, world.h);
    drawWater(c, world);
    // the scenario's own ground pass (tile washes, boiling borders)
    if (ZS.scenario.drawGround) ZS.scenario.drawGround(c, world, t);
    if (world.stains) world.stains.draw(c);

    // everything that has height, painted back-to-front
    const vis = cam.visible(vw, vh, 80);
    const list = [];
    for (const tr of world.trees) {
      if (tr.x < vis.x0 || tr.x > vis.x1 || tr.y < vis.y0 - tr.r * 2 || tr.y > vis.y1) continue;
      list.push({ y: tr.y, k: 0, o: tr });
    }
    for (const b of world.buildings) {
      if (b.x + b.w < vis.x0 || b.x > vis.x1 || b.y + b.h < vis.y0 || b.y > vis.y1) continue;
      list.push({ y: b.y + b.h, k: 1, o: b });
    }
    for (const b of world.blocks ? world.blocks.list : []) {
      if (b.x1 < vis.x0 || b.x0 > vis.x1 || b.by < vis.y0 || b.y0 > vis.y1) continue;
      list.push({ y: b.by, k: 3, o: b });
    }
    for (const a of sim.agents) {
      if (a.x < vis.x0 || a.x > vis.x1 || a.y < vis.y0 || a.y > vis.y1) continue;
      list.push({ y: a.y, k: 2, o: a });
    }
    list.sort((p, q) => p.y - q.y);
    for (const it of list) {
      if (it.k === 0) drawTree(c, it.o, t);
      else if (it.k === 1) drawBuilding(c, it.o);
      else if (it.k === 3) ZS.scenario.drawBlock(c, it.o, t);
      else ZS.scenario.draw(c, it.o, t);
    }

    // transient effects (tracers, poofs, blood) — the scenario renders its own records
    if (ZS.fx.length) ZS.scenario.drawFX(c, ZS.fx);
    // a last world-space pass that runs even with no effects pending: the
    // 火柴三國 command layer draws selection rings and order markers here
    if (ZS.scenario.drawWorld) ZS.scenario.drawWorld(c, t);

    // voices float above the crowd
    drawBubbles(c, sim.agents, vis);

    c.restore();
    drawHUD(c, t, vw, vh, sim.wave, sim.agents);
  }

  ZS.drawScene = drawScene;
})();
