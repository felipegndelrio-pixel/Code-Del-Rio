// NexoProcess — carrossel "O fio": um painel contínuo de 7560×1350 cortado em 7 slides de 1080×1350.
// Uso: node gera_fio.cjs  → painel.png, slides/slide_0N.png (o PDF sai de monta_pdf.py). Só capturas reais do app.
const { chromium } = require('/home/user/Code-Del-Rio/node_modules/playwright');
const fs = require('fs');
const R = '/home/user/Code-Del-Rio', A = `${R}/marketing/video/assets`, OUT = `${R}/marketing/carrossel-fio`;
const FD = `${R}/node_modules/@fontsource/ibm-plex-sans/files/ibm-plex-sans-latin`;
const ff = (w) => `@font-face{font-family:Plex;font-weight:${w};src:url(file://${FD}-${w}-normal.woff2) format('woff2');}`;
const S = 1080, H = 1350, X = (k) => S * (k - 1);
// ---------- o fio
const TAU = Math.PI * 2, sm = (x) => { x = Math.max(0, Math.min(1, x)); return x * x * (3 - 2 * x); };
const pts = []; const N = 110;
for (let i = 0; i <= N; i++) { const t = i / N;   // slide 1: o nó
  let x = 560 + 330 * (0.7 * Math.sin(TAU * 2 * t + 0.5) + 0.45 * Math.sin(TAU * 5 * t + 1.3));
  let y = 350 + 205 * (0.7 * Math.cos(TAU * 3 * t + 0.2) + 0.4 * Math.sin(TAU * 7 * t));
  const a = 1 - sm(t / 0.08), b = sm((t - 0.9) / 0.1);
  x = x * (1 - a) + -80 * a; y = y * (1 - a) + 240 * a; x = x * (1 - b) + 1080 * b; y = y * (1 - b) + 560 * b; pts.push([x, y]); }
for (const [x, y] of [[160, 545], [300, 640], [335, 775], [235, 822], [168, 722], [280, 560], [450, 472], [700, 442], [900, 492], [1080, 480]]) pts.push([S + x, y]);   // slide 2: uma volta solta
pts.push([S * 2 + 20, 480]);
let d = `M${pts[0][0].toFixed(1)},${pts[0][1].toFixed(1)}`;
for (let i = 0; i < pts.length - 1; i++) { const p0 = pts[Math.max(0, i - 1)], p1 = pts[i], p2 = pts[i + 1], p3 = pts[Math.min(pts.length - 1, i + 2)];
  d += ` C${(p1[0] + (p2[0] - p0[0]) / 6).toFixed(1)},${(p1[1] + (p2[1] - p0[1]) / 6).toFixed(1)} ${(p2[0] - (p3[0] - p1[0]) / 6).toFixed(1)},${(p2[1] - (p3[1] - p1[1]) / 6).toFixed(1)} ${p2[0].toFixed(1)},${p2[1].toFixed(1)}`; }
const r = 28;
// molduras: [slide, x, y, largura, altura]
const F3 = [3, 70, 480, 940, 560], F4 = [4, 250, 190, 760, 590], F5 = [5, 40, 300, 1000, 480], F6 = [6, 70, 400, 680, 750];
{ const [k, x, y, w, h] = F3, o = X(k), l = o + x, t = y, rt = l + w, b = y + h;   // desce, passa por baixo, sobe
  d += ` L${l - r},${t} Q${l},${t} ${l},${t + r} L${l},${b - r} Q${l},${b} ${l + r},${b} L${rt - r},${b} Q${rt},${b} ${rt},${b - r} L${rt},${t + r} Q${rt},${t} ${rt + r},${t} L${o + S},${t}`; }
const over = ([k, x, y, w, h], yin, yout) => { const o = X(k), l = o + x, t = y, rt = l + w;   // sobe, passa por cima, desce
  return ` L${l - r},${yin} Q${l},${yin} ${l},${yin - r} L${l},${t + r} Q${l},${t} ${l + r},${t} L${rt - r},${t} Q${rt},${t} ${rt},${t + r} L${rt},${yout - r} Q${rt},${yout} ${rt + r},${yout}`; };
