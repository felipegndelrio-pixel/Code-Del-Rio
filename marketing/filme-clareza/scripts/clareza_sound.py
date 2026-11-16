"""Trilha original do filme "Do caos à clareza" (33,6 s) — eletrônica cinematográfica híbrida.
Ré menor → Ré maior, 100 BPM (1 tempo = 0,6 s). Tudo sintetizado por código com numpy:
nenhuma amostra, loop ou gravação de terceiros (uso comercial livre, obra original deste projeto).
Uso: python3 -I clareza_sound.py saida.wav

Mapa (sincronizado com clareza.cjs):
  0,0  impacto de abertura + motivo incompleto (Ré–Lá–Fá, menor)      · "Todo processo tem uma lógica."
  2,4  tensão: acorde fechado, teclas a cada fragmento, pulso grave    · "Mas nem sempre é fácil enxergar o todo."
  7,2  subida: tudo converge                                           · "É aqui que a clareza começa."
  9,6  impacto + pulso (compassos de 5 tempos: 9,6 / 12,6 / 15,6)      · Mapeamento / Diagnóstico / Plano
 19,2 / 21,6 / 24,0  três golpes graves ("tum")                        · Mapeie. / Diagnostique. / Transforme em ação.
 25,8  impacto final, resolve em Ré maior                              · logo
 29,4 / 30,0 / 30,6  assinatura sonora: Ré–Lá–Fá# (o motivo da abertura, agora completo e maior)
"""
import sys, wave
import numpy as np

SR, T, B = 48000, 33.6, 0.6
N = int(SR * T)
rng = np.random.default_rng(11)
t = np.arange(N) / SR
bus = {k: np.zeros((2, N)) for k in ('mus', 'fx', 'send')}   # mus = cede espaço ao bumbo; fx = impactos; send = reverberação

def lp(x, k): return np.convolve(x, np.ones(k) / k, mode='same')
def add(sig, at, pan=0.0, g=1.0, send=0.0, to='fx'):
    if sig.ndim == 1: sig = np.stack([sig * (1 - max(pan, 0)), sig * (1 + min(pan, 0))])
    i = int(round(at * SR))
    if i < 0: sig = sig[:, -i:]; i = 0
    n = min(sig.shape[1], N - i)
    if n <= 0: return
    bus[to][:, i:i + n] += g * sig[:, :n]; bus['send'][:, i:i + n] += g * send * sig[:, :n]
def curve(pts): return np.interp(t, [p[0] for p in pts], [p[1] for p in pts])

# ---------- instrumentos
def key(seed):   # toque de tecla
    r = np.random.default_rng(seed); n = int(0.07 * SR); x = np.arange(n) / SR
    click = r.standard_normal(n) * np.exp(-x * 220); click = click - lp(click, 6)
    body = np.sin(2 * np.pi * (170 + r.uniform(-25, 25)) * x) * np.exp(-x * 70)
    return (0.16 * click + 0.10 * body) * 1.3

def riser(d):   # subida de tensão
    n = int(d * SR); x = np.arange(n) / n; w = rng.standard_normal(n)
    lo, mid, hi = lp(w, 300), lp(w, 40) - lp(w, 300), w - lp(w, 8)
    s = (lo * 2.2 * (1 - 0.6 * x) + mid * 1.6 * x + hi * 0.5 * x ** 3)
    ph = 2 * np.pi * np.cumsum(48 * (4.2 ** x)) / SR
    tone = np.sin(ph) * (0.7 + 0.3 * np.sin(2 * np.pi * (3 + 9 * x) * x * d))
    s = s / np.abs(s).max() * 0.55 + tone * 0.5
    e = x ** 2.3; e[-int(0.02 * SR):] *= np.linspace(1, 0, int(0.02 * SR))
    return s * e

def braam(d, f0, bright=1.0):   # impacto grave de cinema
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

