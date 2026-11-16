"""Mede a trilha por seção e por faixa de frequência (dB RMS). Uso: python3 -I analisa_trilha.py trilha.wav"""
import sys, wave
import numpy as np
w = wave.open(sys.argv[1]); sr = w.getframerate(); x = np.frombuffer(w.readframes(w.getnframes()), '<i2').reshape(-1, 2).mean(1) / 32768
SEC = [('abertura', 0, 2.4), ('tensão', 2.4, 7.2), ('converg.', 7.2, 9.6), ('produto1', 9.6, 12.6), ('produto2', 12.6, 15.6), ('produto3', 15.6, 18.6), ('palavras', 18.6, 25.8), ('logo', 25.8, 29.4), ('assinat.', 29.4, 33.6)]
BANDS = [(20, 120), (120, 500), (500, 2000), (2000, 8000), (8000, 20000)]
print('seção      total ' + ' '.join(f'{a}-{b}'.rjust(10) for a, b in BANDS))
for name, a, b in SEC:
    s = x[int(a * sr):int(b * sr)]; S = np.abs(np.fft.rfft(s * np.hanning(len(s)))) ** 2; f = np.fft.rfftfreq(len(s), 1 / sr)
    tot = 10 * np.log10(np.mean(s ** 2) + 1e-12)
    bl = [10 * np.log10(S[(f >= lo) & (f < hi)].sum() / S.sum() + 1e-12) for lo, hi in BANDS]
    print(f'{name:9s} {tot:6.1f} ' + ' '.join(f'{v:10.1f}' for v in bl))
