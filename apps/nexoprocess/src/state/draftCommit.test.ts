// v2.4.3/v2.4.4 — idempotência durável da criação de projetos (sem depender do localStorage).
// Ambiente node: sem IndexedDB, o db usa o modo memória (mesma API; atômico por construção).
// A transação real do IndexedDB (workspaces + drafts), o aborto real e as duas abas são provados no
// E2E mobile-integrity (Chromium). Aqui: o protocolo, com mocks onde indicado.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { checkStorage, commitKey, db, type DraftCommitRecord } from '../storage/db';
import { newProcess } from '../domain/factory';
import { cleanupDraft, createFromDraft, DraftAlreadyUsedError, DraftDivergedError, draftFingerprint, resumeDraft, staleFromSave } from './draftCommit';

const store = new Map<string, string>();
const workingStorage = {
  getItem: (k: string) => store.get(k) ?? null,
  setItem: (k: string, v: string) => void store.set(k, String(v)),
  removeItem: (k: string) => void store.delete(k),
  key: () => null,
  length: 0,
  clear: () => store.clear(),
};
const blockedStorage = new Proxy(
  {},
  {
    get() {
      throw new DOMException('bloqueado', 'SecurityError');
    },
  },
);
const record = (id: string) => db.getDraft<DraftCommitRecord>(commitKey(id));
const all = async () => (await db.listWorkspaces()).length;

beforeEach(() => {
  store.clear();
  vi.stubGlobal('localStorage', workingStorage);
});
afterEach(async () => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  for (const w of await db.listWorkspaces()) await db.deleteWorkspace(w.id);
  await db.deleteDraft('wizard');
  await db.deleteDraft('assistant');
});

describe('v2.4.4 — abas desatualizadas, rascunho antigo e gravação sem sobrescrever', () => {
  it('mesmo rascunho com conteúdo diferente (outra aba): DraftDivergedError, nada novo gravado', async () => {
    const a = await createFromDraft('assistant', { draftId: 'd1' }, newProcess('Da aba A'), { kind: 'wizard' });
    await expect(createFromDraft('assistant', { draftId: 'd1' }, newProcess('Da aba B'), { kind: 'wizard' })).rejects.toBeInstanceOf(DraftDivergedError);
    const ws = await db.listWorkspaces();
    expect(ws.map((w) => [w.id, w.asIs.name])).toEqual([[a.w.id, 'Da aba A']]);
    // Mesmo conteúdo: é o mesmo projeto (reused), sem erro.
    expect((await createFromDraft('assistant', { draftId: 'd1' }, newProcess('Da aba A'), { kind: 'wizard' })).reused).toBe(true);
  });

  it('salvamento automático da aba desatualizada: ja_criado → aba bloqueada, com o projeto que a outra criou', async () => {
    const a = await createFromDraft('wizard', { draftId: 'd2' }, newProcess('A'), { kind: 'wizard' });
    const r = await db.saveDraft('wizard', { draftId: 'd2', name: 'edição da aba B' });
    expect(r).toBe('ja_criado');
    expect(await staleFromSave(r, 'd2')).toEqual({ reason: 'criado_outra_aba', workspaceId: a.w.id });
    expect(await db.getDraft('wizard')).toBeUndefined(); // a edição tardia não recriou o rascunho
    expect(await staleFromSave('salvo', 'd2')).toBeNull();
  });

  it('rascunho antigo sem identidade não sobrescreve um slot já assumido por outra aba (substituido)', async () => {
    await db.saveDraft('assistant', { draftId: 'd3', name: 'assumido' });
    expect(await db.saveDraft('assistant', { name: 'antigo, sem draftId' } as { draftId?: string; name: string })).toBe('substituido');
    expect(await db.getDraft('assistant')).toEqual({ draftId: 'd3', name: 'assumido' });
    expect(await staleFromSave('substituido', undefined)).toEqual({ reason: 'substituido' });
  });

  it('rascunho antigo sem draftId: identidade gravada ANTES do commit; após falha, a nova tentativa usa a mesma', async () => {
    store.set('nexo.draft.wizard', JSON.stringify({ name: 'Legado' }));
    await db.saveDraft('wizard', { name: 'Legado' } as { draftId?: string; name: string });
    let given: string | undefined;
    vi.spyOn(db, 'commitDraft').mockRejectedValueOnce(new Error('cota')); // mock: falha da criação
    await expect(createFromDraft('wizard', { name: 'Legado' } as { draftId?: string; name: string }, newProcess('Legado'), { kind: 'wizard' }, { onDraftId: (id) => (given = id) })).rejects.toThrow('cota');
    expect(given).toMatch(/^rd/);
    expect(await db.getDraft('wizard')).toEqual({ name: 'Legado', draftId: given }); // gravada no IndexedDB
    expect(JSON.parse(store.get('nexo.draft.wizard')!)).toEqual({ name: 'Legado', draftId: given }); // e na cópia local
    expect(await all()).toBe(0);
    // "Recarregar": o rascunho volta com a identidade gravada e a nova tentativa a usa.
    const back = await resumeDraft<{ draftId?: string; name: string }>('wizard', given);
    let again: string | undefined;
    const r = await createFromDraft('wizard', back.draft!, newProcess('Legado'), { kind: 'wizard' }, { onDraftId: (id) => (again = id) });
    expect(again).toBeUndefined();
    expect(await record(given!)).toMatchObject({ workspaceId: r.w.id });
    expect(await all()).toBe(1);
  });

  it('projeto com id já existente não é sobrescrito: a criação falha e nenhum registro é gravado (modo memória)', async () => {
    const a = await createFromDraft('wizard', { draftId: 'd4' }, newProcess('Original'), { kind: 'wizard' });
    const clash = { ...a.w, asIs: newProcess('Intruso') };
    await expect(db.commitDraft(clash, 'wizard', 'd5', draftFingerprint(clash.asIs))).rejects.toMatchObject({ name: 'ConstraintError' });
    expect((await db.getWorkspace(a.w.id))!.asIs.name).toBe('Original');
    expect(await record('d5')).toBeUndefined();
  });

  it('deleteDraftIf informa se apagou; impressão digital não depende da ordem das chaves', async () => {
    await db.saveDraft('assistant', { draftId: 'd6' });
    expect(await db.deleteDraftIf('assistant', 'outro')).toBe('mantido');
    expect(await db.deleteDraftIf('assistant', 'd6')).toBe('apagado');
    const p = newProcess('X');
    expect(draftFingerprint({ ...p, volume: 3 })).toBe(draftFingerprint({ volume: 3, ...p }));
    expect(draftFingerprint({ ...p, volume: 3 })).not.toBe(draftFingerprint({ ...p, volume: 4 }));
  });
});

