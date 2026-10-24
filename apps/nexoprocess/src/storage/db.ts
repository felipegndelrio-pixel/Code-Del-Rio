// Armazenamento local no IndexedDB do navegador. Nada é enviado a servidores.
// Banco "nexoprocess" v1:
//   workspaces  — processos (AS-IS, TO-BE, plano, resultados…), chave = id
//   drafts      — rascunhos do assistente, chave = nome ("assistant", "wizard"), e o
//                 registro durável "rascunho X virou o projeto Y", chave = "criado:<draftId>"
//                 (mesmo store: não exige nova versão do banco, que travaria abas antigas)
import { normalizeWorkspace } from '../domain/factory';
import type { Workspace } from '../domain/types';
import { nowIso, uid } from '../domain/units';

const DB_NAME = 'nexoprocess';
const DB_VERSION = 1;
let dbp: Promise<IDBDatabase> | null = null;
let memoryFallback: Map<string, Map<string, unknown>> | null = null;

export function storageMode(): 'indexeddb' | 'memoria' {
  return memoryFallback ? 'memoria' : 'indexeddb';
}

function fallBackToMemory() {
  memoryFallback ??= new Map([
    ['workspaces', new Map()],
    ['drafts', new Map()],
  ]);
}

/**
 * Abre o banco, se ainda não abriu, e diz onde os dados ficam: no aparelho (IndexedDB)
 * ou só nesta aba (memória, quando o navegador bloqueia o banco local). Use antes de
 * afirmar que algo foi salvo.
 */
export async function checkStorage(): Promise<'indexeddb' | 'memoria'> {
  if (!memoryFallback) {
    try {
      await open();
    } catch {
      fallBackToMemory();
    }
  }
  return storageMode();
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

/** Banco aberto, ou null quando o navegador o bloqueia (aí tudo segue em memória e a UI avisa). */
async function database(): Promise<IDBDatabase | null> {
  if (memoryFallback) return null;
  try {
    return await open();
  } catch {
    // Navegação privada antiga / armazenamento bloqueado: segue em memória e avisa na UI.
    fallBackToMemory();
    return null;
  }
}

/** Envolve um callback de requisição: exceção lá dentro aborta a transação e rejeita a Promise. */
type Guard = <A extends unknown[]>(fn: (...a: A) => void) => (...a: A) => void;

/**
 * Transação em vários stores. Resolve só quando o IndexedDB confirma (oncomplete) E o corpo
 * informou o resultado (done); sem resultado, rejeita (falha segura: nunca "sucesso" sem
 * saber o que aconteceu). Erro em qualquer passo — síncrono, num callback de requisição
 * (use guard) ou do próprio banco (requisição com erro, cota no commit) — desfaz tudo.
 */
function run<T>(db: IDBDatabase, stores: string[], body: (t: IDBTransaction, done: (v: T) => void, guard: Guard) => void): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    let out: T | undefined;
    const t = db.transaction(stores, 'readwrite');
    const fail = (e: unknown) => {
      try {
        t.abort();
      } catch {
        /* a transação já tinha terminado */
      }
      reject(e);
    };
    t.oncomplete = () => (out === undefined ? reject(new Error('A transação terminou sem resultado; nada foi confirmado.')) : resolve(out));
    t.onerror = (ev) => reject((ev.target as IDBRequest | null)?.error ?? t.error ?? new Error('Falha na transação'));
    t.onabort = () => reject(t.error ?? new Error('Transação abortada'));
    const guard: Guard =
      (fn) =>
      (...a) => {
        try {
          fn(...a);
        } catch (e) {
          fail(e);
        }
      };
    guard(() => body(t, (v) => (out = v), guard))();
  });
}

/** Chave, no store "drafts", do registro durável de que o rascunho já virou um projeto. */
export const commitKey = (draftId: string) => `criado:${draftId}`;
export interface DraftCommitRecord {
  kind: 'criado';
  draftId: string;
  draftKey: string;
  workspaceId: string;
  /** Impressão digital do conteúdo que virou o projeto: outra aba com conteúdo diferente não é "o mesmo projeto". */
  fingerprint?: string;
  at: string;
}
export type CommitResult = { status: 'criado' | 'existente'; workspaceId: string; fingerprint?: string };
/**
 * salvo: gravado. ja_criado: este rascunho já virou projeto (em outra aba, por exemplo).
 * substituido: rascunho antigo, sem identidade, e o slot já tem um rascunho identificado
 * (outra aba o assumiu). Nos dois últimos casos nada é gravado.
 */
export type SaveResult = 'salvo' | 'ja_criado' | 'substituido';

