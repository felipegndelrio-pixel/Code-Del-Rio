// Mudanças no cenário TO-BE. Cada mudança é registrada (o quê, antes/depois,
// justificativa, hipótese, validador). O AS-IS nunca é tocado: todas as funções
// recebem e devolvem cópias.
import { normalizeStages } from './factory';
import type { Activity, ChangeEntry, ChangeKind, Scenario } from './types';
import { nowIso, uid } from './units';

import { lazyLabels } from '../i18n';
import { tr } from '../i18n';
export const CHANGE_LABEL: Record<ChangeKind, string> = lazyLabels({
  remove: 'd.chg.remove',
  simplify: 'd.chg.simplify',
  automate: 'd.chg.automate',
  combine: 'd.chg.combine',
  reorder: 'd.chg.reorder',
  reduce_wait: 'd.chg.reduce_wait',
  reduce_rework: 'd.chg.reduce_rework',
  edit: 'd.chg.edit',
  add: 'd.chg.add',
  restore: 'd.chg.restore',
});

export interface ChangeMeta {
  justification?: string;
  hypothesis?: string;
  validator?: string;
  recId?: string;
  author?: string;
}

const FIELDS_TRACKED: (keyof Activity)[] = ['name', 'duration', 'unit', 'wait', 'people', 'owner', 'lean', 'leanReason', 'rework', 'frequencyPct', 'costPerHour', 'variableCost', 'minDuration', 'maxDuration', 'order', 'stage', 'next', 'nextYes', 'nextNo', 'critical', 'volume', 'notes'];

export function diffActivity(before: Activity, after: Activity): { before: Partial<Activity>; after: Partial<Activity> } {
  const b: Partial<Activity> = {};
  const a: Partial<Activity> = {};
  for (const k of FIELDS_TRACKED) {
    if (JSON.stringify(before[k]) !== JSON.stringify(after[k])) {
      (b as any)[k] = before[k];
      (a as any)[k] = after[k];
    }
  }
  return { before: b, after: a };
}

function entry(kind: ChangeKind, summary: string, meta: ChangeMeta, act?: Activity, before?: Partial<Activity>, after?: Partial<Activity>): ChangeEntry {
  return { id: uid('c_'), at: nowIso(), kind, summary, activityId: act?.id, activityName: act?.name, before, after, ...meta };
}

/** Atualiza campos de uma atividade do TO-BE. Retorna null se nada mudou. */
export function updateActivity(sc: Scenario, id: string, patch: Partial<Activity>, kind: ChangeKind, meta: ChangeMeta): Scenario | null {
  const next = structuredClone(sc);
  const act = next.process.activities.find((a) => a.id === id);
  if (!act) throw new Error(`Atividade ${id} não existe no cenário.`);
  const before = structuredClone(act);
  Object.assign(act, patch);
  const d = diffActivity(before, act);
  if (!Object.keys(d.after).length) return null;
  const fields = Object.keys(d.after).join(', ');
  next.changes.push(entry(kind, `${CHANGE_LABEL[kind]}: “${act.name}” (${fields})`, meta, act, d.before, d.after));
  next.process = normalizeStages(next.process);
  next.updatedAt = nowIso();
  return next;
}

/**
 * Remove uma atividade do TO-BE religando predecessores aos sucessores.
 * Decisões não podem ser removidas por aqui (exigem redesenho dos caminhos).
 */
export function removeActivity(sc: Scenario, id: string, meta: ChangeMeta): Scenario {
  const next = structuredClone(sc);
  const acts = next.process.activities;
  const victim = acts.find((a) => a.id === id);
  if (!victim) throw new Error(`Atividade ${id} não existe no cenário.`);
  if (victim.type === 'decision' || victim.type === 'start') throw new Error('Decisões e eventos de início não podem ser removidos automaticamente — edite os caminhos.');
  const successors = victim.type === 'end' ? [] : victim.next.filter((n) => n !== id);
  for (const a of acts) {
    if (a.id === id) continue;
    if (a.next.includes(id)) a.next = [...new Set(a.next.flatMap((n) => (n === id ? successors : [n])))].filter((n) => n !== a.id);
    if (a.nextYes === id) a.nextYes = successors[0];
    if (a.nextNo === id) a.nextNo = successors[0];
  }
  next.process.activities = acts.filter((a) => a.id !== id);
  next.changes.push(entry('remove', tr('d.tobe.001', { name: victim.name, p1: successors.length ? tr('d.tobe.002') : tr('d.tobe.003') }), meta, victim, structuredClone(victim), undefined));
  next.process = normalizeStages(next.process);
  next.updatedAt = nowIso();
  return next;
}

/** Combina B em A: A assume o nome/duração informados; B é removida e religada. */
export function combineActivities(sc: Scenario, keepId: string, mergeId: string, patch: Partial<Activity>, meta: ChangeMeta): Scenario {
  const merged = sc.process.activities.find((a) => a.id === mergeId);
  if (!merged) throw new Error('Atividade a combinar não existe.');
  let next = removeActivity(sc, mergeId, meta);
  next.changes.pop();
  const updated = updateActivity(next, keepId, patch, 'combine', meta);
  next = updated ?? next;
  const last = next.changes[next.changes.length - 1];
  if (last && last.kind === 'combine') last.summary = tr('d.tobe.004', { name: merged.name, p1: next.process.activities.find((a) => a.id === keepId)!.name });
  else next.changes.push(entry('combine', tr('d.tobe.005', { name: merged.name }), meta, merged));
  return next;
}

export function addActivity(sc: Scenario, act: Activity, afterId: string | undefined, meta: ChangeMeta): Scenario {
  const next = structuredClone(sc);
  if (next.process.activities.some((a) => a.id === act.id)) throw new Error('Código já existe.');
  if (afterId) {
    const prev = next.process.activities.find((a) => a.id === afterId);
    if (prev && prev.type !== 'decision' && prev.type !== 'end') {
      act.next = act.next.length ? act.next : prev.next;
      prev.next = [act.id];
      act.order = prev.order + 0.5;
    }
  }
  next.process.activities.push(act);
  // Renumera a ordem para inteiros preservando a sequência.
  next.process.activities.sort((a, b) => a.order - b.order).forEach((a, i) => (a.order = i + 1));
  next.changes.push(entry('add', tr('d.tobe.006', { name: act.name }), meta, act, undefined, structuredClone(act)));
  next.process = normalizeStages(next.process);
  next.updatedAt = nowIso();
  return next;
}

/** Restaura uma atividade do TO-BE para os valores do AS-IS (se existir lá). */
export function restoreFromAsIs(sc: Scenario, asIsActs: Activity[], id: string, meta: ChangeMeta): Scenario | null {
  const src = asIsActs.find((a) => a.id === id);
  if (!src) return null;
  const next = structuredClone(sc);
  const i = next.process.activities.findIndex((a) => a.id === id);
  if (i < 0) next.process.activities.push(structuredClone(src));
  else next.process.activities[i] = structuredClone(src);
  next.changes.push(entry('restore', tr('d.tobe.007', { name: src.name }), meta, src));
  next.process = normalizeStages(next.process);
  next.updatedAt = nowIso();
  return next;
}
