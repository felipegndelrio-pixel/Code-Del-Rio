import { describe, expect, it } from 'vitest';
import {
  actionsPlannedProgress,
  evm,
  evolutionSeries,
  isActionOverdue,
  isProjectDelayed,
  parseDate,
  physicalProgress,
  plannedFraction,
  portfolioSummary,
  projectKpis,
  scheduleSlipDays,
  upcomingMilestones,
} from './kpi';
import type { Action, Milestone, Project, WbsItem } from './types';

const T = parseDate('2026-06-30')!;
const proj = (p: Partial<Project> = {}): Project =>
  ({ id: 'p1', code: 'PRJ-1', name: 'P', status: 'em_andamento', priority: 'media', planned_start: '2026-01-01', planned_end: '2026-12-31', budget_planned: null, budget_actual: null, progress_manual: null, actual_end: null, ...p }) as Project;
const act = (a: Partial<Action>): Action =>
  ({ id: Math.random().toString(), project_id: 'p1', status: 'nao_iniciada', priority: 'media', criticality: 'media', progress: 0, start_date: null, due_date: null, completed_at: null, ...a }) as Action;

describe('KPIs', () => {
  it('fração planejada linear', () => {
    expect(plannedFraction(parseDate('2026-01-01'), parseDate('2026-01-11'), parseDate('2026-01-06')!)).toBeCloseTo(0.5);
    expect(plannedFraction(null, parseDate('2026-01-11'), parseDate('2026-01-06')!)).toBe(0);
    expect(plannedFraction(null, null, T)).toBeNull();
  });

  it('ação atrasada só se aberta e com prazo vencido', () => {
    expect(isActionOverdue(act({ due_date: '2026-06-01' }), T)).toBe(true);
    expect(isActionOverdue(act({ due_date: '2026-06-01', status: 'concluida' }), T)).toBe(false);
    expect(isActionOverdue(act({ due_date: null }), T)).toBe(false);
  });

  it('avanço físico usa EAP ponderada quando existe', () => {
    const wbs = [
      { id: 'w1', parent_id: null, weight: 1, progress: 100 },
      { id: 'w2', parent_id: null, weight: 3, progress: 0 },
    ] as WbsItem[];
    expect(physicalProgress(proj(), wbs, []).value).toBeCloseTo(0.25);
    expect(physicalProgress(proj(), wbs, []).source).toBe('eap');
  });

  it('avanço físico cai para ações e depois para manual; nunca inventa', () => {
    expect(physicalProgress(proj(), [], [act({ progress: 50 }), act({ status: 'concluida', progress: 100 })]).value).toBeCloseTo(0.75);
    expect(physicalProgress(proj({ progress_manual: 30 }), [], []).value).toBeCloseTo(0.3);
    expect(physicalProgress(proj(), [], []).value).toBeNull();
  });

  it('SPI/CPI só com dados suficientes', () => {
    const noBudget = evm(proj(), 0.5, 0.5);
    expect(noBudget.spi).toBeNull();
    expect(noBudget.reasonSpi).toMatch(/BAC/);
    const r = evm(proj({ budget_planned: 1000, budget_actual: 400 }), 0.5, 0.4);
    expect(r.ev).toBe(500);
    expect(r.pv).toBe(400);
    expect(r.spi).toBeCloseTo(1.25);
    expect(r.cpi).toBeCloseTo(1.25);
    expect(evm(proj({ budget_planned: 1000 }), 0.5, 0.4).cpi).toBeNull();
  });

  it('desvio de prazo e atraso de projeto', () => {
    expect(scheduleSlipDays(proj({ planned_end: '2026-06-20' }), T)).toBe(10);
    expect(scheduleSlipDays(proj({ status: 'concluido', planned_end: '2026-06-20', actual_end: '2026-06-25' }), T)).toBe(5);
    expect(isProjectDelayed(proj(), T, 0.2, 0.5)).toBe(true);
    expect(isProjectDelayed(proj(), T, 0.45, 0.5)).toBe(false);
    expect(isProjectDelayed(proj({ status: 'cancelado', planned_end: '2026-01-01' }), T, null, null)).toBe(false);
  });

  it('marcos próximos ordenados e filtrados', () => {
    const ms = [
      { id: 'a', status: 'pendente', planned_date: '2026-07-20', forecast_date: null },
      { id: 'b', status: 'pendente', planned_date: '2026-07-05', forecast_date: null },
      { id: 'c', status: 'atingido', planned_date: '2026-07-01', forecast_date: null },
      { id: 'd', status: 'pendente', planned_date: '2026-12-01', forecast_date: null },
    ] as Milestone[];
    expect(upcomingMilestones(ms, T).map((m) => m.id)).toEqual(['b', 'a']);
  });

  it('curva S mensal planejado x realizado', () => {
    const s = evolutionSeries(
      [
        act({ due_date: '2026-05-10', status: 'concluida', completed_at: '2026-05-08T10:00:00Z' }),
        act({ due_date: '2026-06-10' }),
        act({ due_date: '2026-08-10' }),
        act({ due_date: '2026-08-10', status: 'cancelada' }),
      ],
      T,
    );
    expect(s.map((p) => p.month)).toEqual(['2026-05', '2026-06', '2026-07', '2026-08']);
    expect(s[0]).toEqual({ month: '2026-05', planejado: 33.3, realizado: 33.3 });
    expect(s[3].planejado).toBe(100);
    expect(s[3].realizado).toBeNull();
  });

  it('avanço planejado das ações exige prazo', () => {
    expect(actionsPlannedProgress([act({})], T)).toBeNull();
  });

  it('resumo do portfólio agrega por dados persistidos', () => {
    const input = {
      projects: [proj(), proj({ id: 'p2', status: 'concluido' })],
      actions: [act({ due_date: '2026-01-01' }), act({ status: 'bloqueada', blockers: 'x', priority: 'critica' }), act({ status: 'concluida', progress: 100 })],
      wbs: [],
      milestones: [],
      risks: [{ status: 'aberto', score: 20 }, { status: 'fechado', score: 25 }] as any,
      decisions: [{ status: 'pendente' }] as any,
      issues: [],
    };
    const s = portfolioSummary(input, projectKpis(input, T), T);
    expect(s).toMatchObject({ projectsActive: 1, projectsClosed: 1, actionsOpen: 2, actionsOverdue: 1, actionsBlocked: 1, actionsCritical: 1, actionsDone: 1, risksOpen: 1, risksHigh: 1, decisionsPending: 1 });
  });
});
