"""OTTO — 'Ledger Nocturne' score. Original procedural music + SFX, synced to timeline.json.

Writes assets/audio/music.wav, assets/audio/sfx.wav and assets/audio/mix.wav (48 kHz, 24-bit stereo).
120 BPM: one beat = 0.5 s = 15 frames at 30 fps, so every cue lands on a frame.
"""
import json, os
import numpy as np
from scipy import signal
from scipy.io import wavfile

HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(HERE, '..', 'assets', 'audio')
os.makedirs(OUT, exist_ok=True)
T = json.load(open(os.path.join(HERE, 'timeline.json')))
SR = 48000
DUR = T['duration'] / T['fps']
N = int(SR * DUR) + SR * 2  # tail room, trimmed at the end
BEAT = 60 / T['bpm']
rng = np.random.default_rng(7)

def f2s(fr): return fr / T['fps']
def mtof(m): return 440.0 * 2 ** ((m - 69) / 12)
def buf(): return np.zeros((N, 2))
def place(dst, x, t, gain=1.0, pan=0.0):
    i = int(t * SR)
    if x.ndim == 1: x = np.stack([x * np.sqrt(0.5 * (1 - pan)), x * np.sqrt(0.5 * (1 + pan))], 1) * np.sqrt(2)
    j = min(N, i + len(x)); dst[i:j] += x[: j - i] * gain
def env_adsr(n, a, d, s, r):
    a, d, r = int(a * SR), int(d * SR), int(r * SR)
    e = np.full(n, s, float)
    e[:a] = np.linspace(0, 1, a, endpoint=False) if a else e[:a]
    e[a:a + d] = np.linspace(1, s, max(1, len(e[a:a + d])))
    if r: e[-r:] *= np.linspace(1, 0, r)
    return e
def lp(x, fc, order=2):
    b, a = signal.butter(order, min(fc, SR * 0.45) / (SR / 2), 'low'); return signal.lfilter(b, a, x, axis=0)
def hp(x, fc, order=2):
    b, a = signal.butter(order, fc / (SR / 2), 'high'); return signal.lfilter(b, a, x, axis=0)
def bp(x, lo, hi, order=2):
    b, a = signal.butter(order, [lo / (SR / 2), hi / (SR / 2)], 'band'); return signal.lfilter(b, a, x, axis=0)
def saw(f, n, phase=0.0):
    t = np.arange(n) / SR; y = np.zeros(n); k = 1
    while k * f < 5000 and k < 40:
        y += np.sin(2 * np.pi * k * f * t + phase * k) / k; k += 1
    return y * 0.55
def reverb(x, secs=3.2, mix=0.35, damp=5000, pre=0.02):
    n = int(secs * SR); t = np.arange(n) / SR
    ir = rng.standard_normal((n, 2)) * np.exp(-t * 6.9 / secs)[:, None]
    ir = lp(ir, damp); ir[: int(pre * SR)] = 0; ir /= np.sqrt((ir ** 2).sum(0))
    wet = np.stack([signal.fftconvolve(x[:, c], ir[:, c])[: len(x)] for c in range(2)], 1)
    return x * (1 - mix) + wet * mix * 1.6
def delay(x, t, fb=0.35, mix=0.3, n=6):
    y = x.copy(); d = int(t * SR)
    for k in range(1, n):
        s = np.zeros_like(x); s[d * k:] = x[: len(x) - d * k] * (fb ** k)
        if k % 2: s = s[:, ::-1]  # ping-pong
        y += s * mix
    return y

# ---------------- harmony ----------------
# Two-bar chords (4 s). F lydian colour: the room is dark, the arithmetic is already done.
CH = {
    'Fmaj9':  [41, 53, 57, 60, 64, 67],
    'Am9':    [45, 57, 60, 64, 67, 71],
    'Dm9':    [38, 53, 57, 60, 64, 69],
    'Bbmaj9': [46, 53, 57, 62, 65, 72],
    'C69':    [36, 52, 55, 57, 62, 64],
    'Flyd':   [41, 53, 57, 60, 64, 71, 72],
}
PROG = [(0, 'Fmaj9'), (4, 'Am9'), (8, 'Dm9'), (12, 'Bbmaj9'), (16, 'Fmaj9'), (18, 'C69'), (20, 'Am9'), (22, 'Bbmaj9'), (24, 'Flyd')]
def chord_at(t):
    c = PROG[0][1]
    for s, n in PROG:
        if t >= s: c = n
    return c

music = buf(); sfx = buf()

