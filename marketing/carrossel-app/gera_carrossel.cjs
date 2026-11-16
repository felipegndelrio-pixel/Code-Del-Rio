// Carrossel NexoProcess (4:5, 1080×1350): slides em HTML → PNG por slide + PDF (documento do LinkedIn).
// Uso: node gera_carrossel.cjs   — usa só capturas reais do app e a fonte da marca (IBM Plex Sans).
const { chromium } = require('/home/user/Code-Del-Rio/node_modules/playwright');
const fs = require('fs'); const path = require('path');
const R = '/home/user/Code-Del-Rio', A = `${R}/marketing/video/assets`, OUT = `${R}/marketing/carrossel-app`;
const FD = `${R}/node_modules/@fontsource/ibm-plex-sans/files/ibm-plex-sans-latin`;
const ff = (w) => `@font-face{font-family:Plex;font-weight:${w};src:url(file://${FD}-${w}-normal.woff2) format('woff2');}`;
const img = (n) => `file://${A}/${n}`;
// recorte real: [arquivo, largura_img, altura_img, x0, y0, w, h] (frações da captura)
const CROP = {
  mapa: ['telas-4k/03b-mapa-macro-recorte.png', 2850, 1470, 0, 0, 1, 1],
  diag: ['telas-4k/05-diagnostico-4k.png', 3840, 2160, .225, .18, .75, .8],
  comp: ['telas-4k/07-comparar-4k.png', 3840, 2160, .25, .46, .71, .5],
  plano: ['telas-4k/08-plano-4k.png', 3840, 2160, .23, .22, .75, .76],
};
const FW = 920;
const frame = (k) => { const [f, W, H, x, y, w, h] = CROP[k]; const fh = FW * (h * H) / (w * W);
  return `<div class="frame" style="width:${FW}px;height:${fh.toFixed(0)}px;background:url('${img(f)}') no-repeat;background-size:${(100 / w).toFixed(3)}% auto;background-position:${(100 * x / (1 - w)).toFixed(3)}% ${(100 * y / (1 - h)).toFixed(3)}%"></div>`; };
const logo = `<svg viewBox="0 0 64 64" class="logo"><rect x="2" y="2" width="60" height="60" rx="12" fill="#173263" stroke="rgba(127,233,245,.35)" stroke-width=".6"/><circle cx="17" cy="32" r="6.5" fill="none" stroke="#fff" stroke-width="4"/><path d="M23.5 32h7" stroke="#fff" stroke-width="4" stroke-linecap="round"/><path d="M41 21l11 11-11 11-11-11z" fill="#00A8BC"/></svg>`;
const foot = (arrow) => `<div class="foot">${logo}<span>NexoProcess</span>${arrow ? '<em class="arr">Arraste →</em>' : ''}</div>`;
const tela = (k, titulo, texto, legenda) => `<section class="slide">
  <div class="glow"></div>
  <div class="top"><h2>${titulo}</h2><p>${texto}</p></div>
  <div class="stage">${frame(k)}</div>
  <p class="legenda">${legenda}</p>
  ${foot(true)}</section>`;
