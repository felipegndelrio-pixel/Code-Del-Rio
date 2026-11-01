import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { prepare } from './helpers';

// Landing de venda EN e páginas legais: arquivos estáticos em /en/ (public/en). Sem JavaScript, sem recurso
// externo; o Pages serve o arquivo antes do fallback do app, e o service worker não pode devolver o app no lugar.
const PAGES = [
  { path: '/en/', title: /NexoProcess — From process spreadsheet to improvement plan/ },
  { path: '/en/terms.html', title: /Terms of Use — NexoProcess/ },
  { path: '/en/privacy.html', title: /Privacy Policy — NexoProcess/ },
  { path: '/en/refund.html', title: /Refund Policy — NexoProcess/ },
];

for (const p of PAGES) {
  test(`landing EN: ${p.path} abre estática, sem erro, sem recurso externo e sem violação axe (claro e escuro)`, async ({ page }) => {
    const { errors, external } = await prepare(page);
    for (const scheme of ['light', 'dark'] as const) {
      await page.emulateMedia({ colorScheme: scheme, reducedMotion: 'reduce' });
      const resp = await page.goto(p.path);
      expect(resp?.status()).toBe(200);
      expect(resp?.headers()['content-type']).toContain('text/html');
      await expect(page).toHaveTitle(p.title);
      await expect(page.locator('#root')).toHaveCount(0); // não é o app (fallback SPA)
      await page.waitForLoadState('networkidle');
      const axe = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa']).analyze();
      expect(axe.violations.map((v) => `${scheme}: ${v.id} ${v.nodes.slice(0, 3).map((n) => n.target.join(' ')).join(' | ')}`)).toEqual([]);
    }
    expect(errors).toEqual([]);
    expect(external).toEqual([]);
  });
}

test('landing EN: conteúdo, links de compra e entrada, imagens carregadas', async ({ page }) => {
  await prepare(page);
  await page.goto('/en/');
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('From process spreadsheet to improvement plan.');
  for (const h of ['How it works', 'What is inside', 'Who it is for', 'Pricing', 'Questions']) await expect(page.getByRole('heading', { level: 2, name: h })).toBeVisible();
  for (const s of ['Describe the process', 'See the map and the diagnosis', 'Plan and track the improvement']) await expect(page.getByRole('heading', { level: 3, name: s })).toBeVisible();
  // Em build de teste o marcador vira "#checkout"; no build de venda vira o link real (tests/api/en-site.test.ts).
  const buy = page.getByRole('link', { name: /Buy on Gumroad/ });
  expect(await buy.count()).toBeGreaterThanOrEqual(3);
  for (const l of await buy.all()) expect(await l.getAttribute('href')).toBe('#checkout');
  await expect(page.getByRole('link', { name: 'Already bought? Sign in' })).toHaveAttribute('href', '/entrar?lang=en');
  await expect(page.getByText('US$ 39').first()).toBeVisible();
  const imgs = page.locator('main img');
  expect(await imgs.count()).toBe(3);
  for (const img of await imgs.all()) {
    await img.scrollIntoViewIfNeeded();
    await expect.poll(() => img.evaluate((e: HTMLImageElement) => e.complete && e.naturalWidth > 0)).toBe(true);
  }
  await expect(page.getByText('Sample data').first()).toBeVisible();
  // Promessas que não podem aparecer
  const text = (await page.locator('body').innerText()).toLowerCase();
  expect(text).not.toMatch(/guarantee[sd]? (savings|results|roi)|risk-free|best-in-class/);
  // FAQ abre por teclado (details/summary)
  const faq = page.getByText('Does it use AI?');
  await faq.focus();
  await page.keyboard.press('Enter');
  await expect(page.getByText(/not from generative AI/)).toBeVisible();
});

test('páginas legais EN mostram a faixa DRAFT enquanto houver "TO VALIDATE"', async ({ page }) => {
  await prepare(page);
  for (const f of ['terms', 'privacy', 'refund']) {
    await page.goto(`/en/${f}.html`);
    await expect(page.getByRole('note')).toContainText('DRAFT');
    await expect(page.locator('body')).toHaveAttribute('data-draft', 'true');
    await expect(page.locator('meta[name="robots"]')).toHaveAttribute('content', 'noindex');
  }
});

test('service worker não devolve o app no lugar de /en/ (nem de /en/*.html)', async ({ page }) => {
  await prepare(page);
  await page.goto('/app');
  await page.evaluate(async () => {
    const reg = await navigator.serviceWorker.ready;
    return reg.active?.state;
  });
  await page.reload();
  await expect.poll(() => page.evaluate(() => !!navigator.serviceWorker.controller)).toBe(true);
  for (const p of PAGES) {
    await page.goto(p.path);
    await expect(page).toHaveTitle(p.title);
    await expect(page.locator('#root')).toHaveCount(0);
  }
  // O app continua funcionando offline-first: uma rota do app ainda volta o app shell.
  await page.goto('/app');
  await expect(page.locator('#root')).toHaveCount(1);
});
