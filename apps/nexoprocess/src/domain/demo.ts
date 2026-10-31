// Processo demonstrativo FICTÍCIO. Os números são ilustrativos, não
// representam nenhuma empresa real e ficam isolados (workspace.isDemo = true).
import { newActivity, newProcess, newScenario, newWorkspace } from './factory';
import { updateActivity } from './tobe';
import type { ActionItem, Activity, ProcessModel, Scenario, Workspace } from './types';
import { nowIso } from './units';

import { tr } from '../i18n';
export const demoName = (): string => tr('d.demo.name');

export function demoProcess(): ProcessModel {
  const p = newProcess(demoName());
  p.description = tr('d.demo.001');
  p.area = tr('d.demo.002');
  p.processOwner = tr('d.demo.003');
  p.volume = 1200;
  p.volumePeriod = 'mes';
  p.hoursPerDay = 8;
  p.costPerHourByRole = {
    [tr('d.demo.008')]: 45,
    [tr('d.demo.020')]: 70,
    [tr('d.demo.034')]: 38,
    [tr('d.demo.037')]: 40,
    [tr('d.demo.048')]: 50,
    [tr('d.demo.052')]: 60,
  };
  let order = 0;
  const A = (x: Partial<Activity> & Pick<Activity, 'id' | 'stage' | 'name'>) => newActivity({ order: ++order, ...x });
  p.activities = [
    A({ id: 'S0', stage: tr('d.demo.004'), name: tr('d.demo.005'), type: 'start', next: ['A1'] }),
    A({ id: 'A1', stage: tr('d.demo.004'), name: tr('d.demo.007'), duration: 10, people: 1, owner: tr('d.demo.008'), lean: 'NNVA', wait: 30, minDuration: 6, maxDuration: 20, next: ['A2'] }),
    A({ id: 'A2', stage: tr('d.demo.004'), name: tr('d.demo.010'), duration: 8, people: 1, owner: tr('d.demo.008'), lean: 'NNVA', leanReason: 'controle', minDuration: 5, maxDuration: 15, next: ['D1'] }),
    A({ id: 'D1', stage: tr('d.demo.004'), name: tr('d.demo.013'), type: 'decision', nextYes: 'B1', nextNo: 'A3' }),
    A({ id: 'A3', stage: tr('d.demo.004'), name: tr('d.demo.015'), duration: 15, people: 1, owner: tr('d.demo.008'), lean: 'W', rework: true, frequencyPct: 20, wait: 240, minDuration: 10, maxDuration: 30, next: ['A2'], notes: tr('d.demo.017') }),
    A({ id: 'B1', stage: tr('d.demo.018'), name: tr('d.demo.019'), duration: 12, people: 1, owner: tr('d.demo.020'), lean: 'NNVA', leanReason: 'controle', leanReasonNote: tr('d.demo.021'), wait: 120, minDuration: 8, maxDuration: 25, next: ['D2'], critical: true }),
    A({ id: 'D2', stage: tr('d.demo.018'), name: tr('d.demo.023'), type: 'decision', nextYes: 'C1', nextNo: 'B2' }),
    A({ id: 'B2', stage: tr('d.demo.018'), name: tr('d.demo.025'), duration: 45, people: 2, owner: tr('d.demo.020'), lean: 'NNVA', leanReason: 'controle', leanReasonNote: tr('d.demo.021'), frequencyPct: 15, wait: 480, minDuration: 30, maxDuration: 90, next: ['D3'], critical: true }),
    A({ id: 'D3', stage: tr('d.demo.018'), name: tr('d.demo.029'), type: 'decision', nextYes: 'C1', nextNo: 'X1' }),
    A({ id: 'X1', stage: tr('d.demo.018'), name: tr('d.demo.031'), type: 'end' }),
    A({ id: 'C1', stage: tr('d.demo.032'), name: tr('d.demo.033'), duration: 35, people: 2, owner: tr('d.demo.034'), lean: 'VA', wait: 60, minDuration: 20, maxDuration: 60, next: ['C2'] }),
    A({ id: 'C2', stage: tr('d.demo.032'), name: tr('d.demo.036'), duration: 15, people: 1, owner: tr('d.demo.037'), lean: 'NNVA', leanReason: 'controle', minDuration: 10, maxDuration: 25, next: ['D4'] }),
    A({ id: 'D4', stage: tr('d.demo.032'), name: tr('d.demo.039'), type: 'decision', nextYes: 'C4', nextNo: 'C3' }),
    A({ id: 'C3', stage: tr('d.demo.032'), name: tr('d.demo.041'), duration: 20, people: 1, owner: tr('d.demo.034'), lean: 'W', rework: true, frequencyPct: 10, minDuration: 10, maxDuration: 40, next: ['C2'] }),
    A({ id: 'C4', stage: tr('d.demo.032'), name: tr('d.demo.044'), duration: 12, people: 1, owner: tr('d.demo.034'), lean: 'VA', minDuration: 8, maxDuration: 20, next: ['E1'] }),
    A({ id: 'E1', stage: tr('d.demo.046'), name: tr('d.demo.047'), duration: 6, people: 1, owner: tr('d.demo.048'), lean: 'NNVA', leanReason: 'regulatorio', leanReasonNote: tr('d.demo.049'), wait: 90, minDuration: 4, maxDuration: 12, next: ['E2'] }),
    A({ id: 'E2', stage: tr('d.demo.046'), name: tr('d.demo.051'), duration: 10, people: 1, owner: tr('d.demo.052'), lean: 'NNVA', wait: 240, minDuration: 5, maxDuration: 20, next: ['E3'] }),
    A({ id: 'E3', stage: tr('d.demo.046'), name: tr('d.demo.054'), duration: 15, people: 2, owner: tr('d.demo.034'), lean: 'VA', minDuration: 10, maxDuration: 30, next: ['F1'] }),
    A({ id: 'F1', stage: tr('d.demo.046'), name: tr('d.demo.057'), type: 'end' }),
  ];
  p.stageOrder = [tr('d.demo.004'), tr('d.demo.018'), tr('d.demo.032'), tr('d.demo.046')];
  return p;
}

