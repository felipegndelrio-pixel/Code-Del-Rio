import { test, expect, type Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { readFileSync } from 'node:fs';
import { handleLicense } from '../../api/_lib/handlers';
import { memoryStore, type LicenseStatus } from '../../api/_lib/store';
import { signToken } from '../../src/license/token';
import { expectNoHorizontalScroll, openDemo, prepare, readWorkspaces } from './helpers';

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
  await expect(page.getByRole('button', { name: 'Sair deste aparelho' })).toHaveCount(0); // a faixa já tem "Já comprei"

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
    for (const t of ['e-mail da compra e dados da transação', 'registros técnicos de acesso', 'Hotmart', 'Cloudflare', 'Supabase', 'art. 18', 'ANPD', SUPPORT]) await expect(page.locator('article')).toContainText(t);
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

// Reembolso dentro da garantia: a sessão anterior é recente (2 h), não de 8 dias.
// Antes da v2.4 a renovação só acontecia com token de mais de 7 dias, e o acesso seguia aberto.
test('licenca revogada com sessao recente: a revalidacao encerra o acesso', async ({ page }) => {
  await prepare(page);
  await api(page, { [BUYER]: 'revoked' });
  const now = Math.floor(Date.now() / 1000);
  const recent = await signToken({ v: 1, sub: BUYER, iat: now - 2 * 3600, exp: now + 30 * 86_400 - 2 * 3600 }, keys.privateJwk);
  await page.addInitScript((t) => {
    if (!sessionStorage.getItem('semeado')) {
      localStorage.setItem('nexo.license', t);
      sessionStorage.setItem('semeado', '1');
    }
  }, recent);
  await page.goto('/app');
  await expect(page).toHaveURL(/\/entrar\?motivo=revogado$/);
  expect(await stored(page)).toBeNull();
  // A sessão anterior não volta: a rota protegida confere de novo e o e-mail não entra.
  await page.goto('/app');
  await expect(page).toHaveURL(/\/entrar\?volta=%2Fapp$/);
  await login(page, BUYER);
  await expect(page.getByRole('alert')).toContainText('Não encontramos uma compra ativa para este e-mail.');
  expect(await stored(page)).toBeNull();
});

// Sair (v2.4): remove só a autorização local; projetos, tema e outros dados ficam.
const local = (page: Page) =>
  page.evaluate(() => ({ license: localStorage.getItem('nexo.license'), demo: localStorage.getItem('nexo.demo'), theme: localStorage.getItem('nexo.theme'), draft: localStorage.getItem('nexo.teste.rascunho') }));
const ids = async (page: Page) => (await readWorkspaces(page)).map((w) => w.id).sort();

test('sair: limpa so o acesso, preserva projetos e dados locais, e protege as rotas depois', async ({ page }) => {
  const { errors } = await prepare(page);
  await api(page, { [BUYER]: 'active' });
  await page.goto('/entrar');
  await login(page, BUYER);
  await expect(page).toHaveURL(/\/app$/);
  const out = page.getByRole('button', { name: 'Sair deste aparelho' });
  await expect(out).toBeVisible();

  const base = await openDemo(page); // projeto salvo no IndexedDB
  const before = await ids(page);
  expect(before.length).toBeGreaterThan(0);
  await page.getByRole('button', { name: /^Mudar para tema/ }).click();
  await page.evaluate(() => localStorage.setItem('nexo.teste.rascunho', 'texto local'));
  const prev = await local(page);
  expect(prev.license).toMatch(/^v1\./);

  await out.click();
  await expect(page).toHaveURL(/\/entrar\?motivo=saiu$/);
  await expect(page.getByRole('status').filter({ hasText: 'Você saiu deste aparelho' })).toBeVisible();
  const after = await local(page);
  expect(after).toEqual({ license: null, demo: null, theme: prev.theme, draft: 'texto local' });
  expect(await ids(page)).toEqual(before);

  // Voltar, recarregar e URL direta não reabrem a área protegida.
  await page.goBack();
  await expect(page).toHaveURL(/\/entrar/);
  await expect(page.getByRole('heading', { level: 1, name: 'Entrar no NexoProcess' })).toBeVisible();
  await page.reload();
  await expect(page).toHaveURL(/\/entrar/);
  await page.goto(`${base}/visao-geral`);
  await expect(page).toHaveURL(/\/entrar\?volta=%2Fapp%2Fp%2F/);
  await page.goto('/app');
  await expect(page).toHaveURL(/\/entrar\?volta=%2Fapp$/);

  // Entrar de novo com o mesmo e-mail: a compra continua valendo e o projeto está lá.
  await login(page, BUYER);
  await expect(page).toHaveURL(/\/app$/);
  await expect(page.getByRole('heading', { level: 1, name: 'Meus projetos' })).toBeVisible();
  expect(await ids(page)).toEqual(before);
  expect(errors).toEqual([]);
});

test('sair em outra aba encerra o acesso nesta tambem', async ({ page, context }) => {
  await prepare(page);
  await api(page, { [BUYER]: 'active' });
  await page.goto('/entrar');
  await login(page, BUYER);
  await expect(page).toHaveURL(/\/app$/);
  const other = await context.newPage();
  await prepare(other);
  await api(other, { [BUYER]: 'active' });
  await other.goto('/app/ajuda');
  await other.getByRole('button', { name: 'Sair deste aparelho' }).click();
  await expect(other).toHaveURL(/\/entrar\?motivo=saiu$/);
  await expect(page).toHaveURL(/\/entrar\?volta=%2Fapp$/);
});

test('cabecalho: Meus projetos e Ajuda levam ao destino certo e mostram onde se esta', async ({ page }) => {
  await prepare(page);
  await api(page, { [BUYER]: 'active' });
  await page.goto('/entrar');
  await login(page, BUYER);
  await openDemo(page);
  const header = page.getByRole('navigation', { name: 'Principal' });
  const projects = header.getByRole('link', { name: 'Meus projetos' });
  const help = header.getByRole('link', { name: 'Ajuda' });

  // De dentro de um projeto para a listagem.
  await projects.click();
  await expect(page).toHaveURL(/\/app$/);
  await expect(page.getByRole('heading', { level: 1, name: 'Meus projetos' })).toBeVisible();
  await expect(projects).toHaveAttribute('aria-current', 'page');

  // Já na listagem: volta ao topo e leva o foco ao título (sem rota nova).
  await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
  await projects.click();
  await expect(page).toHaveURL(/\/app$/);
  await expect.poll(() => page.evaluate(() => window.scrollY)).toBe(0);
  await expect(page.getByRole('heading', { level: 1, name: 'Meus projetos' })).toBeFocused();

  await help.click();
  await expect(page).toHaveURL(/\/app\/ajuda$/);
  await expect(page.getByRole('heading', { level: 1, name: 'Ajuda' })).toBeVisible();
  await expect(help).toHaveAttribute('aria-current', 'page');
  await expect(projects).not.toHaveAttribute('aria-current', 'page');
  await page.goBack();
  await expect(page).toHaveURL(/\/app$/);
  await page.goForward();
  await expect(page).toHaveURL(/\/app\/ajuda$/);
  await projects.click();
  await expect(page).toHaveURL(/\/app$/);
});

for (const width of [320, 390] as const) {
  test.describe(`celular ${width} px`, () => {
    test.use({ viewport: { width, height: 760 }, hasTouch: true });

    test(`cabecalho com rotulos visiveis, alvos de 44 px, sem rolagem lateral, inclusive offline (${width})`, async ({ page, context }) => {
      const { errors } = await prepare(page);
      await api(page, { [BUYER]: 'active' });
      await page.goto('/entrar');
      await login(page, BUYER);
      await openDemo(page);
      await page.goto('/app');
      const header = page.getByRole('navigation', { name: 'Principal' });
      const items = [header.getByRole('link', { name: 'Meus projetos' }), header.getByRole('link', { name: 'Ajuda' }), header.getByRole('button', { name: 'Sair deste aparelho' })];
      const labels = ['Projetos', 'Ajuda', 'Sair'];
      for (const [i, it] of items.entries()) {
        await expect(it).toBeVisible();
        await expect(it).toContainText(labels[i]);
        const b = (await it.boundingBox())!;
        expect(b.width).toBeGreaterThanOrEqual(44);
        expect(b.height).toBeGreaterThanOrEqual(44);
        expect(b.x + b.width).toBeLessThanOrEqual(width);
      }
      await expectNoHorizontalScroll(page);

      await context.setOffline(true);
      await expect(page.getByRole('status').filter({ hasText: 'Offline' })).toBeAttached();
      await expectNoHorizontalScroll(page);
      const themeBox = (await page.getByRole('button', { name: /^Mudar para tema/ }).boundingBox())!;
      expect(themeBox.x + themeBox.width).toBeLessThanOrEqual(width);

      // Sem internet, sair pede confirmação (entrar de novo exige conexão).
      await items[2].tap();
      const dialog = page.getByRole('dialog', { name: 'Sair sem internet?' });
      await expect(dialog).toBeVisible();
      await dialog.getByRole('button', { name: 'Cancelar' }).click();
      await expect(page).toHaveURL(/\/app$/);
      expect(await stored(page)).toMatch(/^v1\./);
      await items[2].tap();
      await dialog.getByRole('button', { name: 'Sair mesmo assim' }).click();
      await expect(page).toHaveURL(/\/entrar\?motivo=saiu$/);
      expect(await stored(page)).toBeNull();
      await expectNoHorizontalScroll(page);
      await context.setOffline(false);
      expect(errors).toEqual([]);
    });

    test(`pagina de vendas: Ajuda visivel e funcionando no celular (${width})`, async ({ page }) => {
      await prepare(page);
      await page.goto('/');
      const help = page.getByRole('link', { name: 'Como funciona' });
      await expect(help).toBeVisible();
      expect((await help.boundingBox())!.height).toBeGreaterThanOrEqual(44);
      await expectNoHorizontalScroll(page);
      await help.tap();
      await expect(page).toHaveURL(/\/app\/ajuda$/);
      await expect(page.getByRole('heading', { level: 1, name: 'Ajuda' })).toBeVisible();
      await expectNoHorizontalScroll(page);
      // Visitante sem sessão: a Ajuda é pública e não mostra "Sair".
      await expect(page.getByRole('button', { name: 'Sair deste aparelho' })).toHaveCount(0);
    });
  });
}
