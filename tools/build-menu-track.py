#!/usr/bin/env python3
"""Generate a real guzheng-flavored menu track for 火柴三國.

This is the *one real track* the design asks for: a short, hand-shaped
plucked-string piece in C major pentatonic, written to a 16-bit PCM WAV
at 44.1 kHz. The asset-time script (no runtime cost) — the music engine
loads the result as a base64 string and decodes it via the WebAudio
decodeAudioData path.

Karplus-Strong for the plucked-string tone, layered with:
  - a soft sub-octave bass on the root of each bar
  - a quiet "strike" envelope on the pluck attack
  - a hall-ish reverb via a few delay taps (sampled impulse)
  - gentle compression at the master bus via tanh

Usage:
    python tools/build-menu-track.py            # writes to assets/menu.wav
    python tools/build-menu-track.py --out path # custom path

The build is deterministic: a fixed seed, fixed chord progression, fixed
melody. A second run with the same flags produces a byte-identical file.
"""
import argparse
import math
import os
import struct
import sys
import wave


SR = 22050  # 22.05 kHz mono — fine for pentatonic melody, halves the WAV size


def ks_string(freq, dur, decay=0.996, brightness=0.5, rng=None):
    """One note via Karplus-Strong. Returns a float list of length int(dur*SR)."""
    if rng is None:
        import random
        rng = random.Random(0xC0FFEE)
    n = max(2, int(SR / freq))
    # initial buffer: random in [-1, 1] with a lowpass tilt
    buf = [rng.uniform(-1, 1) for _ in range(n)]
    # tilt toward low harmonics ("brightness")
    if brightness != 0.5:
        # simple one-pole lowpass on init
        a = 0.2 + 0.6 * (1 - brightness)
        y = 0.0
        for i in range(n):
            y = y + a * (buf[i] - y)
            buf[i] = y
    out = []
    decay_local = decay
    # gentle brightness drift over the note
    total = int(dur * SR)
    for i in range(total):
        # stretch the delay if the note is very long, to avoid metallic ringing
        idx = i % n
        nxt = (idx + 1) % n
        s = buf[idx]
        # the "magic" — averaging two samples, then scaling
        buf[idx] = (buf[idx] + buf[nxt]) * 0.5 * decay_local
        out.append(s)
        # very slow decay modulation — the note "ages" rather than ringing forever
        if (i & 0x3FFF) == 0 and i > 0:
            decay_local = max(0.96, decay_local - 0.0002)
    return out


def ks_string_layered(freq, dur, decay=0.996, rng=None):
    """Three KS strings stacked: fundamental + 2nd + 3rd harmonic with
    decreasing amplitude. The result sounds more like a real guzheng than a
    single KS voice (which is closer to a clean guitar)."""
    a = ks_string(freq, dur, decay=decay, brightness=0.5, rng=rng)
    b = ks_string(freq * 2, dur, decay=decay * 0.96, brightness=0.4, rng=rng)
    c = ks_string(freq * 3, dur, decay=decay * 0.92, brightness=0.3, rng=rng)
    out = [0.0] * len(a)
    for i in range(len(out)):
        out[i] = a[i] * 0.7 + b[i] * 0.18 + c[i] * 0.08
    return out


def adx_envelope(n, attack=0.008, decay=0.6):
    """A short attack, a long exponential decay. Returns a list of length n."""
    out = []
    a_n = int(attack * SR)
    for i in range(n):
        if i < a_n:
            out.append(i / max(1, a_n))
        else:
            t = (i - a_n) / max(1, n - a_n)
            out.append(math.exp(-3.5 * t) * decay)
    return out


def mix_into(track, sample, offset, vol=1.0, env=None):
    """Add `sample` into `track` starting at `offset`, scaled by vol and env."""
    n = len(sample)
    # extend track if needed
    end = offset + n
    if end > len(track):
        track.extend([0.0] * (end - len(track)))
    if env is None:
        for i in range(n):
            track[offset + i] += sample[i] * vol
    else:
        for i in range(n):
            track[offset + i] += sample[i] * vol * env[i]


