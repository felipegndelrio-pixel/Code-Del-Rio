const { chromium } = require('/home/user/Code-Del-Rio/node_modules/playwright');
const fs = require('fs'); const path = require('path');
const W = '/home/user/Code-Del-Rio/output/NexoProcess_Campanha_Google/_work';
const FD = '/home/user/Code-Del-Rio/node_modules/@fontsource/ibm-plex-sans/files';
const face = (w) => ['latin','latin-ext'].map((s) => `@font-face{font-family:Plex;font-weight:${w};src:url(file://${FD}/ibm-plex-sans-${s}-${w}-normal.woff2) format('woff2');}`).join('');
const SYM = fs.readFileSync('/home/user/Code-Del-Rio/marketing/video/assets/marca/nexoprocess-simbolo.svg','utf8').replace('<svg ','<svg width="56" height="56" ');
// recorte do iPhone da foto original (com o quadro ORIGINAL da pesquisa), em coordenadas de still_45 (escala 2.7)
const S = 2.7, x0 = 813*S, y0 = 556*S, w = 245*S, h = 498*S, k = 440 / w;   // phone com ~760 px de largura no Story
const html = `<html><head><meta charset="utf-8"><style>${face(500)}${face(600)}${face(700)}
*{margin:0;box-sizing:border-box}body{width:1080px;height:1920px;position:relative;overflow:hidden;font-family:Plex,sans-serif;color:#0d1c38;background:radial-gradient(ellipse at 50% 38%,#ffffff 0%,#eaf0f9 50%,#d3deef 100%)}
.eb{position:absolute;left:0;right:0;top:300px;text-align:center;font-weight:600;font-size:28px;letter-spacing:.16em;color:#0b8fa1;display:flex;justify-content:center;align-items:center;gap:12px}
.eb i{width:12px;height:12px;border-radius:50%;background:#34a853;display:inline-block}
h1{position:absolute;left:70px;right:70px;top:352px;text-align:center;font-weight:700;font-size:84px;line-height:1.04;letter-spacing:-2.5px}
h1 em{font-style:normal;color:#0b8fa1}
.ph{position:absolute;left:${(1080 - 440)/2}px;top:640px;width:440px;height:${Math.round(h*k)}px;border-radius:${Math.round(44*S*k)}px;overflow:hidden;box-shadow:0 50px 90px rgba(13,28,56,.35),0 12px 24px rgba(13,28,56,.2);background:url('file://${W}/still_45.png') no-repeat;background-size:${Math.round(3029*k)}px auto;background-position:-${Math.round(x0*k)}px -${Math.round(y0*k)}px}
.pill{position:absolute;left:50%;transform:translateX(-50%);top:1545px;background:#0d1c38;color:#fff;font-weight:600;font-size:34px;border-radius:999px;padding:20px 40px;white-space:nowrap;box-shadow:0 14px 34px rgba(13,28,56,.3)}
.lk{position:absolute;left:0;right:0;top:1580px;display:flex;justify-content:center;align-items:center;gap:14px;font-weight:700;font-size:34px;letter-spacing:-.5px}
</style></head><body>
<div class="eb"><i></i>PESQUISA REAL NO GOOGLE</div>
<h1>Perguntamos ao Google<br>o que é o <em>NexoProcess.</em></h1>
<div class="ph"></div>

<div class="lk">${SYM}<span>NexoProcess</span></div></body></html>`;
(async () => {
  const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args: ['--allow-file-access-from-files'] });
  const p = await b.newPage({ viewport: { width: 1080, height: 1920 } });
  const f = path.join(W,'_s.html'); fs.writeFileSync(f, html); await p.goto('file://'+f);
  await p.evaluate(() => document.fonts.ready); await p.waitForTimeout(250);
  await p.screenshot({ path: process.argv[2] }); fs.unlinkSync(f); await b.close(); console.log('ok');
})();
