// v2.4.2/v2.4.3/v2.4.4 — integridade da jornada: a revisão corresponde ao que é gravado (J1, J2, J5, J6),
// criação separada da limpeza do rascunho (J3), armazenamento não durável (J4) e estado
// real do diagnóstico (J10). Roda no desktop e nos projetos de celular (nome "mobile-").
import { test, expect, type Page } from '@playwright/test';
import { expectNoHorizontalScroll, openDemo, prepare, readWorkspaces } from './helpers';

const step = (page: Page) => page.getByTestId('assistant-step');
const advance = (page: Page, to: string) => step(page).getByRole('button', { name: `Avançar para ${to}` }).click();
const drafts = (page: Page) =>
  page.evaluate(
    () =>
      new Promise<string[]>((resolve) => {
        const r = indexedDB.open('nexoprocess');
        r.onsuccess = () => {
          const k = r.result.transaction('drafts').objectStore('drafts').getAllKeys();
          k.onsuccess = () => resolve(k.result.map(String));
        };
      }),
  );

async function add(page: Page, label: string, items: string[]) {
  for (const it of items) {
    await step(page).getByRole('textbox', { name: label }).fill(it);
    await step(page).getByRole('button', { name: label }).click();
  }
}
/** Nome → etapas → atividades da 1ª etapa. Pula início e fim. */
async function begin(page: Page, name: string, stages: string[], acts: string[]) {
  await page.goto('/app/novo');
  await step(page).getByRole('textbox').first().fill(name);
  await advance(page, 'o início do processo');
  await step(page).getByRole('button', { name: 'Pular por agora' }).click();
  await step(page).getByRole('button', { name: 'Pular por agora' }).click();
  await add(page, 'Adicionar etapa', stages);
  await advance(page, `as atividades de “${stages[0]}”`);
  await add(page, 'Adicionar atividade', acts);
}
async function tailToReview(page: Page) {
  await step(page).getByRole('button', { name: 'Pular detalhes restantes' }).click();
  await step(page).getByRole('button', { name: /Não há decisões|Avançar para o volume/ }).click();
  await step(page).getByRole('button', { name: 'Não sei ainda' }).click();
  await step(page).getByRole('button', { name: 'Não sei / prefiro não informar' }).click();
  await expect(step(page).getByText('Tudo pronto! Confira o resumo antes de criarmos o projeto.')).toBeVisible();
}

test('J1: duas decisões depois da mesma atividade são gravadas em sequência e aparecem no mapa', async ({ page }) => {
  const { errors } = await prepare(page);
  await begin(page, 'Duas decisões', ['Pedido'], ['Registrar pedido', 'Aprovar pedido']);
  await advance(page, 'os detalhes');
  await step(page).getByRole('button', { name: 'Pular detalhes restantes' }).click();
  for (const [n, q] of [
    [0, 'Valor acima do limite?'],
    [1, 'Fornecedor homologado?'],
  ] as const) {
    await step(page).getByRole('button', { name: n ? 'Outra decisão' : 'Sim, adicionar decisão' }).click();
    await step(page).getByRole('textbox', { name: 'Pergunta' }).nth(n).fill(q);
    await step(page).getByLabel('Acontece depois de qual atividade?').nth(n).selectOption({ label: 'Pedido › Aprovar pedido' });
  }
  await advance(page, 'o volume');
  await step(page).getByRole('button', { name: 'Não sei ainda' }).click();
  await step(page).getByRole('button', { name: 'Não sei / prefiro não informar' }).click();
  await expect(step(page).getByTestId('assistant-review')).toContainText('Valor acima do limite?; Fornecedor homologado?');
  await step(page).getByRole('button', { name: 'Criar meu projeto' }).click();
  await expect(page.getByTestId('assistant-success')).toContainText('2 pontos de decisão');
  const [w] = await readWorkspaces(page);
  expect(w.asIs.activities.filter((a: { type: string }) => a.type === 'decision').map((a: { name: string }) => a.name)).toEqual(['Valor acima do limite?', 'Fornecedor homologado?']);
  await page.goto(`/app/p/${w.id}/mapa`);
  await expect(page.locator('.djs-element').first()).toBeAttached({ timeout: 20_000 });
  // As decisões ficam no detalhe da etapa (o mapa geral mostra as etapas fechadas).
  if (page.viewportSize()!.width < 768) await page.getByRole('navigation', { name: 'Etapas do processo' }).getByRole('button', { name: /^Pedido/ }).click();
  else await page.locator('.djs-element[data-element-id="Stage_1"]').first().click();
  await expect(page.getByText('Atividades de “Pedido”')).toBeVisible();
  // Os rótulos do BPMN quebram em linhas (tspan): compara o texto do diagrama sem espaços.
  const svgText = async () => (await page.locator('.djs-container svg').first().textContent())?.replace(/\s+/g, '') ?? '';
  await expect.poll(svgText).toContain('Valoracimadolimite?');
  expect(await svgText()).toContain('Fornecedorhomologado?');
  expect(errors).toEqual([]);
});

