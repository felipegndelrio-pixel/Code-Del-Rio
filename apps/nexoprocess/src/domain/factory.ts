// Criação de objetos do domínio com valores padrão explícitos.
import type { Activity, Assumption, ChangeEntry, ProcessModel, Scenario, Workspace } from './types';
import { nowIso, uid } from './units';

import { tr } from '../i18n';
export function newProcess(name = tr('d.factory.001')): ProcessModel {
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
    history: [{ at, area: tr('d.factory.002'), message: source.kind === 'import' ? tr('d.factory.003', { p0: source.fileName ?? 'planilha' }) : source.kind === 'demo' ? tr('d.factory.004') : tr('d.factory.005') }],
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

/**
 * Completa um projeto lido de backup ou de versões anteriores: campos ausentes
 * recebem os mesmos valores padrão de um projeto novo. Lança erro apenas quando
 * falta o que não há como inventar (identificador e processo AS-IS).
 */
export function normalizeWorkspace(raw: unknown): Workspace {
  const r = (raw ?? {}) as Partial<Workspace> & Record<string, unknown>;
  if (typeof r.id !== 'string' || !r.id) throw new Error(tr('d.fac.noId'));
  const asIs = normalizeProcess(r.asIs);
  if (!asIs) throw new Error(tr('d.fac.noAsIs', { id: r.id }));
  const at = nowIso();
  const base = newWorkspace(asIs, { kind: 'backup' });
  const arr = <T,>(v: unknown): T[] => (Array.isArray(v) ? (v as T[]) : []);
  const obj = <T extends object>(v: unknown, fallback: T): T => (v && typeof v === 'object' && !Array.isArray(v) ? (v as T) : fallback);
  const scenarios = arr<Scenario>(r.scenarios)
    .filter((sc) => sc && typeof sc === 'object' && typeof sc.id === 'string')
    .map((sc) => ({
      ...sc,
      process: normalizeProcess(sc.process) ?? structuredClone(asIs),
      changes: arr<ChangeEntry>(sc.changes),
      assumptions: arr<Assumption>(sc.assumptions),
      horizonMonths: typeof sc.horizonMonths === 'number' && sc.horizonMonths > 0 ? sc.horizonMonths : 12,
    }));
  return {
    ...base,
    id: r.id,
    isDemo: r.isDemo === true,
    createdAt: typeof r.createdAt === 'string' ? r.createdAt : at,
    updatedAt: typeof r.updatedAt === 'string' ? r.updatedAt : at,
    source: obj(r.source, { kind: 'backup' as const }),
    asIs,
    asIsBaseline: normalizeProcess(r.asIsBaseline) ?? structuredClone(asIs),
    validationAcceptedAt: typeof r.validationAcceptedAt === 'string' ? r.validationAcceptedAt : undefined,
    visited: obj(r.visited, {}),
    bottleneck: obj(r.bottleneck, base.bottleneck),
    recDecisions: obj(r.recDecisions, {}),
    scenarios,
    activeScenarioId: scenarios.some((sc) => sc.id === r.activeScenarioId) ? r.activeScenarioId : scenarios[0]?.id,
    actions: arr(r.actions),
    results: arr(r.results),
    risks: arr(r.risks),
    raci: obj(r.raci, base.raci),
    automation: obj(r.automation, {}),
    history: arr<Workspace['history'][number]>(r.history),
    snapshots: arr(r.snapshots),
  };
}

function normalizeProcess(v: unknown): ProcessModel | undefined {
  if (!v || typeof v !== 'object') return undefined;
  const p = v as Partial<ProcessModel>;
  if (!Array.isArray(p.activities)) return undefined;
  return {
    ...newProcess(typeof p.name === 'string' ? p.name : tr('d.factory.002')),
    ...p,
    activities: p.activities.filter((a): a is Activity => !!a && typeof a === 'object' && typeof a.id === 'string' && typeof a.name === 'string').map((a) => ({ ...a, next: Array.isArray(a.next) ? a.next : [] })),
    stageOrder: Array.isArray(p.stageOrder) ? p.stageOrder : [],
    costPerHourByRole: p.costPerHourByRole && typeof p.costPerHourByRole === 'object' ? p.costPerHourByRole : {},
    volumePeriod: p.volumePeriod ?? 'mes',
    hoursPerDay: typeof p.hoursPerDay === 'number' && p.hoursPerDay > 0 ? p.hoursPerDay : 8,
  };
}
