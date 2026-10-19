// Leitura de XLSX/CSV inteiramente no navegador (nenhum envio a servidor).
import type ExcelJS from 'exceljs';

export interface ParsedSheet {
  name: string;
  headers: string[];
  rows: { rowNumber: number; values: unknown[] }[];
}

export interface ParsedFile {
  fileName: string;
  kind: 'xlsx' | 'csv';
  hash: string;
  sheets: ParsedSheet[];
}

export const MAX_IMPORT_BYTES = 10 * 1024 * 1024;
export const MAX_IMPORT_ROWS = 3000;

export class ImportError extends Error {
  constructor(
    message: string,
    public why: string,
    public fix: string,
  ) {
    super(message);
  }
}

function plainCell(v: ExcelJS.CellValue): unknown {
  if (v === null || v === undefined) return null;
  if (v instanceof Date) return v;
  if (typeof v === 'object') {
    const o = v as any;
    // Fórmulas sem resultado em cache (arquivo gerado por biblioteca) não são dados.
    if ('result' in o || 'formula' in o || 'sharedFormula' in o) return o.result ?? null;
    if ('richText' in o) return (o.richText as { text: string }[]).map((t) => t.text).join('');
    if ('text' in o) return o.text;
    if ('error' in o) return null;
    return String(v);
  }
  return v;
}

export async function readWorkbook(data: ArrayBuffer): Promise<ParsedSheet[]> {
  const { default: Excel } = await import('exceljs');
  const wb = new Excel.Workbook();
  await wb.xlsx.load(data);
  const out: ParsedSheet[] = [];
  wb.eachSheet((ws) => {
    if (ws.state === 'hidden' || ws.state === 'veryHidden') return;
    const headers: string[] = [];
    ws.getRow(1).eachCell({ includeEmpty: true }, (cell, col) => {
      headers[col - 1] = String(plainCell(cell.value) ?? '').trim();
    });
    for (let i = 0; i < headers.length; i++) headers[i] = headers[i] ?? '';
    const rows: ParsedSheet['rows'] = [];
    ws.eachRow({ includeEmpty: false }, (row, rowNumber) => {
      if (rowNumber === 1) return;
      const values: unknown[] = [];
      for (let c = 1; c <= Math.max(headers.length, 2); c++) values.push(plainCell(row.getCell(c).value));
      if (values.some((v) => v !== null && String(v).trim() !== '')) rows.push({ rowNumber, values });
    });
    out.push({ name: ws.name, headers, rows });
  });
  return out;
}

export function readCsv(text: string, name = 'CSV'): ParsedSheet {
  const src = text.replace(/^\uFEFF/, '');
  const firstLine = src.split(/\r?\n/, 1)[0] ?? '';
  const delim = [';', ',', '\t'].sort((a, b) => firstLine.split(b).length - firstLine.split(a).length)[0];
  const records: string[][] = [];
  let field = '';
  let rec: string[] = [];
  let inQ = false;
  for (let i = 0; i < src.length; i++) {
    const ch = src[i];
    if (inQ) {
      if (ch === '"') {
        if (src[i + 1] === '"') {
          field += '"';
          i++;
        } else inQ = false;
      } else field += ch;
    } else if (ch === '"') inQ = true;
    else if (ch === delim) {
      rec.push(field);
      field = '';
    } else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && src[i + 1] === '\n') i++;
      rec.push(field);
      records.push(rec);
      rec = [];
      field = '';
    } else field += ch;
  }
  if (field !== '' || rec.length) {
    rec.push(field);
    records.push(rec);
  }
  const [head = [], ...body] = records;
  return {
    name,
    headers: head.map((h) => h.trim()),
    rows: body.map((values, i) => ({ rowNumber: i + 2, values })).filter((r) => r.values.some((v) => String(v).trim() !== '')),
  };
}

