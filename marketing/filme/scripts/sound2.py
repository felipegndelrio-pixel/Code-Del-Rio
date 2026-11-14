"""Desenho de som do filme v2 — SEM música. Abertura de cinema (subida + impacto grave), teclas na digitação,
passagens de ar, ambiência e impacto final. Tudo sintetizado por código (nenhuma amostra de terceiros).
Uso: python3 -I sound2.py saida.wav"""
import sys, wave
import numpy as np

SR, T = 48000, 56.0
N = int(SR * T)
rng = np.random.default_rng(7)
L = np.zeros(N); R = np.zeros(N); SL = np.zeros(N); SR_ = np.zeros(N)   # seco e envio para reverberação

def lp(x, k): return np.convolve(x, np.ones(k) / k, mode='same')
def add(sig, at, pan=0.0, g=1.0, send=0.0):
    i = int(at * SR)
    if i < 0: sig = sig[-i:]; i = 0
    n = min(len(sig), N - i)
    if n <= 0: return
    l, r = g * (1 - max(pan, 0)), g * (1 + min(pan, 0))
    L[i:i + n] += sig[:n] * l; R[i:i + n] += sig[:n] * r
    SL[i:i + n] += sig[:n] * l * send; SR_[i:i + n] += sig[:n] * r * send

def key(seed):   # toque de tecla (o mesmo da versão anterior)
    r = np.random.default_rng(seed); n = int(0.07 * SR); x = np.arange(n) / SR
    click = r.standard_normal(n) * np.exp(-x * 220); click = click - lp(click, 6)
    body = np.sin(2 * np.pi * (170 + r.uniform(-25, 25)) * x) * np.exp(-x * 70)
    return 0.16 * click + 0.10 * body

def whoosh(d=0.9):
    n = int(d * SR); x = np.arange(n) / n; w = rng.standard_normal(n)
    lo, mid, hi = lp(w, 240), lp(w, 30) - lp(w, 240), lp(w, 6) - lp(w, 30)
    s = lo * (1 - x) * 1.6 + mid * np.sin(np.pi * x) * 1.2 + hi * x * 0.7
    return s / np.abs(s).max() * np.sin(np.pi * x) ** 2

def riser(d):   # subida de tensão: ruído que abre + tom grave subindo
    n = int(d * SR); x = np.arange(n) / n; w = rng.standard_normal(n)
    lo, mid, hi = lp(w, 300), lp(w, 40) - lp(w, 300), w - lp(w, 8)
    s = (lo * 2.2 * (1 - 0.6 * x) + mid * 1.6 * x + hi * 0.5 * x ** 3)
    ph = 2 * np.pi * np.cumsum(48 * (4.2 ** x)) / SR
    tone = np.sin(ph) * (0.7 + 0.3 * np.sin(2 * np.pi * (3 + 9 * x) * x * d))
    s = s / np.abs(s).max() * 0.55 + tone * 0.5
    e = x ** 2.3; e[-int(0.02 * SR):] *= np.linspace(1, 0, int(0.02 * SR))
    return s * e

def braam(d, f0, bright=1.0):   # impacto grave de trailer: metais sintéticos saturados + queda de sub + estalo
    n = int(d * SR); x = np.arange(n) / SR
    b = 0.10 + 0.9 * np.exp(-x / 0.55)
    sig = np.zeros(n)
    for f, amp, ph in ((f0, 1.0, 0.0), (f0 * 1.0025, 0.7, 1.1), (f0 * 2 * 0.9985, 0.55, 2.3), (f0 * 3, 0.32, 0.7), (f0 * 1.5, 0.28, 1.9)):
        for k in range(1, 24):
            if f * k > 5200: break
            sig += amp / k * np.exp(-(k - 1) / (1.5 + 15 * b * bright)) * np.sin(2 * np.pi * f * k * x + ph * k)
    sig = np.tanh(1.7 * sig)
    drop = np.sin(2 * np.pi * (f0 * 0.95 * x + f0 * 0.7 * (1 - np.exp(-x * 6)) / 6)) * np.exp(-x / (d * 0.3))
    env = np.minimum(x / 0.03, 1) * np.exp(-x / (d * 0.3))
    w = rng.standard_normal(n); crack = lp(w, 60) * np.exp(-x / 0.06) * 3.0 + (w - lp(w, 5)) * np.exp(-x / 0.012) * 0.25
    out = sig * 0.55 * env + drop * 0.75 + crack * 0.35
    out[-int(0.3 * SR):] *= np.linspace(1, 0, int(0.3 * SR))
    return out

