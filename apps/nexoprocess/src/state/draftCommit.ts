// Projeto criado a partir de um rascunho (assistente ou formulário), com idempotência
// durável no IndexedDB — sem depender do localStorage.
//
// Protocolo (estados persistidos e recuperação):
//   E0 rascunho no slot ("assistant"/"wizard"), sem registro
//      → antes de criar, o rascunho atual é gravado com a sua identidade (draftId); um
//        rascunho antigo, sem draftId, recebe um aqui e ele é gravado ANTES da criação,
//        para que uma nova tentativa (mesmo depois de recarregar) use a mesma identidade.
//      → falha antes ou durante a transação: a transação é desfeita; continua E0.
//   E1 transação confirmada: projeto + registro "criado:<draftId>" gravados juntos
//      (o rascunho ainda pode estar no slot e/ou na cópia do localStorage)
//      → a limpeza apaga o slot (só se ainda for o mesmo rascunho) e a cópia local.
//      → se a limpeza falhar ou a aba fechar antes: na próxima abertura resumeDraft()
//        acha o registro pelo draftId, não restaura o rascunho, abre o projeto existente
//        e tenta limpar de novo. Criar de novo com o mesmo draftId devolve o projeto
//        existente (commitDraft), nunca um segundo.
//   E2 limpo: só o registro (pequeno) permanece, como prova de que o rascunho foi usado.
//
// Aba desatualizada (duas abas com o mesmo rascunho): a aba perde o direito de editar
// quando (a) o salvamento automático devolve 'ja_criado' ou 'substituido', ou (b) ao
// criar, o registro já existe com conteúdo diferente do desta aba (DraftDivergedError).
// Ela então para de salvar e de criar, e mantém o conteúdo na tela para ser copiado.
import { newWorkspace } from '../domain/factory';
import type { ProcessModel, Workspace } from '../domain/types';
import { uid } from '../domain/units';
import { checkStorage, commitKey, db, type DraftCommitRecord, type SaveResult } from '../storage/db';
import { localDraft } from '../storage/localDraft';
import { askPersistentStorage } from './install';
import { tr } from '../i18n';

export interface DraftCommit {
  w: Workspace;
  /** Rascunho apagado do aparelho. 'falhou' não desfaz a criação. */
  cleanup: 'ok' | 'falhou';
  /** Projeto gravado no aparelho (IndexedDB). false = só nesta aba (memória). */
  durable: boolean;
  /** O rascunho já tinha virado este projeto antes, com o mesmo conteúdo; nada foi criado de novo. */
  reused: boolean;
}

/** O rascunho já virou um projeto que não existe mais (foi excluído): não recriamos sozinhos. */
export class DraftAlreadyUsedError extends Error {
  constructor(readonly workspaceId: string) {
    super(tr('st.draftDeleted'));
  }
}

/** O rascunho já virou um projeto (em outra aba) com conteúdo diferente do desta aba: o desta aba não entrou. */
export class DraftDivergedError extends Error {
  constructor(readonly workspaceId: string) {
    super(tr('st.draftDiverged'));
  }
}

/** Por que esta aba não pode mais salvar nem criar a partir do rascunho que mostra. */
export type StaleReason = 'criado_outra_aba' | 'divergente' | 'substituido' | 'excluido';
export interface StaleDraft {
  reason: StaleReason;
  /** Projeto criado a partir deste rascunho, quando se sabe qual é. */
  workspaceId?: string;
}

/** Impressão digital estável do processo que será gravado (chaves ordenadas). */
export function draftFingerprint(p: ProcessModel): string {
  const norm = (v: unknown): unknown =>
    Array.isArray(v)
      ? v.map(norm)
      : v && typeof v === 'object'
        ? Object.fromEntries(
            Object.keys(v)
              .filter((k) => (v as Record<string, unknown>)[k] !== undefined)
              .sort()
              .map((k) => [k, norm((v as Record<string, unknown>)[k])]),
          )
        : v;
  return JSON.stringify(norm(p));
}