def soft_clip(track, drive=1.6):
    """Tanh-style soft clipper. Adds a touch of warmth without harshness."""
    a = (drive - 1) * 0.6 + 1
    for i in range(len(track)):
        track[i] = math.tanh(track[i] * a) * 0.85


def simple_reverb(track, taps=((0.029, 0.45), (0.041, 0.35), (0.073, 0.22))):
    """Three-tap comb — a tiny hall, no library."""
    out = list(track)
    for delay_s, gain in taps:
        d = int(delay_s * SR)
        if d >= len(track):
            continue
        for i in range(d, len(track)):
            out[i] += track[i - d] * gain
    return out


def write_wav(path, samples, sr=SR):
    """Write a 16-bit PCM mono WAV."""
    # normalize so the peak is around -3 dB
    peak = max(abs(s) for s in samples) or 1.0
    target = 0.7
    norm = target / peak
    data = bytearray()
    for s in samples:
        v = max(-1.0, min(1.0, s * norm))
        i = int(v * 32767)
        data.extend(struct.pack('<h', i))
    with wave.open(path, 'wb') as w:
        w.setnchannels(1)
        w.setsampwidth(2)
        w.setframerate(sr)
        w.writeframes(bytes(data))


def note(name):
    """12-TET frequency from a note name. A4 = 440."""
    N = {'C': -9, 'C#': -8, 'D': -7, 'D#': -6, 'E': -5, 'F': -4,
         'F#': -3, 'G': -2, 'G#': -1, 'A': 0, 'A#': 1, 'B': 2}
    if len(name) >= 2 and name[1] == '#':
        n = N[name[:2]]
        octv = int(name[2:])
    else:
        n = N[name[0]]
        octv = int(name[1:])
    semis = (octv - 4) * 12 + n
    return 440.0 * (2 ** (semis / 12.0))


