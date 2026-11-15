"""Som do teaser (18 s): efeito de cinema da gravação enviada pelo titular (work/rec2.wav) na abertura, no globo e na capa,
teclas na data e nos commits, 'tum' grave nos cortes. Uso: python3 -I teaser_sound.py saida.wav"""
import sys, wave, numpy as np
SR, T = 48000, 18.0; N = int(SR * T); rng = np.random.default_rng(7)
L = np.zeros(N); R = np.zeros(N)
def lp(x, k): return np.convolve(x, np.ones(k) / k, mode='same')
def add(sig, at, g=1.0, pan=0.0):
    if sig.ndim == 1: sig = np.stack([sig * (1 - max(pan, 0)), sig * (1 + min(pan, 0))], 1)
    i = int(at * SR); n = min(len(sig), N - i)
    if n > 0: L[i:i + n] += sig[:n, 0] * g; R[i:i + n] += sig[:n, 1] * g
w = wave.open('/home/user/Code-Del-Rio/marketing/filme/work/rec2.wav'); fx = np.frombuffer(w.readframes(w.getnframes()), '<i2').reshape(-1, 2).astype(float) / 32768
fx = fx[:int(5.6 * SR)].copy(); fx[:int(.03 * SR)] *= np.linspace(0, 1, int(.03 * SR))[:, None]; fx[-int(.4 * SR):] *= np.linspace(1, 0, int(.4 * SR))[:, None]
def cut(d):
    x = fx[:int(d * SR)].copy(); x[-int(.5 * SR):] *= np.linspace(1, 0, int(.5 * SR))[:, None]; return x
def key(seed):
    r = np.random.default_rng(seed); n = int(0.07 * SR); x = np.arange(n) / SR
    c = r.standard_normal(n) * np.exp(-x * 220); c = c - lp(c, 6)
    return 0.16 * c + 0.10 * np.sin(2 * np.pi * (170 + r.uniform(-25, 25)) * x) * np.exp(-x * 70)
def tum(f0=44.0, d=1.6):
    n = int(d * SR); x = np.arange(n) / SR; f = f0 * (1 + 0.5 * np.exp(-x * 14))
    b = np.sin(2 * np.pi * np.cumsum(f) / SR) + 0.25 * np.sin(2 * np.pi * np.cumsum(2 * f) / SR)
    o = np.tanh(1.4 * (b * np.minimum(x / 0.008, 1) * np.exp(-x / 0.42) + lp(rng.standard_normal(n), 120) * np.exp(-x / 0.03) * 2)); o[-int(.1 * SR):] *= np.linspace(1, 0, int(.1 * SR)); return o
for i in range(10): add(key(i), 0.4 + (i + 0.5) * 0.115, 1.7, rng.uniform(-.3, .3))
add(cut(4.4), 1.75, 0.9)                       # abertura: efeito de cinema quando a data se completa
add(tum(46), 3.2, .5); add(tum(42), 6.2, .5)
for i in range(13): add(key(100 + i), 6.5 + i * 0.22, 1.3, rng.uniform(-.4, .4))
add(cut(4.0), 9.6, 0.6)                        # globo
add(fx, 13.6, 1.0)                             # capa final
t = np.arange(N) / SR; f = np.clip(t / .1, 0, 1) * np.clip((T - t) / 1.0, 0, 1); L *= f; R *= f
pk = max(np.abs(L).max(), np.abs(R).max()); g = 10 ** (-2.5 / 20) / pk
o = wave.open(sys.argv[1], 'wb'); o.setnchannels(2); o.setsampwidth(2); o.setframerate(SR); o.writeframes((np.stack([L, R], 1) * g * 32767).astype('<i2').tobytes()); o.close(); print('ok')
