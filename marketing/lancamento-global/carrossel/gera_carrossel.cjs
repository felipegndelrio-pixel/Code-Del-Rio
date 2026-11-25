// NexoProcess Goes Global — slides 2 e 3 do carrossel (1080×1350, mesma proporção do slide 1).
// Slide 2 "It’s the wait." (cena gerada por IA, quadro 96 retocado) · Slide 3 produto (mockup com telas reais em inglês + lupa).
// Uso: node gera_carrossel.cjs [teste]   → exports/ (PNG @2x, JPG 1080×1350) e PDF de 3 páginas para o LinkedIn
const { chromium } = require('/home/user/Code-Del-Rio/node_modules/playwright');
const fs = require('fs'); const { execFileSync } = require('child_process');
const R = '/home/user/Code-Del-Rio', D = `${R}/marketing/lancamento-global/carrossel`;
const FD = `${R}/node_modules/@fontsource/ibm-plex-sans/files/ibm-plex-sans`;
const ff = (w) => ['latin', 'latin-ext'].map((s) => `@font-face{font-family:Plex;font-weight:${w};src:url(file://${FD}-${s}-${w}-normal.woff2) format('woff2');}`).join('');
const LOGO = (s) => `<svg viewBox="0 0 64 64" style="width:${s}px;height:${s}px;flex:none"><rect x="2" y="2" width="60" height="60" rx="12" fill="#173263" stroke="rgba(127,233,245,.4)" stroke-width=".6"/><circle cx="17" cy="32" r="6.5" fill="none" stroke="#fff" stroke-width="4"/><path d="M23.5 32h7" stroke="#fff" stroke-width="4" stroke-linecap="round"/><path d="M41 21l11 11-11 11-11-11z" fill="#00A8BC"/></svg>`;
const CENA = `file://${D}/fontes/cena_96_limpa.png`;
const MOCK = `file://${R}/marketing/lancamento-global/mockup/mockup_en.png`;
const MAPA = `file://${R}/marketing/video/assets/telas-en/en_desk_mapa_1444x896@2x.png`;
const W = 1080, H = 1350;
// mockup no slide 3 e ponto ampliado pela lupa (coordenadas da captura 2888×1792 → mockup 2110×1339)
const MK = { x: 40, y: 318, w: 1000 }, MS = MK.w / 2110;
const ZP = [1880, 1446];                                                      // nó "Picking" com "1 bottleneck · 1 rework"
const TGT = [MK.x + (227 + ZP[0] / 2) * MS, MK.y + (101 + ZP[1] / 2) * MS];  // mesmo ponto na tela do notebook
const LUPA = { cx: 252, cy: 912, r: 186, view: 330 };                         // view = largura da captura visível na lupa
const base = `${ff(400)}${ff(600)}${ff(700)}
*{margin:0;box-sizing:border-box}
html,body{width:${W}px;height:${H}px;overflow:hidden;background:#03060c}
body{position:relative;font-family:Plex,sans-serif;color:#f2f6fc}
.eye{position:absolute;left:72px;top:84px;font-weight:600;font-size:22px;letter-spacing:.34em;color:#6fdbe6}
.foot{position:absolute;left:72px;right:72px;bottom:62px;display:flex;align-items:center;justify-content:space-between}
.brand{display:flex;align-items:center;gap:16px;font-weight:700;font-size:36px;letter-spacing:-.02em}
.small{font-size:17px;font-weight:600;letter-spacing:.16em;color:#7f93b2}
#grain{position:absolute;inset:0;opacity:.07;mix-blend-mode:overlay;pointer-events:none}
.vig{position:absolute;inset:0;background:radial-gradient(ellipse at 50% 46%,rgba(0,0,0,0) 56%,rgba(0,0,0,.55) 100%);pointer-events:none}`;
const grain = `<canvas id="grain" width="540" height="675" style="width:${W}px;height:${H}px"></canvas><script>{const c=document.getElementById('grain').getContext('2d'),d=c.createImageData(540,675);let s=9;for(let i=0;i<d.data.length;i+=4){s=(s*1103515245+12345)&0x7fffffff;const v=s>>>23;d.data[i]=d.data[i+1]=d.data[i+2]=v;d.data[i+3]=255}c.putImageData(d,0,0)}</script>`;

