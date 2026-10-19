// Criação de objetos do domínio com valores padrão explícitos.
import type { Activity, ProcessModel, Scenario, Workspace } from './types';
import { nowIso, uid } from './units';

export function newProcess(name = 'Novo processo'): ProcessModel {
  return { name, volumePeriod: 'mes', hoursPerDay: 8, costPerHourByRole: {}, stageOrder: [], activities: [] };
}

export function newActivity(partial: Partial<Activity> & Pick<Activity, 'id' | 'stage' | 'name'>): Activity {
  return { type: 'task', order: 0, unit: 'min', next: [], ...partial };
}

export function newWorkspace(asIs: ProcessModel, source: Workspace['source'], isDemo = false): Workspace {
  const at = nowIso();
  return {
    id: uid('w_'),
    schemaVersion: 1,
    isDemo,
    createdAt: at,
    updatedAt: at,
    source,
    asIs: structuredClone(asIs),
    asIsBaseline: structuredClone(asIs),
    visited: {},
    bottleneck: { criterion: 'duration', thresholdPct: 15 },
    recDecisions: {},
    scenarios: [],
    actions: [],
    results: [],
    risks: [],
    raci: { roles: [], cells: {}, suggested: {} },
    automation: {},
    history: [{ at, area: 'Processo', message: source.kind === 'import' ? `Importado de ${source.fileName ?? 'planilha'}` : source.kind === 'demo' ? 'Exemplo demonstrativo aberto' : 'Processo criado' }],
    snapshots: [],
  };
}

/** Cria um cenário TO-BE como cópia independente do AS-IS atual. */
export function newScenario(asIs: ProcessModel, name: string): Scenario {
  const at = nowIso();
  return {
    id: uid('s_'),
    name,
    createdAt: at,
    updatedAt: at,
    process: structuredClone(asIs),
    changes: [],
    horizonMonths: 12,
    assumptions: [],
  };
}

/** Garante que stageOrder contenha todas as etapas usadas, na ordem de aparição. */
export function normalizeStages(p: ProcessModel): ProcessModel {
  const used: string[] = [];
  for (const a of [...p.activities].sort((x, y) => x.order - y.order)) if (a.stage && !used.includes(a.stage)) used.push(a.stage);
  const order = p.stageOrder.filter((s) => used.includes(s));
  for (const s of used) if (!order.includes(s)) order.push(s);
  return { ...p, stageOrder: order };
}

export function nextActivityId(p: ProcessModel): string {
  const nums = p.activities.map((a) => /^A(\d+)$/.exec(a.id)?.[1]).filter(Boolean).map(Number);
  let n = (nums.length ? Math.max(...nums) : 0) + 1;
  while (p.activities.some((a) => a.id === `A${n}`)) n++;
  return `A${n}`;
}
