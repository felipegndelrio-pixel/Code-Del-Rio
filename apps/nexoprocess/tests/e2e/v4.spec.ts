// Critérios de aceite específicos da V4: visão geral, desfazer, Lean com motivo,
// casos de resultado, responsabilidades, conclusão com registro e continuidade.
import { readFileSync } from 'node:fs';
import { test, expect } from '@playwright/test';
import { openDemo, prepare, readWorkspaces, waitSaved } from './helpers';

test('visão geral mostra próxima ação, pendências e números com origem', async ({ page }) => {
  const { errors } = await prepare(page);
  await openDemo(page);
  await expect(page.getByText('Próxima ação')).toBeVisible();
  await expect(page.getByRole('button', { name: /^Continuar:/ })).toBeVisible();
  await expect(page.getByText('O processo em números')).toBeVisible();
  await expect(page.getByText('Pendências')).toBeVisible();
  await expect(page.getByText('0 de 4')).toBeVisible(); // 4 ações ilustrativas, nenhuma concluída
  await page.getByRole('button', { name: /Continuar:/ }).click();
  await expect(page).not.toHaveURL(/visao-geral$/);
  expect(errors).toEqual([]);
});

test('desfazer reverte a última edição e o estado salvo', async ({ page }) => {
  await prepare(page);
  const base = await openDemo(page);
  await page.goto(`${base}/dados`);
  const undo = page.getByRole('button', { name: /^Desfazer/ });
  await expect(page.getByRole('button', { name: 'Nada para desfazer' })).toBeDisabled();
  await page.getByLabel('Custo-hora padrão (R$)').fill('77');
  await waitSaved(page);
  expect((await readWorkspaces(page))[0].asIs.defaultCostPerHour).toBe(77);
  await undo.click();
  await waitSaved(page);
  expect((await readWorkspaces(page))[0].asIs.defaultCostPerHour).toBeUndefined();
  await expect(page.getByLabel('Custo-hora padrão (R$)')).toHaveValue('');
});

test('Lean: motivo de necessidade muda a recomendação (exigência não é desperdício)', async ({ page }) => {
  await prepare(page);
  const base = await openDemo(page);
  await page.goto(`${base}/diagnostico`);
  const review = page.getByText('Revisão da classificação Lean');
  await review.scrollIntoViewIfNeeded();
  await page.getByLabel('Motivo de Registrar pedido no sistema ser necessária').selectOption('regulatorio');
  await waitSaved(page);
  const w = (await readWorkspaces(page))[0];
  expect(w.asIs.activities.find((a: any) => a.id === 'A1').leanReason).toBe('regulatorio');
  await expect(page.getByRole('region', { name: 'Necessárias por exigência' })).toContainText('Registrar pedido no sistema');
  await page.goto(`${base}/recomendacoes`);
  const card = page.getByTestId('rec-R5:A1').locator('..');
  await expect(card).toContainText('Atenção:');
  await expect(card).toContainText('Não elimine');
  for (const t of ['Impacto:', 'Dependências:', 'Riscos/efeitos colaterais:', 'Evidência']) await expect(card).toContainText(t);
});

test('comparação: casos conservador/base/otimista editáveis e responsabilidades alteradas', async ({ page }) => {
  await prepare(page);
  const base = await openDemo(page);
  await page.goto(`${base}/comparar`);
  const cases = page.getByTestId('business-cases');
  for (const t of ['Conservador', 'Base', 'Otimista']) await expect(cases).toContainText(t);
  const cons = page.getByRole('region', { name: 'Caso Conservador' });
  await cons.getByLabel('Realização do ganho (%)').fill('0');
  await waitSaved(page);
  await expect(cons).toContainText('sem payback');
  const w = (await readWorkspaces(page))[0];
  expect(w.scenarios[0].sensitivity.conservative.realizationPct).toBe(0);
  const resp = page.getByTestId('responsibility-changes');
  await expect(resp).toContainText('Agendar transporte');
  await expect(resp).toContainText('Analista de logística → Faturista');
});

test('plano: ação só é concluída com resultado observado registrado', async ({ page }) => {
  await prepare(page);
  const base = await openDemo(page);
  await page.goto(`${base}/plano`);
  const desc = 'Definir SLA de 2 h para a análise manual de crédito';
  await expect(page.getByText('Problema: Espera de 8 h antes da análise manual de crédito.').first()).toBeVisible();
  await page.getByLabel(`Situação de ${desc}`).selectOption('concluida');
  const dlg = page.getByRole('dialog');
  await expect(dlg.getByTestId('completion-record')).toBeVisible();
  await dlg.getByRole('button', { name: 'Salvar' }).click();
  await expect(page.getByText('Registre o resultado observado para concluir a ação.')).toBeVisible();
  expect((await readWorkspaces(page))[0].actions.find((a: any) => a.description === desc).status).toBe('em_andamento');
  await dlg.getByLabel(/Resultado observado/).fill('Espera média caiu para 3 h em 30 pedidos (amostra).');
  await dlg.getByRole('button', { name: 'Salvar' }).click();
  await waitSaved(page);
  const a = (await readWorkspaces(page))[0].actions.find((x: any) => x.description === desc);
  expect(a).toMatchObject({ status: 'concluida', observedResult: 'Espera média caiu para 3 h em 30 pedidos (amostra).' });
  expect(a.completedAt).toMatch(/^\d{4}-\d{2}-\d{2}$/);
});

test('continuidade: arquivo do projeto gerado em um aparelho abre em outro (sem sincronização)', async ({ page, browser }) => {
  await prepare(page);
  await openDemo(page);
  const [dl] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: 'Gerar arquivo do projeto' }).click()]);
  expect(dl.suggestedFilename()).toMatch(/\.nexoprocess\.json$/);
  const file = readFileSync((await dl.path())!);
  const original = (await readWorkspaces(page))[0];

  const other = await browser.newContext();
  const p2 = await other.newPage();
  await prepare(p2);
  await p2.goto('/app');
  await p2.getByLabel('Arquivo de projeto').setInputFiles({ name: dl.suggestedFilename(), mimeType: 'application/json', buffer: file });
  await expect(p2.getByRole('list', { name: 'Projetos' })).toContainText(original.asIs.name);
  const [copy] = await readWorkspaces(p2);
  expect(copy.id).toBe(original.id);
  expect(copy.actions).toEqual(original.actions);
  expect(copy.scenarios[0].changes.length).toBe(original.scenarios[0].changes.length);
  await other.close();
});
