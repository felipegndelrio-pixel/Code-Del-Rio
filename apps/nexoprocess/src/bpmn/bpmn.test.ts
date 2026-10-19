import { BpmnModdle } from 'bpmn-moddle';
import { describe, expect, it } from 'vitest';
import { demoProcess } from '../domain/demo';
import { newActivity, newProcess } from '../domain/factory';
import type { Activity, ProcessModel } from '../domain/types';
import { layoutGraph, type Box } from './layout';
import { buildBpmn } from './model';

function proc(acts: (Partial<Activity> & { id: string })[]): ProcessModel {
  const p = newProcess('Teste');
  p.activities = acts.map((a, i) => newActivity({ stage: 'E1', name: a.id, order: i + 1, ...a }));
  p.stageOrder = [...new Set(p.activities.map((a) => a.stage))];
  return p;
}

/** Segmento ortogonal atravessa o interior da caixa? */
const segHits = (p: { x: number; y: number }, q: { x: number; y: number }, b: Box) => {
  const x1 = Math.min(p.x, q.x), x2 = Math.max(p.x, q.x), y1 = Math.min(p.y, q.y), y2 = Math.max(p.y, q.y);
  return x1 < b.x + b.w - 1 && x2 > b.x + 1 && y1 < b.y + b.h - 1 && y2 > b.y + 1;
};
const overlap = (a: Box, b: Box) => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;

async function parse(xml: string) {
  const moddle = new BpmnModdle();
  const res = await moddle.fromXML(xml);
  return res;
}

describe('layout', () => {
  it('linear: mesma linha, colunas crescentes, sem sobreposição', () => {
    const L = layoutGraph(
      [
        { id: 's', kind: 'start', order: 0 },
        { id: 'a', kind: 'task', order: 1 },
        { id: 'b', kind: 'task', order: 2 },
        { id: 'e', kind: 'end', order: 3 },
      ],
      [
        { id: '1', from: 's', to: 'a' },
        { id: '2', from: 'a', to: 'b' },
        { id: '3', from: 'b', to: 'e' },
      ],
    );
    const ns = [...L.nodes.values()];
    expect(new Set(ns.map((n) => n.row))).toEqual(new Set([0]));
    expect(ns.map((n) => n.col)).toEqual([0, 1, 2, 3]);
    expect(L.edges.every((e) => e.points.length >= 2)).toBe(true);
  });
  it('decisão e laço: desvio desce, retorno é marcado e nada se sobrepõe', () => {
    const L = layoutGraph(
      [
        { id: 'a', kind: 'task', order: 1 },
        { id: 'g', kind: 'gateway', order: 2 },
        { id: 'b', kind: 'task', order: 3 },
        { id: 'c', kind: 'task', order: 4 },
      ],
      [
        { id: '1', from: 'a', to: 'g' },
        { id: '2', from: 'g', to: 'b', label: 'Sim' },
        { id: '3', from: 'g', to: 'c', label: 'Não' },
        { id: '4', from: 'c', to: 'a' },
      ],
    );
    expect(L.nodes.get('b')!.row).toBe(0);
    expect(L.nodes.get('c')!.row).toBe(1);
    expect(L.edges.find((e) => e.id === '4')!.back).toBe(true);
    const ns = [...L.nodes.values()];
    for (let i = 0; i < ns.length; i++) for (let j = i + 1; j < ns.length; j++) expect(overlap(ns[i], ns[j])).toBe(false);
    // O laço de retorno não atravessa nenhum nó (exceto origem e destino).
    const loop = L.edges.find((e) => e.id === '4')!;
    for (const n of ns.filter((x) => x.id !== 'c' && x.id !== 'a')) for (let i = 1; i < loop.points.length; i++) expect(segHits(loop.points[i - 1], loop.points[i], n)).toBe(false);
  });
  it('exemplo: nenhuma aresta atravessa nós que não são seus extremos', () => {
    const b = buildBpmn(demoProcess());
    for (const pl of [b.macro, ...b.stages]) {
      const ns = [...pl.layout.nodes.values()];
      for (const e of pl.layout.edges)
        for (const n of ns.filter((x) => x.id !== e.from && x.id !== e.to))
          for (let i = 1; i < e.points.length; i++) expect(segHits(e.points[i - 1], e.points[i], n), `${pl.stage ?? 'macro'}: ${e.from}->${e.to} cruza ${n.id}`).toBe(false);
    }
  });
});

