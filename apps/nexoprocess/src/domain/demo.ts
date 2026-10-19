// Processo demonstrativo FICTÍCIO. Os números são ilustrativos, não
// representam nenhuma empresa real e ficam isolados (workspace.isDemo = true).
import { newActivity, newProcess, newScenario, newWorkspace } from './factory';
import { updateActivity } from './tobe';
import type { ActionItem, Activity, ProcessModel, Scenario, Workspace } from './types';
import { nowIso } from './units';

export const DEMO_NAME = 'Processamento de pedido (exemplo fictício)';

export function demoProcess(): ProcessModel {
  const p = newProcess(DEMO_NAME);
  p.description = 'Do recebimento do pedido ao despacho. Dados ilustrativos para conhecer a ferramenta.';
  p.area = 'Operações (exemplo)';
  p.processOwner = 'Gerente de operações (exemplo)';
  p.volume = 1200;
  p.volumePeriod = 'mes';
  p.hoursPerDay = 8;
  p.costPerHourByRole = {
    Atendente: 45,
    'Analista financeiro': 70,
    'Operador de estoque': 38,
    Conferente: 40,
    Faturista: 50,
    'Analista de logística': 60,
  };
  let order = 0;
  const A = (x: Partial<Activity> & Pick<Activity, 'id' | 'stage' | 'name'>) => newActivity({ order: ++order, ...x });
  p.activities = [
    A({ id: 'S0', stage: 'Recebimento', name: 'Pedido recebido', type: 'start', next: ['A1'] }),
    A({ id: 'A1', stage: 'Recebimento', name: 'Registrar pedido no sistema', duration: 10, people: 1, owner: 'Atendente', lean: 'NNVA', wait: 30, minDuration: 6, maxDuration: 20, next: ['A2'] }),
    A({ id: 'A2', stage: 'Recebimento', name: 'Conferir dados do cliente', duration: 8, people: 1, owner: 'Atendente', lean: 'NNVA', leanReason: 'controle', minDuration: 5, maxDuration: 15, next: ['D1'] }),
    A({ id: 'D1', stage: 'Recebimento', name: 'Dados completos?', type: 'decision', nextYes: 'B1', nextNo: 'A3' }),
    A({ id: 'A3', stage: 'Recebimento', name: 'Solicitar correção ao cliente', duration: 15, people: 1, owner: 'Atendente', lean: 'W', rework: true, frequencyPct: 20, wait: 240, minDuration: 10, maxDuration: 30, next: ['A2'], notes: 'Cliente responde por e-mail; espera média informada pela equipe (exemplo).' }),
    A({ id: 'B1', stage: 'Análise de crédito', name: 'Consultar limite de crédito', duration: 12, people: 1, owner: 'Analista financeiro', lean: 'NNVA', leanReason: 'controle', leanReasonNote: 'Política de crédito (exemplo)', wait: 120, minDuration: 8, maxDuration: 25, next: ['D2'], critical: true }),
    A({ id: 'D2', stage: 'Análise de crédito', name: 'Crédito aprovado?', type: 'decision', nextYes: 'C1', nextNo: 'B2' }),
    A({ id: 'B2', stage: 'Análise de crédito', name: 'Análise manual de crédito', duration: 45, people: 2, owner: 'Analista financeiro', lean: 'NNVA', leanReason: 'controle', leanReasonNote: 'Política de crédito (exemplo)', frequencyPct: 15, wait: 480, minDuration: 30, maxDuration: 90, next: ['D3'], critical: true }),
    A({ id: 'D3', stage: 'Análise de crédito', name: 'Aprovado na análise manual?', type: 'decision', nextYes: 'C1', nextNo: 'X1' }),
    A({ id: 'X1', stage: 'Análise de crédito', name: 'Pedido recusado', type: 'end' }),
    A({ id: 'C1', stage: 'Separação', name: 'Separar itens no estoque', duration: 35, people: 2, owner: 'Operador de estoque', lean: 'VA', wait: 60, minDuration: 20, maxDuration: 60, next: ['C2'] }),
    A({ id: 'C2', stage: 'Separação', name: 'Conferir itens separados', duration: 15, people: 1, owner: 'Conferente', lean: 'NNVA', leanReason: 'controle', minDuration: 10, maxDuration: 25, next: ['D4'] }),
    A({ id: 'D4', stage: 'Separação', name: 'Itens corretos?', type: 'decision', nextYes: 'C4', nextNo: 'C3' }),
    A({ id: 'C3', stage: 'Separação', name: 'Refazer separação', duration: 20, people: 1, owner: 'Operador de estoque', lean: 'W', rework: true, frequencyPct: 10, minDuration: 10, maxDuration: 40, next: ['C2'] }),
    A({ id: 'C4', stage: 'Separação', name: 'Embalar pedido', duration: 12, people: 1, owner: 'Operador de estoque', lean: 'VA', minDuration: 8, maxDuration: 20, next: ['E1'] }),
    A({ id: 'E1', stage: 'Expedição', name: 'Emitir nota fiscal', duration: 6, people: 1, owner: 'Faturista', lean: 'NNVA', leanReason: 'regulatorio', leanReasonNote: 'Emissão de nota fiscal obrigatória', wait: 90, minDuration: 4, maxDuration: 12, next: ['E2'] }),
    A({ id: 'E2', stage: 'Expedição', name: 'Agendar transporte', duration: 10, people: 1, owner: 'Analista de logística', lean: 'NNVA', wait: 240, minDuration: 5, maxDuration: 20, next: ['E3'] }),
    A({ id: 'E3', stage: 'Expedição', name: 'Despachar pedido', duration: 15, people: 2, owner: 'Operador de estoque', lean: 'VA', minDuration: 10, maxDuration: 30, next: ['F1'] }),
    A({ id: 'F1', stage: 'Expedição', name: 'Pedido despachado', type: 'end' }),
  ];
  p.stageOrder = ['Recebimento', 'Análise de crédito', 'Separação', 'Expedição'];
  return p;
}