test('J2: decisão cuja atividade foi removida fica marcada, bloqueia com motivo e é corrigível', async ({ page }) => {
  await prepare(page);
  await begin(page, 'Decisão órfã', ['Pedido'], ['Registrar pedido', 'Aprovar pedido']);
  await advance(page, 'os detalhes');
  await step(page).getByRole('button', { name: 'Pular detalhes restantes' }).click();
  await step(page).getByRole('button', { name: 'Sim, adicionar decisão' }).click();
  await step(page).getByRole('textbox', { name: 'Pergunta' }).fill('Aprovado?');
  await step(page).getByLabel('Acontece depois de qual atividade?').selectOption({ label: 'Pedido › Aprovar pedido' });
  // Volta às atividades (pela transcrição) e remove a atividade usada pela decisão.
  await page.getByRole('button', { name: 'Corrigir' }).nth(4).click();
  await step(page).getByRole('button', { name: 'Remover Aprovar pedido' }).click();
  await advance(page, 'os detalhes');
  await step(page).getByRole('button', { name: 'Pular detalhes restantes' }).click();
  const card = step(page).getByTestId('assistant-decision');
  await expect(card.getByRole('alert')).toContainText('foi removida');
  // Não troca pela 1ª atividade em silêncio: o seletor pede uma escolha.
  await expect(card.getByLabel('Acontece depois de qual atividade?')).toHaveValue('');
  await expect(step(page).getByRole('button', { name: 'Avançar para o volume' })).toBeDisabled();
  await expect(step(page).getByTestId('decisions-block-reason')).toHaveText('Para continuar, corrija ou remova as decisões destacadas.');
  await expectNoHorizontalScroll(page);
  await card.getByLabel('Acontece depois de qual atividade?').selectOption({ label: 'Pedido › Registrar pedido' });
  await expect(card.getByRole('alert')).toHaveCount(0);
  await advance(page, 'o volume');
  await step(page).getByRole('button', { name: 'Não sei ainda' }).click();
  await step(page).getByRole('button', { name: 'Não sei / prefiro não informar' }).click();
  await expect(step(page).getByTestId('assistant-review')).toContainText('Aprovado?');
  await step(page).getByRole('button', { name: 'Criar meu projeto' }).click();
  await expect(page.getByTestId('assistant-success')).toBeVisible();
  const [w] = await readWorkspaces(page);
  const dec = w.asIs.activities.find((a: { type: string }) => a.type === 'decision');
  expect(dec.name).toBe('Aprovado?');
  expect(w.asIs.activities.find((a: { name: string }) => a.name === 'Registrar pedido').next).toEqual([dec.id]);
});

test('J2: rascunho retomado com decisão inválida chega à revisão bloqueado e se recupera', async ({ page }) => {
  await prepare(page);
  const draft = {
    version: 1,
    draftId: 'rd_teste',
    step: 'review',
    name: 'Retomado',
    stages: [{ key: 's1', name: 'Pedido', activities: [{ key: 'a1', name: 'Registrar pedido', unit: 'min', duration: 10 }] }],
    decisions: [{ key: 'd1', question: 'Urgente?', afterKey: 'a_removida', noTarget: '__end' }],
    period: 'mes',
    detailIndex: 0,
    volumeUnknown: true,
    costUnknown: true,
  };
  await page.addInitScript((d) => {
    if (!sessionStorage.getItem('semeado')) {
      localStorage.setItem('nexo.draft.assistant', JSON.stringify(d));
      sessionStorage.setItem('semeado', '1');
    }
  }, draft);
  await page.goto('/app/novo');
  await expect(step(page).getByTestId('invalid-decisions')).toContainText('Decisão 1 “Urgente?”: a atividade escolhida em “Acontece depois de” foi removida');
  await expect(step(page).getByRole('button', { name: 'Criar meu projeto' })).toBeDisabled();
  await expect(step(page).getByTestId('assistant-block-reason')).toHaveText('Corrija ou remova as decisões destacadas para criar o projeto.');
  await step(page).getByRole('button', { name: 'Corrigir decisões', exact: true }).click();
  await step(page).getByRole('button', { name: 'Remover decisão 1' }).click();
  await step(page).getByRole('button', { name: /voltar à revisão/i }).click();
  await expect(step(page).getByTestId('assistant-review')).toContainText('Nenhuma');
  await step(page).getByRole('button', { name: 'Criar meu projeto' }).click();
  await expect(page.getByTestId('assistant-success')).toBeVisible();
  const [w] = await readWorkspaces(page);
  expect(w.asIs.activities.filter((a: { type: string }) => a.type === 'decision')).toHaveLength(0);
});

test('J5: etapa pulada aparece como "não será salva"; completar ou confirmar; revisão = projeto', async ({ page }) => {
  await prepare(page);
  await begin(page, 'Etapa pulada', ['Pedido', 'Compra'], ['Registrar pedido (10 min)']);
  await advance(page, 'as atividades de “Compra”');
  await step(page).getByRole('button', { name: 'Ainda não sei — completo depois' }).click();
  await tailToReview(page);
  await expect(step(page).getByTestId('dropped-items')).toContainText('Etapa “Compra” — marcada para completar depois');
  await expect(step(page).getByRole('button', { name: 'Criar meu projeto' })).toBeDisabled();
  await expectNoHorizontalScroll(page);
  // Completar agora volta direto à revisão, sem refazer o caminho.
  await step(page).getByRole('button', { name: 'Completar agora' }).click();
  await add(page, 'Adicionar atividade', ['Emitir ordem']);
  await step(page).getByRole('button', { name: 'Voltar à revisão' }).click();
  await expect(step(page).getByTestId('dropped-items')).toHaveCount(0);
  const reviewStages = await step(page).getByTestId('assistant-review').locator('div', { hasText: 'Etapas' }).first().locator('dd').textContent();
  expect(reviewStages).toBe('Pedido (1) → Compra (1)');
  await step(page).getByRole('button', { name: 'Criar meu projeto' }).click();
  await expect(page.getByTestId('assistant-success')).toBeVisible();
  const [w] = await readWorkspaces(page);
  expect(w.asIs.stageOrder).toEqual(['Pedido', 'Compra']);
});

test('J5: confirmar a criação sem a etapa pulada grava só o que a revisão mostrou', async ({ page }) => {
  await prepare(page);
  await begin(page, 'Sem a etapa', ['Pedido', 'Compra'], ['Registrar pedido (10 min)']);
  await advance(page, 'as atividades de “Compra”');
  await step(page).getByRole('button', { name: 'Ainda não sei — completo depois' }).click();
  await tailToReview(page);
  await expect(step(page).getByTestId('assistant-block-reason')).toContainText('Confirme acima');
  await step(page).getByLabel('Entendi: criar o projeto sem esses itens').check();
  await expect(step(page).getByTestId('assistant-block-reason')).toHaveCount(0);
  await step(page).getByRole('button', { name: 'Criar meu projeto' }).click();
  await expect(page.getByTestId('assistant-success')).toBeVisible();
  const [w] = await readWorkspaces(page);
  expect(w.asIs.stageOrder).toEqual(['Pedido']);
  expect(w.asIs.activities.filter((a: { type: string }) => a.type === 'task').map((a: { name: string }) => a.name)).toEqual(['Registrar pedido']);
});

