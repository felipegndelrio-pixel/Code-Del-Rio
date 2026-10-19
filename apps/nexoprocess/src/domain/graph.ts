// Estrutura de fluxo do processo: arestas, ciclos de retrabalho (arestas de
// retorno), ordem topológica e caminho mais longo.
import type { Activity, ProcessModel } from './types';

export type EdgeKind = 'seq' | 'yes' | 'no';
export interface Edge {
  id: string;
  from: string;
  to: string;
  kind: EdgeKind;
  /** Gerada pela ordem das linhas, não informada pelo usuário. */
  inferred: boolean;
  /** Aresta de retorno (fecha um ciclo — normalmente retrabalho). */
  back: boolean;
}

export interface ProcessGraph {
  byId: Map<string, Activity>;
  edges: Edge[];
  out: Map<string, Edge[]>;
  inc: Map<string, Edge[]>;
  /** Nós de entrada (eventos de início ou atividades sem predecessor). */
  sources: string[];
  /** Nós de saída (eventos de fim ou atividades sem sucessor). */
  sinks: string[];
  backEdges: Edge[];
  /** Ordem topológica considerando apenas arestas de avanço. */
  topo: string[];
  unreachable: string[];
  dangling: { from: string; to: string; kind: EdgeKind }[];
  hasParallel: boolean;
  hasDecision: boolean;
}

export function sortedActivities(p: Pick<ProcessModel, 'activities' | 'stageOrder'>): Activity[] {
  const stageIdx = new Map(p.stageOrder.map((s, i) => [s, i]));
  return [...p.activities].sort((a, b) => a.order - b.order || (stageIdx.get(a.stage) ?? 999) - (stageIdx.get(b.stage) ?? 999));
}

export function buildGraph(p: Pick<ProcessModel, 'activities' | 'stageOrder'>): ProcessGraph {
  const acts = sortedActivities(p);
  const byId = new Map<string, Activity>();
  for (const a of acts) if (!byId.has(a.id)) byId.set(a.id, a);
  const edges: Edge[] = [];
  const dangling: ProcessGraph['dangling'] = [];
  const add = (from: string, to: string | undefined, kind: EdgeKind, inferred: boolean) => {
    if (!to) return;
    if (!byId.has(to)) {
      dangling.push({ from, to, kind });
      return;
    }
    if (edges.some((e) => e.from === from && e.to === to && e.kind === kind)) return;
    edges.push({ id: `${from}->${to}:${kind}`, from, to, kind, inferred, back: false });
  };
  for (const a of byId.values()) {
    if (a.type === 'decision') {
      add(a.id, a.nextYes, 'yes', !!a.flowInferred);
      add(a.id, a.nextNo, 'no', !!a.flowInferred);
      for (const n of a.next) add(a.id, n, 'seq', !!a.flowInferred);
    } else if (a.type !== 'end') {
      for (const n of a.next) add(a.id, n, 'seq', !!a.flowInferred);
    }
  }
  const out = new Map<string, Edge[]>();
  const inc = new Map<string, Edge[]>();
  for (const id of byId.keys()) {
    out.set(id, []);
    inc.set(id, []);
  }
  for (const e of edges) {
    out.get(e.from)!.push(e);
    inc.get(e.to)!.push(e);
  }

  // Entradas: eventos de início; se não houver, nós sem predecessor; se ainda
  // assim nada (processo todo em ciclo), a primeira atividade da ordem.
  const ids = [...byId.keys()];
  let sources = ids.filter((id) => byId.get(id)!.type === 'start');
  if (!sources.length) sources = ids.filter((id) => inc.get(id)!.length === 0);
  if (!sources.length && ids.length) sources = [ids[0]];

  // DFS a partir das entradas para marcar arestas de retorno e alcançabilidade.
  const state = new Map<string, 0 | 1 | 2>();
  const visit = (root: string) => {
    const stack: { id: string; i: number }[] = [{ id: root, i: 0 }];
    state.set(root, 1);
    while (stack.length) {
      const top = stack[stack.length - 1];
      const outs = out.get(top.id)!;
      if (top.i < outs.length) {
        const e = outs[top.i++];
        const s = state.get(e.to) ?? 0;
        if (s === 1) e.back = true;
        else if (s === 0) {
          state.set(e.to, 1);
          stack.push({ id: e.to, i: 0 });
        }
      } else {
        state.set(top.id, 2);
        stack.pop();
      }
    }
  };
  for (const s of sources) if (!state.get(s)) visit(s);
  const unreachable = ids.filter((id) => !state.get(id));
  // Visita também os inalcançáveis para classificar seus ciclos.
  for (const id of unreachable) if (!state.get(id)) visit(id);

  // Kahn sobre arestas de avanço.
  const indeg = new Map(ids.map((id) => [id, 0]));
  for (const e of edges) if (!e.back) indeg.set(e.to, indeg.get(e.to)! + 1);
  const queue = ids.filter((id) => indeg.get(id) === 0);
  const topo: string[] = [];
  while (queue.length) {
    const id = queue.shift()!;
    topo.push(id);
    for (const e of out.get(id)!) {
      if (e.back) continue;
      indeg.set(e.to, indeg.get(e.to)! - 1);
      if (indeg.get(e.to) === 0) queue.push(e.to);
    }
  }
  for (const id of ids) if (!topo.includes(id)) topo.push(id);

  const sinks = ids.filter((id) => byId.get(id)!.type === 'end' || out.get(id)!.filter((e) => !e.back).length === 0);
  const hasParallel = [...byId.values()].some((a) => a.type !== 'decision' && out.get(a.id)!.filter((e) => !e.back).length > 1);
  const hasDecision = [...byId.values()].some((a) => a.type === 'decision');

  return { byId, edges, out, inc, sources, sinks, backEdges: edges.filter((e) => e.back), topo, unreachable, dangling, hasParallel, hasDecision };
}

