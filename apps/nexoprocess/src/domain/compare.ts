// Comparação AS-IS × TO-BE e business case. Tudo aqui é ESTIMATIVA
// condicionada a premissas; nada vira "economia realizada" automaticamente.
import { computeMetrics, costOf, isWork, type ProcessMetrics } from './metrics';
import type { ProcessModel, Scenario, Sensitivity } from './types';
import { isNum, reductionPct } from './units';

import { lazyLabels, tr, type MessageKey } from '../i18n';
export type Basis = 'informado' | 'calculado' | 'estimado' | 'a_validar' | 'realizado';

export interface Figures {
  metrics: ProcessMetrics;
  activeExecH: number | null;
  waitExecH: number | null;
  elapsedH: number | null;
  effortExecH: number | null;
  volumeMonth: number | null;
  effortMonthH: number | null;
  costMonth: number | null;
  costPerExec: number | null;
  activities: number;
  reworkMonthH: number | null;
  coverage: { duration: number; people: number; cost: number };
}

export function figures(p: ProcessModel): Figures {
  const m = computeMetrics(p);
  const f = m.monthFactor;
  const w = m.workItems;
  let active = 0;
  let activeN = 0;
  let wait = 0;
  let waitN = 0;
  for (const a of w) {
    const x = m.per.get(a.id)!;
    if (x.activeH !== null) {
      active += x.activeH * x.weight;
      activeN++;
    }
    if (x.waitH !== null) {
      wait += x.waitH * x.weight;
      waitN++;
    }
  }
  const volumeMonth = isNum(p.volume) && f !== null ? p.volume * f : null;
  const effortMonthH = m.effortPeriodH.value !== null && f !== null ? m.effortPeriodH.value * f : null;
  const costMonth = m.totalCostPeriod.value !== null && f !== null ? m.totalCostPeriod.value * f : null;
  const tasks = w.filter((a) => a.type === 'task');
  const share = (n: number) => (tasks.length ? n / tasks.length : 0);
  return {
    metrics: m,
    activeExecH: activeN ? active : null,
    waitExecH: waitN ? wait : null,
    elapsedH: m.elapsed.status === 'ok' ? m.elapsed.hours : null,
    effortExecH: m.effortExecH.value,
    volumeMonth,
    effortMonthH,
    costMonth,
    costPerExec: costMonth !== null && volumeMonth ? costMonth / volumeMonth : null,
    activities: tasks.length,
    reworkMonthH: m.rework.effortPeriodH !== null && f !== null ? m.rework.effortPeriodH * f : null,
    coverage: {
      duration: share(tasks.filter((a) => m.per.get(a.id)!.activeH !== null).length),
      people: share(tasks.filter((a) => m.per.get(a.id)!.effortH !== null).length),
      cost: share(tasks.filter((a) => costOf(p, m.per.get(a.id)!) !== null).length),
    },
  };
}

export interface CompareRow {
  key: string;
  label: string;
  unit: string;
  asIs: number | null;
  toBe: number | null;
  diff: number | null;
  reductionPct: number | null;
  basis: Basis;
  note?: string;
  /** true = menor é melhor */
  lowerIsBetter: boolean;
}

/** Rótulo exibido do nível de confiança (o valor interno continua sendo alta/média/baixa). */
export const CONFIDENCE_LABEL: Record<'baixa' | 'média' | 'alta', string> = lazyLabels({
  baixa: 'd.conf.baixa',
  média: 'd.conf.média',
  alta: 'd.conf.alta',
});

export interface BusinessCase {
  volumeDiffers: boolean;
  normalized: boolean;
  freedHoursMonth: number | null;
  capacityExtraExecMonth: number | null;
  grossBenefitMonth: number | null;
  netBenefitMonth: number | null;
  investment: number | null;
  recurringCostPerMonth: number | null;
  paybackMonths: number | null;
  roiPct: number | null;
  horizonMonths: number;
  reasons: Record<string, string>;
  range?: { optimisticEffortMonthH: number | null; pessimisticEffortMonthH: number | null };
  confidence: { level: 'baixa' | 'média' | 'alta'; reasons: string[] };
}

export interface Comparison {
  asIs: Figures;
  toBe: Figures;
  rows: CompareRow[];
  business: BusinessCase;
  changedActivities: { id: string; name: string; kind: 'removida' | 'alterada' | 'nova' }[];
}

function row(key: string, label: string, unit: string, a: number | null, b: number | null, basis: Basis, note?: string, lowerIsBetter = true): CompareRow {
  return { key, label, unit, asIs: a, toBe: b, diff: a !== null && b !== null ? b - a : null, reductionPct: reductionPct(a, b), basis, note, lowerIsBetter };
}