def tum(f0=44.0, d=1.6):   # golpe grave de passagem
    n = int(d * SR); x = np.arange(n) / SR
    f = f0 * (1 + 0.5 * np.exp(-x * 14))
    body = np.sin(2 * np.pi * np.cumsum(f) / SR) + 0.25 * np.sin(2 * np.pi * np.cumsum(2 * f) / SR)
    env = np.minimum(x / 0.008, 1) * np.exp(-x / 0.42)
    w = rng.standard_normal(n); thump = lp(w, 120) * np.exp(-x / 0.03) * 2.0
    out = np.tanh(1.4 * (body * env + thump)); out[-int(.1 * SR):] *= np.linspace(1, 0, int(.1 * SR)); return out

def knock(f, d=1.4, bright=1.0):   # corpo médio do golpe: mantém o impacto audível em alto-falante pequeno
    n = int(d * SR); x = np.arange(n) / SR; s = np.zeros(n)
    for k in range(1, 30):
        if f * k > 3200: break
        s += (1 / k ** 0.8) * np.exp(-x * (2.2 + k * 1.6 / bright)) * np.sin(2 * np.pi * f * k * (1 + 0.0004 * k * k) * x + k)
    w = rng.standard_normal(n); snap = (lp(w, 10) - lp(w, 60)) * np.exp(-x / 0.02) * 1.2
    out = np.tanh(1.2 * (s * np.minimum(x / 0.004, 1) + snap)); out[-int(.1 * SR):] *= np.linspace(1, 0, int(.1 * SR)); return out

def kick():   # bumbo sub, seco
    n = int(0.45 * SR); x = np.arange(n) / SR
    s = np.sin(2 * np.pi * np.cumsum(43 + 80 * np.exp(-x * 30)) / SR) * np.exp(-x / 0.15)
    w = rng.standard_normal(n); return np.tanh(1.6 * s) + (w - lp(w, 4)) * np.exp(-x / 0.004) * 0.12

def hat(d=0.03):   # pulso agudo curto
    n = int(0.12 * SR); x = np.arange(n) / SR; w = rng.standard_normal(n)
    return (w - lp(w, 3)) * np.exp(-x / d) * 2.6

def bass(f, d=0.27, bright=1.0):   # baixo de sintetizador: filtro que fecha
    n = int(d * SR); x = np.arange(n) / SR; s = np.zeros(n)
    for k in range(1, 10): s += (1 / k) * np.exp(-x * (k - 1) * 4.5 / bright) * np.sin(2 * np.pi * f * k * x)
    e = np.minimum(x / 0.004, 1) * np.exp(-x / 0.2); e[-int(.012 * SR):] *= np.linspace(1, 0, int(.012 * SR))
    return np.tanh(1.3 * s * e) * 1.4

def pluck(f, d=0.6, bright=1.0):   # nota curta do arpejo
    n = int(d * SR); x = np.arange(n) / SR; s = np.zeros(n)
    for k in range(1, 13):
        if f * k > 9000: break
        s += (1 / k) * np.exp(-x * (5 + (k - 1) * 9 / bright)) * np.sin(2 * np.pi * f * k * x)
    return s * np.minimum(x / 0.002, 1) * 2.2

def bell(f, d=3.2):   # nota da assinatura: quente, com cauda longa
    n = int(d * SR); x = np.arange(n) / SR
    s = (np.sin(2 * np.pi * f * x) * np.exp(-x / 1.1) + 0.5 * np.sin(2 * np.pi * f * 1.003 * x) * np.exp(-x / 1.4)
         + 0.32 * np.sin(2 * np.pi * 2 * f * x) * np.exp(-x / 0.5) + 0.14 * np.sin(2 * np.pi * 3 * f * x) * np.exp(-x / 0.22)
         + 0.05 * np.sin(2 * np.pi * 5.02 * f * x) * np.exp(-x / 0.09))
    s *= np.minimum(x / 0.006, 1); s[-int(.2 * SR):] *= np.linspace(1, 0, int(.2 * SR)); return s

def pad(freqs, d, a=0.8, r=1.2, bright=1.0, seed=0):   # cama de acordes, estéreo
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

