"""Trilha original do Reel "A espera invisível" v2 (25,2 s), sincronizada com espera2.cjs.
Sintetizada por código com numpy: nenhuma amostra, loop ou gravação de terceiros (uso comercial livre).
Uso: python3 -I espera2_sound.py saida.wav

Mapa: 0,0 relógio + golpe (o gestor) · 3,0 golpe (a parede) · 5,4 golpe grave (o fio embaraçado)
      · 7,8 brilho subindo (o fio vira fluxo) · 9,6 impacto + pulso (mapa real) · 13,8 golpe (plano)
      · destaques 10,5 / 11,15 / 15,1 · 17,4 a música recua, o relógio cresce · 19,2 último tique
      · 19,8 o tempo congela: impacto "É a espera." · 21,0 o fluxo volta · 22,0 marca · 22,6 / 23,2 / 23,8 assinatura.
"""
import sys, wave
import numpy as np

SR, T, B = 48000, 25.2, 0.6
N = int(SR * T)
rng = np.random.default_rng(29)
t = np.arange(N) / SR
bus = {k: np.zeros((2, N)) for k in ('mus', 'fx', 'send')}

def lp(x, k): return np.convolve(x, np.ones(k) / k, mode='same')
def add(sig, at, pan=0.0, g=1.0, send=0.0, to='fx'):
    if sig.ndim == 1: sig = np.stack([sig * (1 - max(pan, 0)), sig * (1 + min(pan, 0))])
    i = int(round(at * SR))
    if i < 0: sig = sig[:, -i:]; i = 0
    n = min(sig.shape[1], N - i)
    if n <= 0: return
    bus[to][:, i:i + n] += g * sig[:, :n]; bus['send'][:, i:i + n] += g * send * sig[:, :n]
def curve(pts): return np.interp(t, [p[0] for p in pts], [p[1] for p in pts])

def tick(f=2600, d=0.09, body=1.0):
    n = int(d * SR); x = np.arange(n) / SR; w = rng.standard_normal(n)
    click = (w - lp(w, 3)) * np.exp(-x / 0.0012)
    res = (np.sin(2 * np.pi * f * x) + 0.5 * np.sin(2 * np.pi * f * 1.51 * x)) * np.exp(-x / 0.011) * body
    return 0.5 * click + 0.6 * res + np.sin(2 * np.pi * f * 0.25 * x) * np.exp(-x / 0.02) * 0.4

def tum(f0=44.0, d=1.6):
    n = int(d * SR); x = np.arange(n) / SR
    f = f0 * (1 + 0.5 * np.exp(-x * 14))
    body = np.sin(2 * np.pi * np.cumsum(f) / SR) + 0.25 * np.sin(2 * np.pi * np.cumsum(2 * f) / SR)
    env = np.minimum(x / 0.008, 1) * np.exp(-x / 0.42)
    w = rng.standard_normal(n); thump = lp(w, 120) * np.exp(-x / 0.03) * 2.0
    out = np.tanh(1.4 * (body * env + thump)); out[-int(.1 * SR):] *= np.linspace(1, 0, int(.1 * SR)); return out

def knock(f, d=1.4, bright=1.0):
    n = int(d * SR); x = np.arange(n) / SR; s = np.zeros(n)
    for k in range(1, 30):
        if f * k > 3200: break
        s += (1 / k ** 0.8) * np.exp(-x * (2.2 + k * 1.6 / bright)) * np.sin(2 * np.pi * f * k * (1 + 0.0004 * k * k) * x + k)
    w = rng.standard_normal(n); snap = (lp(w, 10) - lp(w, 60)) * np.exp(-x / 0.02) * 1.2
    out = np.tanh(1.2 * (s * np.minimum(x / 0.004, 1) + snap)); out[-int(.1 * SR):] *= np.linspace(1, 0, int(.1 * SR)); return out

def braam(d, f0, bright=1.0):
    n = int(d * SR); x = np.arange(n) / SR
    b = 0.10 + 0.9 * np.exp(-x / 0.55); sig = np.zeros(n)
    for f, amp, ph in ((f0, 1.0, 0.0), (f0 * 1.0025, 0.7, 1.1), (f0 * 2 * 0.9985, 0.55, 2.3), (f0 * 3, 0.32, 0.7), (f0 * 1.5, 0.28, 1.9)):
        for k in range(1, 24):
            if f * k > 5200: break
            sig += amp / k * np.exp(-(k - 1) / (1.5 + 15 * b * bright)) * np.sin(2 * np.pi * f * k * x + ph * k)
    sig = np.tanh(1.7 * sig)
    drop = np.sin(2 * np.pi * (f0 * 0.95 * x + f0 * 0.7 * (1 - np.exp(-x * 6)) / 6)) * np.exp(-x / (d * 0.3))
    env = np.minimum(x / 0.03, 1) * np.exp(-x / (d * 0.3))
    w = rng.standard_normal(n); crack = lp(w, 60) * np.exp(-x / 0.06) * 3.0 + (w - lp(w, 5)) * np.exp(-x / 0.012) * 0.25
    out = sig * 0.75 * env + drop * 0.42 + crack * 0.35
    out[-int(0.3 * SR):] *= np.linspace(1, 0, int(0.3 * SR)); return out

