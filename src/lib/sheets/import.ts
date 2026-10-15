// Leitura, mapeamento, validação e pré-visualização de importações XLSX/CSV.
// A validação aqui dá retorno imediato por linha; a gravação definitiva é
// feita pela RPC import_records (transacional, com dry-run no servidor).
import ExcelJS from 'exceljs';
import { SHEETS, SHEET_BY_ENTITY, normalizeKey, READ_ONLY_SHEETS, type ColDef, type EntityKey, type SheetDef } from './schema';
import type { SheetRow } from './export';

export interface ParsedSheet {
  name: string;
  headers: string[];
  rows: { rowNumber: number; values: unknown[] }[];
}

export const MAX_IMPORT_ROWS = 5000;
export const MAX_IMPORT_BYTES = 10 * 1024 * 1024;

function plainCell(v: ExcelJS.CellValue): unknown {
  if (v === null || v === undefined) return null;
  if (v instanceof Date) return v;
  if (typeof v === 'object') {
    const o = v as any;
    if ('result' in o) return o.result ?? null;
    if ('richText' in o) return (o.richText as { text: string }[]).map((t) => t.text).join('');
    if ('text' in o) return o.text;
    if ('error' in o) return null;
    return String(v);
  }
  return v;
}

export async function readWorkbook(data: ArrayBuffer): Promise<ParsedSheet[]> {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(data);
  const out: ParsedSheet[] = [];
  wb.eachSheet((ws) => {
    const headers: string[] = [];
    ws.getRow(1).eachCell({ includeEmpty: true }, (cell, col) => {
      headers[col - 1] = String(plainCell(cell.value) ?? '').trim();
    });
    const rows: ParsedSheet['rows'] = [];
    ws.eachRow({ includeEmpty: false }, (row, rowNumber) => {
      if (rowNumber === 1) return;
      const values: unknown[] = [];
      for (let c = 1; c <= headers.length; c++) values.push(plainCell(row.getCell(c).value));
      if (values.some((v) => v !== null && String(v).trim() !== '')) rows.push({ rowNumber, values });
    });
    out.push({ name: ws.name, headers, rows });
  });
  return out;
}

export function readCsv(text: string, name = 'CSV'): ParsedSheet {
  const src = text.replace(/^﻿/, '');
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
    rows: body
      .map((values, i) => ({ rowNumber: i + 2, values: values.map((v) => (v === '' ? null : v)) }))
      .filter((r) => r.values.some((v) => v !== null && String(v).trim() !== '')),
  };
}

const stripReq = (h: string) => h.replace(/\s*\*\s*$/, '');

export function detectEntity(sheet: ParsedSheet): EntityKey | null {
  const n = normalizeKey(sheet.name);
  if (READ_ONLY_SHEETS.some((s) => normalizeKey(s) === n)) return null;
  const byName = SHEETS.find((s) => normalizeKey(s.sheet) === n || normalizeKey(s.entity) === n);
  if (byName) return byName.entity;
  let best: { e: EntityKey; score: number } | null = null;
  const hs = new Set(sheet.headers.map((h) => normalizeKey(stripReq(h))));
  for (const s of SHEETS) {
    const score = s.columns.filter((c) => hs.has(normalizeKey(c.header)) || hs.has(normalizeKey(c.field))).length / s.columns.length;
    if (!best || score > best.score) best = { e: s.entity, score };
  }
  return best && best.score >= 0.5 ? best.e : null;
}

/** Mapeamento índice-da-coluna → campo ('' = ignorar). */
export type Mapping = string[];

export function autoMap(headers: string[], def: SheetDef): Mapping {
  return headers.map((h) => {
    const k = normalizeKey(stripReq(h));
    const col = def.columns.find((c) => !c.exportOnly && (normalizeKey(c.header) === k || normalizeKey(c.field) === k));
    return col?.field ?? '';
  });
}

type Parsed = { ok: true; value: string | number | boolean | null } | { ok: false; error: string };

const pad = (n: number) => String(n).padStart(2, '0');

