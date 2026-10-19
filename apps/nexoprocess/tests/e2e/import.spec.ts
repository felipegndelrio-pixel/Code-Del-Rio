import { test, expect, type Page } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { prepare, readWorkspaces } from './helpers';

const XLSX = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

async function choose(page: Page, name: string, mimeType: string, buffer: Buffer) {
  await page.getByTestId('file-input').setInputFiles({ name, mimeType, buffer });
}

test('XLSX válido (modelo oficial preenchido) importa com fluxo, decisões e custos', async ({ page }) => {
  const { errors } = await prepare(page);
  // Fixture: XLSX gerado pelo próprio app (exportação do exemplo, mesmo formato do modelo).
  await page.goto('/app');
  await page.getByRole('button', { name: /Abrir (o )?exemplo/ }).click();
  await expect(page).toHaveURL(/\/mapa$/);
  const demo = (await readWorkspaces(page))[0].asIs;
  await page.goto(page.url().replace(/mapa$/, 'exportar'));
  const card = page.locator('div', { has: page.getByText('Dados em XLSX', { exact: true }) }).last();
  const [d] = await Promise.all([page.waitForEvent('download'), card.getByRole('button', { name: 'Baixar' }).click()]);
  const buf = readFileSync((await d.path())!);
  const p = { ...demo, name: 'Pedidos — importado' };
  await page.goto('/app/importar');
  await choose(page, 'pedidos.xlsx', XLSX, buf);
  await expect(page.getByRole('heading', { name: 'Confirme as colunas' })).toBeVisible();
  await page.getByLabel('Nome do processo').fill('Pedidos — importado');
  await page.getByRole('button', { name: 'Validar dados' }).click();
  await expect(page.getByText('Nenhum problema encontrado.')).toBeVisible();
  await page.getByRole('button', { name: 'Criar processo' }).click();
  await expect(page).toHaveURL(/\/validar$/);
  const w = (await readWorkspaces(page)).find((x) => x.asIs.name === 'Pedidos — importado');
  expect(w.asIs.activities).toHaveLength(p.activities.length);
  expect(w.asIs.costPerHourByRole).toEqual(p.costPerHourByRole);
  expect(w.asIs.activities.find((a: any) => a.id === 'D3').nextNo).toBe('X1');
  expect(w.source).toMatchObject({ kind: 'import', fileName: 'pedidos.xlsx' });

  // Reimportar o mesmo arquivo não duplica em silêncio.
  await page.goto('/app/importar');
  await choose(page, 'pedidos.xlsx', XLSX, buf);
  await expect(page.getByText('Este arquivo já foi importado')).toBeVisible();
  await page.getByLabel('Nome do processo').fill('Pedidos — importado');
  await page.getByRole('button', { name: 'Validar dados' }).click();
  await page.getByRole('button', { name: /Substituir AS-IS/ }).click();
  await expect(page).toHaveURL(/\/validar$/);
  const after = await readWorkspaces(page);
  expect(after.filter((x) => x.asIs.name === 'Pedidos — importado')).toHaveLength(1);
  expect(after.find((x) => x.id === w.id).snapshots.at(-1).label).toBe('Antes de reimportar');
  expect(errors).toEqual([]);
});

