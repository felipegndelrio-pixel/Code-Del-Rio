// Story "Bastidores: NexoProcess em inglês" — tela de editor com o arquivo REAL src/config/i18n/en.ts.
// Uso: node render_story_i18n.cjs <pasta_saida>
const { chromium } = require('/home/user/Code-Del-Rio/node_modules/playwright');
const fs = require('fs'); const path = require('path');
const OUT = path.resolve(process.argv[2] || '.');
const ROOT = '/home/user/Code-Del-Rio';
const FD = `${ROOT}/node_modules/@fontsource`;
const code = fs.readFileSync(`${ROOT}/apps/nexoprocess/src/config/i18n/en.ts`, 'utf8').replace(/\n$/, '');
const branch = require('child_process').execSync('git -C ' + ROOT + ' branch --show-current').toString().trim();
const SYM = fs.readFileSync(`${ROOT}/marketing/video/assets/marca/nexoprocess-simbolo.svg`, 'utf8');
const sym = (px) => SYM.replace('<svg ', `<svg width="${px}" height="${px}" `);
const ff = (fam, dir, w) => ['latin', 'latin-ext'].map((s) => `@font-face{font-family:${fam};font-weight:${w};src:url(file://${FD}/${dir}/files/${dir}-${s}-${w}-normal.woff2) format('woff2');}`).join('');
const FONTS = ff('Plex', 'ibm-plex-sans', 400) + ff('Plex', 'ibm-plex-sans', 600) + ff('Plex', 'ibm-plex-sans', 700) + ff('PlexMono', 'ibm-plex-mono', 400) + ff('PlexMono', 'ibm-plex-mono', 500);

// realce de sintaxe mínimo para TypeScript (sem bibliotecas externas)
const esc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
function hl(line) {
  const re = /(\/\/.*$)|('(?:[^'\\]|\\.)*'|"(?:[^"\\]|\\.)*"|`(?:[^`\\]|\\.)*`)|\b(import|export|const|from|as)\b|\b([A-Z][A-Z0-9_]+)\b|\b(\d+)\b|([A-Za-z_]\w*)(?=\s*:)|(\.\.\.)/g;
  let out = '', last = 0, m;
  while ((m = re.exec(line))) {
    out += esc(line.slice(last, m.index));
    const [t] = m; const c = m[1] ? 'cm' : m[2] ? 'st' : m[3] ? 'kw' : m[4] ? 'cn' : m[5] ? 'nu' : m[6] ? 'pr' : 'op';
    out += `<span class="${c}">${esc(t)}</span>`; last = m.index + t.length;
  }
  return out + esc(line.slice(last));
}
const lines = code.split('\n').slice(0, 24);
const codeHtml = lines.map((l, i) => `<div class="ln${i === 19 ? ' cur' : ''}"><span class="no">${i + 1}</span><span class="tx">${hl(l) || ' '}</span></div>`).join('');

const EDITOR = `<div class="win">
  <div class="title"><i style="background:#ff5f57"></i><i style="background:#febc2e"></i><i style="background:#28c840"></i><span>en.ts — nexoprocess</span></div>
  <div class="body">
    <aside><div class="h">EXPLORER</div>
      <div class="t">▾ apps/nexoprocess/src</div><div class="t i1">▾ config</div>
      <div class="t i2">brand.ts</div><div class="t i2">glossary.ts</div><div class="t i2">▾ i18n</div><div class="t i3 on">en.ts <b>U</b></div>
      <div class="t i2">manifest.ts</div><div class="t i2">nav.ts</div><div class="t i1">▸ domain</div><div class="t i1">▸ pages</div><div class="t i1">▸ bpmn</div></aside>
    <main><div class="tabs"><span>brand.ts</span><span class="act">en.ts</span></div>
      <div class="crumb">src › config › i18n › en.ts</div>
      <div class="code">${codeHtml}</div>
      <div class="term"><div class="th"><span class="act">TERMINAL</span><span>PROBLEMS 0</span></div>
        <div class="tl"><span class="pm">$</span> npm run nexo:typecheck</div>
        <div class="tl dim">&gt; tsc -p apps/nexoprocess/tsconfig.json --noEmit</div>
        <div class="tl"><span class="pm">$</span> npx eslint src/config/i18n/en.ts</div>
        <div class="tl ok">✓ typecheck and lint passed</div>
        <div class="tl"><span class="pm">$</span> <span class="cursor"> </span></div></div>
    </main></div>
  <div class="status"><span>⎇ ${esc(branch)}</span><span>TypeScript · UTF-8 · en-US</span></div></div>`;

