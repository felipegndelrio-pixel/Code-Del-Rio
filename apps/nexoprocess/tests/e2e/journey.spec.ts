// Critérios de aceite end-to-end da V3: verifica estado salvo (IndexedDB) e
// cálculos, não apenas renderização.
import { test, expect } from '@playwright/test';
import { writeFileSync } from 'node:fs';
import { prepare, readWorkspaces, waitSaved } from './helpers';

test('1. exemplo demonstrativo abre isolado e marcado como fictício', async ({ page }) => {
  const { errors } = await prepare(page);
  await page.goto('/');
  await page.getByRole('button', { name: 'Ver demonstração fictícia' }).first().click();
  await expect(page).toHaveURL(/\/app\/p\/w_[^/]+\/visao-geral$/);
  await expect(page.getByText('Exemplo fictício — dados ilustrativos')).toBeVisible();
  await page.getByRole('link', { name: /Mapa AS-IS/ }).first().click();
  await page.waitForSelector('.djs-element');
  const ws = await readWorkspaces(page);
  expect(ws).toHaveLength(1);
  expect(ws[0].isDemo).toBe(true);
  // Abrir o exemplo de novo não duplica.
  await page.goto('/app');
  await page.getByRole('button', { name: /Outras formas de começar/ }).click();
  await page.getByRole('button', { name: 'Abrir demonstração' }).click();
  await expect(page).toHaveURL(/\/visao-geral$/);
  expect(await readWorkspaces(page)).toHaveLength(1);
  expect(errors).toEqual([]);
});