describe('createFromDraft — projeto e registro juntos', () => {
  it('sucesso: projeto, registro durável e limpeza do rascunho (slot e cópia local)', async () => {
    await db.saveDraft('wizard', { draftId: 'r1', name: 'X' });
    localStorage.setItem('nexo.draft.wizard', JSON.stringify({ draftId: 'r1' }));
    const r = await createFromDraft('wizard', { draftId: 'r1', name: 'X' }, newProcess('X'), { kind: 'wizard' });
    expect(r).toMatchObject({ cleanup: 'ok', reused: false });
    expect(await db.getWorkspace(r.w.id)).toBeDefined();
    expect(await record('r1')).toMatchObject({ kind: 'criado', draftId: 'r1', draftKey: 'wizard', workspaceId: r.w.id });
    expect(await db.getDraft('wizard')).toBeUndefined();
    expect(store.has('nexo.draft.wizard')).toBe(false);
  });

  it('falha na criação: nada gravado (nem projeto, nem registro) e o rascunho fica', async () => {
    await db.saveDraft('wizard', { draftId: 'r2', name: 'Y' });
    vi.spyOn(db, 'commitDraft').mockRejectedValueOnce(new Error('cota'));
    await expect(createFromDraft('wizard', { draftId: 'r2', name: 'Y' }, newProcess('Y'), { kind: 'wizard' })).rejects.toThrow('cota');
    expect(await all()).toBe(0);
    expect(await record('r2')).toBeUndefined();
    expect(await db.getDraft('wizard')).toEqual({ draftId: 'r2', name: 'Y' });
  });

  it('limpeza falha depois de criar: o registro fica; a retomada não restaura, acha o projeto e limpa', async () => {
    await db.saveDraft('assistant', { draftId: 'r3', name: 'Z' });
    localStorage.setItem('nexo.draft.assistant', JSON.stringify({ draftId: 'r3' }));
    vi.spyOn(db, 'deleteDraftIf').mockRejectedValueOnce(new Error('falha'));
    const r = await createFromDraft('assistant', { draftId: 'r3', name: 'Z' }, newProcess('Z'), { kind: 'wizard' });
    expect(r.cleanup).toBe('falhou');
    expect(await db.getDraft('assistant')).toEqual({ draftId: 'r3', name: 'Z' }); // continua no slot
    expect(await record('r3')).toMatchObject({ workspaceId: r.w.id });
    // Reabertura (cópia local com o mesmo draftId):
    const back = await resumeDraft<{ draftId?: string }>('assistant', 'r3');
    expect(back).toEqual({ draft: undefined, localUsed: true, usedBy: { workspaceId: r.w.id, exists: true } });
    expect(await db.getDraft('assistant')).toBeUndefined(); // limpeza refeita
    expect(await all()).toBe(1);
  });

  it('repetir a criação com o mesmo rascunho devolve o mesmo projeto, sem duplicar', async () => {
    const a = await createFromDraft('wizard', { draftId: 'r4' }, newProcess('W'), { kind: 'wizard' });
    const b = await createFromDraft('wizard', { draftId: 'r4' }, newProcess('W'), { kind: 'wizard' });
    const [c, d] = await Promise.all([createFromDraft('wizard', { draftId: 'r4' }, newProcess('W'), { kind: 'wizard' }), createFromDraft('wizard', { draftId: 'r4' }, newProcess('W'), { kind: 'wizard' })]);
    expect(b).toMatchObject({ reused: true });
    expect([b.w.id, c.w.id, d.w.id]).toEqual([a.w.id, a.w.id, a.w.id]);
    expect(await all()).toBe(1);
  });

  it('localStorage bloqueado: a idempotência continua (registro no banco) e a retomada detecta', async () => {
    vi.stubGlobal('localStorage', blockedStorage);
    await db.saveDraft('wizard', { draftId: 'r5', name: 'V' });
    vi.spyOn(db, 'deleteDraftIf').mockRejectedValueOnce(new Error('falha'));
    const r = await createFromDraft('wizard', { draftId: 'r5', name: 'V' }, newProcess('V'), { kind: 'wizard' });
    expect(r.cleanup).toBe('falhou');
    // Sem cópia local: a retomada lê o slot, acha o registro e não restaura.
    expect(await resumeDraft('wizard')).toEqual({ draft: undefined, localUsed: false, usedBy: { workspaceId: r.w.id, exists: true } });
    expect(await db.getDraft('wizard')).toBeUndefined();
    expect((await createFromDraft('wizard', { draftId: 'r5', name: 'V' }, newProcess('V'), { kind: 'wizard' })).reused).toBe(true);
    expect(await all()).toBe(1);
  });

  it('salvamento automático atrasado não recria o rascunho já usado', async () => {
    const r = await createFromDraft('assistant', { draftId: 'r6' }, newProcess('U'), { kind: 'wizard' });
    expect(await db.saveDraft('assistant', { draftId: 'r6', name: 'U (atrasado)' })).toBe('ja_criado');
    expect(await db.getDraft('assistant')).toBeUndefined();
    // Um rascunho novo (outro draftId) é salvo normalmente.
    expect(await db.saveDraft('assistant', { draftId: 'r7', name: 'novo' })).toBe('salvo');
    expect(r.reused).toBe(false);
  });

  it('limpeza não apaga um rascunho mais novo do mesmo slot', async () => {
    await createFromDraft('assistant', { draftId: 'r8' }, newProcess('T'), { kind: 'wizard' });
    await db.saveDraft('assistant', { draftId: 'r9', name: 'mais novo' });
    expect(await cleanupDraft('assistant', 'r8')).toBe('ok');
    expect(await db.getDraft('assistant')).toEqual({ draftId: 'r9', name: 'mais novo' });
    // E a retomada com a cópia local antiga restaura o rascunho mais novo do slot.
    const back = await resumeDraft<{ draftId?: string; name: string }>('assistant', 'r8');
    expect(back.localUsed).toBe(true);
    expect(back.draft).toEqual({ draftId: 'r9', name: 'mais novo' });
  });

  it('projeto do rascunho excluído depois: não recria sozinho', async () => {
    const r = await createFromDraft('wizard', { draftId: 'r10' }, newProcess('S'), { kind: 'wizard' });
    await db.deleteWorkspace(r.w.id);
    await expect(createFromDraft('wizard', { draftId: 'r10' }, newProcess('S'), { kind: 'wizard' })).rejects.toBeInstanceOf(DraftAlreadyUsedError);
    expect(await all()).toBe(0);
    await db.saveDraft('wizard', { draftId: 'r10' }).catch(() => {});
    expect((await resumeDraft('wizard', 'r10')).usedBy).toEqual({ workspaceId: r.w.id, exists: false });
  });

  it('sem IndexedDB (modo memória): durable = false', async () => {
    expect(await checkStorage()).toBe('memoria');
    expect((await createFromDraft('assistant', { draftId: 'r11' }, newProcess('R'), { kind: 'wizard' })).durable).toBe(false);
  });
});
