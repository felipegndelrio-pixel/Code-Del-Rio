// Plano de ação ⇄ CSV (Excel pt-BR). A exportação é para compartilhar com a equipe;
// a importação lê colunas simples (Ação, Responsável, Prazo e, se houver, Prioridade,
// Situação e Indicador) e nunca inventa dados: o que não vier no arquivo fica pendente.
import type { ActionItem, ActionStatus, Priority, Workspace } from '../domain/types';
import { relatedProblemOf } from '../domain/plan';
import { nowIso, uid } from '../domain/units';
import { csvCell, uncell } from './csv';
import { normalizeHeader } from './fields';
import { ImportError, MAX_IMPORT_BYTES, MAX_IMPORT_ROWS, readCsv } from './parse';
import { getActiveLocale, lazyLabels, tr } from '../i18n';

export const STATUS_LABEL = lazyLabels<ActionStatus>({ a_fazer: 'io.plan.st.a_fazer', em_andamento: 'io.plan.st.em_andamento', bloqueada: 'io.plan.st.bloqueada', concluida: 'io.plan.st.concluida', cancelada: 'io.plan.st.cancelada' });
export const PRIORITY_LABEL = lazyLabels<Priority>({ alta: 'io.plan.pr.alta', media: 'io.plan.pr.media', baixa: 'io.plan.pr.baixa' });

/** PT: dd/mm/aaaa. EN: aaaa-mm-dd (sem ambiguidade entre dia e mês); a importação aceita os dois. */
const isoToBr = (iso?: string) => (iso && /^\d{4}-\d{2}-\d{2}$/.test(iso) && getActiveLocale() !== 'en' ? `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}` : (iso ?? ''));

export const planHeaders = (): string[] => [1, 2, 3, 4, 5, 6, 7, 8, 9].map((n) => tr(`io.plan.h${n}` as 'io.plan.h1'));

export function actionsToCsv(w: Workspace): string {
  const lines = [planHeaders().map(csvCell).join(';')];
  for (const a of w.actions)
    lines.push(
      [a.description, a.owner ?? '', isoToBr(a.due), PRIORITY_LABEL[a.priority], STATUS_LABEL[a.status], a.successIndicator ?? '', relatedProblemOf(a, w) ?? '', a.observedResult ?? '', isoToBr(a.completedAt)]
        .map(csvCell)
        .join(';'),
    );
  return '﻿' + lines.join('\r\n') + '\r\n';
}

// ------------------------------------------------------------------ importação
const COLS = {
  description: ['acao', 'acoes', 'descricao', 'atividade', 'tarefa', 'o_que', 'action', 'what', 'actions', 'description', 'activity', 'task'],
  owner: ['responsavel', 'responsaveis', 'quem', 'dono', 'owner', 'who'],
  due: ['prazo', 'data', 'quando', 'vencimento', 'data_limite', 'due', 'when', 'due_date', 'deadline', 'date'],
  priority: ['prioridade', 'priority'],
  status: ['situacao', 'status', 'estado'],
  indicator: ['indicador', 'indicador_de_sucesso', 'kpi', 'meta', 'success_indicator', 'indicator', 'target'],
} as const;
type Col = keyof typeof COLS;

const MAX_TEXT = 500;
const clean = (v: unknown) => uncell(String(v ?? '').trim()).slice(0, MAX_TEXT);