test('J6: formulário — etapa sem atividades aparece na revisão e exige confirmação', async ({ page }) => {
  await prepare(page);
  await page.goto('/app/novo/formulario');
  await page.getByLabel('Como você chama esse processo?').fill('Formulário');
  await page.getByRole('button', { name: /^Avançar para/ }).click();
  await page.getByLabel('Nome da etapa 1').fill('Pedido');
  await page.getByLabel('Nome da etapa 2').fill('Cotação');
  await page.getByRole('button', { name: /^Avançar para/ }).click();
  await page.getByLabel('O que acontece?').first().fill('Registrar pedido');
  await page.getByRole('button', { name: /^Avançar para/ }).click();
  await page.getByRole('button', { name: 'Pular por agora' }).click();
  await expect(page.getByTestId('wizard-dropped-items')).toContainText('Etapa “Cotação” — sem atividades');
  const create = page.getByRole('button', { name: 'Criar processo e ver o mapa' });
  await expect(create).toBeDisabled();
  await expect(page.getByTestId('wizard-block-reason')).toContainText('Confirme acima');
  await expectNoHorizontalScroll(page);
  await page.getByLabel('Entendi: criar o processo sem esses itens').check();
  await create.click();
  await expect(page).toHaveURL(/\/validar$/);
  const [w] = await readWorkspaces(page);
  expect(w.asIs.stageOrder).toEqual(['Pedido']);
});

test('J3: formulário — falha ao apagar o rascunho depois de criar não é erro e não duplica', async ({ page }) => {
  await prepare(page);
  await page.addInitScript(() => {
    const del = IDBObjectStore.prototype.delete;
    IDBObjectStore.prototype.delete = function (...a: Parameters<typeof del>) {
      if (this.name === 'drafts' && !sessionStorage.getItem('ja-falhou')) {
        sessionStorage.setItem('ja-falhou', '1');
        throw new DOMException('falha simulada', 'UnknownError');
      }
      return del.apply(this, a);
    };
  });
  await page.goto('/app/novo/formulario');
  await page.getByLabel('Como você chama esse processo?').fill('Limpeza falha');
  await page.getByRole('button', { name: /^Avançar para/ }).click();
  await page.getByLabel('Nome da etapa 1').fill('Pedido');
  await page.getByRole('button', { name: /^Avançar para/ }).click();
  await page.getByLabel('O que acontece?').first().fill('Registrar pedido');
  await page.getByRole('button', { name: /^Avançar para/ }).click();
  await page.getByRole('button', { name: 'Pular por agora' }).click();
  await expect.poll(() => drafts(page)).toContain('wizard'); // o rascunho já está no IndexedDB
  const usedId = await slotId(page, 'wizard');
  await page.getByRole('button', { name: 'Criar processo e ver o mapa' }).click();
  await expect(page).toHaveURL(/\/validar$/);
  await expect(page.getByText('Não conseguimos apagar o rascunho antigo deste aparelho')).toBeVisible();
  await expect(page.getByText('Não conseguimos salvar neste navegador')).toHaveCount(0);
  expect(await readWorkspaces(page)).toHaveLength(1);
  expect(await drafts(page)).toContain('wizard'); // a limpeza falhou de verdade
  // Reabrir o formulário: não restaura o rascunho já usado, tenta limpar de novo e não cria outro.
  await page.goto('/app/novo/formulario');
  await expect(page.getByText('Seu último rascunho já virou um processo.')).toBeVisible();
  await expect(page.getByText('Continuamos de onde você parou.')).toHaveCount(0);
  await expect(page.getByLabel('Como você chama esse processo?')).toHaveValue('');
  await expect.poll(() => slotId(page, 'wizard')).not.toBe(usedId); // o rascunho usado saiu (um novo, vazio, pode ocupar o slot)
  expect(await readWorkspaces(page)).toHaveLength(1);
});

test('J3: assistente — falha na limpeza avisa sem erro; falha na criação preserva o rascunho', async ({ page }) => {
  await prepare(page);
  await page.addInitScript(() => {
    const del = IDBObjectStore.prototype.delete;
    const add = IDBObjectStore.prototype.add;
    IDBObjectStore.prototype.delete = function (...a: Parameters<typeof del>) {
      if (this.name === 'drafts' && sessionStorage.getItem('falhar-limpeza')) throw new DOMException('falha simulada', 'UnknownError');
      return del.apply(this, a);
    };
    // Exceção síncrona DENTRO do callback da transação de criação (o projeto é gravado com add):
    // exercita a guarda do run (try/catch → abort → rejeição). O aborto vindo do próprio banco
    // é provado no teste "v2.4.4: aborto REAL", sem injeção.
    IDBObjectStore.prototype.add = function (...a: Parameters<typeof add>) {
      if (this.name === 'workspaces' && sessionStorage.getItem('falhar-criacao')) throw new DOMException('cota', 'QuotaExceededError');
      return add.apply(this, a);
    };
  });
  await begin(page, 'Assistente limpeza', ['Pedido'], ['Registrar pedido (10 min)']);
  await advance(page, 'os detalhes');
  await tailToReview(page);
  // 1) A criação falha: erro claro, nada criado, rascunho continua.
  await page.evaluate(() => sessionStorage.setItem('falhar-criacao', '1'));
  await step(page).getByRole('button', { name: 'Criar meu projeto' }).click();
  await expect(page.getByRole('alert').filter({ hasText: 'Não conseguimos salvar neste navegador' })).toBeVisible();
  await expect(page.getByTestId('assistant-success')).toHaveCount(0);
  expect(await readWorkspaces(page)).toHaveLength(0);
  await page.evaluate(() => sessionStorage.removeItem('falhar-criacao'));
  await page.reload();
  await expect(step(page).getByText('Tudo pronto! Confira o resumo antes de criarmos o projeto.')).toBeVisible();
  // 2) Cria, mas a limpeza falha: sucesso com aviso específico.
  await expect.poll(() => drafts(page)).toContain('assistant');
  const usedId = await slotId(page, 'assistant');
  await page.evaluate(() => sessionStorage.setItem('falhar-limpeza', '1'));
  await step(page).getByRole('button', { name: 'Criar meu projeto' }).click();
  await expect(page.getByTestId('success-cleanup')).toContainText('O projeto foi criado.');
  expect(await readWorkspaces(page)).toHaveLength(1);
  await page.waitForTimeout(600); // além do debounce do auto-save: o rascunho apagado não pode voltar
  expect(await drafts(page)).toContain('assistant'); // continua lá só porque a limpeza falhou
  // 3) Reabrir o assistente com a limpeza funcionando: não restaura, não duplica, limpa.
  await page.evaluate(() => sessionStorage.removeItem('falhar-limpeza'));
  await page.goto('/app/novo');
  await expect(page.getByText('Seu último rascunho já virou um projeto.')).toBeVisible();
  await expect(step(page).getByText('Vamos começar. Como você chama esse processo?')).toBeVisible();
  await expect.poll(() => slotId(page, 'assistant')).not.toBe(usedId);
  expect(await readWorkspaces(page)).toHaveLength(1);
});

