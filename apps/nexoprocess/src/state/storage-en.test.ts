import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import { loadLocale, setActiveLocale } from '../i18n';
import { parseBackup } from '../storage/db';
import { DraftAlreadyUsedError, DraftDivergedError } from './draftCommit';
import { slug } from './actions';

// Mensagens de banco, backup e rascunho em PT e EN (I2). Em PT: o texto de sempre.
beforeAll(() => loadLocale('en'));
afterEach(() => setActiveLocale('pt'));

describe('banco, backup e rascunho', () => {
  it('PT: textos originais', () => {
    expect(() => parseBackup('{')).toThrow('O arquivo não é um backup válido (JSON ilegível).');
    expect(() => parseBackup('{"format":"x"}')).toThrow('O arquivo não é um backup do NexoProcess.');
    expect(new DraftAlreadyUsedError('a').message).toBe('Este rascunho já virou um projeto, que foi excluído depois.');
    expect(new DraftDivergedError('a').message).toBe('Este rascunho já virou um projeto em outra aba, com conteúdo diferente do desta aba.');
    expect(slug('')).toBe('processo');
  });
  it('EN: mensagens em inglês', () => {
    setActiveLocale('en');
    expect(() => parseBackup('{')).toThrow('The file is not a valid backup (unreadable JSON).');
    expect(() => parseBackup('{"format":"x"}')).toThrow('The file is not a NexoProcess backup.');
    expect(() => parseBackup(JSON.stringify({ format: 'nexoprocess-backup', workspaces: [null] }))).toThrow(/Backup incomplete or corrupted: .* No data was changed\./);
    expect(new DraftAlreadyUsedError('a').message).toBe('This draft had already become a project, which was deleted afterwards.');
    expect(new DraftDivergedError('a').message).toMatch(/^This draft had already become a project in another tab/);
    expect(slug('')).toBe('process');
  });
});
