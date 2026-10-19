import ExcelJS from 'exceljs';
import JSZip from 'jszip';
import { describe, expect, it } from 'vitest';
import { demoProcess } from '../domain/demo';
import { computeMetrics } from '../domain/metrics';
import { validateProcess } from '../domain/validation';
import { FIELDS } from './fields';
import { ImportError, readCsv, readImportFile, readWorkbook } from './parse';
import { autoMap, findSheet, pickActivitySheet, rowsToProcess } from './toProcess';
import { buildWorkbook, INPUT_ROWS, processToCsv, templateCsv } from './workbook';

const ab = (u: Uint8Array) => u.buffer.slice(u.byteOffset, u.byteOffset + u.byteLength) as ArrayBuffer;
const fileOf = (name: string, data: Uint8Array | string) => {
  const bytes = typeof data === 'string' ? new TextEncoder().encode(data) : data;
  return { name, size: bytes.byteLength, arrayBuffer: async () => ab(bytes) };
};

describe('modelo XLSX protegido', () => {
  it('desbloqueia só as entradas e bloqueia cabeçalhos e fórmulas', async () => {
    const buf = await buildWorkbook();
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(ab(buf));
    const ws = wb.getWorksheet('Atividades')!;
    expect((ws as any).sheetProtection?.sheet).toBe(true);
    // Cabeçalho bloqueado (padrão do Excel = locked quando não há override).
    expect(ws.getCell('A1').protection?.locked).not.toBe(false);
    // Células de entrada desbloqueadas até a última linha prevista.
    expect(ws.getCell('B2').protection?.locked).toBe(false);
    expect(ws.getCell(INPUT_ROWS + 1, 3).protection?.locked).toBe(false);
    // Colunas calculadas: fórmula + bloqueio.
    const calc = ws.getCell(2, FIELDS.length + 1);
    expect((calc.value as any).formula).toMatch(/IF\(/);
    // Bloqueada = sem override "locked: false" (o padrão do Excel é bloqueado).
    expect(calc.protection?.locked).not.toBe(false);
    // Processo: rótulos bloqueados, valores desbloqueados.
    const pr = wb.getWorksheet('Processo')!;
    expect(pr.getCell('A2').protection?.locked).not.toBe(false);
    expect(pr.getCell('B2').protection?.locked).toBe(false);
    expect((pr as any).sheetProtection?.sheet).toBe(true);
    // Leia-me e Exemplo totalmente protegidos.
    for (const n of ['Leia-me', 'Exemplo', 'Custos por função']) expect((wb.getWorksheet(n) as any).sheetProtection?.sheet).toBe(true);
    expect(wb.getWorksheet('Exemplo')!.getCell('B2').protection?.locked).not.toBe(false);
  });

  it('tem listas suspensas e validação numérica com mensagens', async () => {
    const buf = await buildWorkbook();
    const zip = await JSZip.loadAsync(buf);
    const files = Object.keys(zip.files).filter((f) => f.startsWith('xl/worksheets/sheet'));
    const xmls = await Promise.all(files.map((f) => zip.file(f)!.async('string')));
    const act = xmls.find((x) => x.includes('minutos,horas,dias'))!;
    expect(act).toBeTruthy();
    expect(act).toContain('início,atividade,decisão,fim');
    expect(act).toContain('agrega valor,necessário,desperdício,não classificado');
    expect(act).toMatch(/type="whole"/);
    expect(act).toMatch(/Escolha: minutos, horas ou dias/);
    expect(act).toMatch(/<sheetProtection[^>]*sheet="1"/);
  });

  it('trava a estrutura do arquivo sem senha', async () => {
    const zip = await JSZip.loadAsync(await buildWorkbook());
    const wbXml = await zip.file('xl/workbook.xml')!.async('string');
    expect(wbXml).toMatch(/<workbookProtection lockStructure="1"\/>/);
    expect(wbXml).not.toMatch(/workbookPassword|workbookHashValue/);
    // Ordem do esquema OOXML: workbookPr → workbookProtection → sheets.
    expect(wbXml.indexOf('<workbookPr')).toBeLessThan(wbXml.indexOf('<workbookProtection'));
    expect(wbXml.indexOf('<workbookProtection')).toBeLessThan(wbXml.indexOf('<sheets'));
  });

  it('a aba Exemplo do modelo importa sem erros', async () => {
    const sheets = await readWorkbook(ab(await buildWorkbook()));
    const ex = findSheet(sheets, 'Exemplo')!;
    const m = autoMap(ex.headers);
    expect(m.missingMinimal).toEqual([]);
    const r = rowsToProcess(ex, m.mapping, { defaultUnit: 'min' });
    expect(r.ok).toBe(true);
    expect(validateProcess(r.process).filter((i) => i.severity === 'error')).toEqual([]);
    expect(r.process.activities).toHaveLength(demoProcess().activities.length);
  });

  it('ida e volta: exportar e reimportar preserva dados e métricas', async () => {
    const p = demoProcess();
    const sheets = await readWorkbook(ab(await buildWorkbook({ process: p, includeExample: false })));
    const idx = pickActivitySheet(sheets);
    expect(sheets[idx].name).toBe('Atividades');
    const r = rowsToProcess(sheets[idx], autoMap(sheets[idx].headers).mapping, { defaultUnit: 'min' }, findSheet(sheets, 'Processo'), findSheet(sheets, 'Custos por função'));
    expect(r.ok).toBe(true);
    expect(r.process.name).toBe(p.name);
    expect(r.process.volume).toBe(1200);
    expect(r.process.costPerHourByRole).toEqual(p.costPerHourByRole);
    const a = computeMetrics(p);
    const b = computeMetrics(r.process);
    expect(b.effortPeriodH.value).toBeCloseTo(a.effortPeriodH.value!, 9);
    expect(b.totalCostPeriod.value).toBeCloseTo(a.totalCostPeriod.value!, 9);
    expect(b.elapsed).toEqual(a.elapsed);
  });
});

describe('importação CSV e validações por linha', () => {
  it('CSV do modelo (com ; e vírgula decimal) importa igual ao exemplo', async () => {
    const f = await readImportFile(fileOf('modelo.csv', templateCsv()));
    expect(f.kind).toBe('csv');
    const s = f.sheets[0];
    const r = rowsToProcess(s, autoMap(s.headers).mapping, { defaultUnit: 'min' });
    expect(r.ok).toBe(true);
    expect(r.process.activities.find((a) => a.id === 'D1')!.nextNo).toBe('A3');
  });

  it('só campos mínimos (sem fluxo): gera processo linear e avisa', () => {
    const s = readCsv('Etapa,Atividade,Ordem,Duração,Unidade\nA,Receber,1,10,min\nA,Conferir,2,5,min\nB,Aprovar,3,1,h\n');
    const m = autoMap(s.headers);
    expect(m.missingMinimal).toEqual([]);
    const r = rowsToProcess(s, m.mapping, { defaultUnit: 'min' });
    expect(r.flowInferred).toBe(true);
    expect(r.process.activities.map((a) => a.next)).toEqual([['L2'], ['L3'], []]);
    expect(r.process.activities.every((a) => a.flowInferred || !a.next.length)).toBe(true);
    expect(validateProcess(r.process).some((i) => i.code === 'flow_inferred')).toBe(true);
    const metrics = computeMetrics(r.process);
    expect(metrics.activeSumH.value).toBeCloseTo(1.25);
    expect(metrics.effortExecH.value).toBeNull();
  });

  it('cabeçalhos em inglês são reconhecidos', () => {
    const m = autoMap(['Stage', 'Task', 'Order', 'Duration', 'Unit', 'Owner', 'Next']);
    expect(m.mapping).toMatchObject({ etapa_macro: 0, atividade: 1, ordem: 2, duracao: 3, unidade_duracao: 4, responsavel: 5, proxima_atividade: 6 });
  });

  it('aponta erros por linha sem descartar as demais', () => {
    const s = readCsv('Código;Etapa;Atividade;Duração;Unidade;Próxima atividade;Tipo\nA1;X;Um;abc;min;A2;\nA1;X;Dois;-3;semanas;A9;\nA3;X;;5;min;;xyz\n');
    const r = rowsToProcess(s, autoMap(s.headers).mapping, { defaultUnit: 'min' });
    expect(r.ok).toBe(false);
    const msgs = r.issues.map((i) => `${i.row}:${i.severity}:${i.field}`);
    expect(msgs).toEqual(expect.arrayContaining(['2:error:duracao', '3:error:id_atividade', '3:error:duracao', '3:error:unidade_duracao', '4:error:atividade', '4:warning:tipo_elemento']));
    expect(r.process.activities).toHaveLength(3);
    expect(validateProcess(r.process).some((i) => i.code === 'dangling')).toBe(true);
  });

  it('resolve próxima atividade por nome ou número de ordem, avisando', () => {
    const s = readCsv('Etapa,Atividade,Ordem,Duração,Unidade,Próxima atividade\nA,Receber,1,10,min,Conferir\nA,Conferir,2,5,min,3\nA,Fechar,3,1,min,\n');
    const r = rowsToProcess(s, autoMap(s.headers).mapping, { defaultUnit: 'min' });
    expect(r.process.activities.map((a) => a.next)).toEqual([['L2'], ['L3'], []]);
    expect(r.issues.filter((i) => i.severity === 'info')).toHaveLength(2);
  });

  it('unidade vazia usa o padrão escolhido e informa', () => {
    const s = readCsv('Etapa,Atividade,Duração\nA,Receber,2\n');
    const r = rowsToProcess(s, autoMap(s.headers).mapping, { defaultUnit: 'h' });
    expect(r.process.activities[0].unit).toBe('h');
    expect(r.issues.some((i) => i.field === 'unidade_duracao' && i.severity === 'info')).toBe(true);
  });

  it('rejeita arquivos inválidos com explicação', async () => {
    await expect(readImportFile(fileOf('x.xlsx', 'não sou zip'))).rejects.toBeInstanceOf(ImportError);
    await expect(readImportFile(fileOf('x.pdf', '%PDF'))).rejects.toThrow(/não suportado/);
    await expect(readImportFile(fileOf('x.csv', 'Etapa;Atividade\n'))).rejects.toThrow(/Nenhuma linha/);
    await expect(readImportFile(fileOf('x.xls', 'abc'))).rejects.toThrow(/97-2003/);
    await expect(readImportFile(fileOf('x.csv', ''))).rejects.toThrow(/vazio/);
  });

  it('CSV exportado reimporta com fluxo e decisões', () => {
    const s = readCsv(processToCsv(demoProcess()));
    const r = rowsToProcess(s, autoMap(s.headers).mapping, { defaultUnit: 'min' });
    expect(r.flowInferred).toBe(false);
    expect(r.process.activities.find((a) => a.id === 'B2')!.frequencyPct).toBe(15);
    expect(r.process.activities.find((a) => a.id === 'A3')!.rework).toBe(true);
  });
});
