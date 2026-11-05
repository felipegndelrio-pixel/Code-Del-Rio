"""v3 final: tema de cinema na abertura → produto com locução; cortes sincronizados às frases; clímax musical no logo.
Uso: python3 build3.py reels|linkedin|teaser-reels|teaser-linkedin
"""
import argparse, os, json, subprocess

S = '/tmp/claude-0/-home-user-Code-Del-Rio/ca3f8930-8d23-5266-aa7c-6ab84d5ae042/scratchpad'
F = f'{S}/final'; OV = f'{F}/ov'; K = f'{S}/kit-video-nexoprocess-v1'; AI = f'{F}/audio-in'
UP = '/root/.claude/uploads/ca3f8930-8d23-5266-aa7c-6ab84d5ae042'
C1 = f'{UP}/ab181934-Generated_Video_November_05_2026_-_8_16AM_2.mp4'
C2 = f'{UP}/711701b7-Generated_Video_November_05_2026_-_8_16AM.mp4'
VOZ, MUS = f'{AI}/a1.mp3', f'{AI}/a2.mp3'
SEGV = json.load(open(f'{AI}/segs.json'))           # 7 frases (início, fim) na locução
XF, GAP, LEAD = 0.3, 0.5, 0.25
D = 8.8                                              # instante em que o produto entra (= "drop" da música)
G0, BAR, BOOM = 10.83, 2.4, 2.0                      # início do groove, compasso (100 BPM), impacto inicial da música
VENC = ['-c:v', 'libx264', '-preset', 'slow', '-crf', '19', '-pix_fmt', 'yuv420p', '-r', '30']
LINES = ['Com o NexoProcess, você responde perguntas simples sobre o seu processo.',
         'E ele vira um mapa visual, com gargalos e retrabalho destacados.',
         'O diagnóstico mostra tempo, esforço e custo, com a fórmula à vista.',
         'Cada sugestão traz a evidência e a hipótese a validar.',
         'Compare o hoje com o futuro, lado a lado.',
         'E tudo vira um plano de ação, com responsável e prazo.',
         'NexoProcess. Do processo na planilha ao plano de melhoria.']
KEYS = ['ass', 'mapa', 'diag', 'sug', 'comp', 'plano', 'marca']
L = dict(zip(KEYS, SEGV)); LI = dict(zip(KEYS, range(7)))

ap = argparse.ArgumentParser(); ap.add_argument('fmt', choices=['reels', 'linkedin', 'teaser-reels', 'teaser-linkedin'])
a = ap.parse_args()
R = a.fmt.endswith('reels'); TEASER = a.fmt.startswith('teaser')
W, H = (1080, 1920) if R else (1920, 1080)
p = 'reels' if R else 'li'
clip = lambda n: f'{K}/clipes/{"9x16" if R else "16x9"}-{n}'
ln = lambda k: L[k][1] - L[k][0] + GAP

def run(cmd):
    r = subprocess.run(cmd, capture_output=True, text=True)
    if r.returncode: raise SystemExit(r.stderr[-3500:])

# ---------- roteiro de cenas: (tipo, fonte, início, duração, legendas, selo, chave_da_voz)
intro = [('ai', C1, 0, 4.0, [('r1', 0.15, 2.1), ('r2', 2.1, 4.0)], False, None),
         ('ai', C2, 4.6, 5.4, [('r3', 0.5, 5.4)], False, None)]
mapa_clip = clip('A-mapa-macro-travelling.mp4' if R else 'A-mapa-macro.mp4')
def prod(hold=0.0):
    P = [('ui', clip('H-assistente.mp4'), 0, ln('ass'), [('r10', 0.2, ln('ass'))], False, 'ass'),
         ('ui', mapa_clip, 0, ln('mapa'), [('r4', 0.2, ln('mapa'))], True, 'mapa'),
         ('ui', clip('C-diagnostico.mp4'), 0, ln('diag'), [('r6', 0.2, ln('diag'))], not R, 'diag'),
         ('ui', clip('D-recomendacoes.mp4'), 0, ln('sug'), [('r7', 0.2, ln('sug'))], False, 'sug')]
    if not R: P.append(('ui', clip('E-comparar.mp4'), 0, ln('comp'), [('r9', 0.2, ln('comp'))], False, 'comp'))
    P.append(('ui', clip('F-plano.mp4'), 0, ln('plano') + hold, [('r8', 0.2, ln('plano') + hold)], False, 'plano'))
    return P
endcard = lambda: ('end', f'{K}/encerramento/encerramento-{"9x16" if R else "16x9"}.mp4', 0, ln('marca') + 0.8, [], False, 'marca')

def timeline(seg):
    starts, acc = [], 0.0
    for s in seg: starts.append(acc); acc += s[3] - XF
    return starts, acc + XF