export async function sha256(data: ArrayBuffer): Promise<string> {
  const h = await crypto.subtle.digest('SHA-256', data);
  return [...new Uint8Array(h)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

/** Lê o arquivo escolhido. Valida tamanho, extensão e assinatura binária. */
export async function readImportFile(file: { name: string; size: number; arrayBuffer: () => Promise<ArrayBuffer> }): Promise<ParsedFile> {
  const lower = file.name.toLowerCase();
  if (file.size > MAX_IMPORT_BYTES)
    throw new ImportError('Arquivo muito grande.', `O limite é ${MAX_IMPORT_BYTES / 1024 / 1024} MB para manter o processamento rápido no seu aparelho.`, 'Remova abas ou linhas que não fazem parte do processo e tente de novo.');
  if (file.size === 0) throw new ImportError('O arquivo está vazio.', 'Não há dados para ler.', 'Confira se salvou a planilha antes de enviar.');
  const buf = await file.arrayBuffer();
  const hash = await sha256(buf);
  const head = new Uint8Array(buf.slice(0, 4));
  const isZip = head[0] === 0x50 && head[1] === 0x4b;
  if (lower.endsWith('.xlsx') || lower.endsWith('.xlsm')) {
    if (!isZip)
      throw new ImportError('O arquivo não parece ser um XLSX válido.', 'O conteúdo não corresponde ao formato do Excel moderno (.xlsx).', 'Abra no Excel/LibreOffice e use “Salvar como… → Pasta de trabalho do Excel (.xlsx)”, ou exporte como CSV.');
    let sheets: ParsedSheet[];
    try {
      sheets = await readWorkbook(buf);
    } catch {
      throw new ImportError('Não foi possível ler a planilha.', 'O arquivo pode estar corrompido ou protegido por senha de abertura.', 'Salve uma nova cópia sem senha de abertura e tente de novo.');
    }
    if (!sheets.some((s) => s.rows.length)) throw new ImportError('Nenhuma linha de dados encontrada.', 'As abas visíveis não têm linhas abaixo do cabeçalho.', 'Preencha a aba “Atividades” do modelo (a partir da linha 2).');
    checkRows(sheets);
    return { fileName: file.name, kind: 'xlsx', hash, sheets };
  }
  if (lower.endsWith('.csv') || lower.endsWith('.txt')) {
    if (isZip) throw new ImportError('Este arquivo é um XLSX com extensão .csv.', 'O conteúdo é binário (zip).', 'Renomeie para .xlsx ou exporte de novo como CSV.');
    let text = new TextDecoder('utf-8', { fatal: false }).decode(buf);
    // Planilhas salvas em Windows-1252 geram caracteres de substituição; tenta latin1.
    if (text.includes('�')) text = new TextDecoder('windows-1252').decode(buf);
    const sheet = readCsv(text, file.name);
    if (!sheet.rows.length) throw new ImportError('Nenhuma linha de dados encontrada.', 'O CSV tem só o cabeçalho (ou está vazio).', 'Inclua uma linha por atividade abaixo do cabeçalho.');
    checkRows([sheet]);
    return { fileName: file.name, kind: 'csv', hash, sheets: [sheet] };
  }
  if (lower.endsWith('.xls')) throw new ImportError('Formato .xls (Excel 97-2003) não é suportado.', 'Esse formato antigo não pode ser lido com segurança no navegador.', 'Salve como .xlsx ou .csv e tente de novo.');
  throw new ImportError('Formato de arquivo não suportado.', 'Aceitamos planilhas .xlsx e .csv.', 'Baixe o modelo oficial ou salve sua planilha em um desses formatos.');
}

function checkRows(sheets: ParsedSheet[]) {
  const max = Math.max(...sheets.map((s) => s.rows.length));
  if (max > MAX_IMPORT_ROWS)
    throw new ImportError(`A planilha tem mais de ${MAX_IMPORT_ROWS} linhas.`, 'Mapas com milhares de atividades ficam ilegíveis e lentos.', 'Divida em processos menores (um por arquivo).');
}
