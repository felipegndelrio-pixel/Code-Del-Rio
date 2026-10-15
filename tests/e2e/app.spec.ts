import { test, expect, type Page, type BrowserContext } from '@playwright/test';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createUser, sql, type TestUser } from '../db/helpers';

// ExcelJS via require: o carregador ESM do Playwright não lida com uma dependência CJS dele.
const ExcelJS = createRequire(import.meta.url)('exceljs') as typeof import('exceljs');

let gerente: TestUser;
let observador: TestUser;
let projectUrl = '';
let projectCode = '';

test.describe.configure({ mode: 'serial' });

test.beforeAll(async () => {
  gerente = await createUser('e2e-gerente', { canCreate: true });
  observador = await createUser('e2e-observador');
});
test.afterAll(async () => {
  await sql.end();
});

async function login(page: Page, u: TestUser) {
  await page.goto('/entrar');
  await page.getByLabel('E-mail').fill(u.email);
  await page.getByLabel('Senha').fill(u.password);
  await page.getByRole('button', { name: 'Entrar' }).click();
  await expect(page.getByRole('heading', { name: /plano × realizado|dashboard executivo/i })).toBeVisible();
}

function stat(page: Page, label: string) {
  return page.locator('div.rounded-xl', { has: page.getByText(label, { exact: true }) }).first().locator('div').first();
}

test('login inválido mostra erro e não entra', async ({ page }) => {
  await page.goto('/entrar');
  await page.getByLabel('E-mail').fill('ninguem@teste.local');
  await page.getByLabel('Senha').fill('senha-errada-123');
  await page.getByRole('button', { name: 'Entrar' }).click();
  await expect(page.getByRole('alert')).toContainText('E-mail ou senha inválidos');
  await page.goto('/');
  await expect(page).toHaveURL(/\/entrar/);
});

test('gerente cria projeto e ações; dados persistem após recarregar', async ({ page }) => {
  await login(page, gerente);
  await page.getByRole('link', { name: 'Projetos' }).first().click();
  await page.getByRole('button', { name: 'Novo projeto' }).click();
  const dlg = page.getByRole('dialog');
  await dlg.getByLabel('Nome').fill('Programa de Transformação E2E');
  await dlg.getByLabel('Área').fill('Operações');
  await dlg.getByLabel('Início planejado').fill('2026-01-01');
  await dlg.getByLabel('Fim planejado').fill('2026-12-31');
  await dlg.getByLabel('Orçamento planejado (R$)').fill('100000');
  await dlg.getByRole('button', { name: 'Criar projeto' }).click();
  await expect(page.getByRole('heading', { name: 'Programa de Transformação E2E' })).toBeVisible();
  projectUrl = page.url();
  projectCode = (await page.locator('span.font-mono').first().textContent())!.trim();
  expect(projectCode).toMatch(/^PRJ-\d{5}$/);

  await page.getByRole('tab', { name: 'Plano de ação' }).click();
  for (const [title, due] of [
    ['Mapear processos críticos', '2026-03-31'],
    ['Implantar novo fluxo', '2026-02-15'],
  ]) {
    await page.getByRole('button', { name: 'Nova ação' }).click();
    const d = page.getByRole('dialog');
    await d.getByLabel('Ação').fill(title);
    await d.getByLabel('Responsável principal').selectOption({ label: 'e2e-gerente' });
    await d.getByLabel('Início', { exact: true }).fill('2026-01-10');
    await d.getByLabel('Prazo').fill(due);
    await d.getByLabel('Prioridade').selectOption('critica');
    await d.getByRole('button', { name: 'Salvar' }).click();
    await expect(page.getByRole('cell', { name: title })).toBeVisible();
  }
  await page.reload();
  await page.getByRole('tab', { name: 'Plano de ação' }).click();
  await expect(page.getByText('Mapear processos críticos')).toBeVisible();
  await expect(page.getByText('Implantar novo fluxo')).toBeVisible();
  const r = await sql.query('select count(*)::int n from public.actions a join public.projects p on p.id = a.project_id where p.code = $1', [projectCode]);
  expect(r.rows[0].n).toBe(2);
});