export function compareScenarios(asIsP: ProcessModel, sc: Scenario): Comparison {
  const asIs = figures(asIsP);
  // Volume vazio no TO-BE = mesmo volume e período do AS-IS (regra explícita na interface).
  const toBeP = sc.process.volume === undefined ? { ...sc.process, volume: asIsP.volume, volumePeriod: asIsP.volumePeriod, operatingDaysPerMonth: asIsP.operatingDaysPerMonth } : sc.process;
  const toBe = figures(toBeP);
  const reasons: Record<string, string> = {};

  const volumeDiffers = asIs.volumeMonth !== null && toBe.volumeMonth !== null && Math.abs(asIs.volumeMonth - toBe.volumeMonth) > 1e-9;
  // Normalização: com volumes diferentes, o TO-BE é reavaliado no volume do AS-IS
  // (esforço e custo por execução × volume AS-IS) para comparar bases iguais.
  const toBeEffortMonthNorm = volumeDiffers && toBe.effortExecH !== null && asIs.volumeMonth !== null ? toBe.effortExecH * asIs.volumeMonth : toBe.effortMonthH;
  const toBeCostMonthNorm = volumeDiffers && toBe.costPerExec !== null && asIs.volumeMonth !== null ? toBe.costPerExec * asIs.volumeMonth : toBe.costMonth;

  const rows: CompareRow[] = [
    row('activities', tr('d.compare.001'), 'atividades', asIs.activities, toBe.activities, 'calculado'),
    row('active', tr('d.compare.002'), 'horas', asIs.activeExecH, toBe.activeExecH, 'calculado', tr('d.compare.003')),
    row('wait', tr('d.compare.004'), 'horas', asIs.waitExecH, toBe.waitExecH, 'calculado', tr('d.compare.005')),
    row('elapsed', tr('d.compare.006'), 'horas', asIs.elapsedH, toBe.elapsedH, 'calculado', tr('d.compare.007')),
    row('effortExec', tr('d.compare.008'), 'pessoa-hora', asIs.effortExecH, toBe.effortExecH, 'calculado'),
    row('volume', tr('d.compare.009'), tr('d.compare.010'), asIs.volumeMonth, toBe.volumeMonth, 'informado', undefined, false),
    row('effortMonth', tr('d.compare.011'), tr('d.compare.012'), asIs.effortMonthH, toBeEffortMonthNorm, 'estimado', volumeDiffers ? tr('d.compare.013') : undefined),
    row('costMonth', tr('d.compare.014'), tr('d.compare.015'), asIs.costMonth, toBeCostMonthNorm, 'estimado', volumeDiffers ? tr('d.compare.013') : undefined),
    row('reworkMonth', tr('d.compare.017'), tr('d.compare.012'), asIs.reworkMonthH, toBe.reworkMonthH, 'estimado', tr('d.compare.019')),
  ];

  const freedHoursMonth = asIs.effortMonthH !== null && toBeEffortMonthNorm !== null ? asIs.effortMonthH - toBeEffortMonthNorm : null;
  if (freedHoursMonth === null) reasons.freed = tr('d.compare.020');
  const capacityExtraExecMonth = freedHoursMonth !== null && freedHoursMonth > 0 && toBe.effortExecH ? freedHoursMonth / toBe.effortExecH : null;

  const grossBenefitMonth = asIs.costMonth !== null && toBeCostMonthNorm !== null ? asIs.costMonth - toBeCostMonthNorm : null;
  if (grossBenefitMonth === null) reasons.gross = asIs.metrics.totalCostPeriod.reason ?? tr('d.compare.021');
  if (asIs.metrics.monthFactor === null) reasons.gross = reasons.freed = tr('d.compare.022');

  const recurring = isNum(sc.recurringCostPerMonth) ? sc.recurringCostPerMonth : null;
  let netBenefitMonth: number | null = null;
  if (grossBenefitMonth !== null && recurring !== null) netBenefitMonth = grossBenefitMonth - recurring;
  else if (grossBenefitMonth !== null) reasons.net = tr('d.compare.023');
  else reasons.net = reasons.gross;

  const investment = isNum(sc.investment) ? sc.investment : null;
  let paybackMonths: number | null = null;
  let roiPct: number | null = null;
  if (investment === null) reasons.payback = reasons.roi = tr('d.compare.024');
  else if (netBenefitMonth === null) reasons.payback = reasons.roi = reasons.net;
  else if (netBenefitMonth <= 0) reasons.payback = reasons.roi = tr('d.compare.025');
  else {
    paybackMonths = investment / netBenefitMonth;
    if (investment > 0) roiPct = ((netBenefitMonth * sc.horizonMonths - investment) / investment) * 100;
    else reasons.roi = tr('d.compare.026');
  }

  // Faixa otimista/pessimista apenas com mínimos/máximos informados no TO-BE.
  let range: BusinessCase['range'];
  const tasks = sc.process.activities.filter(isWork);
  if (tasks.some((a) => isNum(a.minDuration) || isNum(a.maxDuration))) {
    const variant = (k: 'minDuration' | 'maxDuration') => figures({ ...toBeP, activities: toBeP.activities.map((a) => (isNum(a[k]) ? { ...a, duration: a[k] } : a)) }).effortMonthH;
    range = { optimisticEffortMonthH: variant('minDuration'), pessimisticEffortMonthH: variant('maxDuration') };
  }

  const confReasons: string[] = [];
  const cov = Math.min(asIs.coverage.duration, toBe.coverage.duration, asIs.coverage.people, toBe.coverage.people);
  if (cov < 1) confReasons.push(tr('d.compare.027', { p0: Math.round(cov * 100) }));
  if (grossBenefitMonth !== null && Math.min(asIs.coverage.cost, toBe.coverage.cost) < 1) confReasons.push(tr('d.compare.028'));
  const pending = sc.assumptions.filter((a) => a.status === 'a_validar').length;
  if (pending) confReasons.push(tr('d.compare.029', { pending }));
  if (!sc.changes.length) confReasons.push(tr('d.compare.030'));
  if (volumeDiffers) confReasons.push(tr('d.compare.031'));
  const level: BusinessCase['confidence']['level'] = cov < 0.7 || pending > 2 ? 'baixa' : cov < 1 || pending > 0 || volumeDiffers ? 'média' : 'alta';
  if (!confReasons.length) confReasons.push(tr('d.compare.033'));

  const asIds = new Map(asIsP.activities.map((a) => [a.id, a]));
  const toIds = new Map(sc.process.activities.map((a) => [a.id, a]));
  const changedActivities: Comparison['changedActivities'] = [];
  for (const [id, a] of asIds) {
    if (!toIds.has(id)) changedActivities.push({ id, name: a.name, kind: 'removida' });
    else if (JSON.stringify(a) !== JSON.stringify(toIds.get(id))) changedActivities.push({ id, name: a.name, kind: 'alterada' });
  }
  for (const [id, a] of toIds) if (!asIds.has(id)) changedActivities.push({ id, name: a.name, kind: 'nova' });

  return {
    asIs,
    toBe,
    rows,
    changedActivities,
    business: {
      volumeDiffers,
      normalized: volumeDiffers,
      freedHoursMonth,
      capacityExtraExecMonth,
      grossBenefitMonth,
      netBenefitMonth,
      investment,
      recurringCostPerMonth: recurring,
      paybackMonths,
      roiPct,
      horizonMonths: sc.horizonMonths,
      reasons,
      range,
      confidence: { level, reasons: confReasons },
    },
  };
}

