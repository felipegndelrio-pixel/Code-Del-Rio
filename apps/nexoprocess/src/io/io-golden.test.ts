// Régua do PT na camada de planilhas: modelo XLSX, CSV, mensagens de importação e do plano.
// src/io/golden/io-pt.json foi gerado do código ANTES da migração para EN. Não regenere para
// fazer o teste passar (NEXO_WRITE_IO_GOLDEN=1 só num commit sem mudança de texto).
import ExcelJS from 'exceljs';
import JSZip from 'jszip';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { demoProcess } from '../domain/demo';
import { actionsToCsv, parsePlanCsv, readPlanFile } from './planCsv';
import { ImportError, readCsv, readImportFile } from './parse';
import { autoMap, rowsToProcess } from './toProcess';
import { buildWorkbook, processToCsv, templateCsv } from './workbook';
import type { ParsedSheet } from './parse';
import type { Workspace } from '../domain/types';

const GOLDEN = new URL('./golden/io-pt.json', import.meta.url);
const WRITE = process.env.NEXO_WRITE_IO_GOLDEN === '1';
const ab = (u: Uint8Array) => u.buffer.slice(u.byteOffset, u.byteOffset + u.byteLength) as ArrayBuffer;
const fileOf = (name: string, data: Uint8Array | string) => {
  const bytes = typeof data === 'string' ? new TextEncoder().encode(data) : data;
  return { name, size: bytes.byteLength, arrayBuffer: async () => ab(bytes) };
};

async function dumpWorkbook(buf: Uint8Array) {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(ab(buf));
  const sheets = wb.worksheets.map((ws) => {
    const rows: unknown[][] = [];
    for (let r = 1; r <= Math.min(ws.rowCount, 4); r++) {
      const cells: unknown[] = [];
      ws.getRow(r).eachCell({ includeEmpty: true }, (c) => cells.push(c.value && typeof c.value === 'object' && 'formula' in (c.value as object) ? { formula: (c.value as { formula: string }).formula } : c.value));
      rows.push(cells);
    }
    const notes: string[] = [];
    ws.getRow(1).eachCell((c) => {
      if (c.note) notes.push(typeof c.note === 'string' ? c.note : JSON.stringify(c.note));
    });
    return { name: ws.name, rows, notes };
  });
  const zip = await JSZip.loadAsync(buf);
  const validations: string[] = [];
  for (const f of Object.keys(zip.files).filter((x) => x.startsWith('xl/worksheets/sheet'))) {
    const xml = await zip.file(f)!.async('string');
    for (const m of xml.matchAll(/<dataValidation [^>]*>/g)) validations.push(m[0]);
    for (const m of xml.matchAll(/<formula1>([^<]*)<\/formula1>/g)) validations.push(m[1]);
  }
  return { sheets, validations };
}

const sheet = (headers: string[], rows: unknown[][]): ParsedSheet => ({ name: 'Atividades', headers, rows: rows.map((values, i) => ({ rowNumber: i + 2, values })) });
const HEAD = ['Código', 'Etapa macro', 'Atividade', 'Ordem', 'Tipo', 'Duração', 'Unidade', 'Responsável', 'Pessoas', 'Próxima atividade', 'Próxima se SIM', 'Próxima se NÃO', 'Classificação Lean', 'Tempo de espera', 'É retrabalho?', 'Frequência (%)', 'Crítica?', 'Volume da atividade', 'Custo-hora (R$)', 'Custo variável por execução (R$)', 'Duração mínima', 'Duração máxima', 'Observações'];

