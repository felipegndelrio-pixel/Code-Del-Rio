// Cálculo de indicadores a partir de dados persistidos.
// Fórmulas documentadas em docs/KPIS.md. Quando faltam dados, as funções
// retornam null (nunca um número inventado).
import type { Action, Milestone, Project, Risk, Decision, Issue, WbsItem } from './types';
import { CLOSED_ACTION, CLOSED_PROJECT } from './constants';

const DAY = 86_400_000;

export function parseDate(s: string | null | undefined): number | null {
  if (!s) return null;
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(s);
  if (!m) return null;
  return Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
}

export function todayUTC(now = new Date()): number {
  return Date.UTC(now.getFullYear(), now.getMonth(), now.getDate());
}

export function isoDate(t: number): string {
  return new Date(t).toISOString().slice(0, 10);
}

export function daysBetween(a: number, b: number): number {
  return Math.round((b - a) / DAY);
}

const clamp01 = (x: number) => Math.min(1, Math.max(0, x));

/** Fração planejada (0..1) de um item na data `at`, por interpolação linear entre início e fim. */
export function plannedFraction(start: number | null, end: number | null, at: number): number | null {
  if (end === null) return null;
  if (start === null || start >= end) return at >= end ? 1 : 0;
  return clamp01((at - start) / (end - start));
}

export function isActionOverdue(a: Pick<Action, 'status' | 'due_date'>, today: number): boolean {
  const due = parseDate(a.due_date);
  return !CLOSED_ACTION.has(a.status) && due !== null && due < today;
}

export function activeActions<T extends Pick<Action, 'status'>>(actions: T[]): T[] {
  return actions.filter((a) => a.status !== 'cancelada');
}

/** Avanço real das ações: média simples do % das ações não canceladas. */
export function actionsActualProgress(actions: Action[]): number | null {
  const list = activeActions(actions);
  if (!list.length) return null;
  return list.reduce((s, a) => s + (a.status === 'concluida' ? 100 : a.progress), 0) / list.length / 100;
}

/** Avanço planejado das ações na data: média da fração planejada das ações com prazo. */
export function actionsPlannedProgress(actions: Action[], at: number): number | null {
  const fr = activeActions(actions)
    .map((a) => plannedFraction(parseDate(a.start_date), parseDate(a.due_date), at))
    .filter((x): x is number => x !== null);
  if (!fr.length) return null;
  return fr.reduce((s, x) => s + x, 0) / fr.length;
}

function wbsLeaves(wbs: WbsItem[]): WbsItem[] {
  const parents = new Set(wbs.map((w) => w.parent_id).filter(Boolean));
  return wbs.filter((w) => !parents.has(w.id));
}

export type ProgressSource = 'eap' | 'acoes' | 'manual' | null;

export interface ProgressResult {
  value: number | null; // 0..1
  source: ProgressSource;
}

/** Avanço físico do projeto: EAP ponderada > ações > % manual. */
export function physicalProgress(project: Project, wbs: WbsItem[], actions: Action[]): ProgressResult {
  const leaves = wbsLeaves(wbs);
  if (leaves.length) {
    const tw = leaves.reduce((s, w) => s + Number(w.weight || 1), 0);
    return { value: leaves.reduce((s, w) => s + Number(w.weight || 1) * w.progress, 0) / tw / 100, source: 'eap' };
  }
  const ap = actionsActualProgress(actions);
  if (ap !== null) return { value: ap, source: 'acoes' };
  if (project.progress_manual !== null && project.progress_manual !== undefined)
    return { value: project.progress_manual / 100, source: 'manual' };
  return { value: null, source: null };
}

/** Avanço planejado do projeto na data: EAP com datas > ações com prazo > datas do projeto. */
export function plannedProgress(project: Project, wbs: WbsItem[], actions: Action[], at: number): ProgressResult {
  const leaves = wbsLeaves(wbs).filter((w) => w.planned_end);
  if (leaves.length) {
    const tw = leaves.reduce((s, w) => s + Number(w.weight || 1), 0);
    const v = leaves.reduce(
      (s, w) => s + Number(w.weight || 1) * (plannedFraction(parseDate(w.planned_start), parseDate(w.planned_end), at) ?? 0),
      0,
    );
    return { value: v / tw, source: 'eap' };
  }
  const ap = actionsPlannedProgress(actions, at);
  if (ap !== null) return { value: ap, source: 'acoes' };
  const pf = plannedFraction(parseDate(project.planned_start), parseDate(project.planned_end), at);
  if (pf !== null && project.planned_start) return { value: pf, source: 'manual' };
  return { value: null, source: null };
}

export interface EvmResult {
  bac: number | null;
  pv: number | null;
  ev: number | null;
  ac: number | null;
  spi: number | null;
  cpi: number | null;
  costVariance: number | null;
  reasonSpi?: string;
  reasonCpi?: string;
}