test('2–13. jornada completa: AS-IS → validação → mapa → diagnóstico → recomendações → TO-BE → comparação → plano → resultados → relatório → persistência', async ({ page }, info) => {
  test.setTimeout(180_000);
  const { errors, external } = await prepare(page);

  // ---------- 2. Criar AS-IS pelo formulário único (sem custo-hora)
  await page.goto('/app/novo/formulario');
  await page.getByLabel('Qual é o nome do processo?').fill('Atendimento de solicitações');
  await page.getByRole('button', { name: 'Continuar' }).click();
  await page.getByLabel('Nome da etapa 1').fill('Entrada');
  await page.getByLabel('Nome da etapa 2').fill('Análise');
  await page.getByRole('button', { name: 'Continuar' }).click();

  const what = page.getByLabel('O que acontece?');
  const time = page.getByLabel('Tempo de trabalho');
  const who = page.getByLabel('Quem faz?');
  const ppl = page.getByLabel('Quantas pessoas ao mesmo tempo?');
  const lean = page.getByLabel(/Isso agrega valor/);
  await what.nth(0).fill('Receber solicitação');
  await time.nth(0).fill('10');
  await who.nth(0).fill('Atendente');
  await ppl.nth(0).fill('1');
  await page.getByRole('button', { name: 'Adicionar atividade em Entrada' }).click();
  await what.nth(1).fill('Conferir documentos');
  await time.nth(1).fill('20');
  await who.nth(1).fill('Atendente');
  await ppl.nth(1).fill('1');
  await lean.nth(1).selectOption('W');
  await what.nth(2).fill('Aprovar pedido');
  await time.nth(2).fill('30');
  await who.nth(2).fill('Analista');
  await ppl.nth(2).fill('2');
  await lean.nth(2).selectOption('VA');
  await page.getByRole('button', { name: 'Adicionar atividade em Análise' }).click();
  await page.getByLabel('É uma pergunta/decisão?').nth(3).check();
  await page.getByLabel('Pergunta da decisão').fill('Aprovado?');
  await page.getByLabel('Se a resposta for NÃO, vai para…').selectOption('__end');
  await page.getByRole('button', { name: 'Continuar' }).click();
  await page.getByLabel('Quantas vezes o processo acontece?').fill('1000');
  await page.getByRole('button', { name: 'Continuar' }).click();
  await expect(page.getByText('Tudo certo para criar o processo.')).toBeVisible();
  await page.getByRole('button', { name: 'Criar processo e ver o mapa' }).click();

  // ---------- 3. Validação
  await expect(page).toHaveURL(/\/validar$/);
  await expect(page.getByText('Dados validados.')).toBeVisible();
  await page.getByRole('button', { name: /Continuar para o mapa/ }).click();

  // ---------- 4. Mapa macro → etapa → detalhes
  await expect(page).toHaveURL(/\/mapa$/);
  await page.waitForSelector('.djs-element[data-element-id^="Stage_"]');
  await page.getByRole('navigation', { name: 'Etapas do processo' }).getByRole('button', { name: /^Análise/ }).click();
  await expect(page.getByText('Atividades de “Análise”')).toBeVisible();
  await page.getByRole('button', { name: 'Aprovar pedido' }).first().click();
  const drawer = page.getByRole('dialog');
  await expect(drawer).toContainText('Analista');
  await expect(drawer).toContainText('Esforço por ocorrência1 pessoa-h'); // 0,5 h × 2 pessoas
  await page.keyboard.press('Escape');

  // ---------- 5. Diagnóstico: valores e nada inventado sem custo-hora
  const id = page.url().match(/\/p\/([^/]+)\//)![1];
  await page.goto(`/app/p/${id}/diagnostico`);
  await expect(page.getByText('1.500 pessoa-h').first()).toBeVisible(); // (10+20)/60×1 + 30/60×2 = 1,5 h × 1.000
  await expect(page.getByText('Informe o custo-hora (padrão, por função ou por atividade) para calcular.').first()).toBeVisible();
  // Agora informa o custo-hora padrão (antes de criar o TO-BE).
  await page.goto(`/app/p/${id}/dados`);
  await page.getByLabel('Custo-hora padrão (R$)').fill('60');
  await waitSaved(page);
  await page.goto(`/app/p/${id}/diagnostico`);
  await expect(page.getByText('R$ 90.000').first()).toBeVisible(); // 1.500 × 60

  // ---------- 6. Aceitar uma recomendação e rejeitar outra
  const before = (await readWorkspaces(page)).find((w) => w.id === id);
  await page.goto(`/app/p/${id}/recomendacoes`);
  await page.getByTestId('rec-R1:A2').locator('..').getByRole('button', { name: 'Aceitar' }).click();
  await page.getByTestId('rec-R6:lean').locator('..').getByRole('button', { name: 'Rejeitar' }).click();
  await waitSaved(page);
  let w = (await readWorkspaces(page)).find((x) => x.id === id);
  expect(w.recDecisions['R1:A2'].status).toBe('accepted');
  expect(w.recDecisions['R6:lean'].status).toBe('rejected');
  expect(w.asIs).toEqual(before.asIs); // rejeitar/aceitar não altera o AS-IS

  // ---------- 7–8. TO-BE sem modificar o AS-IS; premissas; comparação recalculada
  await page.goto(`/app/p/${id}/tobe`);
  await page.getByRole('button', { name: 'Criar cenário a partir do AS-IS' }).click();
  await page.getByRole('button', { name: /Aplicar…/ }).click();
  await expect(page.getByRole('dialog')).toContainText('A atividade será removida do TO-BE');
  await page.getByRole('button', { name: 'Confirmar mudança' }).click();
  await page.getByLabel('Investimento inicial (R$)').fill('5000');
  await page.getByLabel('Custo recorrente novo (R$/mês)').fill('0');
  await page.getByLabel('Nova premissa').fill('Checklist na entrada substitui a conferência');
  await page.getByLabel('Nova premissa').locator('..').getByRole('button', { name: 'Adicionar' }).click();
  await waitSaved(page);
  w = (await readWorkspaces(page)).find((x) => x.id === id);
  expect(w.scenarios).toHaveLength(1);
  expect(w.scenarios[0].process.activities.some((a: any) => a.id === 'A2')).toBe(false);
  expect(w.scenarios[0].changes).toHaveLength(1);
  expect(w.scenarios[0].changes[0]).toMatchObject({ kind: 'remove', recId: 'R1:A2' });
  expect(w.asIs.activities.find((a: any) => a.id === 'A2').duration).toBe(20); // AS-IS preservado
  expect(w.asIsBaseline.activities.some((a: any) => a.id === 'A2')).toBe(true);

  await page.goto(`/app/p/${id}/comparar`);
  await expect(page.getByText('333 pessoa-h/mês').first()).toBeVisible(); // 20 min × 1.000 = 333,3 h
  await expect(page.getByText('R$ 20.000/mês').first()).toBeVisible(); // 333,3 × R$ 60 (bruto = líquido, recorrente 0)
  await expect(page.getByText('0,3 meses').first()).toBeVisible(); // 5.000 ÷ 20.000
  await expect(page.getByText('4.700%').first()).toBeVisible(); // (20.000 × 12 − 5.000) ÷ 5.000
  // Premissa alterada → comparação recalculada
  await page.goto(`/app/p/${id}/tobe`);
  await page.getByLabel('Custo recorrente novo (R$/mês)').fill('10000');
  await waitSaved(page);
  await page.goto(`/app/p/${id}/comparar`);
  await expect(page.getByText('R$ 10.000/mês').first()).toBeVisible();
  await expect(page.getByText('0,5 meses').first()).toBeVisible();

  // ---------- 10. Plano de ação
  await page.goto(`/app/p/${id}/plano`);
  await page.getByRole('button', { name: 'Gerar do TO-BE' }).click();
  await expect(page.getByText(/Implantar: Remover/).first()).toBeVisible();
  await expect(page.getByText('pendente').first()).toBeVisible(); // responsável/prazo não inventados

  // ---------- 11. Resultado real × estimativa
  await page.goto(`/app/p/${id}/resultados`);
  await page.getByLabel(/Valor medido/).fill('1250');
  await page.getByLabel('Fonte').fill('Apontamento de horas');
  await page.getByRole('button', { name: 'Registrar' }).click();
  await waitSaved(page);
  const row = page.getByRole('row', { name: /Esforço por mês/ });
  await expect(row).toContainText('1.500 pessoa-h/mês');
  await expect(row).toContainText('1.167 pessoa-h/mês');
  await expect(row).toContainText('1.250 pessoa-h/mês');
  await expect(row).toContainText('75%');

  // ---------- 9. Relatório que diferencia informado / calculado / estimado / realizado
  await page.goto(`/app/p/${id}/relatorio`);
  const report = page.getByTestId('report');
  await expect(page.getByRole('button', { name: /Imprimir/ })).toBeEnabled({ timeout: 20_000 });
  for (const t of ['Informado', 'Calculado', 'Estimado', 'A validar', 'Realizado', 'Business case (estimado)', 'Plano de ação', 'Checklist na entrada substitui a conferência']) await expect(report).toContainText(t);
  await page.emulateMedia({ media: 'print' });
  const pdf = await page.pdf({ format: 'A4', printBackground: true });
  const pages = (pdf.toString('latin1').match(/\/Type\s*\/Page[^s]/g) ?? []).length;
  expect(pages).toBeGreaterThanOrEqual(2);
  writeFileSync(info.outputPath('relatorio.pdf'), pdf);
  await page.emulateMedia({ media: 'screen' });

  // ---------- 12. Fechar e reabrir: persistência local
  await page.close();
  const page2 = await page.context().newPage();
  await page2.goto(`/app/p/${id}/comparar`);
  await expect(page2.getByRole('heading', { name: 'Atendimento de solicitações' })).toBeVisible();
  await expect(page2.getByText('R$ 10.000/mês').first()).toBeVisible();
  const final = (await readWorkspaces(page2)).find((x) => x.id === id);
  expect(final.results).toHaveLength(1);
  expect(final.actions.length).toBeGreaterThanOrEqual(1);
  // 13. Valores não informados não foram inventados
  expect(final.actions[0].owner).toBeUndefined();
  expect(final.actions[0].due).toBeUndefined();
  expect(final.asIs.activities.find((a: any) => a.id === 'A1').lean).toBeUndefined();
  expect(final.asIs.activities.every((a: any) => a.costPerHour === undefined)).toBe(true);
  expect(errors).toEqual([]);
  expect(external).toEqual([]);
});