async function build() {
  const out: Record<string, unknown> = {};
  out.template = await dumpWorkbook(await buildWorkbook());
  out.exported = await dumpWorkbook(await buildWorkbook({ process: demoProcess(), includeExample: false }));
  out.templateCsv = templateCsv();
  out.processCsv = processToCsv(demoProcess());
  // mensagens de importação
  const bad = sheet(HEAD, [
    ['A1', 'Etapa', 'Receber', 1, 'xyz', 'abc', 'zzz', 'Ana', 1, 'Registrar', '', '', 'lixo', -3, 'talvez', 150, 'sim', '', '', '', '', '', ''],
    ['A1', '', 'Registrar', 1, '', 10, '', '', '', '2', '', '', '', '', '', '', '', '', '', '', '', '', ''],
    ['A3', 'Etapa', '', 'oi', 'decisão', 5, 'min', '', '', '', 'A1', 'Receber', '', '', '', '', '', '', '', '', '', '', ''],
    ['', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', 'só observação'],
  ]);
  const processSheet = { name: 'Processo', headers: ['Campo', 'Valor', 'Ajuda'], rows: [
    { rowNumber: 2, values: ['Volume de execuções', 'x', ''] },
    { rowNumber: 3, values: ['Período do volume', 'quinzena', ''] },
    { rowNumber: 4, values: ['Horas de trabalho por dia', 99, ''] },
    { rowNumber: 5, values: ['Custo variável já inclui mão de obra?', 'talvez', ''] },
  ] } as ParsedSheet;
  const costSheet = { name: 'Custos por função', headers: ['Função', 'Custo'], rows: [{ rowNumber: 2, values: ['Analista', 'abc'] }] } as ParsedSheet;
  const m = autoMap(HEAD);
  const r = rowsToProcess(bad, m.mapping, { defaultUnit: 'h' }, processSheet, costSheet);
  out.importIssues = r.issues;
  out.importName = rowsToProcess(sheet(HEAD, [['', 'Etapa', 'X', '', '', 5, 'min', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '']]), m.mapping, { defaultUnit: 'min' }).process.name;
  out.noFlowDecision = rowsToProcess(sheet(HEAD.slice(0, 7), [['A1', 'E', 'Pergunta?', 1, 'decisão', '', 'min'], ['A2', 'E', 'Fazer', 2, '', 5, 'min']]), autoMap(HEAD.slice(0, 7)).mapping, { defaultUnit: 'min' }).issues;
  out.noEtapa = rowsToProcess(sheet(HEAD.slice(0, 7), [['A1', '', 'Fazer', 1, '', 5, 'min']]), autoMap(HEAD.slice(0, 7)).mapping, { defaultUnit: 'min' }).process.activities.map((a) => [a.stage, a.name]);
  // erros de arquivo
  const errs: Record<string, unknown> = {};
  const tryFile = async (k: string, f: ReturnType<typeof fileOf>) => {
    try {
      await readImportFile(f);
      errs[k] = 'ok';
    } catch (e) {
      errs[k] = e instanceof ImportError ? [e.message, e.why, e.fix] : String(e);
    }
  };
  await tryFile('vazio', fileOf('a.csv', ''));
  await tryFile('xls', fileOf('a.xls', 'x'));
  await tryFile('txtbin', fileOf('a.docx', 'x'));
  await tryFile('falso-xlsx', fileOf('a.xlsx', 'não é zip'));
  await tryFile('csv-so-cabecalho', fileOf('a.csv', 'Código;Atividade\n'));
  await tryFile('csv-zip', fileOf('a.csv', new Uint8Array([0x50, 0x4b, 3, 4])));
  out.fileErrors = errs;
  // plano
  const w = { id: 'w1', asIs: { name: 'P' }, actions: [{ id: 'a', description: 'Fazer', owner: 'Ana', due: '2026-12-31', priority: 'alta', status: 'em_andamento', successIndicator: 'KPI', origin: { kind: 'manual' }, createdAt: 'x' }], scenarios: [], problems: [] } as unknown as Workspace;
  try {
    out.planCsv = actionsToCsv(w);
  } catch (e) {
    out.planCsv = String(e);
  }
  const pl = parsePlanCsv('Ação;Responsável;Prazo;Prioridade;Situação\nA;B;31/02/2026;urgente;parado\n;x;;;\nC;;;;Concluída\n');
  out.planNotes = pl.notes;
  const planErr: Record<string, unknown> = {};
  for (const [k, f] of Object.entries({ semAcao: () => parsePlanCsv('Foo;Bar\n1;2\n'), xlsx: () => readPlanFile(fileOf('a.xlsx', 'x')) })) {
    try {
      await f();
    } catch (e) {
      planErr[k] = e instanceof ImportError ? [e.message, e.why, e.fix] : String(e);
    }
  }
  out.planErrors = planErr;
  void readCsv;
  return JSON.parse(JSON.stringify(out));
}

describe('golden PT da camada de planilhas', () => {
  it('modelo XLSX, CSV, mensagens de importação e plano idênticos ao PT original', async () => {
    const got = await build();
    if (WRITE) {
      writeFileSync(GOLDEN, JSON.stringify(got, null, 2) + '\n');
      return;
    }
    expect(existsSync(GOLDEN)).toBe(true);
    expect(got).toEqual(JSON.parse(readFileSync(GOLDEN, 'utf8')));
  });
});
