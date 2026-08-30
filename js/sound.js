/* Sound: sketch-style WebAudio synth, no assets (file:// safe). The
   scenario fires events via ZS.sound.event(name, x, y) — the engine
   spatializes them against the camera, rate-limits per type, and stays
   silent until the first user gesture unlocks audio (autoplay policy).
   main.js wires unlock() to pointerdown and tick(dt) into the loop. */
(() => {
  "use strict";
  const ZS = (window.ZS = window.ZS || {});

  let ac = null,
    master = null,
    nbuf = null;
  let voices = 0; // live source nodes (cap: keep the mix breathable)
  let curPan = 0; // scene position -> stereo pan (set by event/tick)
  // per-type cooldowns (seconds): a firefight is loud, not a blender
  const CD = {
    shot_rifle: 0.07,
    shot_shotgun: 0.09,
    shot_smg: 0.05,
    shot_gren: 0.4,
    boom: 0.25,
    moan: 0.5,
    door_break: 0.6,
    fire: 0.2,
    turret: 0.3,
    horn: 4,
    // Sanguo battle kit — swords, arrows, hooves, drums, signals (§4.4)
    sword_clash: 0.09,
    arrow_fly: 0.06,
    cav_charge: 0.45,
    drum_roll: 0.3,
    drum_hit: 0.12,
    retreat_horn: 1.6,
    formation_shift: 0.35,
    order_ack: 0.18,
    order_fail: 0.22,
    duel_intro: 0.5,
    crossbow_thrum: 0.14,
    banner_wave: 0.8,
    blade_sheath: 0.25,
    // the formant voice lines
    v_shout: 0.35,
    v_gasp: 0.3,
    v_mumble: 0.4,
    v_laugh: 0.6,
    v_grunt: 0.4,
    v_callout: 0.4,
    v_groan: 0.45,
    v_growl: 0.5,
    v_chomp: 0.35,
    v_mama: 0.7,
    v_spit: 0.5,
    v_zedshout: 0.8,
  };
  const last = {};
  let crackleT = 0;

  function unlock() {
    if (!ac) {
      try {
        const A = window.AudioContext || window.webkitAudioContext;
        ac = new A();
        master = ac.createGain();
        master.gain.value = 0.5;
        master.connect(ac.destination);
      } catch {
        ac = null;
        return;
      }
    }
    if (ac.state === "suspended") ac.resume();
  }

  // 2s of reusable white noise (the boom tail needs it)
  function noise() {
    if (!nbuf) {
      const len = (ac.sampleRate * 2) | 0;
      nbuf = ac.createBuffer(1, len, ac.sampleRate);
      const d = nbuf.getChannelData(0);
      for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    }
    return nbuf;
  }

  // one short voice: {o osc|n noise, f, f2 glide, type, cut, bt filter,
  // t dur, g gain, a attack, q}
  function voice(v) {
    if (!ac || ac.state !== "running" || voices >= 28) return;
    voices++;
    const t0 = ac.currentTime;
    const g = ac.createGain();
    let src;
    if (v.n) {
      src = ac.createBufferSource();
      src.buffer = noise();
    } else {
      src = ac.createOscillator();
      src.type = v.type || "sine";
      src.frequency.setValueAtTime(v.f || 200, t0);
      if (v.f2) src.frequency.exponentialRampToValueAtTime(Math.max(20, v.f2), t0 + (v.t || 0.2));
    }
    let node = src;
    if (v.cut) {
      const f = ac.createBiquadFilter();
      f.type = v.bt || "lowpass";
      f.frequency.value = v.cut;
      f.Q.value = v.q || 0.9;
      node.connect(f);
      if (v.cut2) f.frequency.exponentialRampToValueAtTime(Math.max(30, v.cut2), t0 + (v.t || 0.2));
      node = f;
    }
    node.connect(g);
    if (typeof ac.createStereoPanner === "function") {
      const pan = ac.createStereoPanner();
      pan.pan.value = Math.max(-1, Math.min(1, curPan));
      g.connect(pan);
      pan.connect(master);
    } else g.connect(master);
    const vol = Math.max(0.004, v.g || 0.2);
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(vol, t0 + (v.a || 0.005));
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + (v.t || 0.2));
    src.onended = () => {
      voices--;
      g.disconnect();
    };
    src.start(t0);
    src.stop(t0 + (v.t || 0.2) + 0.06);
  }

  // scene position -> (volume, pan) for the camera
  function sp(x, y, base, range) {
    const c = ZS.debug && ZS.debug.cam;
    if (!c) return { v: 0.4 * base, p: 0 };
    const dx = x - c.x,
      dy = y - c.y,
      d = Math.hypot(dx, dy);
    const v = base * Math.max(0, 1 - d / (range || 700));
    return { v, p: Math.max(-0.75, Math.min(0.75, dx / 900)) };
  }

  // ---- formant voice engine (the lines picked from .verify/voices.html,
  //      ported 1:1) — moving F1/F2/F3 bandpasses over a detuned double-saw
  //      glottis make the non-verbal "talk": survivors bright and fast,
  //      zombies darkened and slow.
  const R = (a, b) => a + Math.random() * (b - a);
  const RI = (a, b) => Math.floor(R(a, b + 1));
  const P = (n) => Math.max(n, 0.0001);
  // ---- formant table (F1, F2, F3 in Hz) ----
  const VOW = {
    ee: [270, 2290, 3010],
    eh: [530, 1840, 2480],
    ah: [660, 1720, 2410],
    aah: [730, 1090, 2440],
    oh: [450, 800, 2400],
    uh: [640, 1190, 2390],
    oo: [300, 870, 2240],
    er: [490, 1370, 1690],
  };
  // darkened (zombie) variants: F2 pulled down, everything ~0.8x
  const ZVOW = {
    aah: [620, 830, 1850],
    ah: [560, 1250, 1750],
    uh: [520, 880, 1500],
    oh: [390, 560, 1500],
    ee: [240, 1500, 2100],
  };
  let vmix = null; // voice bus into the shared room (built lazily)
  let vlive = 0; // live phrases (a few at most: the mix stays breathable)

  // the voice room: a 38 ms feedbacked delay, lowpassed — a paper hallway
  function vroom() {
    if (vmix) return vmix;
    vmix = ac.createGain();
    const dry = ac.createGain();
    dry.gain.value = 0.85;
    vmix.connect(dry).connect(master);
    const delay = ac.createDelay(0.2);
    delay.delayTime.value = 0.038;
    const dlp = ac.createBiquadFilter();
    dlp.type = "lowpass";
    dlp.frequency.value = 2400;
    const wet = ac.createGain();
    wet.gain.value = 0.3;
    const fb = ac.createGain();
    fb.gain.value = 0.34;
    vmix.connect(delay);
    delay.connect(dlp);
    dlp.connect(wet).connect(master);
    dlp.connect(fb).connect(delay);
    return vmix;
  }

  // one voiced syllable: double-saw glottis -> 3 moving bandpasses
  function vsyl(o, out) {
    const c = ac;
    const t0 = c.currentTime + (o.t0 || 0);
    const dur = o.dur;
    const bus = c.createGain(); // per-syllable sum: glottis + breath
    const g = c.createGain(); // syllable envelope
    const env = g.gain;
    const peak = P(o.v || 0.4);
    env.setValueAtTime(0, t0);
    env.linearRampToValueAtTime(peak, t0 + R(0.015, 0.03));
    if (o.dip) {
      // a glottal stop mid-vowel
      const dt = t0 + dur * R(0.4, 0.6);
      env.setValueAtTime(peak, dt);
      env.linearRampToValueAtTime(peak * 0.15, dt + 0.03);
      env.linearRampToValueAtTime(peak * 0.8, dt + 0.07);
    }
    if (o.n) {
      // unvoiced body: filtered noise under the voice
      const src = c.createBufferSource();
      src.buffer = noise();
      src.playbackRate.value = R(0.5, 0.7);
      const f = c.createBiquadFilter();
      f.type = "lowpass";
      f.frequency.value = o.nf || 500;
      const ng = c.createGain();
      const npeak = P(o.n);
      ng.gain.setValueAtTime(0, t0);
      ng.gain.linearRampToValueAtTime(npeak, t0 + 0.05);
      ng.gain.exponentialRampToValueAtTime(0.0001, t0 + dur + 0.05);
      src.connect(f).connect(ng).connect(bus);
      src.start(t0);
      src.stop(t0 + dur + 0.1);
    }
    bus.connect(g).connect(out);
    // the glottis: two detuned saws (a real pulse is closer to one,
    // the pair gives the voice its body)
    const f0a = o.f0a,
      f0b = o.f0b || f0a * 0.95;
    for (let k = 0; k < 2; k++) {
      const osc = c.createOscillator();
      osc.type = "sawtooth";
      osc.frequency.setValueAtTime(P(f0a), t0);
      if (o.curve === "lin") osc.frequency.linearRampToValueAtTime(P(f0b), t0 + dur);
      else osc.frequency.exponentialRampToValueAtTime(P(f0b), t0 + dur);
      osc.detune.value = k === 0 ? R(-3, -1) : R(1, 3.5);
      // slow pitch wobble: tired/panicked voices never sit still
      const lfo = c.createOscillator();
      lfo.frequency.value = R(3.5, 7);
      const lg = c.createGain();
      lg.gain.value = f0a * (o.wob === 0 ? 0 : R(0.006, 0.02));
      lfo.connect(lg).connect(osc.frequency);
      lfo.start(t0);
      lfo.stop(t0 + dur + 0.1);
      osc.start(t0);
      osc.stop(t0 + dur + 0.05);
      // each saw feeds the formant chain
      const ff = o.F;
      const ft = o.Ft || ff;
      const fs = [8, 10, 12]; // resonator Qs
      for (let i = 0; i < 3; i++) {
        const bp = c.createBiquadFilter();
        bp.type = "bandpass";
        bp.frequency.value = P(ff[i]);
        bp.Q.value = fs[i] * R(0.85, 1.2);
        bp.frequency.exponentialRampToValueAtTime(P(ft[i]), t0 + dur * (o.slow ? 0.95 : 0.65));
        const fbg = c.createGain();
        fbg.gain.value = [1.0, 0.55, 0.3][i] * R(0.8, 1.15);
        osc.connect(bp).connect(fbg).connect(bus);
      }
    }
    if (o.n) {
      // breath: lowpassed noise under the vowels
      const src = c.createBufferSource();
      src.buffer = noise();
      src.playbackRate.value = R(0.5, 0.7);
      const f = c.createBiquadFilter();
      f.type = "lowpass";
      f.frequency.value = o.nf || 500;
      const ng = c.createGain();
      ng.gain.value = P(o.n);
      ng.gain.setValueAtTime(0, t0);
      ng.gain.linearRampToValueAtTime(ng.gain.value, t0 + 0.05);
      ng.gain.exponentialRampToValueAtTime(0.0001, t0 + dur + 0.05);
      src.connect(f).connect(ng).connect(bus);
      src.start(t0);
      src.stop(t0 + dur + 0.1);
    }
  }

  // one unvoiced puff: noise through a resonator — the consonants
  function vpuff(o, out) {
    const c = ac;
    const t0 = c.currentTime + (o.t0 || 0);
    const src = c.createBufferSource();
    src.buffer = noise();
    src.playbackRate.value = o.rate || R(0.8, 1.2);
    const f = c.createBiquadFilter();
    f.type = o.type || "bandpass";
    f.frequency.value = P(o.f);
    if (o.f2) f.frequency.exponentialRampToValueAtTime(P(o.f2), t0 + o.dur);
    f.Q.value = o.q || 1.5;
    const g = c.createGain();
    const peak = P(o.g);
    g.gain.setValueAtTime(0, t0);
    g.gain.linearRampToValueAtTime(peak, t0 + R(0.008, 0.02));
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + o.dur);
    src.connect(f).connect(g).connect(out);
    src.start(t0);
    src.stop(t0 + o.dur + 0.05);
  }

  // a low thud (the chest in a grunt, the body in a chomp)
  function vthud(o, out) {
    const c = ac;
    const t0 = c.currentTime + (o.t0 || 0);
    const osc = c.createOscillator();
    osc.type = "sine";
    osc.frequency.setValueAtTime(P(o.f || 60), t0);
    osc.frequency.exponentialRampToValueAtTime(P((o.f || 60) * 0.45), t0 + o.dur);
    const g = c.createGain();
    const peak = P(o.g);
    g.gain.setValueAtTime(0, t0);
    g.gain.linearRampToValueAtTime(peak, t0 + 0.012);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + o.dur);
    osc.connect(g).connect(out);
    osc.start(t0);
    osc.stop(t0 + o.dur + 0.05);
  }

  // the consonant kit
  const VC = {
    h: (t0, g = 0.25, out) =>
      vpuff({ t0, type: "lowpass", f: R(1200, 1800), dur: R(0.04, 0.07), g }, out),
    m: (t0, g = 0.3, out) => {
      // nasal: a low tone + a muffled puff
      vpuff({ t0, type: "lowpass", f: R(300, 450), dur: R(0.06, 0.1), g: g * 0.6 }, out);
      vthud({ t0, f: R(210, 260), dur: R(0.06, 0.1), g: g * 0.5 }, out);
    },
    p: (t0, g = 0.3, out) =>
      vpuff({ t0, type: "lowpass", f: R(700, 1000), dur: R(0.02, 0.04), g }, out),
    s: (t0, g = 0.18, out) => vpuff({ t0, f: R(6000, 8000), q: 1.2, dur: R(0.05, 0.09), g }, out),
    t: (t0, g = 0.2, out) => vpuff({ t0, f: R(3000, 5000), q: 3, dur: R(0.015, 0.03), g }, out),
    b: (t0, g = 0.28, out) =>
      vpuff({ t0, type: "lowpass", f: R(500, 800), dur: R(0.02, 0.04), g }, out),
  };

  /* the lines — each builds a phrase into the shared out node.
     t0 values are offsets from now; gaps carry the rhythm. */
  const VL = {
    // survivors — bright, fast, nervous
    mumble(out) {
      const f0 = R(160, 200);
      let t = 0;
      VC.m(t, 0.35, out);
      const picks = [
        ["uh", VOW.uh],
        ["ah", VOW.ah],
        ["er", VOW.er],
      ];
      const n = RI(2, 3);
      for (let i = 0; i < n; i++) {
        t += R(0.05, 0.08);
        const F = picks[RI(0, picks.length - 1)][1];
        vsyl(
          {
            t0: t,
            dur: R(0.08, 0.13),
            f0a: f0 * R(0.95, 1.05),
            f0b: f0 * R(0.85, 1.0),
            F,
            Ft: VOW.uh,
            v: 0.32,
            n: 0.1,
            nf: 700,
          },
          out,
        );
        if (i < n - 1) {
          t += R(0.09, 0.14);
          if (Math.random() < 0.6) VC.t(t, 0.12, out);
        }
      }
    },
    shout(out) {
      const f0 = R(300, 380);
      // the scream: F0 rockets, formants sweep aah -> ee
      VC.h(R(0, 0.02), 0.3, out);
      vsyl(
        {
          t0: 0,
          dur: R(0.35, 0.5),
          f0a: f0,
          f0b: f0 * R(2.2, 2.8),
          F: VOW.aah,
          Ft: VOW.ee,
          v: 0.8,
          n: 0.22,
          nf: 900,
        },
        out,
      );
      if (Math.random() < 0.6) {
        // the falloff "aa"
        vsyl(
          {
            t0: R(0.4, 0.5),
            dur: 0.18,
            f0a: f0 * R(1.6, 2.0),
            f0b: f0 * R(0.9, 1.1),
            F: VOW.ah,
            Ft: VOW.uh,
            v: 0.4,
            n: 0.15,
          },
          out,
        );
      }
    },
    gasp(out) {
      // unvoiced inhale-then-out: formant-shaped noise, no glottis
      vpuff(
        {
          t0: 0,
          type: "lowpass",
          f: R(1600, 2400),
          f2: 600,
          dur: R(0.12, 0.18),
          g: 0.5,
        },
        out,
      );
      vsyl(
        {
          t0: 0.02,
          dur: R(0.1, 0.15),
          f0a: R(150, 190),
          f0b: R(120, 150),
          F: VOW.oh,
          Ft: VOW.eh,
          v: 0.2,
          curve: "lin",
        },
        out,
      );
    },
    laugh(out) {
      const f0 = R(230, 290);
      const n = RI(3, 5);
      for (let i = 0; i < n; i++) {
        const t = i * R(0.09, 0.13);
        const g = Math.max(0.5 - i * 0.07, 0.15);
        VC.h(t, 0.16 * g, out);
        vsyl(
          {
            t0: t + 0.015,
            dur: R(0.06, 0.09),
            f0a: f0 * Math.pow(0.96, i) * R(0.95, 1.05),
            f0b: f0 * 0.85 * Math.pow(0.96, i),
            F: VOW.eh,
            Ft: VOW.ah,
            v: 0.4 * g,
          },
          out,
        );
      }
    },
    grunt(out) {
      const f0 = R(100, 130);
      VC.h(R(0, 0.01), 0.2, out);
      vsyl(
        {
          t0: 0.02,
          dur: R(0.16, 0.26),
          f0a: f0,
          f0b: f0 * 0.7,
          F: VOW.aah,
          Ft: VOW.uh,
          v: 0.6,
          n: 0.25,
          nf: 350,
          curve: "lin",
        },
        out,
      );
      vthud({ t0: 0.02, f: R(70, 90), dur: 0.14, g: 0.3 }, out);
    },
    callout(out) {
      const f0 = R(280, 340);
      // "yoo": start on the ee formant (the "y") and drop to oo
      vsyl(
        {
          t0: 0,
          dur: R(0.2, 0.3),
          f0a: f0,
          f0b: f0 * R(1.3, 1.6),
          F: VOW.ee,
          Ft: VOW.oo,
          v: 0.55,
        },
        out,
      );
      if (Math.random() < 0.5)
        vsyl(
          {
            t0: R(0.24, 0.3),
            dur: 0.14,
            f0a: f0 * 1.3,
            f0b: f0 * 0.9,
            F: VOW.uh,
            Ft: VOW.ah,
            v: 0.3,
          },
          out,
        );
    },

    // zombies — dark, slow, wet
    groan(out) {
      const f0 = R(80, 105);
      // one long, slow syllable; formants drift over the whole line
      vsyl(
        {
          t0: 0,
          dur: R(0.9, 1.4),
          f0a: f0,
          f0b: f0 * R(0.7, 0.85),
          F: ZVOW.aah,
          Ft: [ZVOW.aah[0] + R(40, 120), ZVOW.aah[1] - R(30, 90), ZVOW.aah[2] - R(0, 150)],
          v: 0.6,
          n: 0.3,
          nf: 420,
          slow: true,
          dip: Math.random() < 0.5,
          curve: "lin",
        },
        out,
      );
      if (Math.random() < 0.4)
        vpuff({ t0: R(0.5, 0.8), f: R(1400, 2000), q: 4, dur: 0.03, g: 0.1 }, out);
    },
    growl(out) {
      const f0 = R(55, 72);
      vsyl(
        {
          t0: 0,
          dur: R(0.4, 0.7),
          f0a: f0,
          f0b: f0 * R(0.8, 1.15),
          F: [300, 560, 1300],
          Ft: [320, 520, 1200],
          v: 0.75,
          n: 0.35,
          nf: 220,
          slow: true,
          curve: "lin",
          wob: 0.02,
        },
        out,
      );
      // a low rumble underneath
      vpuff({ t0: 0, type: "lowpass", f: R(120, 180), dur: 0.4, g: 0.3 }, out);
    },
    chomp(out) {
      const n = RI(2, 3);
      for (let i = 0; i < n; i++) {
        const t = i * R(0.18, 0.3);
        // the wet part: noise with a fast pitch sweep, lowpassed
        vpuff(
          {
            t0: t,
            type: "lowpass",
            f: R(500, 800),
            f2: R(1200, 1800),
            dur: R(0.07, 0.11),
            g: 0.5,
            rate: R(0.4, 0.7),
          },
          out,
        );
        vthud({ t0: t + 0.01, f: R(55, 70), dur: 0.09, g: 0.4 }, out);
        // a quiet high "squish"
        vpuff({ t0: t + 0.02, f: R(2200, 3000), q: 5, dur: 0.03, g: 0.08 }, out);
      }
    },
    mama(out) {
      const f0 = R(95, 120);
      const t2 = R(0.55, 0.75);
      VC.m(0, 0.4, out);
      vsyl(
        {
          t0: 0.06,
          dur: R(0.35, 0.45),
          f0a: f0,
          f0b: f0 * R(0.9, 1.15),
          F: ZVOW.aah,
          Ft: ZVOW.ah,
          v: 0.55,
          n: 0.28,
          nf: 400,
          slow: true,
          curve: "lin",
        },
        out,
      );
      VC.m(t2, 0.35, out);
      vsyl(
        {
          t0: t2 + 0.06,
          dur: R(0.35, 0.5),
          f0a: f0 * R(0.85, 1.0),
          f0b: f0 * R(0.65, 0.8),
          F: ZVOW.ah,
          Ft: ZVOW.uh,
          v: 0.45,
          n: 0.3,
          nf: 380,
          slow: true,
          curve: "lin",
        },
        out,
      );
    },
    spit(out) {
      const n = RI(1, 2);
      for (let i = 0; i < n; i++) {
        const t = i * R(0.2, 0.35);
        vpuff({ t0: t, f: R(1500, 2400), q: 9, dur: R(0.025, 0.04), g: 0.4 }, out);
        vthud({ t0: t + 0.02, f: R(60, 80), dur: 0.05, g: 0.25 }, out);
      }
    },
    zedshout(out) {
      // the human scream, darkened: slow F0 creep, pulled-down F2
      VC.h(0, 0.2, out);
      vsyl(
        {
          t0: 0.01,
          dur: R(0.5, 0.7),
          f0a: R(95, 120),
          f0b: R(160, 200),
          F: ZVOW.aah,
          Ft: ZVOW.ee,
          v: 0.75,
          n: 0.3,
          nf: 500,
          slow: true,
          curve: "lin",
        },
        out,
      );
      vpuff({ t0: R(0.4, 0.6), f: R(1200, 1800), q: 6, dur: 0.04, g: 0.15 }, out);
    },
  };

  // schedule one line into the mix, spatialized like any event
  function vline(name, B) {
    if (vlive >= 5) return;
    vlive++;
    setTimeout(() => {
      vlive--;
    }, 1700);
    vroom();
    const pk = ac.createGain();
    pk.gain.value = P(B);
    if (typeof ac.createStereoPanner === "function") {
      const pan = ac.createStereoPanner();
      pan.pan.value = Math.max(-1, Math.min(1, curPan));
      pk.connect(pan).connect(vroom());
    } else pk.connect(vroom());
    VL[name](pk);
  }

  // the explosion as a phrase: a soft-clipped shock crack, a falling
  // bandpass body, a saw sub, a resonant rumble tail, debris puffs and a
  // distant echo — a blip reads as a blip
  function vboom(B) {
    if (vlive >= 5) return;
    vlive++;
    setTimeout(() => {
      vlive--;
    }, 2600);
    const c = ac;
    const t0 = c.currentTime;
    const bb = Math.max(B, 0.45); // a boom is felt even across the map
    const out = vboomOut(bb);
    const shaper = c.createWaveShaper();
    const curve = new Float32Array(1024);
    for (let i = 0; i < 1024; i++) curve[i] = Math.tanh((i / 511.5 - 1) * 3.2);
    shaper.curve = curve;
    shaper.connect(out);
    // 1) the crack: a broadband burst, hard-attacked, soft-clipped
    {
      const src = c.createBufferSource();
      src.buffer = noise();
      src.playbackRate.value = R(0.95, 1.15);
      const f = c.createBiquadFilter();
      f.type = "highpass";
      f.frequency.value = R(650, 1100);
      const g = c.createGain();
      g.gain.setValueAtTime(0.0001, t0);
      g.gain.exponentialRampToValueAtTime(1.9, t0 + 0.004);
      g.gain.exponentialRampToValueAtTime(0.0001, t0 + R(0.07, 0.11));
      src.connect(f).connect(g).connect(shaper);
      src.start(t0);
      src.stop(t0 + 0.13);
    }
    // 2) the body: a falling bandpass — the blast rolling past
    {
      const src = c.createBufferSource();
      src.buffer = noise();
      src.loop = true;
      src.playbackRate.value = R(0.55, 0.75);
      const f = c.createBiquadFilter();
      f.type = "bandpass";
      f.Q.value = 0.9;
      f.frequency.setValueAtTime(R(1100, 1600), t0);
      f.frequency.exponentialRampToValueAtTime(360, t0 + R(0.22, 0.3));
      const g = c.createGain();
      g.gain.setValueAtTime(0.0001, t0);
      g.gain.exponentialRampToValueAtTime(1.1, t0 + 0.006);
      g.gain.exponentialRampToValueAtTime(0.0001, t0 + R(0.28, 0.4));
      src.connect(f).connect(g).connect(shaper);
      src.start(t0);
      src.stop(t0 + 0.45);
    }
    // 3) the sub: two detuned saws through a closing lowpass — the thump
    {
      const o1 = c.createOscillator();
      o1.type = "sawtooth";
      o1.frequency.setValueAtTime(R(80, 95), t0);
      o1.frequency.exponentialRampToValueAtTime(27, t0 + R(0.4, 0.55));
      const o2 = c.createOscillator();
      o2.type = "sawtooth";
      o2.frequency.setValueAtTime(R(38, 48), t0);
      o2.frequency.exponentialRampToValueAtTime(14, t0 + R(0.4, 0.55));
      const f = c.createBiquadFilter();
      f.type = "lowpass";
      f.frequency.setValueAtTime(300, t0);
      f.frequency.exponentialRampToValueAtTime(90, t0 + 0.5);
      const g = c.createGain();
      g.gain.setValueAtTime(0.0001, t0);
      g.gain.exponentialRampToValueAtTime(1.2, t0 + 0.008);
      g.gain.exponentialRampToValueAtTime(0.0001, t0 + R(0.5, 0.65));
      o1.connect(f);
      o2.connect(f);
      f.connect(g).connect(shaper);
      o1.start(t0);
      o2.start(t0);
      o1.stop(t0 + 0.7);
      o2.stop(t0 + 0.7);
    }
    // 4) the tail: a long low rumble — a resonant drone over a noise
    //    floor, because filtered noise alone just goes quiet
    {
      const src = c.createBufferSource();
      src.buffer = noise();
      src.loop = true;
      src.playbackRate.value = R(0.3, 0.42);
      const f = c.createBiquadFilter();
      f.type = "lowpass";
      f.Q.value = 0.7;
      f.frequency.setValueAtTime(R(420, 560), t0);
      f.frequency.exponentialRampToValueAtTime(70, t0 + 1.3);
      const g = c.createGain();
      g.gain.setValueAtTime(0.0001, t0);
      g.gain.exponentialRampToValueAtTime(1.1, t0 + 0.03);
      g.gain.exponentialRampToValueAtTime(0.45, t0 + 0.45);
      g.gain.exponentialRampToValueAtTime(0.0001, t0 + R(1.6, 2.0));
      src.connect(f).connect(g).connect(out);
      src.start(t0);
      src.stop(t0 + 2.1);
    }
    {
      // the drone: a detuned low saw through a resonant bandpass —
      // the woody "building settling" rumble
      const o1 = c.createOscillator();
      o1.type = "sawtooth";
      o1.frequency.setValueAtTime(R(34, 44), t0 + 0.05);
      o1.frequency.exponentialRampToValueAtTime(R(22, 27), t0 + 1.9);
      const o2 = c.createOscillator();
      o2.type = "sawtooth";
      o2.frequency.setValueAtTime(R(47, 60), t0 + 0.05);
      o2.frequency.exponentialRampToValueAtTime(R(30, 36), t0 + 1.9);
      const f = c.createBiquadFilter();
      f.type = "bandpass";
      f.Q.value = 2.2;
      f.frequency.setValueAtTime(R(140, 180), t0 + 0.05);
      f.frequency.exponentialRampToValueAtTime(70, t0 + 1.9);
      const g = c.createGain();
      g.gain.setValueAtTime(0.0001, t0 + 0.05);
      g.gain.exponentialRampToValueAtTime(0.7, t0 + 0.12);
      g.gain.exponentialRampToValueAtTime(0.25, t0 + 0.6);
      g.gain.exponentialRampToValueAtTime(0.0001, t0 + R(1.9, 2.4));
      o1.connect(f);
      o2.connect(f);
      f.connect(g).connect(out);
      o1.start(t0 + 0.05);
      o2.start(t0 + 0.05);
      o1.stop(t0 + 2.5);
      o2.stop(t0 + 2.5);
    }
    // 5) debris: scattered high puffs as the dust settles
    vpuff({ t0: R(0.14, 0.3), f: R(1800, 3200), q: 2, dur: R(0.04, 0.08), g: 0.16 }, out);
    vpuff({ t0: R(0.4, 0.7), f: R(900, 1600), q: 1.4, dur: R(0.05, 0.1), g: 0.1 }, out);
    // 6) the distant echo: the blast reflecting off the far side
    {
      const at = t0 + R(0.16, 0.3);
      const o = c.createOscillator();
      o.type = "sine";
      o.frequency.setValueAtTime(R(48, 60), at);
      o.frequency.exponentialRampToValueAtTime(24, at + 0.5);
      const f = c.createBiquadFilter();
      f.type = "lowpass";
      f.frequency.value = 260;
      const g = c.createGain();
      g.gain.setValueAtTime(0.0001, at);
      g.gain.exponentialRampToValueAtTime(0.4, at + 0.02);
      g.gain.exponentialRampToValueAtTime(0.0001, at + 0.55);
      o.connect(f).connect(g).connect(out);
      o.start(at);
      o.stop(at + 0.6);
    }
  }
  function vboomOut(bb) {
    vroom();
    const pk = ac.createGain();
    pk.gain.value = P(bb);
    if (typeof ac.createStereoPanner === "function") {
      const pan = ac.createStereoPanner();
      pan.pan.value = Math.max(-1, Math.min(1, curPan));
      pk.connect(pan).connect(vroom());
    } else pk.connect(vroom());
    return pk;
  }

  function event(name, x, y) {
    if (!ac || ac.state !== "running") return;
    const now = performance.now() / 1000;
    if (last[name] && now < last[name]) return;
    last[name] = now + (CD[name] || 0.15);
    const s = sp(x, y, 1);
    curPan = s.p;
    if (s.v < 0.03 && name !== "boom" && name !== "horn") return;
    const B = Math.min(1.3, s.v) * 0.9;
    switch (name) {
      case "shot_rifle":
        voice({ n: 1, cut: 2400, bt: "highpass", t: 0.09, g: 0.5 * B });
        voice({ f: 150, f2: 55, t: 0.09, g: 0.4 * B });
        break;
      case "shot_shotgun":
        voice({ n: 1, cut: 700, t: 0.2, g: 0.85 * B });
        voice({ f: 95, f2: 35, t: 0.22, g: 0.6 * B });
        break;
      case "shot_smg":
        voice({ n: 1, cut: 1500, bt: "highpass", t: 0.045, g: 0.35 * B });
        voice({ f: 170, f2: 90, t: 0.04, g: 0.2 * B });
        break;
      case "shot_gren": // the whoosh of the throw
        voice({ n: 1, cut: 500, t: 0.4, g: 0.14 * B });
        voice({ f: 300, f2: 620, t: 0.35, g: 0.05 * B });
        break;
      case "boom":
        vboom(B);
        break;
      case "moan": {
        // the horde's ambient mutter: a random dark line
        const r = Math.random();
        vline(
          r < 0.42
            ? "groan"
            : r < 0.62
              ? "growl"
              : r < 0.74
                ? "mama"
                : r < 0.86
                  ? "spit"
                  : r < 0.94
                    ? "zedshout"
                    : "chomp",
          B,
        );
        break;
      }
      case "v_shout":
        vline("shout", B);
        break;
      case "v_gasp":
        vline("gasp", B);
        break;
      case "v_mumble":
        vline("mumble", B);
        break;
      case "v_laugh":
        vline("laugh", B);
        break;
      case "v_grunt":
        vline("grunt", B);
        break;
      case "v_callout":
        vline("callout", B);
        break;
      case "v_groan":
        vline("groan", B);
        break;
      case "v_growl":
        vline("growl", B);
        break;
      case "v_chomp":
        vline("chomp", B);
        break;
      case "v_mama":
        vline("mama", B);
        break;
      case "v_spit":
        vline("spit", B);
        break;
      case "v_zedshout":
        vline("zedshout", B);
        break;
      case "door_break":
        voice({ f: 95, f2: 40, type: "triangle", t: 0.14, g: 0.5 * B });
        voice({ n: 1, cut: 320, t: 0.18, g: 0.4 * B });
        break;
      case "fire":
        voice({ n: 1, cut: 2200, bt: "highpass", t: 0.07, g: 0.16 * B });
        break;
      case "turret": // heavier than a rifle: a low thunk with a double kick
        voice({ n: 1, cut: 900, t: 0.12, g: 0.7 * B });
        voice({ f: 110, f2: 40, t: 0.13, g: 0.6 * B });
        break;
      case "horn": {
        // the bugle as a new night comes up — felt across the map
        const hb = Math.max(B, 0.5);
        voice({ f: 330, f2: 520, type: "sawtooth", cut: 1100, q: 1.8, t: 0.9, g: 0.4 * hb });
        voice({ f: 165, f2: 110, t: 0.9, g: 0.3 * hb });
        break;
      }
      // ---------- Sanguo battle kit ----------
      case "sword_clash": {
        // two ringing tones at inharmonic ratios + a noise strike —
        // the felt sense is "metal on metal", not a single note
        const f1 = 620 + Math.random() * 380;
        voice({ f: f1, f2: f1 * 0.6, t: 0.22, g: 0.4 * B, type: "triangle" });
        voice({ f: f1 * 1.5, t: 0.08, g: 0.25 * B, type: "triangle" });
        voice({ n: 1, cut: 5200, bt: "highpass", t: 0.05, g: 0.3 * B });
        break;
      }
      case "arrow_fly": {
        // a quick twang: a damped plucked-string-ish chirp
        const f = 880 + Math.random() * 320;
        voice({ f, f2: f * 0.42, t: 0.16, g: 0.32 * B, type: "sawtooth", cut: 2400, q: 1.4 });
        voice({ n: 1, cut: 1600, t: 0.04, g: 0.12 * B });
        break;
      }
      case "cav_charge": {
        // hooves: a low rumble with periodic thuds, fading fast
        voice({ f: 80, f2: 55, t: 0.7, g: 0.5 * B, type: "sawtooth", cut: 380 });
        const beats = 5;
        for (let i = 0; i < beats; i++) {
          voice({ f: 55 + Math.random() * 18, t: 0.07, g: 0.35 * B, a: i * 0.09 });
        }
        break;
      }
      case "drum_roll": {
        // a tight roll: 6 hits, ~70ms apart, low tom
        for (let i = 0; i < 6; i++) {
          voice({ f: 95 + (i % 2) * 4, f2: 55, t: 0.06, g: 0.5 * B, a: i * 0.07 });
          voice({ n: 1, cut: 320, t: 0.025, g: 0.18 * B, a: i * 0.07 });
        }
        break;
      }
      case "drum_hit": {
        // a single deep hit, a beat's "one"
        voice({ f: 90, f2: 48, t: 0.25, g: 0.7 * B, type: "sine" });
        voice({ n: 1, cut: 280, t: 0.12, g: 0.4 * B });
        break;
      }
      case "retreat_horn": {
        // falling: a wavering pair of tones, the "撤"
        const rb = Math.max(B, 0.4);
        voice({ f: 480, f2: 320, t: 1.1, g: 0.4 * rb, type: "sawtooth", cut: 1400, q: 1.6 });
        voice({ f: 240, f2: 160, t: 1.0, g: 0.3 * rb });
        break;
      }
      case "formation_shift": {
        // the rustle of ranks moving: a mid noise whoosh
        voice({ n: 1, cut: 1200, bt: "bandpass", q: 1.0, t: 0.5, g: 0.2 * B });
        voice({ f: 220, f2: 180, t: 0.45, g: 0.08 * B, type: "triangle" });
        break;
      }
      case "order_ack": {
        // a soft "click" confirming an order
        voice({ f: 720, t: 0.04, g: 0.3 * B, type: "square" });
        voice({ f: 1200, t: 0.03, g: 0.15 * B, type: "sine" });
        break;
      }
      case "order_fail": {
        // a flat "nope" — descending pair
        voice({ f: 320, f2: 180, t: 0.18, g: 0.32 * B, type: "square" });
        break;
      }
      case "duel_intro": {
        // the slow draw: a low rising tone over a single drum hit
        const db = Math.max(B, 0.45);
        voice({ f: 220, f2: 380, t: 0.7, g: 0.32 * db, type: "sawtooth", cut: 900, q: 1.2 });
        voice({ f: 90, f2: 50, t: 0.3, g: 0.55 * db });
        break;
      }
      case "crossbow_thrum": {
        // the heavy twang + the bolt's gone — a release thump
        voice({ f: 180, f2: 75, t: 0.18, g: 0.45 * B, type: "triangle" });
        voice({ n: 1, cut: 1200, t: 0.05, g: 0.18 * B });
        break;
      }
      case "banner_wave": {
        // the cloth flap: a fast lowpassed noise + a soft high-end puff
        voice({ n: 1, cut: 800, t: 0.18, g: 0.25 * B });
        voice({ f: 1400, f2: 800, t: 0.12, g: 0.1 * B, type: "triangle" });
        break;
      }
      case "blade_sheath": {
        // a short metallic "shing" then a soft thud
        voice({ f: 1800, f2: 800, t: 0.09, g: 0.28 * B, type: "sawtooth", cut: 3200, q: 1.4 });
        voice({ f: 90, t: 0.06, g: 0.2 * B });
        break;
      }
    }
  }

  // ambience: ground fire crackles while patches burn near the camera
  function tick(dt) {
    if (!ac || ac.state !== "running" || !ZS.debug) return;
    const sc = ZS.debug.scenario;
    if (!sc || !sc.fx) return;
    crackleT -= dt;
    if (crackleT > 0) return;
    for (const p of sc.fx) {
      if (!p.gfire) continue;
      const s = sp(p.x, p.y, 0.5, 520);
      if (s.v < 0.04) continue;
      crackleT = 0.16 + Math.random() * 0.3;
      curPan = s.p;
      voice({
        n: 1,
        cut: 1800 + Math.random() * 1600,
        bt: "highpass",
        t: 0.05 + Math.random() * 0.06,
        g: 0.12 * s.v,
      });
      break;
    }
  }

  ZS.sound = {
    event,
    tick,
    unlock,
    /* The music bus shares this AudioContext so the page owns only one audio
       graph. Expose it read-only; it is created synchronously by unlock(). */
    get ctx() {
      return ac;
    },
    get unlocked() {
      return !!ac && ac.state === "running";
    },
  };
})();
