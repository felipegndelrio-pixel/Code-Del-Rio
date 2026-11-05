// Recortes 3x (desktop 1280x720 CSS → 3840x2160) das áreas que viram "hero shots" no vídeo + logo.
const { chromium } = require('/home/user/Code-Del-Rio/node_modules/playwright');
const OUT = process.argv[2];
const BASE = 'http://127.0.0.1:4180';

(async () => {
  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 720 }, deviceScaleFactor: 3, colorScheme: 'dark' });
  await ctx.addInitScript(() => localStorage.setItem('nexo.theme', 'dark'));
  const page = await ctx.newPage();
  const d = `${OUT}/telas-4k`;
  await page.goto(BASE + '/'); await page.waitForTimeout(1200);
  await page.screenshot({ path: `${d}/01-landing-4k.png` });
  await page.goto(BASE + '/app');
  const direct = page.getByRole('button', { name: 'Abrir demonstração' });
  const more = page.getByRole('button', { name: /Outras formas de começar/ });
  await direct.or(more).first().waitFor();
  if (!(await direct.isVisible())) await more.click();
  await direct.click();
  await page.waitForURL(/\/visao-geral$/);
  const base = page.url().replace(/\/visao-geral$/, '');

  // Mapa macro e etapa — só o quadro do diagrama
  await page.goto(`${base}/mapa`); await page.waitForSelector('.djs-element'); await page.waitForTimeout(1200);
  await page.screenshot({ path: `${d}/03-mapa-macro-4k.png` });
  const canvas = page.getByTestId('bpmn-canvas');
  await canvas.scrollIntoViewIfNeeded(); await page.waitForTimeout(500);
  await canvas.screenshot({ path: `${d}/03b-mapa-macro-recorte.png` });
  await page.getByRole('navigation', { name: 'Etapas do processo' }).getByRole('button', { name: /Separação/ }).first().click();
  await page.waitForTimeout(1600);
  await canvas.screenshot({ path: `${d}/04b-mapa-etapa-recorte.png` });

  for (const [name, tab] of [['05-diagnostico', 'diagnostico'], ['06-recomendacoes', 'recomendacoes'], ['07-comparar', 'comparar'], ['08-plano', 'plano']]) {
    await page.goto(`${base}/${tab}`); await page.locator('main').waitFor(); await page.waitForTimeout(1200);
    await page.screenshot({ path: `${d}/${name}-4k.png` });
  }
  await page.goto(`${base}/relatorio`); await page.getByTestId('report').waitFor(); await page.waitForTimeout(1200);
  await page.screenshot({ path: `${d}/09-relatorio-4k.png` });

  // Logo: símbolo idêntico ao components/Logo.tsx, fundo transparente
  const sym = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><rect x="2" y="2" width="60" height="60" rx="12" fill="#173263"/><circle cx="17" cy="32" r="6.5" fill="none" stroke="#ffffff" stroke-width="4"/><path d="M23.5 32h7" stroke="#ffffff" stroke-width="4" stroke-linecap="round"/><path d="M41 21l11 11-11 11-11-11z" fill="#00A8BC"/></svg>`;
  require('fs').writeFileSync(`${OUT}/marca/nexoprocess-simbolo.svg`, sym);
  const lp = await ctx.newPage();
  await lp.setViewportSize({ width: 600, height: 600 });
  await lp.setContent(`<html><body style="margin:0;background:transparent"><div id="s" style="width:600px;height:600px">${sym.replace('<svg ', '<svg width="600" height="600" ')}</div></body></html>`);
  await lp.locator('#s').screenshot({ path: `${OUT}/marca/nexoprocess-simbolo-1800.png`, omitBackground: true });
  // Assinatura horizontal (símbolo + nome) em branco, para fundo escuro — fonte do app
  await lp.goto(BASE + '/'); // herda IBM Plex Sans servida pelo app
  for (const [file, color] of [['nexoprocess-assinatura-branca.png', '#ffffff'], ['nexoprocess-assinatura-navy.png', '#0d1c38']]) {
    await lp.setViewportSize({ width: 1400, height: 400 });
    await lp.evaluate(([svg, c]) => {
      document.body.innerHTML = `<div id="lk" style="display:inline-flex;align-items:center;gap:36px;padding:40px;background:transparent">${svg.replace('<svg ', '<svg width="220" height="220" ')}<span style="font-family:'IBM Plex Sans',sans-serif;font-weight:700;font-size:150px;letter-spacing:-3px;color:${c}">NexoProcess</span></div>`;
      document.documentElement.style.background = 'transparent'; document.body.style.background = 'transparent'; document.body.style.margin = '0';
    }, [sym, color]);
    await lp.waitForTimeout(400);
    await lp.locator('#lk').screenshot({ path: `${OUT}/marca/${file}`, omitBackground: true });
  }
  await browser.close();
  console.log('ok');
})().catch((e) => { console.error(e); process.exit(1); });