test('conclusão registra autor; dashboard recalcula indicadores', async ({ page }) => {
  await login(page, gerente);
  await expect(stat(page, 'Ações atrasadas')).toHaveText('2');
  await page.goto(projectUrl + '?aba=acoes');
  await page.getByText('Implantar novo fluxo').click();
  await page.getByRole('dialog').getByRole('button', { name: 'Concluir' }).click();
  await page.getByRole('dialog', { name: 'Concluir ação' }).getByRole('button', { name: 'Concluir' }).click();
  await expect(page.getByText(/concluída e registrada/)).toBeVisible();
  const r = await sql.query(`select a.completed_by, a.status from public.actions a join public.projects p on p.id = a.project_id where p.code = $1 and a.title = 'Implantar novo fluxo'`, [projectCode]);
  expect(r.rows[0]).toEqual({ completed_by: gerente.id, status: 'concluida' });
  await page.goto('/');
  await expect(stat(page, 'Ações atrasadas')).toHaveText('1');
});

test('kanban: arrastar muda status de forma persistente', async ({ page }) => {
  await login(page, gerente);
  await page.goto(projectUrl + '?aba=acoes');
  await page.getByRole('button', { name: 'Kanban' }).click();
  const card = page.locator('article', { hasText: 'Mapear processos críticos' });
  await card.dragTo(page.getByLabel('Coluna Em andamento'));
  await expect(page.getByLabel('Coluna Em andamento').locator('article', { hasText: 'Mapear processos críticos' })).toBeVisible();
  const r = await sql.query(`select a.status, a.actual_start from public.actions a join public.projects p on p.id = a.project_id where p.code = $1 and a.title = 'Mapear processos críticos'`, [projectCode]);
  expect(r.rows[0].status).toBe('em_andamento');
  expect(r.rows[0].actual_start).toBeTruthy();
});

test('risco alto entra na matriz e no dashboard; histórico registra alterações', async ({ page }) => {
  await login(page, gerente);
  await page.goto(projectUrl + '?aba=riscos');
  await page.getByRole('button', { name: 'Novo' }).click();
  const d = page.getByRole('dialog');
  await d.getByLabel('Risco').fill('Atraso de fornecedor crítico');
  await d.getByLabel('Probabilidade').selectOption('5');
  await d.getByLabel('Impacto').selectOption('4');
  await d.getByLabel('Estratégia de resposta').selectOption('mitigar');
  await d.getByRole('button', { name: 'Salvar' }).click();
  await expect(page.getByRole('cell', { name: '20' })).toBeVisible();
  await expect(page.getByLabel('Probabilidade 5, impacto 4: 1 risco(s)')).toBeVisible();
  await page.goto('/');
  await expect(stat(page, 'Riscos altos')).toHaveText('1');
  await page.goto(projectUrl + '?aba=historico');
  await expect(page.getByRole('cell', { name: 'status' }).first()).toBeVisible();
  await expect(page.getByText(gerente.email).first()).toBeVisible();
});

test('observador: vê o projeto mas sem controles de edição; API recusa escrita', async ({ page, browser }) => {
  await login(page, gerente);
  await page.goto(projectUrl + '?aba=membros');
  await page.getByLabel('E-mail do usuário (precisa ter conta)').fill(observador.email);
  await page.getByLabel('Papel').selectOption('observador');
  await page.getByRole('button', { name: 'Incluir' }).click();
  await expect(page.getByText(observador.email)).toBeVisible();

  const ctx: BrowserContext = await browser.newContext();
  const p2 = await ctx.newPage();
  await login(p2, observador);
  await p2.goto(projectUrl + '?aba=acoes');
  await expect(p2.getByText('Mapear processos críticos')).toBeVisible();
  await expect(p2.getByRole('button', { name: 'Nova ação' })).toHaveCount(0);
  await p2.goto(projectUrl + '?aba=riscos');
  await expect(p2.getByRole('button', { name: /^Editar/ })).toHaveCount(0);
  // Tentativa direta via API com o token do observador (sem depender da UI)
  const projectId = projectUrl.split('/projetos/')[1].split('?')[0];
  const result = await p2.evaluate(async (projectId) => {
    const key = Object.keys(localStorage).find((k) => k.includes('auth-token'))!;
    const token = JSON.parse(localStorage.getItem(key)!).access_token;
    const base = 'http://127.0.0.1:54321/rest/v1';
    const res = await fetch(`${base}/risks?title=eq.Atraso%20de%20fornecedor%20cr%C3%ADtico&project_id=eq.${projectId}`, {
      method: 'PATCH',
      headers: { authorization: `Bearer ${token}`, apikey: token, 'content-type': 'application/json', prefer: 'return=representation' },
      body: JSON.stringify({ status: 'fechado' }),
    });
    return { status: res.status, body: await res.json() };
  }, projectId);
  expect(result.body).toEqual([]);
  const r = await sql.query(`select r.status from public.risks r join public.projects p on p.id = r.project_id where p.code = $1 and r.title = 'Atraso de fornecedor crítico'`, [projectCode]);
  expect(r.rows[0].status).toBe('aberto');
  await ctx.close();
});

