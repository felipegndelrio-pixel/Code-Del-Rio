// Comparação AS-IS × TO-BE e business case. Tudo aqui é ESTIMATIVA
// condicionada a premissas; nada vira "economia realizada" automaticamente.
import { computeMetrics, costOf, isWork, type ProcessMetrics } from './metrics';
import type { ProcessModel, Scenario } from './types';
import { isNum, reductionPct } from './units';

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
    row('activities', 'Atividades (tarefas)', 'atividades', asIs.activities, toBe.activities, 'calculado'),
    row('active', 'Tempo de trabalho ativo por execução', 'horas', asIs.activeExecH, toBe.activeExecH, 'calculado', 'Ponderado pela frequência de cada atividade.'),
    row('wait', 'Tempo de espera por execução', 'horas', asIs.waitExecH, toBe.waitExecH, 'calculado', 'Somente esperas informadas.'),
    row('elapsed', 'Tempo decorrido (caminho mais longo)', 'horas', asIs.elapsedH, toBe.elapsedH, 'calculado', 'Pior caso entre caminhos alternativos, sem retrabalho.'),
    row('effortExec', 'Esforço por execução', 'pessoa-hora', asIs.effortExecH, toBe.effortExecH, 'calculado'),
    row('volume', 'Volume por mês', 'execuções', asIs.volumeMonth, toBe.volumeMonth, 'informado', undefined, false),
    row('effortMonth', 'Esforço por mês', 'pessoa-hora/mês', asIs.effortMonthH, toBeEffortMonthNorm, 'estimado', volumeDiffers ? 'TO-BE normalizado para o volume do AS-IS.' : undefined),
    row('costMonth', 'Custo comparável por mês', 'R$/mês', asIs.costMonth, toBeCostMonthNorm, 'estimado', volumeDiffers ? 'TO-BE normalizado para o volume do AS-IS.' : undefined),
    row('reworkMonth', 'Esforço em retrabalho por mês', 'pessoa-hora/mês', asIs.reworkMonthH, toBe.reworkMonthH, 'estimado', 'Somente retrabalho marcado e com frequência informada.'),
  ];

  const freedHoursMonth = asIs.effortMonthH !== null && toBeEffortMonthNorm !== null ? asIs.effortMonthH - toBeEffortMonthNorm : null;
  if (freedHoursMonth === null) reasons.freed = 'Informe volume, duração e pessoas nos dois cenários.';
  const capacityExtraExecMonth = freedHoursMonth !== null && freedHoursMonth > 0 && toBe.effortExecH ? freedHoursMonth / toBe.effortExecH : null;

  const grossBenefitMonth = asIs.costMonth !== null && toBeCostMonthNorm !== null ? asIs.costMonth - toBeCostMonthNorm : null;
  if (grossBenefitMonth === null) reasons.gross = asIs.metrics.totalCostPeriod.reason ?? 'Informe custo-hora e volume nos dois cenários.';
  if (asIs.metrics.monthFactor === null) reasons.gross = reasons.freed = 'Informe os dias de operação por mês para converter o volume diário.';

  const recurring = isNum(sc.recurringCostPerMonth) ? sc.recurringCostPerMonth : null;
  let netBenefitMonth: number | null = null;
  if (grossBenefitMonth !== null && recurring !== null) netBenefitMonth = grossBenefitMonth - recurring;
  else if (grossBenefitMonth !== null) reasons.net = 'Informe o custo recorrente do cenário futuro (pode ser 0).';
  else reasons.net = reasons.gross;

  const investment = isNum(sc.investment) ? sc.investment : null;
  let paybackMonths: number | null = null;
  let roiPct: number | null = null;
  if (investment === null) reasons.payback = reasons.roi = 'Informe o investimento inicial (pode ser 0).';
  else if (netBenefitMonth === null) reasons.payback = reasons.roi = reasons.net;
  else if (netBenefitMonth <= 0) reasons.payback = reasons.roi = 'Benefício líquido mensal não é positivo: não há retorno do investimento com estas premissas.';
  else {
    paybackMonths = investment / netBenefitMonth;
    if (investment > 0) roiPct = ((netBenefitMonth * sc.horizonMonths - investment) / investment) * 100;
    else reasons.roi = 'Investimento igual a zero: ROI não se aplica (divisão por zero).';
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
  if (cov < 1) confReasons.push(`Duração/pessoas cobrem ${Math.round(cov * 100)}% das atividades.`);
  if (grossBenefitMonth !== null && Math.min(asIs.coverage.cost, toBe.coverage.cost) < 1) confReasons.push('Custo-hora não cobre todas as atividades.');
  const pending = sc.assumptions.filter((a) => a.status === 'a_validar').length;
  if (pending) confReasons.push(`${pending} premissa(s) do TO-BE ainda a validar.`);
  if (!sc.changes.length) confReasons.push('Nenhuma mudança registrada no TO-BE.');
  if (volumeDiffers) confReasons.push('Volumes diferentes entre cenários (comparação normalizada).');
  const level: BusinessCase['confidence']['level'] = cov < 0.7 || pending > 2 ? 'baixa' : cov < 1 || pending > 0 || volumeDiffers ? 'média' : 'alta';
  if (!confReasons.length) confReasons.push('Dados completos e premissas validadas. Ainda assim é uma estimativa.');

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
