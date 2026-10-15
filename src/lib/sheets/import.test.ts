import { describe, expect, it } from 'vitest';
import { parseCell, readCsv, autoMap, detectEntity } from './import';
import { SHEET_BY_ENTITY, type ColDef } from './schema';
import { ACTION_STATUS } from '../constants';

const col = (c: Partial<ColDef>): ColDef => ({ field: 'f', header: 'F', type: 'text', ...c });

describe('Conversão de células', () => {
  it('datas em vários formatos', () => {
    expect(parseCell(col({ type: 'date' }), '05/03/2026')).toEqual({ ok: true, value: '2026-03-05' });
    expect(parseCell(col({ type: 'date' }), new Date(Date.UTC(2026, 2, 5)))).toEqual({ ok: true, value: '2026-03-05' });
    expect(parseCell(col({ type: 'date' }), 46086)).toEqual({ ok: true, value: '2026-03-05' });
    expect(parseCell(col({ type: 'date' }), '2026-02-30').ok).toBe(false);
  });
  it('números pt-BR e en', () => {
    expect(parseCell(col({ type: 'number' }), '1.234,56')).toEqual({ ok: true, value: 1234.56 });
    expect(parseCell(col({ type: 'number' }), 'R$ 10,5')).toEqual({ ok: true, value: 10.5 });
    expect(parseCell(col({ type: 'int', max: 100 }), '150').ok).toBe(false);
    expect(parseCell(col({ type: 'int' }), '1,5').ok).toBe(false);
  });
  it('enum aceita rótulo ou valor, sem acento', () => {
    const c = col({ type: 'enum', options: ACTION_STATUS });
    expect(parseCell(c, 'Concluída')).toEqual({ ok: true, value: 'concluida' });
    expect(parseCell(c, 'nao iniciada')).toEqual({ ok: true, value: 'nao_iniciada' });
    expect(parseCell(c, 'talvez').ok).toBe(false);
  });
  it('CSV com aspas, ; e quebra de linha', () => {
    const s = readCsv('\uFEFFCódigo;Ação *;Descrição\r\nACT-1;"Título; com ponto e vírgula";"linha1\nlinha2"\r\n');
    expect(s.headers).toEqual(['Código', 'Ação *', 'Descrição']);
    expect(s.rows[0].values).toEqual(['ACT-1', 'Título; com ponto e vírgula', 'linha1\nlinha2']);
    expect(autoMap(s.headers, SHEET_BY_ENTITY.actions)).toEqual(['code', 'title', 'description']);
    expect(detectEntity({ ...s, name: 'Ações' })).toBe('actions');
  });
});
