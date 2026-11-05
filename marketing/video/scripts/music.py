"""Trilha original sintetizada (sem licença de terceiros): pad cinematográfico + pulso 100 BPM + sino + impacto final.
Uso: python3 music.py SAIDA.wav DURACAO_S INICIO_UI_S
"""
import sys, wave
import numpy as np

out, T, ui = sys.argv[1], float(sys.argv[2]), float(sys.argv[3])
SR = 44100
t = np.arange(int(T * SR)) / SR
end_hit = T - 4.0

def win(a, b, r=0.6):
    return np.clip((t - (a - r / 2)) / r, 0, 1) * np.clip(((b + r / 2) - t) / r, 0, 1)

# Progressão: Lá menor (problema) → Fá → Dó → Sol → Dó (resolução no logo)
q = (end_hit - ui) / 3
chords = [
    ((110.0, 164.81, 220.0, 261.63, 329.63), 0, ui),
    ((87.31, 130.81, 174.61, 220.0, 261.63), ui, ui + q),
    ((130.81, 196.0, 261.63, 329.63, 392.0), ui + q, ui + 2 * q),
    ((98.0, 146.83, 196.0, 246.94, 293.66), ui + 2 * q, end_hit),
    ((65.41, 130.81, 196.0, 261.63, 329.63), end_hit, T + 1),
]
L = np.zeros_like(t); R = np.zeros_like(t)
trem = 0.7 + 0.3 * np.sin(2 * np.pi * 0.18 * t)
for notes, a, b in chords:
    w = win(a, b)
    for i, f in enumerate(notes):
        amp = 0.075 / (1 + 0.25 * i)
        L += w * amp * (np.sin(2 * np.pi * f * t) + 0.5 * np.sin(2 * np.pi * f * 1.004 * t + 0.3))
        R += w * amp * (np.sin(2 * np.pi * f * 0.997 * t + 0.7) + 0.5 * np.sin(2 * np.pi * f * 1.002 * t))
L *= trem; R *= trem

# Pulso grave (100 BPM) só depois que o produto aparece
beat = 0.6
ph = np.mod(t - ui, beat)
kick = 0.32 * np.sin(2 * np.pi * (48 + 60 * np.exp(-30 * ph)) * ph) * np.exp(-8 * ph)
kick *= ((t >= ui) & (t < end_hit)).astype(float)
# Sino suave a cada 2 tempos (Lá agudo, consoante com toda a progressão)
ph2 = np.mod(t - ui, 2 * beat)
bell = 0.035 * np.sin(2 * np.pi * 880 * t) * np.exp(-5 * ph2) * ((t >= ui) & (t < end_hit))
# Subida de tensão (riser) antes do logo e impacto final
rng = np.random.default_rng(7)
noise = rng.standard_normal(len(t))
k = np.ones(64) / 64
noise_lp = np.convolve(noise, k, mode='same')
riser = 0.25 * noise_lp * np.clip((t - (end_hit - 2.0)) / 2.0, 0, 1) * (t < end_hit)
th = np.clip(t - end_hit, 0, None)
hit = (0.55 * np.sin(2 * np.pi * 46 * t) * np.exp(-2.2 * th) + 0.25 * noise_lp * np.exp(-7 * th)) * (t >= end_hit)
# Whoosh na entrada do produto
tw = t - (ui - 0.45)
whoosh = 0.22 * noise_lp * np.exp(-((tw - 0.35) ** 2) / 0.02)

L = L + kick + bell + riser + hit + whoosh
R = R + kick + bell * 0.8 + riser + hit + whoosh * 0.9

# "Reverb" simples: ecos atenuados
for d, g in ((0.09, 0.30), (0.17, 0.20), (0.29, 0.12)):
    n = int(d * SR)
    L[n:] += g * L[:-n].copy() * 0.6; R[n:] += g * R[:-n].copy() * 0.6

fade = np.clip(t / 1.5, 0, 1) * np.clip((T - t) / 1.2, 0, 1)
L *= fade; R *= fade
peak = max(np.abs(L).max(), np.abs(R).max())
L, R = L / peak * 0.85, R / peak * 0.85
pcm = (np.stack([L, R], axis=1) * 32767).astype('<i2')
with wave.open(out, 'wb') as wf:
    wf.setnchannels(2); wf.setsampwidth(2); wf.setframerate(SR); wf.writeframes(pcm.tobytes())
print('ok', out, T)