# ---------- notas
D1, D2, A2, D3, E3, F3, G3, A3 = 36.71, 73.42, 110.0, 146.83, 164.81, 174.61, 196.0, 220.0
Bb1, Bb2, Bb3, C3, C4, Eb3, F2, G1, G2, A1 = 58.27, 116.54, 233.08, 130.81, 261.63, 155.56, 87.31, 49.0, 98.0, 55.0
D4, E4, F4, Fs4, G4, A4, Bb4, C5, D5, E5, F5, Fs5, G5, A5, D6 = 293.66, 329.63, 349.23, 369.99, 392.0, 440.0, 466.16, 523.25, 587.33, 659.25, 698.46, 739.99, 783.99, 880.0, 1174.66

# ---------- 0. camada contínua: sub e ar
sub = np.sin(2 * np.pi * D1 * t) + 0.5 * np.sin(2 * np.pi * D2 * t + 0.6 * np.sin(2 * np.pi * 0.11 * t))
sub *= 0.35 * curve([(0, 0), (.4, .30), (2.4, .26), (7.2, .34), (9.5, .42), (9.6, .16), (18.6, .16), (19.2, .22), (25.7, .30), (25.8, .30), (30.5, .24), (33.6, 0)])
bus['mus'] += np.stack([sub, sub])
air = lp(rng.standard_normal(N), 14) - lp(rng.standard_normal(N), 260); air /= np.abs(air).max()
ae = curve([(0, 0), (1, .030), (7.2, .045), (9.5, .07), (9.6, .025), (25.7, .04), (25.8, .05), (33.6, 0)])
bus['mus'] += np.stack([air * ae, np.roll(air, 1733) * ae])

# ---------- 1. abertura (0–2,4): impacto e pontos de luz — motivo incompleto, em menor
add(braam(3.4, D1, 0.85), 0.05, g=0.52, send=0.45); add(braam(2.6, D2, 1.1), 0.05, g=0.24, send=0.45)
for at, f, pan in ((0.6, D5, -.3), (1.2, A5, .3), (1.8, F5, 0.0)):
    add(bell(f, 2.4), at, pan=pan, g=0.12, send=1.0)

# ---------- 2. tensão (2,4–7,2): acorde fechado, uma tecla por fragmento, pulso grave
add(tum(44, 1.4), 2.4, g=0.34, send=0.35); add(knock(D2, 1.2), 2.4, g=0.2, send=0.4)
add(pad((D3, Eb3, A3), 3.9, a=1.6, r=1.2, bright=0.8, seed=1), 2.4, g=0.34, send=0.35, to='mus')
add(pad((D4, Eb3 * 2, Bb4), 2.6, a=1.8, r=0.5, bright=0.7, seed=2), 4.5, g=0.16, send=0.5, to='mus')
for i in range(9): add(key(40 + i), 2.5 + i * 0.24, pan=(-.5, .5, -.2, .3, -.4, .15, .45, -.3, 0)[i], g=1.5, send=0.35)
for at in (3.6, 4.8, 6.0): add(tum(40, 0.9), at, g=0.2, send=0.3)
for i in range(8):   # pulso de colcheias que cresce
    add(hat(0.016), 4.8 + i * 0.3, pan=(-.35, .35)[i % 2], g=0.022 + 0.004 * i, send=0.4)

# ---------- 3. convergência (7,2–9,6)
add(tum(46, 1.5), 7.2, g=0.4, send=0.35); add(knock(D2, 1.2), 7.2, g=0.22, send=0.4)
add(pad((D3, G3, A3, D4), 1.9, a=1.2, r=0.4, bright=1.1, seed=3), 7.2, g=0.3, send=0.4, to='mus')
add(riser(2.25), 7.33, g=0.30, send=0.3)
at = 7.5; step = 0.30; i = 0
while at < 9.5:   # teclas acelerando: os pontos se encontram
    add(key(70 + i), at, pan=rng.uniform(-.5, .5), g=1.1 + 0.25 * i / 10, send=0.25); at += step; step = max(0.055, step * 0.86); i += 1