test('J4: sem armazenamento local, nada é anunciado como salvo no aparelho', async ({ page }) => {
  await prepare(page);
  await page.addInitScript(() => {
    Object.defineProperty(window, 'indexedDB', {
      configurable: true,
      value: {
        open() {
          throw new Error('bloqueado');
        },
      },
    });
  });
  await page.goto('/app/novo');
  await expect(page.getByText('Este navegador bloqueou o armazenamento local')).toBeVisible();
  await expect(page.getByTestId('draft-storage')).toHaveText('Rascunho só nesta aba');
  await step(page).getByRole('textbox').first().fill('Sem banco local');
  await advance(page, 'o início do processo');
  await step(page).getByRole('button', { name: 'Pular por agora' }).click();
  await step(page).getByRole('button', { name: 'Pular por agora' }).click();
  await add(page, 'Adicionar etapa', ['Pedido']);
  await advance(page, 'as atividades de “Pedido”');
  await add(page, 'Adicionar atividade', ['Registrar pedido (10 min)']);
  await advance(page, 'os detalhes');
  await tailToReview(page);
  await step(page).getByRole('button', { name: 'Criar meu projeto' }).click();
  const ok = page.getByTestId('assistant-success');
  await expect(ok.getByTestId('success-storage')).toContainText('Ainda não está salvo neste aparelho');
  await expect(ok).not.toContainText('salvo neste aparelho, com');
  await expect(ok.getByRole('heading', { level: 1 })).not.toContainText('Excelente');
  await expect(ok.getByRole('button', { name: 'Baixar arquivo do projeto' })).toBeVisible();
  await expectNoHorizontalScroll(page);
  // Dentro do projeto, o indicador também não diz "Salvo".
  await ok.getByRole('button', { name: 'Ver meu Plano de Ação' }).click();
  await expect(page.getByTestId('save-state')).toContainText('Só nesta aba');
});

test('J4: formulário sem armazenamento local avisa antes e depois de criar', async ({ page }) => {
  await prepare(page);
  await page.addInitScript(() => {
    Object.defineProperty(window, 'indexedDB', { configurable: true, value: { open() { throw new Error('bloqueado'); } } });
  });
  await page.goto('/app/novo/formulario');
  await expect(page.getByText('Este navegador bloqueou o armazenamento local')).toBeVisible();
  await expect(page.getByTestId('draft-storage')).toHaveText('Rascunho só nesta aba');
  await page.getByLabel('Como você chama esse processo?').fill('Formulário memória');
  await page.getByRole('button', { name: /^Avançar para/ }).click();
  await page.getByLabel('Nome da etapa 1').fill('Pedido');
  await page.getByRole('button', { name: /^Avançar para/ }).click();
  await page.getByLabel('O que acontece?').first().fill('Registrar pedido');
  await page.getByRole('button', { name: /^Avançar para/ }).click();
  await page.getByRole('button', { name: 'Pular por agora' }).click();
  await page.getByRole('button', { name: 'Criar processo e ver o mapa' }).click();
  await expect(page.getByText('Processo criado só nesta aba')).toBeVisible();
  await expect(page.getByText('salvo neste aparelho. Vamos conferir')).toHaveCount(0);
});

test('J4: falha de gravação durante o uso aparece e pode ser refeita', async ({ page }) => {
  await prepare(page);
  await page.addInitScript(() => {
    const put = IDBObjectStore.prototype.put;
    IDBObjectStore.prototype.put = function (...a: Parameters<typeof put>) {
      if (this.name === 'workspaces' && sessionStorage.getItem('falhar')) throw new DOMException('cota', 'QuotaExceededError');
      return put.apply(this, a);
    };
  });
  const base = await openDemo(page);
  await page.goto(`${base}/dados`);
  await page.evaluate(() => sessionStorage.setItem('falhar', '1'));
  await page.getByLabel('Custo-hora padrão (R$)').fill('61');
  const state = page.getByTestId('save-state');
  await expect(state).toContainText('Falha ao salvar');
  await page.evaluate(() => sessionStorage.removeItem('falhar'));
  await state.getByRole('button', { name: 'Tentar de novo' }).click();
  await expect(state).toContainText('Salvo');
});

test('J10: sem durações o diagnóstico não é anunciado como calculado; com durações, sim', async ({ page }) => {
  await prepare(page);
  await begin(page, 'Sem durações', ['Pedido'], ['Registrar pedido']);
  await advance(page, 'os detalhes');
  await tailToReview(page);
  await step(page).getByRole('button', { name: 'Criar meu projeto' }).click();
  const ok = page.getByTestId('assistant-success');
  await expect(ok.getByTestId('success-diagnosis')).toHaveText('Diagnóstico ainda não calculado: falta a duração das atividades. Informe o tempo de cada atividade em “Dados”.');
  await expect(ok).not.toContainText('diagnóstico calculado a partir');
  await ok.getByRole('button', { name: 'Informar as durações' }).click();
  await expect(page).toHaveURL(/\/dados$/);

  await begin(page, 'Com durações', ['Pedido'], ['Registrar pedido (10 min)', 'Aprovar pedido']);
  await advance(page, 'os detalhes');
  await tailToReview(page);
  await step(page).getByRole('button', { name: 'Criar meu projeto' }).click();
  await expect(page.getByTestId('success-diagnosis')).toHaveText('Diagnóstico calculado com 1 de 2 atividades com duração; complete as demais para um resultado completo.');
  await expect(page.getByTestId('success-storage')).toContainText('foi criado e está salvo neste aparelho');
  await expect(page.getByRole('button', { name: 'Ver meu Plano de Ação' })).toBeVisible();
});

