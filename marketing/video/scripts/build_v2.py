"""NexoProcess — Vídeo V2. Montagem reproduzível (FFmpeg) dos 3 formatos a partir de capturas REAIS do app.
Uso: python3 build_v2.py [reels|li45|li169|all]
Saídas: exports/VIDEO_NEXOPROCESS_V2_*.mp4 (trilha original, uso comercial livre)
        exports/previa_locucao_NAO_COMERCIAL/*.mp4 (com a locução ElevenLabs do plano gratuito — só para aprovação)
        subtitles/LEGENDAS.srt
"""
import json, os, subprocess, sys

M = '/home/user/Code-Del-Rio/marketing/video'
A, CAP = f'{M}/assets', f'{M}/assets/capturas-v2'
GEN, TMP = f'{M}/generated', f'{M}/generated/_tmp_v2'
VOZ = f'{M}/audio/elevenlabs_plano_gratuito_NAO_COMERCIAL/locucao_nassif.mp3'
SEGV = json.load(open(f'{M}/audio/locucao_frases.json'))
L = {'mapa': SEGV[1], 'diag': SEGV[2], 'plano': SEGV[5], 'marca': SEGV[6]}
SPLIT = {'mapa': 6.34 - SEGV[1][0], 'diag': 12.87 - SEGV[2][0], 'plano': 23.37 - SEGV[5][0]}   # pausas internas ("...")
C1, C2 = f'{GEN}/omni_cena1_escritorio_360p.mp4', f'{GEN}/omni_cena2_fios_fluxo_360p.mp4'
XF, LEAD, GAP = 0.25, 0.2, 0.4
BG = '0x0e1117'                                                     # fundo do app (tema escuro)
ENC = ['-c:v', 'libx264', '-preset', 'slow', '-crf', '17', '-pix_fmt', 'yuv420p', '-r', '30', '-profile:v', 'high']
FMT = {
    'reels': dict(W=1080, H=1920, fg_h=940, fg_y=560, win=(60, 345, 960, 950), card='m', cw=960,
                  mapa_a=(f'{A}/clipes/9x16-A-mapa-macro-travelling.mp4', 0.6), mapa_b=(f'{A}/clipes/9x16-B-mapa-etapa-travelling.mp4', 1.5),
                  out='VIDEO_NEXOPROCESS_V2_INSTAGRAM_REELS'),
    'li45': dict(W=1080, H=1350, fg_h=900, fg_y=380, win=(60, 135, 960, 955), card='m', cw=960,
                 mapa_a=(f'{GEN}/4x5-A-mapa-macro-travelling.mp4', 0.6), mapa_b=(f'{GEN}/4x5-B-mapa-etapa-travelling.mp4', 1.5),
                 out='VIDEO_NEXOPROCESS_V2_LINKEDIN_4X5'),
    'li169': dict(W=1920, H=1080, fg_h=None, fg_y=None, win=(260, 150, 1400, 760), card='d', cw=1400,
                  mapa_a=(f'{A}/clipes/16x9-A-mapa-macro.mp4', 0.3), mapa_b=(f'{A}/clipes/16x9-B-mapa-etapa.mp4', 0.5),
                  out='VIDEO_NEXOPROCESS_V2_LINKEDIN_16X9'),
}

def run(cmd):
    r = subprocess.run(cmd, capture_output=True, text=True)
    if r.returncode: raise SystemExit(' '.join(cmd[:6]) + '\n' + r.stderr[-3000:])
    return r

# ---------- linha do tempo (idêntica nos 3 formatos → uma única LEGENDAS.srt)
ln = lambda k: L[k][1] - L[k][0]
DUR = [('hook', 2.2), ('prob', 2.6), ('mapa_a', 2.6), ('mapa_b', ln('mapa') + GAP - 2.6 + XF),
       ('diag', ln('diag') + GAP), ('plano', ln('plano') + GAP), ('end', ln('marca') + LEAD + 1.0)]
