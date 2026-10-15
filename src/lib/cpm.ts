// Método do Caminho Crítico (CPM) sobre os itens-folha da EAP.
// Só calcula quando há dados suficientes: todas as folhas com início e fim
// planejados e ao menos uma dependência cadastrada, sem ciclos.
import type { WbsDependency, WbsItem } from './types';
import { daysBetween, parseDate } from './kpi';

export interface CpmNode {
  id: string;
  duration: number;
  es: number;
  ef: number;
  ls: number;
  lf: number;
  slack: number;
  critical: boolean;
}

export type CpmResult =
  | { ok: true; nodes: Record<string, CpmNode>; projectDuration: number; criticalPath: string[] }
  | { ok: false; reason: string };

export function criticalPath(items: WbsItem[], deps: WbsDependency[]): CpmResult {
  const parents = new Set(items.map((i) => i.parent_id).filter(Boolean));
  const leaves = items.filter((i) => !parents.has(i.id));
  if (!leaves.length) return { ok: false, reason: 'Nenhuma atividade na EAP' };
  const missing = leaves.filter((l) => !parseDate(l.planned_start) || !parseDate(l.planned_end));
  if (missing.length)
    return { ok: false, reason: `Dados insuficientes: ${missing.length} atividade(s) sem início/fim planejado (${missing.slice(0, 3).map((m) => m.code).join(', ')})` };
  const ids = new Set(leaves.map((l) => l.id));
  const edges = deps.filter((d) => ids.has(d.predecessor_id) && ids.has(d.successor_id));
  if (!edges.length) return { ok: false, reason: 'Dados insuficientes: nenhuma dependência entre atividades cadastrada' };

  const dur: Record<string, number> = {};
  for (const l of leaves) dur[l.id] = daysBetween(parseDate(l.planned_start)!, parseDate(l.planned_end)!) + 1;

  // Ordenação topológica (Kahn)
  const indeg: Record<string, number> = {};
  const succ: Record<string, { id: string; lag: number }[]> = {};
  const pred: Record<string, { id: string; lag: number }[]> = {};
  for (const l of leaves) {
    indeg[l.id] = 0;
    succ[l.id] = [];
    pred[l.id] = [];
  }
  for (const e of edges) {
    indeg[e.successor_id]++;
    succ[e.predecessor_id].push({ id: e.successor_id, lag: e.lag_days || 0 });
    pred[e.successor_id].push({ id: e.predecessor_id, lag: e.lag_days || 0 });
  }
  const queue = leaves.filter((l) => indeg[l.id] === 0).map((l) => l.id);
  const order: string[] = [];
  while (queue.length) {
    const n = queue.shift()!;
    order.push(n);
    for (const s of succ[n]) if (--indeg[s.id] === 0) queue.push(s.id);
  }
  if (order.length !== leaves.length) return { ok: false, reason: 'Dependências circulares detectadas na EAP' };

  const nodes: Record<string, CpmNode> = {};
  for (const id of order) {
    const es = Math.max(0, ...pred[id].map((p) => nodes[p.id].ef + p.lag));
    nodes[id] = { id, duration: dur[id], es, ef: es + dur[id], ls: 0, lf: 0, slack: 0, critical: false };
  }
  const projectDuration = Math.max(...Object.values(nodes).map((n) => n.ef));
  for (const id of [...order].reverse()) {
    const n = nodes[id];
    n.lf = succ[id].length ? Math.min(...succ[id].map((s) => nodes[s.id].ls - s.lag)) : projectDuration;
    n.ls = n.lf - n.duration;
    n.slack = n.ls - n.es;
    n.critical = n.slack === 0;
  }
  const criticalPath = order.filter((id) => nodes[id].critical);
  return { ok: true, nodes, projectDuration, criticalPath };
}