// ---------------------------------------------------------------------------------------
// v2.4.3 — idempotência transacional no IndexedDB REAL do navegador: projeto e registro
// "criado:<draftId>" na mesma transação; sem depender do localStorage. Os testes leem o
// estado persistido (stores workspaces e drafts), não só a interface.
const idbGet = (page: Page, key: string) =>
  page.evaluate(
    (k) =>
      new Promise<unknown>((resolve) => {
        const r = indexedDB.open('nexoprocess');
        r.onsuccess = () => {
          const g = r.result.transaction('drafts').objectStore('drafts').get(k);
          g.onsuccess = () => resolve(g.result);
        };
      }),
    key,
  );
const idbPut = (page: Page, key: string, value: unknown) =>
  page.evaluate(
    ([k, v]) =>
      new Promise<void>((resolve) => {
        const r = indexedDB.open('nexoprocess');
        r.onsuccess = () => {
          const t = r.result.transaction('drafts', 'readwrite');
          t.objectStore('drafts').put(v, k as string);
          t.oncomplete = () => resolve();
        };
      }),
    [key, value] as const,
  );
const slotId = async (page: Page, key: string) => ((await idbGet(page, key)) as { draftId?: string } | undefined)?.draftId;
const commits = async (page: Page) => (await drafts(page)).filter((k) => k.startsWith('criado:'));
/** localStorage inutilizável (navegador com armazenamento do site restrito), IndexedDB funcionando. */
const blockLocalStorage = (page: Page) =>
  page.addInitScript(() => {
    const deny = () => {
      throw new DOMException('bloqueado', 'SecurityError');
    };
    Storage.prototype.getItem = deny;
    Storage.prototype.setItem = deny;
    Storage.prototype.removeItem = deny;
  });

test('v2.4.3: localStorage bloqueado + IndexedDB — limpeza falha, retomada não restaura nem duplica', async ({ page }) => {
  await prepare(page);
  await blockLocalStorage(page);
  await page.addInitScript(() => {
    const del = IDBObjectStore.prototype.delete;
    IDBObjectStore.prototype.delete = function (...a: Parameters<typeof del>) {
      if (this.name === 'drafts' && !sessionStorage.getItem('ja-falhou')) {
        sessionStorage.setItem('ja-falhou', '1');
        throw new DOMException('falha simulada', 'UnknownError');
      }
      return del.apply(this, a);
    };
  });
  await begin(page, 'Sem localStorage', ['Pedido'], ['Registrar pedido (10 min)']);
  await advance(page, 'os detalhes');
  await tailToReview(page);
  await expect.poll(() => drafts(page)).toContain('assistant'); // rascunho só no IndexedDB
  const draftId = ((await idbGet(page, 'assistant')) as { draftId: string }).draftId;
  await step(page).getByRole('button', { name: 'Criar meu projeto' }).click();
  await expect(page.getByTestId('success-cleanup')).toBeVisible();
  // Estado persistido: 1 projeto, registro durável apontando para ele, rascunho ainda no slot.
  const [w] = await readWorkspaces(page);
  expect(await readWorkspaces(page)).toHaveLength(1);
  expect(await idbGet(page, `criado:${draftId}`)).toMatchObject({ kind: 'criado', draftId, draftKey: 'assistant', workspaceId: w.id });
  expect(await drafts(page)).toContain('assistant');
  // Recarregar o app: o rascunho já usado não volta; o projeto existente é oferecido; limpeza refeita.
  await page.goto('/app/novo');
  await expect(page.getByText('Seu último rascunho já virou um projeto.')).toBeVisible();
  await expect(step(page).getByText('Vamos começar. Como você chama esse processo?')).toBeVisible();
  await expect.poll(() => slotId(page, 'assistant')).not.toBe(draftId); // o rascunho usado saiu do slot
  expect(await commits(page)).toEqual([`criado:${draftId}`]);
  expect(await readWorkspaces(page)).toHaveLength(1);
  await page.getByRole('button', { name: 'Abrir o projeto' }).click();
  await expect(page).toHaveURL(new RegExp(`/app/p/${w.id}/visao-geral$`));
});

// ---------------------------------------------------------------------------------------
// v2.4.4 — aborto real da transação, abas desatualizadas e rascunho antigo sem draftId.
type IdbEvent = { ev: string; what?: string; error?: string };
/**
 * Observa, SEM alterar o comportamento, as transações de criação (workspaces + drafts): o
 * resultado de cada add e o fim da transação (complete/abort, com o erro do banco).
 */
const observeIdb = (page: Page) =>
  page.addInitScript(() => {
    const log: IdbEvent[] = [];
    (window as unknown as { __idb: IdbEvent[] }).__idb = log;
    const tx = IDBDatabase.prototype.transaction;
    IDBDatabase.prototype.transaction = function (...a: Parameters<typeof tx>) {
      const t = tx.apply(this, a);
      if (t.objectStoreNames.contains('workspaces') && t.objectStoreNames.contains('drafts')) {
        t.addEventListener('abort', () => log.push({ ev: 'abort', error: t.error?.name }));
        t.addEventListener('complete', () => log.push({ ev: 'complete' }));
      }
      return t;
    };
    const add = IDBObjectStore.prototype.add;
    IDBObjectStore.prototype.add = function (...a: Parameters<typeof add>) {
      const r = add.apply(this, a);
      const what = this.name === 'drafts' ? String(a[1]) : `workspace:${(a[0] as { id: string }).id}`;
      r.addEventListener('success', () => log.push({ ev: 'success', what }));
      r.addEventListener('error', () => log.push({ ev: 'error', what, error: r.error?.name }));
      return r;
    };
  });
const idbLog = (page: Page) => page.evaluate(() => (window as unknown as { __idb: IdbEvent[] }).__idb);
/** Enquanto sessionStorage "uuid-fixo" existir, os ids novos começam por ele (o resto continua aleatório). */
const pinnableUuid = (page: Page) =>
  page.addInitScript(() => {
    const random = crypto.randomUUID.bind(crypto);
    crypto.randomUUID = () => {
      const f = sessionStorage.getItem('uuid-fixo');
      return (f ? `${f}${random().slice(f.length)}` : random()) as ReturnType<typeof random>;
    };
  });