ST, acc = {}, 0.0
for k, d in DUR: ST[k] = acc; acc += d - XF
T = acc + XF
VO = {'mapa': ST['mapa_a'] + LEAD, 'diag': ST['diag'] + LEAD, 'plano': ST['plano'] + LEAD, 'marca': ST['end'] + LEAD}
D_IN, TC = ST['mapa_a'], ST['end']
OVL = [('hook', 0.10, ST['prob'] + 0.15), ('problema', ST['prob'] + 0.15, ST['mapa_a'] + 0.10),
       ('chip1', ST['mapa_a'] + 0.10, ST['diag']), ('chip2', ST['diag'] + 0.10, ST['plano']), ('chip3', ST['plano'] + 0.10, ST['end']),
       ('selo', ST['mapa_a'] + 0.10, ST['end'])]
SUBS = [('sub_s1', VO['mapa'], VO['mapa'] + SPLIT['mapa'], 'E ele vira um mapa visual,'),
        ('sub_s2', VO['mapa'] + SPLIT['mapa'], VO['mapa'] + ln('mapa'), 'com gargalos e retrabalho destacados.'),
        ('sub_s3', VO['diag'], VO['diag'] + SPLIT['diag'], 'O diagnóstico mostra tempo, esforço e custo,'),
        ('sub_s4', VO['diag'] + SPLIT['diag'], VO['diag'] + ln('diag'), 'com a fórmula à vista.'),
        ('sub_s5', VO['plano'], VO['plano'] + SPLIT['plano'], 'E tudo vira um plano de ação,'),
        ('sub_s6', VO['plano'] + SPLIT['plano'], VO['plano'] + ln('plano'), 'com responsável e prazo.')]
CTA_AT = ST['end'] + 1.3

def srt():
    def ts(x): h, r = divmod(x, 3600); m, s = divmod(r, 60); return f'{int(h):02d}:{int(m):02d}:{int(s):02d},{int(round((s % 1) * 1000)) % 1000:03d}'
    cues = [(0.10, ST['prob'] + 0.15, 'Seu processo vive numa planilha?'),
            (ST['prob'] + 0.15, ST['mapa_a'] + 0.10, 'Quando o fluxo não está claro, os gargalos também não.')]
    cues += [(a, b, t) for _, a, b, t in SUBS]
    cues += [(VO['marca'], VO['marca'] + ln('marca'), 'NexoProcess. Do processo na planilha ao plano de melhoria.'), (CTA_AT, T, 'Conheça o NexoProcess.')]
    os.makedirs(f'{M}/subtitles', exist_ok=True)
    with open(f'{M}/subtitles/LEGENDAS.srt', 'w', encoding='utf-8') as f:
        f.write('\n'.join(f'{i}\n{ts(a)} --> {ts(b)}\n{t}\n' for i, (a, b, t) in enumerate(cues, 1)))

# ---------- insumos derivados (cache)
def prep():
    os.makedirs(TMP, exist_ok=True)
    for name, src in (('4x5-A-mapa-macro-travelling', '03b-mapa-macro-recorte'), ('4x5-B-mapa-etapa-travelling', '04b-mapa-etapa-recorte')):
        o = f'{GEN}/{name}.mp4'
        if not os.path.exists(o):
            run(['ffmpeg', '-y', '-loglevel', 'error', '-loop', '1', '-i', f'{A}/telas-4k/{src}.png', '-vf',
                 "crop=w=ih*4/5:h=ih:x='(iw-ow)*(0.5-0.5*cos(PI*min(t/6\\,1)))':y=0,scale=1080:1350:flags=lanczos,fps=30",
                 '-t', '6', *ENC, '-an', o])

