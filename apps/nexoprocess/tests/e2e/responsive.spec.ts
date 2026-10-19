import { test, expect } from '@playwright/test';
import { expectNoHorizontalScroll, openDemo, prepare } from './helpers';

const SHOTS = process.env.SHOTS_DIR;
const PAGES = ['visao-geral', 'dados', 'validar', 'mapa', 'diagnostico', 'recomendacoes', 'tobe', 'comparar', 'plano', 'resultados', 'riscos', 'responsabilidades', 'simulacao', 'automacao', 'exportar'];

test('layout sem rolagem horizontal em todas as telas, nos dois temas', async ({ page }, info) => {
  test.setTimeout(150_000);
  const { errors } = await prepare(page);
  for (const theme of ['dark', 'light'] as const) {
    await page.addInitScript((t) => localStorage.setItem('nexo.theme', t), theme);
    await page.goto('/');
    await expectNoHorizontalScroll(page);
    if (SHOTS) await page.screenshot({ path: `${SHOTS}/${info.project.name}-${theme}-landing.png` });
    await page.goto('/app');
    await expectNoHorizontalScroll(page);
    const base = await openDemo(page);
    await page.goto('/app');
    await expectNoHorizontalScroll(page);
    for (const p of PAGES) {
      await page.goto(`${base}/${p}`);
      if (p === 'mapa') await page.waitForSelector('.djs-element');
      await expect(page.getByText('Carregando…')).toHaveCount(0);
      await page.waitForTimeout(300);
      await expectNoHorizontalScroll(page);
      if (SHOTS) await page.screenshot({ path: `${SHOTS}/${info.project.name}-${theme}-${p}.png` });
    }
    await page.goto('/app/novo');
    await expectNoHorizontalScroll(page);
    await page.goto('/app/novo/formulario');
    await expectNoHorizontalScroll(page);
    await page.goto('/app/importar');
    await expectNoHorizontalScroll(page);
  }
  expect(errors).toEqual([]);
});

test('mapa no celular: etapa abre e detalhes aparecem em painel', async ({ page }, info) => {
  await prepare(page);
  const base = await openDemo(page);
  await page.goto(`${base}/mapa`);
  await page.waitForSelector('.djs-element');
  const vp = page.viewportSize()!;
  // O diagrama nunca fica espremido: escala mínima legível de 60%.
  expect(Number(await page.getByTestId('bpmn-canvas').getAttribute('data-zoom'))).toBeGreaterThanOrEqual(0.59);
  if (vp.width < 768) {
    // No celular, a navegação por etapas (acessível) abre o plano detalhado.
    await page.getByRole('navigation', { name: 'Etapas do processo' }).getByRole('button', { name: /^Separação/ }).click();
  } else {
    // No desktop, clique na etapa no próprio diagrama.
    await page.locator('.djs-element[data-element-id="Stage_3"]').first().click();
  }
  await expect(page.getByText('Atividades de “Separação”')).toBeVisible();
  await page.getByRole('button', { name: 'Conferir itens separados' }).first().click({ timeout: 10_000 });
  const dlg = page.getByRole('dialog');
  await expect(dlg).toContainText('Conferente');
  const box = await dlg.boundingBox();
  if (vp.width < 768) expect(box!.y + box!.height).toBeGreaterThan(vp.height - 2); // folha inferior
  if (SHOTS) await page.screenshot({ path: `${SHOTS}/${info.project.name}-drawer.png` });
  await page.getByRole('button', { name: 'Fechar painel' }).click();
  await page.getByRole('button', { name: 'Visão macro' }).first().click();
  await expect(page.getByText('Visão macro. Clique em uma etapa')).toBeVisible();
});

test('tema claro/escuro em um clique, persistido no aparelho', async ({ page }) => {
  await prepare(page);
  await page.emulateMedia({ colorScheme: 'light' });
  await page.goto('/app');
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'light'); // 1ª visita segue o sistema
  await page.getByRole('button', { name: 'Mudar para tema escuro' }).click();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  await page.reload();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  const bg = await page.evaluate(() => getComputedStyle(document.body).backgroundColor);
  expect(bg).not.toBe('rgb(255, 255, 255)');
});

test('PWA: manifesto, ícones, service worker e funcionamento offline com dados locais', async ({ page, context }) => {
  await prepare(page);
  await page.goto('/app');
  const manifestHref = await page.locator('link[rel="manifest"]').getAttribute('href');
  expect(manifestHref).toBeTruthy();
  const manifest = await (await page.request.get(manifestHref!)).json();
  expect(manifest).toMatchObject({ name: 'NexoProcess', display: 'standalone', lang: 'pt-BR' });
  expect(manifest.icons.map((i: any) => i.sizes)).toEqual(expect.arrayContaining(['192x192', '512x512']));
  expect(manifest.icons.some((i: any) => i.purpose === 'maskable')).toBe(true);
  for (const i of manifest.icons) expect((await page.request.get(`/${i.src}`)).status()).toBe(200);
  await expect(page.locator('link[rel="apple-touch-icon"]')).toHaveCount(1);
  await expect(page.locator('meta[name="viewport"]')).toHaveAttribute('content', /viewport-fit=cover/);

  const base = await openDemo(page);
  await page.goto(`${base}/mapa`);
  await page.waitForSelector('.djs-element');
  await page.evaluate(async () => {
    await navigator.serviceWorker.ready;
  });
  await page.reload(); // garante que a página está controlada pelo SW
  await page.waitForFunction(() => !!navigator.serviceWorker.controller);
  const url = page.url();
  await context.setOffline(true);
  await page.goto(url.replace(/mapa$/, 'diagnostico'));
  await expect(page.getByText('Resumo do processo atual')).toBeVisible();
  await expect(page.getByText(/Offline — seus dados continuam disponíveis/)).toBeVisible();
  await page.goto(url);
  await page.waitForSelector('.djs-element');
  await context.setOffline(false);
});
