// Última rodada antes do lançamento: navegação (Voltar da tela e do sistema),
// auto-save, tela de sucesso, plano de ação (PDF, CSV, importação), tour e Enter.
import { test, expect, type Page } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { openDemo, prepare, readWorkspaces } from './helpers';

const step = (page: Page) => page.getByTestId('assistant-step');

async function startAssistant(page: Page) {
  await page.goto('/app/novo');
  await step(page).getByRole('button', { name: 'Aprovação de compras' }).click();
  await step(page).getByRole('button', { name: 'Avançar para o início do processo' }).click();
  await step(page).getByLabel('O que faz esse processo começar?').fill('Área pede material');
  await step(page).getByRole('button', { name: 'Avançar para o fim do processo' }).click();
  await expect(step(page).getByLabel('E como ele termina? O que é entregue no fim?')).toBeVisible();
}

test('assistente: “Voltar” da tela e do navegador voltam uma pergunta sem perder respostas', async ({ page }) => {
  const { errors } = await prepare(page);
  await startAssistant(page);
  // Voltar do sistema (botão físico/gesto no celular) = uma pergunta para trás, na mesma tela.
  await page.goBack();
  await expect(page).toHaveURL(/\/app\/novo$/);
  await expect(step(page).getByLabel('O que faz esse processo começar?')).toHaveValue('Área pede material');
  await page.goBack();
  await expect(step(page).getByLabel('Vamos começar. Como você chama esse processo?')).toHaveValue('Aprovação de compras');
  // Botão "← Voltar" da própria tela, a partir da 2ª pergunta.
  await step(page).getByRole('button', { name: 'Avançar para o início do processo' }).click();
  await step(page).getByRole('button', { name: 'Voltar à pergunta anterior' }).click();
  await expect(step(page).getByLabel('Vamos começar. Como você chama esse processo?')).toHaveValue('Aprovação de compras');
  expect(errors).toEqual([]);
});

test('assistente: recarregar no meio da digitação não perde nada (auto-save)', async ({ page }) => {
  await prepare(page);
  await startAssistant(page);
  await step(page).getByLabel('E como ele termina? O que é entregue no fim?').fill('Pedido enviado');
  await page.reload(); // sem esperar o debounce do IndexedDB
  await expect(page.getByText('Continuamos de onde você parou.')).toBeVisible();
  await expect(step(page).getByLabel('E como ele termina? O que é entregue no fim?')).toHaveValue('Pedido enviado');
});

test('assistente: Enter avança no desktop, inclusive na lista de etapas', async ({ page }) => {
  await prepare(page);
  await page.goto('/app/novo');
  await step(page).getByLabel('Vamos começar. Como você chama esse processo?').fill('Onboarding');
  await page.keyboard.press('Enter');
  await expect(step(page).getByLabel('O que faz esse processo começar?')).toBeFocused();
  await page.keyboard.press('Enter');
  await page.keyboard.press('Enter');
  const add = step(page).getByRole('textbox', { name: 'Adicionar etapa' });
  await add.fill('Admissão');
  await page.keyboard.press('Enter'); // com texto: adiciona
  await expect(step(page).getByRole('list', { name: 'Itens adicionados' }).getByRole('listitem')).toHaveCount(1);
  await page.keyboard.press('Enter'); // campo vazio: avança
  await expect(step(page).getByText('O que acontece na etapa “Admissão”?')).toBeVisible();
});

test('plano: exporta CSV, importa planilha simples e gera versão para PDF', async ({ page }) => {
  const { errors } = await prepare(page);
  await page.addInitScript(() => {
    (window as unknown as { __printed: number }).__printed = 0;
    window.print = () => void ((window as unknown as { __printed: number }).__printed++);
  });
  const base = await openDemo(page);
  await page.goto(`${base}/plano`);
  const before = (await readWorkspaces(page))[0].actions.length;

  const [dl] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: 'Exportar planilha (CSV)' }).click()]);
  expect(dl.suggestedFilename()).toMatch(/-plano-de-acao\.csv$/);
  const csv = readFileSync(await dl.path(), 'utf8');
  expect(csv.split('\r\n')[0]).toBe('﻿Ação;Responsável;Prazo;Prioridade;Situação;Indicador de sucesso;Problema relacionado;Resultado observado;Data de conclusão');

  await page.getByTestId('plan-import-input').setInputFiles({ name: 'plano.csv', mimeType: 'text/csv', buffer: Buffer.from('Ação;Responsável;Prazo\nTreinar a equipe no novo checklist;Ana;15/11/2026\nRevisar contrato;;31/02/2026\n', 'utf8') });
  const preview = page.getByTestId('plan-import-preview');
  await expect(preview).toContainText('Encontramos 2 ações');
  await expect(preview).toContainText('prazo “31/02/2026” não é uma data válida');
  await page.getByRole('button', { name: 'Adicionar 2 ações' }).click();
  await expect.poll(async () => (await readWorkspaces(page))[0].actions.length).toBe(before + 2);
  const added = (await readWorkspaces(page))[0].actions.slice(-2);
  expect(added[0]).toMatchObject({ description: 'Treinar a equipe no novo checklist', owner: 'Ana', due: '2026-11-15' });
  expect(added[1].owner).toBeUndefined();
  expect(added[1].due).toBeUndefined();

  await page.getByRole('button', { name: 'Exportar PDF' }).click();
  expect(await page.evaluate(() => (window as unknown as { __printed: number }).__printed)).toBe(1);
  await page.emulateMedia({ media: 'print' });
  const print = page.getByTestId('plan-print');
  await expect(print).toBeVisible();
  await expect(print).toContainText('Treinar a equipe no novo checklist');
  await expect(print).toContainText('15/11/2026');
  await expect(page.getByRole('button', { name: 'Nova ação' })).toBeHidden();
  expect(errors).toEqual([]);
});

test('plano: ação em edição sobrevive ao recarregar; Voltar do sistema fecha o painel', async ({ page }) => {
  await prepare(page);
  const base = await openDemo(page);
  await page.goto(`${base}/plano`);
  await page.getByRole('button', { name: 'Nova ação' }).click();
  const dialog = page.getByRole('dialog', { name: 'Nova ação' });
  await dialog.getByLabel('Descrição').fill('Padronizar o formulário de pedido');
  await page.reload();
  await expect(page.getByRole('dialog', { name: 'Nova ação' }).getByLabel('Descrição')).toHaveValue('Padronizar o formulário de pedido');
  await page.goBack();
  await expect(page.getByRole('dialog', { name: 'Nova ação' })).toHaveCount(0);
  await expect(page).toHaveURL(/\/plano$/);
});

test('plano: tour de boas-vindas aparece só na primeira visita', async ({ page }) => {
  await prepare(page, { tour: true });
  const base = await openDemo(page);
  await page.goto(`${base}/plano`);
  const tour = page.getByTestId('tour');
  await expect(tour).toContainText('Crie as ações do plano');
  await expect(tour).toContainText(/Dica 1 de \d/);
  for (let i = 0; i < 6 && (await tour.getByRole('button', { name: 'Próxima' }).isVisible()); i++) await tour.getByRole('button', { name: 'Próxima' }).click();
  await tour.getByRole('button', { name: 'Entendi' }).click();
  await expect(tour).toHaveCount(0);
  await page.reload();
  await expect(page.getByRole('button', { name: 'Nova ação' })).toBeVisible();
  await page.waitForTimeout(900);
  await expect(tour).toHaveCount(0);
});
