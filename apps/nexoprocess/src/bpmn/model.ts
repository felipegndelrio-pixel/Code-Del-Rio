// Converte o processo em BPMN 2.0 XML com diagrama (DI):
// - Plano macro: eventos de início/fim + um subprocesso recolhido por etapa.
// - Um plano por etapa (drill-down) com tarefas, decisões (gateway exclusivo),
//   paralelos (gateway paralelo de divisão) e eventos de entrada/saída da etapa.
// Limitações documentadas em docs/DECISOES_TECNICAS.md (ex.: junções paralelas
// não são inferidas; o XML é validado sintaticamente pelo metamodelo BPMN).
import { BRAND } from '../config/brand';
import { buildGraph, type Edge } from '../domain/graph';
import type { Activity, ProcessModel } from '../domain/types';
import { fmtDuration } from '../domain/units';
import { layoutGraph, type LEdge, type LNode, type Layout, type NodeKind } from './layout';

import { tr } from '../i18n';
export interface PlaneSpec {
  id: string;
  /** Elemento BPMN dono do plano (processo ou subprocesso). */
  owner: string;
  stage?: string;
  nodes: (LNode & { name: string; bpmnType: string; activityId?: string })[];
  edges: (LEdge & { kind?: Edge['kind']; rework?: boolean; inferred?: boolean })[];
  layout: Layout;
}

export interface BpmnBuild {
  xml: string;
  processId: string;
  macro: PlaneSpec;
  stages: PlaneSpec[];
  /** id do elemento BPMN → id da atividade */
  elementToActivity: Map<string, string>;
  activityToElement: Map<string, string>;
  /** id do subprocesso → nome da etapa */
  subToStage: Map<string, string>;
  stageToSub: Map<string, string>;
}

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

