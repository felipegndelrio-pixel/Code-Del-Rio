// Regras do plano de ação: uma ação só é "concluída" com registro do resultado observado.
import type { Recommendation } from './recommendations';
import type { ActionItem, Workspace } from './types';
import { nowIso, uid } from './units';
import { tr } from '../i18n';

export function completionIssue(a: ActionItem): string | null {
  if (a.status !== 'concluida') return null;
  if (!a.observedResult?.trim()) return tr('d.plan.needResult');
  if (!a.completedAt) return tr('d.plan.needDate');
  return null;
}

/** Problema ao qual a ação responde: informado, ou derivado da origem (mudança do TO-BE). */
export function relatedProblemOf(a: ActionItem, w: Workspace): string | undefined {
  if (a.relatedProblem?.trim()) return a.relatedProblem.trim();
  if (a.origin?.kind === 'change' && a.origin.ref) {
    for (const sc of w.scenarios) {
      const c = sc.changes.find((x) => x.id === a.origin!.ref);
      if (c) return c.justification ? `${c.summary} — ${c.justification}` : c.summary;
    }
  }
  return undefined;
}

/**
 * Ação a partir de uma oportunidade de melhoria. Responsável e prazo ficam vazios:
 * nunca são preenchidos automaticamente (a equipe define).
 */
export function actionFromRecommendation(r: Recommendation, editedAction?: string): ActionItem {
  return {
    id: uid('act_'),
    description: editedAction?.trim() || r.action,
    priority: r.priority,
    status: 'a_fazer',
    successIndicator: r.successIndicator,
    dependencies: r.dependencies.join(' ') || undefined,
    relatedProblem: `${r.title} — ${r.problem}`,
    expectedValue: r.ceiling,
    origin: { kind: 'recommendation', ref: r.id },
    createdAt: nowIso(),
  };
}

/** Quantas oportunidades o "Montar meu plano" transforma em ação de uma vez (as de maior pontuação). */
export const STARTER_PLAN_SIZE = 5;

/** Oportunidades ainda sem ação e não rejeitadas, na ordem de pontuação. */
export function planCandidates(recs: Recommendation[], w: Workspace): Recommendation[] {
  return recs.filter((r) => w.recDecisions[r.id]?.status !== 'rejected' && !w.actions.some((a) => a.origin?.ref === r.id));
}
