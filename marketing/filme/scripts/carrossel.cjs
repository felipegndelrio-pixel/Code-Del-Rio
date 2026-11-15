// Carrossel 4:5 (1080x1350): quadros do filme v3 + contador discreto e "Arraste" no primeiro slide.
const { chromium } = require('/home/user/Code-Del-Rio/node_modules/playwright');
const fs = require('fs');
const F = '/home/user/Code-Del-Rio/marketing/filme', FD = '/home/user/Code-Del-Rio/node_modules/@fontsource';
const ff = (d, w) => ['latin', 'latin-ext'].map((s) => `@font-face{font-family:P;font-weight:${w};src:url(file://${FD}/${d}/files/${d}-${s}-${w}-normal.woff2)}`).join('');
const S = [['7.6','dor'],['11.4','tensao'],['3.9','origem'],['20.8','assistente'],['24.1','mapa'],['27.4','diagnostico'],['30.5','plano'],['36.6','prova-google-hotmart'],['42.2','proximo-capitulo'],['55','chamada']];
(async () => {
  const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args: ['--allow-file-access-from-files'] });
  const p = await b.newPage({ viewport: { width: 1080, height: 1350 } });
  for (let i = 0; i < S.length; i++) {
    const [t, n] = S[i];
    const swipe = i === 0 ? `<div style="position:absolute;right:56px;bottom:52px;display:flex;align-items:center;gap:14px;font:600 26px P;color:#eef3fb;letter-spacing:.02em">Arraste <span style="font-size:34px;color:#6fdbe6">→</span></div>` : '';
    const html = `<html><head><meta charset="utf-8"><style>${ff('ibm-plex-sans',600)}${ff('ibm-plex-mono',500)}*{margin:0}body{width:1080px;height:1350px;position:relative;background:url('file://${F}/work/t2_4x5_${t}.jpg') center/cover}</style></head><body>
      <div style="position:absolute;left:56px;bottom:56px;font:500 20px P;letter-spacing:.2em;color:#8fa3c2">${String(i + 1).padStart(2, '0')} / ${S.length}</div>${swipe}</body></html>`;
    fs.writeFileSync(`${F}/work/_c.html`, html); await p.goto(`file://${F}/work/_c.html`); await p.evaluate(() => document.fonts.ready); await p.waitForTimeout(150);
    await p.screenshot({ path: `${F}/exports/carrossel/${String(i + 1).padStart(2, '0')}_${n}.jpg`, type: 'jpeg', quality: 95 });
  }
  await b.close(); console.log('ok');
})();