/**
 * Valor agregado simplificado: EV = BAC × avanço físico; PV = BAC × avanço planejado.
 * SPI = EV/PV e CPI = EV/AC só são calculados com orçamento e avanço disponíveis.
 */
export function evm(project: Project, physical: number | null, planned: number | null): EvmResult {
  const bac = project.budget_planned !== null && Number(project.budget_planned) > 0 ? Number(project.budget_planned) : null;
  const ac = project.budget_actual !== null && project.budget_actual !== undefined ? Number(project.budget_actual) : null;
  const ev = bac !== null && physical !== null ? bac * physical : null;
  const pv = bac !== null && planned !== null ? bac * planned : null;
  const r: EvmResult = { bac, pv, ev, ac, spi: null, cpi: null, costVariance: null };
  if (bac === null) r.reasonSpi = r.reasonCpi = 'Orçamento planejado (BAC) não informado';
  else if (physical === null) r.reasonSpi = r.reasonCpi = 'Sem dados de avanço físico';
  if (!r.reasonSpi) {
    if (pv === null) r.reasonSpi = 'Sem cronograma planejado';
    else if (pv === 0) r.reasonSpi = 'Valor planejado ainda é zero (projeto não iniciado no plano)';
    else r.spi = ev! / pv;
  }
  if (!r.reasonCpi) {
    if (ac === null || ac === 0) r.reasonCpi = 'Custo real (AC) não informado';
    else r.cpi = ev! / ac;
  }
  if (ac !== null && ev !== null) r.costVariance = ev - ac;
  return r;
}

/** Desvio de prazo em dias (positivo = atraso). */
export function scheduleSlipDays(project: Project, today: number): number | null {
  const pe = parseDate(project.planned_end);
  if (pe === null) return null;
  if (project.status === 'concluido') {
    const ae = parseDate(project.actual_end);
    return ae === null ? null : daysBetween(pe, ae);
  }
  if (CLOSED_PROJECT.has(project.status)) return null;
  return today > pe ? daysBetween(pe, today) : 0;
}

export const DELAY_TOLERANCE = 0.1; // 10 p.p.

/** Projeto atrasado: ativo e (fim planejado vencido OU avanço físico 10 p.p. abaixo do planejado). */
export function isProjectDelayed(project: Project, today: number, physical: number | null, planned: number | null): boolean {
  if (CLOSED_PROJECT.has(project.status)) return false;
  const pe = parseDate(project.planned_end);
  if (pe !== null && pe < today) return true;
  return physical !== null && planned !== null && planned - physical > DELAY_TOLERANCE;
}

export function isOpenRisk(r: Pick<Risk, 'status'>) {
  return r.status === 'aberto' || r.status === 'em_tratamento';
}
export const HIGH_RISK_SCORE = 15;

export function upcomingMilestones(ms: Milestone[], today: number, days = 30): Milestone[] {
  const limit = today + days * DAY;
  return ms
    .filter((m) => m.status === 'pendente')
    .filter((m) => {
      const d = parseDate(m.forecast_date) ?? parseDate(m.planned_date)!;
      return d <= limit;
    })
    .sort((a, b) => (parseDate(a.forecast_date) ?? parseDate(a.planned_date)!) - (parseDate(b.forecast_date) ?? parseDate(b.planned_date)!));
}

export function isMilestoneLate(m: Milestone, today: number): boolean {
  return m.status === 'pendente' && (parseDate(m.planned_date) ?? Infinity) < today;
}

export interface SeriesPoint {
  month: string; // YYYY-MM
  planejado: number | null; // % acumulado
  realizado: number | null; // % acumulado
}

/**
 * Curva S de ações por mês: % acumulado de ações com prazo até o fim do mês
 * (planejado) vs. % acumulado concluído até o fim do mês (realizado).
 * Denominador: ações não canceladas com prazo definido.
 */
export function evolutionSeries(actions: Action[], today: number): SeriesPoint[] {
  const list = activeActions(actions).filter((a) => a.due_date);
  if (!list.length) return [];
  const dates = list.flatMap((a) => [parseDate(a.due_date)!, parseDate(a.completed_at?.slice(0, 10)) ?? NaN]).filter((x) => !Number.isNaN(x));
  const start = new Date(Math.min(...dates));
  const end = new Date(Math.max(...dates, today));
  const out: SeriesPoint[] = [];
  let y = start.getUTCFullYear();
  let m = start.getUTCMonth();
  const total = list.length;
  for (let guard = 0; guard < 240; guard++) {
    const monthEnd = Date.UTC(y, m + 1, 0);
    const planned = list.filter((a) => parseDate(a.due_date)! <= monthEnd).length;
    const done = list.filter((a) => a.completed_at && parseDate(a.completed_at.slice(0, 10))! <= monthEnd).length;
    const monthStart = Date.UTC(y, m, 1);
    out.push({
      month: `${y}-${String(m + 1).padStart(2, '0')}`,
      planejado: Math.round((planned / total) * 1000) / 10,
      realizado: monthStart <= today ? Math.round((done / total) * 1000) / 10 : null,
    });
    if (y > end.getUTCFullYear() || (y === end.getUTCFullYear() && m >= end.getUTCMonth())) break;
    m++;
    if (m > 11) {
      m = 0;
      y++;
    }
  }
  return out;
}

