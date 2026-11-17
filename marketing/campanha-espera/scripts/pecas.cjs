// Capas (A/B) e Stories da campanha "A espera invisível". 1080×1920. Uso: node pecas.cjs
// Áreas livres nos Stories são para figurinhas nativas do Instagram (enquete, caixa de pergunta, link).
const { chromium } = require('/home/user/Code-Del-Rio/node_modules/playwright');
const fs = require('fs');
const R = '/home/user/Code-Del-Rio', F = `${R}/marketing/campanha-espera`, A = `${R}/marketing/video/assets`;
const FD = `${R}/node_modules/@fontsource/ibm-plex-sans/files/ibm-plex-sans`;
const ff = (w) => ['latin', 'latin-ext'].map((s) => `@font-face{font-family:Plex;font-weight:${w};src:url(file://${FD}-${s}-${w}-normal.woff2) format('woff2');}`).join('');
const logo = (s) => `<svg viewBox="0 0 64 64" style="width:${s}px;height:${s}px"><rect x="2" y="2" width="60" height="60" rx="12" fill="#173263" stroke="rgba(127,233,245,.35)" stroke-width=".6"/><circle cx="17" cy="32" r="6.5" fill="none" stroke="#fff" stroke-width="4"/><path d="M23.5 32h7" stroke="#fff" stroke-width="4" stroke-linecap="round"/><path d="M41 21l11 11-11 11-11-11z" fill="#00A8BC"/></svg>`;
const marca = (top) => `<div class="marca" style="top:${top}px">${logo(66)}<span>NexoProcess</span></div>`;
const barras = (top, lab = true) => `<div class="bars" style="top:${top}px">
  <div class="bar">${lab ? '<b>11 h · <span>espera</span></b>' : ''}<i class="ia" style="width:860px"></i></div>
  <div class="bar">${lab ? '<b>2 h 15 min · <span>trabalho</span></b>' : ''}<i class="it" style="width:${Math.round(860 * 2.25 / 11)}px"></i></div></div>`;
