// Elementos gráficos da campanha (PNG) + imagens estáticas. Fonte IBM Plex Sans; cores da marca NexoProcess.
// Os textos de destaque usam EXATAMENTE os nomes das funcionalidades exibidos na resposta do Google.
const { chromium } = require('/home/user/Code-Del-Rio/node_modules/playwright');
const fs = require('fs'); const path = require('path');
const W = '/home/user/Code-Del-Rio/output/NexoProcess_Campanha_Google/_work';
const OUTD = '/home/user/Code-Del-Rio/output/NexoProcess_Campanha_Google';
const G = JSON.parse(fs.readFileSync(`${W}/geo.json`, 'utf8'));
const FD = '/home/user/Code-Del-Rio/node_modules/@fontsource/ibm-plex-sans/files';
const face = (w) => ['latin', 'latin-ext'].map((s) => `@font-face{font-family:Plex;font-weight:${w};src:url(file://${FD}/ibm-plex-sans-${s}-${w}-normal.woff2) format('woff2');}`).join('');
const SYM = fs.readFileSync('/home/user/Code-Del-Rio/marketing/video/assets/marca/nexoprocess-simbolo.svg', 'utf8');
const sym = (px) => SYM.replace('<svg ', `<svg width="${px}" height="${px}" `);
const CSS = face(400) + face(500) + face(600) + face(700) + `*{margin:0;box-sizing:border-box}html,body{background:transparent;font-family:Plex,system-ui,sans-serif}
body{position:relative;overflow:hidden;color:#0d1c38}
.t{position:absolute;font-weight:700;letter-spacing:-1.5px;line-height:1.05;color:#0d1c38;text-wrap:balance}
.s{position:absolute;font-weight:400;color:#3c4f6e;line-height:1.3;text-wrap:balance}
.em{color:#0b8fa1}
.selo{position:absolute;display:inline-flex;align-items:center;gap:10px;background:rgba(255,255,255,.94);color:#0d1c38;font-weight:600;border-radius:999px;box-shadow:0 8px 24px rgba(13,28,56,.18);white-space:nowrap}
.selo i{width:10px;height:10px;border-radius:50%;background:#34a853;display:inline-block}
.lab{position:absolute;display:flex;align-items:center;justify-content:flex-end;transform:translateY(-50%)}
.lab .c{background:rgba(255,255,255,.97);border-radius:14px;box-shadow:0 10px 28px rgba(5,12,28,.35);font-weight:600;color:#0d1c38;display:flex;align-items:center;gap:12px;line-height:1.15}
.lab .c b{width:12px;height:12px;border-radius:50%;background:#00a8bc;flex:none;box-shadow:0 0 0 4px rgba(0,168,188,.18)}
.lab .ln{height:2px;background:#00a8bc;flex:none}
.card{position:absolute;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center;text-align:center;background:radial-gradient(ellipse at 50% 40%,#ffffff 0%,#eef3fa 45%,#d9e3f1 100%)}
.lock{display:flex;align-items:center;font-weight:700;letter-spacing:-2px;color:#0d1c38}
.cta{position:absolute;left:50%;transform:translateX(-50%);background:#0d1c38;color:#fff;font-weight:600;border-radius:999px;white-space:nowrap;box-shadow:0 12px 32px rgba(13,28,56,.28)}
.cta2{background:#0d1c38;color:#fff;font-weight:700;letter-spacing:1.5px;border-radius:999px;display:inline-block;white-space:nowrap}
.bg{position:absolute;inset:0;background-size:cover;background-position:center}`;