export function parseCell(col: ColDef, raw: unknown): Parsed {
  if (raw === null || raw === undefined || (typeof raw === 'string' && raw.trim() === '')) return { ok: true, value: null };
  const s = typeof raw === 'string' ? raw.trim() : raw;
  switch (col.type) {
    case 'date': {
      if (s instanceof Date) {
        if (Number.isNaN(s.getTime())) return { ok: false, error: 'data inválida' };
        return { ok: true, value: `${s.getUTCFullYear()}-${pad(s.getUTCMonth() + 1)}-${pad(s.getUTCDate())}` };
      }
      if (typeof s === 'number') {
        // número serial do Excel
        const d = new Date(Date.UTC(1899, 11, 30) + Math.round(s) * 86_400_000);
        return { ok: true, value: d.toISOString().slice(0, 10) };
      }
      const str = String(s);
      let m = /^(\d{4})-(\d{1,2})-(\d{1,2})(?:[T ].*)?$/.exec(str);
      let y: number, mo: number, d: number;
      if (m) [y, mo, d] = [+m[1], +m[2], +m[3]];
      else if ((m = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(str))) [d, mo, y] = [+m[1], +m[2], +m[3]];
      else return { ok: false, error: `data inválida "${str}" (use dd/mm/aaaa)` };
      const dt = new Date(Date.UTC(y, mo - 1, d));
      if (dt.getUTCFullYear() !== y || dt.getUTCMonth() !== mo - 1 || dt.getUTCDate() !== d)
        return { ok: false, error: `data inexistente "${str}"` };
      return { ok: true, value: `${y}-${pad(mo)}-${pad(d)}` };
    }
    case 'datetime':
      return { ok: true, value: s instanceof Date ? s.toISOString() : String(s) };
    case 'number':
    case 'int': {
      let n: number;
      if (typeof s === 'number') n = s;
      else {
        let str = String(s).replace(/\s|R\$/g, '');
        if (str.includes(',') && str.includes('.')) str = str.replace(/\./g, '').replace(',', '.');
        else if (str.includes(',')) str = str.replace(',', '.');
        str = str.replace(/%$/, '');
        n = Number(str);
      }
      if (!Number.isFinite(n)) return { ok: false, error: `número inválido "${String(s)}"` };
      if (col.type === 'int' && !Number.isInteger(n)) return { ok: false, error: `deve ser inteiro ("${String(s)}")` };
      if (col.min !== undefined && n < col.min) return { ok: false, error: `mínimo ${col.min}` };
      if (col.max !== undefined && n > col.max) return { ok: false, error: `máximo ${col.max}` };
      return { ok: true, value: n };
    }
    case 'bool': {
      const k = normalizeKey(String(s));
      if (['sim', 's', 'true', 'verdadeiro', '1', 'x', 'yes'].includes(k)) return { ok: true, value: true };
      if (['nao', 'n', 'false', 'falso', '0', 'no'].includes(k)) return { ok: true, value: false };
      return { ok: false, error: `use Sim ou Não ("${String(s)}")` };
    }
    case 'enum': {
      const k = normalizeKey(String(s));
      const opt = (col.options ?? []).find((o) => normalizeKey(o.label) === k || normalizeKey(o.value) === k);
      if (!opt) return { ok: false, error: `valor "${String(s)}" não aceito (${(col.options ?? []).map((o) => o.label).join(', ')})` };
      return { ok: true, value: opt.value };
    }
    case 'email': {
      const str = String(s).toLowerCase();
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(str)) return { ok: false, error: `e-mail inválido "${str}"` };
      return { ok: true, value: str };
    }
    case 'code': {
      const str = String(s).toUpperCase();
      if (!/^[A-Z0-9][A-Z0-9_-]{0,39}$/.test(str)) return { ok: false, error: `código inválido "${String(s)}"` };
      return { ok: true, value: str };
    }
    case 'codes': {
      const parts = String(s)
        .split(/[,;]/)
        .map((p) => p.trim().toUpperCase())
        .filter(Boolean);
      const bad = parts.find((p) => !/^[A-Z0-9][A-Z0-9_-]{0,39}$/.test(p));
      if (bad) return { ok: false, error: `código inválido "${bad}"` };
      return { ok: true, value: [...new Set(parts)].sort().join(', ') || null };
    }
    case 'text':
    case 'longtext': {
      const str = String(s instanceof Date ? s.toISOString().slice(0, 10) : s);
      const limit = col.type === 'text' ? 300 : 10000;
      if (str.length > limit) return { ok: false, error: `texto excede ${limit} caracteres` };
      return { ok: true, value: str };
    }
  }
}

