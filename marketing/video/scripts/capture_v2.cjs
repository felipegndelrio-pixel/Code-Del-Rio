// V2: capturas REAIS de cartões do NexoProcess (demonstração fictícia), em alta resolução, sem barra fixa.
// m = largura de celular/tablet estreito (cartões em 1 coluna) · d = desktop (grade larga) para 16:9.
const { chromium } = require('/home/user/Code-Del-Rio/node_modules/playwright');
const OUT = process.argv[2];
const CARDS = [
  ['diagnostico', 'Resumo do processo atual', 'diag-kpi'],
  ['diagnostico', 'Gargalos identificados', 'diag-gargalos'],
  ['plano', 'Plano de ação', 'plano'],
];
(async () => {
  const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
  for (const [tag, vp, dsf] of [['m', { width: 520, height: 900 }, 3], ['d', { width: 1280, height: 800 }, 2]]) {
    const ctx = await b.newContext({ viewport: vp, deviceScaleFactor: dsf, colorScheme: 'dark' });
    await ctx.addInitScript(() => localStorage.setItem('nexo.theme', 'dark'));
    const p = await ctx.newPage();
    await p.goto('http://127.0.0.1:4180/app');
    const direct = p.getByRole('button', { name: 'Abrir demonstração' }); const more = p.getByRole('button', { name: /Outras formas de começar/ });
    await direct.or(more).first().waitFor(); if (!(await direct.isVisible())) await more.click(); await direct.click();
    await p.waitForURL(/\/visao-geral$/); const base = p.url().replace(/\/visao-geral$/, '');
    for (const [tab, heading, name] of CARDS) {
      await p.goto(`${base}/${tab}`); await p.locator('main').waitFor(); await p.waitForTimeout(1200);
      // esconde barras fixas (navegação inferior/superior) só para a captura do cartão
      await p.addStyleTag({ content: '[class*="fixed"],[class*="sticky"],header.sticky{visibility:hidden!important}' });
      if (name === 'diag-kpi') { await p.evaluate(() => { document.querySelectorAll('main details').forEach((d) => { if (/Como calculamos/.test(d.textContent)) d.open = true; }); }); await p.waitForTimeout(500); }
      const ok = await p.evaluate(([h, n]) => {
        const all = [...document.querySelectorAll('main h2, main h3')].filter((e) => e.textContent.trim().startsWith(h));
        const el = all[all.length - 1];
        if (!el) return false;
        let c = el; for (let i = 0; i < 8 && c; i++) { const cl = c.className || ''; if (typeof cl === 'string' && /rounded/.test(cl) && /border/.test(cl)) break; c = c.parentElement; }
        (c || el.parentElement).setAttribute('data-cap', n); return true;
      }, [heading, name]);
      if (!ok) { console.log('não achei', heading); continue; }
      const loc = p.locator(`[data-cap="${name}"]`);
      await loc.scrollIntoViewIfNeeded(); await p.waitForTimeout(400);
      await loc.screenshot({ path: `${OUT}/${name}-${tag}.png` });
      const bb = await loc.boundingBox(); console.log(tag, name, Math.round(bb.width), 'x', Math.round(bb.height), 'CSS');
    }
    await ctx.close();
  }
  await b.close();
})().catch((e) => { console.error(e); process.exit(1); });