def build_melody(rng):
    """C major pentatonic, gentle 2-bar phrase, ~30 s total.

    Bar 1: low C, C-E-G-A-G    (slow, arpeggiated)
    Bar 2: G,    G-A-C5-A
    Bar 3: A,    A-G-E
    Bar 4: F,    F-G-A-G
    Bar 5: low C again, a little higher in the register
    Bar 6: G, descending G-F-E-D
    Bar 7: A, A-G-E
    Bar 8: low C, a final C5 ringing out

    Each bar ~3.5 s. With a soft "ding" at the end, the whole thing is
    ~30 s — long enough to feel like a piece, short enough to loop the
    procedural menu underneath once it ends.
    """
    # C major pentatonic: C D E G A across 4 octaves (C3..A6).
    # Index 0..4 = octave 0 (C3..A3), 5..9 = octave 1 (C4..A4), etc.
    PENT = [
        note('C3'), note('D3'), note('E3'), note('G3'), note('A3'),
        note('C4'), note('D4'), note('E4'), note('G4'), note('A4'),
        note('C5'), note('D5'), note('E5'), note('G5'), note('A5'),
        note('C6'), note('D6'), note('E6'), note('G6'), note('A6'),
    ]

    bars = [
        # (bass_note, [(beat, idx, oct, dur_beats, vol)])
        # 6 bars, ~21 s, gentle and loopable.
        (PENT[0], [
            (0.0, 0, 1, 1.0, 0.5),    # C4
            (1.0, 2, 1, 1.0, 0.5),    # E4
            (2.0, 3, 1, 1.0, 0.5),    # G4
            (3.0, 4, 1, 1.0, 0.5),    # A4
        ]),
        (PENT[3], [
            (0.0, 3, 1, 0.8, 0.5),    # G4
            (0.8, 4, 1, 0.8, 0.5),    # A4
            (1.6, 0, 2, 1.0, 0.55),   # C5
            (2.6, 4, 1, 0.8, 0.5),    # A4
            (3.4, 3, 1, 0.6, 0.45),   # G4
        ]),
        (PENT[4], [
            (0.0, 4, 1, 0.6, 0.5),    # A4
            (0.6, 3, 1, 0.6, 0.45),   # G4
            (1.2, 2, 1, 0.6, 0.45),   # E4
            (1.8, 0, 2, 0.8, 0.55),   # C5
            (2.6, 3, 1, 0.8, 0.45),   # G4
            (3.4, 4, 1, 0.6, 0.5),    # A4
        ]),
        (PENT[1], [
            (0.0, 1, 1, 0.8, 0.5),    # D4
            (0.8, 3, 1, 0.8, 0.45),   # G4
            (1.6, 2, 1, 0.8, 0.45),   # E4
            (2.4, 0, 2, 0.6, 0.5),    # C5
            (3.0, 3, 1, 0.8, 0.45),   # G4
            (3.8, 1, 1, 0.4, 0.4),    # D4
        ]),
        (PENT[0], [
            (0.0, 0, 1, 1.0, 0.5),    # C4
            (1.0, 2, 1, 1.0, 0.5),    # E4
            (2.0, 3, 1, 1.0, 0.55),   # G4
            (3.0, 4, 1, 1.0, 0.55),   # A4
        ]),
        (PENT[0], [
            (0.0, 2, 1, 1.0, 0.5),    # E4
            (1.0, 0, 1, 1.0, 0.5),    # C4
            (2.0, 0, 2, 1.5, 0.6),    # C5 (long ring)
            (3.5, 1, 2, 0.7, 0.5),    # D5
        ]),
    ]

    BPM = 70
    BEAT = 60.0 / BPM  # seconds per beat
    BAR = BEAT * 4      # seconds per bar (4/4)

    total_dur = BAR * len(bars) + 2.0  # a little tail
    out = [0.0] * int(total_dur * SR)

    for bar_i, (bass_f, melody) in enumerate(bars):
        bar_t = bar_i * BAR
        # bass: a long KS pluck
        bass_note = ks_string_layered(bass_f, BAR * 0.95, decay=0.997, rng=rng)
        mix_into(out, bass_note, int(bar_t * SR), vol=0.25)
        # melody
        for beat, idx, oct, dur_b, vol in melody:
            t = bar_t + beat * BEAT
            f = PENT[idx + oct * 5]
            # higher notes decay faster
            decay = max(0.985, 0.998 - 0.0006 * idx)
            n = ks_string_layered(f, BEAT * dur_b * 1.05, decay=decay, rng=rng)
            env = adx_envelope(len(n), attack=0.004, decay=1.0)
            mix_into(out, n, int(t * SR), vol=0.32 * vol, env=env)

    # soft clip + tiny reverb
    soft_clip(out, drive=1.4)
    out = simple_reverb(out)

    return out


def main():
    p = argparse.ArgumentParser()
    p.add_argument('--out', default=os.path.join('assets', 'menu.wav'))
    p.add_argument('--also-data', action='store_true',
                   help='also write assets/menu-track-base64.txt for the JS embed step')
    p.add_argument('--quiet', action='store_true')
    args = p.parse_args()

    import random
    rng = random.Random(0xC0FFEE)
    samples = build_melody(rng)
    os.makedirs(os.path.dirname(args.out) or '.', exist_ok=True)
    write_wav(args.out, samples)
    if not args.quiet:
        dur = len(samples) / SR
        size = os.path.getsize(args.out)
        print(f'wrote {args.out}  {dur:.1f} s  {size} bytes')

    if args.also_data:
        import base64
        with open(args.out, 'rb') as f:
            b64 = base64.b64encode(f.read()).decode('ascii')
        b64_path = os.path.splitext(args.out)[0] + '.b64.txt'
        with open(b64_path, 'w') as f:
            f.write(b64)
        if not args.quiet:
            print(f'wrote {b64_path}  {len(b64)} chars (base64)')


if __name__ == '__main__':
    main()
