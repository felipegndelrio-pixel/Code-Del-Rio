// Assistente conversacional (mobile-first): texto livre → lista confirmada,
// “Não sei” sem virar zero, correção pelo resumo, rascunho retomado e projeto salvo.
import { test, expect } from '@playwright/test';
import { expectNoHorizontalScroll, prepare, readWorkspaces } from './helpers';

test('assistente cria projeto a partir de respostas curtas e texto livre', async ({ page }) => {
  test.setTimeout(120_000);
  const { errors } = await prepare(page);
  const step = page.getByTestId('assistant-step');
  const cont = () => step.getByRole('button', { name: /^Continuar/ }).click();

  await page.goto('/app/novo');
  await step.getByRole('button', { name: 'Aprovação de compras' }).click();
  await cont();
  await step.getByLabel('O que inicia esse processo?').fill('Área solicita material');
  await cont();
  await step.getByRole('button', { name: 'Pular' }).click(); // resultado é opcional

  // Etapas por texto livre → confirmação antes de adicionar
  await step.getByRole('radio', { name: 'Escrever em texto' }).click();
  await step.getByLabel('Quais são as principais etapas? (texto livre)').fill('Solicitação → Aprovação → Compra');
  await step.getByRole('button', { name: 'Organizar em lista' }).click();
  await expect(step.getByText('Entendemos assim — confira antes de adicionar:')).toBeVisible();
  await step.getByRole('button', { name: 'Adicionar 3 item(ns)' }).click();
  await expect(step.getByRole('list', { name: 'Itens adicionados' }).getByRole('listitem')).toHaveCount(3);
  await expectNoHorizontalScroll(page);

  // Retoma o rascunho depois de recarregar
  await page.waitForTimeout(400);
  await page.reload();
  await expect(page.getByText('Continuamos de onde você parou.')).toBeVisible();
  await cont();

  // Atividades: uma por vez (com tempo e responsável no texto) e por texto livre
  await step.getByLabel('Adicionar atividade').first().fill('Registrar solicitação por Solicitante (10 min)');
  await step.getByLabel('Adicionar atividade').first().press('Enter');
  await expect(step.getByText('Solicitante · 10 min')).toBeVisible();
  await cont();
  await step.getByRole('radio', { name: 'Escrever em texto' }).click();
  await step.getByLabel(/texto livre/).fill('Analisar orçamento, depois o gestor aprova');
  await step.getByRole('button', { name: 'Organizar em lista' }).click();
  await step.getByRole('button', { name: 'Adicionar 2 item(ns)' }).click();
  await cont();
  await step.getByRole('button', { name: 'Ainda não sei — pular etapa' }).click(); // Compra

  // Detalhes: a primeira já veio do texto; a segunda com “Ainda não medido”
  await expect(step.getByText('Tempo e responsável já informados no texto')).toBeVisible();
  await step.getByRole('button', { name: /Próxima atividade/ }).click();
  await step.getByRole('button', { name: 'Ainda não medido' }).click();
  await step.getByLabel('Quem faz').fill('Gestor');
  await step.getByRole('button', { name: /Próxima atividade/ }).click();
  await step.getByLabel('Tempo de trabalho').fill('5');
  await step.getByLabel('Quem faz').fill('Gestor');
  await cont();

  await step.getByRole('button', { name: /Não há decisões/ }).click();
  await step.getByRole('button', { name: 'Não sei ainda' }).click();
  await step.getByRole('button', { name: 'Não sei / prefiro não informar' }).click();

  // Resumo + correção que volta direto ao resumo
  await expect(step.getByText('Pronto. Confira o resumo antes de criar o projeto.')).toBeVisible();
  await expect(step.getByText('Solicitação (1) → Aprovação (2)')).toBeVisible();
  await step.getByRole('button', { name: 'Corrigir Volume' }).click();
  await step.getByLabel('Execuções').fill('200');
  await cont();
  await expect(step.getByText('200 por mês')).toBeVisible();
  await expectNoHorizontalScroll(page);
  await step.getByRole('button', { name: 'Criar projeto' }).click();
  await expect(page).toHaveURL(/\/app\/p\/w_[^/]+\/(mapa|validar)$/);

  const [w] = await readWorkspaces(page);
  expect(w.asIs.name).toBe('Aprovação de compras');
  expect(w.asIs.stageOrder).toEqual(['Solicitação', 'Aprovação']);
  expect(w.asIs.volume).toBe(200);
  expect(w.asIs.defaultCostPerHour).toBeUndefined(); // “não sei” nunca vira zero
  const tasks = w.asIs.activities.filter((a: any) => a.type === 'task');
  expect(tasks.map((a: any) => a.name)).toEqual(['Registrar solicitação', 'Analisar orçamento', 'O gestor aprova']);
  expect(tasks[0]).toMatchObject({ duration: 10, unit: 'min', owner: 'Solicitante' });
  expect(tasks[1].duration).toBeUndefined();
  expect(tasks[1].notes).toMatch(/ainda não medida/);
  expect(tasks[2]).toMatchObject({ duration: 5, owner: 'Gestor' });
  expect(errors).toEqual([]);
});
