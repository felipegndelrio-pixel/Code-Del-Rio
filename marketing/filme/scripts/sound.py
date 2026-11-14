"""Desenho de som do filme (SEM música): ambiência de sala, teclas, passagens de ar e dois impactos graves.
Tudo sintetizado por código (sem amostras de terceiros). Uso: python3 -I sound.py saida.wav"""
import sys, wave, numpy as np
SR, T = 48000, 48.0
t = np.arange(int(SR * T)) / SR
rng = np.random.default_rng(7)
def lp(x, k): return np.convolve(x, np.ones(k) / k, mode='same')
noise = rng.standard_normal(len(t))
L = np.zeros_like(t); R = np.zeros_like(t)
# ambiência de sala (ruído grave bem baixo)
room = lp(lp(noise, 400), 200); room /= np.abs(room).max(); L += 0.035 * room; R += 0.035 * np.roll(room, 911)
def add(sig, at, pan=0.0):
    i = int(at * SR); n = min(len(sig), len(t) - i)
    if n <= 0: return
    L[i:i + n] += sig[:n] * (1 - max(pan, 0)); R[i:i + n] += sig[:n] * (1 + min(pan, 0))
def key(seed):   # toque de tecla: clique curto + corpo
    r = np.random.default_rng(seed); n = int(0.07 * SR); x = np.arange(n) / SR
    click = r.standard_normal(n) * np.exp(-x * 220); click = click - lp(click, 6)
    body = np.sin(2 * np.pi * (170 + r.uniform(-25, 25)) * x) * np.exp(-x * 70)
    return 0.16 * click + 0.10 * body
def whoosh(d=0.9):   # passagem de ar
    n = int(d * SR); x = np.arange(n) / n; w = rng.standard_normal(n); w = lp(w, 30) - lp(w, 300)
    return 0.9 * w / np.abs(w).max() * np.sin(np.pi * x) ** 2
def hit(d=4.0, f0=38):   # impacto grave com cauda
    n = int(d * SR); x = np.arange(n) / SR
    s = np.sin(2 * np.pi * (f0 * x + 22 * (1 - np.exp(-x * 7)) / 7)) * np.exp(-x / 1.3)
    th = lp(rng.standard_normal(n), 40) * np.exp(-x / 0.18)
    return 0.8 * s + 0.25 * th / np.abs(th).max()
add(0.5 * hit(2.5, 34), 0.25)
for i in range(10): add(key(i), 0.7 + i * 0.11 + rng.uniform(-.012, .012), rng.uniform(-.3, .3))      # data digitada
for i in range(20): add(0.8 * key(100 + i), 9.9 + i * 0.22 + rng.uniform(-.02, .02), rng.uniform(-.4, .4))  # commits
for at in (3.9, 8.9, 14.9, 27.7, 33.7): add(0.22 * whoosh(), at - 0.45)
for i in range(12): add(0.7 * key(300 + i), 15.75 + i * 0.11 + rng.uniform(-.015, .015), rng.uniform(-.3, .3))   # digitação no assistente
for at in (18.2, 21.4, 24.6): add(0.12 * whoosh(0.5), at - 0.25)
add(0.25 * whoosh(1.4), 40.4); add(hit(5.5, 36), 41.4)
f = np.clip(t / 0.3, 0, 1) * np.clip((T - t) / 1.2, 0, 1); L *= f; R *= f
pk = max(np.abs(L).max(), np.abs(R).max()); g = 10 ** (-3 / 20) / pk
pcm = (np.stack([L, R], 1) * g * 32767).astype('<i2')
w = wave.open(sys.argv[1], 'wb'); w.setnchannels(2); w.setsampwidth(2); w.setframerate(SR); w.writeframes(pcm.tobytes()); w.close(); print('ok')
