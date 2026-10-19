// Estado do processo aberto: carrega do IndexedDB, aplica alterações imutáveis
// e salva automaticamente (debounce), exibindo "Salvo neste dispositivo".
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { computeMetrics, type ProcessMetrics } from '../domain/metrics';
import { recommend, type Recommendation } from '../domain/recommendations';
import type { ProcessModel, Workspace } from '../domain/types';
import { nowIso, uid } from '../domain/units';
import { validateProcess, type Issue } from '../domain/validation';
import { db } from '../storage/db';

export type SaveState = 'salvo' | 'salvando' | 'erro';

interface Ctx {
  w: Workspace;
  update: (fn: (draft: Workspace) => void, history?: { area: string; message: string }) => void;
  /** Guarda uma cópia do AS-IS antes de uma alteração relevante. */
  snapshotAsIs: (label: string) => void;
  save: SaveState;
  savedAt?: string;
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

export function WorkspaceProvider({ initial, children }: { initial: Workspace; children: ReactNode }) {
  const [w, setW] = useState(initial);
  const [save, setSave] = useState<SaveState>('salvo');
  const [savedAt, setSavedAt] = useState<string | undefined>(initial.updatedAt);
  // Gravação imediata e coalescida: no máximo uma escrita em andamento; a seguinte
  // sempre grava o estado mais recente. Minimiza a janela de perda ao fechar a aba.
  const pending = useRef<Workspace | null>(null);
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

  const update = useCallback<Ctx['update']>(
    (fn, history) => {
      setW((prev) => {
        const next = structuredClone(prev);
        fn(next);
        next.updatedAt = nowIso();
        if (history) next.history = [...next.history, { at: next.updatedAt, ...history }].slice(-MAX_HISTORY);
        pending.current = next;
        return next;
      });
      setSave('salvando');
      queueMicrotask(() => void flush());
    },
    [flush],
  );

  // O updater do setState pode rodar só no render: garante a gravação após cada commit.
  useEffect(() => {
    if (pending.current) void flush();
  }, [w, flush]);

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

  const value = useMemo(() => ({ w, update, snapshotAsIs, save, savedAt, metrics, issues, recs }), [w, update, snapshotAsIs, save, savedAt, metrics, issues, recs]);
  return <WorkspaceCtx.Provider value={value}>{children}</WorkspaceCtx.Provider>;
}