const saveError = (page: Page) => page.getByRole('alert').filter({ hasText: 'Não conseguimos salvar neste navegador' });

test('v2.4.4: aborto REAL da transação (ConstraintError do banco) — nem projeto nem registro', async ({ page }) => {
  await prepare(page);
  await observeIdb(page);
  await pinnableUuid(page);
  const demoId = (await openDemo(page)).split('/').pop()!;
  await begin(page, 'Rollback real', ['Pedido'], ['Registrar pedido (10 min)']);
  await advance(page, 'os detalhes');
  await tailToReview(page);
  await expect.poll(() => drafts(page)).toContain('assistant');
  const draftId = (await slotId(page, 'assistant'))!;
  const demoBefore = (await readWorkspaces(page)).find((w) => w.id === demoId);
  expect(demoBefore).toBeDefined();
  // Nenhuma função do IndexedDB é trocada: o novo projeto só recebe o id de um projeto que já
  // existe (a demonstração). O registro é gravado primeiro (sucesso), o add do projeto viola a
  // chave e o PRÓPRIO banco aborta a transação.
  await page.evaluate((f) => sessionStorage.setItem('uuid-fixo', f), demoId.slice(2));
  await step(page).getByRole('button', { name: 'Criar meu projeto' }).click();
  await expect(saveError(page)).toBeVisible();
  await expect(page.getByTestId('assistant-success')).toHaveCount(0);
  expect(await idbLog(page)).toEqual([
    { ev: 'success', what: `criado:${draftId}` },
    { ev: 'error', what: `workspace:${demoId}`, error: 'ConstraintError' },
    { ev: 'abort', error: 'ConstraintError' },
  ]);
  // Estado persistido: o registro gravado antes na transação foi desfeito; a demonstração não foi sobrescrita.
  const after = await readWorkspaces(page);
  expect(after).toEqual([demoBefore]);
  expect(await commits(page)).toEqual([]);
  expect(await slotId(page, 'assistant')).toBe(draftId); // rascunho intacto
  // Nova tentativa sem a colisão: cria normalmente, com o mesmo rascunho.
  await page.evaluate(() => sessionStorage.removeItem('uuid-fixo'));
  await step(page).getByRole('button', { name: 'Criar meu projeto' }).click();
  await expect(page.getByTestId('assistant-success')).toBeVisible();
  expect((await idbLog(page)).at(-1)).toEqual({ ev: 'complete' });
  expect(await readWorkspaces(page)).toHaveLength(2);
  expect((await readWorkspaces(page)).find((w) => w.id === demoId)).toEqual(demoBefore);
  expect(await commits(page)).toEqual([`criado:${draftId}`]);
});

/** Duas abas no mesmo rascunho, ambas na revisão. */
async function twoTabsAtReview(page: Page, other: Page, name: string) {
  await prepare(page);
  await begin(page, name, ['Pedido'], ['Registrar pedido (10 min)']);
  await advance(page, 'os detalhes');
  await tailToReview(page);
  await expect.poll(() => drafts(page)).toContain('assistant');
  await prepare(other);
  await other.goto('/app/novo'); // restaura o mesmo rascunho (mesmo draftId)
  await expect(step(other).getByText('Tudo pronto! Confira o resumo antes de criarmos o projeto.')).toBeVisible();
  return (await slotId(page, 'assistant'))!;
}
async function editVolume(p: Page, n: string) {
  await step(p).getByRole('button', { name: 'Corrigir Volume' }).click();
  await step(p).getByLabel('Execuções').fill(n);
  await step(p).getByRole('button', { name: 'Voltar à revisão' }).click();
  await expect(step(p).getByText(`${n} por mês`)).toBeVisible();
}

test('v2.4.4: duas abas — a aba que edita depois da criação fica bloqueada (ja_criado) e mantém os dados', async ({ page, context }) => {
  const other = await context.newPage();
  const draftId = await twoTabsAtReview(page, other, 'Edição divergente');
  await step(page).getByRole('button', { name: 'Criar meu projeto' }).click();
  await expect(page.getByTestId('assistant-success')).toBeVisible();
  // A outra aba edita depois: o salvamento automático recebe 'ja_criado'.
  await editVolume(other, '300');
  const notice = other.getByTestId('stale-draft');
  await expect(notice).toContainText('Projeto criado em outra aba. Copie seus dados.');
  // Bloqueio: não cria, não salva. Conteúdo: continua na tela e no quadro para copiar.
  await expect(step(other).getByRole('button', { name: 'Criar meu projeto' })).toBeDisabled();
  await expect(step(other).getByTestId('assistant-block-reason')).toContainText('já foi criado em outra aba');
  await expect(other.getByTestId('draft-storage')).toHaveText('Esta aba não está salvando');
  await expect(step(other).getByText('300 por mês')).toBeVisible();
  await expect(notice.getByTestId('stale-copy')).toHaveValue(/Processo: Edição divergente[\s\S]*Registrar pedido[\s\S]*Volume: 300 por mês/);
  // Estado persistido: um projeto, com o conteúdo da primeira aba; o rascunho usado não voltou.
  await other.waitForTimeout(600); // além do debounce
  const ws = await readWorkspaces(page);
  expect(ws).toHaveLength(1);
  expect(ws[0].asIs.volume).toBeUndefined();
  expect(await commits(page)).toEqual([`criado:${draftId}`]);
  expect(await slotId(page, 'assistant')).toBeUndefined();
  // Continuar editando não grava nada.
  await editVolume(other, '450');
  await other.waitForTimeout(600);
  expect(await slotId(page, 'assistant')).toBeUndefined();
  await expect(notice.getByTestId('stale-copy')).toHaveValue(/Volume: 450 por mês/);
  await notice.getByRole('button', { name: 'Abrir o projeto criado' }).click();
  await expect(other).toHaveURL(new RegExp(`/app/p/${ws[0].id}/visao-geral$`));
});