test('exportação XLSX contém abas e dados do projeto', async ({ page }) => {
  await login(page, gerente);
  await page.getByRole('link', { name: 'Planilhas' }).first().click();
  const [dl] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: 'Exportar XLSX' }).click()]);
  const path = await dl.path();
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(new Uint8Array(readFileSync(path!)).buffer);
  const names = wb.worksheets.map((w) => w.name);
  for (const n of ['Resumo', 'Projetos', 'Ações', 'Cronograma', 'Marcos', 'Riscos', 'Problemas', 'Stakeholders', 'Decisões', 'Indicadores', 'Histórico']) expect(names).toContain(n);
  const acoes: string[] = [];
  wb.getWorksheet('Ações')!.eachRow((row, i) => i > 1 && acoes.push(String(row.getCell(5).value)));
  expect(acoes).toEqual(expect.arrayContaining(['Mapear processos críticos', 'Implantar novo fluxo']));
});

test('importação: planilha inválida é bloqueada; válida é simulada e gravada', async ({ page }) => {
  await login(page, gerente);
  await page.getByRole('link', { name: 'Planilhas' }).first().click();

  // Diretório ASCII: o Chromium não anexa arquivos de caminhos com acentos via setInputFiles neste ambiente.
  const dir = join(tmpdir(), `e2e-fixtures-${Date.now()}`);
  mkdirSync(dir, { recursive: true });
  execFileSync('npx', ['tsx', 'tests/e2e/make-fixtures.ts', dir, projectCode, gerente.email], { stdio: 'inherit' });
  const badPath = `${dir}/invalida.xlsx`;
  const goodPath = `${dir}/valida.xlsx`;
  await page.getByLabel('Arquivo para importar').setInputFiles(badPath);
  await expect(page.getByText(/valor "Talvez" não aceito/)).toBeVisible();
  await expect(page.getByRole('button', { name: 'Simular no servidor' })).toBeDisabled();
  await expect(page.getByRole('button', { name: 'Confirmar importação' })).toBeDisabled();

  await page.getByLabel('Arquivo para importar').setInputFiles(goodPath);
  await expect(page.getByText('0 erro(s)')).toBeVisible();
  await page.getByRole('button', { name: 'Simular no servidor' }).click();
  await expect(page.getByText('Simulação aprovada — nada foi gravado ainda')).toBeVisible();
  const countImported = `select count(*)::int n from public.actions a join public.projects p on p.id = a.project_id where p.code = $1 and a.title = 'Ação importada via planilha'`;
  let r = await sql.query(countImported, [projectCode]);
  expect(r.rows[0].n).toBe(0);
  await page.getByRole('button', { name: 'Confirmar importação' }).click();
  await expect(page.getByText('Relatório final — gravado com sucesso')).toBeVisible();
  r = await sql.query(countImported, [projectCode]);
  expect(r.rows[0].n).toBe(1);
});

