import ExcelJS from 'exceljs';
import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import { demoProcess } from '../domain/demo';
import { loadLocale, setActiveLocale, translate } from '../i18n';
import { FIELDS, EN_LABELS, fieldLabel } from './fields';
import { readImportFile } from './parse';
import { actionsToCsv, parsePlanCsv } from './planCsv';
import { autoMap, findCostSheet, findProcessSheet, pickActivitySheet, rowsToProcess } from './toProcess';
import { buildWorkbook, processToCsv } from './workbook';
import type { Workspace } from '../domain/types';

const ab = (u: Uint8Array) => u.buffer.slice(u.byteOffset, u.byteOffset + u.byteLength) as ArrayBuffer;
const fileOf = (name: string, data: Uint8Array | string) => {
  const bytes = typeof data === 'string' ? new TextEncoder().encode(data) : data;
  return { name, size: bytes.byteLength, arrayBuffer: async () => ab(bytes) };
};
const key = (p: ReturnType<typeof rowsToProcess>['process']) =>
  p.activities.map((a) => [a.type, a.unit, a.duration ?? null, a.lean ?? null, a.rework ?? null, a.critical ?? null, a.people ?? null, a.wait ?? null, a.order, a.next.length, a.nextYes ?? null, a.nextNo ?? null]);

async function importFile(file: ReturnType<typeof fileOf>) {
  const parsed = await readImportFile(file);
  const idx = pickActivitySheet(parsed.sheets);
  const m = autoMap(parsed.sheets[idx].headers);
  const r = rowsToProcess(parsed.sheets[idx], m.mapping, { defaultUnit: 'min' }, findProcessSheet(parsed.sheets), findCostSheet(parsed.sheets));
  return { m, r, parsed };
}

beforeAll(() => loadLocale('en'));
afterEach(() => setActiveLocale('pt'));

describe('modelo em EN', () => {
  it('rótulos estáticos EN = dicionário EN (a importação não depende do idioma ativo)', () => {
    for (const f of FIELDS) expect(translate('en', `io.f.${f.key}.label` as 'io.f.id_atividade.label'), f.key).toBe(EN_LABELS[f.key]);
  });
  it('cabeçalhos, abas e valores do modelo saem em inglês; nada em português', async () => {
    setActiveLocale('en');
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(ab(await buildWorkbook()));
    expect(wb.worksheets.map((w) => w.name)).toEqual(['Read me', 'Process', 'Activities', 'Costs per role', 'Example']);
    const head = wb.getWorksheet('Activities')!.getRow(1);
    expect(String(head.getCell(1).value)).toBe('Code');
    expect(String(head.getCell(FIELDS.length + 1).value)).toBe('Duration in hours (calculated)');
    const ex = wb.getWorksheet('Example')!;
    const unitCol = FIELDS.findIndex((f) => f.key === 'unidade_duracao') + 1;
    expect(['minutes', 'hours', 'days']).toContain(String(ex.getCell(2, unitCol).value));
    const f = (wb.getWorksheet('Activities')!.getCell(2, FIELDS.length + 1).value as { formula: string }).formula;
    expect(f).toContain('"minutes"');
    expect(f).toContain('Process!$B$');
    expect(f).not.toMatch(/minutos|Processo/);
  });
  it('CSV em EN usa cabeçalhos em inglês', () => {
    setActiveLocale('en');
    expect(processToCsv(demoProcess()).split('\r\n')[0]).toBe('﻿' + FIELDS.map((f) => fieldLabel(f)).join(';'));
  });
});

