// Captura telas REAIS do NexoProcess (demonstração fictícia, tema escuro) em 9:16 e 16:9.
const { chromium } = require('/home/user/Code-Del-Rio/node_modules/playwright');
const OUT = process.argv[2];
const BASE = 'http://127.0.0.1:4180';
const TABS = [
  ['02-visao-geral', 'visao-geral'],
  ['03-mapa-macro', 'mapa'],
  ['05-diagnostico', 'diagnostico'],
  ['06-recomendacoes', 'recomendacoes'],
  ['07-comparar', 'comparar'],
  ['08-plano', 'plano'],
];

async function openDemo(page) {
  await page.goto(BASE + '/app');
  const direct = page.getByRole('button', { name: 'Abrir demonstração' });
  const more = page.getByRole('button', { name: /Outras formas de começar/ });
  await direct.or(more).first().waitFor();
  if (!(await direct.isVisible())) await more.click();
  await direct.click();
  await page.waitForURL(/\/visao-geral$/);
  return page.url().replace(/\/visao-geral$/, '');
}

async function settle(page, tab) {
  await page.locator('main').waitFor();
  if (tab === 'mapa') await page.waitForSelector('.djs-element');
  await page.getByText('Carregando…').waitFor({ state: 'detached' }).catch(() => {});
  await page.waitForTimeout(900);
}

async function run(fmt, ctxOpts, recordSize) {
  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
  const ctx = await browser.newContext({
    ...ctxOpts,
    colorScheme: 'dark',
    ...(recordSize ? { recordVideo: { dir: `${OUT}/clipes/raw-${fmt}`, size: recordSize } } : {}),
  });
  await ctx.addInitScript(() => localStorage.setItem('nexo.theme', 'dark'));
  const page = await ctx.newPage();
  const dir = `${OUT}/telas-${fmt}`;
  await page.goto(BASE + '/');
  await page.waitForTimeout(1200);
  await page.screenshot({ path: `${dir}/01-landing.png` });
  const base = await openDemo(page);
  for (const [name, tab] of TABS) {
    await page.goto(`${base}/${tab}`);
    await settle(page, tab);
    await page.screenshot({ path: `${dir}/${name}.png` });
    if (tab === 'mapa') {
      const btn = page.getByRole('navigation', { name: 'Etapas do processo' }).getByRole('button', { name: /Separação/ });
      if (await btn.count()) {
        await btn.first().click();
        await page.waitForTimeout(1500);
        await page.screenshot({ path: `${dir}/04-mapa-etapa-separacao.png` });
      }
    }
    // rolagem lenta para o vídeo bruto
    if (recordSize) {
      for (let i = 0; i < 6; i++) { await page.mouse.wheel(0, 180); await page.waitForTimeout(350); }
      await page.waitForTimeout(500);
    }
  }
  await page.goto(`${base}/relatorio`);
  await page.getByTestId('report').waitFor();
  await page.waitForTimeout(1200);
  await page.screenshot({ path: `${dir}/09-relatorio.png` });
  await ctx.close();
  await browser.close();
}

(async () => {
  // 9:16 → 360x640 CSS @3x = 1080x1920 (layout de celular real)
  await run('9x16', { viewport: { width: 360, height: 640 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true });
  // 16:9 → 1280x720 CSS @1.5x = 1920x1080 (layout desktop)
  await run('16x9', { viewport: { width: 1280, height: 720 }, deviceScaleFactor: 1.5 });
  // Gravação bruta da navegação (desktop 1920x1080, CSS 1:1)
  await run('16x9-rec', { viewport: { width: 1920, height: 1080 }, deviceScaleFactor: 1 }, { width: 1920, height: 1080 });
  console.log('ok');
})().catch((e) => { console.error(e); process.exit(1); });