# ---------- 4. produto (9,6–18,6): três compassos de 5 tempos — Rém · Si♭ · Fá
add(braam(3.0, D1, 1.0), 9.6, g=0.56, send=0.45); add(braam(2.4, D2, 1.2), 9.6, g=0.26, send=0.45)
BARS = ((9.6, D2, (D3, A3, F4), (D4, A4, D5, F5)), (12.6, Bb1, (D3, F3, Bb3), (D4, Bb4, D5, F5)), (15.6, F2 / 2, (C3, F3, A3, C4), (C4, A4, C5, F5)))
kicks = []
for bi, (t0, root, chord, arp) in enumerate(BARS):
    add(pad(chord, 3.0, a=0.5, r=0.9, bright=0.9 + 0.2 * bi, seed=10 + bi), t0, g=0.30, send=0.35, to='mus')
    r2 = root * 2 if root < 50 else root
    if bi: add(tum(46 + 2 * bi, 1.3), t0, g=0.36, send=0.35); add(knock(r2, 1.2), t0, g=0.22, send=0.4)
    for e in range(10):   # baixo em colcheias, acentos 3+2
        f = r2 * (2 if e in (3, 6) else 1.5 if e == 9 else 1)
        add(bass(f, 0.27, 0.7 + 0.35 * bi), t0 + e * 0.3, g=0.26 * (1.15 if e in (0, 6) else 1), to='mus')
    for b in ((3,), (0, 3), (0, 1, 2, 3, 4))[bi]: kicks.append(t0 + b * B)
    if not bi:   # 1º plano: arpejo em colcheias, discreto
        for s in range(10): add(pluck(arp[(0, 1, 2, 1)[s % 4]], 0.6, 0.7), t0 + s * 0.3, pan=(-.4, .4)[s % 2], g=0.05, send=0.55, to='mus')
    if bi:   # arpejo em semicolcheias e pulsos agudos entram a partir do 2º plano
        for s in range(20):
            add(pluck(arp[(0, 1, 2, 3, 2, 1)[s % 6]] * (2 if bi == 2 and s % 6 == 3 else 1), 0.5, 0.8 + 0.5 * bi), t0 + s * 0.15, pan=(-.45, .45)[s % 2], g=0.055 + 0.03 * bi, send=0.5, to='mus')
            add(hat(0.012 if s % 4 != 2 else 0.035), t0 + s * 0.15, pan=(.3, -.3)[s % 2], g=0.016 + 0.012 * bi + (0.012 if s % 4 == 2 else 0), send=0.15)

# ---------- 5. três palavras (18,6–25,8): Solm · Si♭ · Lá(sus) — a música recua e cada palavra ganha um golpe
SEG = ((19.2, 2.4, G1, (G2, D3, Bb3), (D4, Bb4, D5, G5), 44), (21.6, 2.4, Bb1, (Bb2, F3, D4), (F4, Bb4, D5, F5), 47), (24.0, 1.8, A1, (A2, D3, E3, A3), (E4, A4, D5, E5), 50))
add(pad((C3, F3, A3), 0.5, a=0.2, r=0.5, bright=0.8, seed=19), 18.6, g=0.2, send=0.4, to='mus')
for e in range(2): add(bass(F2, 0.27, 0.7), 18.6 + e * 0.3, g=0.2, to='mus')
for si, (t0, d, root, chord, arp, tf) in enumerate(SEG):
    add(tum(tf, 1.8), t0, g=0.58, send=0.4); add(knock(root * 2, 1.6, 1.2), t0, g=0.3, send=0.45)
    add(pad(chord, d, a=0.35, r=0.8, bright=1.0 + 0.15 * si, seed=20 + si), t0, g=0.30, send=0.4, to='mus')
    ne = int(round(d / 0.3))
    for e in range(ne): add(bass(root * 2 * (2 if e % 4 == 3 else 1), 0.27, 0.75 + 0.25 * si), t0 + e * 0.3, g=0.2 + 0.03 * si, to='mus')
    for s in range(ne * 2):
        k = (si * 16 + s) / 44.0   # 0→1 ao longo da seção: cresce até o impacto
        add(pluck(arp[(0, 1, 2, 3, 2, 1)[s % 6]], 0.5, 0.9 + 0.8 * k), t0 + s * 0.15, pan=(-.45, .45)[s % 2], g=0.05 + 0.08 * k, send=0.5, to='mus')
        if si == 2 or s % 2 == 0: add(hat(0.012), t0 + s * 0.15, pan=(.3, -.3)[s % 2], g=0.015 + 0.04 * k, send=0.15)
