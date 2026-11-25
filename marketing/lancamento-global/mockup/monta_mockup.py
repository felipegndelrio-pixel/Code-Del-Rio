"""Mockup MacBook + iPhone (recorte da foto de dispositivos já usada no projeto) com as telas REAIS da versão em inglês.
Notebook: AS-IS map (1444×896 @2x) · iPhone: Diagnosis (390×763 @3x: abaixo da barra de status e acima da área do indicador de início).
Barra de status, Dynamic Island e indicador de início são desenhados (convenção de mockup); o conteúdo do app não é alterado.
Uso: python3 -I monta_mockup.py"""
from PIL import Image, ImageDraw, ImageFont, ImageFilter
R = '/home/user/Code-Del-Rio/marketing/'
base = Image.open(R + 'filme/assets/mockup_recorte.png').convert('RGBA')          # 2110×1339
W, H = base.size
desk = Image.open(R + 'video/assets/telas-en/en_desk_mapa_1444x896@2x.png').convert('RGB')
mob = Image.open(R + 'video/assets/telas-en/en_mob_diagnostico_390x763@3x.png').convert('RGB')
FONT = '/home/user/Code-Del-Rio/node_modules/@fontsource/ibm-plex-sans/files/'
dj = '/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf'
# ---- tela do notebook (área ativa medida: x 227–1671, y 101–997)
LX, LY, LW, LH = 227, 101, 1444, 896
lap = desk.resize((LW, LH), Image.LANCZOS).convert('RGBA')
gl = Image.new('RGBA', (LW, LH), (0, 0, 0, 0)); g = ImageDraw.Draw(gl)
for i in range(LW):   # reflexo diagonal muito discreto
    a = max(0, 18 - i * 30 // LW); g.line([(i, 0), (i - LH * 0.6, LH)], fill=(255, 255, 255, a))
lap = Image.alpha_composite(lap, gl)
# máscara: tela do notebook menos o corpo do iPhone (que fica na frente)
mk = Image.new('L', (W, H), 0); d = ImageDraw.Draw(mk); d.rectangle([LX, LY, LX + LW - 1, LY + LH - 1], fill=255)
d.rounded_rectangle([1561, 300, 2052, 1295], radius=78, fill=0)
layer = Image.new('RGBA', (W, H), (0, 0, 0, 0)); layer.paste(lap, (LX, LY))
out = base.copy(); out.paste(layer, (0, 0), mk)
# ---- tela do iPhone (x 1592, y 332, 430×931, raio 49)
PX, PY, PW, PH, PR = 1592, 332, 430, 931, 49
scr = Image.new('RGBA', (PW, PH), (14, 17, 23, 255))
SB = round(PH * 47 / 844)                                                       # barra de status (47 pt de 844)
app = mob.resize((PW, round(mob.height * PW / mob.width)), Image.LANCZOS)
scr.paste(app, (0, SB))
bot = app.getpixel((PW // 2, app.height - 2)); ImageDraw.Draw(scr).rectangle([0, SB + app.height, PW, PH], fill=bot)   # área do indicador, na cor da barra do app
s = ImageDraw.Draw(scr)
k = PW / 390
try: f = ImageFont.truetype(dj, round(15 * k))
except OSError: f = ImageFont.load_default()
s.text((round(34 * k), round(15 * k)), '9:41', font=f, fill=(255, 255, 255))
x0 = PW - round(28 * k)
s.rounded_rectangle([x0 - round(25 * k), round(17 * k), x0, round(29 * k)], radius=round(3.5 * k), outline=(255, 255, 255), width=max(1, round(1.2 * k)))   # bateria
s.rounded_rectangle([x0 - round(23 * k), round(19 * k), x0 - round(5 * k), round(27 * k)], radius=round(2 * k), fill=(255, 255, 255))
s.rectangle([x0 + 1, round(21 * k), x0 + round(2.5 * k), round(25 * k)], fill=(255, 255, 255))
for i in range(4):                                                                 # sinal
    hh = round((4 + 2.6 * i) * k); xx = x0 - round(62 * k) + i * round(4.6 * k)
    s.rounded_rectangle([xx, round(28 * k) - hh, xx + round(3 * k), round(28 * k)], radius=1, fill=(255, 255, 255))
cxw, cyw = x0 - round(39 * k), round(28 * k)                                       # wi-fi
for i, rr in enumerate((11, 7.5, 4)):
    if i < 2: s.arc([cxw - rr * k, cyw - rr * k * 1.15, cxw + rr * k, cyw + rr * k * .85], 225, 315, fill=(255, 255, 255), width=max(2, round(1.9 * k)))
    else: s.pieslice([cxw - rr * k, cyw - rr * k * 1.15, cxw + rr * k, cyw + rr * k * .85], 225, 315, fill=(255, 255, 255))
iw, ih = round(126 * k), round(37 * k)                                             # Dynamic Island
s.rounded_rectangle([(PW - iw) // 2, round(11 * k), (PW + iw) // 2, round(11 * k) + ih], radius=ih // 2, fill=(0, 0, 0))
hw = round(134 * k); s.rounded_rectangle([(PW - hw) // 2, PH - round(13 * k), (PW + hw) // 2, PH - round(8 * k)], radius=4, fill=(235, 238, 245))   # indicador de início
pm = Image.new('L', (PW, PH), 0); ImageDraw.Draw(pm).rounded_rectangle([0, 0, PW - 1, PH - 1], radius=PR, fill=255)
out.paste(scr, (PX, PY), pm)
out.save(R + 'lancamento-global/mockup/mockup_en.png')
prev = Image.new('RGBA', (W, H), (7, 12, 24, 255)); prev.alpha_composite(out); prev.convert('RGB').resize((1055, 670), Image.LANCZOS).save('/tmp/claude-0/cs/mockup_en.png')
print('ok', out.size)