/**
 * Cenário TO-BE ILUSTRATIVO do exemplo (fictício): mostra a comparação sem
 * exigir preenchimento. Todas as mudanças têm hipótese marcada "a validar".
 */
export function demoScenario(asIs: ProcessModel): Scenario {
  let sc = newScenario(asIs, 'Cenário ilustrativo (exemplo)');
  const meta = (justification: string, hypothesis: string, recId?: string) => ({ justification, hypothesis, validator: 'Gerente de operações (exemplo)', recId });
  sc = updateActivity(sc, 'B2', { wait: 120 }, 'reduce_wait', meta('Fila longa antes da análise manual.', 'SLA de 2 h para a análise manual é viável com a equipe atual.', 'R4:B2'))!;
  sc = updateActivity(sc, 'A1', { duration: 4, minDuration: 3, maxDuration: 8 }, 'automate', meta('Digitação repetitiva do pedido.', 'Integração com o portal reduz o registro para 4 min (conferência humana mantida).', 'R5:A1'))!;
  sc = updateActivity(sc, 'C3', { frequencyPct: 5 }, 'reduce_rework', meta('Erros de separação geram retrabalho.', 'Leitor de código de barras reduz o retrabalho de 10% para 5%.', 'R2:C3'))!;
  sc = updateActivity(sc, 'E2', { owner: 'Faturista' }, 'edit', meta('Transporte agendado junto com a emissão da nota, sem troca de responsável.', 'O faturista absorve o agendamento sem aumentar a fila da nota fiscal.'))!;
  sc.investment = 25000;
  sc.recurringCostPerMonth = 800;
  sc.horizonMonths = 12;
  sc.assumptions = [
    { id: 'as_demo1', text: 'Portal de pedidos já disponível para integração (exemplo).', status: 'a_validar' },
    { id: 'as_demo2', text: 'Custo-hora por função informado pela área (exemplo).', status: 'a_validar' },
  ];
  return sc;
}

const DEMO_RECS: Record<string, string> = {
  'R4:B2': 'Reduzir a fila antes da análise manual (exemplo).',
  'R5:A1': 'Integrar o portal de pedidos ao sistema (exemplo).',
  'R2:C3': 'Usar leitor de código de barras na separação (exemplo).',
};

/** Projeto demonstrativo completo e coerente: AS-IS → recomendações aceitas → TO-BE → plano. */
export function demoWorkspace(today = new Date()): Workspace {
  const w = newWorkspace(demoProcess(), { kind: 'demo' }, true);
  const at = nowIso();
  for (const [id, note] of Object.entries(DEMO_RECS)) w.recDecisions[id] = { status: 'accepted', note, decidedAt: at };
  const sc = demoScenario(w.asIs);
  w.scenarios = [sc];
  w.activeScenarioId = sc.id;
  const due = (days: number) => new Date(today.getTime() + days * 864e5).toISOString().slice(0, 10);
  const change = (activityId: string) => sc.changes.find((c) => c.activityId === activityId);
  const act = (activityId: string, x: Omit<ActionItem, 'id' | 'createdAt' | 'origin'>): ActionItem => ({
    id: `act_demo_${activityId}`,
    createdAt: at,
    origin: { kind: 'change', ref: change(activityId)?.id },
    ...x,
  });
  w.actions = [
    act('B2', { description: 'Definir SLA de 2 h para a análise manual de crédito', owner: 'Analista financeiro', due: due(21), priority: 'alta', status: 'em_andamento', relatedProblem: 'Espera de 8 h antes da análise manual de crédito.', expectedValue: 'Espera da análise manual de 8 h para 2 h (estimado).', successIndicator: 'Espera média medida em amostra de 30 pedidos.', doneCriteria: 'SLA publicado e medido por 4 semanas.' }),
    act('A1', { description: 'Integrar o portal de pedidos ao sistema', owner: 'Atendente', due: due(60), priority: 'media', status: 'a_fazer', dependencies: 'Acesso à API do portal; apoio de TI.', relatedProblem: 'Registro manual do pedido, repetitivo e com volume alto.', expectedValue: 'Registro de 10 min para 4 min por pedido (estimado).', successIndicator: 'Tempo de registro por pedido.', doneCriteria: '90% dos pedidos registrados sem digitação.' }),
    act('C3', { description: 'Implantar leitor de código de barras na separação', owner: 'Operador de estoque', due: due(45), priority: 'media', status: 'a_fazer', relatedProblem: 'Retrabalho em 10% das separações.', expectedValue: 'Retrabalho de 10% para 5% (estimado).', successIndicator: '% de pedidos com separação refeita.', doneCriteria: 'Leitor em uso em todas as estações.' }),
    act('E2', { description: 'Transferir o agendamento de transporte para o faturista', owner: 'Faturista', due: due(30), priority: 'baixa', status: 'a_fazer', dependencies: 'Treinamento do faturista no sistema da transportadora.', relatedProblem: 'Troca de responsável entre nota fiscal e agendamento.', expectedValue: 'Uma troca de responsável a menos (estimado).', successIndicator: 'Tempo entre nota emitida e transporte agendado.', doneCriteria: 'Agendamento feito pelo faturista por 2 semanas.' }),
  ];
  w.history.push({ at, area: 'Exemplo', message: 'Recomendações aceitas, cenário TO-BE e plano de ação ilustrativos carregados.' });
  return w;
}