# ---------- escolhe quantos compassos repetir (m) e a folga (hold) para o clímax musical cair no logo
if not TEASER:
    best = None
    for m in range(0, 8):
        for hold in (0, 0.25, 0.5, 0.75, 1.0):
            seg = intro + prod(hold) + [endcard()]
            st, _ = timeline(seg); Tc = st[-1]
            f = (Tc - D) / ((8 + m) * BAR)
            if 0.97 <= f <= 1.03:
                sc = abs(f - 1) * 10 + hold * 0.5
                if best is None or sc < best[0]: best = (sc, m, hold, f)
    if best is None: raise SystemExit('não achei m/hold')
    _, M, HOLD, FACT = best
    SEG = intro + prod(HOLD) + [endcard()]
else:
    M = HOLD = FACT = 0
    SEG = [('ai', C1, 0, 3.5, [('r1', 0.15, 3.5)], False, None), ('ai', C2, 5.0, 4.5, [('r3', 0.4, 4.5)], False, None),
           ('ui', mapa_clip, 0, 3.5, [('r4', 0.2, 3.5)], R, None), endcard()]
starts, total = timeline(SEG)
Tc = starts[-1]

# ---------- vídeo
tmp = f'{F}/tmp3-{a.fmt}'; os.makedirs(tmp, exist_ok=True)
REUSE = bool(os.environ.get('REUSE')) and os.path.exists(f'{tmp}/video.mp4')
segs = []
for i, (kind, src, ss, d, caps, selo, _) in enumerate(SEG):
    inp = ['-ss', str(ss), '-i', src]
    if kind == 'ai' and R:
        fc = [f'[0:v]fps=30,split[a][b];[a]scale=-2:{H},crop={W}:{H},boxblur=40:3,eq=brightness=-0.10:saturation=0.85[bg];'
              f'[b]scale={W}:-2:flags=lanczos,unsharp=5:5:0.7,noise=alls=6:allf=t[fg];[bg][fg]overlay=(W-w)/2:(H-h)/2-40[v0]']
    elif kind == 'ai':
        fc = [f'[0:v]fps=30,scale={W}:{H}:flags=lanczos,unsharp=5:5:0.8,noise=alls=7:allf=t[v0]']
    else:
        fc = [f'[0:v]fps=30,scale={W}:{H},setsar=1,tpad=stop_mode=clone:stop_duration=5[v0]']
    last, n = 'v0', 1
    for c, s0, s1 in caps + ([('selo', 0, d + 1)] if selo else []):
        inp += ['-loop', '1', '-t', str(d), '-i', f'{OV}/{p}-{c}.png']
        fades = f'fade=in:st={s0}:d=0.3:alpha=1' if c != 'selo' or not SEG[i - 1][5] else 'null'
        if c != 'selo' and s1 < d: fades += f',fade=out:st={s1 - 0.25}:d=0.25:alpha=1'
        fc.append(f'[{n}:v]format=rgba,{fades}[o{n}];[{last}][o{n}]overlay=0:0:format=auto[v{n}]')
        last, n = f'v{n}', n + 1
    fc.append(f'[{last}]format=yuv420p,setsar=1[out]')
    o = f'{tmp}/seg{i}.mp4'
    if not REUSE: run(['ffmpeg', '-y', '-loglevel', 'error', *inp, '-filter_complex', ';'.join(fc), '-map', '[out]', '-t', f'{d:.3f}', *VENC, '-an', o])
    segs.append(o)
ins = sum((['-i', s] for s in segs), [])
fc, prev = [], '0:v'
for k in range(1, len(segs)):
    fc.append(f'[{prev}][{k}:v]xfade=transition=fade:duration={XF}:offset={starts[k]:.3f}[x{k}]'); prev = f'x{k}'
video = f'{tmp}/video.mp4'
if not REUSE: run(['ffmpeg', '-y', '-loglevel', 'error', *ins, '-filter_complex', ';'.join(fc), '-map', f'[{prev}]', *VENC, '-maxrate', '14M', '-bufsize', '28M', video])

# ---------- música: impacto no 1º quadro, "drop" na entrada do produto, clímax no logo
def bar(i): return (G0 + i * BAR, BAR)
total_a = total
afc, parts, ains = [], [], ['-i', MUS]
def trim(label, s, d, fin=0.008, fout=0.008):
    afc.append(f'[1:a]atrim=start={s:.4f}:duration={d:.4f},asetpts=PTS-STARTPTS,afade=t=in:d={fin},afade=t=out:st={max(d - fout, 0):.4f}:d={fout}[{label}]')
    parts.append(label)
