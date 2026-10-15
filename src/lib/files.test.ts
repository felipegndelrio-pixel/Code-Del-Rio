import { describe, expect, it } from 'vitest';
import { sanitizeFileName, validateFileBytes } from './files';

const pdf = new TextEncoder().encode('%PDF-1.7\n...');
const png = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0]);
const exe = new Uint8Array([0x4d, 0x5a, 0x90, 0x00]);

describe('Validação de arquivos', () => {
  it('aceita PDF e PNG legítimos', () => {
    expect(validateFileBytes('ata.pdf', 100, pdf)).toEqual({ ok: true, mime: 'application/pdf' });
    expect(validateFileBytes('foto.PNG', 100, png)).toMatchObject({ ok: true });
  });
  it('rejeita executável renomeado para .pdf (não confia na extensão)', () => {
    expect(validateFileBytes('ata.pdf', 100, exe)).toMatchObject({ ok: false });
  });
  it('rejeita extensão não permitida e tamanho excessivo', () => {
    expect(validateFileBytes('script.exe', 100, exe)).toMatchObject({ ok: false });
    expect(validateFileBytes('a.pdf', 30 * 1024 * 1024, pdf)).toMatchObject({ ok: false });
    expect(validateFileBytes('a.pdf', 0, pdf)).toMatchObject({ ok: false });
  });
  it('rejeita CSV binário', () => {
    expect(validateFileBytes('a.csv', 4, exe)).toMatchObject({ ok: false });
  });
  it('sanitiza nomes (path traversal, acentos)', () => {
    expect(sanitizeFileName('../../etc/passwd.pdf')).toBe('etc_passwd.pdf');
    expect(sanitizeFileName('Relatório Final (v2).xlsx')).toBe('Relatorio_Final_v2_.xlsx');
  });
});
