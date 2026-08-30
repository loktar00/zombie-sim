/* ZS.music — procedural music + an optional real menu track.
 *
 * Sanguo needs ambient music in the boil hand. A real instrument recording would
 * sit beside the wobbly-ink strokes the way system kai sits beside brush kai:
 * technically correct, aesthetically wrong. So the default is a procedural
 * guzheng-flavored pentatonic loop, layered (plucked-string voice + bass + soft
 * drums) and tuneable per track.
 *
 * One real track is the explicit ask: a small guzheng piece is generated
 * offline and embedded as a base64 WAV in `js/music/menu-track-data.js`. If the
 * file is present, `play("menu")` plays the real piece once, then loops the
 * procedural menu underneath; otherwise the procedural menu is the only thing
 * you ever hear.
 *
 * Integration: `ZS.App` calls init/play/stop/setVolume around its view
 * transitions; the rest of the page does not need to know music exists. The
 * audio context is borrowed from `ZS.sound` (one context per page; the user
 * gesture that unlocks SFX unlocks music too). If music is asked for before
 * the context exists, it queues until the next pointerdown.
 */
(() => {
  "use strict";
  const ZS = (window.ZS = window.ZS || {});

  /* ---------- voice synthesis ---------- */

  /* Pentatonic C major across 4 octaves. Indexing lets the bar patterns use
     small numbers (0..4) instead of note names everywhere. */
  const PENT = [
    130.81,
    146.83,
    164.81,
    196.0,
    220.0, // C3 D3 E3 G3 A3
    261.63,
    293.66,
    329.63,
    392.0,
    440.0, // C4 D4 E4 G4 A4
    523.25,
    587.33,
    659.25,
    783.99,
    880.0, // C5 D5 E5 G5 A5
    1046.5,
    1174.66,
    1318.51,
    1567.98,
    1760.0, // C6 D6 E6 G6 A6
  ];
  // 0 = low C3. The bar patterns use 0..14 (4 octaves of pentatonic).

  // 12-TET helpers for the few non-pentatonic tones (the gong, the ding)
  function note12(name) {
    // a3 = 220
    const N = {
      A2: 110,
      B2: 123.47,
      C3: 130.81,
      D3: 146.83,
      E3: 164.81,
      F3: 174.61,
      G3: 196.0,
      A3: 220.0,
      B3: 246.94,
      C4: 261.63,
      D4: 293.66,
      E4: 329.63,
      F4: 349.23,
      G4: 392.0,
      A4: 440.0,
      B4: 493.88,
      C5: 523.25,
      D5: 587.33,
      E5: 659.25,
      F5: 698.46,
      G5: 783.99,
      A5: 880.0,
      B5: 987.77,
      C6: 1046.5,
    };
    return N[name];
  }

  let ctx = null;
  let bus = null;
  let ready = false;
  let masterVol = 0.5;
  let pendingPlay = null; // queued by play() before init()

  // the current track
  let track = null; // {name, def, nextBar, nextBeatTime, ended}
  let realBuffer = null; // the optional real menu track, decoded

  /* The real track ships in a separate file (see menu-track-data.js). If that
     file is loaded, ZS.music.realMenu gets a base64 string; we decode it on
     init so the procedural menu and the real piece can crossfade cleanly. */
  function decodeReal() {
    if (!ZS.music.realMenu || !ctx) return Promise.resolve();
    const bin = atob(ZS.music.realMenu);
    const buf = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) buf[i] = bin.charCodeAt(i);
    return ctx
      .decodeAudioData(buf.buffer.slice(0))
      .then((b) => {
        realBuffer = b;
      })
      .catch(() => {
        // bad data; the procedural menu carries on
        realBuffer = null;
      });
  }

  function init() {
    if (ready) return;
    const s = ZS.sound;
    if (!s || !s.ctx) return;
    ctx = s.ctx;
    bus = ctx.createGain();
    bus.gain.value = 0;
    bus.connect(ctx.destination);
    ready = true;
    decodeReal();
    if (pendingPlay) {
      const p = pendingPlay;
      pendingPlay = null;
      play(p);
    }
  }

  function setVolume(v) {
    masterVol = Math.max(0, Math.min(1, v));
  }

  function _applyBus() {
    if (!bus) return;
    const target = (track ? 1 : 0) * masterVol;
    // exponential ramp for a clean fade
    const t = ctx.currentTime;
    bus.gain.cancelScheduledValues(t);
    bus.gain.setValueAtTime(Math.max(0.0001, bus.gain.value), t);
    bus.gain.exponentialRampToValueAtTime(Math.max(0.0001, target), t + 0.6);
  }

  function stop() {
    if (!ready) return;
    track = null;
    _applyBus();
  }

  function play(name) {
    if (!ready) {
      pendingPlay = name;
      return;
    }
    const def = TRACKS[name];
    if (!def) return;
    track = {
      name,
      def,
      bar: 0,
      nextBarTime: ctx.currentTime + 0.05,
      realPlayed: name !== "menu" || !realBuffer, // play real piece only once
    };
    if (name === "menu" && realBuffer) _playRealMenu();
    _applyBus();
  }

  // the real menu piece: play it once through realBuffer, then the procedural
  // loop continues underneath. The piece is short (< 1 min).
  let realSrc = null;
  function _playRealMenu() {
    if (!realBuffer || !ctx) return;
    if (realSrc) {
      // already-stopped is the only known case here; if the buffer is in
      // a weird state the safest thing is to drop the source and continue
      try {
        realSrc.stop();
      } catch {
        realSrc = null;
      }
      realSrc = null;
    }
    realSrc = ctx.createBufferSource();
    realSrc.buffer = realBuffer;
    realSrc.loop = false;
    const g = ctx.createGain();
    g.gain.value = 0.85;
    realSrc.connect(g).connect(bus);
    realSrc.onended = () => {
      realSrc = null;
    };
    realSrc.start(ctx.currentTime);
  }

  /* ---------- voices ---------- */

  // a plucked-string-ish note: a triangle with a touch of 2nd harmonic,
  // a fast attack, a long exponential decay through a closing lowpass.
  function pluck(freq, t, dur, vol) {
    if (!freq) return;
    const o = ctx.createOscillator();
    o.type = "triangle";
    o.frequency.value = freq;
    // tiny 2nd-harmonic overtone for body
    const o2 = ctx.createOscillator();
    o2.type = "sine";
    o2.frequency.value = freq * 2.01;

    const f = ctx.createBiquadFilter();
    f.type = "lowpass";
    f.frequency.setValueAtTime(3200, t);
    f.frequency.exponentialRampToValueAtTime(800, t + dur);

    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(vol, t + 0.006);
    g.gain.exponentialRampToValueAtTime(vol * 0.45, t + 0.18);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);

    o.connect(f);
    o2.connect(f);
    f.connect(g).connect(bus);

    o.start(t);
    o2.start(t);
    o.stop(t + dur + 0.05);
    o2.stop(t + dur + 0.05);
  }

  // bass: a sub sine, slow attack, longer sustain
  function bass(freq, t, dur, vol) {
    if (!freq) return;
    const o = ctx.createOscillator();
    o.type = "sine";
    o.frequency.value = freq;
    // a fifth up, very quiet — gives the bass some "size" without muddying
    const o2 = ctx.createOscillator();
    o2.type = "sine";
    o2.frequency.value = freq * 2;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(vol, t + 0.025);
    g.gain.exponentialRampToValueAtTime(vol * 0.7, t + 0.4);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    const g2 = ctx.createGain();
    g2.gain.setValueAtTime(0.0001, t);
    g2.gain.linearRampToValueAtTime(vol * 0.18, t + 0.04);
    g2.gain.exponentialRampToValueAtTime(0.0001, t + dur * 0.7);
    o.connect(g).connect(bus);
    o2.connect(g2).connect(bus);
    o.start(t);
    o.stop(t + dur + 0.05);
    o2.start(t);
    o2.stop(t + dur + 0.05);
  }

  // a small drum kit: kick, tom, hat. Quiet — the music sits *under* the
  // battle, never over it.
  function kick(t, vol) {
    const o = ctx.createOscillator();
    o.type = "sine";
    o.frequency.setValueAtTime(110, t);
    o.frequency.exponentialRampToValueAtTime(38, t + 0.1);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(vol, t + 0.005);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.3);
    o.connect(g).connect(bus);
    o.start(t);
    o.stop(t + 0.4);
  }
  function tom(t, vol, f) {
    const o = ctx.createOscillator();
    o.type = "sine";
    o.frequency.value = f || 180;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(vol, t + 0.008);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.16);
    o.connect(g).connect(bus);
    o.start(t);
    o.stop(t + 0.2);
  }
  function hat(t, vol) {
    const buf = ctx.createBuffer(1, Math.max(1, (ctx.sampleRate * 0.04) | 0), ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    const src = ctx.createBufferSource();
    src.buffer = buf;
    const f = ctx.createBiquadFilter();
    f.type = "highpass";
    f.frequency.value = 6000;
    const g = ctx.createGain();
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.035);
    src.connect(f).connect(g).connect(bus);
    src.start(t);
    src.stop(t + 0.05);
  }

  // a brass-like pad, for the tense moment in the battle loop
  function pad(freqs, t, dur, vol) {
    const o = ctx.createOscillator();
    o.type = "sawtooth";
    o.frequency.value = freqs[0];
    const o2 = ctx.createOscillator();
    o2.type = "sawtooth";
    o2.frequency.value = freqs[0] * 1.005; // tiny detune
    const f = ctx.createBiquadFilter();
    f.type = "lowpass";
    f.frequency.setValueAtTime(900, t);
    f.frequency.linearRampToValueAtTime(1500, t + dur * 0.5);
    f.frequency.linearRampToValueAtTime(700, t + dur);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(vol, t + 0.2);
    g.gain.setValueAtTime(vol, t + dur * 0.7);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(f);
    o2.connect(f);
    f.connect(g).connect(bus);
    o.start(t);
    o2.start(t);
    o.stop(t + dur + 0.05);
    o2.stop(t + dur + 0.05);
  }

  /* ---------- tracks ---------- */

  // 4 beats per bar. `bpm` sets the beat. Each bar has:
  //   root: pentatonic index for the bass (0..4 typically)
  //   melody: [{beat, idx, oct, dur?, vol?}]   idx 0..4, oct 0..3
  //   bass:   {idx, oct, dur?, vol?}
  //   drums:  [{beat, type, vol?, f?}]
  //   pad:    optional sustained chord
  // Tracks loop on `loopBars` bars; "victory" and "defeat" play once and stop.

  const TRACKS = {
    /* menu — slow, gentle, C major pentatonic, 4-bar loop */
    menu: {
      bpm: 70,
      loopBars: 4,
      bars: [
        {
          melody: [
            { beat: 0, idx: 0, oct: 3, dur: 0.5, vol: 0.22 },
            { beat: 1, idx: 2, oct: 3, dur: 0.5, vol: 0.2 },
            { beat: 2, idx: 4, oct: 3, dur: 1.0, vol: 0.2 },
            { beat: 3, idx: 3, oct: 3, dur: 0.5, vol: 0.18 },
          ],
          bass: { idx: 0, oct: 1, dur: 4, vol: 0.18 },
          drums: [
            { beat: 0, type: "tom", vol: 0.08, f: 90 },
            { beat: 2, type: "tom", vol: 0.07, f: 75 },
          ],
        },
        {
          melody: [
            { beat: 0, idx: 3, oct: 3, dur: 0.5, vol: 0.2 },
            { beat: 1, idx: 4, oct: 3, dur: 0.5, vol: 0.2 },
            { beat: 2, idx: 0, oct: 4, dur: 1.0, vol: 0.22 },
            { beat: 3.5, idx: 2, oct: 3, dur: 0.4, vol: 0.18 },
          ],
          bass: { idx: 3, oct: 1, dur: 4, vol: 0.18 },
          drums: [],
        },
        {
          melody: [
            { beat: 0, idx: 4, oct: 3, dur: 0.5, vol: 0.2 },
            { beat: 1, idx: 2, oct: 3, dur: 0.5, vol: 0.2 },
            { beat: 2, idx: 0, oct: 4, dur: 0.5, vol: 0.2 },
            { beat: 3, idx: 2, oct: 3, dur: 1.0, vol: 0.2 },
          ],
          bass: { idx: 4, oct: 1, dur: 4, vol: 0.18 },
          drums: [{ beat: 0, type: "tom", vol: 0.08, f: 80 }],
        },
        {
          melody: [
            { beat: 0, idx: 1, oct: 3, dur: 0.5, vol: 0.2 },
            { beat: 1, idx: 3, oct: 3, dur: 0.5, vol: 0.2 },
            { beat: 2, idx: 2, oct: 3, dur: 0.5, vol: 0.2 },
            { beat: 3, idx: 0, oct: 3, dur: 1.0, vol: 0.22 },
          ],
          bass: { idx: 1, oct: 1, dur: 4, vol: 0.18 },
          drums: [],
        },
      ],
    },

    /* battle — D minor pentatonic, 2-bar loop, driving */
    battle: {
      bpm: 120,
      loopBars: 2,
      bars: [
        {
          melody: [
            { beat: 0, idx: 0, oct: 3, dur: 0.25, vol: 0.28 },
            { beat: 0.5, idx: 2, oct: 3, dur: 0.25, vol: 0.26 },
            { beat: 1, idx: 4, oct: 3, dur: 0.5, vol: 0.28 },
            { beat: 1.5, idx: 2, oct: 3, dur: 0.25, vol: 0.24 },
            { beat: 2, idx: 3, oct: 3, dur: 0.25, vol: 0.26 },
            { beat: 2.5, idx: 2, oct: 3, dur: 0.25, vol: 0.24 },
            { beat: 3, idx: 0, oct: 3, dur: 0.5, vol: 0.26 },
          ],
          bass: { idx: 0, oct: 1, dur: 2, vol: 0.3 },
          drums: [
            { beat: 0, type: "kick", vol: 0.32 },
            { beat: 0.5, type: "hat", vol: 0.06 },
            { beat: 1, type: "tom", vol: 0.18, f: 100 },
            { beat: 1.5, type: "hat", vol: 0.05 },
            { beat: 2, type: "kick", vol: 0.3 },
            { beat: 2.5, type: "hat", vol: 0.06 },
            { beat: 3, type: "tom", vol: 0.16, f: 90 },
            { beat: 3.5, type: "hat", vol: 0.05 },
          ],
          pad: [note12("D3"), note12("A3")],
        },
        {
          melody: [
            { beat: 0, idx: 1, oct: 3, dur: 0.25, vol: 0.26 },
            { beat: 0.5, idx: 2, oct: 3, dur: 0.25, vol: 0.24 },
            { beat: 1, idx: 3, oct: 3, dur: 0.5, vol: 0.28 },
            { beat: 2, idx: 2, oct: 3, dur: 0.5, vol: 0.26 },
            { beat: 3, idx: 1, oct: 3, dur: 0.5, vol: 0.24 },
          ],
          bass: { idx: 4, oct: 1, dur: 2, vol: 0.3 },
          drums: [
            { beat: 0, type: "kick", vol: 0.32 },
            { beat: 0.5, type: "hat", vol: 0.06 },
            { beat: 1, type: "tom", vol: 0.18, f: 110 },
            { beat: 1.5, type: "hat", vol: 0.05 },
            { beat: 2, type: "kick", vol: 0.3 },
            { beat: 2.5, type: "hat", vol: 0.06 },
            { beat: 3, type: "tom", vol: 0.16, f: 95 },
            { beat: 3.5, type: "hat", vol: 0.05 },
          ],
          pad: [note12("F3"), note12("C4")],
        },
      ],
    },

    /* victory — short, ascending, plays once. C major, bright. */
    victory: {
      bpm: 100,
      once: true,
      bars: [
        {
          melody: [
            { beat: 0, idx: 2, oct: 4, dur: 0.5, vol: 0.32 },
            { beat: 0.5, idx: 3, oct: 4, dur: 0.5, vol: 0.3 },
            { beat: 1, idx: 4, oct: 4, dur: 0.5, vol: 0.32 },
            { beat: 1.5, idx: 0, oct: 5, dur: 1.5, vol: 0.36 },
          ],
          bass: { idx: 0, oct: 1, dur: 4, vol: 0.28 },
          drums: [
            { beat: 0, type: "kick", vol: 0.32 },
            { beat: 1, type: "tom", vol: 0.2, f: 120 },
            { beat: 2, type: "kick", vol: 0.28 },
            { beat: 3, type: "tom", vol: 0.2, f: 100 },
          ],
        },
        {
          melody: [
            { beat: 0, idx: 4, oct: 4, dur: 0.5, vol: 0.3 },
            { beat: 0.5, idx: 0, oct: 5, dur: 0.5, vol: 0.32 },
            { beat: 1, idx: 2, oct: 5, dur: 2, vol: 0.36 },
          ],
          bass: { idx: 3, oct: 1, dur: 4, vol: 0.28 },
          drums: [
            { beat: 0, type: "kick", vol: 0.3 },
            { beat: 1, type: "tom", vol: 0.22, f: 130 },
            { beat: 2, type: "tom", vol: 0.2, f: 100 },
          ],
          pad: [note12("C4"), note12("G4")],
        },
      ],
    },

    /* defeat — short, descending, plays once. D minor. */
    defeat: {
      bpm: 70,
      once: true,
      bars: [
        {
          melody: [
            { beat: 0, idx: 4, oct: 3, dur: 1, vol: 0.3 },
            { beat: 1, idx: 3, oct: 3, dur: 1, vol: 0.28 },
            { beat: 2, idx: 2, oct: 3, dur: 1, vol: 0.26 },
            { beat: 3, idx: 0, oct: 3, dur: 1, vol: 0.28 },
          ],
          bass: { idx: 0, oct: 1, dur: 4, vol: 0.32 },
          drums: [
            { beat: 0, type: "kick", vol: 0.3 },
            { beat: 2, type: "tom", vol: 0.2, f: 70 },
          ],
        },
        {
          melody: [
            { beat: 0, idx: 2, oct: 3, dur: 1, vol: 0.26 },
            { beat: 1, idx: 1, oct: 3, dur: 1, vol: 0.24 },
            { beat: 2, idx: 0, oct: 3, dur: 2, vol: 0.28 },
          ],
          bass: { idx: 4, oct: 1, dur: 4, vol: 0.32 },
          drums: [
            { beat: 0, type: "tom", vol: 0.18, f: 80 },
            { beat: 2, type: "kick", vol: 0.22 },
          ],
        },
      ],
    },

    /* turn_change — a single ding; non-looping stinger */
    turn_change: {
      bpm: 80,
      once: true,
      bars: [
        {
          melody: [
            { beat: 0, idx: 2, oct: 4, dur: 0.4, vol: 0.24 },
            { beat: 0.5, idx: 4, oct: 4, dur: 0.8, vol: 0.24 },
          ],
          bass: { idx: 0, oct: 1, dur: 1.5, vol: 0.18 },
          drums: [{ beat: 0, type: "tom", vol: 0.16, f: 110 }],
        },
      ],
    },
  };

  /* Faction stingers — a 4-note motif per faction colour. Each one is a short
     pentatonic phrase, low and assertive; used when the player picks a faction
     in the campaign. Eight factions, one pentatonic mode each. */
  const FACTION_PENT = [
    [0, 1, 2, 3, 4], // C major   — 曹操
    [0, 1, 3, 4, 2], // C mixolydian — 袁紹
    [0, 2, 3, 4, 1], // Lydian-flavour — 劉備
    [0, 1, 2, 3, 4], // repeat, different root — 孫權
    [0, 1, 2, 3, 4],
    [0, 1, 2, 3, 4],
    [0, 1, 2, 3, 4],
    [0, 1, 2, 3, 4],
  ];
  for (let i = 0; i < 8; i++) {
    const seq = FACTION_PENT[i];
    TRACKS["faction_sting_" + i] = {
      bpm: 90,
      once: true,
      bars: [
        {
          melody: [
            { beat: 0, idx: seq[0], oct: 3, dur: 0.5, vol: 0.3 },
            { beat: 0.5, idx: seq[2], oct: 3, dur: 0.5, vol: 0.28 },
            { beat: 1, idx: seq[3], oct: 3, dur: 0.5, vol: 0.3 },
            { beat: 1.5, idx: seq[4], oct: 4, dur: 1.5, vol: 0.32 },
          ],
          bass: { idx: seq[0], oct: 1, dur: 4, vol: 0.22 },
          drums: [
            { beat: 0, type: "tom", vol: 0.18, f: 100 },
            { beat: 1, type: "tom", vol: 0.16, f: 110 },
            { beat: 2, type: "kick", vol: 0.2 },
          ],
        },
      ],
    };
  }

  /* ---------- scheduler ---------- */

  function barDur(track) {
    return (60 / track.def.bpm) * 4; // 4 beats per bar
  }

  function _scheduleBar(trackRef, barIdx, t0) {
    const def = trackRef.def;
    const bar = def.bars[barIdx % def.bars.length];
    const beat = 60 / def.bpm; // seconds per beat
    // melody
    if (bar.melody) {
      for (const m of bar.melody) {
        const f = PENT[m.idx + m.oct * 5];
        pluck(f, t0 + m.beat * beat, beat * (m.dur || 0.5), m.vol || 0.25);
      }
    }
    // bass
    if (bar.bass) {
      const f = PENT[bar.bass.idx + bar.bass.oct * 5];
      bass(f, t0, beat * (bar.bass.dur || 4), bar.bass.vol || 0.25);
    }
    // drums
    if (bar.drums) {
      for (const d of bar.drums) {
        const dt = t0 + d.beat * beat;
        if (d.type === "kick") kick(dt, d.vol || 0.2);
        else if (d.type === "tom") tom(dt, d.vol || 0.2, d.f);
        else if (d.type === "hat") hat(dt, d.vol || 0.06);
      }
    }
    // optional pad (sustained chord)
    if (bar.pad) pad(bar.pad, t0, beat * 4, 0.06);
  }

  function tick(_dt) {
    if (!ready || !track) return;
    const now = ctx.currentTime;
    const lookAhead = 0.25; // schedule this much ahead
    const barD = barDur(track);
    while (track.nextBarTime < now + lookAhead) {
      _scheduleBar(track, track.bar, track.nextBarTime);
      track.bar++;
      track.nextBarTime += barD;
      // "once" tracks stop after their last bar
      if (track.def.once && track.bar >= track.def.bars.length) {
        const t = track;
        setTimeout(
          () => {
            if (track === t) {
              track = null;
              _applyBus();
            }
          },
          barD * 1.2 * 1000,
        );
        break;
      }
      // looped tracks wrap their bar index (and the bar array re-uses)
    }
  }

  ZS.music = {
    init,
    play,
    stop,
    setVolume,
    tick,
    realMenu: null, // base64 WAV string, set by menu-track-data.js if loaded
    get current() {
      return track ? track.name : null;
    },
    get ready() {
      return ready;
    },
    get volume() {
      return masterVol;
    },
  };
})();
