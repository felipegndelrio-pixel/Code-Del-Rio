// Grava a digitação REAL no assistente (quadro a quadro) e gera a lista de durações para o ffmpeg.
const { chromium } = require('/home/user/Code-Del-Rio/node_modules/playwright');
const fs = require('fs');
const OUT = process.argv[2];
const TEXT = 'Processamento de pedidos';
(async () => {
  const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
  for (const [fmt, opts] of [
    ['9x16', { viewport: { width: 360, height: 640 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true }],
    ['16x9', { viewport: { width: 1280, height: 720 }, deviceScaleFactor: 3 }],
  ]) {
    const dir = `${OUT}/${fmt}`; fs.mkdirSync(dir, { recursive: true });
    const ctx = await b.newContext({ ...opts, colorScheme: 'dark' });
    await ctx.addInitScript(() => { localStorage.clear(); localStorage.setItem('nexo.theme', 'dark'); });
    const p = await ctx.newPage();
    await p.goto('http://127.0.0.1:4180/app/novo'); await p.waitForTimeout(1200);
    const input = p.getByPlaceholder('Digite sua resposta');
    await input.click(); await p.waitForTimeout(200);
    const list = []; let n = 0;
    const shot = async (dur) => { const f = `${dir}/f${String(n++).padStart(3, '0')}.png`; await p.screenshot({ path: f }); list.push([f, dur]); };
    await shot(0.6);
    for (const ch of TEXT) { await p.keyboard.type(ch); await shot(0.055); }
    await shot(0.5);
    await p.getByRole('button', { name: /Continuar/ }).click();
    await p.waitForTimeout(700);
    await shot(1.4);
    console.log(fmt, (await p.locator('main').innerText()).split('\n').slice(0, 8).join(' | '));
    fs.writeFileSync(`${dir}/list.txt`, list.map(([f, d]) => `file '${f}'\nduration ${d}`).join('\n') + `\nfile '${list[list.length - 1][0]}'\n`);
    await ctx.close();
  }
  await b.close();
})().catch((e) => { console.error(e); process.exit(1); });