async function tx<T>(store: string, mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  const db = await database();
  if (!db) return memOp(store, mode, fn);
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
  listWorkspaces: async (): Promise<Workspace[]> => (await tx<unknown[]>('workspaces', 'readonly', (s) => s.getAll() as IDBRequest<unknown[]>)).map(normalizeWorkspace),
  getWorkspace: async (id: string): Promise<Workspace | undefined> => {
    const raw = await tx<unknown | undefined>('workspaces', 'readonly', (s) => s.get(id) as IDBRequest<unknown | undefined>);
    return raw ? normalizeWorkspace(raw) : undefined;
  },
  putWorkspace: (w: Workspace) => tx('workspaces', 'readwrite', (s) => s.put(w)),
  deleteWorkspace: (id: string) => tx('workspaces', 'readwrite', (s) => s.delete(id)),
  getDraft: <T>(k: string) => tx<T | undefined>('drafts', 'readonly', (s) => s.get(k) as IDBRequest<T | undefined>),
  putDraft: (k: string, v: unknown) => tx('drafts', 'readwrite', (s) => s.put(v, k)),
  deleteDraft: (k: string) => tx('drafts', 'readwrite', (s) => s.delete(k)),

  /**
   * Cria o projeto e registra "este rascunho virou este projeto" NA MESMA transação
   * (workspaces + drafts). Se o registro já existe, não grava nada e devolve o projeto
   * existente: duas tentativas (clique duplo, duas abas, rascunho reaberto) criam um só.
   * O IndexedDB serializa transações readwrite com stores em comum, então a leitura do
   * registro e a gravação não podem ser intercaladas por outra criação. As gravações usam
   * add (não put): um registro ou um projeto com o mesmo id já existente nunca é
   * sobrescrito — o banco recusa (ConstraintError) e a transação inteira é desfeita.
   */
  async commitDraft(w: Workspace, draftKey: string, draftId: string, fingerprint: string): Promise<CommitResult> {
    const rec: DraftCommitRecord = { kind: 'criado', draftId, draftKey, workspaceId: w.id, fingerprint, at: nowIso() };
    const idb = await database();
    if (!idb) {
      const prev = memoryFallback!.get('drafts')!.get(commitKey(draftId)) as DraftCommitRecord | undefined;
      if (prev) return { status: 'existente', workspaceId: prev.workspaceId, fingerprint: prev.fingerprint };
      if (memoryFallback!.get('workspaces')!.has(w.id)) throw new DOMException('Já existe um projeto com este id.', 'ConstraintError');
      memoryFallback!.get('workspaces')!.set(w.id, structuredClone(w));
      memoryFallback!.get('drafts')!.set(commitKey(draftId), rec);
      return { status: 'criado', workspaceId: w.id };
    }
    return run<CommitResult>(idb, ['workspaces', 'drafts'], (t, done, guard) => {
      const drafts = t.objectStore('drafts');
      const g = drafts.get(commitKey(draftId));
      g.onsuccess = guard(() => {
        const prev = g.result as DraftCommitRecord | undefined;
        if (prev) return done({ status: 'existente', workspaceId: prev.workspaceId, fingerprint: prev.fingerprint });
        // Registro primeiro, projeto depois. Qualquer falha (exceção aqui, ConstraintError,
        // cota no commit) aborta a transação inteira: nem registro, nem projeto.
        drafts.add(rec, commitKey(draftId));
        t.objectStore('workspaces').add(w);
        done({ status: 'criado', workspaceId: w.id });
      });
    });
  },

  /**
   * Salva o rascunho, exceto se ele já virou projeto (ja_criado: um salvamento atrasado ou
   * de outra aba nunca recria um rascunho concluído) ou se é um rascunho antigo, sem
   * identidade, e outra aba já assumiu o slot (substituido). Quem chama deve tratar o
   * resultado: fora de 'salvo', nada foi gravado.
   */
  async saveDraft<T extends { draftId?: string }>(k: string, v: T): Promise<SaveResult> {
    const idb = await database();
    if (!idb) {
      const m = memoryFallback!.get('drafts')!;
      if (v.draftId && m.has(commitKey(v.draftId))) return 'ja_criado';
      if (!v.draftId && (m.get(k) as { draftId?: string } | undefined)?.draftId) return 'substituido';
      m.set(k, structuredClone(v));
      return 'salvo';
    }
    return run<SaveResult>(idb, ['drafts'], (t, done, guard) => {
      const s = t.objectStore('drafts');
      const g = s.get(v.draftId ? commitKey(v.draftId) : k);
      g.onsuccess = guard(() => {
        if (v.draftId && g.result) return done('ja_criado');
        if (!v.draftId && (g.result as { draftId?: string } | undefined)?.draftId) return done('substituido');
        s.put(v, k);
        done('salvo');
      });
    });
  },

  /** Apaga o rascunho só se ainda for o mesmo (não apaga um rascunho mais novo de outra aba). O registro fica. */
  async deleteDraftIf(k: string, draftId: string): Promise<'apagado' | 'mantido'> {
    const idb = await database();
    if (!idb) {
      const m = memoryFallback!.get('drafts')!;
      if ((m.get(k) as { draftId?: string } | undefined)?.draftId !== draftId) return 'mantido';
      m.delete(k);
      return 'apagado';
    }
    return run<'apagado' | 'mantido'>(idb, ['drafts'], (t, done, guard) => {
      const s = t.objectStore('drafts');
      const g = s.get(k);
      g.onsuccess = guard(() => {
        if ((g.result as { draftId?: string } | undefined)?.draftId !== draftId) return done('mantido');
        s.delete(k);
        done('apagado');
      });
    });
  },
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
  try {
    return b.workspaces.map(normalizeWorkspace);
  } catch (e) {
    throw new Error(`Backup incompleto ou corrompido: ${(e as Error).message} Nenhum dado foi alterado.`, { cause: e });
  }
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