const CSS = FONTS + `*{margin:0;box-sizing:border-box}body{background:transparent}
.win{width:980px;border-radius:16px;overflow:hidden;background:#0f1420;border:1px solid #273249;box-shadow:0 40px 120px rgba(0,0,0,.6),0 0 0 1px rgba(64,200,214,.12);font-family:PlexMono,ui-monospace,monospace}
.title{height:40px;background:#141b2b;display:flex;align-items:center;gap:8px;padding:0 16px;color:#8b98b3;font:500 14px PlexMono}
.title i{width:12px;height:12px;border-radius:50%;display:inline-block}.title span{margin-left:auto;margin-right:auto;transform:translateX(-30px)}
.body{display:flex}aside{width:200px;background:#111827;border-right:1px solid #1f2a3e;padding:12px 0;font:13px Plex;color:#9fb0cc}
aside .h{padding:0 14px 8px;font:600 11px Plex;letter-spacing:.12em;color:#6c7a96}aside .t{padding:3px 14px;white-space:nowrap}
.i1{padding-left:26px!important}.i2{padding-left:40px!important}.i3{padding-left:54px!important}
aside .on{background:#1b2a44;color:#e8f0fc}aside b{color:#56d68c;font-weight:600;margin-left:6px}
main{flex:1;min-width:0}.tabs{display:flex;background:#111827;border-bottom:1px solid #1f2a3e;font:13px Plex}
.tabs span{padding:10px 18px;color:#7f8ca8;border-right:1px solid #1f2a3e}.tabs .act{background:#0f1420;color:#e8f0fc;box-shadow:inset 0 2px 0 #40c8d6}
.crumb{padding:6px 18px;font:12px Plex;color:#6c7a96}
.code{padding:4px 0 10px;font-size:14.5px;line-height:21px;color:#c9d4e8;overflow:hidden}
.ln{display:flex;white-space:pre}.ln.cur{background:rgba(64,200,214,.07)}.no{width:46px;text-align:right;padding-right:16px;color:#46546f;flex:none}.tx{overflow:hidden}
.cm{color:#6f86a8;font-style:italic}.st{color:#9fe28f}.kw{color:#c792ea}.cn{color:#ffcb6b}.nu{color:#f78c6c}.pr{color:#82aaff}.op{color:#89ddff}
.term{border-top:1px solid #1f2a3e;background:#0c111b;padding:8px 18px 12px;font-size:13.5px;line-height:20px;color:#c9d4e8}
.th{display:flex;gap:20px;font:600 11px Plex;letter-spacing:.1em;color:#6c7a96;margin-bottom:6px}.th .act{color:#e8f0fc;border-bottom:1px solid #40c8d6}
.pm{color:#40c8d6}.dim{color:#6c7a96}.ok{color:#56d68c}.cursor{background:#c9d4e8;display:inline-block;width:8px;height:16px;vertical-align:-3px}
.status{height:26px;background:#173263;display:flex;justify-content:space-between;align-items:center;padding:0 14px;font:12px Plex;color:#d8e6ff}`;

const STORY = (img) => `<div class="st">
  <div class="lock">${sym(64)}<span>NexoProcess</span></div>
  <div class="eb">BASTIDORES · BEHIND THE SCENES</div>
  <h1>O NexoProcess está<br>aprendendo <em>inglês.</em></h1>
  <p>Começamos a versão em inglês para o lançamento internacional.</p>
  <img class="ed" src="${img}">
  <div class="pill">Em desenvolvimento · In development</div></div>`;
const SCSS = FONTS + `*{margin:0;box-sizing:border-box}html,body{width:1080px;height:1920px}
.st{position:relative;width:1080px;height:1920px;overflow:hidden;font-family:Plex,sans-serif;color:#fff;background:radial-gradient(ellipse at 50% 30%,#183a6e 0%,#0d1c38 50%,#070f20 100%)}
.st:before{content:"";position:absolute;inset:0;background-image:linear-gradient(rgba(64,200,214,.06) 1px,transparent 1px),linear-gradient(90deg,rgba(64,200,214,.06) 1px,transparent 1px);background-size:60px 60px;mask-image:radial-gradient(ellipse at 50% 40%,#000 30%,transparent 75%)}
.lock{position:absolute;left:80px;top:250px;display:flex;align-items:center;gap:16px;font-weight:700;font-size:40px;letter-spacing:-1px}
.eb{position:absolute;left:80px;top:350px;font-weight:600;font-size:26px;letter-spacing:.16em;color:#40c8d6}
h1{position:absolute;left:80px;top:396px;font-weight:700;font-size:82px;line-height:1.04;letter-spacing:-2px}
h1 em{font-style:normal;color:#40c8d6}
p{position:absolute;left:80px;right:90px;top:588px;font-size:34px;line-height:1.3;color:#c9d6ea;font-weight:400}
.ed{position:absolute;left:50px;top:720px;width:980px}
.pill{position:absolute;left:80px;top:1545px;font-weight:600;font-size:30px;color:#06202a;background:#40c8d6;border-radius:999px;padding:16px 32px}`;

(async () => {
  const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
  const page = async (W, H, dsf, html, css, file, transparent) => {
    const p = await b.newPage({ viewport: { width: W, height: H }, deviceScaleFactor: dsf });
    const f = path.join(OUT, '_tmp.html'); fs.writeFileSync(f, `<html><head><meta charset="utf-8"><style>${css}</style></head><body>${html}</body></html>`);
    await p.goto('file://' + f); await p.evaluate(() => document.fonts.ready); await p.waitForTimeout(200);
    const el = transparent ? p.locator('.win') : p.locator('.st');
    await el.screenshot({ path: path.join(OUT, file), omitBackground: !!transparent }); await p.close();
  };
  await page(1100, 1300, 2, EDITOR, CSS, 'TELA_CODIGO_EN.png', true);
  await page(1080, 1920, 1, STORY('file://' + path.join(OUT, 'TELA_CODIGO_EN.png')), SCSS, 'STORY_BASTIDORES_EN_1080x1920.png');
  fs.unlinkSync(path.join(OUT, '_tmp.html')); await b.close(); console.log('ok');
})().catch((e) => { console.error(e); process.exit(1); });