export function buildBpmn(p: ProcessModel): BpmnBuild {
  const g = buildGraph(p);
  const acts = [...g.byId.values()];
  const used = new Set<string>();
  const mkId = (prefix: string, raw: string) => {
    const base = `${prefix}_${raw.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^A-Za-z0-9_.-]/g, '_')}`.slice(0, 60);
    let id = base;
    let n = 2;
    while (used.has(id)) id = `${base}_${n++}`;
    used.add(id);
    return id;
  };
  const processId = mkId('Process', 'NexoProcess');
  const elementToActivity = new Map<string, string>();
  const activityToElement = new Map<string, string>();
  for (const a of acts) {
    const el = mkId(a.type === 'decision' ? 'Gateway' : a.type === 'start' ? 'Start' : a.type === 'end' ? 'End' : 'Task', a.id);
    elementToActivity.set(el, a.id);
    activityToElement.set(a.id, el);
  }
  const stageOf = (a: Activity) => a.stage || 'Sem etapa';
  const isEvent = (a: Activity) => a.type === 'start' || a.type === 'end';
  const stages = p.stageOrder.filter((s) => acts.some((a) => !isEvent(a) && stageOf(a) === s));
  for (const a of acts) if (!isEvent(a) && !stages.includes(stageOf(a))) stages.push(stageOf(a));
  const stageToSub = new Map<string, string>();
  const subToStage = new Map<string, string>();
  stages.forEach((s, i) => {
    const id = mkId('Stage', `${i + 1}`);
    stageToSub.set(s, id);
    subToStage.set(id, s);
  });

  // ------------------------------------------------------------ plano macro
  const macroOf = (a: Activity) => (isEvent(a) ? activityToElement.get(a.id)! : stageToSub.get(stageOf(a))!);
  const macroNodes: PlaneSpec['nodes'] = [];
  const startActs = acts.filter((a) => a.type === 'start');
  const endActs = acts.filter((a) => a.type === 'end');
  for (const a of startActs) macroNodes.push({ id: activityToElement.get(a.id)!, kind: 'start', order: a.order - 0.5, name: a.name, bpmnType: 'startEvent', activityId: a.id });
  stages.forEach((s, i) => macroNodes.push({ id: stageToSub.get(s)!, kind: 'subprocess', order: 1000 + i, name: s, bpmnType: 'subProcess' }));
  for (const a of endActs) macroNodes.push({ id: activityToElement.get(a.id)!, kind: 'end', order: 5000 + a.order, name: a.name, bpmnType: 'endEvent', activityId: a.id });
  let implicitStart: string | undefined;
  let implicitEnd: string | undefined;
  if (!startActs.length && acts.length) {
    implicitStart = mkId('Start', 'implicito');
    macroNodes.unshift({ id: implicitStart, kind: 'start', order: -1, name: 'Início', bpmnType: 'startEvent' });
  }
  const macroEdges: PlaneSpec['edges'] = [];
  const addMacro = (from: string, to: string, e?: Edge) => {
    const label = e?.kind === 'yes' ? tr('d.bpmn.yes') : e?.kind === 'no' ? tr('d.bpmn.no') : undefined;
    const existing = macroEdges.find((x) => x.from === from && x.to === to);
    if (existing) {
      if (existing.label && label && !existing.label.includes(label)) existing.label = `${existing.label}/${label}`;
      if (!label) existing.label = undefined;
      return;
    }
    macroEdges.push({ id: mkId('Flow', `m_${from}_${to}`), from, to, label, kind: e?.kind, rework: e ? e.back || !!g.byId.get(e.to)?.rework || !!g.byId.get(e.from)?.rework : false, inferred: e?.inferred });
  };
  for (const e of g.edges) {
    const a = g.byId.get(e.from)!;
    const b = g.byId.get(e.to)!;
    const ma = macroOf(a);
    const mb = macroOf(b);
    if (ma !== mb) addMacro(ma, mb, e);
  }
  if (implicitStart) for (const s of g.sources) addMacro(implicitStart, macroOf(g.byId.get(s)!));
  const needsImplicitEnd = acts.filter((a) => a.type !== 'end' && g.out.get(a.id)!.length === 0);
  if (needsImplicitEnd.length) {
    implicitEnd = mkId('End', 'implicito');
    macroNodes.push({ id: implicitEnd, kind: 'end', order: 9999, name: 'Fim', bpmnType: 'endEvent' });
    for (const a of needsImplicitEnd) addMacro(macroOf(a), implicitEnd);
  }
  const macro: PlaneSpec = { id: 'Plane_macro', owner: processId, nodes: macroNodes, edges: macroEdges, layout: layoutGraph(macroNodes, macroEdges) };

  // ------------------------------------------------------------ planos das etapas
  const stagePlanes: PlaneSpec[] = stages.map((s) => {
    const sub = stageToSub.get(s)!;
    const inner = acts.filter((a) => !isEvent(a) && stageOf(a) === s);
    const innerIds = new Set(inner.map((a) => a.id));
    const nodes: PlaneSpec['nodes'] = [];
    const edges: PlaneSpec['edges'] = [];
    const startId = mkId('Start', `${sub}_entrada`);
    nodes.push({ id: startId, kind: 'start', order: -1, name: 'Início da etapa', bpmnType: 'startEvent' });
    for (const a of inner)
      nodes.push({ id: activityToElement.get(a.id)!, kind: a.type === 'decision' ? 'gateway' : 'task', order: a.order, name: a.name, bpmnType: a.type === 'decision' ? 'exclusiveGateway' : 'task', activityId: a.id });
    const ends = new Map<string, string>();
    const endFor = (key: string, name: string) => {
      if (!ends.has(key)) {
        const id = mkId('End', `${sub}_${key}`);
        ends.set(key, id);
        nodes.push({ id, kind: 'end', order: 100000 + ends.size, name, bpmnType: 'endEvent' });
      }
      return ends.get(key)!;
    };
    const flow = (from: string, to: string, e?: Edge) =>
      edges.push({
        id: mkId('Flow', `${from}_${to}`),
        from,
        to,
        label: e?.kind === 'yes' ? tr('d.bpmn.yes') : e?.kind === 'no' ? tr('d.bpmn.no') : undefined,
        kind: e?.kind,
        rework: e ? e.back || !!g.byId.get(e.to)?.rework : false,
        inferred: e?.inferred,
      });
    // Entradas: sem predecessor, ou com predecessor fora da etapa.
    for (const a of inner) {
      const ins = g.inc.get(a.id)!;
      if (!ins.length || ins.some((e) => !innerIds.has(e.from))) {
        // Só liga a entrada se o predecessor externo não for um retorno interno.
        flow(startId, activityToElement.get(a.id)!);
      }
    }
    for (const a of inner) {
      const src = activityToElement.get(a.id)!;
      const outs = g.out.get(a.id)!;
      const targetOf = (e: Edge) => {
        const b = g.byId.get(e.to)!;
        if (innerIds.has(b.id)) return activityToElement.get(b.id)!;
        if (b.type === 'end') return endFor(`fim_${b.id}`, `Fim: ${b.name}`);
        return endFor(`para_${stageOf(b)}`, `Segue para: ${stageOf(b)}`);
      };
      const seqOuts = outs.filter((e) => e.kind === 'seq');
      if (a.type !== 'decision' && seqOuts.length > 1) {
        const split = mkId('Parallel', `${a.id}_divisao`);
        nodes.push({ id: split, kind: 'parallel', order: a.order + 0.5, name: '', bpmnType: 'parallelGateway' });
        flow(src, split);
        for (const e of seqOuts) flow(split, targetOf(e), e);
      } else for (const e of outs) flow(src, targetOf(e), e);
      if (!outs.length && a.type !== 'decision') flow(src, endFor('fim_etapa', 'Fim'));
    }
    if (!edges.some((e) => e.from === startId) && inner.length) flow(startId, activityToElement.get(inner[0].id)!);
    return { id: mkId('Plane', sub), owner: sub, stage: s, nodes, edges, layout: layoutGraph(nodes, edges) };
  });

  const xml = toXml(p, processId, macro, stagePlanes, g);
  return { xml, processId, macro, stages: stagePlanes, elementToActivity, activityToElement, subToStage, stageToSub };
}

