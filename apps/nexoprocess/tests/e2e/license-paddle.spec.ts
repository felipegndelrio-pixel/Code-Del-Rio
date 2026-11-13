import { test, expect, type Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { readFileSync } from 'node:fs';
import { handlePaddleLicense } from '../../api/_lib/paddle';
import { memoryStore } from '../../api/_lib/store';
import { expectNoHorizontalScroll, prepare } from './helpers';

// Entrada e compra pela Paddle no build de venda COM VITE_PADDLE_* (projeto "licenca-paddle", porta 4182).
// /api/paddle-license é atendido pelo handler REAL; a compra é gravada no store em memória (o que o webhook faria).
// Paddle.js é SIMULADO (nenhuma chamada a cdn.paddle.com ou à Paddle).
const keys = JSON.parse(readFileSync(new URL('./fixtures/license-test-keys.json', import.meta.url), 'utf8')) as { privateJwk: JsonWebKey; publicJwk: JsonWebKey };
const TXN = 'txn_01hv8wptq8987qeep44cyrewp9';
const BUYER = 'buyer@example.com';
const PRICE = `pri_${'a1'.repeat(13)}`;
// CSP de /en/* do build COM Paddle (já com cdn.paddle.com e a origem do checkout), lida do _headers gerado.
const EN_CSP = (() => {
  const h = readFileSync(new URL('../../dist-licenca-paddle/_headers', import.meta.url), 'utf8');
  return h.slice(h.indexOf('/en/*')).split('\n').find((l) => l.includes('Content-Security-Policy:'))!.split('Content-Security-Policy:')[1].trim();
})();

async function api(page: Page, opts: { grantedAfter?: number } = {}) {
  const store = memoryStore();
  let calls = 0;
  const granted = opts.grantedAfter ?? 0; // nº de chamadas que devolvem 404 antes de a compra "chegar" pelo webhook
  await page.route('**/api/paddle-license', async (route) => {
    const req = route.request();
    calls++;
    if (calls === granted + 1) await store.grant({ platform: 'paddle', email: BUYER, transaction: TXN, product_id: 'pro_01gsz4t5hdjse780zja8vvr7jg', event: 'PADDLE_TRANSACTION_COMPLETED' });
    const res = await handlePaddleLicense(new Request('http://x.test/api/paddle-license', { method: req.method(), body: req.postData() ?? undefined }), { store, privateJwk: keys.privateJwk, webhookSecret: null, env: null, productId: null, apiKey: null });
    await route.fulfill({ status: res.status, contentType: 'application/json', body: await res.text() });
  });
  await page.route('**/api/license', (route) => route.fulfill({ status: 599, body: 'rota PT chamada no fluxo Paddle' }));
  await page.route('**/api/gumroad-license', (route) => route.fulfill({ status: 599, body: 'rota Gumroad chamada no fluxo Paddle' }));
  return { store, count: () => calls };
}
const local = (page: Page) => page.evaluate(() => ({ token: localStorage.getItem('nexo.license'), txn: localStorage.getItem('nexo.license.txn'), key: localStorage.getItem('nexo.license.key') }));

/** Paddle.js falso: guarda a configuração e, ao abrir o checkout, conclui a compra. */
async function fakePaddle(page: Page) {
  await page.route('https://cdn.paddle.com/paddle/v2/paddle.js', (route) =>
    route.fulfill({
      contentType: 'application/javascript',
      body: `var save = function () { sessionStorage.setItem('__paddle', JSON.stringify({ env: window.__env || null, token: window.__token || null, opened: window.__opened || null })); };
window.Paddle = {
  Environment: { set: function (e) { window.__env = e; save(); } },
  Initialize: function (c) { window.__token = c.token; window.__cb = c.eventCallback; save(); },
  Checkout: { open: function (o) { window.__opened = o; save(); window.__cb({ name: 'checkout.completed', data: { transaction_id: '${TXN}', customer: { email: '${BUYER}' } } }); } },
};`,
    }),
  );
}

test('landing /en/: botão Paddle conclui o checkout e leva a /entrar com txn+e-mail no FRAGMENTO; a entrada ativa sozinha', async ({ page }) => {
  await prepare(page, { enCsp: EN_CSP, allowBeacon: true });
  await fakePaddle(page);
  await api(page); // a compra "chega" já na 1ª chamada
  const urls: string[] = [];
  page.on('framenavigated', (f) => f === page.mainFrame() && urls.push(f.url()));
  await page.goto('/en/');
  const buy = page.getByRole('link', { name: 'Buy with Paddle' });
  await expect(buy).toBeVisible();
  // Gumroad continua lá, intacta.
  await expect(page.getByRole('link', { name: 'Buy on Gumroad' }).first()).toHaveAttribute('href', 'https://example.gumroad.com/l/teste');
  await buy.click();
  await expect(page).toHaveURL(/\/app/, { timeout: 30_000 });
  expect(urls.some((u) => u.endsWith(`/entrar?lang=en#txn=${TXN}&email=buyer%40example.com`))).toBe(true);
});

test('landing /en/: Paddle.js recebe sandbox, token de cliente e o price id; sem JavaScript inline na página', async ({ page }) => {
  await prepare(page, { enCsp: EN_CSP, allowBeacon: true });
  await fakePaddle(page);
  await api(page, { grantedAfter: 99 });
  await page.goto('/en/');
  await page.getByRole('link', { name: 'Buy with Paddle' }).first().click();
  await expect(page).toHaveURL(/\/entrar/);
  // sessionStorage sobrevive à navegação na mesma origem: guarda o que a Paddle.js falsa recebeu.
  const s = JSON.parse((await page.evaluate(() => sessionStorage.getItem('__paddle'))) ?? '{}') as { env: string; token: string; opened: { items: { priceId: string; quantity: number }[]; settings: { displayMode: string; locale: string } } };
  expect(s.env).toBe('sandbox');
  expect(s.token).toBe('test_0123456789abcdef0123456789');
  expect(s.opened.items).toEqual([{ priceId: PRICE, quantity: 1 }]);
  expect(s.opened.settings).toEqual({ displayMode: 'overlay', locale: 'en' });
  const html = await (await page.request.get('/en/')).text();
  expect([...html.matchAll(/<script(?![^>]*\bsrc=)[^>]*>/g)]).toEqual([]);
});

test('retorno do checkout: txn+e-mail no fragmento ativam sozinhos, com "Finishing your purchase…" enquanto o webhook não gravou', async ({ page }) => {
  await prepare(page);
  const { count } = await api(page, { grantedAfter: 2 }); // 2 respostas 404, depois a compra "chega"
  await page.goto(`/entrar?lang=en#txn=${TXN}&email=${encodeURIComponent(BUYER)}`);
  await expect(page.getByText('Finishing your purchase…')).toBeVisible();
  await expect(page).toHaveURL(/\/app/, { timeout: 30_000 });
  expect(count()).toBe(3);
  const s = await local(page);
  expect(s.token).toMatch(/^v1\./);
  expect(s).toMatchObject({ txn: TXN, key: null });
});

test('fragmento é apagado da barra de endereços e nada do retorno vai ao servidor na URL', async ({ page }) => {
  await prepare(page);
  const seen: string[] = [];
  page.on('request', (r) => seen.push(r.url()));
  await api(page, { grantedAfter: 99 });
  await page.goto(`/entrar?lang=en#txn=${TXN}&email=${encodeURIComponent(BUYER)}`);
  await expect(page.getByLabel('Transaction ID')).toHaveValue(TXN);
  expect(page.url()).not.toContain('#txn');
  expect(seen.some((u) => u.includes(TXN) || u.includes('buyer'))).toBe(false);
});

test('entrada manual: e-mail + id da transação entram; id errado ou e-mail diferente mostram a mensagem (sem revelar a causa)', async ({ page }) => {
  await prepare(page);
  const { store } = await api(page);
  await store.grant({ platform: 'paddle', email: BUYER, transaction: TXN, product_id: 'pro_01gsz4t5hdjse780zja8vvr7jg', event: 'PADDLE_TRANSACTION_COMPLETED' });
  await page.goto('/entrar?lang=en');
  await expect(page.getByRole('heading', { name: 'Bought with Paddle?' })).toBeVisible();
  const section = page.getByRole('region', { name: 'Bought with Paddle?' });
  await section.getByLabel('Email used for purchase').fill('other@example.com');
  await section.getByLabel('Transaction ID').fill(TXN);
  await section.getByRole('button', { name: 'Sign in with Paddle' }).click();
  await expect(section.getByText(/couldn’t find an active purchase matching this email address and transaction ID/)).toBeVisible();
  await section.getByLabel('Email used for purchase').fill(BUYER);
  await section.getByRole('button', { name: 'Sign in with Paddle' }).click();
  await expect(page).toHaveURL(/\/app/);
});

test('acessibilidade e 390 px da entrada com a seção Paddle', async ({ page }) => {
  await prepare(page);
  await page.goto('/entrar?lang=en');
  await expect(page.getByRole('heading', { name: 'Bought with Paddle?' })).toBeVisible();
  const r = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).analyze();
  expect(r.violations.map((v) => v.id)).toEqual([]);
  await page.setViewportSize({ width: 390, height: 844 });
  await expectNoHorizontalScroll(page);
});

test('build: o CSP de /en/* ganhou a Paddle e o do app continua com script-src self', async () => {
  const h = readFileSync(new URL('../../dist-licenca-paddle/_headers', import.meta.url), 'utf8');
  const en = h.slice(h.indexOf('/en/*'), h.indexOf('\n\n', h.indexOf('/en/*')));
  expect(en).toContain('https://cdn.paddle.com');
  expect(en).toContain("frame-src 'self' https://checkout.example.test");
  expect(en).toContain("style-src 'self' 'unsafe-inline' https://style.example.test;");
  // A origem do estilo entra SÓ no style-src de /en/*: o resto do arquivo (app, /entrar) não menciona a Paddle nem o host.
  expect(h.replace(en, '')).not.toMatch(/paddle|style\.example\.test/i);
  const app = h.split('\n').find((l) => l.includes('Content-Security-Policy') && !l.includes('static.cloudflareinsights'))!;
  expect(app).toContain("script-src 'self';");
  expect(app).not.toMatch(/paddle/i);
});