describe('importação: PT e EN entram em qualquer idioma do app', () => {
  it('arquivo PT importado com o app em EN = importado em PT', async () => {
    const pt = await buildWorkbook({ process: demoProcess(), includeExample: false });
    const inPt = await importFile(fileOf('pt.xlsx', pt));
    setActiveLocale('en');
    const inEn = await importFile(fileOf('pt.xlsx', pt));
    expect(inEn.m.missingMinimal).toEqual([]);
    expect(key(inEn.r.process)).toEqual(key(inPt.r.process));
    expect(inEn.r.process.activities.length).toBeGreaterThan(5);
    expect(inEn.r.issues.filter((i) => i.severity === 'error')).toEqual([]);
  });
  it('arquivo EN importado com o app em PT = importado em EN', async () => {
    setActiveLocale('en');
    const en = await buildWorkbook({ process: demoProcess(), includeExample: false });
    const inEn = await importFile(fileOf('en.xlsx', en));
    setActiveLocale('pt');
    const inPt = await importFile(fileOf('en.xlsx', en));
    expect(inPt.m.missingMinimal).toEqual([]);
    expect(Object.keys(inPt.m.mapping).length).toBe(Object.keys(inEn.m.mapping).length);
    expect(key(inPt.r.process)).toEqual(key(inEn.r.process));
    expect(inPt.r.issues.filter((i) => i.severity === 'error')).toEqual([]);
  });
  it('processo e valores: a aba Process EN preenche volume, período e horas por dia', async () => {
    setActiveLocale('en');
    const p = demoProcess();
    const r = await importFile(fileOf('en.xlsx', await buildWorkbook({ process: p, includeExample: false })));
    expect(r.r.process.volume).toBe(p.volume);
    expect(r.r.process.volumePeriod).toBe(p.volumePeriod);
    expect(r.r.process.hoursPerDay).toBe(p.hoursPerDay);
  });
  it('CSV EN (exportado em EN) volta inteiro, também com o app em PT', async () => {
    setActiveLocale('en');
    const csv = processToCsv(demoProcess());
    const inEn = await importFile(fileOf('en.csv', csv));
    setActiveLocale('pt');
    const inPt = await importFile(fileOf('en.csv', csv));
    expect(key(inPt.r.process)).toEqual(key(inEn.r.process));
    expect(inPt.m.missingMinimal).toEqual([]);
  });
  it('valores em inglês nas células: lean, sim/não, tipo, unidade', async () => {
    const text = 'Macro stage;Activity;Order;Type;Duration;Unit;Lean classification;Is it rework?\r\nA;Do it;1;activity;5;minutes;adds value;no\r\nA;Fix it;2;activity;3;hours;waste;yes\r\nA;Check;3;decision;;;necessary;\r\n';
    const r = await importFile(fileOf('x.csv', text));
    const acts = r.r.process.activities;
    expect(acts.map((a) => a.lean)).toEqual(['VA', 'W', 'NNVA']);
    expect(acts.map((a) => a.unit)).toEqual(['min', 'h', 'min']);
    expect(acts[2].type).toBe('decision');
    expect(acts[1].rework).toBe(true);
    expect(r.r.issues.filter((i) => i.severity === 'error')).toEqual([]);
  });
});

describe('plano de ação em CSV', () => {
  const w = { id: 'w1', asIs: { name: 'P' }, actions: [{ id: 'a', description: 'Do', owner: 'Ana', due: '2026-12-31', priority: 'alta', status: 'em_andamento', successIndicator: 'KPI', origin: { kind: 'manual' }, createdAt: 'x' }], scenarios: [], problems: [] } as unknown as Workspace;
  it('EN exporta cabeçalhos e rótulos em inglês e data ISO; o PT lê de volta', () => {
    setActiveLocale('en');
    const csv = actionsToCsv(w);
    expect(csv.split('\r\n')[0]).toContain('Action;Owner;Due date;Priority;Status');
    expect(csv).toContain('High');
    expect(csv).toContain('In progress');
    expect(csv).toContain('2026-12-31');
    setActiveLocale('pt');
    const back = parsePlanCsv(csv);
    expect(back.actions).toHaveLength(1);
    expect(back.actions[0]).toMatchObject({ description: 'Do', owner: 'Ana', due: '2026-12-31', priority: 'alta', status: 'em_andamento', successIndicator: 'KPI' });
    expect(back.notes).toEqual([]);
  });
  it('CSV PT (dd/mm/aaaa) também é lido com o app em EN', () => {
    setActiveLocale('en');
    const back = parsePlanCsv('Ação;Responsável;Prazo;Prioridade;Situação\nFazer;Ana;31/12/2026;Alta;Em andamento\n');
    expect(back.actions[0]).toMatchObject({ due: '2026-12-31', priority: 'alta', status: 'em_andamento' });
  });
});