/**
 * Cenário TO-BE ILUSTRATIVO do exemplo (fictício): mostra a comparação sem
 * exigir preenchimento. Todas as mudanças têm hipótese marcada "a validar".
 */
export function demoScenario(asIs: ProcessModel): Scenario {
  let sc = newScenario(asIs, tr('d.demo.062'));
  const meta = (justification: string, hypothesis: string, recId?: string) => ({ justification, hypothesis, validator: tr('d.demo.003'), recId });
  sc = updateActivity(sc, 'B2', { wait: 120 }, 'reduce_wait', meta(tr('d.demo.064'), tr('d.demo.065'), 'R4:B2'))!;
  sc = updateActivity(sc, 'A1', { duration: 4, minDuration: 3, maxDuration: 8 }, 'automate', meta(tr('d.demo.066'), tr('d.demo.067'), 'R5:A1'))!;
  sc = updateActivity(sc, 'C3', { frequencyPct: 5 }, 'reduce_rework', meta(tr('d.demo.068'), tr('d.demo.069'), 'R2:C3'))!;
  sc = updateActivity(sc, 'E2', { owner: tr('d.demo.048') }, 'edit', meta(tr('d.demo.071'), tr('d.demo.072')))!;
  sc.investment = 25000;
  sc.recurringCostPerMonth = 800;
  sc.horizonMonths = 12;
  sc.assumptions = [
    { id: 'as_demo1', text: tr('d.demo.073'), status: 'a_validar' },
    { id: 'as_demo2', text: tr('d.demo.074'), status: 'a_validar' },
  ];
  return sc;
}

const demoRecs = (): Record<string, string> => ({
  'R4:B2': tr('d.demo.rec1'),
  'R5:A1': tr('d.demo.rec2'),
  'R2:C3': tr('d.demo.rec3'),
});

/** Projeto demonstrativo completo e coerente: AS-IS → recomendações aceitas → TO-BE → plano. */
export function demoWorkspace(today = new Date()): Workspace {
  const w = newWorkspace(demoProcess(), { kind: 'demo' }, true);
  const at = nowIso();
  for (const [id, note] of Object.entries(demoRecs())) w.recDecisions[id] = { status: 'accepted', note, decidedAt: at };
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
    act('B2', { description: tr('d.demo.075'), owner: tr('d.demo.020'), due: due(21), priority: 'alta', status: 'em_andamento', relatedProblem: tr('d.demo.077'), expectedValue: tr('d.demo.078'), successIndicator: tr('d.demo.079'), doneCriteria: tr('d.demo.080') }),
    act('A1', { description: tr('d.demo.081'), owner: tr('d.demo.008'), due: due(60), priority: 'media', status: 'a_fazer', dependencies: tr('d.demo.083'), relatedProblem: tr('d.demo.084'), expectedValue: tr('d.demo.085'), successIndicator: tr('d.demo.086'), doneCriteria: tr('d.demo.087') }),
    act('C3', { description: tr('d.demo.088'), owner: tr('d.demo.034'), due: due(45), priority: 'media', status: 'a_fazer', relatedProblem: tr('d.demo.090'), expectedValue: tr('d.demo.091'), successIndicator: tr('d.demo.092'), doneCriteria: tr('d.demo.093') }),
    act('E2', { description: tr('d.demo.094'), owner: tr('d.demo.048'), due: due(30), priority: 'baixa', status: 'a_fazer', dependencies: tr('d.demo.096'), relatedProblem: tr('d.demo.097'), expectedValue: tr('d.demo.098'), successIndicator: tr('d.demo.099'), doneCriteria: tr('d.demo.100') }),
  ];
  w.history.push({ at, area: tr('d.demo.101'), message: tr('d.demo.102') });
  return w;
}
