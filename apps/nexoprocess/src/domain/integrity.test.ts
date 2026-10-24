// v2.4.2 — a revisão mostra exatamente o que é gravado (J1, J2, J5, J6, J10).
import { describe, expect, it } from 'vitest';
import { analyzeDraft, draftToProcess, emptyDraft, type AssistantDraft } from './assistant';
import { analyzeWizard, wizardToProcess } from '../pages/Wizard';
import { newWorkspace } from './factory';
import { stepRequirements } from './journey';
import { validateProcess } from './validation';

const base = (): AssistantDraft => ({
  ...emptyDraft(),
  name: 'Compras',
  step: 'review',
  stages: [
    { key: 's1', name: 'Pedido', activities: [{ key: 'a1', name: 'Registrar pedido', unit: 'min' }, { key: 'a2', name: 'Aprovar pedido', unit: 'min' }] },
    { key: 's2', name: 'Compra', activities: [{ key: 'a3', name: 'Emitir ordem', unit: 'min' }] },
  ],
});
const tasks = (p: ReturnType<typeof draftToProcess>) => p.activities.filter((a) => a.type === 'task').map((a) => a.name);
const decisions = (p: ReturnType<typeof draftToProcess>) => p.activities.filter((a) => a.type === 'decision');
/** O que a revisão do assistente mostra (análise) = o que o projeto contém. */
function expectReviewEqualsProject(d: AssistantDraft) {
  const r = analyzeDraft(d);
  const p = draftToProcess(d);
  expect(p.stageOrder).toEqual(r.stages.map((s) => s.name.trim()));
  expect(tasks(p)).toEqual(r.flat.map((x) => x.a.name.trim()));
  expect(decisions(p).map((x) => x.name).sort()).toEqual(r.decisions.map((x) => x.question.trim()).sort());
}

describe('J1 — várias decisões depois da mesma atividade', () => {
  it('todas são gravadas, em sequência (sim → próxima decisão), sem erros', () => {
    const d = base();
    d.decisions = [
      { key: 'd1', question: 'Valor acima do limite?', afterKey: 'a2', noTarget: '__end' },
      { key: 'd2', question: 'Fornecedor homologado?', afterKey: 'a2', noTarget: 'a1' },
    ];
    const p = draftToProcess(d);
    const [x, y] = decisions(p);
    expect([x.name, y.name]).toEqual(['Valor acima do limite?', 'Fornecedor homologado?']);
    const a2 = p.activities.find((a) => a.name === 'Aprovar pedido')!;
    const a3 = p.activities.find((a) => a.name === 'Emitir ordem')!;
    expect(a2.next).toEqual([x.id]);
    expect(x.nextYes).toBe(y.id);
    expect(x.nextNo).toBe('FIM_NAO');
    expect(y.nextYes).toBe(a3.id);
    expect(y.nextNo).toBe(p.activities.find((a) => a.name === 'Registrar pedido')!.id);
    expect(validateProcess(p).filter((i) => i.severity === 'error')).toEqual([]);
    expectReviewEqualsProject(d);
  });
});

describe('J2 — decisões órfãs', () => {
  it('atividade removida depois: a decisão fica inválida (não é trocada pela 1ª atividade)', () => {
    const d = base();
    d.decisions = [{ key: 'd1', question: 'Aprovado?', afterKey: 'a2', noTarget: 'a1' }];
    d.stages[0].activities = d.stages[0].activities.filter((a) => a.key !== 'a2');
    const r = analyzeDraft(d);
    expect(r.invalidDecisions).toEqual([{ decision: d.decisions[0], n: 1, problem: 'atividade_removida' }]);
    expect(r.decisions).toEqual([]);
    expect(decisions(draftToProcess(d))).toEqual([]);
  });
  it('destino do "não" removido e atividade numa etapa pulada também ficam inválidos', () => {
    const d = base();
    d.decisions = [
      { key: 'd1', question: 'Aprovado?', afterKey: 'a1', noTarget: 'a9' },
      { key: 'd2', question: 'Urgente?', afterKey: 'a3', noTarget: '__end' },
      { key: 'd3', question: '  ', afterKey: 'a1', noTarget: '__end' },
    ];
    d.stages[1].skipped = true;
    expect(analyzeDraft(d).invalidDecisions.map((x) => [x.n, x.problem])).toEqual([
      [1, 'destino_removido'],
      [2, 'atividade_removida'],
      [3, 'sem_pergunta'],
    ]);
  });
  it('corrigir a referência recupera a decisão', () => {
    const d = base();
    d.decisions = [{ key: 'd1', question: 'Aprovado?', afterKey: 'sumiu', noTarget: '__end' }];
    expect(analyzeDraft(d).invalidDecisions).toHaveLength(1);
    d.decisions[0].afterKey = 'a1';
    expect(analyzeDraft(d).invalidDecisions).toHaveLength(0);
    expect(decisions(draftToProcess(d)).map((x) => x.name)).toEqual(['Aprovado?']);
  });
});

