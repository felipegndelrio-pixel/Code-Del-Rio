// Módulos avançados: simulação de incerteza (Monte Carlo triangular), RACI,
// FMEA simplificada e avaliação de oportunidades de automação/IA.
import { buildGraph, longestPath } from './graph';
import { isWork } from './metrics';
import type { Activity, AiStage, AutomationAssessment, AutomationCriterion, ProcessModel, RaciState, Risk } from './types';
import { isNum, toHours } from './units';

import { tr } from '../i18n';
// ----------------------------------------------------------------- simulação

/** PRNG determinístico (mulberry32) — resultados reproduzíveis com a mesma semente. */
export function rng(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Amostra da distribuição triangular (mínimo a, moda c, máximo b) por inversão. */
export function triangular(u: number, a: number, c: number, b: number): number {
  if (b === a) return a;
  const f = (c - a) / (b - a);
  return u < f ? a + Math.sqrt(u * (b - a) * (c - a)) : b - Math.sqrt((1 - u) * (b - a) * (b - c));
}

export interface SimulationInput {
  ready: boolean;
  missing: { id: string; name: string; reason: string }[];
}

export function simulationReadiness(p: ProcessModel): SimulationInput {
  const missing: SimulationInput['missing'] = [];
  for (const a of p.activities.filter((x) => x.type === 'task')) {
    if (!isNum(a.duration) || !isNum(a.minDuration) || !isNum(a.maxDuration)) missing.push({ id: a.id, name: a.name, reason: tr('d.advanced.001') });
    else if (!(a.minDuration <= a.duration && a.duration <= a.maxDuration)) missing.push({ id: a.id, name: a.name, reason: tr('d.advanced.002') });
  }
  const g = buildGraph(p);
  if (g.dangling.length || g.unreachable.length) missing.push({ id: '-', name: 'Fluxo', reason: tr('d.advanced.003') });
  return { ready: missing.length === 0 && p.activities.some((a) => a.type === 'task'), missing };
}

export interface SimulationResult {
  iterations: number;
  seed: number;
  /** Tempo decorrido (caminho mais longo, sem retrabalho), em horas. */
  elapsed: { p10: number; p50: number; p80: number; p90: number; mean: number; min: number; max: number };
  /** Soma do trabalho ativo por execução (ponderado pela frequência), em horas. */
  active: { p10: number; p50: number; p90: number; mean: number };
  deterministicElapsedH: number;
  histogram: { from: number; to: number; count: number }[];
}

const quantile = (sorted: number[], q: number) => {
  const pos = (sorted.length - 1) * q;
  const lo = Math.floor(pos);
  const hi = Math.ceil(pos);
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (pos - lo);
};

export function simulate(p: ProcessModel, iterations = 1500, seed = 20261019): SimulationResult {
  const ready = simulationReadiness(p);
  if (!ready.ready) throw new Error(tr('d.adv.notReady'));
  const g = buildGraph(p);
  const rand = rng(seed);
  const tasks = [...g.byId.values()].filter((a) => a.type === 'task');
  const h = (a: Activity, v: number) => toHours(v, a.unit, p.hoursPerDay);
  const elapsed: number[] = [];
  const active: number[] = [];
  const weight = (a: Activity) => (isNum(a.frequencyPct) ? a.frequencyPct / 100 : 1);
  for (let i = 0; i < iterations; i++) {
    const sample = new Map<string, number>();
    let act = 0;
    for (const a of tasks) {
      const v = h(a, triangular(rand(), a.minDuration!, a.duration!, a.maxDuration!));
      sample.set(a.id, v);
      act += v * weight(a);
    }
    const lp = longestPath(g, (a) => (sample.get(a.id) ?? (isNum(a.duration) ? h(a, a.duration) : 0)) + (isNum(a.wait) ? h(a, a.wait) : 0));
    elapsed.push(lp.total);
    active.push(act);
  }
  elapsed.sort((a, b) => a - b);
  active.sort((a, b) => a - b);
  const det = longestPath(g, (a) => (isNum(a.duration) ? h(a, a.duration) : 0) + (isNum(a.wait) ? h(a, a.wait) : 0)).total;
  const bins = 12;
  const lo = elapsed[0];
  const hi = elapsed[elapsed.length - 1];
  const step = (hi - lo) / bins || 1;
  const histogram = Array.from({ length: bins }, (_, i) => ({ from: lo + i * step, to: lo + (i + 1) * step, count: 0 }));
  for (const v of elapsed) histogram[Math.min(bins - 1, Math.floor((v - lo) / step))].count++;
  const mean = (xs: number[]) => xs.reduce((s, x) => s + x, 0) / xs.length;
  return {
    iterations,
    seed,
    elapsed: { p10: quantile(elapsed, 0.1), p50: quantile(elapsed, 0.5), p80: quantile(elapsed, 0.8), p90: quantile(elapsed, 0.9), mean: mean(elapsed), min: lo, max: hi },
    active: { p10: quantile(active, 0.1), p50: quantile(active, 0.5), p90: quantile(active, 0.9), mean: mean(active) },
    deterministicElapsedH: det,
    histogram,
  };
}

// ----------------------------------------------------------------- RACI

/**
 * Sugere apenas "R" (quem executa) a partir do responsável informado.
 * "A" (quem presta contas) NUNCA é atribuído automaticamente.
 */
export function suggestRaci(p: ProcessModel, current: RaciState): RaciState {
  const next: RaciState = structuredClone(current);
  for (const a of p.activities.filter((x) => isWork(x))) {
    const owner = a.owner?.trim();
    if (!owner) continue;
    if (!next.roles.includes(owner)) next.roles.push(owner);
    next.cells[a.id] ??= {};
    if (!next.cells[a.id][owner]) {
      next.cells[a.id][owner] = 'R';
      next.suggested[a.id] ??= {};
      next.suggested[a.id][owner] = true;
    }
  }
  return next;
}

export function raciIssues(p: ProcessModel, r: RaciState): { activityId: string; name: string; issue: string }[] {
  const out: { activityId: string; name: string; issue: string }[] = [];
  for (const a of p.activities.filter((x) => x.type === 'task')) {
    const cells = Object.values(r.cells[a.id] ?? {});
    const A = cells.filter((x) => x === 'A').length;
    if (!cells.includes('R')) out.push({ activityId: a.id, name: a.name, issue: tr('d.advanced.004') });
    if (A === 0) out.push({ activityId: a.id, name: a.name, issue: tr('d.advanced.005') });
    if (A > 1) out.push({ activityId: a.id, name: a.name, issue: tr('d.advanced.006') });
  }
  return out;
}

// ----------------------------------------------------------------- riscos / FMEA

/** Pontuação probabilidade × impacto (1–5 cada). Null sem os dois valores. */
export function riskScore(r: Risk): number | null {
  return isNum(r.probability) && isNum(r.impact) ? r.probability * r.impact : null;
}
export function riskLevel(score: number | null): 'alto' | 'médio' | 'baixo' | null {
  if (score === null) return null;
  return score >= 15 ? 'alto' : score >= 8 ? 'médio' : 'baixo';
}
/** RPN = severidade × ocorrência × detecção (1–10). Null se faltar qualquer um. */
export function rpn(r: Risk): number | null {
  return isNum(r.severity) && isNum(r.occurrence) && isNum(r.detection) ? r.severity * r.occurrence * r.detection : null;
}
/** Regra de priorização explícita: RPN ≥ 100 ou severidade ≥ 9 = prioridade alta. */
export function fmeaPriority(r: Risk): 'alta' | 'normal' | null {
  const v = rpn(r);
  if (v === null) return null;
  return v >= 100 || (r.severity ?? 0) >= 9 ? 'alta' : 'normal';
}

// ----------------------------------------------------------------- automação / IA

export const CRITERIA: { key: AutomationCriterion; label: string; help: string; favorable: 'alto' | 'baixo' }[] = [
  { key: 'repetitividade', get label() { return tr('d.adv.crit.01'); }, get help() { return tr('d.adv.crit.07'); }, favorable: 'alto' },
  { key: 'regras', get label() { return tr('d.adv.crit.02'); }, get help() { return tr('d.adv.crit.08'); }, favorable: 'alto' },
  { key: 'dados', get label() { return tr('d.adv.crit.03'); }, get help() { return tr('d.adv.crit.09'); }, favorable: 'alto' },
  { key: 'excecoes', get label() { return tr('d.adv.crit.04'); }, get help() { return tr('d.adv.crit.10'); }, favorable: 'baixo' },
  { key: 'julgamento', get label() { return tr('d.adv.crit.05'); }, get help() { return tr('d.adv.crit.11'); }, favorable: 'baixo' },
  { key: 'risco_erro', get label() { return tr('d.adv.crit.06'); }, get help() { return tr('d.adv.crit.12'); }, favorable: 'baixo' },
];

export const CHECKLIST = [
  { key: 'valor', get label() { return tr('d.adv.chk.01'); } },
  { key: 'dados', get label() { return tr('d.adv.chk.02'); } },
  { key: 'governanca', get label() { return tr('d.adv.chk.03'); } },
  { key: 'conformidade', get label() { return tr('d.adv.chk.04'); } },
  { key: 'pessoas', get label() { return tr('d.adv.chk.05'); } },
  { key: 'cultura', get label() { return tr('d.adv.chk.06'); } },
  { key: 'responsabilidade', get label() { return tr('d.adv.chk.07'); } },
];

export const AI_STAGES: { key: AiStage; label: string }[] = [
  { key: 'descoberta', get label() { return tr('d.adv.stage.01'); } },
  { key: 'dados', get label() { return tr('d.adv.stage.02'); } },
  { key: 'avaliacao', get label() { return tr('d.adv.stage.03'); } },
  { key: 'piloto', get label() { return tr('d.adv.stage.04'); } },
  { key: 'implantacao', get label() { return tr('d.adv.stage.05'); } },
  { key: 'monitoramento', get label() { return tr('d.adv.stage.06'); } },
  { key: 'otimizacao', get label() { return tr('d.adv.stage.07'); } },
  { key: 'descontinuada', get label() { return tr('d.adv.stage.08'); } },
];

/**
 * Índice de aptidão (0–100): média dos critérios respondidos, invertendo os
 * desfavoráveis (6 − nota), reescalada de 1–5 para 0–100. Null se < 4 respostas.
 */
export function automationScore(x: Pick<AutomationAssessment, 'answers'>): { score: number | null; answered: number } {
  const vals: number[] = [];
  for (const c of CRITERIA) {
    const v = x.answers[c.key];
    if (!isNum(v)) continue;
    vals.push(c.favorable === 'alto' ? v : 6 - v);
  }
  if (vals.length < 4) return { score: null, answered: vals.length };
  const avg = vals.reduce((s, v) => s + v, 0) / vals.length;
  return { score: ((avg - 1) / 4) * 100, answered: vals.length };
}

export function automationVerdict(score: number | null, judgment?: number): string {
  if (score === null) return tr('d.advanced.008');
  if (isNum(judgment) && judgment >= 4) return tr('d.advanced.009');
  if (score >= 70) return tr('d.advanced.010');
  if (score >= 45) return tr('d.advanced.011');
  return tr('d.advanced.012');
}