export interface RowError {
  entity: EntityKey;
  sheet: string;
  row: number;
  code: string | null;
  field?: string;
  message: string;
}

export interface ValidRow {
  rowNumber: number;
  code: string | null;
  data: Record<string, string | number | boolean | null>;
}

export interface ValidationContext {
  /** Códigos já existentes (visíveis) no banco, por entidade. */
  knownCodes: Record<EntityKey, Set<string>>;
  /** Códigos presentes no próprio arquivo, por entidade. */
  fileCodes: Record<EntityKey, Set<string>>;
  /** E-mails de usuários visíveis ao importador. */
  userEmails: Set<string>;
  /** true = células vazias não apagam valores existentes. */
  ignoreBlank: boolean;
}

const REF_FIELDS: Record<string, EntityKey> = {
  project_code: 'projects',
  parent_code: 'wbs_items',
  wbs_code: 'wbs_items',
  milestone_code: 'milestones',
  predecessors: 'wbs_items',
  depends_on: 'actions',
};

const DATE_PAIRS: [string, string][] = [
  ['planned_start', 'planned_end'],
  ['actual_start', 'actual_end'],
  ['start_date', 'due_date'],
];

export function validateSheet(
  entity: EntityKey,
  sheet: ParsedSheet,
  mapping: Mapping,
  ctx: ValidationContext,
): { rows: ValidRow[]; errors: RowError[] } {
  const def = SHEET_BY_ENTITY[entity];
  const cols = new Map(def.columns.map((c) => [c.field, c]));
  const errors: RowError[] = [];
  const rows: ValidRow[] = [];
  const seen = new Set<string>();
  const mapped = new Set(mapping.filter(Boolean));
  if (!mapped.has('project_code') && entity !== 'projects')
    errors.push({ entity, sheet: sheet.name, row: 1, code: null, field: 'project_code', message: 'Coluna "Código do projeto" não mapeada' });

  for (const r of sheet.rows) {
    const data: ValidRow['data'] = {};
    const rowErr = (message: string, field?: string) =>
      errors.push({ entity, sheet: sheet.name, row: r.rowNumber, code: (data.code as string) ?? null, field, message });
    let failed = false;
    mapping.forEach((field, idx) => {
      if (!field) return;
      const col = cols.get(field);
      if (!col || col.exportOnly) return;
      const p = parseCell(col, r.values[idx]);
      if (!p.ok) {
        failed = true;
        rowErr(`${col.header}: ${p.error}`, field);
        return;
      }
      if (p.value === null && ctx.ignoreBlank && field !== 'code') return;
      data[field] = p.value;
    });
    const code = (data.code as string | null) ?? null;
    if (code) {
      if (seen.has(code)) {
        rowErr(`Código ${code} duplicado no arquivo`, 'code');
        failed = true;
      }
      seen.add(code);
    }
    const isNew = !code || !ctx.knownCodes[entity].has(code);
    for (const c of def.columns) {
      if (!c.required || c.exportOnly) continue;
      const present = data[c.field] !== undefined && data[c.field] !== null;
      if (isNew && !present) {
        rowErr(`${c.header} é obrigatório para novos registros`, c.field);
        failed = true;
      } else if (!isNew && data[c.field] === null) {
        rowErr(`${c.header} não pode ficar vazio`, c.field);
        failed = true;
      }
    }
    for (const [f, target] of Object.entries(REF_FIELDS)) {
      const v = data[f];
      if (v === undefined || v === null || v === '') continue;
      const list = cols.get(f)?.type === 'codes' ? String(v).split(',').map((x) => x.trim()) : [String(v)];
      for (const ref of list) {
        if (!ctx.knownCodes[target].has(ref) && !ctx.fileCodes[target].has(ref)) {
          rowErr(`${cols.get(f)?.header}: código ${ref} não existe no sistema nem no arquivo`, f);
          failed = true;
        }
        if ((f === 'depends_on' || f === 'predecessors' || f === 'parent_code') && ref === code) {
          rowErr(`${cols.get(f)?.header}: o registro não pode depender de si mesmo`, f);
          failed = true;
        }
      }
    }
    for (const f of ['owner_email', 'sponsor_email', 'manager_email']) {
      const v = data[f];
      if (typeof v === 'string' && !ctx.userEmails.has(v)) {
        rowErr(`${cols.get(f)?.header}: usuário ${v} não encontrado entre os membros visíveis`, f);
        failed = true;
      }
    }
    for (const [a, b] of DATE_PAIRS) {
      if (typeof data[a] === 'string' && typeof data[b] === 'string' && (data[b] as string) < (data[a] as string)) {
        rowErr(`${cols.get(b)?.header} anterior a ${cols.get(a)?.header}`, b);
        failed = true;
      }
    }
    if (entity === 'actions' && data.status === 'bloqueada' && (data.blockers === null || (isNew && !data.blockers))) {
      rowErr('Ação bloqueada exige descrição do bloqueio', 'blockers');
      failed = true;
    }
    if (entity === 'milestones' && data.status === 'atingido' && (data.actual_date === null || (isNew && !data.actual_date))) {
      rowErr('Marco atingido exige data real', 'actual_date');
      failed = true;
    }
    if (!failed) rows.push({ rowNumber: r.rowNumber, code, data });
  }
  return { rows, errors };
}