describe('J5 — etapas que não entram no projeto aparecem na análise', () => {
  it('pulada (com atividades listadas), sem atividades e sem nome', () => {
    const d = base();
    d.stages[1].skipped = true;
    d.stages.push({ key: 's3', name: 'Entrega', activities: [] }, { key: 's4', name: '', activities: [{ key: 'a4', name: 'Conferir', unit: 'min' }] }, { key: 's5', name: '', activities: [] });
    expect(analyzeDraft(d).droppedStages).toEqual([
      { key: 's2', name: 'Compra', reason: 'pulada', activities: ['Emitir ordem'] },
      { key: 's3', name: 'Entrega', reason: 'sem_atividades', activities: [] },
      { key: 's4', name: '', reason: 'sem_nome', activities: ['Conferir'] },
    ]); // s5 (vazia, sem nada) não tem conteúdo a perder
    expectReviewEqualsProject(d);
    expect(draftToProcess(d).stageOrder).toEqual(['Pedido']);
  });
  it('revisão = projeto em rascunhos variados', () => {
    const d1 = base();
    const d2 = base();
    d2.decisions = [{ key: 'd1', question: 'Ok?', afterKey: 'a1', noTarget: 'a3' }];
    d2.stages[0].activities.push({ key: 'a5', name: '   ', unit: 'min' });
    for (const d of [d1, d2]) expectReviewEqualsProject(d);
  });
});

describe('J6 — formulário: o que a revisão lista é o que é gravado', () => {
  const wiz = (): Parameters<typeof wizardToProcess>[0] =>
    ({
      step: 4,
      name: 'Compras',
      description: '',
      area: '',
      period: 'mes',
      stages: [
        { key: 's1', name: 'Pedido', items: [{ key: 'i1', name: 'Registrar', unit: 'min' }, { key: 'i2', name: 'Ok?', unit: 'min', isDecision: true, noTarget: 'i9' }] },
        { key: 's2', name: 'Cotação', items: [{ key: 'i3', name: '', unit: 'min' }] },
        { key: 's3', name: '', items: [{ key: 'i4', name: 'Emitir ordem', unit: 'min' }] },
      ],
    }) as never;
  it('etapa sem atividades, atividade em etapa sem nome e "não" órfão aparecem', () => {
    const r = analyzeWizard(wiz());
    expect(r.dropped).toEqual([
      { key: 's2', name: 'Cotação', reason: 'sem_atividades', activities: [] },
      { key: 's3', name: '', reason: 'sem_nome', activities: ['Emitir ordem'] },
    ]);
    expect(r.invalidDecisions).toEqual([{ key: 'i2', name: 'Ok?', stage: 'Pedido' }]);
    const p = wizardToProcess(wiz());
    expect(p.stageOrder).toEqual(r.stages.map((s) => s.name));
    expect(p.activities.filter((a) => a.type !== 'start' && a.type !== 'end').map((a) => a.name)).toEqual(r.flat.map((x) => x.i.name));
  });
});

describe('J10 — diagnóstico só é "calculado" com durações', () => {
  const diagOk = (d: AssistantDraft) => stepRequirements('diagnostico', newWorkspace(draftToProcess(d), { kind: 'wizard' })).every((x) => x.kind !== 'obrigatório' || x.ok);
  it('projeto mínimo sem durações: requisito obrigatório não atendido', () => {
    expect(diagOk(base())).toBe(false);
  });
  it('com duração em pelo menos uma atividade: atendido', () => {
    const d = base();
    d.stages[0].activities[0].duration = 10;
    expect(diagOk(d)).toBe(true);
  });
});
