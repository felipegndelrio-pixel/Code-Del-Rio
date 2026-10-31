// Indicadores do processo. Regras (documentadas em docs/CALCULOS.md):
// - Nada ausente vira zero: métricas sem dados retornam null com o motivo.
// - Soma das durações, esforço (pessoa-hora) e tempo decorrido são conceitos distintos.
// - Arredondamento só na apresentação.
import { buildGraph, longestPath, type ProcessGraph } from './graph';
import type { Activity, BottleneckCriterion, LeanClass, ProcessModel } from './types';
import { isNum, isPos, periodToMonthFactor, safeDiv, toHours } from './units';

import { lazyLabels, tr } from '../i18n';
export interface Coverage {
  used: number;
  total: number;
  /** IDs das atividades sem o dado necessário. */
  missing: string[];
}

export interface ActivityMetrics {
  id: string;
  activeH: number | null;
  waitH: number | null;
  /** Pessoa-hora por ocorrência da atividade. */
  effortH: number | null;
  /** Peso por execução do processo (frequência). */
  weight: number;
  weightSource: 'frequencia' | 'volume_atividade' | 'premissa_100';
  /** Ocorrências da atividade no período do processo. */
  execPerPeriod: number | null;
  effortPeriodH: number | null;
  costPerHour: number | null;
  costPerHourSource: 'atividade' | 'funcao' | 'padrao' | null;
  laborCostPeriod: number | null;
  variableCostPeriod: number | null;
}

export interface GroupMetrics {
  key: string;
  count: number;
  activeH: number;
  waitH: number;
  effortExecH: number;
  effortPeriodH: number | null;
  costPeriod: number | null;
  lean: Record<LeanClass | 'U', number>;
}

export type ElapsedResult =
  | { status: 'ok'; hours: number; path: string[]; basis: 'sequencia_unica' | 'caminho_mais_longo'; waitsMissing: number; includesWait: boolean }
  | { status: 'nao_calculado'; reasons: string[] };

export interface ProcessMetrics {
  graph: ProcessGraph;
  per: Map<string, ActivityMetrics>;
  workItems: Activity[];
  counts: { total: number; tasks: number; decisions: number; classified: number; unclassified: number; rework: number; critical: number; loops: number };
  activeSumH: { value: number | null; coverage: Coverage };
  waitSumH: { value: number | null; coverage: Coverage };
  effortExecH: { value: number | null; coverage: Coverage };
  effortPeriodH: { value: number | null; coverage: Coverage; reason?: string };
  laborCostPeriod: { value: number | null; coverage: Coverage; reason?: string };
  variableCostPeriod: { value: number | null; coverage: Coverage };
  totalCostPeriod: { value: number | null; reason?: string; overlapNote?: string };
  monthFactor: number | null;
  lean: { hours: Record<LeanClass | 'U', number>; counts: Record<LeanClass | 'U', number>; classifiedHours: number; pct: Record<LeanClass, number | null> };
  byStage: GroupMetrics[];
  byOwner: GroupMetrics[];
  elapsed: ElapsedResult;
  rework: { activities: string[]; effortPeriodH: number | null; effortPerOccurrenceH: number | null; missingFrequency: string[] };
  assumptions: string[];
}

const LEAN_KEYS: (LeanClass | 'U')[] = ['VA', 'NNVA', 'W', 'U'];
const emptyLean = () => ({ VA: 0, NNVA: 0, W: 0, U: 0 });

export function isWork(a: Activity) {
  return a.type === 'task' || a.type === 'decision';
}