/** Traduz o resultado do salvamento automático: fora de 'salvo', esta aba ficou desatualizada. */
export async function staleFromSave(result: SaveResult, draftId: string | undefined): Promise<StaleDraft | null> {
  if (result === 'salvo') return null;
  if (result === 'substituido') return { reason: 'substituido' };
  const rec = draftId ? await db.getDraft<DraftCommitRecord>(commitKey(draftId)).catch(() => undefined) : undefined;
  return { reason: 'criado_outra_aba', workspaceId: rec?.workspaceId };
}

/** Apaga a cópia local e o rascunho do slot (se ainda for o mesmo). O registro durável fica. */
export async function cleanupDraft(key: string, draftId: string | undefined): Promise<'ok' | 'falhou'> {
  localDraft.remove(key);
  try {
    if (draftId) await db.deleteDraftIf(key, draftId);
    else await db.deleteDraft(key);
    return 'ok';
  } catch {
    return 'falhou';
  }
}

/**
 * Cria o projeto. Lança se a criação falhar (aí nada foi gravado e o rascunho fica intacto),
 * DraftDivergedError se outra aba já criou o projeto com outro conteúdo e
 * DraftAlreadyUsedError se o projeto criado com este rascunho foi excluído depois.
 * onDraftId: avisado assim que um rascunho antigo recebe a sua identidade (antes de criar).
 */
export async function createFromDraft<T extends { draftId?: string }>(
  key: string,
  draft: T,
  p: ProcessModel,
  source: Workspace['source'],
  opts: { onDraftId?: (id: string) => void } = {},
): Promise<DraftCommit> {
  let id = draft.draftId;
  if (!id) {
    id = uid('rd');
    opts.onDraftId?.(id);
  }
  const current = { ...draft, draftId: id };
  // Grava o rascunho atual (com a identidade) antes de criar. Se esta gravação falhar,
  // nada é criado. 'ja_criado' segue: o commit abaixo devolve o projeto existente.
  if (!draft.draftId) localDraft.write(key, current);
  await db.saveDraft(key, current);
  const fingerprint = draftFingerprint(p);
  const fresh = newWorkspace(p, source, false);
  const r = await db.commitDraft(fresh, key, id, fingerprint);
  let w = fresh;
  if (r.status === 'existente') {
    const prev = r.workspaceId ? await db.getWorkspace(r.workspaceId) : undefined;
    if (!prev) throw new DraftAlreadyUsedError(r.workspaceId);
    if (r.fingerprint !== fingerprint) throw new DraftDivergedError(r.workspaceId);
    w = prev;
  } else askPersistentStorage();
  return { w, cleanup: await cleanupDraft(key, id), durable: (await checkStorage()) === 'indexeddb', reused: r.status === 'existente' };
}

export interface DraftResume<T> {
  /** Rascunho a restaurar (do IndexedDB), se houver e ainda não tiver virado projeto. */
  draft?: T;
  /** A cópia local exibida na abertura já tinha virado projeto: descarte-a. */
  localUsed: boolean;
  /** Projeto gerado por um rascunho deste slot; exists = ainda está no aparelho. */
  usedBy?: { workspaceId: string; exists: boolean };
}

/**
 * Na abertura do assistente/formulário: lê o rascunho do IndexedDB e confere, pelo
 * registro durável, se ele (ou a cópia do localStorage mostrada de imediato) já virou
 * projeto. Se virou, não restaura e tenta a limpeza de novo.
 */
export async function resumeDraft<T extends { draftId?: string }>(key: string, localDraftId?: string): Promise<DraftResume<T>> {
  const slot = await db.getDraft<T>(key).catch(() => undefined);
  const recordOf = async (id?: string) => (id ? await db.getDraft<DraftCommitRecord>(commitKey(id)).catch(() => undefined) : undefined);
  const localRec = await recordOf(localDraftId);
  const slotRec = slot?.draftId === localDraftId ? localRec : await recordOf(slot?.draftId);
  const rec = localRec ?? slotRec;
  if (!rec) return { draft: slot, localUsed: false };
  if (localRec) localDraft.remove(key);
  if (slotRec && slot?.draftId) await db.deleteDraftIf(key, slot.draftId).catch(() => {});
  const exists = !!(await db.getWorkspace(rec.workspaceId).catch(() => undefined));
  return { draft: slotRec ? undefined : slot, localUsed: !!localRec, usedBy: { workspaceId: rec.workspaceId, exists } };
}
