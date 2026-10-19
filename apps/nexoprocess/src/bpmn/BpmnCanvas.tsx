// Mapa BPMN interativo (bpmn-js). Visão macro → clique na etapa abre o plano
// detalhado; clique na atividade abre os detalhes. Zoom, ajustar à tela e pan
// (mouse e toque). A marca d'água do bpmn.io permanece visível (licença).
import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from 'react';
import 'bpmn-js/dist/assets/diagram-js.css';
import 'bpmn-js/dist/assets/bpmn-js.css';
import { ChevronLeft, Maximize2, Minus, Plus } from 'lucide-react';
import type { Theme } from '../state/theme';
import { createViewer } from './render';
import type { BpmnBuild } from './model';

export interface Decoration {
  classes: string[];
  badges: { text: string; tone: 'bad' | 'amber' | 'info' }[];
}

export interface BpmnCanvasHandle {
  saveSVG: () => Promise<string>;
}

interface Props {
  build: BpmnBuild;
  theme: Theme;
  stage: string | null;
  onStageChange: (stage: string | null) => void;
  selected?: string | null;
  onSelect: (activityId: string) => void;
  /** Decoração por id de atividade (e por nome de etapa para o macro, com prefixo "stage:"). */
  decorations: Map<string, Decoration>;
  height?: string;
}

