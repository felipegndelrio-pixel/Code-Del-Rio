"""Prepara as bases da campanha a partir da FOTO ORIGINAL dos dispositivos e da GRAVAÇÃO ORIGINAL do Google.
Nada da pesquisa é redesenhado: só quadros originais são recortados (seção), escalados e encaixados nas telas.
Saídas em _work/: canvas_45.png, canvas_916.png (sem a tela do iPhone, que recebe o vídeo),
still_45.png (com quadro original no iPhone, para as imagens), mask_phone.png, geo.json
"""
import json, subprocess, sys
from PIL import Image, ImageDraw, ImageFilter

W = '/home/user/Code-Del-Rio/output/NexoProcess_Campanha_Google/_work'
UP = '/root/.claude/uploads/ca3f8930-8d23-5266-aa7c-6ab84d5ae042'
PHOTO = f'{UP}/f8fafa0e-image.png'
REC = f'{UP}/47d8f717-ScreenRecording_11-07-2026_19-26-31_1.mp4'
S = 2.7
LAP = (144, 456, 866, 904)        # tela do laptop na foto (x0,y0,x1,y1)
LAP_VISIBLE_X1 = 812              # a partir daqui o iPhone cobre o laptop
PH = (826, 571, 1041, 1037)       # tela do iPhone na foto
R_PH = 28                         # raio dos cantos da tela do iPhone (px na foto)

def frame(t, path):
    subprocess.run(['ffmpeg', '-v', 'error', '-y', '-ss', str(t), '-i', REC, '-frames:v', '1', path], check=True)
    return Image.open(path).convert('RGB')

photo = Image.open(PHOTO).convert('RGB')
big = photo.resize((round(photo.width * S), round(photo.height * S)), Image.LANCZOS)
sc = lambda r: tuple(round(v * S) for v in r)

# --- quadro original H0 (0,5 s): topo da resposta
h0 = frame(0.5, f'{W}/H0.png')                     # 1320x2868
bg = h0.getpixel((8, 1200))                        # fundo escuro da própria página do Google
# --- tela do laptop: recorte da SEÇÃO real (parágrafo inicial + funcionalidades), sem esticar
lx0, ly0, lx1, ly1 = sc(LAP); vis_x1 = round(LAP_VISIBLE_X1 * S)
crop = h0.crop((0, 950, 1320, 2000))               # seção original, proporção preservada
k = (ly1 - ly0) / crop.height
panel = crop.resize((round(crop.width * k), ly1 - ly0), Image.LANCZOS)
lap = Image.new('RGB', (lx1 - lx0, ly1 - ly0), bg)
cx = ((lx0 + vis_x1) / 2) - lx0                    # centraliza na parte visível
lap.paste(panel, (round(cx - panel.width / 2), 0))
canvas = big.copy(); canvas.paste(lap, (lx0, ly0))
# devolve o corpo do iPhone (ele fica na frente do laptop): copia da foto original tudo a partir da borda do aparelho
phone_body = big.crop((round(813 * S), round(556 * S), round(1058 * S), round(1054 * S)))
m = Image.new('L', phone_body.size, 0); ImageDraw.Draw(m).rounded_rectangle((0, 0, phone_body.width - 1, phone_body.height - 1), radius=round(44 * S), fill=255)
canvas.paste(phone_body, (round(813 * S), round(556 * S)), m)

# --- tela do iPhone: máscara arredondada
px0, py0, px1, py1 = sc(PH); pw, ph = px1 - px0, py1 - py0
mask = Image.new('L', (pw, ph), 0); ImageDraw.Draw(mask).rounded_rectangle((0, 0, pw - 1, ph - 1), radius=round(R_PH * S), fill=255)
mask.save(f'{W}/mask_phone.png')
# quadro original ajustado por "conter" (sem cortar nem esticar), fundo preto = borda da tela
def phone_img(fr):
    kk = min(pw / fr.width, ph / fr.height); im = fr.resize((round(fr.width * kk), round(fr.height * kk)), Image.LANCZOS)
    out = Image.new('RGB', (pw, ph), (0, 0, 0)); out.paste(im, ((pw - im.width) // 2, (ph - im.height) // 2)); return out, kk
ph_img, kk = phone_img(h0)

canvas.save(f'{W}/canvas_45.png')
still = canvas.copy(); still.paste(ph_img, (px0, py0), mask); still.save(f'{W}/still_45.png')

# --- 9:16: estende o fundo de estúdio para cima e para baixo (faixas da própria foto, desfocadas)
CW = canvas.width; CH = round(CW * 16 / 9); yoff = (CH - canvas.height) // 2
c916 = Image.new('RGB', (CW, CH))
top = canvas.crop((0, 0, CW, 24)).resize((CW, yoff + 40), Image.BICUBIC).filter(ImageFilter.GaussianBlur(40))
bot = canvas.crop((0, canvas.height - 24, CW, canvas.height)).resize((CW, CH - yoff - canvas.height + 40), Image.BICUBIC).filter(ImageFilter.GaussianBlur(40))
c916.paste(top, (0, 0)); c916.paste(bot, (0, yoff + canvas.height - 40))
fade = Image.new('L', (CW, canvas.height), 255); d = ImageDraw.Draw(fade)
for i in range(60): d.line((0, i, CW, i), fill=round(255 * i / 60)); d.line((0, canvas.height - 1 - i, CW, canvas.height - 1 - i), fill=round(255 * i / 60))
c916.paste(canvas, (0, yoff), fade); c916.save(f'{W}/canvas_916.png')

geo = dict(S=S, canvas45=[CW, canvas.height], canvas916=[CW, CH], yoff916=yoff, phone=[px0, py0, pw, ph], rec_scale=kk,
           rec_offset=[(pw - round(1320 * kk)) // 2, (ph - round(2868 * kk)) // 2], bg=list(bg))
json.dump(geo, open(f'{W}/geo.json', 'w'), indent=1); print(json.dumps(geo))