test('v2.4.4: duas abas — criar com conteúdo divergente não reaproveita nem cria: bloqueia e mantém os dados', async ({ page, context }) => {
  const other = await context.newPage();
  const draftId = await twoTabsAtReview(page, other, 'Criação divergente');
  // A segunda aba edita ANTES (salvamento permitido); a primeira cria com o seu conteúdo.
  await editVolume(other, '300');
  await expect.poll(async () => ((await idbGet(page, 'assistant')) as { volume?: number } | undefined)?.volume).toBe(300);
  await step(page).getByRole('button', { name: 'Criar meu projeto' }).click();
  await expect(page.getByTestId('assistant-success')).toBeVisible();
  // A segunda aba tenta criar com conteúdo diferente: nem "reaproveitado", nem outro projeto.
  await step(other).getByRole('button', { name: 'Criar meu projeto' }).click();
  await expect(other.getByTestId('stale-draft')).toContainText('Projeto criado em outra aba. Copie seus dados.');
  await expect(other.getByTestId('assistant-success')).toHaveCount(0);
  await expect(step(other).getByText('300 por mês')).toBeVisible();
  await expect(step(other).getByRole('button', { name: 'Criar meu projeto' })).toBeDisabled();
  const ws = await readWorkspaces(page);
  expect(ws).toHaveLength(1);
  expect(ws[0].asIs.volume).toBeUndefined(); // o projeto é o da primeira aba
  expect(await commits(page)).toEqual([`criado:${draftId}`]);
});

test('v2.4.4: formulário em duas abas — a aba desatualizada bloqueia salvar e criar e mantém os dados', async ({ page, context }) => {
  await prepare(page);
  await page.goto('/app/novo/formulario');
  await page.getByLabel('Como você chama esse processo?').fill('Formulário em duas abas');
  await page.getByRole('button', { name: /^Avançar para/ }).click();
  await page.getByLabel('Nome da etapa 1').fill('Pedido');
  await page.getByRole('button', { name: /^Avançar para/ }).click();
  await page.getByLabel('O que acontece?').first().fill('Registrar pedido');
  await page.getByRole('button', { name: /^Avançar para/ }).click();
  await page.getByRole('button', { name: 'Pular por agora' }).click();
  await expect.poll(async () => ((await idbGet(page, 'wizard')) as { step?: number } | undefined)?.step).toBe(4);
  const draftId = (await slotId(page, 'wizard'))!;
  const other = await context.newPage();
  await prepare(other);
  await other.goto('/app/novo/formulario');
  await expect(other.getByText('Continuamos de onde você parou.')).toBeVisible();
  await expect(other.getByRole('heading', { name: 'Revisão final' })).toBeVisible();
  await page.getByRole('button', { name: 'Criar processo e ver o mapa' }).click();
  await expect(page).toHaveURL(/\/validar$/);
  // A outra aba muda algo (volta um passo): o salvamento automático recebe 'ja_criado'.
  await other.getByRole('button', { name: /^Voltar/ }).click();
  const notice = other.getByTestId('stale-draft');
  await expect(notice).toContainText('Projeto criado em outra aba. Copie seus dados.');
  await expect(other.getByTestId('draft-storage')).toHaveText('Esta aba não está salvando');
  await other.getByRole('button', { name: /^Avançar para/ }).click();
  await expect(other.getByRole('button', { name: 'Criar processo e ver o mapa' })).toBeDisabled();
  await expect(other.getByTestId('wizard-block-reason')).toContainText('já foi criado em outra aba');
  await expect(notice.getByTestId('stale-copy')).toHaveValue(/Processo: Formulário em duas abas[\s\S]*Etapa: Pedido[\s\S]*- Registrar pedido/);
  await other.waitForTimeout(600);
  expect(await readWorkspaces(page)).toHaveLength(1);
  expect(await commits(page)).toEqual([`criado:${draftId}`]);
  expect(await slotId(page, 'wizard')).toBeUndefined();
});

test('v2.4.4: rascunho antigo sem draftId — identidade gravada antes de criar; falha real e nova tentativa usam a mesma', async ({ page }) => {
  await prepare(page);
  await observeIdb(page);
  await pinnableUuid(page);
  const demoId = (await openDemo(page)).split('/').pop()!;
  // Rascunho como a versão anterior gravava: sem draftId (no IndexedDB e na cópia local).
  const legacy = {
    version: 1,
    step: 'review',
    name: 'Rascunho antigo',
    stages: [{ key: 's1', name: 'Pedido', activities: [{ key: 'a1', name: 'Registrar pedido', unit: 'min', duration: 10 }] }],
    decisions: [],
    period: 'mes',
    detailIndex: 0,
    volumeUnknown: true,
    costUnknown: true,
  };
  await idbPut(page, 'assistant', legacy);
  await page.evaluate((d) => localStorage.setItem('nexo.draft.assistant', JSON.stringify(d)), legacy);
  await page.goto('/app/novo');
  await expect(step(page).getByText('Tudo pronto! Confira o resumo antes de criarmos o projeto.')).toBeVisible();
  await page.waitForTimeout(600); // salvamento automático: o rascunho continua sem identidade inventada só na memória
  expect(await idbGet(page, 'assistant')).toEqual(legacy);
  // 1ª tentativa: falha REAL (ConstraintError) — a identidade já foi gravada antes do commit.
  const fixed = demoId.slice(2);
  await page.evaluate((f) => sessionStorage.setItem('uuid-fixo', f), fixed);
  await step(page).getByRole('button', { name: 'Criar meu projeto' }).click();
  await expect(saveError(page)).toBeVisible();
  const stamped = `rd${fixed}`;
  expect((await idbLog(page)).at(-1)).toEqual({ ev: 'abort', error: 'ConstraintError' });
  expect(await slotId(page, 'assistant')).toBe(stamped);
  expect(JSON.parse((await page.evaluate(() => localStorage.getItem('nexo.draft.assistant')))!).draftId).toBe(stamped);
  expect(await commits(page)).toEqual([]);
  expect(await readWorkspaces(page)).toHaveLength(1);
  // Recarregar e tentar de novo: a mesma identidade é usada; um projeto só.
  await page.evaluate(() => sessionStorage.removeItem('uuid-fixo'));
  await page.reload();
  await expect(step(page).getByText('Tudo pronto! Confira o resumo antes de criarmos o projeto.')).toBeVisible();
  await step(page).getByRole('button', { name: 'Criar meu projeto' }).click();
  await expect(page.getByTestId('assistant-success')).toBeVisible();
  expect(await commits(page)).toEqual([`criado:${stamped}`]);
  expect(await readWorkspaces(page)).toHaveLength(2);
  // Limpo (E2): reabrir não restaura o rascunho usado nem cria outro.
  expect(await page.evaluate(() => localStorage.getItem('nexo.draft.assistant'))).toBeNull();
  await page.goto('/app/novo');
  await expect(step(page).getByText('Vamos começar. Como você chama esse processo?')).toBeVisible();
  await expect(page.getByText('Continuamos de onde você parou.')).toHaveCount(0);
  await page.waitForTimeout(600);
  expect(await slotId(page, 'assistant')).not.toBe(stamped);
  expect(await readWorkspaces(page)).toHaveLength(2);
});