function doc(a: Activity | undefined): string {
  if (!a) return '';
  const parts = [
    a.owner && `Responsável: ${a.owner}`,
    a.duration !== undefined && `Duração: ${fmtDuration(a.duration, a.unit)}`,
    a.people !== undefined && `Pessoas: ${a.people}`,
    a.wait !== undefined && `Espera: ${fmtDuration(a.wait, a.unit)}`,
    a.lean && `Lean: ${a.lean}`,
    a.rework && 'Retrabalho',
    a.critical && 'Crítica',
    a.notes,
  ].filter(Boolean);
  return parts.length ? `<documentation>${esc(parts.join(' · '))}</documentation>` : '';
}

function semantic(plane: PlaneSpec, g: ReturnType<typeof buildGraph>, nested: Map<string, string>): string {
  const incoming = new Map<string, string[]>();
  const outgoing = new Map<string, string[]>();
  for (const e of plane.edges) {
    outgoing.set(e.from, [...(outgoing.get(e.from) ?? []), e.id]);
    incoming.set(e.to, [...(incoming.get(e.to) ?? []), e.id]);
  }
  const parts: string[] = [];
  for (const n of plane.nodes) {
    const ins = (incoming.get(n.id) ?? []).map((id) => `<incoming>${id}</incoming>`).join('');
    const outs = (outgoing.get(n.id) ?? []).map((id) => `<outgoing>${id}</outgoing>`).join('');
    const name = n.name ? ` name="${esc(n.name)}"` : '';
    const a = n.activityId ? g.byId.get(n.activityId) : undefined;
    if (n.bpmnType === 'subProcess') parts.push(`<subProcess id="${n.id}"${name}>${ins}${outs}${nested.get(n.id) ?? ''}</subProcess>`);
    else parts.push(`<${n.bpmnType} id="${n.id}"${name}>${doc(a)}${ins}${outs}</${n.bpmnType}>`);
  }
  for (const e of plane.edges) {
    const name = e.label ? ` name="${esc(e.label)}"` : '';
    parts.push(`<sequenceFlow id="${e.id}"${name} sourceRef="${e.from}" targetRef="${e.to}" />`);
  }
  return parts.join('');
}