export function activityMetrics(p: ProcessModel, a: Activity): ActivityMetrics {
  const activeH = isNum(a.duration) && a.duration >= 0 ? toHours(a.duration, a.unit, p.hoursPerDay) : null;
  const waitH = isNum(a.wait) && a.wait >= 0 ? toHours(a.wait, a.unit, p.hoursPerDay) : null;
  const effortH = activeH !== null && isNum(a.people) && a.people >= 0 ? activeH * a.people : null;

  let weight = 1;
  let weightSource: ActivityMetrics['weightSource'] = 'premissa_100';
  if (isNum(a.frequencyPct) && a.frequencyPct >= 0) {
    weight = a.frequencyPct / 100;
    weightSource = 'frequencia';
  } else if (isNum(a.volume) && a.volume >= 0 && isPos(p.volume)) {
    weight = a.volume / p.volume;
    weightSource = 'volume_atividade';
  }
  let execPerPeriod: number | null = null;
  if (isNum(a.volume) && a.volume >= 0 && weightSource !== 'frequencia') execPerPeriod = a.volume;
  else if (isNum(p.volume) && p.volume >= 0) execPerPeriod = p.volume * weight;

  const effortPeriodH = effortH !== null && execPerPeriod !== null ? effortH * execPerPeriod : null;

  let costPerHour: number | null = null;
  let costPerHourSource: ActivityMetrics['costPerHourSource'] = null;
  if (isNum(a.costPerHour) && a.costPerHour >= 0) {
    costPerHour = a.costPerHour;
    costPerHourSource = 'atividade';
  } else if (a.owner && isNum(p.costPerHourByRole[a.owner])) {
    costPerHour = p.costPerHourByRole[a.owner];
    costPerHourSource = 'funcao';
  } else if (isNum(p.defaultCostPerHour) && p.defaultCostPerHour >= 0) {
    costPerHour = p.defaultCostPerHour;
    costPerHourSource = 'padrao';
  }
  const laborCostPeriod = effortPeriodH !== null && costPerHour !== null ? effortPeriodH * costPerHour : null;
  const variableCostPeriod = isNum(a.variableCost) && a.variableCost >= 0 && execPerPeriod !== null ? a.variableCost * execPerPeriod : null;
  return { id: a.id, activeH, waitH, effortH, weight, weightSource, execPerPeriod, effortPeriodH, costPerHour, costPerHourSource, laborCostPeriod, variableCostPeriod };
}

function sumBy(items: Activity[], f: (a: Activity) => number | null): { value: number | null; coverage: Coverage } {
  let total = 0;
  let used = 0;
  const missing: string[] = [];
  for (const a of items) {
    const v = f(a);
    if (v === null) missing.push(a.id);
    else {
      total += v;
      used++;
    }
  }
  return { value: used ? total : null, coverage: { used, total: items.length, missing } };
}

function group(p: ProcessModel, items: Activity[], per: Map<string, ActivityMetrics>, keyOf: (a: Activity) => string, order?: string[]): GroupMetrics[] {
  const map = new Map<string, GroupMetrics>();
  const costKnown = new Map<string, boolean>();
  const effortKnown = new Map<string, boolean>();
  for (const k of order ?? []) map.set(k, { key: k, count: 0, activeH: 0, waitH: 0, effortExecH: 0, effortPeriodH: 0, costPeriod: 0, lean: emptyLean() });
  for (const a of items) {
    const k = keyOf(a);
    if (!map.has(k)) map.set(k, { key: k, count: 0, activeH: 0, waitH: 0, effortExecH: 0, effortPeriodH: 0, costPeriod: 0, lean: emptyLean() });
    const g = map.get(k)!;
    const m = per.get(a.id)!;
    g.count++;
    g.activeH += m.activeH ?? 0;
    g.waitH += m.waitH ?? 0;
    g.effortExecH += (m.effortH ?? 0) * m.weight;
    if (m.effortPeriodH !== null) {
      g.effortPeriodH = (g.effortPeriodH ?? 0) + m.effortPeriodH;
      effortKnown.set(k, true);
    }
    const c = costOf(p, m);
    if (c !== null) {
      g.costPeriod = (g.costPeriod ?? 0) + c;
      costKnown.set(k, true);
    }
    g.lean[a.lean ?? 'U'] += m.activeH ?? 0;
  }
  for (const g of map.values()) {
    if (!effortKnown.get(g.key)) g.effortPeriodH = null;
    if (!costKnown.get(g.key)) g.costPeriod = null;
  }
  return [...map.values()];
}

/** Custo comparável de uma atividade no período, respeitando a regra de sobreposição. */
export function costOf(p: ProcessModel, m: ActivityMetrics): number | null {
  if (p.variableCostIncludesLabor) return m.variableCostPeriod ?? m.laborCostPeriod;
  if (m.laborCostPeriod === null && m.variableCostPeriod === null) return null;
  return (m.laborCostPeriod ?? 0) + (m.variableCostPeriod ?? 0);
}

