"""Prepara os insumos do filme v2:
 - mockup recortado (foto original MacBook+iPhone com a pesquisa original do Google), fundo transparente
 - ícone da Hotmart em uma cor, tirado da gravação original do Google (como o Google o exibe)
 - pontos de terra do globo (world-atlas land-110m, domínio público/Natural Earth)
Uso: python3 -I prep_assets.py"""
import json, numpy as np
from PIL import Image, ImageDraw, ImageFilter
R = '/home/user/Code-Del-Rio/'; F = R + 'marketing/filme/'
S = 2.7
photo = np.asarray(Image.open(R + 'output/NexoProcess_Campanha_Google/originais/mockup_dispositivos_original.png').convert('RGB')).astype(int)
dark = photo.max(axis=2) < 60
# --- limites medidos
cols = np.where(dark[440:545, :1000].mean(axis=0) > 0.9)[0]; rows = np.where(dark[:, 200:760].mean(axis=1) > 0.9)[0]
lid = (int(cols.min()), int(rows.min()), int(cols.max()), None)
pc = np.where(dark[640:980, 800:].mean(axis=0) > 0.9)[0] + 800; pr = np.where(dark[:, 860:1000].mean(axis=1) > 0.9)[0]; pr = pr[pr > 520]
ph = (int(pc.min()), int(pr.min()), int(pc.max()), int(pr.max()))
print('lid escuro x0,y0,x1:', lid, '| phone escuro:', ph)
still = Image.open(F + 'assets/mockup_google.png').convert('RGB')          # 3029x3785 (foto x2,7 com as telas originais)
W, H = still.size
m = Image.new('L', (W, H), 0); d = ImageDraw.Draw(m); s = lambda *v: [round(x * S) for x in v]
d.rounded_rectangle(s(lid[0] - 1, lid[1] - 1, lid[2] + 1, 932), radius=round(13 * S), fill=255)            # tampa
d.polygon([tuple(s(*p)) for p in [(128, 926), (880, 926), (880, 1029), (66, 1029), (56, 1024), (50, 1014), (48, 1002)]], fill=255)   # base
d.rounded_rectangle(s(ph[0] - 5, ph[1] - 5, ph[2] + 5, ph[3] + 5), radius=round(47 * S), fill=255)         # iPhone
m = m.filter(ImageFilter.MinFilter(5)).filter(ImageFilter.GaussianBlur(1.6))
out = still.convert('RGBA'); out.putalpha(m)
box = s(30, 405, 1085, 1075); cut = out.crop(box); cut = cut.resize((2110, round(2110 * cut.height / cut.width)), Image.LANCZOS)
cut.save(F + 'assets/mockup_recorte.png')
geo = {'w': cut.width, 'h': cut.height, 'phone': [(826 - 30) / 1055, (571 - 405) / 670, 215 / 1055, 466 / 670]}
# prévia sobre fundo escuro
bg = Image.new('RGB', cut.size, (7, 12, 24)); bg.paste(cut, (0, 0), cut); bg.save(F + 'work/mk_prev.png')
bg.crop((0, 900, 700, 1340)).save(F + 'work/mk_z1.png'); bg.crop((1450, 250, 2110, 700)).resize((660, 450)).save(F + 'work/mk_z2.png'); bg.crop((150, 0, 850, 300)).save(F + 'work/mk_z3.png')
# --- ícone Hotmart (chama) em branco, a partir do quadro original
c = Image.open(F + 'work/hotmart_crop.png').convert('RGB'); c = c.resize((c.width * 8, c.height * 8), Image.LANCZOS)
a = np.asarray(c).astype(float); al = np.clip((a[..., 0] - a[..., 2] - 60) / 110, 0, 1)
ys, xs = np.where(al > 0.5); al = al[ys.min() - 4:ys.max() + 5, xs.min() - 4:xs.max() + 5]
ico = np.zeros(al.shape + (4,), np.uint8); ico[..., :3] = 238; ico[..., 3] = (al * 255).astype(np.uint8)
Image.fromarray(ico, 'RGBA').save(F + 'assets/hotmart_mono.png'); print('hotmart', ico.shape)
# --- globo: pontos de terra
T = json.load(open(F + 'work/land-110m.json')); sc, tr = T['transform']['scale'], T['transform']['translate']
arcs = []
for arc in T['arcs']:
    p = np.cumsum(np.array(arc, float), axis=0); arcs.append(np.stack([p[:, 0] * sc[0] + tr[0], p[:, 1] * sc[1] + tr[1]], 1))
rings = []
def ring(idx):
    pts = []
    for i in idx:
        a_ = arcs[i] if i >= 0 else arcs[~i][::-1]; pts.append(a_ if not pts else a_[1:])
    return np.concatenate(pts)
for g in T['objects']['land']['geometries']:
    polys = g['arcs'] if g['type'] == 'MultiPolygon' else [g['arcs']]
    for poly in polys:
        for r_ in poly: rings.append(ring(r_))
pts = []
for lat in np.arange(-58, 84, 1.8):
    n = max(1, int(round(360 * np.cos(np.radians(lat)) / 1.8)))
    for k in range(n): pts.append((lat, -180 + (k + 0.5) * 360 / n))
P = np.array(pts); inside = np.zeros(len(P), bool)
for rg in rings:
    x, y = rg[:, 0], rg[:, 1]; x2, y2 = np.roll(x, -1), np.roll(y, -1)
    if P[:, 0].max() < y.min() or P[:, 0].min() > y.max(): continue
    py, px = P[:, 0][:, None], P[:, 1][:, None]
    cross = ((y[None] > py) != (y2[None] > py)) & (px < (x2 - x)[None] * (py - y[None]) / (y2 - y + 1e-12)[None] + x[None])
    inside ^= (cross.sum(1) % 2 == 1)
dots = [[round(float(a_), 2), round(float(b_), 2)] for a_, b_ in P[inside]]
json.dump({'dots': dots, 'mock': geo}, open(F + 'assets/dados.json', 'w')); print('pontos de terra:', len(dots), 'de', len(P))
