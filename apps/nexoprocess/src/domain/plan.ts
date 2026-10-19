// Regras do plano de ação: uma ação só é "concluída" com registro do resultado observado.
import type { ActionItem, Workspace } from './types';

export function completionIssue(a: ActionItem): string | null {
  if (a.status !== 'concluida') return null;
  if (!a.observedResult?.trim()) return 'Registre o resultado observado para concluir a ação.';
  if (!a.completedAt) return 'Informe a data de conclusão.';
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