test('CSV só com campos mínimos: fluxo inferido e avisado; métricas ausentes explicadas', async ({ page }) => {
  await prepare(page);
  const csv = 'Etapa;Atividade;Ordem;Duração;Unidade\nEntrada;Receber pedido;1;10;min\nEntrada;Conferir;2;5;min\nSaída;Enviar;3;1;h\n';
  await page.goto('/app/importar');
  await choose(page, 'minimo.csv', 'text/csv', Buffer.from(csv, 'utf8'));
  await page.getByRole('button', { name: 'Validar dados' }).click();
  await expect(page.getByText('Fluxo montado pela ordem das linhas')).toBeVisible();
  await page.getByRole('button', { name: 'Criar processo' }).click();
  await expect(page.getByText(/conexão\(ões\) foram inferidas pela ordem/)).toBeVisible();
  const id = page.url().match(/\/p\/([^/]+)\//)![1];
  await page.goto(`/app/p/${id}/diagnostico`);
  await expect(page.getByText('Adicione duração e quantidade de pessoas para calcular.').first()).toBeVisible();
  await expect(page.getByText('1 h 15 min').first()).toBeVisible(); // soma das durações: 10 + 5 + 60 min
});

test('CSV com cabeçalhos em inglês, decisões e caminhos alternativos', async ({ page }) => {
  await prepare(page);
  const csv = [
    'ID,Stage,Task,Order,Type,Duration,Unit,Owner,People,Next,Next if yes,Next if no',
    'S,Intake,Start,0,start,,,,,T1,,',
    'T1,Intake,Receive form,1,task,10,min,Clerk,1,G1,,',
    'G1,Intake,Form complete?,2,decision,,,,,,T2,T3',
    'T3,Intake,Ask for missing data,3,task,15,min,Clerk,1,T1,,',
    'T2,Review,Approve,4,task,1,h,Manager,1,E,,',
    'E,Review,Done,5,end,,,,,,,',
  ].join('\n');
  await page.goto('/app/importar');
  await choose(page, 'english.csv', 'text/csv', Buffer.from(csv, 'utf8'));
  await page.getByRole('button', { name: 'Validar dados' }).click();
  await page.getByRole('button', { name: 'Criar processo' }).click();
  await expect(page.getByText('Dados validados.')).toBeVisible();
  const id = page.url().match(/\/p\/([^/]+)\//)![1];
  await page.goto(`/app/p/${id}/mapa`);
  await page.waitForSelector('.djs-element');
  await page.getByRole('navigation', { name: 'Etapas do processo' }).getByRole('button', { name: /^Intake/ }).click();
  await expect(page.locator('.djs-element[data-element-id^="Gateway_G1"]').first()).toBeVisible();
  const w = (await readWorkspaces(page)).find((x) => x.id === id);
  expect(w.asIs.activities.find((a: any) => a.id === 'G1')).toMatchObject({ type: 'decision', nextYes: 'T2', nextNo: 'T3' });
});

test('arquivo inválido explica o erro e não perde o arquivo válido escolhido antes', async ({ page }) => {
  await prepare(page);
  await page.goto('/app/importar');
  await choose(page, 'planilha.xlsx', XLSX, Buffer.from('isto não é um xlsx'));
  await expect(page.getByText('O arquivo não parece ser um XLSX válido.')).toBeVisible();
  await expect(page.getByText('Como resolver:')).toBeVisible();
  await choose(page, 'bom.csv', 'text/csv', Buffer.from('Etapa;Atividade;Duração;Unidade\nA;Fazer;5;min\n'));
  await expect(page.getByRole('heading', { name: 'Confirme as colunas' })).toBeVisible();
  await page.getByRole('button', { name: 'Voltar' }).click();
  await expect(page.getByText('Arquivo atual: bom.csv')).toBeVisible();
  await choose(page, 'relatorio.pdf', 'application/pdf', Buffer.from('%PDF-1.4'));
  await expect(page.getByText('Formato de arquivo não suportado.')).toBeVisible();
  await expect(page.getByText('Arquivo atual: bom.csv')).toBeVisible();
});

test('erros por linha e campos faltantes: exige confirmação e não descarta linhas', async ({ page }) => {
  await prepare(page);
  const csv = 'Código;Etapa;Atividade;Unidade;Próxima atividade\nA1;X;Um;min;A2\nA2;X;Dois;semanas;A9\n';
  await page.goto('/app/importar');
  await choose(page, 'erros.csv', 'text/csv', Buffer.from(csv));
  await expect(page.getByText('Faltam colunas do conjunto mínimo')).toBeVisible();
  await page.getByRole('button', { name: 'Validar dados' }).click();
  const list = page.getByTestId('import-issues');
  await expect(list).toContainText('Linha 3:');
  await expect(list).toContainText('Unidade "semanas" não reconhecida');
  await expect(list).toContainText('aponta para "A9", que não existe');
  const create = page.getByRole('button', { name: 'Criar processo' });
  await expect(create).toBeDisabled();
  await page.getByLabel('Entendi; quero importar e corrigir no app.').check();
  await create.click();
  await expect(page.getByText(/problema\(s\) impedem uma análise confiável/)).toBeVisible();
  // Correção sugerida só com confirmação
  await page.getByRole('button', { name: /Sugestão: Remover a ligação para "A9"/ }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Aplicar' }).click();
  await expect(page.getByText(/Sem erros|Dados validados/)).toBeVisible();
  const w = (await readWorkspaces(page)).at(-1);
  expect(w.asIs.activities).toHaveLength(2);
});
