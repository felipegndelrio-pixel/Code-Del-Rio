// Layout automático em camadas (esquerda → direita) para diagramas BPMN.
// - Coluna = caminho mais longo a partir da entrada (ignorando retornos).
// - Linha: o primeiro sucessor herda a linha do pai; desvios descem.
// - Arestas ortogonais; retornos (retrabalho) passam por cima do diagrama.

export type NodeKind = 'start' | 'end' | 'task' | 'subprocess' | 'gateway' | 'parallel';
export interface LNode {
  id: string;
  kind: NodeKind;
  order: number;
}
export interface LEdge {
  id: string;
  from: string;
  to: string;
  label?: string;
}
export interface Box {
  x: number;
  y: number;
  w: number;
  h: number;
}
export interface Placed extends LNode, Box {
  col: number;
  row: number;
}
export interface Routed extends LEdge {
  back: boolean;
  points: { x: number; y: number }[];
  labelBox?: Box;
}
export interface Layout {
  nodes: Map<string, Placed>;
  edges: Routed[];
  width: number;
  height: number;
}

export const SIZE: Record<NodeKind, { w: number; h: number }> = {
  start: { w: 36, h: 36 },
  end: { w: 36, h: 36 },
  task: { w: 150, h: 72 },
  subprocess: { w: 170, h: 84 },
  gateway: { w: 50, h: 50 },
  parallel: { w: 50, h: 50 },
};
const COL_W = 210;
const ROW_H = 130;
const MARGIN_X = 40;
const LOOP_GAP = 26;