export function computeMetrics(p: ProcessModel): ProcessMetrics {
  const graph = buildGraph(p);
  const acts = [...graph.byId.values()];
  const per = new Map(acts.map((a) => [a.id, activityMetrics(p, a)]));
  const work = acts.filter(isWork);
  const assumptions: string[] = [];
  const hasDays = work.some((a) => a.unit === 'd');
  if (hasDays) assumptions.push(tr('d.metrics.001', { hoursPerDay: p.hoursPerDay }));

  // Decisões sem duração são pontos de roteamento (contam 0, por regra) e não entram na
  // cobertura; decisões com duração informada (tempo para decidir) entram normalmente.
  const timed = work.filter((a) => a.type === 'task' || isNum(a.duration));
  const activeSumH = sumBy(timed, (a) => per.get(a.id)!.activeH);
  const waitSumH = sumBy(timed, (a) => per.get(a.id)!.waitH);
  const effortExecH = sumBy(timed, (a) => {
    const m = per.get(a.id)!;
    return m.effortH === null ? null : m.effortH * m.weight;
  });
  const assumed100 = timed.filter((a) => per.get(a.id)!.weightSource === 'premissa_100');
  if (work.length && assumed100.length && (graphHasBranches(graph) || work.some((a) => a.rework))) {
    assumptions.push(
      tr('d.metrics.002', { length: assumed100.length }),
    );
  }

  const effortPeriodH = sumBy(timed, (a) => per.get(a.id)!.effortPeriodH);
  const effortPeriodReason = !isNum(p.volume) && !work.some((a) => isNum(a.volume)) ? tr('d.metrics.003') : effortPeriodH.value === null ? tr('d.metrics.004') : undefined;

  const withEffortPeriod = timed.filter((a) => per.get(a.id)!.effortPeriodH !== null);
  const laborCostPeriod = sumBy(withEffortPeriod, (a) => per.get(a.id)!.laborCostPeriod);
  const laborReason = !withEffortPeriod.length ? effortPeriodReason ?? tr('d.metrics.005') : laborCostPeriod.value === null ? tr('d.metrics.006') : undefined;
  const withVarCost = work.filter((a) => isNum(a.variableCost));
  const variableCostPeriod = sumBy(withVarCost, (a) => per.get(a.id)!.variableCostPeriod);

  let totalCostPeriod: ProcessMetrics['totalCostPeriod'];
  if (p.variableCostIncludesLabor) {
    totalCostPeriod = {
      value: variableCostPeriod.value ?? laborCostPeriod.value,
      overlapNote: tr('d.metrics.007'),
      reason: variableCostPeriod.value === null && laborCostPeriod.value === null ? laborReason : undefined,
    };
  } else if (laborCostPeriod.value === null && variableCostPeriod.value === null) {
    totalCostPeriod = { value: null, reason: laborReason ?? tr('d.metrics.008') };
  } else {
    totalCostPeriod = { value: (laborCostPeriod.value ?? 0) + (variableCostPeriod.value ?? 0) };
  }
  if (laborCostPeriod.value !== null && laborCostPeriod.coverage.missing.length)
    assumptions.push(tr('d.metrics.009', { length: laborCostPeriod.coverage.missing.length }));

  // Lean — base: duração ativa (não quantidade de atividades).
  const leanHours = emptyLean();
  const leanCounts = emptyLean();
  const leanItems = work.filter((a) => a.type === 'task' || a.lean);
  for (const a of leanItems) {
    const k = a.lean ?? 'U';
    leanCounts[k]++;
    leanHours[k] += per.get(a.id)!.activeH ?? 0;
  }
  const classifiedHours = leanHours.VA + leanHours.NNVA + leanHours.W;
  const pct = {
    VA: pctOf(leanHours.VA, classifiedHours),
    NNVA: pctOf(leanHours.NNVA, classifiedHours),
    W: pctOf(leanHours.W, classifiedHours),
  };

  const byStage = group(p, work, per, (a) => a.stage || tr('d.metrics.010'), p.stageOrder).filter((g) => g.count > 0);
  const byOwner = group(p, work, per, (a) => a.owner?.trim() || tr('d.metrics.011')).sort((x, y) => y.effortExecH - x.effortExecH);

  const elapsed = computeElapsed(p, graph, per);
  if (elapsed.status === 'ok' && elapsed.waitsMissing > 0)
    assumptions.push(tr('d.metrics.012', { waitsMissing: elapsed.waitsMissing }));

  const reworkActs = work.filter((a) => a.rework);
  const missingFrequency = reworkActs.filter((a) => per.get(a.id)!.weightSource === 'premissa_100').map((a) => a.id);
  const reworkPeriod = sumBy(
    reworkActs.filter((a) => !missingFrequency.includes(a.id)),
    (a) => per.get(a.id)!.effortPeriodH,
  );
  const reworkOcc = sumBy(reworkActs, (a) => per.get(a.id)!.effortH);

  return {
    graph,
    per,
    workItems: work,
    counts: {
      total: acts.length,
      tasks: work.filter((a) => a.type === 'task').length,
      decisions: work.filter((a) => a.type === 'decision').length,
      classified: leanItems.filter((a) => a.lean).length,
      unclassified: leanItems.filter((a) => !a.lean).length,
      rework: reworkActs.length,
      critical: work.filter((a) => a.critical).length,
      loops: graph.backEdges.length,
    },
    activeSumH,
    waitSumH,
    effortExecH,
    effortPeriodH: { ...effortPeriodH, reason: effortPeriodH.value === null ? effortPeriodReason : undefined },
    laborCostPeriod: { ...laborCostPeriod, reason: laborCostPeriod.value === null ? laborReason : undefined },
    variableCostPeriod,
    totalCostPeriod,
    monthFactor: periodToMonthFactor(p),
    lean: { hours: leanHours, counts: leanCounts, classifiedHours, pct },
    byStage,
    byOwner,
    elapsed,
    rework: { activities: reworkActs.map((a) => a.id), effortPeriodH: reworkPeriod.value, effortPerOccurrenceH: reworkOcc.value, missingFrequency },
    assumptions,
  };
}

