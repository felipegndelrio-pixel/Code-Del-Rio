// Alternativa "Prova real": close na foto original (iPhone com o quadro ORIGINAL da pesquisa), sem nenhuma alteração da captura.
const { chromium } = require('/home/user/Code-Del-Rio/node_modules/playwright');
const fs = require('fs'); const path = require('path');
const W = '/home/user/Code-Del-Rio/output/NexoProcess_Campanha_Google/_work';
const FD = '/home/user/Code-Del-Rio/node_modules/@fontsource/ibm-plex-sans/files';
const face = (w) => ['latin', 'latin-ext'].map((s) => `@font-face{font-family:Plex;font-weight:${w};src:url(file://${FD}/ibm-plex-sans-${s}-${w}-normal.woff2) format('woff2');}`).join('');
const SYM = fs.readFileSync('/home/user/Code-Del-Rio/marketing/video/assets/marca/nexoprocess-simbolo.svg', 'utf8').replace('<svg ', '<svg width="40" height="40" ');
const s = 0.655, cx = 1380, cy = 1044;
const html = `<html><head><meta charset="utf-8"><style>${face(500)}${face(600)}${face(700)}
*{margin:0;box-sizing:border-box}body{width:1080px;height:1350px;position:relative;overflow:hidden;font-family:Plex,sans-serif;color:#0d1c38}
.bg{position:absolute;inset:0;background:url('file://${W}/still_45.png') no-repeat;background-size:${Math.round(3029 * s)}px auto;background-position:-${Math.round(cx * s)}px -${Math.round(cy * s)}px}
.left{position:absolute;left:0;top:0;bottom:0;width:545px;background:linear-gradient(to right,rgba(242,246,251,.985) 0%,rgba(242,246,251,.975) 88%,rgba(242,246,251,0) 100%)}
.top{position:absolute;left:0;right:0;top:0;height:296px;background:linear-gradient(to bottom,rgba(244,247,251,.98) 0%,rgba(244,247,251,.96) 88%,rgba(244,247,251,0) 100%)}
.lst{position:absolute;left:64px;top:430px;width:430px}
.lst h2{font-weight:600;font-size:26px;color:#3c4f6e;margin-bottom:22px}
.lst div{display:flex;align-items:center;gap:14px;font-weight:600;font-size:28px;margin-bottom:20px;color:#0d1c38}
.lst b{width:12px;height:12px;border-radius:50%;background:#00a8bc;box-shadow:0 0 0 5px rgba(0,168,188,.16);flex:none}
.bot{position:absolute;left:0;right:0;bottom:0;height:168px;background:linear-gradient(to top,rgba(244,247,251,.98) 0%,rgba(244,247,251,.95) 80%,rgba(244,247,251,0) 100%)}
.eb{position:absolute;left:64px;top:52px;font-weight:600;font-size:22px;letter-spacing:.14em;color:#0b8fa1;display:flex;align-items:center;gap:10px}
.eb i{width:10px;height:10px;border-radius:50%;background:#34a853}
h1{position:absolute;left:64px;right:64px;top:92px;font-weight:700;font-size:62px;line-height:1.04;letter-spacing:-1.5px}
h1 em{font-style:normal;color:#0b8fa1}
.ft{position:absolute;left:64px;right:64px;bottom:56px;display:flex;align-items:center;justify-content:space-between}
.lk{display:flex;align-items:center;gap:12px;font-weight:700;font-size:30px;letter-spacing:-.5px}
.tg{font-weight:600;font-size:24px;color:#3c4f6e;margin-top:6px}
.cta{background:#0d1c38;color:#fff;font-weight:600;font-size:24px;border-radius:999px;padding:16px 28px;white-space:nowrap}
</style></head><body><div class="bg"></div><div class="left"></div><div class="top"></div><div class="bot"></div><div class="lst"><h2>O Google destacou:</h2><div><b></b>Assistente guiado</div><div><b></b>Mapeamento visual (BPMN)</div><div><b></b>Diagnóstico de gargalos</div><div><b></b>Comparação Antes × Depois</div><div><b></b>Plano de ação</div></div>
<div class="eb"><i></i>PESQUISA REAL · SEM EDIÇÃO</div>
<h1>Perguntamos ao Google<br>o que é o <em>NexoProcess.</em></h1>
<div class="ft"><div><div class="lk">${SYM}<span>NexoProcess</span></div><div class="tg">Mapeie. Analise. Melhore. Gere valor.</div></div><div class="cta">Conheça pelo link da bio</div></div>
</body></html>`;
(async () => {
  const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args: ['--allow-file-access-from-files'] });
  const p = await b.newPage({ viewport: { width: 1080, height: 1350 } });
  const f = path.join(W, '_alt.html'); fs.writeFileSync(f, html); await p.goto('file://' + f);
  await p.evaluate(() => document.fonts.ready); await p.waitForTimeout(200);
  await p.screenshot({ path: process.argv[2] }); fs.unlinkSync(f); await b.close(); console.log('ok');
})();
