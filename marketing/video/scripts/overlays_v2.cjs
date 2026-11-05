// V2: elementos gráficos (PNG transparente, quadro inteiro) por formato, na fonte do app (IBM Plex Sans).
// Uso: node overlays_v2.cjs <pasta_saida>
const { chromium } = require('/home/user/Code-Del-Rio/node_modules/playwright');
const fs = require('fs'); const path = require('path');
const OUT = path.resolve(process.argv[2]);
const FD = '/home/user/Code-Del-Rio/node_modules/@fontsource/ibm-plex-sans/files';
const M = '/home/user/Code-Del-Rio/marketing/video';
const face = (w) => ['latin', 'latin-ext'].map((s) => `@font-face{font-family:Plex;font-weight:${w};src:url(file://${FD}/ibm-plex-sans-${s}-${w}-normal.woff2) format('woff2');}`).join('');
const SYM = fs.readFileSync(`${M}/assets/marca/nexoprocess-simbolo.svg`, 'utf8');
const sym = (px) => SYM.replace('<svg ', `<svg width="${px}" height="${px}" `);
const CSS = face(500) + face(600) + face(700) + `
*{margin:0;box-sizing:border-box} html,body{background:transparent;font-family:Plex,system-ui,sans-serif;color:#fff}
body{position:relative;overflow:hidden}
em{font-style:normal;color:#40c8d6}
.hl{position:absolute;font-weight:700;letter-spacing:-1.5px;line-height:1.06;text-shadow:0 4px 30px rgba(0,0,0,.55)}
.chip{position:absolute;display:inline-flex;align-items:center;gap:.5em;font-weight:600;color:#bff3f8;background:rgba(10,24,48,.86);border:1.5px solid rgba(64,200,214,.6);border-radius:999px;white-space:nowrap}
.chip b{color:#40c8d6;font-weight:700}
.selo{position:absolute;font-weight:600;color:#f5c66a;background:rgba(38,28,6,.86);border:1px solid rgba(245,198,106,.6);border-radius:999px;white-space:nowrap}
.sub{position:absolute;left:50%;transform:translate(-50%,-50%);width:max-content;text-align:center;text-wrap:balance;font-weight:600;line-height:1.25;background:rgba(7,13,26,.84);border-radius:16px;box-shadow:0 8px 30px rgba(0,0,0,.35)}
.end{position:absolute;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center;text-align:center;background:radial-gradient(ellipse at 50% 42%,#183a6e 0%,#0d1c38 52%,#070f20 100%)}
.lock{display:flex;align-items:center;font-weight:700;letter-spacing:-2px}
.tag{font-weight:600;line-height:1.2;text-wrap:balance}
.pil{color:#9fe6ee;font-weight:600;letter-spacing:.5px}
.cta{position:absolute;left:50%;transform:translateX(-50%);display:flex;flex-direction:column;align-items:center;gap:.45em}
.btn{background:#40c8d6;color:#06202a;font-weight:700;border-radius:999px;white-space:nowrap;box-shadow:0 10px 40px rgba(64,200,214,.35)}
.sm{color:#c9d6ea;font-weight:600}
`;
const FMT = {
  reels: { W: 1080, H: 1920, hook: 'left:80px;right:80px;top:300px;font-size:92px', prob: 'left:80px;right:80px;top:300px;font-size:68px',
    chip: 'left:80px;top:270px;font-size:30px;padding:12px 24px', selo: 'right:80px;top:276px;font-size:24px;padding:10px 20px',
    sub: 'top:1400px;max-width:900px;font-size:46px;padding:16px 28px', end: { lock: 150, name: 104, tag: 54, pil: 34, gap: 44, top: -120 },
    cta: 'top:1180px', btn: 'font-size:44px;padding:22px 46px', sm: 'font-size:32px', bio: true },
  li45: { W: 1080, H: 1350, hook: 'left:70px;right:70px;top:84px;font-size:80px', prob: 'left:70px;right:70px;top:70px;font-size:58px',
    chip: 'left:60px;top:48px;font-size:28px;padding:11px 22px', selo: 'right:60px;top:54px;font-size:22px;padding:9px 18px',
    sub: 'top:1222px;max-width:960px;font-size:42px;padding:14px 26px', end: { lock: 130, name: 92, tag: 48, pil: 30, gap: 36, top: -90 },
    cta: 'top:900px', btn: 'font-size:40px;padding:20px 42px', sm: 'font-size:28px', bio: false },
  li169: { W: 1920, H: 1080, hook: 'left:96px;bottom:104px;max-width:1400px;font-size:88px', prob: 'left:96px;bottom:96px;max-width:1500px;font-size:66px',
    chip: 'left:96px;top:56px;font-size:28px;padding:11px 22px', selo: 'right:72px;top:62px;font-size:22px;padding:9px 18px',
    sub: 'top:985px;max-width:1500px;font-size:44px;padding:14px 28px', end: { lock: 120, name: 88, tag: 46, pil: 28, gap: 30, top: -80 },
    cta: 'top:760px', btn: 'font-size:38px;padding:18px 40px', sm: 'font-size:26px', bio: false },
};
const SUBS = {
  s1: 'E ele vira um mapa visual,', s2: 'com gargalos e retrabalho destacados.',
  s3: 'O diagnóstico mostra tempo, esforço e custo,', s4: 'com a fórmula à vista.',
  s5: 'E tudo vira um plano de ação,', s6: 'com responsável e prazo.',
};
(async () => {
  const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
  async function render(W, H, html, file, opaque = false) {
    const p = await b.newPage({ viewport: { width: W, height: H } });
    const hf = path.join(OUT, '_tmp.html');
    fs.writeFileSync(hf, `<html><head><meta charset="utf-8"><style>${CSS}</style></head><body style="width:${W}px;height:${H}px">${html}</body></html>`);
    await p.goto('file://' + hf);
    const n = await p.evaluate(async () => { await document.fonts.ready; return [...document.fonts].filter((f) => f.status === 'loaded').length; });
    if (!n) throw new Error('fonte não carregou');
    await p.waitForTimeout(120);
    // garante que nada saiu do quadro
    const over = await p.evaluate(() => [...document.querySelectorAll('.hl,.chip,.selo,.sub,.cta,.lock,.tag,.pil')].some((e) => { const r = e.getBoundingClientRect(); return r.left < 0 || r.top < 0 || r.right > innerWidth + 0.5 || r.bottom > innerHeight + 0.5; }));
    if (over) console.log('ATENÇÃO: elemento fora do quadro em', file);
    await p.screenshot({ path: path.join(OUT, file), omitBackground: !opaque });
    await p.close();
  }
  for (const [k, f] of Object.entries(FMT)) {
    const d = path.join(OUT, k); fs.mkdirSync(d, { recursive: true }); const r = (h, n, o) => render(f.W, f.H, h, `${k}/${n}`, o);
    const grad169 = k === 'li169' ? '<div style="position:absolute;left:0;right:0;bottom:0;height:520px;background:linear-gradient(to top,rgba(5,10,22,.88),rgba(5,10,22,0))"></div>' : '';
    await r(`${grad169}<div class="hl" style="${f.hook}">Seu processo vive<br>numa <em>planilha?</em></div>`, 'hook.png');
    await r(`${grad169}<div class="hl" style="${f.prob}">Quando o fluxo não está claro,<br>os <em>gargalos</em> também não.</div>`, 'problema.png');
    const chips = [['1/3', 'Mapa visual'], ['2/3', 'Diagnóstico'], ['3/3', 'Plano de ação']];
    for (let i = 0; i < 3; i++) await r(`<div class="chip" style="${f.chip}"><b>${chips[i][0]}</b>${chips[i][1]}</div>`, `chip${i + 1}.png`);
    await r(`<div class="selo" style="${f.selo}">Demonstração com dados fictícios</div>`, 'selo.png');
    for (const [s, t] of Object.entries(SUBS)) await r(`<div class="sub" style="${f.sub}">${t}</div>`, `sub_${s}.png`);
    const e = f.end;
    await r(`<div class="end"><div style="display:flex;flex-direction:column;align-items:center;gap:${e.gap}px;transform:translateY(${e.top}px)">
      <div class="lock" style="gap:${Math.round(e.lock * 0.22)}px;font-size:${e.name}px">${sym(e.lock)}<span>NexoProcess</span></div>
      <div class="tag" style="font-size:${e.tag}px;max-width:${Math.round(f.W * 0.86)}px">Do processo na planilha<br>ao plano de melhoria.</div>
      <div class="pil" style="font-size:${e.pil}px">Mapa visual · Diagnóstico · Plano de ação</div></div></div>`, 'encerramento.png', true);
    await r(`<div class="cta" style="${f.cta}"><div class="btn" style="${f.btn}">Conheça o NexoProcess</div>${f.bio ? `<div class="sm" style="${f.sm}">Link na bio</div>` : ''}</div>`, 'cta.png');
  }
  // Capas (opacas)
  const shot = `file://${M}/assets/telas-4k/03b-mapa-macro-recorte.png`;
  const cover = (W, H, hookTop, hookSize, imgTop, imgW, logoTop) => `<div style="position:absolute;inset:0;background:radial-gradient(ellipse at 30% 30%,#183a6e 0%,#0d1c38 55%,#070f20 100%)"></div>
    <div class="lock" style="position:absolute;left:80px;top:${logoTop}px;gap:20px;font-size:52px">${sym(84)}<span>NexoProcess</span></div>
    <div class="hl" style="left:80px;right:70px;top:${hookTop}px;font-size:${hookSize}px">Seu processo vive<br>numa <em>planilha?</em></div>
    <div style="position:absolute;left:80px;top:${imgTop}px;width:${imgW}px;border-radius:22px;overflow:hidden;border:1.5px solid rgba(64,200,214,.55);box-shadow:0 30px 80px rgba(0,0,0,.55)"><img src="${shot}" style="display:block;width:${imgW * 1.55}px;margin-left:-${imgW * 0.06}px;margin-top:-${imgW * 0.18}px;height:auto"></div>
    <div class="pil" style="position:absolute;left:80px;top:${imgTop + imgW * 0.56 + 40}px;font-size:34px">Mapa visual · Diagnóstico · Plano de ação</div>`;
  fs.mkdirSync(path.join(OUT, 'capas'), { recursive: true });
  await render(1080, 1920, cover(1080, 1920, 520, 104, 860, 920, 330), 'capas/CAPA_INSTAGRAM.png', true);
  await render(1080, 1350, cover(1080, 1350, 220, 92, 520, 920, 70), 'capas/CAPA_LINKEDIN.png', true);
  fs.unlinkSync(path.join(OUT, '_tmp.html'));
  await b.close(); console.log('ok');
})().catch((e) => { console.error(e); process.exit(1); });
