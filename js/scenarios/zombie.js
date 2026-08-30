/* SCENARIO PACK: the outbreak
 *
 * Everything scenario-specific lives here: who the agents are, how they
 * look, move, talk, fight, bleed, and how a round plays out. The core
 * engine (js/*.js) knows nothing about zombies — it runs the clock,
 * physics, spacing, navigation, camera, and rendering pipeline, and calls
 * this pack for the parts a scenario decides.
 *
 * To build a different scenario (an ancient battlefield, a modern one,
 * a fantasy skirmish...), copy this file, swap the script tag in
 * zombiesim.html, and reimplement the same surface:
 *
 *   attachStains(st)                        register splat/corpse painters
 *   makeAgent(x, y, st, extra)              agent record (core fields + yours)
 *   hostile(a)                              true -> AI runs first (A* budget)
 *   walkBlocked(a)                          true -> interiors/doors are solid
 *   maxSpeed(a)                              per-agent speed cap
 *   frame(agents, dt, t, grid)              once per frame, before the AI pass
 *   update(a, dt, t, grid, nav, world, buildings, wave)   per-agent AI
 *   init(agents, world, vw, vh, wave)       start a round
 *   maintain(agents, dt, world, vw, vh)     between rounds (reinforcements)
 *   left(agents)                            "players" still standing (0 -> new round)
 *   counts(agents)                           stats for the HUD
 *   tap(agents, world, x, y)                 what a pointer tap does
 *   hud(agents, wave)                        { title, stats, hint, legend(c,y,fs), overlay() }
 *   draw(c, a, t)                            one agent, all of it
 *   drawFX(c, fx)                            transient effect records
 *
 * Core-owned agent fields: x y vx vy a st seed gait id wantMove dead
 * path pi gx gy navV0 planFailT stuckT wx wt px py bld, plus the
 * presentation lifetimes flash and sayT (decayed by the core). A speech
 * bubble shows while a.say is set and a.sayT > 0 (a.sayMax = total time).
 * Transient effects are pushed onto this.fx as records carrying t (the
 * core decays and prunes them): tracers { x0,y0,x1,y1,t }, poofs
 * { x,y,t,poof,seed }, grenade arcs { x0,y0,x1,y1,t,grn,seed }, booms
 * { x,y,t,boom,seed }, ground fire { x,y,t,gfire,seed }, and blood
 * { x,y,t,blood,seed }.
 */