d += ` C${X(4) + 130},480 ${X(4) + 95},780 ${X(4) + 222},780` + over(F4, 780, 780) + ` L${X(5)},780`;
d += over(F5, 780, 780) + ` L${X(6)},780` + over(F6, 780, 800) + ` L${X(7) + 772},800`;
// ---------- telas reais: [arquivo, larg, alt, x0, y0, fração da largura]
const CR = { 3: ['telas-4k/03b-mapa-macro-recorte.png', 2850, 1470, .055, .15, .62], 4: ['capturas-v2/diag-kpi-m.png', 1464, 4128, 0, .0545, 1],
  5: ['telas-4k/07-comparar-4k.png', 3840, 2160, .238, .44, .645], 6: ['capturas-v2/plano-m.png', 1464, 1734, 0, .018, 1] };
const frame = ([k, x, y, w, h], chipTop, chipX) => { const [f, W, Hh, x0, y0, fw] = CR[k], hf = (h / w) * fw * W / Hh;
  return `<div class="frame" style="left:${x}px;top:${y}px;width:${w}px;height:${h}px;background-image:url('file://${A}/${f}');background-size:${(100 / fw).toFixed(3)}% auto;background-position:${fw < 1 ? (100 * x0 / (1 - fw)).toFixed(3) : 0}% ${(100 * y0 / (1 - hf)).toFixed(3)}%"></div>
  <div class="chip" style="left:${chipX}px;top:${(chipTop ? y : y + h) - 31}px">Exemplo fictício · dados ilustrativos</div>`; };
const glows = [[300, 380, 620], [1500, 900, 560], [2700, 300, 600], [3900, 1000, 620], [4900, 250, 560], [5900, 950, 600], [7250, 800, 640]]
  .map(([x, y, s]) => `radial-gradient(circle at ${x}px ${y}px,rgba(23,50,99,.62),rgba(3,6,12,0) ${s}px)`).join(',');