export interface RowDiff {
  rowNumber: number;
  code: string | null;
  kind: 'novo' | 'alterado' | 'sem_alteracao';
  changes: { field: string; header: string; from: unknown; to: unknown }[];
}

/** Compara linhas válidas com o estado atual (formato de planilha) para mostrar o que muda. */
export function diffRows(entity: EntityKey, rows: ValidRow[], current: SheetRow[]): RowDiff[] {
  const def = SHEET_BY_ENTITY[entity];
  const byCode = new Map(current.map((c) => [String(c.code), c]));
  return rows.map((r) => {
    const cur = r.code ? byCode.get(r.code) : undefined;
    if (!cur) return { rowNumber: r.rowNumber, code: r.code, kind: 'novo', changes: [] };
    const changes = Object.entries(r.data)
      .filter(([f]) => f !== 'code')
      .filter(([f, v]) => {
        const a = cur[f] ?? null;
        if (a === null && v === null) return false;
        if (typeof v === 'number' || typeof a === 'number') return Number(a) !== Number(v) || a === null || v === null;
        return String(a ?? '') !== String(v ?? '');
      })
      .map(([f, v]) => ({ field: f, header: def.columns.find((c) => c.field === f)?.header ?? f, from: cur[f] ?? null, to: v }));
    return { rowNumber: r.rowNumber, code: r.code, kind: changes.length ? 'alterado' : 'sem_alteracao', changes };
  });
}

export type ImportPayload = Partial<Record<EntityKey, Record<string, unknown>[]>>;

export function buildPayload(valid: Partial<Record<EntityKey, ValidRow[]>>): ImportPayload {
  const out: ImportPayload = {};
  for (const [e, rows] of Object.entries(valid) as [EntityKey, ValidRow[]][]) {
    if (!rows?.length) continue;
    out[e] = rows.map((r) => ({ ...r.data, _row: r.rowNumber }));
  }
  return out;
}

export function collectFileCodes(sheets: { entity: EntityKey | null; sheet: ParsedSheet; mapping: Mapping }[]) {
  const fileCodes = Object.fromEntries(SHEETS.map((s) => [s.entity, new Set<string>()])) as Record<EntityKey, Set<string>>;
  for (const s of sheets) {
    if (!s.entity) continue;
    const idx = s.mapping.indexOf('code');
    if (idx < 0) continue;
    for (const r of s.sheet.rows) {
      const v = r.values[idx];
      if (v !== null && v !== undefined && String(v).trim()) fileCodes[s.entity].add(String(v).trim().toUpperCase());
    }
  }
  return fileCodes;
}

export function emptyCodeSets(): Record<EntityKey, Set<string>> {
  return Object.fromEntries(SHEETS.map((s) => [s.entity, new Set<string>()])) as Record<EntityKey, Set<string>>;
}