# Pad: detuned saws, filter opening across the piece; sidechained to the kick from 4 s.
pad = buf()
for idx, (start, name) in enumerate(PROG):
    end = PROG[idx + 1][0] if idx + 1 < len(PROG) else DUR + 1.5
    n = int((end - start + 1.2) * SR)
    for m in CH[name][1:]:
        for det, pan in ((-0.07, -0.6), (0.0, 0.0), (0.07, 0.6)):
            v = saw(mtof(m + det), n, rng.uniform(0, 6.28)) * env_adsr(n, 1.4 if idx == 0 else 0.5, 0.3, 0.8, 1.2)
            place(pad, v, start, 0.05, pan)
cut = np.interp(np.arange(N) / SR, [0, 4, 12, 16, 22, 24, 27, 32], [500, 900, 1600, 2600, 3400, 1400, 900, 600])
# time-varying low-pass, block-wise
out = np.zeros_like(pad); B = 2048; zi = None
for i in range(0, N, B):
    b, a = signal.butter(2, cut[i] / (SR / 2), 'low')
    if zi is None: zi = np.zeros((2, 2))
    out[i:i + B], zi = signal.lfilter(b, a, pad[i:i + B], axis=0, zi=zi)
pad = out

# Sidechain envelope: duck on every beat where the kick plays.
kick_beats = [t for t in np.arange(4, 24, BEAT)]
sc = np.ones(N)
for t in kick_beats:
    i = int(t * SR); L = int(0.42 * SR); j = min(N, i + L)
    sc[i:j] = np.minimum(sc[i:j], 1 - 0.55 * np.exp(-np.arange(j - i) / (0.09 * SR)))
music += pad * sc[:, None]

# Sub: root, pulsing on the off-beat feel only through the sidechain.
for idx, (start, name) in enumerate(PROG):
    end = PROG[idx + 1][0] if idx + 1 < len(PROG) else DUR + 1
    if start < 4: continue
    n = int((end - start) * SR); t = np.arange(n) / SR
    root = CH[name][0] - 12 if CH[name][0] > 40 else CH[name][0]
    e = env_adsr(n, 0.02, 0.1, 1, 0.08) if start < 24 else np.exp(-t * 1.6)  # the ending lets go of the floor
    v = np.sin(2 * np.pi * mtof(root) * t) * e
    place(music, v * sc[int(start * SR):int(start * SR) + n], start, 0.13)

# Kick: soft, round. 4 s .. 24 s on every beat (the drop out at 24 s is the ending's breath).
def kick():
    n = int(0.45 * SR); t = np.arange(n) / SR
    f = 44 + 90 * np.exp(-t * 28); ph = 2 * np.pi * np.cumsum(f) / SR
    return np.sin(ph) * np.exp(-t * 7.5) + hp(rng.standard_normal(n), 3000) * np.exp(-t * 300) * 0.15
K = kick()
for t in kick_beats: place(music, K, t, 0.55)

# Tick: the instrument's escapement. 8ths throughout; accents on beats.
def tick(bright=1.0, f=4200):
    n = int(0.05 * SR); t = np.arange(n) / SR
    ping = np.sin(2 * np.pi * f * t) * np.exp(-t * 260) + np.sin(2 * np.pi * f * 1.64 * t) * np.exp(-t * 400) * 0.5
    return (ping * 0.6 + hp(rng.standard_normal(n), 5000) * np.exp(-t * 500) * 0.5) * bright
for k, t in enumerate(np.arange(0, 27.5, BEAT / 2)):
    g = (0.075 if k % 2 == 0 else 0.04) * (0.6 if t < 2 else 1) * (0.5 if t >= 24 else 1)
    place(music, tick(f=4200 if k % 2 == 0 else 3500), t, g, pan=0.25 if k % 2 else -0.25)

# Hats + soft rim through the montage and Otto (16 .. 24 s).
for t in np.arange(16, 24, BEAT):
    n = int(0.09 * SR); tt = np.arange(n) / SR
    place(music, hp(rng.standard_normal(n), 8000) * np.exp(-tt * 45), t + BEAT / 2, 0.06, 0.35)
for t in np.arange(16 + BEAT, 24, BEAT * 2):
    n = int(0.2 * SR); tt = np.arange(n) / SR
    rim = bp(rng.standard_normal(n), 900, 2600) * np.exp(-tt * 40) + np.sin(2 * np.pi * 330 * tt) * np.exp(-tt * 30) * 0.4
    place(music, rim, t, 0.12, -0.15)

# Pluck arpeggio (FM mallet) from 12 s: 16ths drawn from the chord, sparse, with ping-pong delay.
arp = buf()
def mallet(f, dur=0.5):
    n = int(dur * SR); t = np.arange(n) / SR
    idx = 2.2 * np.exp(-t * 18)
    return np.sin(2 * np.pi * f * t + idx * np.sin(2 * np.pi * f * 2 * t)) * np.exp(-t * 7)