const html = `<!doctype html><html><head><meta charset="utf-8"><style>
${ff(400)}${ff(600)}${ff(700)}
@page{size:1080px 1350px;margin:0}
*{margin:0;box-sizing:border-box}
body{background:#03060c;font-family:Plex,sans-serif;color:#eef3fb}
.slide{width:1080px;height:1350px;position:relative;overflow:hidden;background:#03060c;padding:96px 90px 80px;display:flex;flex-direction:column;page-break-after:always}
.glow{position:absolute;inset:0;background:radial-gradient(circle at 78% 18%,rgba(0,168,188,.22),rgba(3,6,12,0) 46%),radial-gradient(circle at 15% 88%,rgba(23,50,99,.55),rgba(3,6,12,0) 55%);pointer-events:none}
.top,.stage,.legenda,.foot{position:relative}
h1,h2{font-weight:700;letter-spacing:-.03em;line-height:1.04}
h1{font-size:112px}h2{font-size:84px}
h2 em,h1 em{font-style:normal;color:#6fdbe6}
.top p{font-size:36px;line-height:1.35;color:#b9c6da;margin-top:26px;max-width:880px}
.stage{flex:1;display:flex;align-items:center;justify-content:center;margin-top:44px}
.frame{border-radius:26px;border:1.5px solid rgba(111,219,230,.45);box-shadow:0 30px 80px rgba(0,0,0,.65),0 0 60px rgba(64,200,214,.16);background-color:#11151c}
.legenda{font-size:26px;color:#7f93b2;margin-bottom:26px}
.foot{display:flex;align-items:center;gap:18px;font-weight:600;font-size:30px;color:#dfe8f5}
.logo{width:58px;height:58px}
.arr{margin-left:auto;font-style:normal;font-size:26px;color:#6fdbe6}
.cover{justify-content:space-between}
.cover .hero{margin-top:auto}
.cover .sub{font-size:44px;color:#b9c6da;margin-top:34px;line-height:1.3}
.big{font-size:128px;font-weight:700;letter-spacing:-.04em;line-height:1.02;margin-top:auto}
.trilho{display:flex;flex-direction:column;gap:28px;margin:auto 0;padding-left:8px}
.passo{display:flex;align-items:center;gap:34px;font-size:92px;font-weight:700;letter-spacing:-.03em}
.no{width:34px;height:34px;border-radius:50%;border:9px solid #fff;flex:none;box-shadow:0 0 18px rgba(127,233,245,.6)}
.no.dm{border:0;border-radius:8px;width:40px;height:40px;background:#00A8BC;transform:rotate(45deg);box-shadow:0 0 22px rgba(64,200,214,.9)}
.cta{margin-top:auto;font-size:50px;font-weight:600}
.btn{display:inline-block;margin-top:40px;background:#6fdbe6;color:#04212a;font-weight:700;font-size:42px;border-radius:99px;padding:26px 56px}
.nota{font-size:24px;color:#7f93b2;margin-top:34px}
</style></head><body>
<section class="slide cover"><div class="glow"></div>
  <div class="hero"><h1>Todo processo tem uma <em>lógica.</em></h1>
  <p class="sub">Mas nem sempre é fácil enxergar o todo.</p></div>
  ${foot(true)}</section>
<section class="slide"><div class="glow"></div>
  <div class="big" style="font-size:104px">Processos vivem em planilhas, <span style="white-space:nowrap">e-mails</span> e na memória de quem executa.</div>
  <p class="sub" style="font-size:40px;color:#b9c6da;margin-top:40px">Quando o fluxo não está visível, ninguém sabe onde ele trava.</p>
  <div style="margin-top:auto"></div>${foot(true)}</section>
${tela('mapa', 'Mapeamento <em>visual.</em>', 'Desenhe o fluxo como ele acontece, em notação BPMN, sem precisar dominar a notação.', 'Tela real do app · exemplo fictício')}
${tela('diag', '<em>Diagnóstico.</em>', 'Veja onde estão o tempo, o esforço, as esperas e o retrabalho.', 'Tela real do app · dados ilustrativos')}
${tela('comp', 'Compare antes <em>e depois.</em>', 'Hoje × cenário futuro, em tempo, esforço e custo, antes de mudar qualquer coisa.', 'Tela real do app · dados ilustrativos')}
${tela('plano', 'Plano de <em>ação.</em>', 'Cada ação com responsável, prazo e critério de sucesso.', 'Tela real do app · exemplo fictício')}
<section class="slide"><div class="glow"></div>
  <div class="trilho">
    <div class="passo"><span class="no"></span>Mapeie.</div>
    <div class="passo"><span class="no"></span>Diagnostique.</div>
    <div class="passo"><span class="no dm"></span><span>Transforme em <em style="font-style:normal;color:#6fdbe6">ação.</em></span></div>
  </div>
  <div class="cta"><div style="font-size:72px;font-weight:700;letter-spacing:-.03em;line-height:1.05">NexoProcess</div>
  <p style="font-size:36px;color:#b9c6da;margin-top:20px;font-weight:400">Clareza para transformar processos em ação.</p>
  <span class="btn">Conheça o NexoProcess</span>
  <p class="nota">Telas do app com dados fictícios para demonstração.</p></div>
  <div style="height:40px"></div>${foot(false)}</section>
</body></html>`;
fs.writeFileSync(path.join(OUT, 'carrossel.html'), html);
(async () => {
  const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args: ['--allow-file-access-from-files', '--no-sandbox'] });
  const p = await b.newPage({ viewport: { width: 1080, height: 1350 } });
  p.on('pageerror', (e) => { console.error('ERRO:', e.message); process.exitCode = 2; });
  await p.goto('file://' + path.join(OUT, 'carrossel.html')); await p.evaluate(() => document.fonts.ready); await p.waitForTimeout(500);
  const n = await p.locator('.slide').count();
  for (let i = 0; i < n; i++) await p.locator('.slide').nth(i).screenshot({ path: path.join(OUT, 'slides', `slide_${String(i + 1).padStart(2, '0')}.png`) });
  await p.pdf({ path: path.join(OUT, 'NexoProcess_Carrossel_4x5.pdf'), width: '1080px', height: '1350px', printBackground: true, preferCSSPageSize: true });
  await b.close(); console.log('slides', n);
})().catch((e) => { console.error(e); process.exit(1); });
