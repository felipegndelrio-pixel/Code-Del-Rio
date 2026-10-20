// Estado do processo aberto: carrega do IndexedDB, aplica alterações imutáveis
// e salva automaticamente (debounce), exibindo "Salvo neste dispositivo".
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { computeMetrics, type ProcessMetrics } from '../domain/metrics';
import { recommend, type Recommendation } from '../domain/recommendations';
import type { ProcessModel, Workspace } from '../domain/types';
import { nowIso, uid } from '../domain/units';
import { validateProcess, type Issue } from '../domain/validation';
import { db } from '../storage/db';
import { demoBlocked, isDemo } from '../license/demo';

/** 'demo': modo de demonstração — as alterações ficam só na memória. */
export type SaveState = 'salvo' | 'salvando' | 'erro' | 'demo';

interface Ctx {
  w: Workspace;
  update: (fn: (draft: Workspace) => void, history?: { area: string; message: string }) => void;
  /** Guarda uma cópia do AS-IS antes de uma alteração relevante. */
  snapshotAsIs: (label: string) => void;
  save: SaveState;
  savedAt?: string;
  /** Rótulo da última alteração que pode ser desfeita (null = nada a desfazer). */
  undoLabel: string | null;
  undo: () => string | null;
  retrySave: () => void;
  metrics: ProcessMetrics;
  issues: Issue[];
  recs: Recommendation[];
}

const WorkspaceCtx = createContext<Ctx | null>(null);

export function useWorkspace(): Ctx {
  const c = useContext(WorkspaceCtx);
  if (!c) throw new Error('useWorkspace fora do provedor');
  return c;
}

const MAX_SNAPSHOTS = 15;
const MAX_HISTORY = 300;
const MAX_UNDO = 30;

export function WorkspaceProvider({ initial, children }: { initial: Workspace; children: ReactNode }) {
  const [w, setW] = useState(initial);
  const [save, setSave] = useState<SaveState>(isDemo() ? 'demo' : 'salvo');
  const [savedAt, setSavedAt] = useState<string | undefined>(initial.updatedAt);
  // Gravação imediata e coalescida: no máximo uma escrita em andamento; a seguinte
  // sempre grava o estado mais recente. Minimiza a janela de perda ao fechar a aba.
  const pending = useRef<Workspace | null>(null);
  const demoWarned = useRef(false);
  const writing = useRef(false);

  const flush = useCallback(async () => {
    if (writing.current) return;
    writing.current = true;
    try {
      while (pending.current) {
        const data = pending.current;
        pending.current = null;
        try {
          await db.putWorkspace(data);
          if (!pending.current) {
            setSave('salvo');
            setSavedAt(data.updatedAt);
          }
        } catch {
          setSave('erro');
        }
      }
    } finally {
      writing.current = false;
    }
  }, []);

  useEffect(() => {
    const onHide = () => void flush();
    window.addEventListener('pagehide', onHide);
    document.addEventListener('visibilitychange', onHide);
    return () => {
      window.removeEventListener('pagehide', onHide);
      document.removeEventListener('visibilitychange', onHide);
      void flush();
    };
  }, [flush]);

  // Estado corrente síncrono (as alterações partem sempre do último estado) +
  // pilha de desfazer em memória. Edições sem rótulo em sequência rápida
  // (digitação) são agrupadas numa única entrada.
  const cur = useRef(initial);
  const undoStack = useRef<{ w: Workspace; label: string; labeled: boolean; at: number }[]>([]);
  const [undoLabel, setUndoLabel] = useState<string | null>(null);

  const commit = useCallback(
    (next: Workspace) => {
      cur.current = next;
      setW(next);
      if (isDemo()) {
        // Demonstração: mostra o resultado, mas não grava. Avisa uma vez por projeto aberto.
        if (!demoWarned.current) demoBlocked('salvar');
        demoWarned.current = true;
        return;
      }
      pending.current = next;
      setSave('salvando');
      queueMicrotask(() => void flush());
    },
    [flush],
  );

  const update = useCallback<Ctx['update']>(
    (fn, history) => {
      const prev = cur.current;
      const next = structuredClone(prev);
      fn(next);
      next.updatedAt = nowIso();
      if (history) next.history = [...next.history, { at: next.updatedAt, ...history }].slice(-MAX_HISTORY);
      const now = Date.now();
      const top = undoStack.current[undoStack.current.length - 1];
      if (!history && top && !top.labeled && now - top.at < 1500) top.at = now;
      else undoStack.current = [...undoStack.current, { w: prev, label: history?.message ?? 'Edição de campos', labeled: !!history, at: now }].slice(-MAX_UNDO);
      setUndoLabel(undoStack.current[undoStack.current.length - 1]?.label ?? null);
      commit(next);
    },
    [commit],
  );

  const undo = useCallback(() => {
    const e = undoStack.current.pop();
    if (!e) return null;
    const at = nowIso();
    const restored = { ...structuredClone(e.w), updatedAt: at };
    restored.history = [...restored.history, { at, area: 'Desfazer', message: `Desfeito: ${e.label}` }].slice(-MAX_HISTORY);
    setUndoLabel(undoStack.current[undoStack.current.length - 1]?.label ?? null);
    commit(restored);
    return e.label;
  }, [commit]);

  const retrySave = useCallback(() => {
    pending.current = cur.current;
    setSave('salvando');
    void flush();
  }, [flush]);

  const snapshotAsIs = useCallback(
    (label: string) =>
      update((d) => {
        d.snapshots = [...d.snapshots, { id: uid('snap_'), at: nowIso(), label, process: structuredClone(d.asIs) as ProcessModel }].slice(-MAX_SNAPSHOTS);
      }),
    [update],
  );

  const metrics = useMemo(() => computeMetrics(w.asIs), [w.asIs]);
  const issues = useMemo(() => validateProcess(w.asIs), [w.asIs]);
  const recs = useMemo(() => recommend(w.asIs, w.bottleneck.criterion, w.bottleneck.thresholdPct, metrics), [w.asIs, w.bottleneck, metrics]);

  const value = useMemo(
    () => ({ w, update, snapshotAsIs, save, savedAt, undoLabel, undo, retrySave, metrics, issues, recs }),
    [w, update, snapshotAsIs, save, savedAt, undoLabel, undo, retrySave, metrics, issues, recs],
  );
  return <WorkspaceCtx.Provider value={value}>{children}</WorkspaceCtx.Provider>;
}