function graphHasBranches(g: ProcessGraph) {
  return g.hasDecision || g.backEdges.length > 0;
}

function pctOf(part: number, total: number): number | null {
  const r = safeDiv(part, total);
  return r === null ? null : r * 100;
}

function computeElapsed(p: ProcessModel, g: ProcessGraph, per: Map<string, ActivityMetrics>): ElapsedResult {
  const reasons: string[] = [];
  if (!g.byId.size) return { status: 'nao_calculado', reasons: [tr('d.metrics.013')] };
  if (g.dangling.length) reasons.push(tr('d.metrics.014', { length: g.dangling.length }));
  if (g.unreachable.length) reasons.push(tr('d.metrics.015', { length: g.unreachable.length }));
  const missingDur = [...g.byId.values()].filter((a) => a.type === 'task' && per.get(a.id)!.activeH === null);
  if (missingDur.length) reasons.push(tr('d.metrics.016', { length: missingDur.length }));
  if (reasons.length) return { status: 'nao_calculado', reasons };

  // Regra explícita: início, fim e decisões sem duração contam 0 (pontos de roteamento).
  // Espera ausente não é somada (sinalizado em premissas).
  const anyWait = [...g.byId.values()].some((a) => isNum(a.wait));
  const lp = longestPath(g, (a) => (per.get(a.id)!.activeH ?? 0) + (per.get(a.id)!.waitH ?? 0));
  const waitsMissing = anyWait ? lp.path.filter((id) => isWork(g.byId.get(id)!) && per.get(id)!.waitH === null).length : 0;
  const single = !g.hasDecision && !g.hasParallel && g.backEdges.length === 0;
  void p;
  return { status: 'ok', hours: lp.total, path: lp.path, basis: single ? 'sequencia_unica' : 'caminho_mais_longo', waitsMissing, includesWait: anyWait };
}

// ---------------------------------------------------------------------------
// Gargalos e Pareto

export const CRITERION_LABEL: Record<BottleneckCriterion, string> = lazyLabels({
  duration: 'd.crit.duration',
  effort: 'd.crit.effort',
  cost: 'd.crit.cost',
  wait: 'd.crit.wait',
  rework: 'd.crit.rework',
});

export interface RankedItem {
  id: string;
  value: number;
  share: number;
  cumulative: number;
}