const html = `<!doctype html><html><head><meta charset="utf-8"><style>
${ff(400)}${ff(700)}
*{margin:0;box-sizing:border-box}
body{width:${S * 7}px;height:${H}px;background:${glows},#03060c;font-family:Plex,sans-serif;color:#eef3fb;position:relative;overflow:hidden}
.slide{position:absolute;top:0;width:${S}px;height:${H}px;overflow:hidden}
svg.fio{position:absolute;left:0;top:0;pointer-events:none}
h2,.t{position:absolute;font-weight:700;letter-spacing:-.035em;line-height:1.02;white-space:nowrap}
em{font-style:normal;color:#00A8BC}
.ap{position:absolute;font-weight:400;font-size:38px;line-height:1.3;color:#b9c6da}
.frame{position:absolute;border-radius:${r}px;border:1.5px solid rgba(111,219,230,.3);background-color:#11151c;background-repeat:no-repeat;box-shadow:0 34px 90px rgba(0,0,0,.7)}
.chip{position:absolute;font-size:34px;line-height:1;font-weight:400;color:#c3cfe0;background:#03060c;border:1.5px solid rgba(111,219,230,.3);border-radius:99px;padding:13px 26px 15px;white-space:nowrap}
.btn{position:absolute;background:#00A8BC;color:#02161b;font-weight:700;font-size:46px;border-radius:99px;padding:28px 58px;white-space:nowrap}
</style></head><body>
<div class="slide" style="left:${X(1)}px">
  <div class="t" style="left:70px;top:548px;font-size:92px">Todo processo<br>tem uma</div>
  <div class="t" id="big" style="left:62px;top:730px;font-size:300px;color:#00A8BC;letter-spacing:-.05em;line-height:1">lógica.</div>
  <div class="ap" style="left:74px;top:1168px;font-size:40px">Mas nem sempre é fácil enxergar o todo.</div></div>
<div class="slide" style="left:${X(2)}px">
  <div class="t" style="left:70px;top:160px;font-size:156px">Planilhas.</div>
  <div class="t" style="left:500px;top:596px;font-size:104px;color:#9db0cb">E-mails.</div>
  <div class="t" style="left:70px;top:900px;font-size:92px;color:#dfe7f3">A memória de<br>quem executa.</div></div>
<div class="slide" style="left:${X(3)}px">
  <h2 style="left:70px;top:140px;font-size:124px">Mapeamento<br><em>visual.</em></h2>${frame(F3, true, 420)}</div>
<div class="slide" style="left:${X(4)}px">${frame(F4, false, 322)}
  <h2 style="left:70px;top:838px;font-size:116px"><em>Diagnóstico.</em></h2>
  <div class="ap" style="left:74px;top:982px">Onde estão o tempo, o esforço,<br>as esperas e o retrabalho.</div></div>
<div class="slide" style="left:${X(5)}px">${frame(F5, false, 70)}
  <h2 style="left:70px;top:870px;font-size:116px">Antes × <em>depois.</em></h2>
  <div class="ap" style="left:74px;top:1014px">Compare antes de mudar.</div></div>
<div class="slide" style="left:${X(6)}px">
  <h2 style="left:70px;top:140px;font-size:116px">Plano de <em>ação.</em></h2>
  <div class="ap" style="left:74px;top:284px">Responsável, prazo e critério de sucesso.</div>${frame(F6, false, 100)}</div>
<div class="slide" style="left:${X(7)}px">
  <div class="t" style="left:70px;top:160px;font-size:100px;line-height:1.16">Mapeie.<br>Diagnostique.<br>Transforme em <em>ação.</em></div>
  <div class="t" style="left:70px;top:872px;font-size:76px">NexoProcess</div>
  <div class="btn" style="left:70px;top:1040px">Conheça o NexoProcess</div></div>
<svg class="fio" width="${S * 7}" height="${H}" viewBox="0 0 ${S * 7} ${H}">
  <defs><filter id="g1" x="-5%" y="-30%" width="110%" height="160%"><feGaussianBlur stdDeviation="14"/></filter><filter id="g2" x="-5%" y="-30%" width="110%" height="160%"><feGaussianBlur stdDeviation="4"/></filter></defs>
  <path d="${d}" fill="none" stroke="#00A8BC" stroke-width="20" stroke-linecap="round" stroke-linejoin="round" opacity=".42" filter="url(#g1)"/>
  <path d="${d}" fill="none" stroke="#40C8D6" stroke-width="8" stroke-linecap="round" stroke-linejoin="round" opacity=".7" filter="url(#g2)"/>
  <path d="${d}" fill="none" stroke="#bff6fb" stroke-width="3.6" stroke-linecap="round" stroke-linejoin="round"/>
  <g transform="translate(${X(7) + 730},660) scale(4.375)"><rect x="2" y="2" width="60" height="60" rx="12" fill="#173263" stroke="rgba(127,233,245,.4)" stroke-width=".5"/><circle cx="17" cy="32" r="6.5" fill="#173263" stroke="#fff" stroke-width="4"/><path d="M23.5 32h7" stroke="#fff" stroke-width="4" stroke-linecap="round"/><path d="M41 21l11 11-11 11-11-11z" fill="#00A8BC"/></g>
</svg>
<script>document.fonts.ready.then(()=>{const b=document.getElementById('big');b.style.fontSize=(300*(1080-62-48)/b.getBoundingClientRect().width)+'px';document.body.dataset.ok=1})</script>
</body></html>`;
fs.writeFileSync(`${OUT}/painel.html`, html);
(async () => {
  const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args: ['--allow-file-access-from-files', '--no-sandbox'] });
  const p = await b.newPage({ viewport: { width: S * 7, height: H } });
  p.on('pageerror', (e) => { console.error('ERRO:', e.message); process.exitCode = 2; });
  await p.goto('file://' + `${OUT}/painel.html`); await p.waitForSelector('body[data-ok]'); await p.waitForTimeout(600);
  await p.screenshot({ path: `${OUT}/NexoProcess_Fio_painel_7560x1350.png` });
  for (let k = 1; k <= 7; k++) await p.screenshot({ path: `${OUT}/slides/slide_0${k}.png`, clip: { x: X(k), y: 0, width: S, height: H } });
  // menor texto e áreas seguras
  console.log(JSON.stringify(await p.evaluate(() => { let min = 999, out = []; document.querySelectorAll('.t,h2,.ap,.chip,.btn').forEach((e) => { const f = parseFloat(getComputedStyle(e).fontSize), q = e.getBoundingClientRect(); min = Math.min(min, f); if (q.top < 120 || q.bottom > 1230) out.push(e.textContent.slice(0, 20) + ' ' + Math.round(q.top) + '-' + Math.round(q.bottom)); }); return { menorTextoPx: min, foraDaAreaSegura: out }; })));
  await b.close();
})().catch((e) => { console.error(e); process.exit(1); });