export function layoutGraph(nodes: LNode[], edges: LEdge[]): Layout {
  const byId = new Map(nodes.map((n) => [n.id, n]));
  const valid = edges.filter((e) => byId.has(e.from) && byId.has(e.to));
  const out = new Map<string, LEdge[]>(nodes.map((n) => [n.id, []]));
  const inc = new Map<string, LEdge[]>(nodes.map((n) => [n.id, []]));
  for (const e of valid) {
    out.get(e.from)!.push(e);
    inc.get(e.to)!.push(e);
  }
  const ordered = [...nodes].sort((a, b) => a.order - b.order);

  // 1) Arestas de retorno via DFS a partir das entradas.
  const back = new Set<string>();
  const state = new Map<string, number>();
  const roots = [...ordered.filter((n) => n.kind === 'start'), ...ordered.filter((n) => n.kind !== 'start' && inc.get(n.id)!.length === 0), ...ordered];
  for (const r of roots) {
    if (state.get(r.id)) continue;
    const stack: { id: string; i: number }[] = [{ id: r.id, i: 0 }];
    state.set(r.id, 1);
    while (stack.length) {
      const top = stack[stack.length - 1];
      const outs = out.get(top.id)!;
      if (top.i < outs.length) {
        const e = outs[top.i++];
        const s = state.get(e.to) ?? 0;
        if (s === 1) back.add(e.id);
        else if (s === 0) {
          state.set(e.to, 1);
          stack.push({ id: e.to, i: 0 });
        }
      } else {
        state.set(top.id, 2);
        stack.pop();
      }
    }
  }
  const fwd = valid.filter((e) => !back.has(e.id));

  // 2) Colunas = caminho mais longo (Kahn).
  const indeg = new Map(nodes.map((n) => [n.id, 0]));
  for (const e of fwd) indeg.set(e.to, indeg.get(e.to)! + 1);
  const col = new Map(nodes.map((n) => [n.id, 0]));
  const queue = ordered.filter((n) => indeg.get(n.id) === 0).map((n) => n.id);
  const topo: string[] = [];
  while (queue.length) {
    const id = queue.shift()!;
    topo.push(id);
    for (const e of fwd.filter((x) => x.from === id)) {
      col.set(e.to, Math.max(col.get(e.to)!, col.get(id)! + 1));
      indeg.set(e.to, indeg.get(e.to)! - 1);
      if (indeg.get(e.to) === 0) queue.push(e.to);
    }
  }
  // Eventos de fim vão para a última coluna de seus predecessores + 1 (já garantido).

  // 3) Linhas: primeiro sucessor herda; demais descem para a próxima linha livre.
  const occupied = new Map<number, Set<number>>();
  const row = new Map<string, number>();
  const pref = new Map<string, number>();
  const place = (id: string) => {
    const c = col.get(id)!;
    const set = occupied.get(c) ?? new Set<number>();
    occupied.set(c, set);
    let r = pref.get(id) ?? 0;
    while (set.has(r)) r++;
    set.add(r);
    row.set(id, r);
    const succ = fwd.filter((e) => e.from === id);
    succ.forEach((e, i) => {
      if (pref.has(e.to)) return;
      pref.set(e.to, i === 0 ? r : r + i);
    });
  };
  for (const id of topo) place(id);

  // 4) Coordenadas. Espaço superior reservado para laços de retrabalho.
  const backEdges = valid.filter((e) => back.has(e.id));
  // Espaço superior para retornos e para rótulos de decisão (desenhados acima do losango).
  const top = 52 + (backEdges.length ? backEdges.length * LOOP_GAP : 0);
  const placed = new Map<string, Placed>();
  for (const n of nodes) {
    const s = SIZE[n.kind];
    const c = col.get(n.id)!;
    const r = row.get(n.id)!;
    const cx = MARGIN_X + c * COL_W + SIZE.subprocess.w / 2;
    const cy = top + r * ROW_H + SIZE.subprocess.h / 2;
    placed.set(n.id, { ...n, col: c, row: r, w: s.w, h: s.h, x: Math.round(cx - s.w / 2), y: Math.round(cy - s.h / 2) });
  }

  // 5) Roteamento ortogonal.
  const right = (b: Box) => ({ x: b.x + b.w, y: b.y + b.h / 2 });
  const left = (b: Box) => ({ x: b.x, y: b.y + b.h / 2 });
  const topC = (b: Box) => ({ x: b.x + b.w / 2, y: b.y });
  const bottom = (b: Box) => ({ x: b.x + b.w / 2, y: b.y + b.h });
  const isGw = (n: Placed) => n.kind === 'gateway' || n.kind === 'parallel';
  // Ocupação por coluna para escolher rotas de retorno livres.
  const byCol = new Map<number, Placed[]>();
  for (const n of placed.values()) byCol.set(n.col, [...(byCol.get(n.col) ?? []), n]);
  const maxBottom = Math.max(...[...placed.values()].map((n) => n.y + n.h));
  const freeAbove = (n: Placed) => !(byCol.get(n.col) ?? []).some((o) => o.row < n.row);
  const freeBelow = (n: Placed) => !(byCol.get(n.col) ?? []).some((o) => o.row > n.row);
  let loopTop = 0;
  let loopBottom = 0;
  const routed: Routed[] = valid.map((e) => {
    const a = placed.get(e.from)!;
    const b = placed.get(e.to)!;
    let pts: { x: number; y: number }[];
    const isBack = back.has(e.id);
    let labelAt: { x: number; y: number } | undefined;
    if (isBack) {
      const above = (freeAbove(a) && freeAbove(b)) || !(freeBelow(a) && freeBelow(b));
      if (above) {
        const y = 22 + loopTop++ * LOOP_GAP;
        const s = topC(a);
        const t = topC(b);
        pts = [s, { x: s.x, y }, { x: t.x, y }, t];
      } else {
        const y = maxBottom + 28 + loopBottom++ * LOOP_GAP;
        const s = bottom(a);
        const t = bottom(b);
        pts = [s, { x: s.x, y }, { x: t.x, y }, t];
      }
      labelAt = { x: pts[1].x + 6, y: pts[1].y - 16 };
    } else if (a.row === b.row) {
      pts = [right(a), left(b)];
      labelAt = { x: pts[0].x + 6, y: pts[0].y - 18 };
    } else if (b.row > a.row) {
      // Desce: gateways saem por baixo; demais pela direita.
      if (isGw(a)) {
        const s = bottom(a);
        const t = left(b);
        pts = [s, { x: s.x, y: t.y }, t];
        labelAt = { x: s.x + 6, y: s.y + 6 };
      } else {
        // Desce pelo corredor logo à direita da origem (entre colunas), sem cruzar caixas.
        const s = right(a);
        const t = left(b);
        const mx = Math.round(Math.min(s.x + 18, (s.x + t.x) / 2));
        pts = [s, { x: mx, y: s.y }, { x: mx, y: t.y }, t];
        labelAt = { x: mx + 6, y: t.y - 18 };
      }
    } else {
      // Sobe (junção no caminho principal): entra por baixo do destino.
      const s = right(a);
      const t = bottom(b);
      if (b.col > a.col) pts = [s, { x: t.x, y: s.y }, t];
      else {
        const mx = s.x + 20;
        pts = [s, { x: mx, y: s.y }, { x: mx, y: t.y + 20 }, { x: t.x, y: t.y + 20 }, t];
      }
      labelAt = { x: s.x + 6, y: s.y - 18 };
    }
    pts = pts.map((p) => ({ x: Math.round(p.x), y: Math.round(p.y) })).filter((p, i, arr) => i === 0 || p.x !== arr[i - 1].x || p.y !== arr[i - 1].y);
    const labelBox = e.label && labelAt ? { x: Math.round(labelAt.x), y: Math.round(labelAt.y), w: Math.max(24, e.label.length * 7), h: 14 } : undefined;
    return { ...e, back: isBack, points: pts, labelBox };
  });

  let width = 0;
  let height = 0;
  for (const n of placed.values()) {
    width = Math.max(width, n.x + n.w + MARGIN_X);
    height = Math.max(height, n.y + n.h + 60);
  }
  for (const e of routed) for (const pt of e.points) height = Math.max(height, pt.y + 30);
  return { nodes: placed, edges: routed, width, height };
}