const slide2 = (canal) => `<!doctype html><html><head><meta charset="utf-8"><style>${base}
#bg{position:absolute;inset:0;background:radial-gradient(ellipse at 50% 50%,rgba(14,40,70,.5),rgba(3,6,12,0) 62%),#03060c}
#photo{position:absolute;left:0;top:352px;width:${W}px;height:608px;background:url('${CENA}') center/cover no-repeat;
  filter:saturate(.82) contrast(1.08) brightness(.9);-webkit-mask-image:linear-gradient(180deg,transparent 0%,#000 14%,#000 80%,transparent 100%)}
#tone{position:absolute;left:0;top:352px;width:${W}px;height:608px;background:linear-gradient(180deg,rgba(3,6,12,0) 45%,rgba(3,6,12,.62) 82%,rgba(3,6,12,0) 100%),linear-gradient(90deg,rgba(3,6,12,.45),rgba(3,6,12,0) 22%,rgba(3,6,12,0) 78%,rgba(3,6,12,.45))}
h1{position:absolute;left:72px;top:124px;font-weight:700;font-size:78px;line-height:1.03;letter-spacing:-.035em;color:#fff}
#wait{position:absolute;left:0;right:0;top:770px;text-align:center;font-weight:700;font-size:150px;letter-spacing:-.05em;line-height:1;color:#f5b84a;
  text-shadow:0 10px 50px rgba(0,0,0,.85),0 0 60px rgba(245,184,74,.22)}
.bars{position:absolute;left:72px;right:72px;top:1004px}
.lab{font-size:27px;font-weight:600;color:#dbe4f1;display:flex;justify-content:space-between}
.lab b{font-weight:700}
.bar{height:16px;border-radius:5px;margin:12px 0 26px}
.note{font-size:18px;color:#8ea1bd;letter-spacing:.02em}
</style></head><body><div id="bg"></div><div id="photo"></div><div id="tone"></div><div class="vig"></div>
<div class="eye">THE INVISIBLE WAIT</div>
<h1>Sometimes the problem<br>isn’t the work.</h1>
<div id="wait">It’s the wait.</div>
<div class="bars">
  <div class="lab"><span><b style="color:#f5b84a">11 h</b> waiting</span></div><div class="bar" style="width:100%;background:linear-gradient(90deg,#f5b84a,#f0a531);box-shadow:0 0 24px rgba(245,184,74,.35)"></div>
  <div class="lab"><span><b style="color:#3fd0de">2 h 15 min</b> of actual work</span></div><div class="bar" style="width:${(100 * 2.25 / 11).toFixed(1)}%;background:linear-gradient(90deg,#3fd0de,#00A8BC);box-shadow:0 0 24px rgba(63,208,222,.4)"></div>
  <div class="note">Per order · fictional sample · calculated in NexoProcess</div>
</div>
<div class="foot"><div class="brand">${LOGO(48)}<span>NexoProcess</span></div><div class="small">SCENE: AI-GENERATED</div></div>
${grain}</body></html>`;

