"""Trilha ORIGINAL da V2 (sintetizada por código, sem amostras nem licença de terceiros).
Estrutura casada com o corte: impacto grave no 1º quadro → tensão → 'braam' quando o produto entra (D)
→ pulso com acordes enquanto o produto é mostrado → subida → impacto no logo (Tc) → cauda.
Uso: python3 -I music_v2.py SAIDA.wav DURACAO D Tc
"""
import sys, wave
import numpy as np

out, T, D, Tc = sys.argv[1], float(sys.argv[2]), float(sys.argv[3]), float(sys.argv[4])
SR = 48000
t = np.arange(int(T * SR)) / SR
rng = np.random.default_rng(11)
noise = rng.standard_normal(len(t))

def lp(x, k):  # passa-baixa simples por média móvel (k amostras)
    return np.convolve(x, np.ones(k) / k, mode='same')

def env(a, attack, decay):  # envelope a partir do instante a
    x = np.clip(t - a, 0, None)
    return np.where(t >= a, np.minimum(x / max(attack, 1e-4), 1.0) * np.exp(-x / decay), 0.0)

def win(a, b, r=0.5):
    return np.clip((t - (a - r / 2)) / r, 0, 1) * np.clip(((b + r / 2) - t) / r, 0, 1)

def saw(f, n=14, bright=1.0):  # serra aditiva; 'bright' (0..1+) controla quantos harmônicos soam
    y = np.zeros_like(t)
    for k in range(1, n + 1):
        y += np.sin(2 * np.pi * f * k * t + 0.3 * k) / k * np.exp(-(k - 1) * (1.2 - 0.9 * np.clip(bright, 0, 1.2)))
    return y

# 1) Impacto inicial: sub com queda de afinação + ruído grave
ph = np.clip(t, 0, None)
sub0 = np.sin(2 * np.pi * (34 * t + 30 * (1 - np.exp(-t * 6)) / 6)) * np.exp(-t / 1.6)
hit0 = 0.9 * sub0 + 0.25 * lp(noise, 40) * np.exp(-t / 0.25)

# 2) Tensão (0 → D): pad grave em Lá menor + subida de ruído
pad_notes = (55.0, 110.0, 164.81, 220.0, 261.63)
tension = sum(np.sin(2 * np.pi * f * t + i) * (0.10 / (1 + 0.4 * i)) for i, f in enumerate(pad_notes))
tension *= win(0.0, D, 0.6) * (0.4 + 0.6 * np.clip(t / max(D, 0.1), 0, 1))
riser1 = 0.35 * lp(noise, 12) * np.clip((t - (D - 1.6)) / 1.6, 0, 1) ** 2 * (t < D)

# 3) 'Braam' na entrada do produto: serra grave com brilho que abre e fecha
bright = np.clip((t - D) / 0.35, 0, 1) * np.exp(-np.clip(t - D, 0, None) / 1.4)
braam = 0.32 * (saw(55.0, 16, bright) + 0.7 * saw(82.41, 12, bright) + 0.5 * saw(110.0, 10, bright)) * env(D, 0.04, 1.8)

# 4) Groove (D → Tc): pulso que cabe em compassos inteiros até o logo
bars = max(1, round((Tc - D) / 2.4)); beat = (Tc - D) / (bars * 4)
inside = (t >= D) & (t < Tc)
pb = np.mod(t - D, beat)
kick = 0.55 * np.sin(2 * np.pi * (45 + 90 * np.exp(-pb * 40)) * pb) * np.exp(-pb * 9) * inside
hat_ph = np.mod(t - D - beat / 2, beat)
hat = 0.06 * (noise - lp(noise, 6)) * np.exp(-hat_ph * 60) * inside
prog = [(87.31, 130.81, 174.61, 220.0), (130.81, 196.0, 261.63, 329.63), (98.0, 146.83, 196.0, 246.94), (110.0, 164.81, 220.0, 261.63)]
chords = np.zeros_like(t)
bar_len = beat * 4
for j in range(bars):
    a = D + j * bar_len; notes = prog[j % 4]
    w = win(a, a + bar_len, 0.25)
    for i, f in enumerate(notes):
        chords += w * (0.07 / (1 + 0.3 * i)) * (np.sin(2 * np.pi * f * t) + 0.4 * np.sin(2 * np.pi * f * 2.003 * t))
chords *= inside * (0.75 + 0.25 * np.sin(2 * np.pi * t / bar_len))
arp = np.zeros_like(t)
for j in range(bars * 8):   # arpejo suave em colcheias
    a = D + j * beat / 2
    if a >= Tc - 0.2: break
    f = prog[(j // 8) % 4][j % 4] * 4
    arp += 0.035 * np.sin(2 * np.pi * f * t) * env(a, 0.005, 0.22)
riser2 = 0.30 * lp(noise, 10) * np.clip((t - (Tc - 2.0)) / 2.0, 0, 1) ** 2 * (t < Tc)

# 5) Impacto no logo + acorde final de Dó maior
x = np.clip(t - Tc, 0, None)
hit1 = (0.9 * np.sin(2 * np.pi * (36 * x + 28 * (1 - np.exp(-x * 7)) / 7)) * np.exp(-x / 1.8) + 0.3 * lp(noise, 30) * np.exp(-x / 0.3)) * (t >= Tc)
final = sum(np.sin(2 * np.pi * f * t) * (0.09 / (1 + 0.3 * i)) for i, f in enumerate((65.41, 130.81, 196.0, 261.63, 329.63, 392.0))) * env(Tc, 0.08, 3.5)
final += 0.32 * saw(65.41, 12, 0.6) * env(Tc, 0.05, 2.2)

mono = hit0 + tension + riser1 + braam + kick + hat + chords + arp + riser2 + hit1 + final
L = mono + 0.5 * arp * 0.6; R = mono - 0.5 * arp * 0.6 + 0.02 * np.roll(chords, 240)
for d, g in ((0.11, 0.28), (0.23, 0.16), (0.37, 0.09)):   # ambiência
    n = int(d * SR); L[n:] += g * L[:-n].copy() * 0.55; R[n:] += g * R[:-n].copy() * 0.55
fade = np.clip(t / 0.02, 0, 1) * np.clip((T - t) / 1.0, 0, 1)
L *= fade; R *= fade
pk = max(np.abs(L).max(), np.abs(R).max()); L, R = L / pk * 0.89, R / pk * 0.89
pcm = (np.stack([L, R], 1) * 32767).astype('<i2')
with wave.open(out, 'wb') as w:
    w.setnchannels(2); w.setsampwidth(2); w.setframerate(SR); w.writeframes(pcm.tobytes())
print('ok', out, f'compassos={bars} tempo={60 / beat:.1f}BPM')
