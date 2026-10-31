import { test, expect, type Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { readFileSync } from 'node:fs';
import { handleGumroadLicense } from '../../api/_lib/gumroad';
import { memoryStore } from '../../api/_lib/store';
import { signToken } from '../../src/license/token';
import { expectNoHorizontalScroll, prepare } from './helpers';

// Entrada EN (Gumroad) no build de venda (projeto "licenca", porta 4181).
// /api/gumroad-license é atendido pelo handler REAL; a Gumroad é SIMULADA (nenhuma chamada real).
const keys = JSON.parse(readFileSync(new URL('./fixtures/license-test-keys.json', import.meta.url), 'utf8')) as { privateJwk: JsonWebKey; publicJwk: JsonWebKey };
const PRODUCT = '32-nPAicqbLj8B_WswVlMw==';
const KEY = '85DB562A-C11D4B06-A2335A6B-8C079166';
const BUYER = 'customer@example.com';
const purchase = (over: Record<string, unknown> = {}) => ({
  product_id: PRODUCT, email: BUYER, price: 3900, currency: 'usd', sale_id: 'FO8TXN-dbxYaBdahG97Y-Q==', sale_timestamp: '2026-10-01T10:00:00Z',
  refunded: false, disputed: false, dispute_won: false, chargebacked: false, ...over,
});

async function api(page: Page, verify: () => Response) {
  const store = memoryStore();
  const calls: Record<string, unknown>[] = [];
  await page.route('**/api/gumroad-license', async (route) => {
    const req = route.request();
    calls.push(JSON.parse(req.postData() ?? '{}'));
    const res = await handleGumroadLicense(new Request('http://x.test/api/gumroad-license', { method: req.method(), body: req.postData() ?? undefined }), {
      store, privateJwk: keys.privateJwk, productId: PRODUCT, reverifyAfterSec: 3600, fetchImpl: (async () => verify()) as unknown as typeof fetch,
    });
    await route.fulfill({ status: res.status, contentType: 'application/json', body: await res.text() });
  });
  // A entrada EN nunca deve usar a rota PT por e-mail.
  await page.route('**/api/license', (route) => route.fulfill({ status: 599, body: 'rota PT chamada no fluxo EN' }));
  return calls;
}
const ok = (over: Record<string, unknown> = {}) => () => new Response(JSON.stringify({ success: true, uses: 0, purchase: purchase(over) }), { status: 200 });
const notFound = () => new Response(JSON.stringify({ success: false }), { status: 404 });
const local = (page: Page) => page.evaluate(() => ({ token: localStorage.getItem('nexo.license'), key: localStorage.getItem('nexo.license.key'), lang: localStorage.getItem('nexo-ui.lang') }));

async function signIn(page: Page, email: string, key: string) {
  await page.getByLabel('Purchase email').fill(email);
  await page.getByLabel('License key').fill(key);
  await page.getByRole('button', { name: 'Sign in' }).click();
}

test('EN: ?lang=en mostra a entrada Gumroad; e-mail + license key válidos entram e guardam a chave', async ({ page }) => {
  await prepare(page);
  const calls = await api(page, ok());
  await page.goto('/entrar?lang=en&volta=%2Fapp%2Fimportar');
  await expect(page.getByRole('heading', { level: 1, name: 'Sign in to NexoProcess' })).toBeVisible();
  await expect(page.locator('html')).toHaveAttribute('lang', 'en');
  await signIn(page, '  Customer@Example.com ', KEY);
  await expect(page).toHaveURL(/\/app\/importar$/);
  expect(calls).toEqual([{ email: 'Customer@Example.com', license_key: KEY }]); // o campo type=email já tira os espaços
  const s = await local(page);
  expect(s.token).toMatch(/^v1\./);
  expect(s).toMatchObject({ key: KEY, lang: 'en' });
});

test('EN: preferência salva vale sem ?lang; links legais e de compra configurados aparecem', async ({ page }) => {
  await prepare(page);
  await api(page, ok());
  await page.addInitScript(() => localStorage.setItem('nexo-ui.lang', 'en'));
  await page.goto('/entrar');
  await expect(page.getByRole('heading', { level: 1, name: 'Sign in to NexoProcess' })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Terms of Use' })).toHaveAttribute('href', '/en/terms/');
  await expect(page.getByRole('link', { name: 'Privacy Policy' })).toHaveAttribute('href', '/en/privacy/');
  await expect(page.getByRole('link', { name: 'Refund Policy' })).toHaveAttribute('href', '/en/refund/');
  await expect(page.getByRole('link', { name: 'Buy on Gumroad' })).toHaveAttribute('href', 'https://example.gumroad.com/l/teste');
  await expect(page.getByText('Hotmart')).toHaveCount(0);
});

test('EN: chave inexistente mostra o motivo em inglês e não salva nada', async ({ page }) => {
  await prepare(page);
  await api(page, notFound);
  await page.goto('/entrar?lang=en');
  await signIn(page, BUYER, 'WRONG-KEY-0000');
  const alert = page.getByRole('alert');
  await expect(alert).toContainText('We could not find an active purchase for this email and license key.');
  await expect(alert.getByRole('link', { name: 'Buy on Gumroad' })).toBeVisible();
  expect(await local(page)).toMatchObject({ token: null, key: null });
});

test('EN: id fora do formato (1ª venda) → mensagem clara de ativação manual', async ({ page }) => {
  await prepare(page);
  await api(page, ok({ sale_id: 'formato+novo/123' }));
  await page.goto('/entrar?lang=en');
  await signIn(page, BUYER, KEY);
  await expect(page.getByRole('alert')).toContainText("couldn't activate it automatically");
  expect(await local(page)).toMatchObject({ token: null, key: null });
});

test('EN: reembolso detectado na renovação encerra o acesso e explica em inglês', async ({ page }) => {
  await prepare(page);
  await api(page, ok({ refunded: true }));
  const iat = Math.floor(Date.now() / 1000) - 2 * 86_400;
  const t = await signToken({ v: 1, sub: BUYER, iat, exp: iat + 30 * 86_400 }, keys.privateJwk);
  await page.addInitScript(
    ([tok, key]) => {
      localStorage.setItem('nexo.license', tok);
      localStorage.setItem('nexo.license.key', key);
      localStorage.setItem('nexo-ui.lang', 'en');
    },
    [t, KEY],
  );
  await page.goto('/app');
  await expect(page).toHaveURL(/\/entrar\?motivo=revogado$/);
  await expect(page.getByText('Access ended on this device')).toBeVisible();
  expect(await local(page)).toMatchObject({ token: null, key: null });
});

test('EN: Gumroad fora do ar na renovação mantém o acesso (D1)', async ({ page }) => {
  await prepare(page);
  await api(page, () => new Response('x', { status: 503 }));
  const iat = Math.floor(Date.now() / 1000) - 2 * 86_400;
  const t = await signToken({ v: 1, sub: BUYER, iat, exp: iat + 30 * 86_400 }, keys.privateJwk);
  await page.addInitScript(
    ([tok, key]) => {
      localStorage.setItem('nexo.license', tok);
      localStorage.setItem('nexo.license.key', key);
    },
    [t, KEY],
  );
  const renewal = page.waitForResponse('**/api/gumroad-license');
  await page.goto('/app');
  expect((await renewal).status()).toBe(502);
  await expect(page).toHaveURL(/\/app$/);
  expect((await local(page)).token).toBe(t);
});

for (const theme of ['light', 'dark'] as const) {
  test(`EN: entrada acessível (axe, ${theme}) e sem rolagem lateral no celular, inclusive com erro`, async ({ page }) => {
    await prepare(page, { theme });
    await api(page, notFound);
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('/entrar?lang=en');
    await expectNoHorizontalScroll(page);
    await signIn(page, BUYER, 'WRONG-KEY-0000');
    await expect(page.getByRole('alert')).toBeVisible();
    await expectNoHorizontalScroll(page);
    const r = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).analyze();
    expect(r.violations.map((v) => `${v.id}: ${v.nodes.length}`)).toEqual([]);
  });
}