function di(plane: PlaneSpec, diagramId: string): string {
  const L = plane.layout;
  const shapes = plane.nodes.map((n) => {
    const b = L.nodes.get(n.id)!;
    const expanded = n.bpmnType === 'subProcess' ? ' isExpanded="false"' : '';
    const marker = n.bpmnType === 'exclusiveGateway' ? ' isMarkerVisible="true"' : '';
    // Eventos: rótulo abaixo. Decisões: rótulo acima (abaixo saem os caminhos "Não").
    const label =
      n.kind === 'start' || n.kind === 'end'
        ? `<bpmndi:BPMNLabel><dc:Bounds x="${b.x - 30}" y="${b.y + b.h + 6}" width="${b.w + 60}" height="28" /></bpmndi:BPMNLabel>`
        : n.kind === 'gateway'
          ? `<bpmndi:BPMNLabel><dc:Bounds x="${b.x - 45}" y="${b.y - 34}" width="${b.w + 90}" height="28" /></bpmndi:BPMNLabel>`
          : '';
    return `<bpmndi:BPMNShape id="${n.id}_di" bpmnElement="${n.id}"${expanded}${marker}><dc:Bounds x="${b.x}" y="${b.y}" width="${b.w}" height="${b.h}" />${label}</bpmndi:BPMNShape>`;
  });
  const edges = L.edges.map((e) => {
    const pts = e.points.map((p) => `<di:waypoint x="${p.x}" y="${p.y}" />`).join('');
    const lb = e.labelBox ? `<bpmndi:BPMNLabel><dc:Bounds x="${e.labelBox.x}" y="${e.labelBox.y}" width="${e.labelBox.w}" height="${e.labelBox.h}" /></bpmndi:BPMNLabel>` : '';
    return `<bpmndi:BPMNEdge id="${e.id}_di" bpmnElement="${e.id}">${pts}${lb}</bpmndi:BPMNEdge>`;
  });
  return `<bpmndi:BPMNDiagram id="${diagramId}"><bpmndi:BPMNPlane id="${plane.id}" bpmnElement="${plane.owner}">${shapes.join('')}${edges.join('')}</bpmndi:BPMNPlane></bpmndi:BPMNDiagram>`;
}

function toXml(p: ProcessModel, processId: string, macro: PlaneSpec, stages: PlaneSpec[], g: ReturnType<typeof buildGraph>): string {
  const nested = new Map(stages.map((s) => [s.owner, semantic(s, g, new Map())]));
  const body = semantic(macro, g, nested);
  const diagrams = [di(macro, 'Diagram_macro'), ...stages.map((s, i) => di(s, `Diagram_stage_${i + 1}`))].join('');
  const docText = p.description ? `<documentation>${esc(p.description)}</documentation>` : '';
  return (
    `<?xml version="1.0" encoding="UTF-8"?>` +
    `<definitions xmlns="http://www.omg.org/spec/BPMN/20100524/MODEL" xmlns:bpmndi="http://www.omg.org/spec/BPMN/20100524/DI" xmlns:dc="http://www.omg.org/spec/DD/20100524/DC" xmlns:di="http://www.omg.org/spec/DD/20100524/DI" id="Definitions_NexoProcess" targetNamespace="urn:nexoprocess:bpmn" exporter="${esc(BRAND.name)}" exporterVersion="${BRAND.version}">` +
    `<process id="${processId}" name="${esc(p.name)}" isExecutable="false">${docText}${body}</process>` +
    diagrams +
    `</definitions>`
  );
}

export type { NodeKind };