export function criterionValue(p: ProcessModel, m: ProcessMetrics, a: Activity, c: BottleneckCriterion): number | null {
  const x = m.per.get(a.id)!;
  switch (c) {
    case 'duration':
      return x.activeH;
    case 'effort':
      // Com volume, compara no período; sem volume, por execução (nunca mistura bases).
      if (m.effortPeriodH.value !== null) return x.effortPeriodH;
      return x.effortH === null ? null : x.effortH * x.weight;
    case 'cost':
      return costOf(p, x);
    case 'wait':
      return x.waitH;
    case 'rework':
      return a.rework ? (x.effortPeriodH ?? x.effortH) : null;
  }
}

export function pareto(p: ProcessModel, m: ProcessMetrics, c: BottleneckCriterion): { items: RankedItem[]; total: number | null; reason?: string } {
  const vals = m.workItems
    .map((a) => ({ id: a.id, value: criterionValue(p, m, a, c) }))
    .filter((x): x is { id: string; value: number } => x.value !== null && x.value > 0)
    .sort((a, b) => b.value - a.value);
  const total = vals.reduce((s, x) => s + x.value, 0);
  if (!vals.length || total <= 0) {
    const reason =
      c === 'cost'
        ? tr('d.metrics.017')
        : c === 'effort'
          ? tr('d.metrics.018')
          : c === 'wait'
            ? tr('d.metrics.019')
            : c === 'rework'
              ? tr('d.metrics.020')
              : tr('d.metrics.021');
    return { items: [], total: null, reason };
  }
  let cum = 0;
  return {
    total,
    items: vals.map((x) => {
      cum += x.value;
      return { id: x.id, value: x.value, share: (x.value / total) * 100, cumulative: (cum / total) * 100 };
    }),
  };
}

/**
 * Gargalos: atividades cuja participação no critério é ≥ limiar (%), no máximo 5.
 * É uma regra de concentração — não prova causa-raiz.
 */
export function bottlenecks(p: ProcessModel, m: ProcessMetrics, c: BottleneckCriterion, thresholdPct: number) {
  const pr = pareto(p, m, c);
  return { ...pr, flagged: pr.items.filter((x) => x.share >= thresholdPct).slice(0, 5) };
}

export interface DataGap {
  field: string;
  label: string;
  missing: number;
  total: number;
  unlocks: string;
}

export function dataGaps(p: ProcessModel, m: ProcessMetrics): DataGap[] {
  const w = m.workItems;
  const tasks = w.filter((a) => a.type === 'task');
  const gaps: DataGap[] = [
    { field: 'duracao', label: tr('d.metrics.022'), missing: tasks.filter((a) => !isNum(a.duration)).length, total: tasks.length, unlocks: tr('d.metrics.023') },
    { field: 'quantidade_pessoas', label: tr('d.metrics.024'), missing: tasks.filter((a) => !isNum(a.people)).length, total: tasks.length, unlocks: tr('d.metrics.025') },
    { field: 'responsavel', label: tr('d.metrics.026'), missing: tasks.filter((a) => !a.owner?.trim()).length, total: tasks.length, unlocks: tr('d.metrics.027') },
    { field: 'classificacao_lean', label: tr('d.metrics.028'), missing: tasks.filter((a) => !a.lean).length, total: tasks.length, unlocks: tr('d.metrics.029') },
    { field: 'tempo_espera', label: tr('d.metrics.030'), missing: tasks.filter((a) => !isNum(a.wait)).length, total: tasks.length, unlocks: tr('d.metrics.031') },
    { field: 'duracao_minima/maxima', label: tr('d.metrics.032'), missing: tasks.filter((a) => !isNum(a.minDuration) || !isNum(a.maxDuration)).length, total: tasks.length, unlocks: tr('d.metrics.033') },
  ];
  if (!isNum(p.volume) && !w.some((a) => isNum(a.volume)))
    gaps.push({ field: 'volume', label: tr('d.metrics.034'), missing: 1, total: 1, unlocks: tr('d.metrics.035') });
  const noCost = tasks.filter((a) => m.per.get(a.id)!.costPerHour === null).length;
  gaps.push({ field: 'custo_hora', label: tr('d.metrics.036'), missing: noCost, total: tasks.length, unlocks: tr('d.metrics.037') });
  if (p.volumePeriod === 'dia' && !isPos(p.operatingDaysPerMonth))
    gaps.push({ field: 'dias_operacao_mes', label: tr('d.metrics.038'), missing: 1, total: 1, unlocks: tr('d.metrics.039') });
  return gaps.filter((g) => g.missing > 0);
}

export function leanKeys() {
  return LEAN_KEYS;
}