const slide3 = (canal) => {
  const k = (2 * LUPA.r) / LUPA.view, bs = 2888 * k, bx = LUPA.r - ZP[0] * k, by = LUPA.r - ZP[1] * k;
  const ang = Math.atan2(TGT[1] - LUPA.cy, TGT[0] - LUPA.cx), ex = LUPA.cx + LUPA.r * Math.cos(ang), ey = LUPA.cy + LUPA.r * Math.sin(ang);
  const sub = { ig: 'Link in bio', li: 'Link in the first comment' }[canal];
  return `<!doctype html><html><head><meta charset="utf-8"><style>${base}
#bg{position:absolute;inset:0;background:radial-gradient(ellipse at 52% 52%,rgba(14,52,110,.5) 0%,rgba(8,22,48,.25) 40%,rgba(3,6,12,0) 70%),#03060c}
h1{position:absolute;left:72px;top:124px;font-weight:700;font-size:84px;line-height:1.02;letter-spacing:-.04em;color:#fff}
h1 em{font-style:normal;color:#f5b84a}
#floor{position:absolute;left:${MK.x + 90}px;top:${MK.y + 560}px;width:${MK.w - 180}px;height:120px;border-radius:50%;background:radial-gradient(ellipse at 50% 50%,rgba(64,200,214,.3),rgba(3,6,12,0) 70%);filter:blur(12px)}
#mk{position:absolute;left:${MK.x}px;top:${MK.y}px;width:${MK.w}px;filter:drop-shadow(0 26px 40px rgba(0,0,0,.75)) drop-shadow(0 0 30px rgba(64,200,214,.16))}
#mk img{width:100%;display:block}
svg#ln{position:absolute;left:0;top:0;width:${W}px;height:${H}px;pointer-events:none}
#lupa{position:absolute;left:${LUPA.cx - LUPA.r}px;top:${LUPA.cy - LUPA.r}px;width:${2 * LUPA.r}px;height:${2 * LUPA.r}px;border-radius:50%;
  background:#0e1117 url('${MAPA}') no-repeat;background-size:${bs.toFixed(1)}px auto;background-position:${bx.toFixed(1)}px ${by.toFixed(1)}px;
  border:3px solid #bff6fb;box-shadow:0 0 0 8px rgba(64,200,214,.14),0 24px 60px rgba(0,0,0,.8),0 0 50px rgba(64,200,214,.35)}
#lupa:after{content:"";position:absolute;inset:0;border-radius:50%;background:radial-gradient(circle at 32% 26%,rgba(255,255,255,.14),rgba(255,255,255,0) 42%)}
.feat{position:absolute;left:478px;top:1004px;right:60px}
.feat div{display:flex;align-items:center;gap:20px;font-size:29px;font-weight:600;color:#e6edf7;margin-bottom:24px;white-space:nowrap}
.feat i{width:16px;height:16px;background:#00A8BC;transform:rotate(45deg);border-radius:3px;box-shadow:0 0 14px rgba(64,200,214,.8);flex:none}
.pill{background:linear-gradient(90deg,#6fdbe6,#3fd0de);color:#02161b;font-weight:700;font-size:22px;letter-spacing:.06em;border-radius:99px;padding:16px 30px;box-shadow:0 0 34px rgba(64,200,214,.4)}
.cta{display:flex;flex-direction:column;align-items:flex-end;gap:10px}
</style></head><body><div id="bg"></div>
<div class="eye">THE ENGLISH EDITION</div>
<h1>See where your<br>process <em>waits.</em></h1>
<div id="floor"></div><div id="mk"><img src="${MOCK}"></div>
<svg id="ln"><line x1="${TGT[0].toFixed(1)}" y1="${TGT[1].toFixed(1)}" x2="${ex.toFixed(1)}" y2="${ey.toFixed(1)}" stroke="#bff6fb" stroke-width="2.5" stroke-dasharray="7 6" opacity=".9"/>
  <circle cx="${TGT[0].toFixed(1)}" cy="${TGT[1].toFixed(1)}" r="18" fill="none" stroke="#bff6fb" stroke-width="2.5"/><circle cx="${TGT[0].toFixed(1)}" cy="${TGT[1].toFixed(1)}" r="5" fill="#bff6fb"/></svg>
<div id="lupa"></div>
<div class="feat"><div><i></i>Import your spreadsheet.</div><div><i></i>See bottlenecks and rework.</div><div><i></i>Turn them into an action plan.</div></div>
<div class="foot"><div class="brand">${LOGO(48)}<span>NexoProcess</span></div><div class="cta"><div class="pill">GET IT ON GUMROAD</div><div class="small">${sub.toUpperCase()}</div></div></div>
<div class="vig"></div>${grain}</body></html>`;
};

(async () => {
  const teste = process.argv[2] === 'teste', OUT = `${D}/${teste ? 'work' : 'exports'}`;
  fs.mkdirSync(OUT, { recursive: true }); fs.mkdirSync(`${D}/work`, { recursive: true });
  const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args: ['--allow-file-access-from-files'] });
  const jobs = [['slide2_its_the_wait', slide2('ig')], ['slide3_produto_instagram', slide3('ig')], ['slide3_produto_linkedin', slide3('li')]];
  for (const [nome, html] of jobs) {
    const p = await b.newPage({ viewport: { width: W, height: H }, deviceScaleFactor: 2 });
    p.on('pageerror', (e) => { console.error('ERRO:', e.message); process.exitCode = 2; });
    const hf = `${D}/work/${nome}.html`; fs.writeFileSync(hf, html); await p.goto('file://' + hf);
    await p.evaluate(async () => { await document.fonts.ready; await Promise.all([...document.images].map((i) => i.decode().catch(() => 0))); }); await p.waitForTimeout(400);
    const png = `${OUT}/NexoProcess_GoesGlobal_${nome}@2x.png`; await p.screenshot({ path: png });
    execFileSync('python3', ['-I', '-c', `from PIL import Image;Image.open('${png}').convert('RGB').resize((${W},${H}),Image.LANCZOS).save('${png.replace('@2x.png', '.jpg')}',quality=92,optimize=True,progressive=True)`]);
    await p.close();
  }
  await b.close(); console.log('ok');
})().catch((e) => { console.error(e); process.exit(1); });