const mapa = (x, y, w, h) => `<div class="pan" style="left:${x}px;top:${y}px;width:${w}px;height:${h}px;background-image:url('file://${A}/telas-4k/03b-mapa-macro-recorte.png');background-size:${(2850 / 1660 * 100).toFixed(2)}% auto;background-position:${(100 * 360 / (2850 - 1660)).toFixed(2)}% ${(100 * 300 / (1470 - 1660 * h / w)).toFixed(2)}%"></div>`;
const PECAS = {
  capa_A: `<div class="tag" style="top:330px">Exemplo fictício · calculado no NexoProcess</div>
    <div class="h" style="top:420px;font-size:250px;letter-spacing:-.05em;line-height:.9;color:#f5b84a">11 h</div>
    <div class="h" style="top:660px;font-size:92px">parado.</div>
    <div class="h" style="top:800px;font-size:92px;color:#3fd0de">2 h 15 min</div>
    <div class="h" style="top:900px;font-size:92px">trabalhando.</div>
    ${barras(1060, false)}
    <div class="h" style="top:1340px;font-size:58px;color:#dbe4f1;font-weight:600">Onde o seu processo espera?</div>${marca(1490)}`,
  capa_B: `<div class="tag" style="top:330px">Gestão de processos · na prática</div>
    <div class="h" style="top:430px;font-size:118px">Quanto do seu<br>processo é</div>
    <div class="h" style="top:680px;font-size:230px;letter-spacing:-.05em;line-height:.95;color:#f5b84a">espera?</div>
    ${barras(1000)}
    <div class="tag" style="top:1250px">Por execução · exemplo fictício</div>${marca(1480)}`,
  capa_LinkedIn_4x5: `<div class="tag" style="top:90px">Exemplo fictício · calculado no NexoProcess</div>
    <div class="h" style="top:170px;font-size:250px;letter-spacing:-.05em;line-height:.9;color:#f5b84a">11 h</div>
    <div class="h" style="top:410px;font-size:92px">parado.</div>
    <div class="h" style="top:545px;font-size:92px;color:#3fd0de">2 h 15 min</div>
    <div class="h" style="top:645px;font-size:92px">trabalhando.</div>
    ${barras(780, false)}
    <div class="h" style="top:1050px;font-size:58px;color:#dbe4f1;font-weight:600">Onde o seu processo espera?</div>${marca(1180)}`,
  story_1_teaser: `<div class="tag" style="top:290px">Novo Reel</div>
    <div class="h" style="top:370px;font-size:96px">Um pedido.</div>
    <div class="h" style="top:490px;font-size:150px;color:#f5b84a;letter-spacing:-.045em">11 h parado.</div>
    <div class="h" style="top:680px;font-size:82px;color:#3fd0de">2 h 15 min trabalhando.</div>
    ${barras(880)}
    <div class="h" style="top:1150px;font-size:64px;color:#dbe4f1;font-weight:600">Onde ele trava?<br>Está no Reel.</div>
    <div class="tag" style="top:1640px">Exemplo fictício · calculado no NexoProcess</div>`,
  story_2_enquete: `<div class="tag" style="top:290px">Enquete rápida</div>
    <div class="h" style="top:380px;font-size:112px">No seu processo,<br>o que pesa mais?</div>
    ${barras(720, false)}
    <div class="tag" style="top:1640px">Responda e veja o resultado.</div>`,
  story_3_pergunta: `<div class="tag" style="top:290px">Conte pra gente</div>
    <div class="h" style="top:380px;font-size:104px">Qual etapa do<br>seu processo<br><span style="color:#f5b84a">mais espera?</span></div>
    <div class="tag" style="top:1640px">As respostas podem virar conteúdo, sem identificar ninguém.</div>`,
  story_4_link: `<div class="h" style="top:300px;font-size:104px">Descubra onde<br>o seu processo<br><span style="color:#f5b84a">espera.</span></div>
    ${mapa(60, 760, 960, 520)}
    <div class="tag" style="top:1300px">Tela real do app · exemplo fictício</div>${marca(1660)}`,
};
const css = `${ff(400)}${ff(600)}${ff(700)}
*{margin:0;box-sizing:border-box}
body{width:1080px;height:var(--h,1920px);position:relative;overflow:hidden;font-family:Plex,sans-serif;color:#eef3fb;
  background:radial-gradient(circle at 26% 22%,rgba(23,50,99,.6),rgba(3,6,12,0) 50%),radial-gradient(circle at 80% 82%,rgba(0,168,188,.13),rgba(3,6,12,0) 44%),#03060c}
.h{position:absolute;left:72px;right:72px;font-weight:700;letter-spacing:-.035em;line-height:1.04}
.tag{position:absolute;left:72px;right:72px;font-size:36px;font-weight:600;color:#8ea1bd}
.bars{position:absolute;left:72px;width:860px}
.bar{position:relative;height:34px;margin-top:66px}
.bar i{position:absolute;left:0;top:0;bottom:0;border-radius:6px}
.ia{background:linear-gradient(90deg,#f5b84a,#f0a531);box-shadow:0 0 34px rgba(245,184,74,.35)}
.it{background:linear-gradient(90deg,#3fd0de,#00A8BC);box-shadow:0 0 34px rgba(63,208,222,.4)}
.bar b{position:absolute;left:0;top:-50px;font-size:38px;font-weight:600;white-space:nowrap;color:#dbe4f1}
.marca{position:absolute;left:72px;display:flex;align-items:center;gap:20px;font-weight:700;font-size:48px;letter-spacing:-.02em}
.pan{position:absolute;border-radius:24px;border:1.5px solid rgba(111,219,230,.5);background-color:#11151c;background-repeat:no-repeat;box-shadow:0 40px 90px rgba(0,0,0,.7)}`;
(async () => {
  const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args: ['--allow-file-access-from-files'] });
  const p = await b.newPage({ viewport: { width: 1080, height: 1920 } });
  p.on('pageerror', (e) => { console.error('ERRO:', e.message); process.exitCode = 2; });
  for (const [nome, corpo] of Object.entries(PECAS)) {
    const f = `${F}/work/${nome}.html`; fs.writeFileSync(f, `<!doctype html><html><head><meta charset="utf-8"><style>${css}</style></head><body>${corpo}</body></html>`);
    const hh = nome.includes('4x5') ? 1350 : 1920; await p.setViewportSize({ width: 1080, height: hh });
    await p.goto('file://' + f); await p.evaluate((x) => { document.body.style.setProperty('--h', x + 'px'); return document.fonts.ready; }, hh); await p.waitForTimeout(300);
    const dest = nome.includes('4x5') ? `${F}/exports/por_plataforma/3_LinkedIn_capa_4x5.png` : nome.startsWith('capa') ? `${F}/exports/NexoProcess_Espera_${nome}.png` : `${F}/exports/stories/${nome}.png`;
    await p.screenshot({ path: dest });
  }
  await b.close(); console.log('ok', Object.keys(PECAS).length);
})().catch((e) => { console.error(e); process.exit(1); });