describe('BPMN 2.0 XML', () => {
  it('exemplo demonstrativo gera XML válido pelo metamodelo, com DI para todos os elementos', async () => {
    const b = buildBpmn(demoProcess());
    const { rootElement, warnings, elementsById } = await parse(b.xml);
    expect(warnings).toEqual([]);
    expect(rootElement.$type).toBe('bpmn:Definitions');
    const proc = rootElement.rootElements.find((e: any) => e.$type === 'bpmn:Process');
    const subs = proc.flowElements.filter((e: any) => e.$type === 'bpmn:SubProcess');
    expect(subs.map((s: any) => s.name)).toEqual(['Recebimento', 'Análise de crédito', 'Separação', 'Expedição']);
    // 1 diagrama macro + 1 por etapa
    expect(rootElement.diagrams).toHaveLength(5);
    // Todo flow node e sequence flow tem forma/aresta no DI
    const diRefs = new Set<string>();
    for (const d of rootElement.diagrams) for (const el of d.plane.planeElement) diRefs.add(el.bpmnElement.id);
    const all = Object.values(elementsById as Record<string, any>).filter((e) => /bpmn:(Task|StartEvent|EndEvent|ExclusiveGateway|ParallelGateway|SubProcess|SequenceFlow)$/.test(e.$type));
    for (const e of all) expect(diRefs.has(e.id)).toBe(true);
    // Decisões viram gateways exclusivos com caminhos Sim/Não
    const d1 = elementsById[b.activityToElement.get('D1')!];
    expect(d1.$type).toBe('bpmn:ExclusiveGateway');
    expect(d1.outgoing.map((f: any) => f.name).sort()).toEqual(['Não', 'Sim']);
    // Subprocesso recolhido (drill-down)
    const macroPlane = rootElement.diagrams[0].plane;
    const subShape = macroPlane.planeElement.find((x: any) => x.bpmnElement.$type === 'bpmn:SubProcess');
    expect(subShape.isExpanded).toBe(false);
  });

  it('caminhos alternativos entre etapas aparecem no macro com rótulo', () => {
    const b = buildBpmn(demoProcess());
    const recusado = b.activityToElement.get('X1')!;
    const toRefused = b.macro.edges.find((e) => e.to === recusado)!;
    expect(toRefused.label).toBe('Não');
  });

  it('sem início/fim informados cria eventos implícitos; paralelo gera gateway paralelo', async () => {
    const p = proc([
      { id: 'A', duration: 1, next: ['B', 'C'] },
      { id: 'B', duration: 1, next: ['D'] },
      { id: 'C', duration: 1, next: ['D'] },
      { id: 'D', duration: 1 },
    ]);
    const b = buildBpmn(p);
    const { warnings, elementsById } = await parse(b.xml);
    expect(warnings).toEqual([]);
    const types = Object.values(elementsById as Record<string, any>).map((e) => e.$type);
    expect(types).toContain('bpmn:ParallelGateway');
    expect(b.macro.nodes.map((n) => n.name)).toEqual(['Início', 'E1', 'Fim']);
  });

  it('nomes com caracteres especiais são escapados e IDs são válidos', async () => {
    const p = proc([{ id: 'x 1/á', name: 'Aprovar <R$ & "tudo">', duration: 1 }]);
    const b = buildBpmn(p);
    const { warnings } = await parse(b.xml);
    expect(warnings).toEqual([]);
    expect(b.xml).toContain('Aprovar &lt;R$ &amp; &quot;tudo&quot;&gt;');
    expect([...b.elementToActivity.keys()][0]).toMatch(/^[A-Za-z][A-Za-z0-9_.-]*$/);
  });
});