// posição dos itens na gravação original (px nativos, quadro 1320x2868)
const BUL = { f1: 1554, f2: 1806, f3: 2058, f4: 1140, f5: 1464 };
const NAMES = { f1: 'Assistente guiado', f2: 'Mapeamento visual (BPMN)', f3: 'Diagnóstico de gargalos', f4: 'Comparação Antes × Depois', f5: 'Plano de ação' };
const FMT = {
  916: { W: 1080, H: 1920, tgt_h: 1300, tgt_x: 440, tgt_y: 310, title: 'left:80px;right:80px;top:330px;font-size:92px', sel: 'left:40px;top:262px;font-size:24px;padding:12px 20px',
    labL: 36, labFont: 29, val: 'top:300px', valT: 96, valS: 40, end: { lock: 120, name: 96, tag: 50, cta: 'top:1240px;font-size:40px;padding:22px 44px' }, cta: 'Conheça pelo link da bio.' },
  45: { W: 1080, H: 1350, tgt_h: 1180, tgt_x: 470, tgt_y: 85, title: 'left:70px;right:70px;top:70px;font-size:80px', sel: 'left:28px;top:24px;font-size:22px;padding:10px 18px',
    labL: 24, labFont: 27, val: 'top:70px', valT: 84, valS: 36, end: { lock: 110, name: 88, tag: 46, cta: 'top:930px;font-size:36px;padding:20px 40px' }, cta: 'Conheça pelo link no post.' },
};
(async () => {
  const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args: ['--allow-file-access-from-files'] });
  const render = async (Wd, Hd, html, file, opaque) => {
    const p = await b.newPage({ viewport: { width: Wd, height: Hd } });
    const f = path.join(W, '_tmp.html'); fs.writeFileSync(f, `<html><head><meta charset="utf-8"><style>${CSS}</style></head><body style="width:${Wd}px;height:${Hd}px">${html}</body></html>`);
    await p.goto('file://' + f); await p.evaluate(() => document.fonts.ready); await p.waitForTimeout(150);
    const bad = await p.evaluate(() => [...document.querySelectorAll('.t,.s,.selo,.lab .c,.cta,.lock,.cta2')].filter((e) => { const r = e.getBoundingClientRect(); return r.left < 0 || r.top < 0 || r.right > innerWidth + .5 || r.bottom > innerHeight + .5; }).map((e) => e.textContent.slice(0, 30)));
    if (bad.length) console.log('FORA DO QUADRO em', file, bad);
    await p.screenshot({ path: file, omitBackground: !opaque }); await p.close();
  };
  for (const [k, f] of Object.entries(FMT)) {
    const d = `${W}/ov_${k}`; fs.mkdirSync(d, { recursive: true });
    const kk = f.tgt_h / G.phone[3]; const r = G.rec_scale * kk; const oy = f.tgt_y + G.rec_offset[1] * kk;
    await render(f.W, f.H, `<div class="t" style="${f.title}">O que é o <span class="em">NexoProcess?</span></div>`, `${d}/titulo.png`);
    await render(f.W, f.H, `<div style="position:absolute;left:0;top:0;bottom:0;width:${f.tgt_x + 6}px;background:linear-gradient(to right,rgba(9,14,28,.88) 0%,rgba(9,14,28,.82) 72%,rgba(9,14,28,0) 100%)"></div>`, `${d}/foco.png`);
    await render(f.W, f.H, `<div class="selo" style="${f.sel}"><i></i>Pesquisa real no Google · gravação original</div>`, `${d}/selo.png`);
    for (const [id, ny] of Object.entries(BUL)) {
      const y = Math.round(oy + ny * r); const right = f.tgt_x - 8; const colW = right - f.labL;
      await render(f.W, f.H, `<div class="lab" style="left:${f.labL}px;width:${colW}px;top:${y}px"><div class="c" style="font-size:${f.labFont}px;padding:14px 18px;max-width:${colW - 22}px"><b></b>${NAMES[id]}</div><div class="ln" style="width:22px"></div></div>`, `${d}/${id}.png`);
    }
    await render(f.W, f.H, `<div class="t" style="left:70px;right:70px;${f.val};font-size:${f.valT}px">Mapeie. Analise.<br><span class="em">Melhore.</span></div>
      <div class="s" style="left:72px;right:70px;top:calc(${f.val.split(':')[1]} + ${Math.round(f.valT * 2.25)}px);font-size:${f.valS}px">Transforme processos em resultados.</div>`, `${d}/valor.png`);
    const e = f.end;
    await render(f.W, f.H, `<div class="card"><div style="display:flex;flex-direction:column;align-items:center;gap:34px;transform:translateY(-${Math.round(f.H * 0.06)}px)">
      <div class="lock" style="gap:${Math.round(e.lock * .22)}px;font-size:${e.name}px">${sym(e.lock)}<span>NexoProcess</span></div>
      <div style="font-weight:600;font-size:${e.tag}px;line-height:1.25;color:#0d1c38">Mapeie. Analise. Melhore.<br><span class="em">Gere valor.</span></div></div></div>`, `${d}/fecho.png`, true);
    await render(f.W, f.H, `<div class="cta" style="${e.cta}">${f.cta}</div>`, `${d}/cta.png`);
  }
  // ---------- imagens estáticas (foto original + quadro original no iPhone + recorte original no MacBook)
  const still = `file://${W}/still_45.png`;
  const txt = (title, sub, comp, top, gapS, bottom, ts, ss, cs, ctaS, logo) => `
    <div class="t" style="left:0;right:0;text-align:center;top:${top}px;font-size:${ts}px;letter-spacing:-1px">O QUE É O <span class="em">NEXOPROCESS?</span></div>
    <div class="s" style="left:90px;right:90px;text-align:center;top:${top + gapS}px;font-size:${ss}px">${sub}</div>
    <div style="position:absolute;left:0;right:0;top:${bottom}px;display:flex;flex-direction:column;align-items:center;gap:${Math.round(cs * .9)}px">
      <div style="font-weight:600;font-size:${cs}px;color:#0d1c38">${comp}</div>
      <div class="cta2" style="font-size:${ctaS}px;padding:${Math.round(ctaS * .62)}px ${Math.round(ctaS * 1.4)}px">CONHEÇA O NEXOPROCESS</div>
      <div class="lock" style="gap:10px;font-size:${logo}px;letter-spacing:-.5px;opacity:.9">${sym(Math.round(logo * 1.5))}<span>NexoProcess</span></div></div>`;
  const SUB = 'Uma ferramenta digital para mapear, analisar e melhorar processos.';
  const COMP = 'Do mapeamento ao diagnóstico. Do diagnóstico à ação.';
  // Instagram 1080x1350: foto inteira (4:5)
  await render(1080, 1350, `<div class="bg" style="background-image:url('${still}')"></div>${txt('', SUB, COMP, 84, 92, 1046, 64, 30, 28, 26, 24)}`, `${OUTD}/01_Instagram_Feed.png`, true);
  // LinkedIn 1200x1200: recorte quadrado da mesma foto (aparelhos centrados), sem distorcer
  const sz = 3029 / (1122 / 1200) / (1200 / 1200); // largura da foto em px de saída = 1200 → escala 1200/1122
  await render(1200, 1200, `<div class="bg" style="background-image:url('${still}');background-size:1200px auto;background-position:0 -${Math.round(160 * 1200 / 1122)}px"></div>${txt('', SUB, COMP, 58, 84, 978, 58, 27, 26, 24, 22)}`, `${OUTD}/02_LinkedIn_Feed.png`, true);
  fs.unlinkSync(path.join(W, '_tmp.html')); await b.close(); console.log('ok');
})().catch((e) => { console.error(e); process.exit(1); });