const BpmnCanvas = forwardRef<BpmnCanvasHandle, Props>(function BpmnCanvas({ build, theme, stage, onStageChange, selected, onSelect, decorations, height = 'min(68vh, 640px)' }, ref) {
  const host = useRef<HTMLDivElement>(null);
  const viewerRef = useRef<any>(null);
  const macroRoot = useRef<any>(null);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const cb = useRef({ onStageChange, onSelect, build });
  cb.current = { onStageChange, onSelect, build };

  useImperativeHandle(ref, () => ({
    saveSVG: async () => (await viewerRef.current.saveSVG()).svg as string,
  }));

  // Cria o viewer (recria ao trocar tema ou XML).
  useEffect(() => {
    let disposed = false;
    setReady(false);
    setError(null);
    (async () => {
      try {
        const viewer = await createViewer(host.current!, theme, true);
        if (disposed) return viewer.destroy();
        viewerRef.current = viewer;
        await viewer.importXML(build.xml);
        if (disposed) return;
        const canvas = viewer.get('canvas');
        macroRoot.current = canvas.getRootElement();
        const eventBus = viewer.get('eventBus');
        eventBus.on('element.click', (e: any) => {
          const el = e.element;
          const { build: b, onSelect: sel, onStageChange: st } = cb.current;
          if (el.type === 'bpmn:SubProcess' && b.subToStage.has(el.id)) {
            st(b.subToStage.get(el.id)!);
            return;
          }
          const act = b.elementToActivity.get(el.id);
          if (act) sel(act);
        });
        eventBus.on('root.set', (e: any) => {
          const id: string = e.element?.id ?? '';
          const sub = id.endsWith('_plane') ? id.slice(0, -'_plane'.length) : '';
          const s = cb.current.build.subToStage.get(sub) ?? null;
          cb.current.onStageChange(s);
        });
        setReady(true);
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e));
      }
    })();
    return () => {
      disposed = true;
      viewerRef.current?.destroy();
      viewerRef.current = null;
    };
  }, [build.xml, theme]);

  // Navega entre macro e etapa.
  useEffect(() => {
    const v = viewerRef.current;
    if (!ready || !v) return;
    const canvas = v.get('canvas');
    const target = stage ? canvas.findRoot(`${build.stageToSub.get(stage)}_plane`) : macroRoot.current;
    if (target && canvas.getRootElement() !== target) canvas.setRootElement(target);
    canvas.zoom('fit-viewport', 'auto');
    const vb = canvas.viewbox();
    if (vb.scale > 1.1) canvas.zoom(1.1, 'auto');
  }, [stage, ready, build]);

  // Marcadores e selos.
  useEffect(() => {
    const v = viewerRef.current;
    if (!ready || !v) return;
    const canvas = v.get('canvas');
    const registry = v.get('elementRegistry');
    const overlays = v.get('overlays');
    overlays.clear();
    const rework = new Set<string>();
    const inferred = new Set<string>();
    for (const pl of [build.macro, ...build.stages]) for (const e of pl.edges) {
      if (e.rework) rework.add(e.id);
      if (e.inferred) inferred.add(e.id);
    }
    for (const el of registry.getAll()) {
      if (!el.businessObject || el.type === 'label') continue;
      for (const c of ['np-clickable', 'np-bottleneck', 'np-rework', 'np-critical', 'np-selected', 'np-lean-VA', 'np-lean-NNVA', 'np-lean-W', 'np-flow-rework', 'np-flow-inferred']) canvas.removeMarker(el, c);
      if (rework.has(el.id)) canvas.addMarker(el, 'np-flow-rework');
      if (inferred.has(el.id)) canvas.addMarker(el, 'np-flow-inferred');
      let deco: Decoration | undefined;
      const act = build.elementToActivity.get(el.id);
      if (act) {
        canvas.addMarker(el, 'np-clickable');
        deco = decorations.get(act);
        if (selected === act) canvas.addMarker(el, 'np-selected');
      } else if (build.subToStage.has(el.id)) {
        canvas.addMarker(el, 'np-clickable');
        deco = decorations.get(`stage:${build.subToStage.get(el.id)}`);
      }
      if (!deco) continue;
      for (const c of deco.classes) canvas.addMarker(el, c);
      if (deco.badges.length) {
        const html = document.createElement('div');
        html.style.cssText = 'display:flex;gap:4px;';
        for (const b of deco.badges) {
          const s = document.createElement('span');
          s.className = `np-badge np-badge-${b.tone}`;
          s.textContent = b.text;
          html.appendChild(s);
        }
        overlays.add(el.id, 'np', { position: { top: -11, left: 4 }, html });
      }
    }
  }, [ready, decorations, selected, build, stage]);

  // Pan por toque (1 dedo) e zoom por pinça (2 dedos).
  useEffect(() => {
    const el = host.current;
    if (!el) return;
    const pts = new Map<number, { x: number; y: number }>();
    let lastDist = 0;
    const down = (e: PointerEvent) => {
      if (e.pointerType !== 'touch') return;
      pts.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (pts.size === 2) {
        const [a, b] = [...pts.values()];
        lastDist = Math.hypot(a.x - b.x, a.y - b.y);
      }
    };
    const move = (e: PointerEvent) => {
      if (e.pointerType !== 'touch' || !pts.has(e.pointerId) || !viewerRef.current) return;
      const canvas = viewerRef.current.get('canvas');
      const prev = pts.get(e.pointerId)!;
      pts.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (pts.size === 1) canvas.scroll({ dx: e.clientX - prev.x, dy: e.clientY - prev.y });
      else if (pts.size === 2) {
        const [a, b] = [...pts.values()];
        const d = Math.hypot(a.x - b.x, a.y - b.y);
        if (lastDist > 0) {
          const rect = el.getBoundingClientRect();
          const z = canvas.zoom();
          canvas.zoom(Math.min(3, Math.max(0.2, z * (d / lastDist))), { x: (a.x + b.x) / 2 - rect.left, y: (a.y + b.y) / 2 - rect.top });
        }
        lastDist = d;
      }
    };
    const up = (e: PointerEvent) => {
      pts.delete(e.pointerId);
      if (pts.size < 2) lastDist = 0;
    };
    el.addEventListener('pointerdown', down);
    el.addEventListener('pointermove', move);
    el.addEventListener('pointerup', up);
    el.addEventListener('pointercancel', up);
    return () => {
      el.removeEventListener('pointerdown', down);
      el.removeEventListener('pointermove', move);
      el.removeEventListener('pointerup', up);
      el.removeEventListener('pointercancel', up);
    };
  }, []);

  const zoom = (f: number | 'fit') => {
    const canvas = viewerRef.current?.get('canvas');
    if (!canvas) return;
    if (f === 'fit') canvas.zoom('fit-viewport', 'auto');
    else canvas.zoom(Math.min(3, Math.max(0.2, canvas.zoom() * f)));
  };

  return (
    <div className="relative overflow-hidden rounded-2xl border border-line/15 bg-surface2/30">
      <div className="no-print absolute left-2 top-2 z-10 flex flex-wrap gap-1">
        {stage && (
          <button type="button" onClick={() => onStageChange(null)} className="inline-flex min-h-[40px] items-center gap-1 rounded-xl border border-line/20 bg-surface px-3 text-sm font-semibold text-ink shadow-card hover:border-brand/60">
            <ChevronLeft className="h-4 w-4" aria-hidden /> Visão macro
          </button>
        )}
      </div>
      <div className="no-print absolute right-2 top-2 z-10 flex gap-1">
        <CtrlBtn label="Aproximar" onClick={() => zoom(1.25)}>
          <Plus className="h-4 w-4" />
        </CtrlBtn>
        <CtrlBtn label="Afastar" onClick={() => zoom(0.8)}>
          <Minus className="h-4 w-4" />
        </CtrlBtn>
        <CtrlBtn label="Ajustar à tela" onClick={() => zoom('fit')}>
          <Maximize2 className="h-4 w-4" />
        </CtrlBtn>
      </div>
      <div ref={host} className="np-canvas w-full" style={{ height }} role="img" aria-label={stage ? `Mapa detalhado da etapa ${stage}` : 'Mapa macro do processo'} data-testid="bpmn-canvas" />
      {!ready && !error && <p className="absolute inset-0 flex items-center justify-center text-sm text-muted">Desenhando o mapa…</p>}
      {error && (
        <p role="alert" className="absolute inset-0 flex items-center justify-center p-6 text-center text-sm text-bad">
          Não foi possível desenhar o mapa: {error}. Os dados continuam disponíveis nas listas e tabelas.
        </p>
      )}
    </div>
  );
});

function CtrlBtn({ label, onClick, children }: { label: string; onClick: () => void; children: React.ReactNode }) {
  return (
    <button type="button" aria-label={label} title={label} onClick={onClick} className="inline-flex h-10 w-10 items-center justify-center rounded-xl border border-line/20 bg-surface text-ink2 shadow-card hover:text-ink">
      {children}
    </button>
  );
}

export default BpmnCanvas;
