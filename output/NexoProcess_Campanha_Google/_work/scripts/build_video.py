"""Vídeo de 30,000 s (9:16 e 4:5): foto original + gravação original do Google no iPhone.
Uso: python3 build_video.py 916|45
Linha do tempo da gravação (origem) → vídeo: pausas em quadros ORIGINAIS + trechos em velocidade natural.
Nada é cortado da pesquisa; só a Central de Controle do iOS (fim da gravação, 6,55 s+) fica de fora.
"""
import json, os, subprocess, sys

W = '/home/user/Code-Del-Rio/output/NexoProcess_Campanha_Google/_work'
UP = '/root/.claude/uploads/ca3f8930-8d23-5266-aa7c-6ab84d5ae042'
REC = f'{UP}/47d8f717-ScreenRecording_11-07-2026_19-26-31_1.mp4'
G = json.load(open(f'{W}/geo.json'))
FPS, T = 30, 30.0
fmt = sys.argv[1]
OW, OH = (1080, 1920) if fmt == '916' else (1080, 1350)
CW, CH = G['canvas916'] if fmt == '916' else G['canvas45']
YOFF = G['yoff916'] if fmt == '916' else 0
px0, py0, pw, ph = G['phone']; py0 += YOFF
pw -= pw % 2; ph -= ph % 2   # H.264/yuv420p exige dimensões pares

def run(c):
    r = subprocess.run(c, capture_output=True, text=True)
    if r.returncode: raise SystemExit(r.stderr[-3000:])

# ---------- 1) tela do iPhone: gravação original remapeada no tempo (30 s)
SEGS = [('hold', 0.5, 12.4),          # topo: pergunta + resposta + 3 primeiras funcionalidades
        ('play', 1.20, 2.93),         # rolagem original
        ('hold', 2.93, 2.87),         # Comparação Antes × Depois + Plano de ação
        ('play', 2.93, 6.53),         # 2ª rolagem + fontes (Hotmart/Instagram) + carrossel, velocidade natural
        ('hold', 6.50, 9.40)]         # último quadro de conteúdo (antes da Central de Controle)
feed = f'{W}/phone_feed.mp4'
if not os.path.exists(feed):
    parts = []
    for i, (k, a, b) in enumerate(SEGS):
        o = f'{W}/seg{i}.mp4'
        vf = f'fps={FPS},scale={pw}:{ph}:force_original_aspect_ratio=decrease:flags=lanczos,pad={pw}:{ph}:(ow-iw)/2:(oh-ih)/2:black,setsar=1'
        if k == 'hold':
            run(['ffmpeg', '-y', '-v', 'error', '-ss', str(a), '-i', REC, '-frames:v', '1', f'{W}/hold{i}.png'])
            run(['ffmpeg', '-y', '-v', 'error', '-loop', '1', '-framerate', str(FPS), '-i', f'{W}/hold{i}.png', '-vf', vf, '-t', str(b),
                 '-c:v', 'libx264', '-crf', '12', '-pix_fmt', 'yuv420p', o])
        else:
            run(['ffmpeg', '-y', '-v', 'error', '-ss', str(a), '-i', REC, '-t', f'{b - a:.3f}', '-vf', vf, '-an',
                 '-c:v', 'libx264', '-crf', '12', '-pix_fmt', 'yuv420p', o])
        parts.append(o)
    lst = f'{W}/feed.txt'; open(lst, 'w').write(''.join(f"file '{p}'\n" for p in parts))
    run(['ffmpeg', '-y', '-v', 'error', '-f', 'concat', '-safe', '0', '-i', lst, '-vf', f'fps={FPS}', '-t', str(T),
         '-c:v', 'libx264', '-crf', '12', '-pix_fmt', 'yuv420p', feed])

# ---------- 2) câmera: abertura → aproxima no iPhone → afasta
if fmt == '916':
    tgt_h, tgt_x, tgt_y = 1300, 440, 310          # tela do iPhone na saída (altura, x, y)
else:
    tgt_h, tgt_x, tgt_y = 1180, 470, 85
k = tgt_h / ph                                    # canvas → saída
win_w = OW / k
Zp = CW / win_w
cxp = (px0 - tgt_x / k + win_w / 2) / CW
cyp = (py0 - tgt_y / k + (OH / k) / 2) / CH
TT = f'(on/{FPS})'
def ss(a, b):   # smoothstep entre a e b
    u = f'clip(({TT}-{a})/({b}-{a}),0,1)'
    return f'({u}*{u}*(3-2*{u}))'