test('anexo com conteúdo falso é rejeitado antes do envio', async ({ page }) => {
  await login(page, gerente);
  await page.goto(projectUrl + '?aba=documentos');
  const fakeDir = join(tmpdir(), `e2e-doc-${Date.now()}`);
  mkdirSync(fakeDir, { recursive: true });
  const fake = join(fakeDir, 'contrato.pdf');
  writeFileSync(fake, Buffer.from([0x4d, 0x5a, 0x90, 0x00, 1, 2, 3]));
  await page.getByLabel('Selecionar arquivo').setInputFiles(fake);
  await expect(page.getByText('O conteúdo do arquivo não corresponde a .pdf')).toBeVisible();
  const r = await sql.query(`select count(*)::int n from public.documents where file_name = 'contrato.pdf'`);
  expect(r.rows[0].n).toBe(0);
});

test('indisponibilidade da API mostra erro tratado com opção de tentar novamente', async ({ page }) => {
  await login(page, gerente);
  await page.route('**/rest/v1/**', (route) => route.abort('connectionrefused'));
  await page.reload();
  // o cliente faz 3 retentativas com backoff (≈7 s) antes de reportar a falha
  await expect(page.getByRole('alert').filter({ hasText: 'Serviço indisponível' })).toBeVisible({ timeout: 30_000 });
  await expect(page.getByRole('button', { name: 'Tentar novamente' })).toBeVisible();
  await page.unroute('**/rest/v1/**');
  await page.getByRole('button', { name: 'Tentar novamente' }).click();
  await expect(stat(page, 'Projetos ativos')).toHaveText('1');
});

test('sem conexão: aviso de offline é exibido', async ({ page, context }) => {
  await login(page, gerente);
  await context.setOffline(true);
  await expect(page.getByText(/Sem conexão/)).toBeVisible();
  await context.setOffline(false);
});

test('PWA: manifesto, ícones e service worker', async ({ page, request }) => {
  const res = await request.get('/manifest.webmanifest');
  expect(res.ok()).toBeTruthy();
  const m = await res.json();
  expect(m).toMatchObject({ name: 'Gestão Executiva de Projetos', display: 'standalone', start_url: '/' });
  for (const icon of m.icons) expect((await request.get(icon.src)).ok()).toBeTruthy();
  await page.goto('/entrar');
  const sw = await page.evaluate(async () => {
    const reg = await navigator.serviceWorker.ready;
    return Boolean(reg.active);
  });
  expect(sw).toBe(true);
  // a API nunca é servida pelo cache do service worker
  const swText = await (await request.get('/sw.js')).text();
  expect(swText).not.toMatch(/rest\/v1.*CacheFirst|NetworkFirst.*rest\/v1/);
});

test.describe('celular', () => {
  test.use({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  test('layout responsivo sem rolagem horizontal; navegação inferior', async ({ page }) => {
    await login(page, gerente);
    for (const path of ['/', '/projetos', projectUrl.replace(/^https?:\/\/[^/]+/, '') + '?aba=acoes', '/planilhas', '/minhas-acoes']) {
      await page.goto(path);
      await page.waitForLoadState('networkidle');
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
      expect(overflow, path).toBeLessThanOrEqual(1);
    }
    await expect(page.getByRole('navigation', { name: 'Navegação inferior' })).toBeVisible();
    await page.screenshot({ path: 'test-results/mobile-minhas-acoes.png', fullPage: true });
  });
});

test('capturas de tela para documentação', async ({ page }) => {
  await login(page, gerente);
  await page.waitForLoadState('networkidle');
  await page.screenshot({ path: 'test-results/screens/dashboard-desktop.png', fullPage: true });
  await page.goto(projectUrl);
  await page.waitForLoadState('networkidle');
  await page.screenshot({ path: 'test-results/screens/projeto-visao-geral.png', fullPage: true });
  await page.goto(projectUrl + '?aba=acoes');
  await page.getByRole('button', { name: 'Kanban' }).click();
  await page.screenshot({ path: 'test-results/screens/plano-acao-kanban.png', fullPage: true });
  await page.goto(projectUrl + '?aba=riscos');
  await page.waitForLoadState('networkidle');
  await page.screenshot({ path: 'test-results/screens/riscos.png', fullPage: true });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');
  await page.waitForLoadState('networkidle');
  await page.screenshot({ path: 'test-results/screens/dashboard-celular.png', fullPage: true });
});