if TEASER:
    # impacto + tensão (0 → 7,4 s), depois a subida final até o clímax e a cauda
    trim('p0', BOOM, 7.4, 0.01, 0.35)
    rise = Tc - 7.4
    trim('p1', G0 + 8 * BAR - rise, rise + 0.0, 0.35, 0.01)
    trim('p2', G0 + 8 * BAR, 40.03 - (G0 + 8 * BAR), 0.01, 0.01)
    afc.append(''.join(f'[{x}]' for x in parts) + f'concat=n={len(parts)}:v=0:a=1[mraw]')
    afc.append(f'[mraw]atrim=0:{total_a:.3f},afade=t=out:st={total_a - 1.8:.3f}:d=1.8,volume=0.9[m]')
else:
    trim('intro', G0 - D, D, 0.01, 0.01)   # 2,03 → 10,83: impacto no 1º quadro, tensão, e o drop cai na entrada do produto
    seq = [0, 1, 2, 3] + [3 if (M - 1 - j) % 2 == 0 else 2 for j in range(M)] + [4, 5, 6, 7]
    gl = []
    for j, b in enumerate(seq):
        s, d = bar(b); trim(f'b{j}', s, d); gl.append(f'b{j}')
    afc.append(''.join(f'[{x}]' for x in gl) + f'concat=n={len(gl)}:v=0:a=1,atempo={1 / FACT:.5f}[groove]')
    trim('outro', G0 + 8 * BAR, 40.03 - (G0 + 8 * BAR), 0.01, 0.01)
    afc.append('[intro][groove][outro]concat=n=3:v=0:a=1[mraw]')
    afc.append(f'[mraw]atrim=0:{total_a:.3f},afade=t=out:st={total_a - 1.8:.3f}:d=1.8,volume=0.9[m]')

# ---------- locução (graves + compressão + leve eco de cinema) e sidechain
voice_keys = [s[6] for s in SEG if s[6]]
for j, key in enumerate(voice_keys):
    s0, s1 = L[key]; t = starts[[s[6] for s in SEG].index(key)] + LEAD; ms = int(t * 1000)
    ains += ['-ss', f'{s0:.3f}', '-t', f'{s1 - s0:.3f}', '-i', VOZ]
    afc.append(f'[{j + 2}:a]aresample=48000,volume=9dB,highpass=f=70,equalizer=f=120:t=q:w=1.2:g=2.5,acompressor=threshold=0.08:ratio=3:attack=8:release=120:makeup=1.5,'
               f'afade=t=in:d=0.03,afade=t=out:st={max(s1 - s0 - 0.08, 0):.3f}:d=0.08,pan=stereo|c0=c0|c1=c0,adelay={ms}|{ms}[v{j}]')
afc.append(''.join(f'[v{j}]' for j in range(len(voice_keys))) + f'amix=inputs={len(voice_keys)}:normalize=0,aecho=0.85:0.6:70|140:0.14|0.07,alimiter=limit=0.89,apad=whole_dur={total:.3f},atrim=0:{total:.3f},asplit[vz][sc]')
afc.append('[m]aresample=48000[m2];[m2][sc]sidechaincompress=threshold=0.012:ratio=7:attack=15:release=500:makeup=1[md]')
afc.append('[md][vz]amix=inputs=2:normalize=0:duration=first,alimiter=limit=0.95[mix]')
afc.append('[mix]loudnorm=I=-14:TP=-1.5:LRA=11,aresample=48000[aout]')
name = f'nexoprocess-{"teaser-" if TEASER else ""}{"reels-9x16" if R else "linkedin-16x9"}-v3.mp4'
final = f'{F}/{name}'
run(['ffmpeg', '-y', '-loglevel', 'error', '-i', video, *ains, '-filter_complex', ';'.join(afc), '-map', '0:v', '-map', '[aout]',
     '-c:v', 'copy', '-c:a', 'aac', '-b:a', '192k', '-movflags', '+faststart', '-t', f'{total:.3f}', final])

run(['ffmpeg','-y','-loglevel','error','-i',final,'-vn','-c:a','copy',final.replace('.mp4','-AUDIO.m4a')])
# ---------- legenda (SRT) com a fala completa, para LinkedIn/YouTube
if not TEASER and not R:
    def ts(x): h, r = divmod(x, 3600); m, s = divmod(r, 60); return f'{int(h):02d}:{int(m):02d}:{int(s):02d},{int((s % 1) * 1000):03d}'
    out = []
    for n_, key in enumerate(voice_keys, 1):
        t0 = starts[[s[6] for s in SEG].index(key)] + LEAD; d = L[key][1] - L[key][0]
        out.append(f'{n_}\n{ts(t0)} --> {ts(t0 + d)}\n{LINES[LI[key]]}\n')
    open(final.replace('.mp4', '.srt'), 'w', encoding='utf-8').write('\n'.join(out))
print(json.dumps({'arquivo': final, 'duracao_s': round(total, 2), 'logo_em_s': round(Tc, 2), 'compassos_extra': M, 'folga_s': HOLD, 'fator': round(FACT, 4)}))
