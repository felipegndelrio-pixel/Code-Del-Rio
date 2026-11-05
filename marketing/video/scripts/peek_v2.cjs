const { chromium } = require('/home/user/Code-Del-Rio/node_modules/playwright');
const OUT = process.argv[2];
(async () => {
  const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
  const ctx = await b.newContext({ viewport: { width: 520, height: 900 }, deviceScaleFactor: 1, colorScheme: 'dark' });
  await ctx.addInitScript(() => localStorage.setItem('nexo.theme', 'dark'));
  const p = await ctx.newPage();
  await p.goto('http://127.0.0.1:4180/app');
  const direct = p.getByRole('button', { name: 'Abrir demonstração' }); const more = p.getByRole('button', { name: /Outras formas de começar/ });
  await direct.or(more).first().waitFor(); if (!(await direct.isVisible())) await more.click(); await direct.click();
  await p.waitForURL(/\/visao-geral$/); const base = p.url().replace(/\/visao-geral$/, '');
  for (const t of ['diagnostico', 'plano']) {
    await p.goto(`${base}/${t}`); await p.locator('main').waitFor(); await p.waitForTimeout(1200);
    await p.screenshot({ path: `${OUT}/peek-${t}.png`, fullPage: true });
    const hs = await p.locator('main h2, main h3, main section > header').allInnerTexts();
    console.log(t, '|', hs.slice(0, 14).map(s => s.replace(/\n/g, ' / ').slice(0, 60)).join(' || '));
  }
  await b.close();
})();
