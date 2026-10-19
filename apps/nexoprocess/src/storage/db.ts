// Armazenamento local no IndexedDB do navegador. Nada é enviado a servidores.
// Banco "nexoprocess" v1:
//   workspaces  — processos (AS-IS, TO-BE, plano, resultados…), chave = id
//   drafts      — rascunhos do assistente, chave = nome
import type { Workspace } from '../domain/types';
import { nowIso, uid } from '../domain/units';

const DB_NAME = 'nexoprocess';
const DB_VERSION = 1;
let dbp: Promise<IDBDatabase> | null = null;
let memoryFallback: Map<string, Map<string, unknown>> | null = null;

export function storageMode(): 'indexeddb' | 'memoria' {
  return memoryFallback ? 'memoria' : 'indexeddb';
}

function open(): Promise<IDBDatabase> {
  if (dbp) return dbp;
  dbp = new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') return reject(new Error('IndexedDB indisponível'));
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains('workspaces')) db.createObjectStore('workspaces', { keyPath: 'id' });
      if (!db.objectStoreNames.contains('drafts')) db.createObjectStore('drafts');
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
    req.onblocked = () => reject(new Error('Banco local bloqueado por outra aba.'));
  });
  return dbp;
}

async function tx<T>(store: string, mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  if (memoryFallback) return memOp(store, mode, fn);
  let db: IDBDatabase;
  try {
    db = await open();
  } catch {
    // Navegação privada antiga / armazenamento bloqueado: segue em memória e avisa na UI.
    memoryFallback = new Map([
      ['workspaces', new Map()],
      ['drafts', new Map()],
    ]);
    return memOp(store, mode, fn);
  }
  return new Promise<T>((resolve, reject) => {
    const t = db.transaction(store, mode);
    const req = fn(t.objectStore(store));
    t.oncomplete = () => resolve(req.result);
    t.onerror = () => reject(t.error ?? req.error);
    t.onabort = () => reject(t.error ?? new Error('Transação abortada'));
  });
}

function memOp<T>(store: string, _mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  const m = memoryFallback!.get(store)!;
  const fake = {
    get: (k: string) => ({ result: structuredClone(m.get(k)) }),
    getAll: () => ({ result: [...m.values()].map((v) => structuredClone(v)) }),
    put: (v: any, k?: string) => (m.set(k ?? v.id, structuredClone(v)), { result: k ?? v.id }),
    delete: (k: string) => (m.delete(k), { result: undefined }),
    clear: () => (m.clear(), { result: undefined }),
  };
  return Promise.resolve((fn(fake as unknown as IDBObjectStore) as unknown as { result: T }).result);
}

export const db = {
  listWorkspaces: () => tx<Workspace[]>('workspaces', 'readonly', (s) => s.getAll() as IDBRequest<Workspace[]>),
  getWorkspace: (id: string) => tx<Workspace | undefined>('workspaces', 'readonly', (s) => s.get(id) as IDBRequest<Workspace | undefined>),
  putWorkspace: (w: Workspace) => tx('workspaces', 'readwrite', (s) => s.put(w)),
  deleteWorkspace: (id: string) => tx('workspaces', 'readwrite', (s) => s.delete(id)),
  getDraft: <T>(k: string) => tx<T | undefined>('drafts', 'readonly', (s) => s.get(k) as IDBRequest<T | undefined>),
  putDraft: (k: string, v: unknown) => tx('drafts', 'readwrite', (s) => s.put(v, k)),
  deleteDraft: (k: string) => tx('drafts', 'readwrite', (s) => s.delete(k)),
  async clearAll() {
    await tx('workspaces', 'readwrite', (s) => s.clear());
    await tx('drafts', 'readwrite', (s) => s.clear());
    try {
      for (const k of Object.keys(localStorage)) if (k.startsWith('nexo.')) localStorage.removeItem(k);
    } catch {
      /* armazenamento indisponível */
    }
  },
};

// ---------------------------------------------------------------- backup
export interface BackupFile {
  format: 'nexoprocess-backup';
  version: 1;
  exportedAt: string;
  workspaces: Workspace[];
}

export async function exportBackup(): Promise<BackupFile> {
  return { format: 'nexoprocess-backup', version: 1, exportedAt: nowIso(), workspaces: await db.listWorkspaces() };
}

export function parseBackup(text: string): Workspace[] {
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch {
    throw new Error('O arquivo não é um backup válido (JSON ilegível).');
  }
  const b = data as Partial<BackupFile>;
  if (b?.format !== 'nexoprocess-backup' || !Array.isArray(b.workspaces)) throw new Error('O arquivo não é um backup do NexoProcess.');
  for (const w of b.workspaces) {
    if (!w || typeof w.id !== 'string' || !w.asIs || !Array.isArray(w.asIs.activities) || !Array.isArray(w.scenarios))
      throw new Error('Backup incompleto ou corrompido: um dos processos não tem a estrutura esperada.');
  }
  return b.workspaces;
}

/** Restaura sem sobrescrever: processos com id existente recebem novo id. */
export async function restoreBackup(list: Workspace[]): Promise<number> {
  const existing = new Set((await db.listWorkspaces()).map((w) => w.id));
  for (const w of list) {
    const copy = structuredClone(w);
    if (existing.has(copy.id)) copy.id = uid('w_');
    copy.history = [...(copy.history ?? []), { at: nowIso(), area: 'Backup', message: 'Restaurado de backup' }];
    await db.putWorkspace(copy);
  }
  return list.length;
}