test('v2.4.3: salvamento automático concorrente e regravação atrasada não recriam nem duplicam', async ({ page }) => {
  await prepare(page);
  await begin(page, 'Concorrente', ['Pedido'], ['Registrar pedido (10 min)']);
  await advance(page, 'os detalhes');
  await tailToReview(page);
  await expect.poll(() => drafts(page)).toContain('assistant');
  // Alteração e criação dentro da janela do debounce do salvamento automático.
  await step(page).getByRole('button', { name: 'Corrigir Volume' }).click();
  await step(page).getByLabel('Execuções').fill('120');
  await step(page).getByRole('button', { name: 'Voltar à revisão' }).click();
  const before = (await idbGet(page, 'assistant')) as { draftId: string };
  await step(page).getByRole('button', { name: 'Criar meu projeto' }).click();
  await expect(page.getByTestId('assistant-success')).toBeVisible();
  await page.waitForTimeout(800); // além do debounce (250 ms)
  expect(await drafts(page)).not.toContain('assistant');
  expect(await readWorkspaces(page)).toHaveLength(1);
  // Simula um salvamento que chegou depois (outra aba antiga): o rascunho usado reaparece no slot e na cópia local.
  await idbPut(page, 'assistant', { ...before, volume: 120 });
  await page.evaluate((d) => localStorage.setItem('nexo.draft.assistant', JSON.stringify(d)), before);
  await page.goto('/app/novo');
  await expect(page.getByText('Seu último rascunho já virou um projeto.')).toBeVisible();
  await expect(page.getByText('Continuamos de onde você parou.')).toHaveCount(0);
  await expect.poll(() => slotId(page, 'assistant')).not.toBe(before.draftId);
  expect(await page.evaluate(() => localStorage.getItem('nexo.draft.assistant'))).toBeNull();
  expect(await readWorkspaces(page)).toHaveLength(1);
});

test('v2.4.3: duas abas criam o mesmo rascunho ao mesmo tempo — um projeto só', async ({ page, context }) => {
  await prepare(page);
  await begin(page, 'Duas abas', ['Pedido'], ['Registrar pedido (10 min)']);
  await advance(page, 'os detalhes');
  await tailToReview(page);
  await expect.poll(() => drafts(page)).toContain('assistant');
  const other = await context.newPage();
  await prepare(other);
  await other.goto('/app/novo'); // restaura o mesmo rascunho (mesmo draftId)
  await expect(other.getByTestId('assistant-step').getByText('Tudo pronto! Confira o resumo antes de criarmos o projeto.')).toBeVisible();
  await Promise.all([step(page).getByRole('button', { name: 'Criar meu projeto' }).click(), other.getByTestId('assistant-step').getByRole('button', { name: 'Criar meu projeto' }).click()]);
  await expect(page.getByTestId('assistant-success')).toBeVisible();
  await expect(other.getByTestId('assistant-success')).toBeVisible();
  const ws = await readWorkspaces(page);
  expect(ws).toHaveLength(1);
  expect(await commits(page)).toHaveLength(1);
  // A aba que chegou depois mostra o projeto existente, sem ter criado outro.
  expect((await page.getByTestId('success-reused').count()) + (await other.getByTestId('success-reused').count())).toBe(1);
});

test('v2.4.3: formulário com localStorage bloqueado — repetir a criação não duplica', async ({ page }) => {
  await prepare(page);
  await blockLocalStorage(page);
  await page.addInitScript(() => {
    const del = IDBObjectStore.prototype.delete;
    IDBObjectStore.prototype.delete = function (...a: Parameters<typeof del>) {
      if (this.name === 'drafts' && !sessionStorage.getItem('ja-falhou')) {
        sessionStorage.setItem('ja-falhou', '1');
        throw new DOMException('falha simulada', 'UnknownError');
      }
      return del.apply(this, a);
    };
  });
  await page.goto('/app/novo/formulario');
  await page.getByLabel('Como você chama esse processo?').fill('Formulário sem localStorage');
  await page.getByRole('button', { name: /^Avançar para/ }).click();
  await page.getByLabel('Nome da etapa 1').fill('Pedido');
  await page.getByRole('button', { name: /^Avançar para/ }).click();
  await page.getByLabel('O que acontece?').first().fill('Registrar pedido');
  await page.getByRole('button', { name: /^Avançar para/ }).click();
  await page.getByRole('button', { name: 'Pular por agora' }).click();
  await expect.poll(() => drafts(page)).toContain('wizard');
  const draft = await idbGet(page, 'wizard');
  await page.getByRole('button', { name: 'Criar processo e ver o mapa' }).click();
  await expect(page).toHaveURL(/\/validar$/);
  expect(await readWorkspaces(page)).toHaveLength(1);
  expect(await commits(page)).toHaveLength(1);
  // O rascunho usado volta ao slot (simulação) e a pessoa tenta criar de novo: nada é recriado.
  await idbPut(page, 'wizard', draft);
  await page.goto('/app/novo/formulario');
  await expect(page.getByText('Seu último rascunho já virou um processo.')).toBeVisible();
  await expect(page.getByLabel('Como você chama esse processo?')).toHaveValue('');
  await expect.poll(() => slotId(page, 'wizard')).not.toBe((draft as { draftId: string }).draftId);
  expect(await readWorkspaces(page)).toHaveLength(1);
});
