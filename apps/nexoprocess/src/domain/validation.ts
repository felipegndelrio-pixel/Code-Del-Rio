// Validação do processo antes de calcular. Erros impedem a análise; alertas
// não impedem, mas limitam conclusões. Correções automáticas são sempre
// SUGERIDAS (com rótulo) e só aplicadas após confirmação do usuário.
import { buildGraph, sortedActivities } from './graph';
import type { Activity, ProcessModel } from './types';
import { isNum } from './units';

import { tr } from '../i18n';
export type Severity = 'error' | 'warning' | 'info';
export interface Issue {
  id: string;
  severity: Severity;
  code: string;
  message: string;
  why: string;
  fix: string;
  activityId?: string;
  row?: number;
  autofix?: { label: string; apply: (p: ProcessModel) => ProcessModel };
}

const clone = (p: ProcessModel): ProcessModel => structuredClone(p);
const where = (a: Activity) => (a.sourceRow ? tr('d.validation.001', { sourceRow: a.sourceRow }) : '');

export function validateProcess(p: ProcessModel): Issue[] {
  const issues: Issue[] = [];
  const push = (i: Omit<Issue, 'id'>) => issues.push({ ...i, id: `${i.code}:${i.activityId ?? ''}:${issues.length}` });

  if (!p.activities.length) {
    push({ severity: 'error', code: 'empty', message: tr('d.validation.002'), why: tr('d.validation.003'), fix: tr('d.validation.004') });
    return issues;
  }
  if (!isNum(p.hoursPerDay) || p.hoursPerDay <= 0 || p.hoursPerDay > 24)
    push({ severity: 'error', code: 'hours_per_day', message: tr('d.validation.005'), why: tr('d.validation.006'), fix: tr('d.validation.007') });
  if (isNum(p.volume) && p.volume < 0)
    push({ severity: 'error', code: 'volume_negative', message: tr('d.validation.008'), why: tr('d.validation.009'), fix: tr('d.validation.010') });

  // IDs duplicados
  const seen = new Map<string, Activity>();
  for (const a of p.activities) {
    if (seen.has(a.id))
      push({
        severity: 'error',
        code: 'duplicate_id',
        activityId: a.id,
        row: a.sourceRow,
        message: tr('d.validation.011', { id: a.id, p1: where(a) }),
        why: tr('d.validation.012'),
        fix: tr('d.validation.013'),
      });
    else seen.set(a.id, a);
  }

  const ordered = sortedActivities(p);
  for (const a of p.activities) {
    if (!a.name?.trim())
      push({ severity: 'error', code: 'no_name', activityId: a.id, row: a.sourceRow, message: tr('d.validation.014', { p0: where(a) }), why: tr('d.validation.015'), fix: tr('d.validation.016') });
    if (!a.stage?.trim())
      push({ severity: 'warning', code: 'no_stage', activityId: a.id, row: a.sourceRow, message: tr('d.validation.017', { name: a.name, p1: where(a) }), why: tr('d.validation.018'), fix: tr('d.validation.019') });
    for (const [field, label] of [
      ['duration', tr('d.validation.020')],
      ['wait', tr('d.validation.021')],
      ['minDuration', tr('d.validation.022')],
      ['maxDuration', tr('d.validation.023')],
      ['people', tr('d.validation.024')],
      ['costPerHour', 'Custo-hora'],
      ['variableCost', tr('d.validation.025')],
      ['volume', 'Volume'],
    ] as const) {
      const v = a[field];
      if (v !== undefined && (!isNum(v) || v < 0))
        push({
          severity: 'error',
          code: `invalid_${field}`,
          activityId: a.id,
          row: a.sourceRow,
          message: tr('d.validation.026', { label, name: a.name, p2: where(a) }),
          why: tr('d.validation.027'),
          fix: tr('d.validation.028'),
        });
    }
    if (isNum(a.frequencyPct) && (a.frequencyPct < 0 || a.frequencyPct > 100))
      push({ severity: 'error', code: 'invalid_frequency', activityId: a.id, row: a.sourceRow, message: tr('d.validation.029', { name: a.name, p1: where(a) }), why: tr('d.validation.030'), fix: tr('d.validation.031') });
    if (a.type === 'task' && !isNum(a.duration))
      push({ severity: 'warning', code: 'no_duration', activityId: a.id, row: a.sourceRow, message: tr('d.validation.032', { name: a.name, p1: where(a) }), why: tr('d.validation.033'), fix: tr('d.validation.034') });
    if (a.type === 'task' && isNum(a.people) && a.people === 0)
      push({ severity: 'warning', code: 'zero_people', activityId: a.id, row: a.sourceRow, message: tr('d.validation.035', { name: a.name, p1: where(a) }), why: tr('d.validation.036'), fix: tr('d.validation.037') });
    if (isNum(a.duration) && ((isNum(a.minDuration) && a.minDuration > a.duration) || (isNum(a.maxDuration) && a.maxDuration < a.duration)))
      push({ severity: 'warning', code: 'min_max', activityId: a.id, row: a.sourceRow, message: tr('d.validation.038', { name: a.name, p1: where(a) }), why: tr('d.validation.039'), fix: tr('d.validation.040') });
    if (a.type === 'decision') {
      const paths = [a.nextYes, a.nextNo, ...a.next].filter(Boolean);
      if (!paths.length)
        push({ severity: 'error', code: 'decision_no_path', activityId: a.id, row: a.sourceRow, message: tr('d.validation.041', { name: a.name, p1: where(a) }), why: tr('d.validation.042'), fix: tr('d.validation.043') });
      else if (!a.nextYes || !a.nextNo)
        push({ severity: 'warning', code: 'decision_one_path', activityId: a.id, row: a.sourceRow, message: tr('d.validation.044', { name: a.name, p1: where(a) }), why: tr('d.validation.045'), fix: tr('d.validation.046') });
    }
  }

  const g = buildGraph(p);
  for (const d of g.dangling) {
    const a = g.byId.get(d.from)!;
    push({
      severity: 'error',
      code: 'dangling',
      activityId: a.id,
      row: a.sourceRow,
      message: tr('d.validation.047', { name: a.name, to: d.to, p2: where(a) }),
      why: tr('d.validation.048'),
      fix: tr('d.validation.049'),
      autofix: {
        label: tr('d.validation.050', { to: d.to }),
        apply: (pp) => {
          const c = clone(pp);
          const x = c.activities.find((y) => y.id === a.id)!;
          x.next = x.next.filter((n) => n !== d.to);
          if (x.nextYes === d.to) x.nextYes = undefined;
          if (x.nextNo === d.to) x.nextNo = undefined;
          return c;
        },
      },
    });
  }
  for (const id of g.unreachable) {
    const a = g.byId.get(id)!;
    push({ severity: 'warning', code: 'unreachable', activityId: id, row: a.sourceRow, message: tr('d.validation.051', { name: a.name, p1: where(a) }), why: tr('d.validation.052'), fix: tr('d.validation.053') });
  }
  // Atividades que terminam o fluxo sem ser "fim"
  const idx = new Map(ordered.map((a, i) => [a.id, i]));
  for (const a of ordered) {
    if (a.type === 'end' || a.type === 'decision') continue;
    if (g.out.get(a.id)!.length > 0) continue;
    const hasEnd = ordered.some((x) => x.type === 'end');
    const nextByOrder = ordered[idx.get(a.id)! + 1];
    if (!hasEnd && !nextByOrder) continue; // último elemento: fim implícito
    push({
      severity: 'warning',
      code: 'dead_end',
      activityId: a.id,
      row: a.sourceRow,
      message: tr('d.validation.054', { name: a.name, p1: where(a) }),
      why: tr('d.validation.055'),
      fix: tr('d.validation.056'),
      autofix: nextByOrder
        ? {
            label: tr('d.validation.057', { name: nextByOrder.name }),
            apply: (pp) => {
              const c = clone(pp);
              c.activities.find((y) => y.id === a.id)!.next = [nextByOrder.id];
              return c;
            },
          }
        : undefined,
    });
  }
  // Ciclo sem decisão: nenhum nó do ciclo (de v até u pelo fluxo de avanço) é uma decisão.
  const cycleHasDecision = (from: string, to: string) => {
    const fwd = new Set<string>([to]);
    const q = [to];
    while (q.length) {
      const id = q.shift()!;
      for (const x of g.out.get(id)!)
        if (!x.back && !fwd.has(x.to)) {
          fwd.add(x.to);
          q.push(x.to);
        }
    }
    const rev = new Set<string>([from]);
    const r = [from];
    while (r.length) {
      const id = r.shift()!;
      for (const x of g.inc.get(id)!)
        if (!x.back && !rev.has(x.from)) {
          rev.add(x.from);
          r.push(x.from);
        }
    }
    return [...fwd].some((id) => rev.has(id) && g.byId.get(id)!.type === 'decision');
  };
  for (const e of g.backEdges) {
    const a = g.byId.get(e.from)!;
    if (e.kind === 'seq' && !cycleHasDecision(e.from, e.to))
      push({ severity: 'warning', code: 'loop_no_decision', activityId: a.id, row: a.sourceRow, message: tr('d.validation.058', { name: a.name, p1: g.byId.get(e.to)!.name }), why: tr('d.validation.059'), fix: tr('d.validation.060') });
  }
  if (!p.activities.some((a) => a.type === 'start'))
    push({ severity: 'info', code: 'no_start', message: tr('d.validation.061'), why: tr('d.validation.062'), fix: tr('d.validation.063') });
  if (!p.activities.some((a) => a.type === 'end'))
    push({ severity: 'info', code: 'no_end', message: tr('d.validation.064'), why: tr('d.validation.065'), fix: tr('d.validation.066') });
  const inferred = p.activities.filter((a) => a.flowInferred).length;
  if (inferred)
    push({ severity: 'info', code: 'flow_inferred', message: tr('d.validation.067', { inferred }), why: tr('d.validation.068'), fix: tr('d.validation.069') });
  return issues;
}

export function blockingErrors(issues: Issue[]) {
  return issues.filter((i) => i.severity === 'error');
}