def riser(d):
    n = int(d * SR); x = np.arange(n) / n; w = rng.standard_normal(n)
    lo, mid, hi = lp(w, 300), lp(w, 40) - lp(w, 300), w - lp(w, 8)
    s = (lo * 2.2 * (1 - 0.6 * x) + mid * 1.6 * x + hi * 0.5 * x ** 3)
    ph = 2 * np.pi * np.cumsum(48 * (4.2 ** x)) / SR
    s = s / np.abs(s).max() * 0.55 + np.sin(ph) * 0.5
    e = x ** 2.3; e[-int(0.02 * SR):] *= np.linspace(1, 0, int(0.02 * SR)); return s * e

def kick():
    n = int(0.45 * SR); x = np.arange(n) / SR
    s = np.sin(2 * np.pi * np.cumsum(43 + 80 * np.exp(-x * 30)) / SR) * np.exp(-x / 0.15)
    w = rng.standard_normal(n); return np.tanh(1.6 * s) + (w - lp(w, 4)) * np.exp(-x / 0.004) * 0.12

def hat(d=0.03):
    n = int(0.12 * SR); x = np.arange(n) / SR; w = rng.standard_normal(n)
    return (w - lp(w, 3)) * np.exp(-x / d) * 2.6

def bass(f, d=0.27, bright=1.0):
    n = int(d * SR); x = np.arange(n) / SR; s = np.zeros(n)
    for k in range(1, 10): s += (1 / k) * np.exp(-x * (k - 1) * 4.5 / bright) * np.sin(2 * np.pi * f * k * x)
    e = np.minimum(x / 0.004, 1) * np.exp(-x / 0.2); e[-int(.012 * SR):] *= np.linspace(1, 0, int(.012 * SR))
    return np.tanh(1.3 * s * e) * 1.4

def pluck(f, d=0.6, bright=1.0):
    n = int(d * SR); x = np.arange(n) / SR; s = np.zeros(n)
    for k in range(1, 13):
        if f * k > 9000: break
        s += (1 / k) * np.exp(-x * (5 + (k - 1) * 9 / bright)) * np.sin(2 * np.pi * f * k * x)
    return s * np.minimum(x / 0.002, 1) * 2.2

def bell(f, d=3.2):
    n = int(d * SR); x = np.arange(n) / SR
    s = (np.sin(2 * np.pi * f * x) * np.exp(-x / 1.1) + 0.5 * np.sin(2 * np.pi * f * 1.003 * x) * np.exp(-x / 1.4)
         + 0.32 * np.sin(2 * np.pi * 2 * f * x) * np.exp(-x / 0.5) + 0.14 * np.sin(2 * np.pi * 3 * f * x) * np.exp(-x / 0.22)
         + 0.05 * np.sin(2 * np.pi * 5.02 * f * x) * np.exp(-x / 0.09))
    s *= np.minimum(x / 0.006, 1); s[-int(.2 * SR):] *= np.linspace(1, 0, int(.2 * SR)); return s

def ping(f, d=0.9):
    n = int(d * SR); x = np.arange(n) / SR
    return (np.sin(2 * np.pi * f * x) + 0.3 * np.sin(2 * np.pi * f * 2.0 * x) * np.exp(-x / 0.05)) * np.exp(-x / 0.18) * np.minimum(x / 0.003, 1)

def pad(freqs, d, a=0.8, r=1.2, bright=1.0, seed=0):
    q = np.random.default_rng(seed); n = int((d + r) * SR); x = np.arange(n) / SR; out = np.zeros((2, n))
    for f in freqs:
        for det in (-.0035, 0.0, .0035):
            for k in range(1, 7):
                if f * k > 6000: break
                amp = (1 / k ** (2.3 / bright)) * (.75 + .25 * np.sin(2 * np.pi * q.uniform(.08, .3) * x + q.uniform(0, 6.28)))
                w = 2 * np.pi * f * (1 + det) * k * x; ph = q.uniform(0, 6.28, 2)
                out[0] += amp * np.sin(w + ph[0]) * (1.0 if det <= 0 else 0.45)
                out[1] += amp * np.sin(w + ph[1]) * (1.0 if det >= 0 else 0.45)
    e = np.minimum(x / a, 1) * np.clip((d + r - x) / r, 0, 1)
    return out * e / (len(freqs) * 1.15)