def ping(f=1318.5):
    n = int(0.9 * SR); x = np.arange(n) / SR
    return (np.sin(2 * np.pi * f * x) + 0.35 * np.sin(2 * np.pi * f * 1.5 * x)) * np.exp(-x / 0.16) * np.minimum(x / 0.004, 1)

def thud():
    n = int(0.7 * SR); x = np.arange(n) / SR
    return np.sin(2 * np.pi * (38 * x + 20 * (1 - np.exp(-x * 9)) / 9)) * np.exp(-x / 0.22)

# ---- ambiência de sala (bem baixa) e tensão na cena dos fios
t = np.arange(N) / SR
room = lp(lp(rng.standard_normal(N), 400), 200); room /= np.abs(room).max()
L += 0.040 * room; R += 0.040 * np.roll(room, 911)
rum = lp(lp(rng.standard_normal(N), 900), 500); rum /= np.abs(rum).max()
e = np.clip((t - 8.2) / 1.5, 0, 1) * np.clip((12.3 - t) / 1.0, 0, 1); L += 0.16 * rum * e; R += 0.16 * np.roll(rum, 1777) * e

# ---- abertura de cinema
add(riser(1.6), 0.15, g=0.26, send=0.25)
for i in range(10): add(key(i), 0.4 + (i + 0.5) * 0.115 + rng.uniform(-.01, .01), rng.uniform(-.3, .3), g=1.7, send=0.2)   # data
add(braam(3.6, 36.71), 1.75, g=0.62, send=0.45)
# ---- passagens
for at, g in ((4.3, .34), (8.3, .34), (11.9, .34), (17.7, .36), (30.9, .36), (37.1, .38), (42.7, .34)):
    w = whoosh(1.0); add(w, at - 0.5, pan=-0.35, g=g, send=0.3); add(np.roll(w, 2400), at - 0.5, pan=0.35, g=g * 0.8, send=0.3)
for at in (21.2, 24.5, 27.8): add(whoosh(0.5), at - 0.25, g=0.18, send=0.2)
add(thud(), 30.95, g=0.45, send=0.2)
for i in range(20): add(key(100 + i), 12.9 + i * 0.22 + rng.uniform(-.02, .02), rng.uniform(-.4, .4), g=1.4, send=0.15)   # commits
for i in range(14): add(key(300 + i), 18.85 + i * 0.09 + rng.uniform(-.012, .012), rng.uniform(-.3, .3), g=1.3, send=0.15)  # assistente
for i in range(9): add(key(500 + i), 43.4 + i * 0.13 + rng.uniform(-.02, .02), rng.uniform(-.3, .3), g=0.95, send=0.15)      # código em inglês
# ---- globo: marcações discretas
add(ping(1046.5), 37.85, pan=0.1, g=0.08, send=0.9); add(ping(1318.5), 40.2, pan=-0.4, g=0.09, send=0.9); add(ping(1568.0), 40.7, pan=0.4, g=0.09, send=0.9)
# ---- fechamento
add(riser(1.5), 47.05, g=0.3, send=0.25)
add(braam(6.6, 32.70, 1.15), 48.55, g=0.72, send=0.5)

# ---- reverberação (sala grande) por convolução
ir_n = int(3.2 * SR); x = np.arange(ir_n) / SR
def ir(seed):
    w = np.random.default_rng(seed).standard_normal(ir_n); w = lp(w, 5) - lp(w, 700)
    return w * np.exp(-x / 0.9) * np.minimum(x / 0.012, 1)
def conv(a, b):
    n = len(a) + len(b) - 1; m = 1 << (n - 1).bit_length()
    return np.fft.irfft(np.fft.rfft(a, m) * np.fft.rfft(b, m), m)[:len(a)]
wl, wr = conv(SL, ir(1)), conv(SR_, ir(2)); k = 0.5 / max(np.abs(wl).max(), np.abs(wr).max())
L += wl * k; R += wr * k

f = np.clip(t / 0.15, 0, 1) * np.clip((T - t) / 1.4, 0, 1); L *= f; R *= f
pk = max(np.abs(L).max(), np.abs(R).max()); L, R = L / pk, R / pk
drive = 1.9; L, R = np.tanh(drive * L) / np.tanh(drive), np.tanh(drive * R) / np.tanh(drive)   # compressão suave
g = 10 ** (-2.5 / 20)
pcm = (np.stack([L, R], 1) * g * 32767).astype('<i2')
w = wave.open(sys.argv[1], 'wb'); w.setnchannels(2); w.setsampwidth(2); w.setframerate(SR); w.writeframes(pcm.tobytes()); w.close()
print('ok')
