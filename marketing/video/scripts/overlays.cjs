// Gera PNGs transparentes (quadro inteiro) com os textos de tela, na fonte do app (IBM Plex Sans).
const { chromium } = require('/home/user/Code-Del-Rio/node_modules/playwright');
const path = require('path');
const OUT = process.argv[2];
const F = '/home/user/Code-Del-Rio/node_modules/@fontsource/ibm-plex-sans/files';
const face = (w) => ['latin', 'latin-ext'].map((s) => `@font-face{font-family:Plex;font-weight:${w};src:url(file://${F}/ibm-plex-sans-${s}-${w}-normal.woff2) format('woff2');}`).join('');
const CSS = face(500) + face(600) + face(700) + `
*{margin:0;box-sizing:border-box} html,body{background:transparent;font-family:Plex,sans-serif}
.cap{position:absolute;color:#fff;font-weight:700;letter-spacing:-0.5px;line-height:1.15;background:rgba(13,28,56,.86);border:1px solid rgba(0,168,188,.45);box-shadow:0 10px 40px rgba(0,0,0,.35)}
.cap:before{content:"";position:absolute;left:0;top:18%;bottom:18%;width:6px;border-radius:3px;background:#00A8BC}
.selo{position:absolute;font-weight:600;color:#f5c66a;background:rgba(40,30,8,.82);border:1px solid rgba(245,198,106,.55);border-radius:999px}`;

const REELS = {
  r1: 'Seu processo vive numa planilha?',
  r2: 'Ninguém enxerga onde ele trava.',
  r3: 'Do caos ao fluxo.',
  r4: 'Vira um mapa visual',
  r5: 'Gargalo e retrabalho à vista',
  r6: 'Tempo, esforço e custo',
  r7: 'Cada sugestão com a evidência',
  r8: 'Plano com dono e prazo',
  r10: 'Responda perguntas simples',
};
const LINKEDIN = { ...REELS, r9: 'Hoje × futuro, lado a lado' };

(async () => {
  const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
  async function render(w, h, html, file) {
    const p = await b.newPage({ viewport: { width: w, height: h } });
    const hf = path.join(OUT, '_tmp.html');
    require('fs').writeFileSync(hf, `<html><head><meta charset="utf-8"><style>${CSS}</style></head><body style="width:${w}px;height:${h}px;position:relative">${html}</body></html>`);
    await p.goto('file://' + hf);
    await p.evaluate(async () => { await document.fonts.ready; return [...document.fonts].filter(f=>f.status==='loaded').length; }).then(n=>{ if(!n) throw new Error('fonte não carregou'); });
    await p.waitForTimeout(150);
    await p.screenshot({ path: path.join(OUT, file), omitBackground: true });
    await p.close();
  }
  // Reels 1080x1920: legenda centrada em y≈1400 (fora da faixa de interface do Instagram); selo no topo.
  for (const [k, t] of Object.entries(REELS)) {
    await render(1080, 1920, `<div class="cap" style="left:50%;top:1400px;transform:translate(-50%,-50%);font-size:56px;padding:28px 40px 28px 48px;border-radius:22px;width:max-content;max-width:940px;text-align:center">${t}</div>`, `reels-${k}.png`);
  }
  await render(1080, 1920, `<div class="selo" style="left:50%;top:232px;transform:translateX(-50%);font-size:30px;padding:12px 28px;white-space:nowrap">Demonstração com dados fictícios</div>`, 'reels-selo.png');
  // LinkedIn 1920x1080: legenda no terço inferior esquerdo; selo no canto superior direito.
  for (const [k, t] of Object.entries(LINKEDIN)) {
    await render(1920, 1080, `<div class="cap" style="left:96px;bottom:92px;font-size:58px;padding:26px 44px 26px 52px;border-radius:20px;white-space:nowrap">${t}</div>`, `li-${k}.png`);
  }
  await render(1920, 1080, `<div class="selo" style="right:72px;top:56px;font-size:26px;padding:10px 24px">Demonstração com dados fictícios</div>`, 'li-selo.png');
  await b.close();
  console.log('ok');
})().catch((e) => { console.error(e); process.exit(1); });