D1, D2, A2, D3, F3, A3 = 36.71, 73.42, 110.0, 146.83, 174.61, 220.0
Bb1, Bb3, C3, C4, Eb3, F2 = 58.27, 233.08, 130.81, 261.63, 155.56, 87.31
D4, F4, Fs4, A4, Bb4, C5, D5, E5, F5, Fs5, A5 = 293.66, 349.23, 369.99, 440.0, 466.16, 523.25, 587.33, 659.25, 698.46, 739.99, 880.0

# ---------- relógio: marca a espera de 0 a 19,2 s; o tique de 19,8 nunca chega
lv = lambda x: float(np.interp(x, [0, 9.5, 9.6, 17.3, 17.5, 19.2], [1.6, 1.45, .45, .45, 2.0, 2.4]))
k = 0; at = 0.0
while at <= 19.2 + 1e-6:
    add(tick(2650 if k % 2 == 0 else 1980, body=1.0 if k % 2 == 0 else .8), at, pan=(-.12, .12)[k % 2], g=0.30 * lv(at), send=0.18)
    k += 1; at = round(at + B, 3)

# ---------- cama grave contínua
sub = np.sin(2 * np.pi * D1 * t) + 0.5 * np.sin(2 * np.pi * D2 * t + 0.6 * np.sin(2 * np.pi * 0.11 * t))
sub *= 0.33 * curve([(0, 0), (.05, .28), (5.4, .3), (9.5, .36), (9.6, .14), (17.3, .14), (17.5, .3), (19.75, .4), (19.8, 0), (21.0, 0), (21.1, .2), (T, 0)])
bus['mus'] += np.stack([sub, sub])

# ---------- o gestor, a parede, o fio (0–9,6)
add(tum(44, 1.5), 0.0, g=0.45, send=0.3); add(knock(D2, 1.2), 0.0, g=0.32, send=0.35)
add(pad((D3, Eb3, A3), 9.4, a=1.4, r=0.4, bright=0.8, seed=1), 0.05, g=0.30, send=0.4, to='mus')
add(tum(46, 1.4), 3.0, g=0.40, send=0.3); add(knock(F3 / 2, 1.1), 3.0, g=0.22, send=0.35)
add(tum(40, 1.6), 5.4, g=0.44, send=0.35); add(knock(D2 * 0.75, 1.3), 5.4, g=0.2, send=0.4)
add(riser(1.75), 7.85, g=0.30, send=0.3)
for i, f in enumerate((D4, F4, A4, D5, F5, A5)):   # o fio vira fluxo: notas subindo
    add(pluck(f, 0.9, 1.2), 7.8 + i * 0.3, pan=(-.35, .35)[i % 2], g=0.07 + 0.01 * i, send=0.7, to='mus')

# ---------- produto real (9,6–17,4): pulso Rém (mapa) · Si♭ → Fá (plano)
add(braam(2.6, D1, 1.0), 9.6, g=0.5, send=0.45); add(braam(2.0, D2, 1.2), 9.6, g=0.22, send=0.45)
SECS = ((9.6, 4.2, D2, (D3, A3, F4), (D4, A4, D5, F5)), (13.8, 3.6, Bb1 * 2, (D3, F3, Bb3), (D4, Bb4, D5, F5)))
kicks = []
for si, (t0, d, root, chord, arp) in enumerate(SECS):
    add(pad(chord, d, a=0.4, r=0.8, bright=0.95 + 0.2 * si, seed=10 + si), t0, g=0.28, send=0.35, to='mus')
    if si: add(tum(48, 1.3), t0, g=0.36, send=0.3); add(knock(root, 1.1), t0, g=0.2, send=0.35)
    nb = int(round(d / B))
    for b in range(nb): kicks.append(t0 + b * B)
    for e in range(nb * 2): add(bass(root * (2 if e % 4 == 3 else 1), 0.27, 0.8 + 0.3 * si), t0 + e * 0.3, g=0.22, to='mus')
    for s in range(nb * 4):
        kk = (si * 28 + s) / 52.0
        add(pluck(arp[(0, 1, 2, 3, 2, 1)[s % 6]], 0.5, 0.85 + 0.5 * kk), t0 + s * 0.15, pan=(-.45, .45)[s % 2], g=0.05 + 0.05 * kk, send=0.5, to='mus')
        if s % 2 == 1: add(hat(0.012), t0 + s * 0.15, pan=(.3, -.3)[s % 4 == 1], g=0.022 + 0.02 * kk, send=0.15)