def seg(f, k, d, o):
    W, H = f['W'], f['H']
    if k in ('hook', 'prob'):
        src, ss = (C1, 0.0) if k == 'hook' else (C2, 2.0)
        if f['fg_h']:
            fc = (f'[0:v]fps=30,split[a][b];[a]scale=-2:{H},crop={W}:{H},boxblur=40:3,eq=brightness=-0.16:saturation=0.8[bg];'
                  f'[b]scale=-2:{f["fg_h"]}:flags=lanczos,crop={W}:{f["fg_h"]},unsharp=5:5:0.7,noise=alls=6:allf=t[fg];[bg][fg]overlay=0:{f["fg_y"]}[v]')
        else:
            fc = f'[0:v]fps=30,scale={W}:{H}:flags=lanczos,unsharp=5:5:0.8,noise=alls=7:allf=t[v]'
        run(['ffmpeg', '-y', '-loglevel', 'error', '-ss', str(ss), '-i', src, '-filter_complex', fc, '-map', '[v]', '-t', f'{d:.3f}', *ENC, '-an', o])
    elif k in ('mapa_a', 'mapa_b'):
        src, ss = f[k]
        run(['ffmpeg', '-y', '-loglevel', 'error', '-ss', str(ss), '-i', src, '-vf', f'fps=30,scale={W}:{H},setsar=1,tpad=stop_mode=clone:stop_duration=4',
             '-t', f'{d:.3f}', *ENC, '-an', o])
    elif k in ('diag', 'plano'):
        img = f'{CAP}/{"diag-kpi" if k == "diag" else "plano"}-{f["card"]}.png'
        x, y, ww, wh = f['win']; cw = f['cw']
        # rolagem suave (ease-in-out) dentro de uma janela fixa; bordas com degradê para o fundo do app
        y1 = f'max(ih-{wh},0)' if k == 'diag' else f'max(ih-{wh},0)'
        fc = (f'color=c={BG}:s={W}x{H}:r=30:d={d:.3f}[bg];'
              f'[0:v]scale={cw}:-2:flags=lanczos,format=rgba,crop={ww}:{wh}:0:\'({y1})*(0.5-0.5*cos(PI*min(t/{d:.3f}\\,1)))\'[c];'
              f'[bg][c]overlay={x}:{y}:shortest=1[b1];'
              f'color=c={BG}:s={ww}x60:r=30:d={d:.3f},format=rgba,geq=r=14:g=17:b=23:a=\'255*(1-Y/60)\'[ft];'
              f'color=c={BG}:s={ww}x90:r=30:d={d:.3f},format=rgba,geq=r=14:g=17:b=23:a=\'255*(Y/90)\'[fb];'
              f'[b1][ft]overlay={x}:{y}[b2];[b2][fb]overlay={x}:{y + wh - 90},format=yuv420p[v]')
        run(['ffmpeg', '-y', '-loglevel', 'error', '-loop', '1', '-framerate', '30', '-t', f'{d:.3f}', '-i', img, '-filter_complex', fc,
             '-map', '[v]', '-t', f'{d:.3f}', *ENC, '-an', o])
    elif k == 'end':
        n = int(d * 30)
        run(['ffmpeg', '-y', '-loglevel', 'error', '-loop', '1', '-i', f'{OVD}/encerramento.png', '-vf',
             f"zoompan=z='1.035-0.035*on/{n}':x='(iw-iw/zoom)/2':y='(ih-ih/zoom)/2':d={n}:s={W}x{H}:fps=30",
             '-frames:v', str(n), *ENC, '-an', o])

def build(fk):
    global OVD
    f = FMT[fk]; OVD = f'{A}/overlays-v2/{fk}'; tdir = f'{TMP}/{fk}'; os.makedirs(tdir, exist_ok=True)
    parts = []
    for k, d in DUR:
        o = f'{tdir}/{k}.mp4'; seg(f, k, d, o); parts.append(o)
    ins = sum((['-i', p] for p in parts), [])
    fc, prev = [], '0:v'
    for i in range(1, len(parts)):
        fc.append(f'[{prev}][{i}:v]xfade=transition=fade:duration={XF}:offset={ST[DUR[i][0]]:.3f}[x{i}]'); prev = f'x{i}'
    base = f'{tdir}/base.mp4'
    run(['ffmpeg', '-y', '-loglevel', 'error', *ins, '-filter_complex', ';'.join(fc), '-map', f'[{prev}]', *ENC, base])
    # textos e rótulos sobre a linha do tempo inteira
    items = [(n, a, b, 0.25) for n, a, b in OVL] + [(n, a, b, 0.12) for n, a, b, _ in SUBS] + [('cta', CTA_AT, T + 1, 0.4)]
    ins, fc, prev = ['-i', base], [], '0:v'
    for j, (n, a, b, fd) in enumerate(items, 1):
        ins += ['-loop', '1', '-framerate', '30', '-t', f'{T:.3f}', '-i', f'{OVD}/{n}.png']
        fo = f',fade=t=out:st={b - fd:.3f}:d={fd}:alpha=1' if b < T else ''
        fc.append(f'[{j}:v]format=rgba,fade=t=in:st={a:.3f}:d={fd}:alpha=1{fo}[o{j}];[{prev}][o{j}]overlay=0:0:format=auto:shortest=1[y{j}]'); prev = f'y{j}'
    fc.append(f'[{prev}]format=yuv420p[v]')
    video = f'{tdir}/video.mp4'
    run(['ffmpeg', '-y', '-loglevel', 'error', *ins, '-filter_complex', ';'.join(fc), '-map', '[v]', '-t', f'{T:.3f}', *ENC, '-maxrate', '16M', '-bufsize', '32M', video])
    return video