(() => {
  "use strict";
  const ZS = (window.ZS = window.ZS || {});

  const PERC = 340; // zombie sight radius
  const FLEE = 180; // survivor panic radius
  const INFECT = 19; // touch-to-infect radius
  const DOOR_DPS = 30; // how fast one zombie chews through door HP
  // panic travels by voice: a shouted phrase spooks survivors out to
  // HEAR_R even when no zombie is in sight, and they run for the doors
  const PHRASES = {
    panic: [
      "run!",
      "over there!",
      "get inside!",
      "behind you!",
      "they're coming!",
      "into the house!",
      "it's out there!",
      "don't move!",
      "get in the store!",
      "help!",
      "they're in the street!",
      "don't let them through!",
      "someone grab a board!",
      "we've got to move!",
    ],
    alarm: [
      "i can hear them!",
      "shut the shutters!",
      "the doors are rattling!",
      "it's getting closer!",
      "we're not safe here!",
      "somebody's screaming down the block!",
      "lock the back door!",
      "they're at the fence!",
      "stay inside, i'm watching!",
      "i don't like this quiet...",
    ],
    door: [
      "they're at the door!",
      "the door's not holding!",
      "brace the door!",
      "something's chewing through it!",
      "that door will not hold!",
      "back it up with the counter!",
      "i'm on the door!",
      "nail it shut!",
    ],
    gun: [
      "hold the line!",
      "stay down!",
      "get back!",
      "it's mine!",
      "cover!",
      "right there!",
      "no closer!",
      "for the town!",
      "i got one!",
      "fire on my mark!",
      "they keep coming!",
      "watch your six!",
    ],
    grenade: [
      "grenade out!",
      "get clear!",
      "for the love of god, move!",
      "mark the cluster!",
      "that was a big one!",
    ],
    fire: [
      "fire!",
      "it's on fire!",
      "oh god, it's on me!",
      "burning!",
      "get out of the smoke!",
      "water, somebody!",
    ],
    fallback: [
      "fall back! to the house!",
      "the line's broken, move in!",
      "pull back! stay together!",
      "keep firing, keep moving back!",
      "back to the second wall!",
    ],
    reform: [
      "hold! we've got it!",
      "steady, everyone!",
      "the line's back up!",
      "breathe — they pulled off!",
      "good fighting, hold it!",
    ],
    recruit: [
      "i've got one!",
      "picked up a rifle!",
      "we're arming up!",
      "stand with us, you'll live longer!",
      "here, hold this!",
      "we need every pair of hands!",
      "stay back from the front!",
    ],
    wounded: [
      "i'm hit! i'm hit!",
      "cover me, i'm bleeding out!",
      "the door's close, i can make it!",
      "don't stop firing!",
      "i can't hold this!",
      "someone help me up!",
    ],
    infected: [
      "oh no... it bit me!",
      "my hand... it's cold!",
      "don't let me in there!",
      "it's in me, i can feel it!",
      "stay away from me!",
    ],
    "turret-down": [
      "the gun's down! it's down!",
      "lose the emplacement!",
      "someone hold that gap!",
      "the turret's gone!",
    ],
  };
  const HEARD = [
    "what?!",
    "where?!",
    "i saw one!",
    "oh no...",
    "who's there?!",
    "keep your voice down!",
    "is that the horde?!",
    "where did you see them?!",
    "we should move!",
    "don't come out!",
    "i hear nothing...",
    "that's not good.",
  ];
  // personalities: deterministic from each agent's seed — a few of the
  // town are brave, most are steady, some cautious, some panicked, and a
  // few simply don't talk
  const PERS = [
    {
      // FIGHTER
      panic: ["on 'em!", "come and get me!", "i've got the corner!", "they won't get past me!"],
      gun: ["i've got it!", "bring 'em!", "that's my range!", "right through the chest!"],
      fallback: ["we fall back! but only this far!", "hold the gap, i'm coming!"],
      recruit: ["finally, some sense!", "get behind me, watch and learn!"],
      wounded: ["i'm still standing!", "don't waste me, keep firing!"],
    },
    {
      // STEADY
      panic: ["stay with me, stay calm!", "one at a time, we've got this!"],
      gun: ["steady... steady...", "breathe. aim. fire."],
      door: ["i'll hold the door.", "we've got the door."],
      fallback: ["fall back, orderly."],
    },
    {
      // CAUTIOUS
      panic: ["we should have moved already...", "i told you, i told you all!"],
      gun: ["i don't like being out here...", "my hands are shaking!"],
      wounded: ["i don't think i can make it..."],
    },
    {
      // PANICKED
      panic: ["no no no no no!", "get me out of here! GET ME OUT!", "they're everywhere, oh god!"],
      gun: ["i'm sorry, i'm sorry!", "shoot them, shoot them all!"],
      wounded: ["it hurts, it hurts so much!"],
      infected: ["it's in me, it's in me!"],
    },
    {
      // STOIC
      panic: ["hmm.", "..."],
      gun: ["mm.", "ah."],
      door: ["the door, then.", "doors break."],
    },
  ];
  const HEAR_R = 260; // how far a shout carries
  const SCARE_T = 3.2; // seconds a listener stays spooked
  const SAY_MAX = 48; // cap on bubbles on the page at once
  // the town's defense corps: armed, squad-bound, and mortal — a bite
  // can still turn them
  const SOLD_PERC = 420; // a guard sees farther than the horde
  const SOLD_RANGE = 300; // rifle effective range
  const SOLD_CD = 0.9; // seconds between shots
  const SG_RANGE = 165; // shotgun: close quarters only
  const SG_CD = 1.35;
  const SG_PELLETS = 3;
  const SG_DMG = 2; // whole blast
  const SG_SPREAD = 0.4; // fan width across all pellets
  const BLOOD_CHANCE = 0.4; // a hit isn't guaranteed to leave blood
  const SOLD_SPEED = 84;
  const PERC_FOREST = 150; // zombie sight inside the tree cover
  // the machine gunner: rapid, mid-range (the Hold's SMG tier, scaled)
  const SMG_RANGE = 220;
  const SMG_CD = 0.3;
  // the grenadier: throws at packs, sidearm SMG shots at close range
  const GRN_RANGE = 380;
  const GRN_CD = 3.2;
  const GRN_RADIUS = 70; // the blast's reach
  const GRN_DMG = 3;
  const GRN_IGNITE = 0.25; // a hit zombie has this chance to catch fire
  const GRN_CIV_IGNITE = 0.12; // friendly fire is sparks, not bullets
  const GRN_PACK = 3; // zombies this close together draw a grenade
  const GRN_PACK_GAP = 90;
  const GRN_DOOR_R = 600; // the throw's reach for a door under attack
  // the turret: a fixed emplacement on the district's gap — mortal
  const TURRET_RANGE = 260;
  const TURRET_CD = 0.85;
  const TURRET_DMG = 2;
  const TURRET_HP = 8;
  // rovers: a handful of gunners who keep moving — they cover the ground
  // the fixed posts can't, and open fire on anything that drifts in
  const ROVER_N = 4;
  const ROVER_SEE = 400; // a rover engages threats within this reach
  // squads: a defensive arc per district, with fallback lines to the core
  const SQUAD_PANIC = 300; // how far out a squad watches for the threat
  const SQUAD_BREACH = 70; // zombies this close to the line = breached
  const SQUAD_FALL = 108; // a falling-back line runs
  // the town arming itself: how many civilians may pick up a gun
  const ARMED_FRAC = 0.07;
  // fire: anyone burning runs like the horde is right behind them
  const BURN_DPS = 0.4; // burn-off per second
  const BURN_SPREAD = 0.15; // chance per second of igniting whoever they touch
  const GROUND_FIRE = 0.15; // chance per second inside a ground-fire patch
  const GROUND_FIRE_R = 40;
  // the invasion: the horde arrives from off the map, in packs
  const PACK_CAP = 12;
  const PACK_T = 40; // seconds a pack keeps its shared target
  const PACK_CLOSE = 200; // prey farther than this can't pull a pack off target
  const ZOMB_CAP0 = 120; // live-zombie cap: 120 + 15*wave
  const AGENT_SOFT_CAP = 1050;

  const C_SURV = [46, 44, 40];
  const C_INF = [146, 66, 42];
  // persistent-damage inks
  const SPECKLE = "rgba(92,30,26,";
  const BLOTCH = "rgba(122,42,36,";
  const POOL = "rgba(112,38,32,0.30)";
  const ZOMB_STROKE = "rgb(72,102,58)";

  // the corps' loadout, by class (per-frame lookups must be table-driven —
  // no fresh objects in the hot loop)
  const WEP = {
    rifle: { range: SOLD_RANGE, cd: SOLD_CD, dmg: 1, pellets: 1, spread: 0 },
    shotgun: { range: SG_RANGE, cd: SG_CD, dmg: SG_DMG, pellets: SG_PELLETS, spread: SG_SPREAD },
    smg: { range: SMG_RANGE, cd: SMG_CD, dmg: 1, pellets: 2, spread: 0.18 },
    grenade: { range: 130, cd: SMG_CD, dmg: 1, pellets: 2, spread: 0.18 },
    turret: { range: TURRET_RANGE, cd: TURRET_CD, dmg: TURRET_DMG, pellets: 1, spread: 0 },
  };
  // squad class mix by size (rank 0 is the squad's heaviest gun)
  const SQUAD_MIX = {
    3: ["rifle", "rifle", "shotgun"],
    4: ["smg", "rifle", "shotgun", "rifle"],
    5: ["rifle", "smg", "rifle", "shotgun", "rifle"],
    6: ["rifle", "smg", "rifle", "shotgun", "rifle", "rifle"],
  };

  // the auto-camera's answer: one reused object, no per-frame allocs
  const CI = { x: 0, y: 0, zoom: 0, ease: 1 };
  // the moan: rate-limited across the whole sim (~one per 0.4s)
  let moanAt = -1;
  let moanClock = 0;
  function moan(x, y) {
    if (moanClock - moanAt > 0.4) {
      moanAt = moanClock;
      if (ZS.sound) ZS.sound.event("moan", x, y);
    }
  }
  // one squashed sandbag: a filled body and a wobbly outline
  function drawBag(c, bx, by, r, s) {
    c.save();
    c.translate(bx, by);
    c.scale(1, 0.6);
    c.fillStyle = "rgba(138,98,52,0.55)";
    c.beginPath();
    c.ellipse(0, 0, r, r, 0, 0, 6.29);
    c.fill();
    c.strokeStyle = "rgba(92,72,50,0.7)";
    c.lineWidth = 1.3;
    ZS.wcirc(c, 0, 0, r, s, 0.7);
    c.restore();
  }

  class ScenarioZombie {
    constructor() {
      this.talkingNow = 0; // bubbles currently on the page (set per-frame)
      this.spawnTimer = 6;
      this.sq = []; // squads (preallocated in init)
      this.gren = []; // in-flight grenade detonations {x,y,t,seed}
      this.glist = Array.from({ length: 64 }); // density scan scratch
      this.packTimer = 2; // the invasion's first packs come in early
      this.packsSpawned = 0;
      this.waveAge = 0; // seconds the wave has been running (escalation)
      this.surged = false; // the heavy surge has struck this wave
      this.grenDi = -1; // the grenadier's district: the opening packs press it
      this.swim = true; // water is a soft block: everyone can swim (SWIM_FRAC speed)
      this.armTimer = 8;
      this.hz = []; // the auto camera's zones: {x, y, h} (h decays)
      // the emplacement crews (Round 5): gun agent + gunner + slot
      this.turrets = [];
      // camera pulse: a blast punches in for a second, then eases back
      this.pulseT = 0;
      this.pulseX = 0;
      this.pulseY = 0;
      // the focal point the camera eases toward (heat-weighted centroid)
      this.focalX = 0;
      this.focalY = 0;
      // dawn-report bookkeeping
      this.lastSurv = null;
      this.wLost = 0;
      this.fell = false;
      this.fall = null;
      this.doorsIntact = 0;
      this.towns = null;
      // the tap calls a sky-fall grenade down (artillery cooldown)
      this.artCd = 0;
      // the town-fall beat, extended for the report card
      this.beatT = 4.5;
      this.skipBeat = false;
      this.coreX = 0; // the town core: every squad's last stand
      this.coreY = 0;
      this.fx = null; // set by main: the core's effect record array
      this.stains = null; // set by main via attachStains
    }

    /* ---------- persistent damage painters ---------- */

    attachStains(st) {
      this.stains = st;
      st.register("shot", (sc, x, y, seed) => {
        const blotchR = ZS.rnd(3.5, 6.5);
        const blotchAlpha = 0.55 + ZS.hash(seed) * 0.15;
        st.fillBlob(x, y, blotchR, seed, BLOTCH + blotchAlpha + ")");
        const n = 4 + Math.floor(ZS.hash(seed + 1) * 3);
        for (let i = 0; i < n; i++) {
          const ang = ZS.hash(seed + 10 + i) * Math.PI * 2;
          const dist = ZS.hash(seed + 20 + i) * 11;
          const r = ZS.rnd(0.6, 1.6);
          const alpha = 0.45 + ZS.hash(seed + 30 + i) * 0.15;
          st.fillBlob(
            x + Math.cos(ang) * dist,
            y + Math.sin(ang) * dist,
            r,
            seed + 40 + i,
            SPECKLE + alpha + ")",
          );
        }
      });
      st.register("bite", (sc, x, y, seed) => {
        const blotchR = ZS.rnd(4, 6.5);
        const blotchAlpha = 0.5 + ZS.hash(seed + 2) * 0.1;
        st.fillBlob(x, y, blotchR, seed + 3, BLOTCH + blotchAlpha + ")");
        const n = 5 + Math.floor(ZS.hash(seed + 4) * 5);
        for (let i = 0; i < n; i++) {
          const ang = ZS.hash(seed + 50 + i) * Math.PI * 2;
          const dist = ZS.hash(seed + 60 + i) * 14;
          const r = ZS.rnd(0.6, 1.6);
          const alpha = 0.45 + ZS.hash(seed + 70 + i) * 0.15;
          st.fillBlob(
            x + Math.cos(ang) * dist,
            y + Math.sin(ang) * dist,
            r,
            seed + 80 + i,
            SPECKLE + alpha + ")",
          );
        }
        const drips = 1 + Math.floor(ZS.hash(seed + 5) * 2);
        for (let i = 0; i < drips; i++) {
          const dx = (ZS.hash(seed + 90 + i) - 0.5) * 10;
          const len = ZS.rnd(4, 9);
          sc.strokeStyle = BLOTCH + (0.4 + ZS.hash(seed + 100 + i) * 0.15) + ")";
          sc.lineWidth = 1.2;
          ZS.wline(sc, x + dx, y, x + dx, y + len, seed + 110 + i, 1.2);
        }
      });
      // a blast's scorch: dark soot that stains the paper
      st.register("scorch", (sc, x, y, seed) => {
        st.fillBlob(x, y, ZS.rnd(16, 24), seed, "rgba(50,42,34,0.22)");
        const n = 6 + Math.floor(ZS.hash(seed + 1) * 5);
        for (let i = 0; i < n; i++) {
          const ang = ZS.hash(seed + 10 + i) * Math.PI * 2;
          const dist = ZS.hash(seed + 20 + i) * 20;
          st.fillBlob(
            x + Math.cos(ang) * dist,
            y + Math.sin(ang) * dist,
            ZS.rnd(0.8, 2),
            seed + 30 + i,
            "rgba(50,42,34," + (0.3 + ZS.hash(seed + 40 + i) * 0.2) + ")",
          );
        }
        for (let i = 0; i < 3; i++) {
          const ang = ZS.hash(seed + 50 + i) * Math.PI * 2;
          sc.strokeStyle = "rgba(50,42,34,0.4)";
          sc.lineWidth = 1.2;
          ZS.wline(
            sc,
            x + Math.cos(ang) * 10,
            y + Math.sin(ang) * 10,
            x + Math.cos(ang) * 18,
            y + Math.sin(ang) * 18,
            seed + 60 + i,
            0.8,
          );
        }
      });
      // a blast's outer ring: a fainter soot fading out to the paper
      st.register("scorch2", (sc, x, y, seed) => {
        st.fillBlob(x, y, ZS.rnd(48, 58), seed + 9, "rgba(50,42,34,0.10)");
        const n = 6 + Math.floor(ZS.hash(seed + 1) * 5);
        for (let i = 0; i < n; i++) {
          const ang = ZS.hash(seed + 10 + i) * Math.PI * 2;
          const dist = ZS.hash(seed + 20 + i) * 40;
          st.fillBlob(
            x + Math.cos(ang) * dist,
            y + Math.sin(ang) * dist,
            ZS.rnd(0.6, 1.6),
            seed + 30 + i,
            "rgba(50,42,34," + (0.05 + ZS.hash(seed + 40 + i) * 0.05) + ")",
          );
        }
      });
      st.register("corpse", (sc, a) => {
        const seed = a.seed;
        const rot = ZS.hash(seed) * Math.PI * 2;

        // blood pool
        const pts = [];
        const nPts = 7 + Math.floor(ZS.hash(seed + 1) * 3);
        const radius = ZS.rnd(13, 18);
        const stretch = 1 + ZS.hash(seed + 2) * 0.3;
        for (let i = 0; i < nPts; i++) {
          const ang = (i / nPts) * Math.PI * 2 + a.a;
          const rr = radius * (0.8 + ZS.hash(seed + 10 + i) * 0.4);
          const sx = i % 2 === 0 ? stretch : 1;
          pts.push({
            x: a.x + Math.cos(ang) * rr * sx,
            y: a.y + Math.sin(ang) * rr,
          });
        }
        sc.fillStyle = POOL;
        ZS.wpoly(sc, pts, seed + 20, 2.2, true);
        sc.fill();

        // extra speckles on the pool
        const specks = 1 + Math.floor(ZS.hash(seed + 3) * 2);
        for (let i = 0; i < specks; i++) {
          const ang = ZS.hash(seed + 30 + i) * Math.PI * 2;
          const dist = ZS.hash(seed + 40 + i) * radius * 0.7;
          const r = ZS.rnd(0.8, 1.8);
          const alpha = 0.35 + ZS.hash(seed + 50 + i) * 0.15;
          st.fillBlob(
            a.x + Math.cos(ang) * dist,
            a.y + Math.sin(ang) * dist,
            r,
            seed + 60 + i,
            "rgba(92,30,26," + alpha + ")",
          );
        }

        // body lying down
        sc.strokeStyle = ZOMB_STROKE;
        sc.lineWidth = 2;
        const torsoLen = 16;
        const hx = a.x + Math.cos(rot) * 14;
        const hy = a.y + Math.sin(rot) * 14;
        const tx = a.x - Math.cos(rot) * (torsoLen - 14);
        const ty = a.y - Math.sin(rot) * (torsoLen - 14);

        // torso
        ZS.wline(sc, hx, hy, tx, ty, seed + 100, 1.6);
        // head
        ZS.wcirc(sc, hx, hy, 4.6, seed + 101, 0.7);
        // arms splayed from shoulder (head end)
        const armAngleL = rot + ZS.rnd(1.05, 1.75);
        const armAngleR = rot - ZS.rnd(1.05, 1.75);
        ZS.wline(
          sc,
          hx,
          hy,
          hx + Math.cos(armAngleL) * 10,
          hy + Math.sin(armAngleL) * 10,
          seed + 102,
          1.4,
        );
        ZS.wline(
          sc,
          hx,
          hy,
          hx + Math.cos(armAngleR) * 10,
          hy + Math.sin(armAngleR) * 10,
          seed + 103,
          1.4,
        );
        // legs splayed from hip (torso end)
        const legAngleL = rot + Math.PI + ZS.rnd(0.52, 0.87);
        const legAngleR = rot + Math.PI - ZS.rnd(0.52, 0.87);
        ZS.wline(
          sc,
          tx,
          ty,
          tx + Math.cos(legAngleL) * 11,
          ty + Math.sin(legAngleL) * 11,
          seed + 104,
          1.4,
        );
        ZS.wline(
          sc,
          tx,
          ty,
          tx + Math.cos(legAngleR) * 11,
          ty + Math.sin(legAngleR) * 11,
          seed + 105,
          1.4,
        );
      });
    }

    /* ---------- agents ---------- */

    makeAgent(x, y, st, gun) {
      const seed = Math.random() * 997;
      const h = ZS.hash(seed);
      return {
        x,
        y,
        a: ZS.rnd(0, 6.28),
        vx: 0,
        vy: 0,
        st,
        zborn: st === 2, // true only for spawned (pack) zombies; survivors who
        // turn in place (bite/tap/center-outbreak) stay zborn:false
        inf: 0,
        tm: 0,
        hp: 3, // zombies and the corps: each guard shot takes one off
        seed,
        pers: h < 0.12 ? 0 : h < 0.38 ? 1 : h < 0.6 ? 2 : h < 0.82 ? 3 : 4,
        gait: ZS.rnd(0, 6.28),
        flash: 0,
        ph: ZS.rnd(0, 6.28),
        tx: null,
        ty: null,
        tAge: 99, // last-known prey point (zombies)
        sniff: false, // prey adopted by scent (occupied building), not sight
        // navigation state
        path: null,
        pi: 0,
        gx: null,
        gy: null,
        navV0: 0,
        planFailT: 0,
        stuckT: 0,
        replanT: 0,
        shelterB: -1,
        deny: null,
        wx: null,
        wt: 0,
        bld: -1, // building index of the cell underfoot
        px: 0,
        py: 0, // position before the separation push
        wantMove: false,
        // speech bubble / panic state
        say: null,
        sayT: 0,
        sayMax: 0,
        sayCd: ZS.rnd(0, 6),
        scareT: 0,
        justHeard: false,
        id: 0,
        // guard state
        gun: !!gun,
        wep: null, // "rifle" | "shotgun" | "smg" | "grenade" | "turret"
        fireCd: 0,
        muzzle: 0,
        hx: x, // home post
        hy: y,
        // squad state (the defensive corps)
        sid: -1, // squad index (-1: unassigned, e.g. turrets)
        rank: 0,
        sx: 0,
        sy: 0, // current slot on the squad's arc
        slotA: 0, // threat angle the slot was computed from
        sline: 0, // squad line the slot was computed for
        sentry: false, // holding a door post
        sentryB: -1, // the door post's building index
        wounded: false, // broke off to a door at hp 1
        civ: false, // an armed civilian (unattached)
        rover: false, // a roving gunner (no squad, no post)
        rvI: 0, // rover index: patrols district (rvI % squad count)'s post
        rvT: 0, // seconds left at the current post
        tId: -1, // the emplacement index (turret agents)
        crewFor: -1, // the emplacement index a gunner mans
        tgt: { x: 0, y: 0 }, // reusable steering target (no per-frame allocs)
        // the invasion
        packT: 0, // seconds left steering at the pack's shared target
        // fire
        burn: 0, // seconds of fire left on this agent
        burnDir: 0, // the frantic heading
        bT: 0, // heading re-roll timer
        grnCd: 0, // grenade cooldown
        tAtk: 0, // turret contact-damage cooldown
      };
    }

    hostile(a) {
      return a.st === 2;
    }

    walkBlocked(a) {
      return a.st === 2;
    }

    maxSpeed(a) {
      if (a.burn > 0) return 110; // burning runs frantic, past every cap
      if (a.st === 2) return 120;
      if (a.gun)
        return a.wep === "turret"
          ? 0
          : a.sid >= 0 && this.sq[a.sid] && this.sq[a.sid].state === 1
            ? SQUAD_FALL
            : SOLD_SPEED;
      return 72;
    }

    /* ---------- frame ---------- */

    frame(agents, dt, t, grid, nav) {
      this.talkingNow = 0;
      // voices carry panic: everyone within earshot of a shout stays spooked
      for (let i = 0; i < agents.length; i++) {
        const a = agents[i];
        if (a.sayT <= 0) continue;
        this.talkingNow++;
        grid.query(a.x, a.y, HEAR_R, (b) => {
          if (b === a || b.st !== 0) return;
          if (b.scareT <= 0) b.justHeard = true;
          b.scareT = SCARE_T;
        });
      }
      // wave bookkeeping for the dawn report + the artillery cooldown
      let s0 = 0;
      for (let i = 0; i < agents.length; i++) if (agents[i].st < 2) s0++;
      if (this.lastSurv != null) this.wLost = Math.max(0, this.wLost + this.lastSurv - s0);
      this.lastSurv = s0;
      if (this.artCd > 0) this.artCd -= dt;
      let di0 = 0;
      for (let i = 0; i < ZS.Buildings.list.length; i++) {
        const d = ZS.Buildings.list[i].door;
        if (d && !d.broken) di0++;
      }
      this.doorsIntact = di0;
      if (s0 === 0 && !this.fell) {
        this.fell = true;
        this.fall = {
          lost: this.wLost,
          doors: this.doorsIntact,
          dir: this._fallDir(),
        };
      }
      // grenade flights: the core fades the arc fx; the boom is ours
      if (this.gren.length) {
        for (let i = this.gren.length - 1; i >= 0; i--) {
          const g = this.gren[i];
          g.t -= dt;
          if (g.t <= 0) {
            this._boom(agents, grid, nav, g.x, g.y, g.seed);
            this.gren.splice(i, 1);
          }
        }
      }
      // ground fire lives in the fx array (the core prunes it); here it
      // just sets people alight
      for (let i = 0; i < this.fx.length; i++) {
        const f = this.fx[i];
        if (!f.gfire) continue;
        grid.query(f.x, f.y, GROUND_FIRE_R, (b) => {
          if (b.burn > 0) return;
          // walls and an intact door block the fire: no burning through them
          if (!nav.los(f.x, f.y, b.x, b.y, true)) return;
          if (Math.random() < GROUND_FIRE * dt) this._ignite(b);
        });
      }
      // the squads: aggregate the living line, fix the threat, test the
      // fallback, and re-form when the ring closes back up
      if (!this.sq.length) return;
      for (let i = 0; i < this.sq.length; i++) {
        const s = this.sq[i];
        s.alive = 0;
        s.cx = 0;
        s.cy = 0;
        s.breach = 0;
        s.home = 0;
        s.lead = null;
      }
      for (let i = 0; i < agents.length; i++) {
        const a = agents[i];
        if (a.sid < 0 || a.st >= 2) continue;
        const s = this.sq[a.sid];
        if (!s) continue;
        s.alive++;
        s.cx += a.x;
        s.cy += a.y;
        if (s.state === 1 && Math.hypot(a.sx - a.x, a.sy - a.y) < 26) s.home++;
        if (!s.lead || a.rank < s.lead.rank) s.lead = a;
      }
      for (let i = 0; i < this.sq.length; i++) {
        const s = this.sq[i];
        if (s.alive) {
          s.cx /= s.alive;
          s.cy /= s.alive;
        }
        // the nearest threat to the line anchor (one query per squad)
        let tz = null,
          td = SQUAD_PANIC * SQUAD_PANIC;
        grid.query(s.ax, s.ay, SQUAD_PANIC, (b) => {
          if (b.st !== 2) return;
          const dx = b.x - s.ax,
            dy = b.y - s.ay,
            d2 = dx * dx + dy * dy;
          if (d2 < td) {
            td = d2;
            tz = b;
          }
          if (d2 < SQUAD_BREACH * SQUAD_BREACH) s.breach++;
        });
        s.thz = tz;
        if (tz) {
          s.thx = tz.x;
          s.thy = tz.y;
          s.thd = Math.sqrt(td);
          s.thA = Math.atan2(tz.y - s.ay, tz.x - s.ax);
        } else {
          s.thd = -1; // no threat: the arc faces the town core
        }
        if (s.state === 0) {
          // the line breaks: the group falls back to the next position
          if (s.alive < s.n0 * 0.5 && s.alive > 0 && s.line < s.lines.length - 1) {
            s.state = 1;
            s.line++;
            if (s.lead) this._shout(s.lead, "fallback");
          } else if (s.breach >= 3 && s.line < s.lines.length - 1) {
            s.state = 1;
            s.line++;
            if (s.lead) this._shout(s.lead, "fallback");
          }
        } else if (s.alive > 0 && s.home === s.alive && (s.thd < 0 || s.thd > 90)) {
          // the ring is back in slot and the threat has pulled off: re-form
          s.state = 0;
          if (s.lead) this._shout(s.lead, "reform");
        }
        // the door sentry: one guard holds the district's nearest intact door
        if (s.doorB >= 0) {
          const d = ZS.Buildings.list[s.doorB].door;
          if (!d || d.broken) {
            // the post's door is gone: the next-nearest door, or the arc
            s.doorB = this._nearestDoorB(s.ax, s.ay, s.doorB);
            if (s.doorB >= 0) {
              if (s.sentry && !s.sentry.dead && s.sentry.st < 2) s.sentry.sentryB = -1;
              else this._assignSentry(s, i, agents);
            } else if (s.sentry) {
              s.sentry.sentry = false;
              s.sentry.sentryB = -1;
              s.sentry.sx = 0;
              s.sentry.sy = 0;
              s.sentry = null;
            }
          } else if (!s.sentry || s.sentry.dead || s.sentry.st >= 2) {
            this._assignSentry(s, i, agents);
          }
        } else {
          s.doorB = this._nearestDoorB(s.ax, s.ay, -1);
          if (s.doorB >= 0) this._assignSentry(s, i, agents);
        }
      }
      // the auto camera's zone heat: decay, then add the frame's evidence
      // (zombies nearby, live fire, doors being worked) so the camera
      // tours to where the story is
      if (this.hz.length) {
        for (let zi = 0; zi < this.hz.length; zi++) {
          const z = this.hz[zi];
          z.h *= Math.exp(-dt * 0.06);
          let zn = 0,
            gn = 0;
          grid.query(z.x, z.y, 200, (b) => {
            if (b.st === 2) zn++;
            else if (b.st < 2 && b.gun) gn++;
          });
          z.h += dt * (zn * 0.6 + (zn > 0 && gn > 0 ? 5 : 0));
        }
        for (let i = 0; i < ZS.Buildings.list.length; i++) {
          const d = ZS.Buildings.list[i].door;
          if (!d || d.shake <= 0) continue;
          let bd = Infinity,
            bz = this.hz[0];
          for (let zi = 0; zi < this.hz.length; zi++) {
            const z = this.hz[zi];
            const dd = (z.x - d.x) * (z.x - d.x) + (z.y - d.y) * (z.y - d.y);
            if (dd < bd) {
              bd = dd;
              bz = z;
            }
          }
          bz.h += dt * 6;
        }
      }
    }

    update(a, dt, t, grid, nav, world, buildings, wave) {
      // fire overrides everything: a burning agent runs frantic
      if (a.burn > 0) {
        this._updateBurning(a, dt, t, grid, nav);
        return;
      }
      if (a.st === 2) {
        const zsp = 90 + Math.min(30, wave * 4);
        this._updateZombie(a, dt, t, grid, nav, buildings, zsp);
      } else if (a.st === 0) {
        if (a.gun) {
          this._updateDefender(a, dt, t, grid, nav, buildings);
          return;
        }
        this._updateSurvivor(a, dt, t, grid, nav, buildings);
      } else {
        // infected: shivering, turning
        a.tm -= dt;
        a.a += ZS.jit(a.seed) * dt * 9;
        a.vx += Math.cos(a.a) * 14 * dt * 3;
        a.vy += Math.sin(a.a) * 14 * dt * 3;
        if (a.tm <= 0) {
          a.st = 2;
          a.flash = 1;
        }
      }
    }

    /* ---------- per-type steering ---------- */

    _updateZombie(a, dt, t, grid, nav, buildings, zsp) {
      // hunt the nearest living agent in sight, else run to the last-known
      // point for a moment, then shamble. The tree cover blinds the horde.
      a.packT = Math.max(0, a.packT - dt);
      const perc = nav.world.inForest(a.x, a.y) ? PERC_FOREST : PERC;
      let best = null,
        bd = perc * perc;
      grid.query(a.x, a.y, perc, (b) => {
        if (b.st === 2) return;
        const dx = b.x - a.x,
          dy = b.y - a.y,
          d2 = dx * dx + dy * dy;
        // a converging pack ignores prey it can't catch: a fleeing survivor
        // out in the open would drag the whole blob off the district
        if (a.packT > 0 && d2 > PACK_CLOSE * PACK_CLOSE) return;
        if (d2 < bd) {
          bd = d2;
          best = b;
        }
      });
      // walls blind the horde: prey behind an intact wall or door can't be
      // fixed from across the street (the door logic below still works a
      // door the zombie is already at)
      if (best && !nav.los(a.x, a.y, best.x, best.y, true, this.swim)) best = null;
      // the scent: the nearest house with people still in it — the horde
      // smells dinner through the walls (no sight required). The whole town
      // is sniffed: the horde's destination is the occupied houses
      let sc = null,
        sd = Infinity;
      for (let bi = 0; bi < buildings.length; bi++) {
        const b = buildings[bi];
        if (!b.door || b.door.broken || b.survCount <= 0) continue;
        const f = b.door.front;
        const ddx = f.x - a.x,
          ddy = f.y - a.y,
          d2 = ddx * ddx + ddy * ddy;
        if (d2 < sd) {
          sd = d2;
          sc = b;
        }
      }
      if (best && !a.sniff) {
        if (a.tx === null) moan(a.x, a.y); // a fresh fix on the prey
        a.tx = best.x;
        a.ty = best.y;
        a.tAge = 0;
        a.sniff = false;
      } else {
        a.tAge += dt;
      }
      // the pack arrives on its anchor (or the prey's last-seen point): the
      // shared point is open ground, so the hunt turns on the nearest
      // occupied house — the scent takes over
      if (!best && a.packT > 0 && sc && a.tx !== null && Math.hypot(a.tx - a.x, a.ty - a.y) < 150) {
        a.tx = sc.door.inner.x;
        a.ty = sc.door.inner.y;
        a.tAge = 0;
        a.sniff = true;
        a.packT = 0;
      }
      if (a.tx !== null && (a.packT > 0 || a.tAge < 2.5 || a.sniff)) {
        const tg = { x: a.tx, y: a.ty };
        const myB = ZS.Buildings.cellBldAt(nav, a.x, a.y);
        const tgtB = ZS.Buildings.cellBldAt(nav, tg.x, tg.y);
        if (a.sniff && tgtB >= 0 && tgtB === myB) {
          // already inside the house: the scent is spent, sight takes over
          a.tx = null;
          a.sniff = false;
        }
        let door = null,
          goal = tg;
        if (myB !== tgtB) {
          const bd = tgtB >= 0 ? buildings[tgtB] : buildings[myB];
          if (bd && bd.door && !bd.door.broken) {
            // the house went quiet (no prey left inside): drop the scent
            if (a.sniff && tgtB >= 0 && bd.survCount <= 0) {
              a.tx = null;
              a.sniff = false;
            } else {
              // sealed door between me and the prey: work the door instead
              door = bd.door;
              goal = tgtB >= 0 ? door.front : { x: door.x, y: door.y };
            }
          }
        }
        if (door && Math.hypot(door.x - a.x, door.y - a.y) < 32) {
          // gnaw: face the door and chew (works from either side)
          // gnawing holds the scent: the prey is behind this door and can
          // be heard inside, so the chew continues until the door fails
          a.tAge = 0;
          a.a = Math.atan2(door.y - a.y, door.x - a.x);
          const damp = Math.max(0, 1 - dt * 10);
          a.vx *= damp;
          a.vy *= damp;
          door.hp -= DOOR_DPS * dt;
          door.shake = 0.2;
          if (door.hp <= 0 && !door.broken) {
            ZS.Buildings.doorBroken(door, nav);
            a.sniff = false; // the way is open: the hunt goes inside
            if (ZS.sound) ZS.sound.event("door_break", door.x, door.y);
            if (ZS.sound) ZS.sound.event("v_zedshout", door.x, door.y);
            let h = null;
            grid.query(door.x, door.y, 180, (b) => {
              if (b.st !== 0 || h) return;
              h = b;
            });
            if (h) this._shout(h, "door");
          }
        } else {
          a.wantMove = true;
          ZS.planAndFollow(a, door ? goal : tg, true, zsp, dt, t, nav);
          const wob = Math.sin(t * 5 + a.seed) * 5; // shamble wobble
          a.vx += Math.cos(a.a + 1.5708) * wob * dt * 8;
          a.vy += Math.sin(a.a + 1.5708) * wob * dt * 8;
        }
      } else {
        // no fix of its own: the scent, or a wander between fixes
        if (sc) {
          // the hunt turns on someone inside: the door logic above works it
          a.tx = sc.door.inner.x;
          a.ty = sc.door.inner.y;
          a.tAge = 0;
          a.sniff = true;
          a.wantMove = true;
          ZS.planAndFollow(a, sc.door.front, true, zsp, dt, t, nav);
        } else if (!a.wx || a.wt <= 0 || Math.hypot(a.wx.x - a.x, a.wx.y - a.y) < 20) {
          a.wx = ZS.wanderTarget(a, nav, true, buildings);
          a.wt = 1.5 + Math.random() * 2.5;
          a.wantMove = true;
          ZS.planAndFollow(a, a.wx, true, zsp * 0.55, dt, t, nav);
        }
      }

      // infect on touch (walls stop it: straight-line check)
      grid.query(a.x, a.y, INFECT + 4, (b) => {
        if (b.st !== 0) return;
        const ddx = b.x - a.x,
          ddy = b.y - a.y;
        if (ddx * ddx + ddy * ddy >= INFECT * INFECT) return;
        if (!nav.los(a.x, a.y, b.x, b.y, true)) return;
        if (Math.random() < 0.12) {
          const bs = Math.random() * 997;
          if (this.stains) this.stains.splat(b.x, b.y, "bite", bs);
          this.fx.push({ x: b.x, y: b.y - 5, t: 0.3, blood: 1, seed: bs });
        }
        b.inf += dt * (1.1 + ZS.hash(a.seed * 3 + b.seed) * 0.9);
        if (b.inf >= 1) {
          b.st = 1;
          b.tm = ZS.rnd(0.8, 1.8);
          b.flash = 0.5;
          this._shout(b, "infected");
          if (ZS.sound) ZS.sound.event("v_chomp", a.x, a.y);
        }
      });
    }

    // shout a warning phrase if the line is clear and the page isn't full
    _tryShout(a, dt, rate, bucket) {
      a.sayCd -= dt;
      if (a.sayCd > 0 || a.sayT > 0 || this.talkingNow >= SAY_MAX) return;
      if (Math.random() < dt * rate) {
        this._shout(a, bucket);
      }
    }

    // a line out right now: the personality's voice first, then the bucket
    _shout(a, bucket) {
      if (!a || a.dead || a.st >= 2) return;
      if (a.sayT > 0 || (this.talkingNow >= SAY_MAX && !a.gun)) return;
      a.say = this._pickLine(a, bucket);
      a.sayT = a.sayMax = 1.8;
      a.sayCd = 4 + Math.random() * 5;
      const ev =
        bucket === "gun"
          ? "v_callout"
          : bucket === "panic" || bucket === "grenade"
            ? "v_shout"
            : "v_gasp";
      if (ZS.sound) ZS.sound.event(ev, a.x, a.y);
    }

    // the personality's line if it has one, else the bucket's pool
    _pickLine(a, bucket) {
      const p = PERS[a.pers];
      if (p && p[bucket] && p[bucket].length)
        return p[bucket][(Math.random() * p[bucket].length) | 0];
      const pool = PHRASES[bucket] || PHRASES.panic;
      return pool[(Math.random() * pool.length) | 0];
    }

    /* ---------- fire ---------- */

    _ignite(a) {
      if (a.burn <= 0 && ZS.sound) ZS.sound.event("fire", a.x, a.y);
      a.burn = ZS.rnd(6, 9);
      a.burnDir = a.a + ZS.rnd(-1, 1);
      a.bT = 0;
    }

    // a burning agent: frantic, burning off, and a spark that sets the
    // crowd alight — the spark crosses open ground and broken doors,
    // never a wall or a sealed one
    _updateBurning(a, dt, t, grid, nav) {
      a.burn -= dt;
      if (a.burn <= 0) {
        a.burn = 0;
        a.flash = 0.4;
        return;
      }
      // the fire eats the agent (the corps and turrets have hp; the horde
      // dies at 0)
      if (a.st < 2) {
        a.hp -= BURN_DPS * dt;
        if (a.hp <= 0) {
          a.dead = true;
          if (this.stains) this.stains.splat(a.x, a.y, "scorch", a.seed);
        }
      } else {
        a.hp -= BURN_DPS * dt;
        if (a.hp <= 0) this._killZombie(a);
      }
      // frantic: a new heading every ~0.3s, never a full stop
      a.bT -= dt;
      if (a.bT <= 0) {
        a.burnDir += ZS.rnd(-1.2, 1.2);
        a.bT = 0.3;
      }
      a.a = a.burnDir;
      a.vx += (Math.cos(a.a) * 105 - a.vx) * dt * 6;
      a.vy += (Math.sin(a.a) * 105 - a.vy) * dt * 6;
      a.wantMove = true;
      if (a.st === 2) a.tAge = 2.5; // a burning zombie abandons the prey
      // whoever they touch catches fire too — through open ground or a
      // broken door, never through a wall or a sealed one
      grid.query(a.x, a.y, INFECT + 4, (b) => {
        if (b === a || b.burn > 0 || b.st === 1 || b.dead) return;
        if (!nav.los(a.x, a.y, b.x, b.y, true)) return;
        if (Math.random() < BURN_SPREAD * dt) this._ignite(b);
      });
    }

    /* ---------- the defense corps ---------- */

    // the town's armed line: hold the arc around the district, fire on the
    // threat, fall back as a unit when the line breaks, and die (or burn)
    // defending the core if it's reached. The wounded break and run for a
    // door, still firing.
    _updateDefender(a, dt, t, grid, nav, buildings) {
      a.fireCd -= dt;
      a.muzzle = Math.max(0, a.muzzle - dt);
      if (a.grnCd > 0) a.grnCd -= dt;
      a.tAtk -= dt;
      const isT = a.wep === "turret";
      if (isT) {
        // the emplacement: fixed, mortal, no retreat — and it only fires
        // while the gunner is alive and at his slot
        const rec = a.tId >= 0 ? this.turrets[a.tId] : null;
        const crew = rec && rec.crew;
        const manned =
          crew && !crew.dead && crew.st < 2 && Math.hypot(crew.x - a.x, crew.y - a.y) < 120;
        if (manned) {
          let tz = null,
            bd2 = TURRET_RANGE * TURRET_RANGE;
          grid.query(a.x, a.y, TURRET_RANGE, (b) => {
            if (b.st !== 2) return;
            const dx = b.x - a.x,
              dy = b.y - a.y,
              d2 = dx * dx + dy * dy;
            if (d2 < bd2) {
              bd2 = d2;
              tz = b;
            }
          });
          if (tz) {
            a.a = Math.atan2(tz.y - a.y, tz.x - a.x);
            crew.a = a.a; // the gunner tracks along the barrel
            if (a.fireCd <= 0 && nav.los(a.x, a.y, tz.x, tz.y, false))
              this._shot(a, tz, Math.sqrt(bd2), WEP.turret);
          }
        }
        // the horde gnaws the emplacement: contact damage on a cooldown
        grid.query(a.x, a.y, INFECT + 8, (b) => {
          if (b.st !== 2) return;
          const dx = b.x - a.x,
            dy = b.y - a.y;
          if (dx * dx + dy * dy < (INFECT + 8) * (INFECT + 8) && a.tAtk <= 0) {
            a.tAtk = 1.5;
            a.hp -= 1;
            a.flash = 0.3;
            if (a.hp <= 0) {
              a.dead = true;
              this.fx.push({ x: a.x, y: a.y, t: 0.4, poof: true, seed: Math.random() * 997 });
              if (this.stains) this.stains.splat(a.x, a.y, "scorch", a.seed);
              let h = null;
              grid.query(a.x, a.y, 160, (b) => {
                if (b.st !== 0 || h) return;
                h = b;
              });
              if (h) this._shout(h, "turret-down");
            }
          }
        });
        return;
      }
      const s = a.sid >= 0 ? this.sq[a.sid] : null;
      if (a.crewFor >= 0) {
        // the gunner: hold his slot at the emplacement, then share the
        // rifle fire below
        this._updateCrew(a, dt, t, grid, nav);
      } else if (s) {
        const door = a.sentry && s.doorB >= 0 ? ZS.Buildings.list[s.doorB].door : null;
        if (a.sentry && door && !door.broken) {
          // the door sentry: hold the post and fire at whatever comes; the
          // line holds behind the door until it breaks
          if (a.sentryB !== s.doorB) {
            a.sentryB = s.doorB;
            const p = nav.nearestWalkable(door.front.x, door.front.y, 40, false);
            if (p) {
              a.sx = p.x;
              a.sy = p.y;
            }
          }
          if (a.hp <= 1) {
            this._wounded(a, dt, t, nav, buildings);
          } else if (Math.hypot(a.sx - a.x, a.sy - a.y) > 24) {
            // walking to the post
            a.tgt.x = a.sx;
            a.tgt.y = a.sy;
            a.wantMove = true;
            ZS.planAndFollow(a, a.tgt, false, 70, dt, t, nav);
          } else {
            // on the post: a small sway around the slot
            const hwx = a.sx + ZS.jit(a.seed + 5) * 6,
              hwy = a.sy + ZS.jit(a.seed + 6) * 6;
            a.a = Math.atan2(hwy - a.y, hwx - a.x);
            a.vx += (Math.cos(a.a) * 26 - a.vx) * dt * 3;
            a.vy += (Math.sin(a.a) * 26 - a.vy) * dt * 3;
            a.wantMove = true;
          }
        } else {
          if (a.sentry) {
            // the post is lost (door broke, no next door): rejoin the arc
            a.sentry = false;
            a.sentryB = -1;
            a.sx = 0;
            a.sy = 0; // force the arc-slot recompute
            if (s.sentry === a) s.sentry = null;
          }
          if (a.hp <= (a.wep === "grenade" ? 2 : 1)) {
            this._wounded(a, dt, t, nav, buildings);
          } else if (
            a.sline !== s.line ||
            (a.sx === 0 && a.sy === 0) ||
            Math.abs(a.slotA - s.thA) > 0.6
          ) {
            const n = s.n0;
            const spread = Math.min(1.9, 0.52 * n);
            const ang = s.thA + (a.rank - (n - 1) / 2) * (spread / Math.max(1, n - 1));
            let R = s.line === 0 ? 58 + n * 9 : 40 + n * 8;
            // the grenadier sits back from the line: he throws at the
            // district's crisis, he is not the front man (nearestWalkable
            // can pull the slot forward, so the offset is deep)
            if (a.wep === "grenade") R += 140;
            // the front arc steps out to meet a closing threat (the
            // grenadier stays put)
            if (s.line === 0 && s.thd >= 260 && s.thd <= 800 && a.wep !== "grenade")
              R += Math.max(0, 70 - s.thd * 0.09);
            const L = s.lines[s.line];
            const p = nav.nearestWalkable(
              L.x + Math.cos(ang) * R,
              L.y + Math.sin(ang) * R,
              90,
              false,
            );
            if (p) {
              a.sx = p.x;
              a.sy = p.y;
            }
            a.sline = s.line;
            a.slotA = s.thA;
          } else if (s.state === 1 || Math.hypot(a.sx - a.x, a.sy - a.y) > 16) {
            // run the (new) slot with cover fire: the line falls back firing
            a.tgt.x = a.sx;
            a.tgt.y = a.sy;
            a.wantMove = true;
            ZS.planAndFollow(a, a.tgt, false, s.state === 1 ? SQUAD_FALL : 56, dt, t, nav);
          } else ZS.wander(a, dt * 0.3); // hold the arc
        }
      } else if (a.rover) {
        this._updateRover(a, dt, t, grid, nav);
      } else {
        // an armed straggler: pace the home post like the old guards
        if (a.civ) {
          a.replanT -= dt;
          if (a.replanT <= 0) {
            a.replanT = 2.0;
            this._civilPost(a, buildings, nav, grid);
            a.wx = null;
          }
        }
        if (!a.wx || a.wt <= 0 || Math.hypot(a.wx.x - a.x, a.wx.y - a.y) < 18) {
          const p = nav.nearestWalkable(a.hx + ZS.rnd(-55, 55), a.hy + ZS.rnd(-55, 55), 160, false);
          a.wx = p || { x: a.hx, y: a.hy };
          a.wt = 2 + Math.random() * 3;
        }
        a.wt -= dt;
        a.wantMove = true;
        ZS.planAndFollow(a, a.wx, false, 30, dt, t, nav);
      }
      // fire: the loadout decides range and rhythm; the guard sees out to
      // SOLD_PERC but only pulls the trigger inside the weapon's range
      const w = WEP[a.wep];
      if (a.wep === "grenade") {
        // the grenadier: sidearm at singles, a throw at the district's crisis
        this._grenadeThrow(a, grid, nav, s);
        return;
      }
      const tr = w.range;
      let tz = null,
        bd2 = Infinity;
      // focus fire: the squad's shared threat if it's alive and within reach
      if (s && s.thz && s.thz.st === 2 && !s.thz.dead) {
        const dx = s.thz.x - a.x,
          dy = s.thz.y - a.y;
        const rr = tr + 200;
        if (dx * dx + dy * dy <= rr * rr) {
          tz = s.thz;
          bd2 = dx * dx + dy * dy;
        }
      }
      if (!tz) {
        grid.query(a.x, a.y, Math.max(tr, SOLD_PERC), (b) => {
          if (b.st !== 2) return;
          const dx = b.x - a.x,
            dy = b.y - a.y;
          const d2 = dx * dx + dy * dy;
          // wounded zombies draw +25% range: the line finishes them together
          const rr = b.hp <= 1 ? tr * 1.25 : tr;
          if (d2 > rr * rr || d2 >= bd2) return;
          bd2 = d2;
          tz = b;
        });
      }
      if (!tz) return;
      a.a = Math.atan2(tz.y - a.y, tz.x - a.x);
      const d = Math.sqrt(bd2);
      if (d <= w.range && a.fireCd <= 0 && nav.los(a.x, a.y, tz.x, tz.y, false))
        this._shot(a, tz, d, w);
    }

    // the roving gunner: a threat in sight overrides everything — close to
    // a standoff and let the shared fire section do the rest; with no
    // threat, work the district posts in turn
    _updateRover(a, dt, t, grid, nav) {
      let tz = null,
        td = ROVER_SEE * ROVER_SEE;
      grid.query(a.x, a.y, ROVER_SEE, (b) => {
        if (b.st !== 2) return;
        const dx = b.x - a.x,
          dy = b.y - a.y,
          d2 = dx * dx + dy * dy;
        if (d2 < td) {
          td = d2;
          tz = b;
        }
      });
      if (tz) {
        const d = Math.sqrt(td);
        if (d > 100) {
          // walk to a 100px standoff on the far side of the threat
          a.tgt.x = tz.x - ((tz.x - a.x) / d) * 100;
          a.tgt.y = tz.y - ((tz.y - a.y) / d) * 100;
          a.wantMove = true;
          ZS.planAndFollow(a, a.tgt, false, 60, dt, t, nav);
        } else ZS.wander(a, dt * 0.5); // at standoff: shuffle, keep firing
        return;
      }
      a.rvT -= dt;
      const s = this.sq.length ? this.sq[a.rvI % this.sq.length] : null;
      if (!s) {
        ZS.wander(a, dt);
        return;
      }
      const dx = s.ax - a.x,
        dy = s.ay - a.y;
      if (a.rvT <= 0 || dx * dx + dy * dy > 80 * 80) {
        a.rvT = 5;
        const p = nav.nearestWalkable(s.ax, s.ay, 120, false);
        if (p) {
          a.tgt.x = p.x;
          a.tgt.y = p.y;
          a.wantMove = true;
          ZS.planAndFollow(a, a.tgt, false, 50, dt, t, nav);
        } else ZS.wander(a, dt);
      } else ZS.wander(a, dt * 0.6); // at the post: hold and watch
    }

    // the gunner: hold his slot at the emplacement, face what the gun tracks
    _updateCrew(a, dt, t, grid, nav) {
      const rec = this.turrets[a.crewFor];
      if (!rec) {
        ZS.wander(a, dt);
        return;
      }
      const dx = rec.sx - a.x,
        dy = rec.sy - a.y;
      if (dx * dx + dy * dy > 16 * 16) {
        a.tgt.x = rec.sx;
        a.tgt.y = rec.sy;
        a.wantMove = true;
        ZS.planAndFollow(a, a.tgt, false, 60, dt, t, nav);
      } else {
        if (rec.gun && !rec.gun.dead) a.a = rec.gun.a;
        ZS.wander(a, dt * 0.25);
      }
    }

    // where the next wave will press: the district still standing weakest
    _fallDir() {
      let si = -1,
        sa = Infinity;
      for (let i = 0; i < this.sq.length; i++) {
        if (this.sq[i].alive < sa) {
          sa = this.sq[i].alive;
          si = i;
        }
      }
      let d = null;
      if (si >= 0 && this.towns) d = this.towns[this.sq[si].di];
      if (!d && this.towns && this.towns.length)
        d = this.towns[(this.wave * 7) % this.towns.length];
      if (!d) return "the hills";
      const n = d.y < this.coreY ? "north" : "south";
      const e = d.x < this.coreX ? "west" : "east";
      return "the " + n + " " + e;
    }

    // the grenadier: a sidearm at singles, and a throw at the district's
    // crisis — first the horde gnawing the door, else the densest pack in reach
    _grenadeThrow(a, grid, nav, s) {
      let tz = null,
        td = 130 * 130;
      grid.query(a.x, a.y, 130, (b) => {
        if (b.st !== 2) return;
        const dx = b.x - a.x,
          dy = b.y - a.y,
          d2 = dx * dx + dy * dy;
        if (d2 < td) {
          td = d2;
          tz = b;
        }
      });
      if (tz && a.fireCd <= 0 && nav.los(a.x, a.y, tz.x, tz.y, false)) {
        a.a = Math.atan2(tz.y - a.y, tz.x - a.x);
        this._shot(a, tz, Math.sqrt(td), WEP.grenade);
        return;
      }
      if (a.grnCd > 0) return;
      let hx = 0,
        hy = 0,
        has = false;
      // priority: any door the horde is gnawing — the grenade's moment
      if (s) {
        let bfx = 0,
          bfy = 0,
          bestGnaws = 0,
          bestR0 = 0,
          prevBi = -1;
        for (let j = 0; j < this.sq.length; j++) {
          const q = this.sq[j];
          if (!q) continue;
          const bi = q.doorB;
          if (bi < 0 || bi === prevBi) continue;
          prevBi = bi;
          const bld = ZS.Buildings.list[bi];
          const d = bld && bld.door;
          if (!d || d.broken) continue;
          const dx0 = d.front.x - a.x,
            dy0 = d.front.y - a.y,
            r0 = dx0 * dx0 + dy0 * dy0;
          if (r0 > GRN_DOOR_R * GRN_DOOR_R) continue;
          let gnaws = 0;
          grid.query(d.front.x, d.front.y, 150, (b) => {
            if (b.st !== 2) return;
            gnaws++;
          });
          if (gnaws >= GRN_PACK && (gnaws > bestGnaws || (gnaws === bestGnaws && r0 < bestR0))) {
            bestGnaws = gnaws;
            bestR0 = r0;
            bfx = d.front.x;
            bfy = d.front.y;
          }
        }
        if (bestGnaws > 0) {
          // aim at the gnawer closest to the door front
          let bd2 = Infinity;
          grid.query(bfx, bfy, 150, (b) => {
            if (b.st !== 2) return;
            const ddx = b.x - bfx,
              ddy = b.y - bfy,
              dd2 = ddx * ddx + ddy * ddy;
            if (dd2 < bd2) {
              bd2 = dd2;
              hx = b.x;
              hy = b.y;
            }
          });
          if (nav.los(a.x, a.y, hx, hy, false)) has = true;
        }
      }
      if (!has) {
        // else the densest pack within throw range
        let mn = 0;
        grid.query(a.x, a.y, GRN_RANGE, (b) => {
          if (b.st === 2 && mn < 64) this.glist[mn++] = b;
        });
        let bc = 0;
        for (let i = 0; i < mn; i++) {
          const p = this.glist[i];
          let c = 1;
          for (let j = i + 1; j < mn; j++) {
            const q = this.glist[j];
            const dx = q.x - p.x,
              dy = q.y - p.y;
            if (dx * dx + dy * dy <= GRN_PACK_GAP * GRN_PACK_GAP) c++;
          }
          if (c > bc) {
            bc = c;
            hx = p.x;
            hy = p.y;
          }
        }
        if (bc >= GRN_PACK) has = true;
      }
      if (!has) return;
      a.a = Math.atan2(hy - a.y, hx - a.x);
      const ca = Math.cos(a.a);
      const seed = Math.random() * 997;
      this.fx.push({
        x0: a.x + ca * 10,
        y0: a.y - 8,
        x1: hx,
        y1: hy - 6,
        t: 0.9,
        grn: true,
        seed,
      });
      this.gren.push({ x: hx, y: hy, t: 0.9, seed });
      a.grnCd = GRN_CD;
      a.muzzle = 0.15;
      if (ZS.sound) ZS.sound.event("shot_gren", a.x, a.y);
      this._shout(a, "grenade");
    }

    // a wounded defender: break for a door, still firing on the way
    _wounded(a, dt, t, nav, buildings) {
      a.wounded = true;
      a.replanT -= dt;
      if (a.replanT <= 0) {
        a.shelterB = this._pickShelter(a, buildings, t);
        a.replanT = 1.0;
      }
      if (a.shelterB >= 0 && a.bld !== a.shelterB) {
        const b = buildings[a.shelterB];
        a.wantMove = true;
        ZS.planAndFollow(a, b.door.inner, false, 92, dt, t, nav);
      } else if (a.bld >= 0) ZS.wander(a, dt * 0.5);
      else ZS.wander(a, dt * 0.3);
    }

    // a civilian fighter's post: the nearer of an intact door front and a
    // guard's current slot
    _civilPost(a, buildings, nav, grid) {
      let bx = a.hx,
        by = a.hy,
        bd = Infinity;
      for (let i = 0; i < buildings.length; i++) {
        const d = buildings[i].door;
        if (!d || d.broken) continue;
        const dx = d.front.x - a.x,
          dy = d.front.y - a.y;
        const d2 = dx * dx + dy * dy;
        if (d2 < bd) {
          bd = d2;
          bx = d.front.x;
          by = d.front.y;
        }
      }
      if (grid)
        grid.query(a.x, a.y, 500, (g) => {
          if (!g.gun || g.wep === "turret" || g === a || g.st >= 2) return;
          if (g.sx === 0 && g.sy === 0) return;
          const dx = g.sx - a.x,
            dy = g.sy - a.y;
          const d2 = dx * dx + dy * dy;
          if (d2 < bd) {
            bd = d2;
            bx = g.sx;
            by = g.sy;
          }
        });
      const p = nav.nearestWalkable(bx, by, 60, false);
      if (p) {
        a.hx = p.x;
        a.hy = p.y;
      }
    }

    // the nearest intact door to the district anchor, within 550px
    _nearestDoorB(ax, ay, skipB) {
      const bl = ZS.Buildings.list;
      let best = -1,
        bd = 550 * 550;
      for (let i = 0; i < bl.length; i++) {
        if (i === skipB) continue;
        const d = bl[i].door;
        if (!d || d.broken) continue;
        const dx = d.front.x - ax,
          dy = d.front.y - ay;
        const d2 = dx * dx + dy * dy;
        if (d2 < bd) {
          bd = d2;
          best = i;
        }
      }
      return best;
    }

    // the door sentry: the last-ranked guard (highest rank) takes the post
    _assignSentry(s, si, agents) {
      let best = null,
        br = -1;
      for (let i = 0; i < agents.length; i++) {
        const g = agents[i];
        if (g.sid !== si || g.dead || g.st >= 2) continue;
        if (g.rank > br) {
          br = g.rank;
          best = g;
        }
      }
      s.sentry = best;
      if (best) {
        best.sentry = true;
        best.sentryB = -1; // a fresh post at s.doorB
      }
    }

    // one volley: tracers (or a pellet fan), blood, damage, and the line's
    // commands cutting through the panic
    _shot(a, tz, d, w) {
      a.fireCd = w.cd;
      a.muzzle = 0.12;
      if (ZS.sound) {
        if (a.wep === "turret") ZS.sound.event("turret", a.x, a.y);
        else if (a.wep === "shotgun") ZS.sound.event("shot_shotgun", a.x, a.y);
        else if (a.wep === "smg") ZS.sound.event("shot_smg", a.x, a.y);
        else if (a.wep === "rifle") ZS.sound.event("shot_rifle", a.x, a.y);
      }
      const ca = Math.cos(a.a),
        sa = Math.sin(a.a) * 0.4;
      const mx = a.x + ca * 11,
        my = (a.wep === "turret" ? a.y - 3 : a.y - 9) + sa * 11;
      for (let i = 0; i < w.pellets; i++) {
        const sp =
          w.spread > 0 ? (i - (w.pellets - 1) / 2) * (w.spread / (w.pellets - 1)) * 0.5 : 0;
        const off = Math.tan(sp) * d;
        this.fx.push({
          x0: mx,
          y0: my,
          x1: tz.x - sa * off + (w.pellets > 1 ? ZS.rnd(-4, 4) : 0),
          y1: tz.y - 6 + ca * off + (w.pellets > 1 ? ZS.rnd(-3, 3) : 0),
          t: 0.07,
        });
      }
      if (Math.random() < BLOOD_CHANCE) {
        const bs = Math.random() * 997;
        if (this.stains) this.stains.splat(tz.x, tz.y, "shot", bs);
        this.fx.push({
          x: tz.x,
          y: tz.y - 5,
          t: 0.3,
          blood: w.pellets > 1 ? 3 : 2,
          seed: bs,
        });
      }
      tz.hp -= w.dmg;
      if (tz.hp <= 0) this._killZombie(tz);
      // a guard yells while working — the line's commands cut through the panic
      if (a.sayT <= 0 && Math.random() < 0.4) {
        this._shout(a, "gun");
      }
    }

    _killZombie(b) {
      b.dead = true;
      this.fx.push({ x: b.x, y: b.y, t: 0.3, poof: true, seed: Math.random() * 997 });
      this.fx.push({ x: b.x, y: b.y - 4, t: 0.45, blood: 3, seed: Math.random() * 997 });
      if (this.stains) this.stains.corpse(b);
      // a zombie that dies in the fire leaves a patch of it
      if (b.burn > 0 && Math.random() < 0.25) {
        this.fx.push({ x: b.x, y: b.y, t: 4, gfire: true, seed: Math.random() * 997 });
        if (ZS.sound) ZS.sound.event("fire", b.x, b.y);
      }
    }

    // the blast: a ring of ink, soot, a dead zone, and a chance of ground
    // fire — the dead zone respects walls and sealed doors
    _boom(agents, grid, nav, x, y, seed) {
      this.fx.push({ x, y, t: 0.6, boom: true, seed });
      this.fx.push({ x, y, t: 0.15, flash: true, seed: seed + 3 });
      if (ZS.sound) ZS.sound.event("boom", x, y);
      if (this.stains) this.stains.splat(x, y, "scorch", seed);
      if (this.stains)
        this.stains.splat(x + ZS.rnd(-10, 10), y + ZS.rnd(-10, 10), "scorch2", seed + 5);
      if (this.hz.length) {
        let bd = Infinity,
          bz = this.hz[0];
        for (let zi = 0; zi < this.hz.length; zi++) {
          const z = this.hz[zi];
          const dd = (z.x - x) * (z.x - x) + (z.y - y) * (z.y - y);
          if (dd < bd) {
            bd = dd;
            bz = z;
          }
        }
        bz.h += 25;
      }
      grid.query(x, y, GRN_RADIUS, (b) => {
        if (b.dead) return;
        const dx = b.x - x,
          dy = b.y - y;
        if (dx * dx + dy * dy > GRN_RADIUS * GRN_RADIUS) return;
        // the blast doesn't punch through a wall or a sealed door
        if (!nav.los(x, y, b.x, b.y, true)) return;
        if (b.st === 2) {
          b.hp -= GRN_DMG;
          if (b.hp <= 0) this._killZombie(b);
          if (Math.random() < GRN_IGNITE) this._ignite(b);
        } else if (b.st < 2) {
          if (Math.random() < GRN_CIV_IGNITE) this._ignite(b);
        }
      });
      if (Math.random() < 0.5) {
        this.fx.push({
          x: x + ZS.rnd(-14, 14),
          y: y + ZS.rnd(-14, 14),
          t: 6,
          gfire: true,
          seed: seed + 7,
        });
        if (ZS.sound) ZS.sound.event("fire", x, y);
      }
    }

    _updateSurvivor(a, dt, t, grid, nav, buildings) {
      let bz = null,
        bd2 = FLEE * FLEE;
      grid.query(a.x, a.y, FLEE, (b) => {
        if (b.st !== 2) return;
        const dx = b.x - a.x,
          dy = b.y - a.y,
          d2 = dx * dx + dy * dy;
        if (d2 < bd2) {
          bd2 = d2;
          bz = b;
        }
      });
      // panic on what you can actually see: a zombie behind a wall is a
      // rumor (the voice panic below carries that)
      if (bz && !nav.los(a.x, a.y, bz.x, bz.y, false, this.swim)) bz = null;
      const inB = a.bld;
      // a shout just reached me: gasp, and maybe answer it
      if (a.justHeard) {
        a.justHeard = false;
        if (a.sayT <= 0 && Math.random() < 0.45) {
          a.say = HEARD[(Math.random() * HEARD.length) | 0];
          a.sayT = a.sayMax = 1.4;
        }
      }
      if (bz) {
        if (inB >= 0) {
          const b = buildings[inB];
          if (b.inCount > 0) {
            // a zombie is inside with me: run for the exit
            a.wantMove = true;
            if (b.door) ZS.planAndFollow(a, b.door.front, false, 84, dt, t, nav);
            else ZS.planAndFollow(a, b.escape, false, 72, dt, t, nav);
          } else {
            ZS.wander(a, dt * 0.6); // hold the floor: no threat inside
          }
        } else {
          // outside and chased: find a building
          a.replanT -= dt;
          if (a.replanT <= 0) {
            a.shelterB = this._pickShelter(a, buildings, t);
            a.replanT = 1.0;
          }
          if (a.shelterB >= 0) {
            const b = buildings[a.shelterB];
            a.wantMove = true;
            const r = ZS.planAndFollow(a, b.door.inner, false, 84, dt, t, nav);
            if (r === "fail") {
              if (!a.deny) a.deny = {};
              a.deny[a.shelterB] = t + 2.5;
              a.shelterB = -1; // try the next-best building next cycle
            }
          } else {
            // no shelter to be had: old-school panic
            const fa = Math.atan2(a.y - bz.y, a.x - bz.x);
            const panic = 1 + 0.5 * Math.sin(t * 14 + a.ph);
            a.a = fa;
            a.vx += (Math.cos(fa) * 66 * panic - a.vx) * dt * 4.5;
            a.vy += (Math.sin(fa) * 66 * panic - a.vy) * dt * 4.5;
            a.wantMove = true;
          }
          this._tryShout(a, dt, 1.5, "panic"); // warn anyone who can hear
        }
      } else if (a.scareT > 0 && inB < 0) {
        // heard the panic: run for the doors, zombie or no zombie in sight
        a.replanT -= dt;
        if (a.replanT <= 0) {
          a.shelterB = this._pickShelter(a, buildings, t);
          a.replanT = 1.0;
        }
        if (a.shelterB >= 0) {
          const b = buildings[a.shelterB];
          a.wantMove = true;
          ZS.planAndFollow(a, b.door.inner, false, 76, dt, t, nav);
        } else ZS.wander(a, dt);
        this._tryShout(a, dt, 0.6, "alarm"); // carry the alarm farther
      } else {
        if (inB >= 0)
          ZS.wander(a, dt * 0.5); // resting in a safe building
        else ZS.wander(a, dt);
      }
      a.inf = Math.max(0, a.inf - dt * 0.6);
      a.scareT = Math.max(0, a.scareT - dt);
    }

    // nearest building with an intact door worth running to
    _pickShelter(a, buildings, t) {
      let best = -1,
        bs = Infinity;
      for (let i = 0; i < buildings.length; i++) {
        const b = buildings[i];
        if (!b.door || b.door.broken) continue;
        if (a.deny && a.deny[i] && t < a.deny[i]) continue;
        const f = b.door.front;
        // a house with zombies in it reads as death; a full house reads as
        // far — the town spreads across its buildings instead of one funnel
        const s = Math.hypot(f.x - a.x, f.y - a.y) + b.inCount * 600 + b.survCount * 60;
        if (s < bs) {
          bs = s;
          best = i;
        }
      }
      return best;
    }

    /* ---------- population ---------- */

    // scale with the viewport like the original, capped so drawing stays cheap
    baseCount(vw, vh) {
      return ZS.clamp(Math.floor((vw * vh) / 1100), 36, 910);
    }

    init(agents, world, vw, vh, wave) {
      this.spawnTimer = 6;
      this.sq = [];
      this.gren = [];
      this.packTimer = 2;
      this.packsSpawned = 0;
      this.waveAge = 0;
      this.surged = false;
      this.armTimer = 8;
      const n = this.baseCount(vw, vh);
      for (let i = 0; i < n; i++) {
        const p = world.nav.randLand();
        agents.push(this.makeAgent(p.x, p.y, 0));
      }
      // the outbreak starts wherever the crowd happens to be thickest
      const zx = ZS.rnd(world.w * 0.35, world.w * 0.65);
      const zy = ZS.rnd(world.h * 0.35, world.h * 0.65);
      agents.sort(
        (p, q) =>
          (p.x - zx) * (p.x - zx) +
          (p.y - zy) * (p.y - zy) -
          ((q.x - zx) * (q.x - zx) + (q.y - zy) * (q.y - zy)),
      );
      const nz = Math.min(1 + Math.floor(wave * 0.7), 6);
      for (let i = 0; i < nz && i < agents.length; i++) {
        agents[i].st = 2;
        moan(agents[i].x, agents[i].y);
      }
      // the defense corps: one squad per district that holds buildings,
      // a turret on the gap, and every district's last stand is the core
      const bl = ZS.Buildings.list;
      const coreX = bl.length && bl.reduce((s, b) => s + b.x + b.w / 2, 0) / bl.length;
      const coreY = bl.length && bl.reduce((s, b) => s + b.y + b.h / 2, 0) / bl.length;
      this.coreX = coreX || world.w / 2;
      this.coreY = coreY || world.h / 2;
      const tw = world.towns;
      // the auto camera's zones: each district post and the town core
      this.hz.length = 0;
      // Round 5: the report bookkeeping + the crews start fresh each wave
      this.towns = tw;
      this.wave = wave;
      this.lastSurv = null;
      this.wLost = 0;
      this.fell = false;
      this.fall = null;
      this.artCd = 0;
      this.turrets.length = 0;
      for (let di = 0; di < tw.length; di++) this.hz.push({ x: tw[di].x, y: tw[di].y, h: 0 });
      this.hz.push({ x: this.coreX, y: this.coreY, h: 0 });
      for (let di = 0; di < tw.length; di++) {
        let cx = 0,
          cy = 0,
          cnt = 0;
        for (const b of bl) {
          if (
            Math.hypot(b.x + b.w / 2 - tw[di].x, b.y + b.h / 2 - tw[di].y) <
            tw[di].spread * 0.75 + 120
          ) {
            cx += b.x + b.w / 2;
            cy += b.y + b.h / 2;
            cnt++;
          }
        }
        if (!cnt) continue;
        cx /= cnt;
        cy /= cnt;
        const lines = [
          { x: tw[di].x, y: tw[di].y },
          { x: cx, y: cy },
          { x: this.coreX, y: this.coreY },
        ];
        const s = {
          ax: lines[0].x,
          ay: lines[0].y,
          cx: lines[0].x,
          cy: lines[0].y,
          n0: 0,
          alive: 0,
          thx: this.coreX,
          thy: this.coreY,
          thd: -1,
          thA: Math.atan2(this.coreY - lines[0].y, this.coreX - lines[0].x),
          state: 0,
          line: 0,
          lines,
          breach: 0,
          home: 0,
          thz: null,
          sentry: null,
          lead: null,
          di,
        };
        const si = this.sq.length;
        this.sq.push(s);
        const size = ZS.clamp(cnt, 3, 6);
        const mix = SQUAD_MIX[size];
        let lastG = null;
        for (let k = 0; k < size; k++) {
          const ang = (k / size) * 6.283 + ZS.hash(si * 31 + k) * 0.9;
          const p = world.nav.nearestWalkable(
            lines[0].x + Math.cos(ang) * 70,
            lines[0].y + Math.sin(ang) * 70,
            240,
            false,
          );
          if (!p) continue;
          const g = this.makeAgent(p.x, p.y, 0, true);
          g.wep = mix[k];
          g.hx = p.x;
          g.hy = p.y;
          g.sid = si;
          g.rank = k;
          g.sx = p.x;
          g.sy = p.y;
          g.sline = 0;
          g.slotA = s.thA;
          agents.push(g);
          s.n0++;
          lastG = g;
        }
        // the door sentry: the last-ranked guard holds the nearest intact door
        s.doorB = this._nearestDoorB(lines[0].x, lines[0].y, -1);
        if (s.doorB >= 0 && lastG) {
          const d = bl[s.doorB].door;
          const p = world.nav.nearestWalkable(d.front.x, d.front.y, 40, false);
          if (p && d && !d.broken) {
            lastG.sx = p.x;
            lastG.sy = p.y;
            lastG.sentry = true;
            lastG.sentryB = s.doorB;
            s.sentry = lastG;
          }
        }
        if (cnt >= 2) {
          // the turret holds the gap between the front line and the core
          const tx = lines[0].x + (cx - lines[0].x) * 0.55;
          const ty = lines[0].y + (cy - lines[0].y) * 0.55;
          const p = world.nav.nearestWalkable(tx, ty, 160, false);
          if (p) {
            const g = this.makeAgent(p.x, p.y, 0, true);
            g.wep = "turret";
            g.hp = TURRET_HP;
            g.hx = p.x;
            g.hy = p.y;
            g.sid = -1;
            const tId = this.turrets.length;
            this.turrets.push({ gun: g, crew: null, sx: 0, sy: 0 });
            g.tId = tId;
            agents.push(g);
            // the gunner: an ordinary rifleman who stands at the gun; the
            // emplacement only fires while he's alive and at his slot
            const dx0 = this.coreX - p.x,
              dy0 = this.coreY - p.y,
              dl = Math.hypot(dx0, dy0) || 1;
            const q = world.nav.nearestWalkable(
              p.x + (dx0 / dl) * 30,
              p.y + (dy0 / dl) * 30,
              60,
              false,
            );
            const ox = q ? q.x : p.x,
              oy = q ? q.y : p.y;
            this.turrets[tId].sx = ox;
            this.turrets[tId].sy = oy;
            const op = this.makeAgent(ox, oy, 0, true);
            op.wep = "rifle";
            op.crewFor = tId;
            op.hx = ox;
            op.hy = oy;
            agents.push(op);
            this.turrets[tId].crew = op;
          }
        }
      }
      // the rovers: a handful of gunners who keep moving — they see the
      // town the fixed posts can't
      for (let i = 0; i < ROVER_N; i++) {
        const p = world.nav.randLand();
        if (!p) continue;
        const g = this.makeAgent(p.x, p.y, 0, true);
        g.wep = "rifle";
        g.rover = true;
        g.rvI = i;
        agents.push(g);
      }
      // the grenade carriers: one soldier per district carries grenades —
      // drawn like the other riflemen, they sit back from the line and throw
      // at the district's crisis (the F4 chain: throw -> boom -> ground fire)
      let gd = -1;
      for (let i = 0; i < this.sq.length; i++) {
        const s = this.sq[i];
        const pr = s.n0 === 4 ? 1 : 0; // size-4: keep the rank-0 SMG up front
        for (let k = 0; k < agents.length; k++) {
          const g = agents[k];
          if (g.sid === i && g.rank === pr) {
            g.wep = "grenade";
            if (gd < 0) gd = s.di; // the opening packs press this post
            break;
          }
        }
      }
      if (gd >= 0) this.grenDi = gd;
      // the town's fighters: FIGHTER-personality civilians near a district
      // "find a gun" and hold the nearest door or a guard slot
      for (let di = 0; di < tw.length; di++) {
        const cand = [];
        for (let i = 0; i < agents.length; i++) {
          const a = agents[i];
          if (a.st !== 0 || a.pers !== 0 || a.gun) continue;
          const dx = a.x - tw[di].x,
            dy = a.y - tw[di].y;
          if (dx * dx + dy * dy > 400 * 400) continue;
          cand.push({ a, d2: dx * dx + dy * dy });
        }
        cand.sort((p, q) => p.d2 - q.d2);
        const n2 = Math.min(10, cand.length);
        for (let i = 0; i < n2; i++) {
          const a = cand[i].a;
          a.gun = true;
          a.civ = true;
          a.wep = Math.random() < 0.5 ? "shotgun" : "smg";
          a.sid = -1;
          this._civilPost(a, bl, world.nav, null);
          a.replanT = ZS.rnd(0.5, 2.5);
          a.flash = 0.5;
          this._shout(a, "recruit");
        }
      }
      // the bugle: a new night begins
      if (ZS.sound) ZS.sound.event("horn", this.coreX, this.coreY);
    }

    // a pack of the horde rolls in from one edge and presses a district
    _pack(agents, world, wave, surge) {
      const side = (Math.random() * 4) | 0;
      const w = world.w,
        h = world.h;
      let cx, cy;
      if (side === 0) {
        cx = w * ZS.rnd(0.15, 0.85);
        cy = 30;
      } else if (side === 1) {
        cx = w - 30;
        cy = h * ZS.rnd(0.15, 0.85);
      } else if (side === 2) {
        cx = w * ZS.rnd(0.15, 0.85);
        cy = h - 30;
      } else {
        cx = 30;
        cy = h * ZS.rnd(0.15, 0.85);
      }
      // target a district: the invasion presses a post
      let tx = this.coreX,
        ty = this.coreY;
      const tw = world.towns;
      if (tw.length) {
        // the districts are military posts: a pack presses one regardless of
        // how many civilians are still hanging around
        let pick = (Math.random() * tw.length) | 0;
        // the opening wave opens on the grenadier's post: the horde's first
        // contact is the throw's moment, and the boom lands where the crowd
        // is looking
        if (this.grenDi >= 0 && this.grenDi < tw.length && this.packsSpawned < 3)
          pick = this.grenDi;
        if (surge) {
          // the surge throws its weight at the post bleeding the worst:
          // fewest defenders still standing (a fallen post reads as 0)
          let bp = 0,
            ba = Infinity;
          for (let di = 0; di < this.sq.length; di++) {
            const s = this.sq[di];
            if (s.alive < ba) {
              ba = s.alive;
              bp = s.di;
            }
          }
          pick = bp;
        }
        tx = tw[pick].x;
        ty = tw[pick].y;
      }
      // the anchor's jitter can land in the river: resolve to a walkable cell
      const pt = world.nav.nearestWalkable(tx, ty, 400, true);
      if (pt) {
        tx = pt.x;
        ty = pt.y;
      }
      // the river splits the map: if this edge can't path to the target,
      // re-roll the spawn edge until the way is open
      for (let tr = 0; tr < 4 && !world.nav.astar(cx, cy, tx, ty, true, 6000, this.swim); tr++) {
        const up = ty < world.h / 2;
        const sd = tr === 0 ? side : (Math.random() * 4) | 0;
        if (sd === 0) {
          cx = w * ZS.rnd(0.15, 0.85);
          cy = 30;
        } else if (sd === 1) {
          cx = w - 30;
          cy = h * (up ? ZS.rnd(0.15, 0.4) : ZS.rnd(0.6, 0.85));
        } else if (sd === 2) {
          cx = w * ZS.rnd(0.15, 0.85);
          cy = h - 30;
        } else {
          cx = 30;
          cy = h * (up ? ZS.rnd(0.15, 0.4) : ZS.rnd(0.6, 0.85));
        }
      }
      // the opening packs are the invasion's first blow: bigger, and they
      // keep their target long enough to cover a full approach (a short
      // packT let them drop the anchor mid-walk and scatter)
      const opening = this.packsSpawned < 3;
      // escalation: the longer the wave lives, the bigger each pack arrives
      const size = opening
        ? ZS.clamp(9 + wave, 10, PACK_CAP)
        : ZS.clamp(5 + wave + ((this.waveAge / 30) | 0), 6, PACK_CAP);
      for (let i = 0; i < size; i++) {
        const p = world.nav.nearestWalkable(cx + ZS.rnd(-70, 70), cy + ZS.rnd(-70, 70), 300, true);
        if (!p) continue;
        const z = this.makeAgent(p.x, p.y, 2);
        // tight blob around the shared point: the ±30 jitter used to
        // resolve to different perimeter points around a building,
        // spreading the pack into a ring that never formed the 3-in-90px
        // cluster the grenadier throws at
        const mt = world.nav.nearestWalkable(tx + ZS.rnd(-12, 12), ty + ZS.rnd(-12, 12), 40, true);
        z.tx = mt ? mt.x : tx;
        z.ty = mt ? mt.y : ty;
        z.tAge = 0;
        z.packT = opening || surge ? 75 : PACK_T;
        agents.push(z);
        moan(z.x, z.y);
      }
    }

    // reinforcements arrive at the world's edge while a round lives — and so
    // does the invasion, plus the town picking up guns
    maintain(agents, dt, world, vw, vh) {
      this.waveAge += dt;
      this.spawnTimer -= dt;
      moanClock += dt;
      if (this.spawnTimer <= 0 && agents.length < this.baseCount(vw, vh) + 8) {
        for (let i = 0; i < 2; i++) {
          const side = (Math.random() * 4) | 0;
          let x, y;
          if (side === 0) {
            x = 40;
            y = ZS.rnd(80, world.h - 80);
          } else if (side === 1) {
            x = world.w - 40;
            y = ZS.rnd(80, world.h - 80);
          } else if (side === 2) {
            x = ZS.rnd(80, world.w - 80);
            y = 40;
          } else {
            x = ZS.rnd(80, world.w - 80);
            y = world.h - 40;
          }
          const p = world.nav.nearestWalkable(x, y, 400, false);
          if (p) agents.push(this.makeAgent(p.x, p.y, 0));
        }
        this.spawnTimer = ZS.rnd(7, 13);
      }
      // the invasion: packs from the edge, capped so the horde stays a fight
      const wave = ZS.Sim ? ZS.Sim.wave : 1;
      this.packTimer -= dt;
      if (this.packTimer <= 0) {
        let zomb = 0;
        for (let i = 0; i < agents.length; i++) if (agents[i].st === 2) zomb++;
        if (zomb < Math.min(ZOMB_CAP0 + wave * 15, 320) && agents.length < AGENT_SOFT_CAP) {
          // the flood doubles up late in the wave: two packs roll in at once
          const nPacks = this.waveAge > 120 ? 2 : 1;
          for (let pk = 0; pk < nPacks; pk++) {
            this._pack(agents, world, wave);
            this.packsSpawned++;
          }
          // the first packs come in quick; the flood steadies after — and
          // thickens as the wave goes on (the escalation)
          this.packTimer =
            this.packsSpawned < 3
              ? ZS.rnd(3, 5)
              : Math.max(
                  3,
                  ZS.rnd(9, 15) /
                    (1 + (wave - 1) * 0.15) /
                    (1 + Math.min(this.waveAge / 90, 1) * 0.6),
                );
        } else this.packTimer = 2;
      }
      // the surge: once per wave, after the first minute, the invasion stops
      // trickling and throws a heavy pack at the post bleeding the worst
      if (!this.surged && this.waveAge > 60 && agents.length < AGENT_SOFT_CAP) {
        this.surged = true;
        this._pack(agents, world, wave, true);
        this.packsSpawned++;
      }
      // the town arms itself: a survivor near the line picks up a rifle
      this.armTimer -= dt;
      if (this.armTimer <= 0) {
        this.armTimer = ZS.rnd(4, 8);
        if (this.sq.length) {
          let armed = 0,
            pick = null;
          for (let i = 0; i < agents.length; i++) {
            const a = agents[i];
            if (a.st !== 0) continue;
            if (a.gun) {
              armed++;
              continue;
            }
            for (let si = 0; si < this.sq.length; si++) {
              const s = this.sq[si];
              if (s.alive <= 0) continue;
              const dx = a.x - s.cx,
                dy = a.y - s.cy;
              if (dx * dx + dy * dy < 90000) {
                pick = a;
                break;
              }
            }
            if (pick) break;
          }
          const cap = Math.max(24, Math.floor(this.baseCount(vw, vh) * ARMED_FRAC));
          if (pick && armed < cap) {
            let best = -1,
              bd = Infinity;
            for (let si = 0; si < this.sq.length; si++) {
              const s = this.sq[si];
              if (s.alive <= 0) continue;
              const dx = pick.x - s.cx,
                dy = pick.y - s.cy;
              const d = dx * dx + dy * dy;
              if (d < bd) {
                bd = d;
                best = si;
              }
            }
            if (best >= 0) {
              const a = pick;
              a.gun = true;
              a.wep = "rifle";
              a.sid = best;
              a.rank = this.sq[best].alive;
              a.hx = a.x;
              a.hy = a.y;
              a.flash = 0.5;
              this._shout(a, "recruit");
            }
          }
        }
      }
    }

    // how many "players" (the uninfected) are still on the field
    left(agents) {
      let n = 0;
      for (const a of agents) if (a.st < 2) n++;
      return n;
    }

    counts(agents) {
      let surv = 0,
        zomb = 0,
        shel = 0,
        guard = 0,
        turret = 0;
      for (const a of agents) {
        if (a.st < 2) {
          surv++;
          if (a.bld >= 0) shel++;
          if (a.gun) {
            guard++;
            if (a.wep === "turret") turret++;
          }
        } else zomb++;
      }
      return { surv, zomb, shel, guard, turret };
    }

    // what the auto-camera should be watching (CONTRACT B): the focal point
    // is the heat-weighted centroid of the hot zones and the view eases
    // toward it — no tour, no hops. Two hot zones far apart pull the camera
    // wide so both stay in frame; a live boom punches in for a second and
    // blends back. Nothing hot: the camera holds still.
    camInterest(dt) {
      this.pulseT = Math.max(0, this.pulseT - dt);
      if (this.pulseT > 0) {
        CI.x = this.pulseX;
        CI.y = this.pulseY;
        CI.zoom = 1.9;
        CI.ease = 0.35;
        return CI;
      }
      let hard = null;
      const fx = this.fx;
      if (fx) {
        for (let i = 0; i < fx.length; i++) {
          const f = fx[i];
          if (f.boom && f.t > 0.8) hard = { x: f.x, y: f.y, z: 1.9 };
          else if (f.grn && f.t > 0.7)
            hard = { x: (f.x0 + f.x1) / 2, y: (f.y0 + f.y1) / 2, z: 1.7 };
        }
      }
      if (hard) {
        this.pulseT = 1.1;
        this.pulseX = hard.x;
        this.pulseY = hard.y;
        CI.x = hard.x;
        CI.y = hard.y;
        CI.zoom = hard.z;
        CI.ease = 0.5;
        return CI;
      }
      const hz = this.hz;
      if (!hz.length) return null;
      let wn = 0,
        wsum = 0;
      for (let zi = 0; zi < hz.length; zi++)
        if (hz[zi].h > 10) {
          wn++;
          wsum += hz[zi].h;
        }
      if (!wn) return null; // quiet: hold the current view
      let fx2 = 0,
        fy2 = 0,
        mnX = Infinity,
        mnY = Infinity,
        mxX = -Infinity,
        mxY = -Infinity;
      for (let zi = 0; zi < hz.length; zi++) {
        const z = hz[zi];
        if (z.h <= 10) continue;
        const w = z.h / wsum;
        fx2 += z.x * w;
        fy2 += z.y * w;
        if (z.x < mnX) mnX = z.x;
        if (z.x > mxX) mxX = z.x;
        if (z.y < mnY) mnY = z.y;
        if (z.y > mxY) mxY = z.y;
      }
      // how far apart are the hot zones? the view eases wide to fit them
      const spread = Math.max(mxX - mnX, mxY - mnY);
      let zoom;
      if (wn === 1 || spread < 140) zoom = 1.45;
      else if (spread < 260) zoom = 1.15;
      else zoom = 0.95;
      // the focal eases toward the heat centroid so the view never leaps
      this.focalX += (fx2 - this.focalX) * Math.min(1, dt * 2.5);
      this.focalY += (fy2 - this.focalY) * Math.min(1, dt * 2.5);
      CI.x = this.focalX;
      CI.y = this.focalY;
      CI.zoom = zoom;
      CI.ease = 1.4;
      return CI;
    }

    // tap/click: call a strike — a grenade comes down from the sky. a tap
    // while the town is fallen dismisses the report card
    tap(agents, world, wx, wy) {
      if (this.fell) {
        this.skipBeat = true;
        return;
      }
      if (this.artCd > 0) return;
      const p = world.nav.nearestWalkable(wx, wy, 300, false);
      if (!p) return;
      this.artCd = 8;
      const seed = Math.random() * 997;
      this.gren.push({ x: p.x, y: p.y, t: 0.9, seed });
      this.fx.push({
        x0: p.x + 60,
        y0: p.y - 560,
        x1: p.x,
        y1: p.y,
        t: 0.9,
        grn: true,
        seed,
      });
      if (ZS.sound) ZS.sound.event("shot_gren", p.x, p.y - 200);
    }

    /* ---------- presentation ---------- */

    hud(agents, wave) {
      const self = this;
      const { surv, zomb, shel, guard, turret } = this.counts(agents);
      return {
        title: "outbreak, wave " + wave,
        stats:
          "alive " +
          surv +
          "   turned " +
          zomb +
          "   sheltered " +
          shel +
          "   guards " +
          guard +
          (turret ? "   turrets " + turret : ""),
        hint: "drag to pan · wheel to zoom · tap to call a strike",
        legend(c, y, fs, vw, vh) {
          c.strokeStyle = "rgba(60,58,50,0.7)";
          c.lineWidth = 1.2;
          ZS.wcirc(c, 14, y, 3.5, 5, 0.6);
          ZS.wline(c, 14, y + 3, 14, y + 9, 6, 0.5);
          c.strokeStyle = "rgb(72,102,58)";
          ZS.wcirc(c, 14, y + fs * 1.35, 3.5, 7, 0.6);
          ZS.wline(c, 14, y + fs * 1.35 + 3, 14, y + fs * 1.35 + 9, 8, 0.5);
          ZS.wline(c, 14, y + fs * 1.35 + 3, 20, y + fs * 1.35, 9, 0.5);
          c.strokeStyle = "rgba(46,44,40,0.9)";
          const ly = y + fs * 2.7;
          ZS.wcirc(c, 14, ly, 3.5, 10, 0.6);
          ZS.wline(c, 14, ly + 3, 14, ly + 9, 11, 0.5);
          ZS.wline(c, 10.5, ly - 4.6, 17.5, ly - 4.6, 12, 0.5); // hat brim
          ZS.wline(c, 17, ly + 5, 23, ly + 4, 13, 0.5); // rifle
          self._threatArrow(c, vw, vh);
        },
        overlay() {
          if (self.fell && self.lastSurv === 0) {
            const f = self.fall || { lost: 0, doors: 0, dir: "the hills" };
            return {
              card: {
                lost: true,
                title: "night " + wave + " — the town has fallen",
                lines: [
                  f.lost + " lost to the horde",
                  f.doors + " doors held",
                  "the horde swells from " + f.dir,
                ],
              },
            };
          }
          return null;
        },
      };
    }

    // the threat arrow: a sketched pointer at the screen edge while the
    // hottest zone is out of view
    _threatArrow(c, vw, vh) {
      const hz = this.hz;
      if (!hz.length || !vw) return;
      let bi = -1,
        bh = -1;
      for (let i = 0; i < hz.length; i++)
        if (hz[i].h > bh) {
          bh = hz[i].h;
          bi = i;
        }
      if (bi < 0 || bh < 14) return;
      const cam = ZS.debug && ZS.debug.cam;
      if (!cam) return;
      const z = hz[bi];
      const sx = (z.x - cam.x) * cam.zoom + vw / 2;
      const sy = (z.y - cam.y) * cam.zoom + vh / 2;
      if (sx > 70 && sx < vw - 70 && sy > 70 && sy < vh - 70) return;
      const m = 52,
        ax = ZS.clamp(sx, m, vw - m),
        ay = ZS.clamp(sy, m, vh - m),
        an = Math.atan2(sy - ay, sx - ax);
      c.save();
      c.rotate(0.015); // undo the HUD block's tilt, then its origin:
      c.translate(-20, -24); // draw in screen space
      c.strokeStyle = "rgba(150,50,35,0.7)";
      c.lineWidth = 1.6;
      c.lineCap = "round";
      ZS.wline(
        c,
        ax - Math.cos(an) * 9,
        ay - Math.sin(an) * 9,
        ax + Math.cos(an) * 9,
        ay + Math.sin(an) * 9,
        bi * 13 + 900,
        1,
      );
      ZS.wline(
        c,
        ax + Math.cos(an) * 9,
        ay + Math.sin(an) * 9,
        ax + Math.cos(an + 2.55) * 5.5,
        ay + Math.sin(an + 2.55) * 5.5,
        bi * 13 + 901,
        0.7,
      );
      ZS.wline(
        c,
        ax + Math.cos(an) * 9,
        ay + Math.sin(an) * 9,
        ax + Math.cos(an - 2.55) * 5.5,
        ay + Math.sin(an - 2.55) * 5.5,
        bi * 13 + 902,
        0.7,
      );
      c.fillStyle = "rgba(150,50,35,0.7)";
      c.font = "italic 11px serif";
      c.fillText("!", ax + Math.cos(an) * 15, ay + Math.sin(an) * 15 + 4);
      c.restore();
    }

    draw(c, a, t) {
      // the turret is an emplacement, not a figure
      if (a.wep === "turret") {
        this._drawTurret(c, a, t);
        return;
      }
      let col;
      if (a.st === 2) col = "rgb(72,102,58)";
      else if (a.st === 1) col = ZS.lerpC(C_SURV, C_INF, 0.55 + 0.45 * Math.sin(t * 10 + a.ph));
      else col = ZS.lerpC(C_SURV, C_INF, ZS.clamp(a.inf, 0, 1));

      const s = a.seed;
      const moving = Math.hypot(a.vx, a.vy);
      const sway = Math.sin(t * 3 + s) * 1.6 * (a.st === 2 ? 0.5 : 1);
      const hx = a.x + sway,
        hy = a.y - 15;
      const g = Math.sin(a.gait) * 3.2 * Math.min(1, moving / 25 + 0.3);

      // shadow scribble
      c.strokeStyle = "rgba(40,35,25,0.14)";
      c.lineWidth = 1.2;
      ZS.wcirc(c, a.x, a.y + 6.5, 5.5, s + 3, 1.4);

      // infection aura for zombies
      if (a.st === 2) {
        c.strokeStyle = "rgba(150,40,30," + (0.1 + 0.06 * Math.sin(t * 2 + a.ph)).toFixed(3) + ")";
        c.lineWidth = 1;
        ZS.wcirc(c, a.x, a.y - 4, 17, s + 9, 2.5);
      }

      c.strokeStyle = col;
      c.lineWidth = 1.5;
      c.lineCap = "round";

      // legs
      ZS.wline(c, a.x, a.y - 1, a.x + g + ZS.sjit(s) * 0.5, a.y + 6, s + 11, 1.2);
      ZS.wline(c, a.x, a.y - 1, a.x - g + ZS.sjit(s + 1) * 0.5, a.y + 6, s + 17, 1.2);
      // body
      ZS.wline(c, hx, hy + 4, a.x, a.y - 1, s + 23, 1.1);
      // head
      ZS.wcirc(c, hx, hy, 4.6, s + 29, 0.9);

      // arms
      const shx = hx,
        shy = hy + 6;
      if (a.st === 2) {
        // arms outstretched toward prey
        const reach = 10 + Math.sin(t * 4 + a.ph) * 2;
        ZS.wline(
          c,
          shx,
          shy,
          shx + Math.cos(a.a - 0.5) * reach + sway,
          shy + Math.sin(a.a - 0.5) * reach * 0.4 - 3,
          s + 31,
          1.3,
        );
        ZS.wline(
          c,
          shx,
          shy,
          shx + Math.cos(a.a + 0.5) * reach + sway,
          shy + Math.sin(a.a + 0.5) * reach * 0.4 - 3,
          s + 37,
          1.3,
        );
      } else if (a.gun) {
        // both hands on the weapon, held toward the threat
        const ca = Math.cos(a.a),
          sa = Math.sin(a.a) * 0.4;
        const isSG = a.wep === "shotgun";
        const isFast = a.wep === "smg" || a.wep === "grenade";
        const bl = isSG ? 8 : isFast ? 9 : 11;
        ZS.wline(c, shx, shy, shx + ca * 4, shy + sa * 4 + 1, s + 31, 1.2);
        ZS.wline(
          c,
          shx,
          shy,
          shx + ca * (isSG ? 5.5 : 7),
          shy + sa * (isSG ? 5.5 : 7) + 1,
          s + 37,
          1.2,
        );
        c.lineWidth = isSG ? 1.8 : isFast ? 1.0 : 1.2; // the shotgun is a stout tube
        ZS.wline(c, shx - ca * 3, shy - sa * 3 + 1, shx + ca * bl, shy + sa * bl + 1, s + 65, 0.6);
        ZS.wline(
          c,
          shx - ca * 3,
          shy - sa * 3 + 1,
          shx - ca * 4.5,
          shy - sa * 4.5 + 3,
          s + 66,
          0.5,
        );
        if (isSG)
          ZS.wline(
            c,
            shx + ca * 2,
            shy + sa * 2 + 1,
            shx + ca * 2 - sa * 3.5,
            shy + sa * 2 + 1 + ca * 3.5,
            s + 67,
            0.5,
          ); // the pump
        if (isFast)
          ZS.wline(
            c,
            shx + ca * 2.5,
            shy + sa * 2.5 + 1,
            shx + ca * 4.5,
            shy + sa * 4.5 + 4,
            s + 68,
            0.5,
          ); // the fast gun's foregrip
      } else {
        ZS.wline(c, shx, shy, shx - 3 - g * 0.8, shy + 7, s + 31, 1.2);
        ZS.wline(c, shx, shy, shx + 3 + g * 0.8, shy + 7, s + 37, 1.2);
      }

      // face
      c.lineWidth = 1.1;
      if (a.st === 2) {
        c.fillStyle = "#8c2b1e";
        const ex = Math.cos(a.a),
          ey = Math.sin(a.a) * 0.5;
        c.beginPath();
        c.arc(hx - 1.7 + ex, hy - 0.5 + ey, 1, 0, 6.29);
        c.fill();
        c.beginPath();
        c.arc(hx + 1.7 + ex, hy - 0.5 + ey, 1, 0, 6.29);
        c.fill();
        ZS.wline(c, hx - 1.5, hy + 2, hx + 1.5, hy + 2.5, s + 41, 0.5);
      } else {
        c.fillStyle = col;
        c.beginPath();
        c.arc(hx - 1.6, hy - 0.6, 0.7, 0, 6.29);
        c.fill();
        c.beginPath();
        c.arc(hx + 1.6, hy - 0.6, 0.7, 0, 6.29);
        c.fill();
      }

      // the guard's kit: khaki cap (or a helmet on the SMG guns), coat hem,
      // bandolier — and a flash at the muzzle while firing (the cap keeps
      // them picked out of the crowd)
      if (a.gun) {
        c.lineWidth = 1.1;
        c.fillStyle = "rgba(128,112,76,0.45)";
        c.strokeStyle = col;
        if (a.wep === "smg") {
          // the fast guns wear a helmet: a wider dome instead of the cap
          const hp = [];
          for (let k = 0; k <= 6; k++) {
            const an = (k / 6) * Math.PI;
            hp.push({
              x: hx + Math.cos(an) * 5.6,
              y: hy - 0.8 - Math.sin(an) * 4.8,
            });
          }
          ZS.wpoly(c, hp, s + 61, 0.5, true);
          c.fill();
          c.stroke();
        } else {
          ZS.wpoly(
            c,
            [
              { x: hx - 5.4, y: hy - 4.3 },
              { x: hx - 2, y: hy - 5.1 },
              { x: hx + 2, y: hy - 5.1 },
              { x: hx + 5.4, y: hy - 4.3 },
              { x: hx + 2, y: hy - 3.5 },
              { x: hx - 2, y: hy - 3.5 },
            ],
            s + 61,
            0.5,
            true,
          );
          c.fill();
          c.stroke();
          ZS.wpoly(
            c,
            [
              { x: hx - 2, y: hy - 4.8 },
              { x: hx - 1.7, y: hy - 7.6 },
              { x: hx + 1.7, y: hy - 7.6 },
              { x: hx + 2, y: hy - 4.8 },
            ],
            s + 62,
            0.4,
            true,
          );
          c.fill();
          c.stroke();
        }
        // coat hem + bandolier
        ZS.wline(c, a.x - 2.5, a.y - 2, a.x - 4.6, a.y + 4.5, s + 63, 0.5);
        ZS.wline(c, a.x + 2.5, a.y - 2, a.x + 4.6, a.y + 4.5, s + 64, 0.5);
        ZS.wline(c, hx + 2.6, hy + 3, hx - 2.6, hy + 8, s + 65, 0.4);
        if (a.muzzle > 0) {
          const ca = Math.cos(a.a),
            sa = Math.sin(a.a) * 0.4;
          const n = a.wep === "shotgun" ? 5 : 3;
          const mx = shx + ca * (a.wep === "shotgun" ? 8 : 11),
            my = shy + sa * (a.wep === "shotgun" ? 8 : 11) + 1;
          c.strokeStyle = "rgba(176,110,40," + Math.min(1, a.muzzle / 0.12).toFixed(2) + ")";
          c.lineWidth = 1.3;
          for (let i = 0; i < n; i++) {
            const an = a.a + (i - (n - 1) / 2) * 0.4;
            ZS.wline(
              c,
              mx,
              my,
              mx + Math.cos(an) * (3.5 + i),
              my + Math.sin(an) * 1.8,
              s + 71 + i,
              0.4,
            );
          }
        }
      }

      // panic marks for fleeing survivors
      if (a.st === 0 && moving > 40) {
        c.strokeStyle = "rgba(60,55,45,0.5)";
        ZS.wline(
          c,
          hx + Math.cos(a.a) * 10,
          hy - 3 + ZS.jit(s) * 1.5,
          hx + Math.cos(a.a) * 15,
          hy - 4 + ZS.jit(s + 1) * 1.5,
          s + 47,
          0.7,
        );
        ZS.wline(
          c,
          hx + Math.cos(a.a) * 9,
          hy + 1 + ZS.jit(s + 2) * 1.5,
          hx + Math.cos(a.a) * 14,
          hy + 1 + ZS.jit(s + 3) * 1.5,
          s + 53,
          0.7,
        );
      }

      // transformation flash scribble
      if (a.flash > 0) {
        c.strokeStyle = "rgba(150,40,30," + Math.min(0.8, a.flash).toFixed(2) + ")";
        c.lineWidth = 1.3;
        const r = 8 + (1 - a.flash) * 16;
        for (let i = 0; i < 7; i++) {
          const an = (i / 7) * 6.283 + a.ph;
          ZS.wline(
            c,
            a.x + Math.cos(an) * r * 0.4,
            a.y - 6 + Math.sin(an) * r * 0.4,
            a.x + Math.cos(an) * r,
            a.y - 6 + Math.sin(an) * r,
            s + i * 3,
            0.8,
          );
        }
      }

      // a burning agent: a flickering crown of fire (additive — the figure
      // below is untouched)
      if (a.burn > 0) {
        const k = Math.min(1, a.burn); // fades out in the last second
        const fl = (s + ((t * 12) | 0) * 7) % 997; // ~12fps flicker
        c.lineWidth = 1.4;
        c.strokeStyle = "rgba(176,110,40," + (0.8 * k).toFixed(2) + ")";
        ZS.wline(
          c,
          a.x - 3,
          a.y - 2,
          a.x - 4 + ZS.sjit(fl) * 2,
          a.y - 15 - ZS.jit(fl) * 4,
          fl + 1,
          0.9,
        );
        c.strokeStyle = "rgba(150,40,30," + (0.7 * k).toFixed(2) + ")";
        ZS.wline(
          c,
          a.x + 1,
          a.y - 3,
          a.x + 1 + ZS.sjit(fl + 3) * 2.5,
          a.y - 18 - ZS.jit(fl + 3) * 4,
          fl + 4,
          0.9,
        );
        c.strokeStyle = "rgba(176,110,40," + (0.6 * k).toFixed(2) + ")";
        ZS.wline(
          c,
          a.x + 3.5,
          a.y - 2,
          a.x + 5 + ZS.sjit(fl + 6) * 2,
          a.y - 14 - ZS.jit(fl + 6) * 3,
          fl + 7,
          0.9,
        );
        // the bright core: a short flame in the middle
        c.strokeStyle = "rgba(214,164,74," + (0.8 * k).toFixed(2) + ")";
        c.lineWidth = 1.3;
        ZS.wline(
          c,
          a.x + ZS.sjit(fl + 8) * 1.5,
          a.y - 3,
          a.x + ZS.sjit(fl + 8) * 2.5,
          a.y - 10 - ZS.jit(fl + 8) * 2,
          fl + 8,
          0.7,
        );
        // a smoke wisp
        c.strokeStyle = "rgba(90,85,75," + (0.35 * k).toFixed(2) + ")";
        c.lineWidth = 1;
        ZS.wcirc(c, a.x, a.y - 16 - ZS.jit(fl + 9) * 2, 2.5, fl + 9, 0.8);
      }
    }

    // the emplacement: a hand-drawn sandbag pile, a short post, and a rifle
    // across the top that tracks the threat (broken post when it's down)
    _drawTurret(c, a, t) {
      const s = a.seed;
      // shadow
      c.strokeStyle = "rgba(40,35,25,0.14)";
      c.lineWidth = 1.2;
      // unmanned: the barrel lies across the bags, cold smoke drifting —
      // the gun only lives while the gunner is at it
      const rec = a.tId >= 0 ? this.turrets[a.tId] : null;
      const crew = rec && rec.crew;
      const manned = crew && !crew.dead && crew.st < 2;
      if (!manned && a.hp > TURRET_HP / 3) {
        c.strokeStyle = "rgba(60,50,40,0.7)";
        c.lineWidth = 1.5;
        ZS.wline(c, a.x - 8, a.y - 1, a.x + 8, a.y + 3, s + 7, 0.6);
        c.fillStyle = "rgba(90,85,78,0.16)";
        for (let i = 0; i < 2; i++) {
          const k = (t * 0.16 + i * 0.5 + ZS.hash(s + 15 + i)) % 1;
          c.beginPath();
          c.arc(a.x + ZS.jit(s + 21 + i) * 3 + k * 3, a.y - 4 - k * 14, 2 + k * 3, 0, 7);
          c.fill();
        }
        return;
      }
      ZS.wcirc(c, a.x, a.y + 7, 10, s + 3, 1.2);
      // the sandbag wall: squashed, overlapping bags
      drawBag(c, a.x - 6.5, a.y + 3.5, 5, s + 1);
      drawBag(c, a.x + 6.5, a.y + 3.5, 5, s + 2);
      drawBag(c, a.x - 3, a.y + 6.5, 5.2, s + 4);
      drawBag(c, a.x + 4, a.y + 6.5, 4.8, s + 5);
      if (a.hp <= TURRET_HP / 3) {
        // the broken emplacement: a splayed post, rifle on the ground
        c.strokeStyle = "rgba(60,50,40,0.8)";
        c.lineWidth = 1.8;
        ZS.wline(c, a.x, a.y + 2, a.x - 5, a.y - 9, s + 4, 0.9);
        ZS.wline(c, a.x, a.y + 2, a.x + 9, a.y + 7, s + 5, 0.9);
        ZS.wline(c, a.x - 2, a.y, a.x - 10, a.y - 2, s + 6, 0.7);
        // smoke drifting off the broken post
        c.fillStyle = "rgba(90,85,78,0.12)";
        for (let i = 0; i < 3; i++) {
          const k = (t * 0.23 + i * 0.41 + ZS.hash(s + 13 + i)) % 1;
          c.beginPath();
          c.arc(a.x - 2 + ZS.jit(s + 20 + i) * 3 + k * 4, a.y - 4 - k * 16, 2.5 + k * 3.5, 0, 7);
          c.fill();
        }
        return;
      }
      // the short post and the rifle across the top (the barrel tracks)
      const ca = Math.cos(a.a),
        sa = Math.sin(a.a) * 0.4;
      c.strokeStyle = "rgba(60,50,40,0.85)";
      c.lineWidth = 1.6;
      ZS.wline(c, a.x, a.y + 4, a.x, a.y - 3, s + 6, 0.7);
      c.lineWidth = 1.8;
      ZS.wline(c, a.x - ca * 6, a.y - 3 - sa * 6, a.x + ca * 13, a.y - 3 + sa * 13, s + 7, 0.5);
      // a 3px sight tick ahead of the post
      c.lineWidth = 1.2;
      ZS.wline(c, a.x + ca * 8, a.y - 3 + sa * 8 - 3, a.x + ca * 8, a.y - 3 + sa * 8, s + 8, 0.4);
      // a small ammo crate at the side
      c.lineWidth = 1.1;
      ZS.wline(c, a.x + 10, a.y + 7, a.x + 16, a.y + 5.5, s + 9, 0.7);
      ZS.wline(c, a.x + 16, a.y + 5.5, a.x + 17.5, a.y + 9.5, s + 10, 0.7);
      ZS.wline(c, a.x + 17.5, a.y + 9.5, a.x + 11.5, a.y + 11, s + 11, 0.7);
      if (a.muzzle > 0) {
        const mx = a.x + ca * 13,
          my = a.y - 3 + sa * 13;
        c.strokeStyle = "rgba(176,110,40," + Math.min(1, a.muzzle / 0.1).toFixed(2) + ")";
        c.lineWidth = 1.3;
        for (let i = 0; i < 3; i++) {
          const an = a.a + (i - 1) * 0.4;
          ZS.wline(c, mx, my, mx + Math.cos(an) * 5, my + Math.sin(an) * 2, s + 11 + i, 0.4);
        }
      }
    }

    // transient effects: tracer lines, kill poofs, blood, grenade arcs,
    // booms, and ground fire — small particles only (no core ring): slots,
    // materialize rate, life, spread
    // blood 1 = latch bite (faint) · 2 = rifle hit · 3 = shotgun hit / kill
    drawFX(c, fx) {
      for (const sh of fx) {
        if (sh.blood) {
          const S = [
            null,
            { n: 3, p: 0.1, life: 0.3, R: 8 },
            { n: 5, p: 0.5, life: 0.3, R: 9 },
            { n: 7, p: 0.55, life: 0.45, R: 12 },
          ][sh.blood];
          const k = sh.t / S.life;
          c.fillStyle = "rgba(180,64,52," + (0.6 * k).toFixed(2) + ")";
          for (let i = 0; i < S.n; i++) {
            if (ZS.hash(sh.seed + 200 + i) > S.p) continue;
            const ang = ZS.hash(sh.seed + i) * Math.PI * 2;
            const dist = (1 - k) * S.R * (0.45 + ZS.hash(sh.seed + 40 + i) * 0.55);
            const r = (0.5 + ZS.hash(sh.seed + 80 + i) * 1.1) * (0.5 + k * 0.8);
            c.beginPath();
            c.arc(sh.x + Math.cos(ang) * dist, sh.y + Math.sin(ang) * dist * 0.8, r, 0, 7);
            c.fill();
          }
        } else if (sh.poof) {
          const k = sh.t / 0.3;
          c.strokeStyle = "rgba(120,50,40," + (k * 0.7).toFixed(2) + ")";
          c.lineWidth = 1.2;
          ZS.wcirc(c, sh.x, sh.y - 6, 4 + (1 - k) * 11, sh.seed, 1.6);
        } else if (sh.grn) {
          // the arc: a quadratic lift over the target, a fading trail behind
          const k = 1 - sh.t / 0.9;
          const mx = (sh.x0 + sh.x1) / 2,
            my = Math.min(sh.y0, sh.y1) - 34;
          const bx = (1 - k) * (1 - k) * sh.x0 + 2 * (1 - k) * k * mx + k * k * sh.x1;
          const by = (1 - k) * (1 - k) * sh.y0 + 2 * (1 - k) * k * my + k * k * sh.y1;
          const k2 = Math.max(0, k - 0.25);
          const bx2 = (1 - k2) * (1 - k2) * sh.x0 + 2 * (1 - k2) * k2 * mx + k2 * k2 * sh.x1;
          const by2 = (1 - k2) * (1 - k2) * sh.y0 + 2 * (1 - k2) * k2 * my + k2 * k2 * sh.y1;
          c.strokeStyle = "rgba(61,52,43,0.4)";
          c.lineWidth = 1;
          c.beginPath();
          c.moveTo(bx2, by2);
          c.lineTo(bx, by);
          c.stroke();
          c.strokeStyle = "rgba(61,52,43,0.85)";
          c.lineWidth = 1.3;
          c.beginPath();
          c.arc(bx, by, 2.2, 0, 6.29);
          c.stroke();
        } else if (sh.boom) {
          const k = 1 - sh.t / 0.6;
          const r = 6 + k * 84;
          // the shock ring: 6 to 90px, the ink fading out
          c.strokeStyle = "rgba(61,52,43," + (0.85 * (1 - k)).toFixed(2) + ")";
          c.lineWidth = 2.5 * (1 - k) + 0.5;
          ZS.wcirc(c, sh.x, sh.y, r, sh.seed, 1.6);
          // twelve radial scribbles: 18 to 46px out
          c.lineWidth = 1.4;
          for (let i = 0; i < 12; i++) {
            const an = (i / 12) * 6.283 + ZS.hash(sh.seed + i) * 0.4;
            const r0 = 16 + ZS.hash(sh.seed + i) * 4;
            const r1 = 42 + ZS.hash(sh.seed + 20 + i) * 6;
            ZS.wline(
              c,
              sh.x + Math.cos(an) * r0,
              sh.y + Math.sin(an) * r0,
              sh.x + Math.cos(an) * r1,
              sh.y + Math.sin(an) * r1,
              sh.seed + 40 + i,
              0.7,
            );
          }
          // smoke: ten circles, r 4 to 16, drifting up
          c.fillStyle = "rgba(90,85,75," + (0.35 * (1 - k)).toFixed(2) + ")";
          for (let i = 0; i < 10; i++) {
            const an = ZS.hash(sh.seed + 60 + i) * 6.283;
            const d = ZS.hash(sh.seed + 80 + i) * r * 0.6;
            c.beginPath();
            c.arc(
              sh.x + Math.cos(an) * d,
              sh.y + Math.sin(an) * d - k * 24,
              4 + k * 12 + ZS.hash(sh.seed + i) * 3,
              0,
              6.29,
            );
            c.fill();
          }
        } else if (sh.flash) {
          // the first white of the blast: a brief filled flash
          const k = 1 - sh.t / 0.15;
          c.fillStyle = "rgba(255,250,235," + (0.5 * (1 - k)).toFixed(2) + ")";
          c.beginPath();
          c.arc(sh.x, sh.y, 12 + k * 48, 0, 6.29);
          c.fill();
        } else if (sh.gfire) {
          // a tuft of ground fire: nine fanned flames over a soot base
          const k = Math.min(1, sh.t / 6);
          c.lineWidth = 1.3;
          for (let i = 0; i < 9; i++) {
            const an = -Math.PI / 2 + (i - 4) * 0.34 + ZS.sjit(sh.seed + i) * 0.3;
            const r0 = 10 + ZS.hash(sh.seed + 10 + i) * 4;
            const r1 = r0 + 4 + k * 8 + ZS.hash(sh.seed + 30 + i) * 4;
            c.strokeStyle =
              i % 2
                ? "rgba(150,40,30," + (0.6 * k).toFixed(2) + ")"
                : "rgba(176,110,40," + (0.65 * k).toFixed(2) + ")";
            ZS.wline(
              c,
              sh.x + Math.cos(an) * r0,
              sh.y + Math.sin(an) * r0,
              sh.x + Math.cos(an) * r1,
              sh.y + Math.sin(an) * r1 - 4,
              sh.seed + 50 + i,
              0.9,
            );
          }
          // the bright core flame
          c.strokeStyle = "rgba(214,164,74," + (0.7 * k).toFixed(2) + ")";
          c.lineWidth = 1.4;
          ZS.wline(
            c,
            sh.x + ZS.sjit(sh.seed + 9) * 2,
            sh.y - 2,
            sh.x + ZS.sjit(sh.seed + 9) * 3,
            sh.y - 10 - k * 6,
            sh.seed + 40,
            0.7,
          );
          // the soot base
          c.strokeStyle = "rgba(50,42,34," + (0.25 * k).toFixed(2) + ")";
          c.lineWidth = 1;
          ZS.wcirc(c, sh.x, sh.y, 14, sh.seed + 7, 1.2);
        } else {
          const k = sh.t / 0.07;
          c.strokeStyle = "rgba(55,45,32," + (k * 0.75).toFixed(2) + ")";
          c.lineWidth = 1;
          c.beginPath();
          c.moveTo(sh.x0, sh.y0);
          c.lineTo(sh.x1, sh.y1);
          c.stroke();
        }
      }
    }
  }

  ZS.ScenarioZombie = ScenarioZombie;
})();