for at, f in ((10.5, A5), (11.15, A5), (15.1, A5)): add(ping(f), at, pan=0.15, g=0.07, send=0.8)

# ---------- o gestor de novo: só o relógio, cada vez mais alto; em 19,8 o tempo congela
add(pad((D3, A3, C4), 2.3, a=0.6, r=0.2, bright=0.8, seed=19), 17.4, g=0.26, send=0.5, to='mus')
add(riser(1.9), 17.85, g=0.16, send=0.3)
add(braam(1.8, D1, 1.25), 19.8, g=0.58, send=0.45); add(knock(D2, 1.4, 1.2), 19.8, g=0.32, send=0.5); add(tum(40, 1.6), 19.8, g=0.45, send=0.35)

# ---------- o fluxo volta e a marca resolve em Ré maior; assinatura Ré–Lá–Fá#
add(pad((D3, A3, Fs4), 1.2, a=0.5, r=0.6, bright=0.9, seed=29), 21.0, g=0.18, send=0.6, to='mus')
add(bell(A4, 2.0), 21.05, pan=.2, g=0.08, send=0.9)
add(pad((D3, A3, Fs4, A4), 2.9, a=0.6, r=1.4, bright=1.05, seed=30), 22.0, g=0.32, send=0.5, to='mus')
add(pad((D2, A2), 2.9, a=0.5, r=1.4, bright=0.9, seed=31), 22.0, g=0.2, send=0.2, to='mus')
add(tum(D1 * 1.2, 1.8), 22.0, g=0.3, send=0.35)
for at, f, pan, g in ((22.6, D4, -.25, .22), (23.2, A4, .25, .22), (23.8, Fs5, 0.0, .25)):
    add(bell(f, 2.4), at, pan=pan, g=g, send=0.9); add(bell(f / 2, 1.8), at, pan=-pan, g=g * 0.35, send=0.5)

# ---------- mixagem
for kt in kicks: add(kick(), kt, g=0.42, send=0.06)
duck = np.zeros(N)
for kt in kicks + [9.6, 13.8, 19.8, 22.0]:
    i = int(kt * SR); n = min(N - i, int(0.5 * SR)); duck[i:i + n] = np.maximum(duck[i:i + n], np.exp(-np.arange(n) / SR / 0.16))
bus['mus'] *= 1 - 0.4 * duck
dip = curve([(0, 1), (9.4, 1), (9.52, .15), (9.598, .15), (9.6, 1), (17.35, 1), (17.4, .7), (19.25, .7), (19.4, 0), (19.798, 0), (19.8, 1), (T, 1)])
bus['mus'] *= dip
L, R = bus['mus'] + bus['fx']
ir_n = int(3.0 * SR); x = np.arange(ir_n) / SR
def ir(seed):
    w = np.random.default_rng(seed).standard_normal(ir_n); w = lp(w, 5) - lp(w, 700)
    return w * np.exp(-x / 0.85) * np.minimum(x / 0.012, 1)
def conv(a, b):
    n = len(a) + len(b) - 1; m = 1 << (n - 1).bit_length()
    return np.fft.irfft(np.fft.rfft(a, m) * np.fft.rfft(b, m), m)[:len(a)]
wl, wr = conv(bus['send'][0], ir(1)), conv(bus['send'][1], ir(2))
kk = 0.4 * max(np.abs(L).max(), np.abs(R).max()) / max(np.abs(wl).max(), np.abs(wr).max())
L = L + wl * kk; R = R + wr * kk
f = np.clip(t / 0.01, 0, 1) * np.clip((T - t) / 1.2, 0, 1) ** 1.5; L *= f; R *= f
pk = max(np.abs(L).max(), np.abs(R).max()); L, R = L / pk, R / pk
drive = 1.7; L, R = np.tanh(drive * L) / np.tanh(drive), np.tanh(drive * R) / np.tanh(drive)
g = 10 ** (-2.5 / 20)
pcm = (np.stack([L, R], 1) * g * 32767).astype('<i2')
w = wave.open(sys.argv[1], 'wb'); w.setnchannels(2); w.setsampwidth(2); w.setframerate(SR); w.writeframes(pcm.tobytes()); w.close()
print('ok', sys.argv[1])