/**
 * Caminho mais longo (em peso de nó) das entradas até as saídas, ignorando
 * arestas de retorno. Para decisões representa o pior caso entre os caminhos
 * alternativos; para paralelos, o ramo mais demorado (que é o que define o fim).
 */
export function longestPath(g: ProcessGraph, weight: (a: Activity) => number): { total: number; path: string[] } {
  const dist = new Map<string, number>();
  const prev = new Map<string, string | undefined>();
  const reachable = new Set<string>();
  for (const s of g.sources) reachable.add(s);
  for (const id of g.topo) {
    if (!reachable.has(id)) continue;
    const w = weight(g.byId.get(id)!);
    let best = 0;
    let bestPrev: string | undefined;
    for (const e of g.inc.get(id)!) {
      if (e.back || !reachable.has(e.from)) continue;
      const d = dist.get(e.from)!;
      if (bestPrev === undefined || d > best) {
        best = d;
        bestPrev = e.from;
      }
    }
    dist.set(id, best + w);
    prev.set(id, bestPrev);
    for (const e of g.out.get(id)!) if (!e.back) reachable.add(e.to);
  }
  let end: string | undefined;
  let total = 0;
  for (const s of g.sinks) {
    if (!dist.has(s)) continue;
    if (end === undefined || dist.get(s)! > total) {
      end = s;
      total = dist.get(s)!;
    }
  }
  const path: string[] = [];
  for (let cur = end; cur !== undefined; cur = prev.get(cur)) path.unshift(cur);
  return { total, path };
}

/** Nós alcançáveis a partir das entradas, ignorando retornos. */
export function forwardReachable(g: ProcessGraph): Set<string> {
  const seen = new Set<string>(g.sources);
  const q = [...g.sources];
  while (q.length) {
    const id = q.shift()!;
    for (const e of g.out.get(id)!) {
      if (e.back || seen.has(e.to)) continue;
      seen.add(e.to);
      q.push(e.to);
    }
  }
  return seen;
}