// ---------------------------------------------------------------------------
// Casos conservador / base / otimista (premissas editáveis no cenário).
// Fórmulas (documentadas em docs/CALCULOS.md):
//   horas_caso     = horas liberadas (base) × realização%
//   bruto_caso     = benefício bruto (base) × realização%
//   líquido_caso   = bruto_caso − custo recorrente
//   invest_caso    = investimento × investimento%
//   payback_caso   = invest_caso ÷ líquido_caso   (só se líquido_caso > 0)
//   ROI_caso       = (líquido_caso × horizonte − invest_caso) ÷ invest_caso
export const DEFAULT_SENSITIVITY: Sensitivity = {
  conservative: { realizationPct: 50, investmentPct: 130 },
  optimistic: { realizationPct: 110, investmentPct: 90 },
};

export type CaseKey = 'conservative' | 'base' | 'optimistic';
export const CASE_LABEL: Record<CaseKey, string> = lazyLabels({ conservative: 'd.case.conservative', base: 'd.case.base', optimistic: 'd.case.optimistic' });
export interface CaseFigures {
  key: CaseKey;
  realizationPct: number;
  investmentPct: number;
  freedHoursMonth: number | null;
  grossBenefitMonth: number | null;
  netBenefitMonth: number | null;
  investment: number | null;
  paybackMonths: number | null;
  roiPct: number | null;
  /** Motivo de payback/ROI ausentes. */
  reason?: string;
}

