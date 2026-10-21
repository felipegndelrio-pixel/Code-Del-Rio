import { test, expect, type Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { readFileSync } from 'node:fs';
import { handleLicense } from '../../api/_lib/handlers';
import { memoryStore, type LicenseStatus } from '../../api/_lib/store';
import { signToken } from '../../src/license/token';
import { openDemo, prepare } from './helpers';

// Modo de venda (projeto "licenca", build com VITE_LICENSE_REQUIRED=true na porta 4181).
// /api/license é atendido pelo handler REAL da API (memória + chave SÓ DE TESTE), então
// o teste cobre interface, API e assinatura juntas.
const keys = JSON.parse(readFileSync(new URL('./fixtures/license-test-keys.json', import.meta.url), 'utf8')) as { privateJwk: JsonWebKey; publicJwk: JsonWebKey };
const CHECKOUT = 'https://pay.hotmart.com/TESTE';
const BUYER = 'comprador@ex.com';
const SUPPORT = 'suporte@exemplo.com.br';

async function api(page: Page, licenses: Record<string, LicenseStatus> | null) {
  const store = licenses ? memoryStore(licenses) : null;
  await page.route('**/api/license', async (route) => {
    const req = route.request();
    const res = await handleLicense(new Request('http://x.test/api/license', { method: req.method(), headers: { 'Content-Type': 'application/json' }, body: req.postData() ?? undefined }), { store, privateJwk: keys.privateJwk });
    await route.fulfill({ status: res.status, contentType: 'application/json', body: await res.text() });
  });
}

async function login(page: Page, email: string) {
  await page.getByLabel('E-mail da compra').fill(email);
  await page.getByRole('button', { name: 'Entrar' }).click();
}

const stored = (page: Page) => page.evaluate(() => localStorage.getItem('nexo.license'));

test('sem acesso, /app leva para a entrada e preserva o destino', async ({ page }) => {
  await prepare(page);
  await api(page, {});
  await page.goto('/app/importar');
  await expect(page).toHaveURL(/\/entrar\?volta=%2Fapp%2Fimportar$/);
  await expect(page.getByRole('heading', { level: 1, name: 'Entrar no NexoProcess' })).toBeVisible();
});

test('e-mail sem compra mostra o motivo e o link de compra', async ({ page }) => {
  await prepare(page);
  await api(page, { [BUYER]: 'active' });
  await page.goto('/entrar');
  await login(page, 'outro@ex.com');
  const alert = page.getByRole('alert');
  await expect(alert).toContainText('Não encontramos uma compra ativa para este e-mail.');
  await expect(alert.getByRole('link', { name: 'Comprar na Hotmart' })).toHaveAttribute('href', CHECKOUT);
  await expect(page.getByLabel('E-mail da compra')).toHaveAttribute('aria-invalid', 'true');
  expect(await stored(page)).toBeNull();
});

test('e-mail com compra ativa entra, volta ao destino e continua apos recarregar', async ({ page }) => {
  await prepare(page);
  await api(page, { [BUYER]: 'active' });
  await page.goto('/app/importar');
  await expect(page).toHaveURL(/\/entrar/);
  await login(page, '  Comprador@EX.com ');
  await expect(page).toHaveURL(/\/app\/importar$/);
  await expect(page.getByRole('heading', { name: 'Escolha o arquivo' })).toBeVisible();
  expect(await stored(page)).toMatch(/^v1\./);
  await page.reload();
  await expect(page).toHaveURL(/\/app\/importar$/);
  await expect(page.getByRole('heading', { name: 'Escolha o arquivo' })).toBeVisible();
  // Já com acesso, /entrar segue direto para o app.
  await page.goto('/entrar');
  await expect(page).toHaveURL(/\/app$/);
});

test('acesso ativado continua funcionando offline', async ({ page, context }) => {
  await prepare(page);
  await api(page, { [BUYER]: 'active' });
  await page.goto('/entrar');
  await login(page, BUYER);
  await expect(page).toHaveURL(/\/app$/);
  await page.evaluate(async () => {
    await navigator.serviceWorker.ready;
  });
  await page.reload();
  await page.waitForFunction(() => !!navigator.serviceWorker.controller);
  await context.setOffline(true);
  await page.goto('/app/importar');
  await expect(page.getByRole('heading', { name: 'Escolha o arquivo' })).toBeVisible();
  await expect(page).toHaveURL(/\/app\/importar$/);
  await context.setOffline(false);
});

test('token adulterado ou de outra chave nao abre o app', async ({ page }) => {
  await prepare(page);
  await api(page, {});
  const now = Math.floor(Date.now() / 1000);
  const kp = await crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign', 'verify']);
  const otherKey = await crypto.subtle.exportKey('jwk', kp.privateKey);
  const forged = await signToken({ v: 1, sub: BUYER, iat: now, exp: now + 86_400 }, otherKey);
  await page.addInitScript((t) => localStorage.setItem('nexo.license', t), forged);
  await page.goto('/app');
  await expect(page).toHaveURL(/\/entrar/);
  expect(await stored(page)).toBeNull();
});

test('reembolso: a renovacao em segundo plano encerra o acesso', async ({ page }) => {
  await prepare(page);
  await api(page, { [BUYER]: 'revoked' });
  const now = Math.floor(Date.now() / 1000);
  const old = await signToken({ v: 1, sub: BUYER, iat: now - 8 * 86_400, exp: now + 22 * 86_400 }, keys.privateJwk);
  await page.addInitScript((t) => {
    if (!sessionStorage.getItem('semeado')) {
      localStorage.setItem('nexo.license', t);
      sessionStorage.setItem('semeado', '1');
    }
  }, old);
  await page.goto('/app');
  await expect(page).toHaveURL(/\/entrar\?motivo=revogado$/);
  await expect(page.getByRole('status').filter({ hasText: 'Acesso encerrado neste aparelho' })).toBeVisible();
  expect(await stored(page)).toBeNull();
});

test('ativacao nao configurada no servidor (503) mostra mensagem clara', async ({ page }) => {
  await prepare(page);
  await api(page, null);
  await page.goto('/entrar');
  await login(page, BUYER);
  await expect(page.getByRole('alert')).toContainText('A ativação está indisponível no momento.');
});

test('destino externo em ?volta e ignorado (sem redirecionamento aberto)', async ({ page }) => {
  await prepare(page);
  await api(page, { [BUYER]: 'active' });
  await page.goto('/entrar?volta=https%3A%2F%2Fevil.example%2F');
  await login(page, BUYER);
  await expect(page).toHaveURL(/127\.0\.0\.1:4181\/app$/);
});

test('landing do modo de venda: acesso por e-mail e link de compra; ajuda segue publica', async ({ page }) => {
  await prepare(page);
  await page.goto('/');
  await expect(page.getByText('Acesso com o e-mail usado na compra.')).toBeVisible();
  const buy = page.getByRole('link', { name: 'Comprar na Hotmart' });
  await expect(buy).toHaveCount(2); // topo e chamada final
  for (const l of await buy.all()) await expect(l).toHaveAttribute('href', CHECKOUT);
  await expect(page.getByRole('button', { name: 'Ver demonstração fictícia' })).toHaveCount(0);
  await expect(page.getByText('Explore a demonstração fictícia')).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Experimentar a versão Demo' })).toHaveCount(2); // topo e chamada final
  await expect(page.getByText('nome provisório')).toHaveCount(0);
  await expect(page.getByRole('link', { name: SUPPORT })).toHaveAttribute('href', `mailto:${SUPPORT}`);
  await page.goto('/app/ajuda');
  await expect(page.getByRole('heading', { level: 1, name: 'Ajuda' })).toBeVisible();
  // Privacidade fiel ao build de venda: o e-mail da compra é conferido no servidor.
  await expect(page.locator('#privacidade')).toContainText('o e-mail digitado na entrada é conferido no nosso servidor');
  await expect(page.locator('#privacidade')).not.toContainText('Não há contas');
  await expect(page.locator('#suporte').getByRole('link', { name: SUPPORT })).toBeVisible();
  await page.goto('/entrar');
  await expect(page.getByRole('link', { name: SUPPORT })).toHaveAttribute('href', `mailto:${SUPPORT}`);
  await expect(page.getByRole('link', { name: 'Como usamos seu e-mail' })).toHaveAttribute('href', '/app/ajuda#privacidade');
});

for (const theme of ['dark', 'light'] as const) {
  test(`entrada acessivel (axe, ${theme}), inclusive com erro`, async ({ page }) => {
    await prepare(page, { theme });
    await api(page, {});
    await page.goto('/entrar');
    const scan = async () => (await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa']).analyze()).violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(' ')).join(' | ')}`);
    expect(await scan()).toEqual([]);
    await login(page, 'nao@ex.com');
    await expect(page.getByRole('alert')).toBeVisible();
    await expect(page.locator('#entrar-erro')).toBeFocused();
    expect(await scan()).toEqual([]);
  });
}

test('modo demo: navega no exemplo, mas salvar e exportar mostram o convite de compra', async ({ page }) => {
  const { errors } = await prepare(page);
  await api(page, {});
  await page.goto('/');
  await page.getByRole('button', { name: 'Experimentar a versão Demo' }).first().click(); // direto da landing
  await expect(page).toHaveURL(/\/app\/p\/[^/]+\/visao-geral$/);
  await expect(page.getByText('Versão de demonstração.')).toBeVisible();
  expect(await stored(page)).toBeNull(); // demo não cria acesso

  const base = page.url().replace(/\/visao-geral$/, '');
  await page.goto(`${base}/plano`);
  await page.getByRole('button', { name: 'Exportar planilha (CSV)' }).click();
  const blocked = page.getByTestId('demo-blocked');
  await expect(blocked).toContainText('Modo de demonstração. Compre o acesso na Hotmart para salvar.');
  await expect(blocked.getByRole('link', { name: 'Comprar acesso' })).toHaveAttribute('href', CHECKOUT);
  await blocked.getByRole('button', { name: 'Fechar aviso' }).click();

  // Editar funciona na tela, mas não grava: o indicador deixa isso claro.
  await page.getByRole('combobox', { name: /^Situação de / }).first().selectOption('em_andamento');
  await expect(page.getByTestId('save-state')).toContainText('Demonstração · não salvo');
  await expect(blocked).toBeVisible();

  // As telas de criação abrem na demonstração (o bloqueio é ao salvar).
  await page.goto('/app/novo/formulario');
  await expect(page).toHaveURL(/\/app\/novo\/formulario$/);

  await page.getByRole('button', { name: 'Já comprei' }).first().click();
  await expect(page).toHaveURL(/\/entrar$/);
  await page.goto('/app');
  await expect(page).toHaveURL(/\/entrar\?volta=%2Fapp$/); // saiu da demonstração
  expect(errors).toEqual([]);
});

// LGPD: Política de Privacidade e Termos de Uso públicos (sem compra), linkados na
// página de vendas, na entrada e na Ajuda; acessíveis (axe) nos dois temas.
for (const theme of ['dark', 'light'] as const) {
  test(`privacidade e termos públicos, linkados e acessíveis (${theme})`, async ({ page }) => {
    const { errors } = await prepare(page, { theme });
    await api(page, {});
    const scan = async () => (await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa']).analyze()).violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(' ')).join(' | ')}`);
    await page.goto('/');
    await page.getByRole('contentinfo').getByRole('link', { name: 'Política de Privacidade' }).click();
    await expect(page).toHaveURL(/\/privacidade$/); // sem compra: não redireciona para /entrar
    await expect(page.getByRole('heading', { level: 1, name: 'Política de Privacidade' })).toBeVisible();
    for (const t of ['e-mail usado na compra', 'Hotmart', 'Cloudflare', 'Supabase', 'art. 18', 'ANPD', SUPPORT]) await expect(page.locator('article')).toContainText(t);
    expect(await scan()).toEqual([]);
    await page.getByRole('link', { name: 'Termos de Uso' }).click();
    await expect(page).toHaveURL(/\/termos$/);
    for (const t of ['7 dias', 'intransferível', '30 dias', 'Baixar backup', 'estimativas']) await expect(page.locator('article')).toContainText(t);
    expect(await scan()).toEqual([]);
    await page.goto('/entrar');
    await expect(page.getByRole('link', { name: 'Termos de Uso' })).toHaveAttribute('href', '/termos');
    await expect(page.getByRole('link', { name: 'Política de Privacidade' })).toHaveAttribute('href', '/privacidade');
    await page.goto('/app/ajuda');
    await expect(page.getByRole('link', { name: 'Política de Privacidade' })).toHaveAttribute('href', '/privacidade');
    expect(errors).toEqual([]);
  });
}

// Meus projetos: links diretos para Privacidade e Termos (o cartão aparece quando há projetos).
test('meus projetos: links diretos para Privacidade e Termos', async ({ page }) => {
  await prepare(page);
  await api(page, { [BUYER]: 'active' });
  await page.goto('/entrar');
  await login(page, BUYER);
  await expect(page).toHaveURL(/\/app$/);
  await openDemo(page);
  await page.goto('/app');
  await expect(page.getByRole('heading', { name: 'Seus dados, seu controle' })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Política de Privacidade' }).first()).toHaveAttribute('href', '/privacidade');
  await expect(page.getByRole('link', { name: 'Termos de Uso' }).first()).toHaveAttribute('href', '/termos');
});