export interface PortfolioInput {
  projects: Project[];
  actions: Action[];
  wbs: WbsItem[];
  milestones: Milestone[];
  risks: Risk[];
  decisions: Decision[];
  issues: Issue[];
}

export interface ProjectKpi {
  project: Project;
  physical: ProgressResult;
  planned: ProgressResult;
  evm: EvmResult;
  slipDays: number | null;
  delayed: boolean;
  overdueActions: number;
  openActions: number;
}

export function projectKpis(input: PortfolioInput, today: number): ProjectKpi[] {
  return input.projects.map((p) => {
    const acts = input.actions.filter((a) => a.project_id === p.id);
    const wbs = input.wbs.filter((w) => w.project_id === p.id);
    const physical = physicalProgress(p, wbs, acts);
    const planned = plannedProgress(p, wbs, acts, today);
    return {
      project: p,
      physical,
      planned,
      evm: evm(p, physical.value, planned.value),
      slipDays: scheduleSlipDays(p, today),
      delayed: isProjectDelayed(p, today, physical.value, planned.value),
      overdueActions: acts.filter((a) => isActionOverdue(a, today)).length,
      openActions: acts.filter((a) => !CLOSED_ACTION.has(a.status)).length,
    };
  });
}

export interface PortfolioSummary {
  projectsActive: number;
  projectsDelayed: number;
  projectsClosed: number;
  actionsOpen: number;
  actionsOverdue: number;
  actionsBlocked: number;
  actionsCritical: number;
  actionsDone: number;
  risksOpen: number;
  risksHigh: number;
  decisionsPending: number;
  issuesOpen: number;
  milestonesUpcoming: number;
  milestonesLate: number;
  budgetPlanned: number | null;
  budgetActual: number | null;
  avgPhysical: number | null;
  avgPlanned: number | null;
}

export function portfolioSummary(input: PortfolioInput, kpis: ProjectKpi[], today: number): PortfolioSummary {
  const active = kpis.filter((k) => !CLOSED_PROJECT.has(k.project.status));
  const withPhys = active.filter((k) => k.physical.value !== null);
  const withPlan = active.filter((k) => k.planned.value !== null);
  const sumOrNull = (vals: (number | null)[]) => {
    const v = vals.filter((x): x is number => x !== null && x !== undefined).map(Number);
    return v.length ? v.reduce((a, b) => a + b, 0) : null;
  };
  return {
    projectsActive: active.length,
    projectsDelayed: active.filter((k) => k.delayed).length,
    projectsClosed: kpis.length - active.length,
    actionsOpen: input.actions.filter((a) => !CLOSED_ACTION.has(a.status)).length,
    actionsOverdue: input.actions.filter((a) => isActionOverdue(a, today)).length,
    actionsBlocked: input.actions.filter((a) => a.status === 'bloqueada').length,
    actionsCritical: input.actions.filter((a) => !CLOSED_ACTION.has(a.status) && (a.priority === 'critica' || a.criticality === 'alta')).length,
    actionsDone: input.actions.filter((a) => a.status === 'concluida').length,
    risksOpen: input.risks.filter(isOpenRisk).length,
    risksHigh: input.risks.filter((r) => isOpenRisk(r) && r.score >= HIGH_RISK_SCORE).length,
    decisionsPending: input.decisions.filter((d) => d.status === 'pendente').length,
    issuesOpen: input.issues.filter((i) => i.status === 'aberto' || i.status === 'em_analise').length,
    milestonesUpcoming: upcomingMilestones(input.milestones, today).length,
    milestonesLate: input.milestones.filter((m) => isMilestoneLate(m, today)).length,
    budgetPlanned: sumOrNull(input.projects.map((p) => p.budget_planned)),
    budgetActual: sumOrNull(input.projects.map((p) => p.budget_actual)),
    avgPhysical: withPhys.length ? withPhys.reduce((s, k) => s + k.physical.value!, 0) / withPhys.length : null,
    avgPlanned: withPlan.length ? withPlan.reduce((s, k) => s + k.planned.value!, 0) / withPlan.length : null,
  };
}