pattern = [0, None, 2, None, 1, 3, None, 2, 0, None, 3, None, 2, None, 4, None]
for k, t in enumerate(np.arange(12, 24, BEAT / 4)):
    p = pattern[k % 16]
    if p is None: continue
    tones = CH[chord_at(t)][2:]
    m = tones[p % len(tones)] + 12
    place(arp, mallet(mtof(m)), t, 0.05 + 0.02 * (k % 4 == 0), pan=np.sin(k * 0.7) * 0.5)
music += delay(arp, BEAT * 0.75, 0.4, 0.35)

# Ending: a long held bell chord at 24 s and a final OTTO 'ding' when the wordmark lands.
for m in CH['Flyd'][2:]:
    place(music, mallet(mtof(m + 12), 5.5), 24.0, 0.035, pan=rng.uniform(-0.6, 0.6))

music = hp(reverb(music, 3.4, 0.28), 32, 4)

# ---------------- SFX (synced to picture) ----------------
def whoosh(dur=0.9, lo=300, hi=6000, up=True):
    n = int(dur * SR); t = np.arange(n) / SR; x = rng.standard_normal(n)
    y = np.zeros(n); B = 1024
    for i in range(0, n, B):
        u = i / n if up else 1 - i / n
        fc = lo * (hi / lo) ** u
        y[i:i + B] = bp(x[i:i + B], fc * 0.7, min(fc * 1.4, SR * 0.45), 1)
    e = np.sin(np.pi * np.linspace(0, 1, n)) ** 2 if not up else (np.linspace(0, 1, n) ** 2.2)
    return y * e
def impact(big=1.0):
    n = int(2.4 * SR); t = np.arange(n) / SR
    f = 38 + 60 * np.exp(-t * 14)
    boom = np.sin(2 * np.pi * np.cumsum(f) / SR) * np.exp(-t * 2.2)
    air = hp(rng.standard_normal(n), 2500) * np.exp(-t * 6) * 0.12
    return (boom + air) * big
def key_click():
    n = int(0.05 * SR); t = np.arange(n) / SR
    return (hp(rng.standard_normal(n), 2000) * np.exp(-t * 400) * 0.6 + np.sin(2 * np.pi * 1800 * t) * np.exp(-t * 220) * 0.5)

for fr in T['impacts']:
    t = f2s(fr)
    place(sfx, whoosh(0.7, 400, 7000, True), t - 0.7, 0.10)
    place(sfx, impact(0.5 if fr != 720 else 0.9), t, 0.22)
for fr in T['keys']:
    place(sfx, key_click(), f2s(fr), 0.35, 0.1)
a, b = T['ottoTyping']
chars = 29
for k in range(chars):
    t = f2s(a + (b - a) * k / (chars - 1))
    place(sfx, key_click() * 0.6, t + rng.uniform(-0.01, 0.01), 0.18, rng.uniform(-0.2, 0.2))
for k, fr in enumerate(T['montageCuts'][1:]):
    place(sfx, whoosh(0.35, 1500, 9000, False), f2s(fr) - 0.1, 0.06, -0.3 + 0.3 * k)
# Blink: two tiny soft clicks; final shimmer as the tagline lands.
for fr in T['wordmarkBlink']:
    place(sfx, key_click() * 0.5, f2s(fr), 0.12)
sfx = reverb(sfx, 1.8, 0.22, 7000)

# ---------------- master ----------------
end = int(DUR * SR)
def finish(x, fade=1.2):
    x = x[:end].copy(); f = int(fade * SR)
    x[-f:] *= np.linspace(1, 0, f)[:, None] ** 1.5
    x[: int(0.01 * SR)] *= np.linspace(0, 1, int(0.01 * SR))[:, None]
    return x
music, sfx = finish(music), finish(sfx)
mix = music + sfx
peak = np.abs(mix).max()
g = 0.89 / peak
def soft(x): return np.tanh(x * 1.15) / np.tanh(1.15)
def write(name, x):
    y = np.clip(soft(x * g), -1, 1)
    tmp = os.path.join(OUT, '_tmp.wav'); wavfile.write(tmp, SR, y.astype(np.float32))
    os.system(f'ffmpeg -y -loglevel error -i "{tmp}" -c:a pcm_s24le "{os.path.join(OUT, name)}"'); os.remove(tmp)
write('music.wav', music); write('sfx.wav', sfx); write('mix.wav', mix)
print('ok', round(DUR, 2), 's peak', round(float(peak), 3))