def lt(x): return f'lt({TT},{x})'
Z = (f"if({lt(3)},1+0.03*{TT}/3,if({lt(4.8)},1.03+({Zp:.5f}-1.03)*{ss(3,4.8)},if({lt(18)},{Zp:.5f},"
     f"if({lt(20)},{Zp:.5f}+(1-{Zp:.5f})*{ss(18,20)},1+0.02*({TT}-20)/4))))")
def C(p):
    return (f"if({lt(3)},0.5,if({lt(4.8)},0.5+({p:.5f}-0.5)*{ss(3,4.8)},if({lt(18)},{p:.5f},"
            f"if({lt(20)},{p:.5f}+(0.5-{p:.5f})*{ss(18,20)},0.5))))")
zp = f"zoompan=z='{Z}':x='iw*({C(cxp)})-iw/zoom/2':y='ih*({C(cyp)})-ih/zoom/2':d=1:s={OW}x{OH}:fps={FPS}"

# ---------- 3) composição + câmera
base = f'{W}/canvas_{fmt}.png'
cam = f'{W}/cam_{fmt}.mp4'
fc = (f'[0:v]format=rgb24[bg];[1:v]format=rgba[ph];[2:v]scale={pw}:{ph},format=gray[m];[ph][m]alphamerge[phm];'
      f'[bg][phm]overlay={px0}:{py0}:shortest=1,{zp},format=yuv420p[v]')
if not os.path.exists(cam): run(['ffmpeg', '-y', '-v', 'error', '-loop', '1', '-framerate', str(FPS), '-t', str(T), '-i', base, '-i', feed,
     '-loop', '1', '-framerate', str(FPS), '-t', str(T), '-i', f'{W}/mask_phone.png',
     '-filter_complex', fc, '-map', '[v]', '-frames:v', str(int(T * FPS)), '-c:v', 'libx264', '-crf', '14', '-preset', 'medium', cam])

# ---------- 4) textos e destaques (PNGs gerados por overlays.cjs) + trilha original
OV = f'{W}/ov_{fmt}'
items = [('titulo', 0.25, 3.15, 0.35), ('foco', 4.4, 18.4, 0.5), ('selo', 3.6, 17.8, 0.35),
         ('f1', 8.2, 12.4, 0.3), ('f2', 9.6, 12.4, 0.3), ('f3', 11.0, 12.4, 0.3),
         ('f4', 14.3, 17.4, 0.3), ('f5', 15.6, 17.4, 0.3),
         ('valor', 19.4, 23.9, 0.4), ('fecho', 24.0, T + 1, 0.6), ('cta', 25.2, T + 1, 0.5)]
ins, fc, prev = ['-i', cam], [], '0:v'
for j, (n, a, b, fd) in enumerate(items, 1):
    ins += ['-loop', '1', '-framerate', str(FPS), '-t', str(T), '-i', f'{OV}/{n}.png']
    fo = f',fade=t=out:st={b - fd:.2f}:d={fd}:alpha=1' if b <= T else ''
    fc.append(f'[{j}:v]format=rgba,fade=t=in:st={a:.2f}:d={fd}:alpha=1{fo}[o{j}];[{prev}][o{j}]overlay=0:0:shortest=1[y{j}]'); prev = f'y{j}'
music = f'{W}/trilha_30s.wav'
if not os.path.exists(music):
    run(['python3', '-I', '/home/user/Code-Del-Rio/marketing/video/scripts/music_v2.py', f'{W}/trilha_raw.wav', str(T), '3.0', '24.0'])
    run(['python3', '-I', '/home/user/Code-Del-Rio/marketing/video/scripts/loudnorm2.py', f'{W}/trilha_raw.wav', music])
ins += ['-i', music]
fc.append(f'[{prev}]format=yuv420p[v]')
out = f'{W}/video_{fmt}.mp4'
run(['ffmpeg', '-y', '-v', 'error', *ins, '-filter_complex', ';'.join(fc), '-map', '[v]', '-map', f'{len(items) + 1}:a',
     '-c:v', 'libx264', '-profile:v', 'high', '-level', '4.2', '-preset', 'slow', '-crf', '17', '-pix_fmt', 'yuv420p', '-r', str(FPS),
     '-c:a', 'aac', '-b:a', '192k', '-ar', '48000', '-ac', '2', '-t', f'{T:.3f}', '-movflags', '+faststart', out])
print('ok', out, f'Zp={Zp:.3f} cx={cxp:.4f} cy={cyp:.4f}')