export function businessCases(b: BusinessCase, sens: Sensitivity = DEFAULT_SENSITIVITY): CaseFigures[] {
  const mk = (key: CaseKey, realizationPct: number, investmentPct: number): CaseFigures => {
    const r = realizationPct / 100;
    const freed = b.freedHoursMonth !== null ? b.freedHoursMonth * r : null;
    const gross = b.grossBenefitMonth !== null ? b.grossBenefitMonth * r : null;
    const net = gross !== null && b.recurringCostPerMonth !== null ? gross - b.recurringCostPerMonth : null;
    const inv = b.investment !== null ? b.investment * (investmentPct / 100) : null;
    let payback: number | null = null;
    let roi: number | null = null;
    let reason: string | undefined;
    if (inv === null) reason = b.reasons.payback ?? tr('d.compare.024');
    else if (net === null) reason = b.reasons.net ?? tr('d.compare.035');
    else if (net <= 0) reason = tr('d.compare.036');
    else {
      payback = inv / net;
      roi = inv > 0 ? ((net * b.horizonMonths - inv) / inv) * 100 : null;
      if (inv === 0) reason = tr('d.compare.037');
    }
    return { key, realizationPct, investmentPct, freedHoursMonth: freed, grossBenefitMonth: gross, netBenefitMonth: net, investment: inv, paybackMonths: payback, roiPct: roi, reason };
  };
  return [mk('conservative', sens.conservative.realizationPct, sens.conservative.investmentPct), mk('base', 100, 100), mk('optimistic', sens.optimistic.realizationPct, sens.optimistic.investmentPct)];
}

// ---------------------------------------------------------------------------
// Responsabilidades alteradas entre AS-IS e TO-BE.
export interface ResponsibilityChange {
  activityId: string;
  activity: string;
  kind: 'transferida' | 'removida' | 'nova' | 'definida';
  from?: string;
  to?: string;
}
export interface RoleLoad {
  role: string;
  asIsMonthH: number | null;
  toBeMonthH: number | null;
  diffMonthH: number | null;
}

export function responsibilityChanges(asIsP: ProcessModel, toBeP: ProcessModel): ResponsibilityChange[] {
  const owner = (s?: string) => s?.trim() || undefined;
  const asWork = new Map(asIsP.activities.filter(isWork).map((a) => [a.id, a]));
  const toWork = new Map(toBeP.activities.filter(isWork).map((a) => [a.id, a]));
  const out: ResponsibilityChange[] = [];
  for (const [id, a] of asWork) {
    const b = toWork.get(id);
    if (!b) {
      if (owner(a.owner)) out.push({ activityId: id, activity: a.name, kind: 'removida', from: owner(a.owner) });
    } else if (owner(a.owner) !== owner(b.owner)) {
      out.push({ activityId: id, activity: b.name, kind: owner(a.owner) ? 'transferida' : 'definida', from: owner(a.owner), to: owner(b.owner) });
    }
  }
  for (const [id, b] of toWork) if (!asWork.has(id)) out.push({ activityId: id, activity: b.name, kind: 'nova', to: owner(b.owner) });
  return out;
}

/** Esforço mensal por responsável nos dois cenários (null = não calculável). */
export function roleLoads(asIs: Figures, toBe: Figures): RoleLoad[] {
  const monthly = (fig: Figures) => {
    const f = fig.metrics.monthFactor;
    return new Map(fig.metrics.byOwner.map((g) => [g.key, g.effortPeriodH !== null && f !== null ? g.effortPeriodH * f : null]));
  };
  const a = monthly(asIs);
  const b = monthly(toBe);
  const roles = [...new Set([...a.keys(), ...b.keys()])];
  return roles
    .map((role) => {
      const x = a.has(role) ? a.get(role)! : 0;
      const y = b.has(role) ? b.get(role)! : 0;
      return { role, asIsMonthH: x, toBeMonthH: y, diffMonthH: x !== null && y !== null ? y - x : null };
    })
    .sort((p, q) => Math.abs(q.diffMonthH ?? 0) - Math.abs(p.diffMonthH ?? 0));
}

/** Unidades que o domínio entrega em código (PT); o texto mostrado segue o idioma ativo. */
const UNIT_KEY: Record<string, MessageKey> = { horas: 'rp.u.horas', 'pessoa-hora': 'rp.u.pessoaHora', atividades: 'rp.u.atividades' };
export const unitText = (u: string): string => (UNIT_KEY[u] ? tr(UNIT_KEY[u]) : u);
/** A unidade de custo é um texto traduzido ('R$/mês' em PT, '$/month' em EN): compare sempre por aqui. */
export const isCostUnit = (u: string): boolean => u === tr('d.compare.015');