def audio():
    mus = f'{M}/audio/trilha_original_v2.wav'
    run(['python3', '-I', f'{M}/scripts/music_v2.py', mus, f'{T:.3f}', f'{D_IN:.3f}', f'{TC:.3f}'])
    a_mus = f'{TMP}/mix_trilha.wav'
    run(['ffmpeg', '-y', '-loglevel', 'error', '-i', mus, '-af', f'loudnorm=I=-14:TP=-1.5:LRA=11,aresample=48000,apad=whole_dur={T:.3f},atrim=0:{T:.3f}', a_mus])
    # prévia com locução (NÃO COMERCIAL): voz grave tratada + trilha abaixando sob a fala
    ins, fc = ['-i', mus], []
    keys = ['mapa', 'diag', 'plano', 'marca']
    for j, k in enumerate(keys):
        s0, s1 = L[k]; ms = int(VO[k] * 1000)
        ins += ['-ss', f'{s0:.3f}', '-t', f'{s1 - s0:.3f}', '-i', VOZ]
        fc.append(f'[{j + 1}:a]aresample=48000,volume=9dB,highpass=f=70,equalizer=f=120:t=q:w=1.2:g=2.5,acompressor=threshold=0.08:ratio=3:attack=8:release=120:makeup=1.5,'
                  f'afade=t=in:d=0.03,afade=t=out:st={max(s1 - s0 - 0.08, 0):.3f}:d=0.08,pan=stereo|c0=c0|c1=c0,adelay={ms}|{ms}[v{j}]')
    fc.append(''.join(f'[v{j}]' for j in range(len(keys))) + f'amix=inputs={len(keys)}:normalize=0,aecho=0.85:0.6:70|140:0.14|0.07,alimiter=limit=0.89,apad=whole_dur={T:.3f},atrim=0:{T:.3f},asplit[vz][sc]')
    fc.append('[0:a]aresample=48000,volume=0.8[m];[m][sc]sidechaincompress=threshold=0.012:ratio=7:attack=15:release=450:makeup=1[md]')
    fc.append(f'[md][vz]amix=inputs=2:normalize=0:duration=first,alimiter=limit=0.95,loudnorm=I=-14:TP=-1.5:LRA=11,aresample=48000,apad=whole_dur={T:.3f},atrim=0:{T:.3f}[a]')
    a_vo = f'{TMP}/mix_locucao.wav'
    run(['ffmpeg', '-y', '-loglevel', 'error', *ins, '-filter_complex', ';'.join(fc), '-map', '[a]', a_vo])
    return a_mus, a_vo

def mux(video, aud, out):
    os.makedirs(os.path.dirname(out), exist_ok=True)
    run(['ffmpeg', '-y', '-loglevel', 'error', '-i', video, '-i', aud, '-map', '0:v', '-map', '1:a', '-c:v', 'copy', '-c:a', 'aac', '-b:a', '192k',
         '-ar', '48000', '-ac', '2', '-shortest', '-movflags', '+faststart', out])

if __name__ == '__main__':
    which = sys.argv[1] if len(sys.argv) > 1 else 'all'
    prep(); srt(); a_mus, a_vo = audio()
    for fk in (FMT if which == 'all' else [which]):
        v = build(fk)
        mux(v, a_mus, f'{M}/exports/{FMT[fk]["out"]}.mp4')
        mux(v, a_vo, f'{M}/exports/previa_locucao_NAO_COMERCIAL/{FMT[fk]["out"]}_PREVIA_LOCUCAO_NAO_COMERCIAL.mp4')
        print(fk, 'ok')
    print(json.dumps({'duracao_s': round(T, 2), 'produto_entra_s': round(D_IN, 2), 'logo_s': round(TC, 2), 'inicios': {k: round(v, 2) for k, v in ST.items()}}))
