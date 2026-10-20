// Plano de ação ⇄ CSV (Excel pt-BR). A exportação é para compartilhar com a equipe;
// a importação lê colunas simples (Ação, Responsável, Prazo e, se houver, Prioridade,
// Situação e Indicador) e nunca inventa dados: o que não vier no arquivo fica pendente.
import type { ActionItem, ActionStatus, Priority, Workspace } from '../domain/types';
import { relatedProblemOf } from '../domain/plan';
import { nowIso, uid } from '../domain/units';
import { csvCell, uncell } from './csv';
import { normalizeHeader } from './fields';
import { ImportError, MAX_IMPORT_BYTES, MAX_IMPORT_ROWS, readCsv } from './parse';

export const STATUS_LABEL: Record<ActionStatus, string> = { a_fazer: 'A fazer', em_andamento: 'Em andamento', bloqueada: 'Bloqueada', concluida: 'Concluída', cancelada: 'Cancelada' };
export const PRIORITY_LABEL: Record<Priority, string> = { alta: 'Alta', media: 'Média', baixa: 'Baixa' };

const isoToBr = (iso?: string) => (iso && /^\d{4}-\d{2}-\d{2}$/.test(iso) ? `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}` : (iso ?? ''));

export const PLAN_HEADERS = ['Ação', 'Responsável', 'Prazo', 'Prioridade', 'Situação', 'Indicador de sucesso', 'Problema relacionado', 'Resultado observado', 'Data de conclusão'];

export function actionsToCsv(w: Workspace): string {
  const lines = [PLAN_HEADERS.map(csvCell).join(';')];
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
  description: ['acao', 'acoes', 'descricao', 'atividade', 'tarefa', 'o_que', 'action', 'what'],
  owner: ['responsavel', 'responsaveis', 'quem', 'dono', 'owner', 'who'],
  due: ['prazo', 'data', 'quando', 'vencimento', 'data_limite', 'due', 'when'],
  priority: ['prioridade', 'priority'],
  status: ['situacao', 'status', 'estado'],
  indicator: ['indicador', 'indicador_de_sucesso', 'kpi', 'meta'],
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
  if (['pendente', 'aberta', 'nao_iniciada', 'todo'].includes(v)) return 'a_fazer';
  if (['andamento', 'fazendo', 'em_curso', 'doing'].includes(v)) return 'em_andamento';
  if (['concluido', 'feito', 'feita', 'done'].includes(v)) return 'concluida';
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
    throw new ImportError('Não encontramos a coluna “Ação”.', `Cabeçalhos lidos: ${sheet.headers.filter(Boolean).join(', ') || 'nenhum'}.`, 'A primeira linha precisa ter os títulos das colunas: Ação, Responsável e Prazo (as duas últimas são opcionais).');
  if (sheet.rows.length > MAX_IMPORT_ROWS) throw new ImportError(`O arquivo tem mais de ${MAX_IMPORT_ROWS} linhas.`, 'Um plano desse tamanho fica ilegível.', 'Divida o arquivo e importe em partes.');
  const get = (values: unknown[], col: Col) => (idx[col] === undefined ? '' : clean(values[idx[col]!]));
  const out: PlanImport = { actions: [], notes: [], missingDue: 0, missingOwner: 0 };
  for (const { rowNumber, values } of sheet.rows) {
    const description = get(values, 'description');
    if (!description) {
      out.notes.push(`Linha ${rowNumber}: sem ação descrita — ignorada.`);
      continue;
    }
    const owner = get(values, 'owner') || undefined;
    const dueRaw = get(values, 'due');
    let due: string | undefined;
    if (dueRaw) {
      const p = parseDue(dueRaw);
      if (p) due = p;
      else out.notes.push(`Linha ${rowNumber}: prazo “${dueRaw}” não é uma data válida — ficou pendente.`);
    }
    const prRaw = get(values, 'priority');
    const priority = parsePriority(prRaw);
    if (prRaw && !priority) out.notes.push(`Linha ${rowNumber}: prioridade “${prRaw}” não reconhecida — ficou Média.`);
    const stRaw = get(values, 'status');
    let status = parseStatus(stRaw);
    if (stRaw && !status) out.notes.push(`Linha ${rowNumber}: situação “${stRaw}” não reconhecida — ficou A fazer.`);
    if (status === 'concluida') {
      // Concluir exige o resultado observado (regra do plano); não inventamos o registro.
      out.notes.push(`Linha ${rowNumber}: “Concluída” exige o resultado observado — importada como A fazer; conclua no app com o registro.`);
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
  if (!lower.endsWith('.csv') && !lower.endsWith('.txt')) throw new ImportError('Formato não suportado.', 'Aqui importamos o plano em CSV.', 'No Excel ou Planilhas Google, use “Salvar como / Fazer download → CSV”.');
  if (file.size > MAX_IMPORT_BYTES) throw new ImportError('Arquivo muito grande.', `O limite é ${MAX_IMPORT_BYTES / 1024 / 1024} MB.`, 'Remova linhas que não fazem parte do plano.');
  if (file.size === 0) throw new ImportError('O arquivo está vazio.', 'Não há linhas para ler.', 'Confira se salvou a planilha antes de enviar.');
  const buf = await file.arrayBuffer();
  const head = new Uint8Array(buf.slice(0, 2));
  if (head[0] === 0x50 && head[1] === 0x4b) throw new ImportError('Este arquivo é um XLSX com extensão .csv.', 'O conteúdo é binário (zip).', 'Exporte de novo como CSV.');
  let text = new TextDecoder('utf-8', { fatal: false }).decode(buf);
  if (text.includes('�')) text = new TextDecoder('windows-1252').decode(buf);
  const r = parsePlanCsv(text, file.name);
  if (!r.actions.length) throw new ImportError('Nenhuma ação encontrada.', 'O arquivo não tem linhas com a coluna “Ação” preenchida.', 'Inclua uma ação por linha abaixo do cabeçalho.');
  return r;
}