add(riser(1.5), 24.28, g=0.34, send=0.3)

# ---------- 6. fechamento (25,8–33,6): Ré maior e assinatura
add(braam(6.2, D1, 1.15), 25.8, g=0.66, send=0.5); add(braam(4.5, D2, 1.3), 25.8, g=0.3, send=0.5)
add(pad((D3, A3, Fs4, A4), 5.3, a=0.9, r=2.4, bright=1.05, seed=30), 25.85, g=0.36, send=0.5, to='mus')
add(pad((D2, A2), 5.3, a=0.6, r=2.4, bright=0.9, seed=31), 25.85, g=0.22, send=0.2, to='mus')
add(pad((D5, Fs5, A5), 4.6, a=1.6, r=2.6, bright=0.7, seed=32), 26.2, g=0.11, send=0.7, to='mus')   # luz
for e in range(10): add(bass(D2, 0.27, 0.8), 26.4 + e * 0.3, g=0.16 * (1 - e / 11), to='mus')   # o pulso se desfaz
for at, f, pan, g in ((29.4, D4, -.25, .22), (30.0, A4, .25, .22), (30.6, Fs5, 0.0, .25)):   # assinatura sonora: Ré–Lá–Fá#
    add(bell(f, 3.0), at, pan=pan, g=g, send=0.9)
    add(bell(f / 2, 2.2), at, pan=-pan, g=g * 0.35, send=0.5)
add(tum(D1 * 1.0, 2.2), 30.6, g=0.22, send=0.3)

# ---------- mixagem
for k in kicks: add(kick(), k, g=0.5, send=0.08)
duck = np.zeros(N)
for k in kicks + [9.6, 12.6, 15.6, 19.2, 21.6, 24.0, 25.8]:
    i = int(k * SR); n = min(N - i, int(0.5 * SR)); duck[i:i + n] = np.maximum(duck[i:i + n], np.exp(-np.arange(n) / SR / 0.16))
bus['mus'] *= 1 - 0.42 * duck                               # a música respira com o bumbo e os golpes
dip = curve([(0, 1), (9.40, 1), (9.55, .12), (9.598, .12), (9.6, 1), (25.60, 1), (25.74, .1), (25.798, .1), (25.8, 1), (T, 1)])
bus['mus'] *= dip                                           # respiro antes de cada impacto
L, R = bus['mus'] + bus['fx']

ir_n = int(3.4 * SR); x = np.arange(ir_n) / SR
def ir(seed):
    w = np.random.default_rng(seed).standard_normal(ir_n); w = lp(w, 5) - lp(w, 700)
    return w * np.exp(-x / 0.95) * np.minimum(x / 0.012, 1)
def conv(a, b):
    n = len(a) + len(b) - 1; m = 1 << (n - 1).bit_length()
    return np.fft.irfft(np.fft.rfft(a, m) * np.fft.rfft(b, m), m)[:len(a)]
wl, wr = conv(bus['send'][0], ir(1)), conv(bus['send'][1], ir(2))
k = 0.42 * max(np.abs(L).max(), np.abs(R).max()) / max(np.abs(wl).max(), np.abs(wr).max())
L = L + wl * k; R = R + wr * k

f = np.clip(t / 0.04, 0, 1) * np.clip((T - t) / 1.6, 0, 1) ** 1.5; L *= f; R *= f
pk = max(np.abs(L).max(), np.abs(R).max()); L, R = L / pk, R / pk
drive = 1.7; L, R = np.tanh(drive * L) / np.tanh(drive), np.tanh(drive * R) / np.tanh(drive)   # compressão suave
g = 10 ** (-2.5 / 20)
pcm = (np.stack([L, R], 1) * g * 32767).astype('<i2')
w = wave.open(sys.argv[1], 'wb'); w.setnchannels(2); w.setsampwidth(2); w.setframerate(SR); w.writeframes(pcm.tobytes()); w.close()
print('ok', sys.argv[1])
