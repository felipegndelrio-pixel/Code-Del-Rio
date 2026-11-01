import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { prepare } from './helpers';

const TOKEN = 'abcdef0123456789abcdef0123456789';

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
    const { errors, external, beacon } = await prepare(page, { allowBeacon: true });
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
    expect(external).toEqual([]); // nada externo, exceto o beacon do Cloudflare Web Analytics (permitido só aqui, por allowBeacon)
    // O build de teste leva o token (playwright.config.ts): a página tem exatamente 1 script, o beacon, e o pediu.
    await expect(page.locator('script')).toHaveCount(1);
    await expect(page.locator('script[data-cf-beacon]')).toHaveAttribute('src', 'https://static.cloudflareinsights.com/beacon.min.js');
    expect(await page.locator('script[data-cf-beacon]').getAttribute('data-cf-beacon')).toContain(TOKEN);
    expect(beacon.filter((u) => u.endsWith('/beacon.min.js')).length).toBeGreaterThan(0);
  });
}

test('o app NUNCA carrega o Web Analytics: rotas do app sem script de terceiros e sem pedido ao beacon (mesmo permitido em /en/)', async ({ page }) => {
  const { external, beacon, errors } = await prepare(page); // sem allowBeacon: qualquer pedido externo falha o teste
  for (const path of ['/', '/entrar', '/app', '/app/novo', '/app/ajuda']) {
    await page.goto(path);
    await page.waitForLoadState('networkidle');
    await expect(page.locator('script[data-cf-beacon]'), path).toHaveCount(0);
    expect(await page.locator('script[src^="http"]').count(), path).toBe(0);
  }
  expect(beacon).toEqual([]);
  expect(external).toEqual([]);
  expect(errors).toEqual([]);
});

test('landing EN: conteúdo, links de compra e entrada, imagens carregadas', async ({ page }) => {
  await prepare(page, { allowBeacon: true });
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
  await prepare(page, { allowBeacon: true });
  for (const f of ['terms', 'privacy', 'refund']) {
    await page.goto(`/en/${f}.html`);
    await expect(page.getByRole('note')).toContainText('DRAFT');
    await expect(page.locator('body')).toHaveAttribute('data-draft', 'true');
    await expect(page.locator('meta[name="robots"]')).toHaveAttribute('content', 'noindex');
  }
});

test('service worker não devolve o app no lugar de /en/ (nem de /en/*.html)', async ({ page }) => {
  await prepare(page, { allowBeacon: true });
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