/** Aceita dd/mm/aaaa, d/m/aa, dd-mm-aaaa e aaaa-mm-dd. Devolve aaaa-mm-dd ou null (data inválida). */
export function parseDue(raw: string): string | null {
  const s = raw.trim();
  let y: number, m: number, d: number;
  let r = /^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(s);
  if (r) [y, m, d] = [Number(r[1]), Number(r[2]), Number(r[3])];
  else if ((r = /^(\d{1,2})[/.-](\d{1,2})[/.-](\d{2}|\d{4})$/.exec(s))) {
    [d, m, y] = [Number(r[1]), Number(r[2]), Number(r[3])];
    if (y < 100) y += 2000;
  } else return null;
  const dt = new Date(Date.UTC(y, m - 1, d));
  if (dt.getUTCFullYear() !== y || dt.getUTCMonth() !== m - 1 || dt.getUTCDate() !== d) return null;
  return `${String(y).padStart(4, '0')}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
}

const norm = (s: string) => normalizeHeader(s);
function parsePriority(raw: string): Priority | null {
  const v = norm(raw);
  if (!v) return null;
  if (['alta', 'high', 'a', '1'].includes(v)) return 'alta';
  if (['media', 'medium', 'm', '2'].includes(v)) return 'media';
  if (['baixa', 'low', 'b', '3'].includes(v)) return 'baixa';
  return null;
}
function parseStatus(raw: string): ActionStatus | null {
  const v = norm(raw);
  if (!v) return null;
  const hit = (Object.keys(STATUS_LABEL) as ActionStatus[]).find((k) => k === v || norm(STATUS_LABEL[k]) === v);
  if (hit) return hit;
  if (['pendente', 'aberta', 'nao_iniciada', 'todo', 'to_do', 'open', 'not_started'].includes(v)) return 'a_fazer';
  if (['andamento', 'fazendo', 'em_curso', 'doing', 'in_progress', 'ongoing'].includes(v)) return 'em_andamento';
  if (['concluido', 'feito', 'feita', 'done', 'completed', 'complete', 'finished'].includes(v)) return 'concluida';
  if (['bloqueado', 'blocked', 'on_hold'].includes(v)) return 'bloqueada';
  if (['cancelado', 'cancelled', 'canceled'].includes(v)) return 'cancelada';
  return null;
}

export interface PlanImport {
  actions: ActionItem[];
  /** Avisos por linha (data inválida, situação desconhecida…). */
  notes: string[];
  missingDue: number;
  missingOwner: number;
}

export function parsePlanCsv(text: string, fileName = 'CSV'): PlanImport {
  const sheet = readCsv(text, fileName);
  const idx: Partial<Record<Col, number>> = {};
  sheet.headers.forEach((h, i) => {
    const n = norm(h);
    for (const [col, names] of Object.entries(COLS) as [Col, readonly string[]][]) if (idx[col] === undefined && names.includes(n)) idx[col] = i;
  });
  if (idx.description === undefined)
    throw new ImportError(tr('io.plan.err.nocol'), tr('io.plan.err.nocol.why', { list: sheet.headers.filter(Boolean).join(', ') || tr('io.plan.none') }), tr('io.plan.err.nocol.fix'));
  if (sheet.rows.length > MAX_IMPORT_ROWS) throw new ImportError(tr('io.plan.err.rows', { n: MAX_IMPORT_ROWS }), tr('io.plan.err.rows.why'), tr('io.plan.err.rows.fix'));
  const get = (values: unknown[], col: Col) => (idx[col] === undefined ? '' : clean(values[idx[col]!]));
  const out: PlanImport = { actions: [], notes: [], missingDue: 0, missingOwner: 0 };
  for (const { rowNumber, values } of sheet.rows) {
    const description = get(values, 'description');
    if (!description) {
      out.notes.push(tr('io.plan.note.noAction', { n: rowNumber }));
      continue;
    }
    const owner = get(values, 'owner') || undefined;
    const dueRaw = get(values, 'due');
    let due: string | undefined;
    if (dueRaw) {
      const p = parseDue(dueRaw);
      if (p) due = p;
      else out.notes.push(tr('io.plan.note.due', { n: rowNumber, raw: dueRaw }));
    }
    const prRaw = get(values, 'priority');
    const priority = parsePriority(prRaw);
    if (prRaw && !priority) out.notes.push(tr('io.plan.note.priority', { n: rowNumber, raw: prRaw, def: PRIORITY_LABEL.media }));
    const stRaw = get(values, 'status');
    let status = parseStatus(stRaw);
    if (stRaw && !status) out.notes.push(tr('io.plan.note.status', { n: rowNumber, raw: stRaw, def: STATUS_LABEL.a_fazer }));
    if (status === 'concluida') {
      // Concluir exige o resultado observado (regra do plano); não inventamos o registro.
      out.notes.push(tr('io.plan.note.done', { n: rowNumber, done: STATUS_LABEL.concluida, todo: STATUS_LABEL.a_fazer }));
      status = 'a_fazer';
    }
    if (!owner) out.missingOwner++;
    if (!due) out.missingDue++;
    out.actions.push({
      id: uid('act_'),
      description,
      owner,
      due,
      priority: priority ?? 'media',
      status: status ?? 'a_fazer',
      successIndicator: get(values, 'indicator') || undefined,
      origin: { kind: 'manual' },
      createdAt: nowIso(),
    });
  }
  return out;
}

/** Lê o arquivo escolhido (só CSV; o conteúdo nunca sai do aparelho). */
export async function readPlanFile(file: { name: string; size: number; arrayBuffer: () => Promise<ArrayBuffer> }): Promise<PlanImport> {
  const lower = file.name.toLowerCase();
  if (!lower.endsWith('.csv') && !lower.endsWith('.txt')) throw new ImportError(tr('io.plan.err.format'), tr('io.plan.err.format.why'), tr('io.plan.err.format.fix'));
  if (file.size > MAX_IMPORT_BYTES) throw new ImportError(tr('io.err.big'), tr('io.plan.err.big.why', { mb: MAX_IMPORT_BYTES / 1024 / 1024 }), tr('io.plan.err.big.fix'));
  if (file.size === 0) throw new ImportError(tr('io.err.empty'), tr('io.plan.err.empty.why'), tr('io.err.empty.fix'));
  const buf = await file.arrayBuffer();
  const head = new Uint8Array(buf.slice(0, 2));
  if (head[0] === 0x50 && head[1] === 0x4b) throw new ImportError(tr('io.err.zipcsv'), tr('io.err.zipcsv.why'), tr('io.plan.err.zip.fix'));
  let text = new TextDecoder('utf-8', { fatal: false }).decode(buf);
  if (text.includes('�')) text = new TextDecoder('windows-1252').decode(buf);
  const r = parsePlanCsv(text, file.name);
  if (!r.actions.length) throw new ImportError(tr('io.plan.err.none'), tr('io.plan.err.none.why'), tr('io.plan.err.none.fix'));
  return r;
}
