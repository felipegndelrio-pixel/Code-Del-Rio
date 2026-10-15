import ExcelJS from 'exceljs';
import type {
  Action,
  ActionDependency,
  AuditEntry,
  ChangeRequest,
  Decision,
  Issue,
  Lesson,
  Milestone,
  Profile,
  Project,
  Risk,
  Stakeholder,
  WbsDependency,
  WbsItem,
} from '../types';
import { SHEETS, SHEET_BY_ENTITY, type ColDef, type EntityKey } from './schema';
import { labelOf } from '../constants';
import { portfolioSummary, projectKpis, todayUTC, type PortfolioSummary, type ProjectKpi } from '../kpi';

export interface Dataset {
  projects: Project[];
  wbs: WbsItem[];
  wbsDeps: WbsDependency[];
  milestones: Milestone[];
  actions: Action[];
  actionDeps: ActionDependency[];
  risks: Risk[];
  issues: Issue[];
  decisions: Decision[];
  changes: ChangeRequest[];
  stakeholders: Stakeholder[];
  lessons: Lesson[];
  profiles: Profile[];
  audit: AuditEntry[];
}

export type SheetRow = Record<string, string | number | boolean | null>;

/** Converte os registros do banco em linhas no formato da planilha (códigos e e-mails no lugar de IDs). */
export function toSheetRows(d: Dataset): Record<EntityKey, SheetRow[]> {
  const email = new Map(d.profiles.map((p) => [p.id, p.email]));
  const pcode = new Map(d.projects.map((p) => [p.id, p.code]));
  const wcode = new Map(d.wbs.map((w) => [w.id, w.code]));
  const mcode = new Map(d.milestones.map((m) => [m.id, m.code]));
  const acode = new Map(d.actions.map((a) => [a.id, a.code]));
  const em = (id: string | null) => (id ? (email.get(id) ?? null) : null);
  const pick = (row: Record<string, any>, entity: EntityKey, extra: Record<string, any>): SheetRow => {
    const out: SheetRow = {};
    for (const c of SHEET_BY_ENTITY[entity].columns) {
      const v = c.field in extra ? extra[c.field] : row[c.field];
      out[c.field] = v === undefined ? null : v;
    }
    return out;
  };
  const byCode = <T extends { code: string }>(xs: T[]) => [...xs].sort((a, b) => a.code.localeCompare(b.code));

  return {
    projects: byCode(d.projects).map((p) =>
      pick(p, 'projects', { sponsor_email: em(p.sponsor_id), manager_email: em(p.manager_id) }),
    ),
    wbs_items: byCode(d.wbs).map((w) =>
      pick(w, 'wbs_items', {
        project_code: pcode.get(w.project_id) ?? null,
        parent_code: w.parent_id ? (wcode.get(w.parent_id) ?? null) : null,
        owner_email: em(w.owner_id),
        predecessors:
          d.wbsDeps
            .filter((x) => x.successor_id === w.id)
            .map((x) => wcode.get(x.predecessor_id))
            .filter(Boolean)
            .sort()
            .join(', ') || null,
      }),
    ),
    milestones: byCode(d.milestones).map((m) =>
      pick(m, 'milestones', {
        project_code: pcode.get(m.project_id) ?? null,
        wbs_code: m.wbs_item_id ? (wcode.get(m.wbs_item_id) ?? null) : null,
      }),
    ),
    actions: byCode(d.actions).map((a) =>
      pick(a, 'actions', {
        project_code: pcode.get(a.project_id) ?? null,
        wbs_code: a.wbs_item_id ? (wcode.get(a.wbs_item_id) ?? null) : null,
        milestone_code: a.milestone_id ? (mcode.get(a.milestone_id) ?? null) : null,
        owner_email: em(a.owner_id),
        completed_by_email: em(a.completed_by),
        depends_on:
          d.actionDeps
            .filter((x) => x.action_id === a.id)
            .map((x) => acode.get(x.depends_on_id))
            .filter(Boolean)
            .sort()
            .join(', ') || null,
      }),
    ),
    risks: byCode(d.risks).map((r) => pick(r, 'risks', { project_code: pcode.get(r.project_id) ?? null, owner_email: em(r.owner_id) })),
    issues: byCode(d.issues).map((r) => pick(r, 'issues', { project_code: pcode.get(r.project_id) ?? null, owner_email: em(r.owner_id) })),
    decisions: byCode(d.decisions).map((r) =>
      pick(r, 'decisions', {
        project_code: pcode.get(r.project_id) ?? null,
        owner_email: em(r.owner_id),
        decided_by_email: em(r.decided_by),
      }),
    ),
    change_requests: byCode(d.changes).map((r) => pick(r, 'change_requests', { project_code: pcode.get(r.project_id) ?? null })),
    stakeholders: byCode(d.stakeholders).map((r) => pick(r, 'stakeholders', { project_code: pcode.get(r.project_id) ?? null })),
    lessons_learned: byCode(d.lessons).map((r) => pick(r, 'lessons_learned', { project_code: pcode.get(r.project_id) ?? null })),
  };
}

const NAVY = 'FF06142B';
const TEAL = 'FF2DD4BF';

function cellValue(c: ColDef, v: SheetRow[string]): ExcelJS.CellValue {
  if (v === null || v === undefined || v === '') return null;
  switch (c.type) {
    case 'date': {
      const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(v));
      return m ? new Date(Date.UTC(+m[1], +m[2] - 1, +m[3])) : String(v);
    }
    case 'datetime':
      return new Date(String(v));
    case 'number':
    case 'int':
      return Number(v);
    case 'bool':
      return v ? 'Sim' : 'Não';
    case 'enum':
      return labelOf(c.options ?? [], String(v));
    default:
      return String(v);
  }
}

function styleHeader(ws: ExcelJS.Worksheet) {
  const row = ws.getRow(1);
  row.font = { bold: true, color: { argb: 'FFFFFFFF' } };
  row.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: NAVY } };
  row.alignment = { vertical: 'middle', wrapText: true };
  row.height = 30;
  ws.views = [{ state: 'frozen', ySplit: 1 }];
}

function addDataSheet(wb: ExcelJS.Workbook, entity: EntityKey, rows: SheetRow[], withValidation: boolean) {
  const def = SHEET_BY_ENTITY[entity];
  const ws = wb.addWorksheet(def.sheet);
  ws.columns = def.columns.map((c) => ({
    header: c.required ? `${c.header} *` : c.header,
    key: c.field,
    width: c.type === 'longtext' ? 40 : c.type === 'email' ? 28 : c.type === 'date' ? 14 : Math.max(12, c.header.length + 2),
    style: c.type === 'date' ? { numFmt: 'dd/mm/yyyy' } : c.type === 'datetime' ? { numFmt: 'dd/mm/yyyy hh:mm' } : {},
  }));
  for (const r of rows) {
    ws.addRow(Object.fromEntries(def.columns.map((c) => [c.field, cellValue(c, r[c.field])])));
  }
  styleHeader(ws);
  def.columns.forEach((c, i) => {
    const cell = ws.getRow(1).getCell(i + 1);
    if (c.exportOnly) cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF475569' } };
    if (c.help) cell.note = c.help;
  });
  if (rows.length) ws.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: def.columns.length } };
  if (withValidation) {
    def.columns.forEach((c, i) => {
      if (c.type !== 'enum' && c.type !== 'bool') return;
      const list = c.type === 'bool' ? ['Sim', 'Não'] : (c.options ?? []).map((o) => o.label);
      const formula = `"${list.join(',')}"`;
      if (formula.length > 255) return;
      const col = ws.getColumn(i + 1).letter;
      // Validação por intervalo: não cria linhas vazias na planilha.
      (ws as any).dataValidations.add(`${col}2:${col}1000`, { type: 'list', allowBlank: true, formulae: [formula] });
    });
  }
  return ws;
}

function addInstructions(wb: ExcelJS.Workbook) {
  const ws = wb.addWorksheet('Instruções');
  ws.columns = [
    { header: 'Aba', key: 'sheet', width: 16 },
    { header: 'Coluna', key: 'col', width: 30 },
    { header: 'Campo técnico', key: 'field', width: 22 },
    { header: 'Tipo', key: 'type', width: 12 },
    { header: 'Obrigatório', key: 'req', width: 12 },
    { header: 'Valores aceitos / regra', key: 'rule', width: 70 },
  ];
  ws.addRow({ sheet: 'GERAL', rule: 'Código em branco = novo registro. Código preenchido = atualiza o registro existente com esse código.' });
  ws.addRow({ sheet: 'GERAL', rule: 'Relacionamentos são feitos por códigos estáveis (PRJ-, EAP-, MAR-, ACT-...) e e-mails de usuários cadastrados.' });
  ws.addRow({ sheet: 'GERAL', rule: 'Colunas com cabeçalho cinza são somente exportação (calculadas) e são ignoradas na importação.' });
  ws.addRow({ sheet: 'GERAL', rule: 'Datas: dd/mm/aaaa ou aaaa-mm-dd. Números: use vírgula ou ponto decimal, sem separador de milhar.' });
  ws.addRow({ sheet: 'GERAL', rule: 'Abas Resumo, Indicadores, Histórico e Instruções são somente leitura e não são importadas.' });
  for (const s of SHEETS) {
    for (const c of s.columns) {
      const rule =
        c.type === 'enum'
          ? (c.options ?? []).map((o) => o.label).join(' | ')
          : [
              c.min !== undefined ? `mín ${c.min}` : '',
              c.max !== undefined ? `máx ${c.max}` : '',
              c.exportOnly ? 'somente exportação' : '',
              c.help ?? '',
            ]
              .filter(Boolean)
              .join('; ');
      ws.addRow({ sheet: s.sheet, col: c.header, field: c.field, type: c.type, req: c.required ? 'Sim' : '', rule });
    }
  }
  styleHeader(ws);
}

export interface ExportMeta {
  generatedBy: string;
  filters: string;
  today?: number;
}

function addSummary(wb: ExcelJS.Workbook, s: PortfolioSummary, meta: ExportMeta) {
  const ws = wb.addWorksheet('Resumo');
  ws.columns = [
    { header: 'Indicador', key: 'k', width: 44 },
    { header: 'Valor', key: 'v', width: 26 },
  ];
  const pct = (x: number | null) => (x === null ? 'Dados insuficientes' : `${(x * 100).toFixed(1)}%`);
  const rows: [string, string | number | null][] = [
    ['Gerado em', new Date().toISOString()],
    ['Gerado por', meta.generatedBy],
    ['Filtros aplicados', meta.filters || 'Nenhum'],
    ['Projetos ativos', s.projectsActive],
    ['Projetos atrasados', s.projectsDelayed],
    ['Projetos encerrados (concluídos/cancelados)', s.projectsClosed],
    ['Avanço físico médio (projetos ativos)', pct(s.avgPhysical)],
    ['Avanço planejado médio (projetos ativos)', pct(s.avgPlanned)],
    ['Ações abertas', s.actionsOpen],
    ['Ações atrasadas', s.actionsOverdue],
    ['Ações bloqueadas', s.actionsBlocked],
    ['Ações críticas abertas', s.actionsCritical],
    ['Ações concluídas', s.actionsDone],
    ['Riscos abertos', s.risksOpen],
    ['Riscos altos (P×I ≥ 15)', s.risksHigh],
    ['Problemas abertos', s.issuesOpen],
    ['Decisões pendentes', s.decisionsPending],
    ['Marcos nos próximos 30 dias', s.milestonesUpcoming],
    ['Marcos vencidos não atingidos', s.milestonesLate],
    ['Orçamento planejado total (R$)', s.budgetPlanned],
    ['Custo realizado total (R$)', s.budgetActual],
  ];
  rows.forEach(([k, v]) => ws.addRow({ k, v: v ?? 'Não informado' }));
  styleHeader(ws);
  ws.getColumn(1).font = { bold: true };
}

function addIndicators(wb: ExcelJS.Workbook, kpis: ProjectKpi[]) {
  const ws = wb.addWorksheet('Indicadores');
  ws.columns = [
    { header: 'Código', key: 'code', width: 12 },
    { header: 'Projeto', key: 'name', width: 36 },
    { header: 'Status', key: 'status', width: 14 },
    { header: 'Avanço físico (%)', key: 'phys', width: 16 },
    { header: 'Fonte do avanço', key: 'src', width: 14 },
    { header: 'Avanço planejado (%)', key: 'plan', width: 18 },
    { header: 'SPI', key: 'spi', width: 10 },
    { header: 'CPI', key: 'cpi', width: 10 },
    { header: 'Desvio de prazo (dias)', key: 'slip', width: 18 },
    { header: 'Ações abertas', key: 'open', width: 14 },
    { header: 'Ações atrasadas', key: 'overdue', width: 14 },
    { header: 'Atrasado?', key: 'delayed', width: 11 },
    { header: 'Observação', key: 'obs', width: 50 },
  ];
  const r1 = (x: number | null) => (x === null ? null : Math.round(x * 1000) / 10);
  for (const k of kpis) {
    ws.addRow({
      code: k.project.code,
      name: k.project.name,
      status: k.project.status,
      phys: r1(k.physical.value),
      src: k.physical.source ?? '—',
      plan: r1(k.planned.value),
      spi: k.evm.spi === null ? null : Math.round(k.evm.spi * 100) / 100,
      cpi: k.evm.cpi === null ? null : Math.round(k.evm.cpi * 100) / 100,
      slip: k.slipDays,
      open: k.openActions,
      overdue: k.overdueActions,
      delayed: k.delayed ? 'Sim' : 'Não',
      obs: [k.evm.reasonSpi && `SPI: ${k.evm.reasonSpi}`, k.evm.reasonCpi && `CPI: ${k.evm.reasonCpi}`].filter(Boolean).join(' | '),
    });
  }
  styleHeader(ws);
}

function addHistory(wb: ExcelJS.Workbook, audit: AuditEntry[], projects: Project[]) {
  const pcode = new Map(projects.map((p) => [p.id, p.code]));
  const ws = wb.addWorksheet('Histórico');
  ws.columns = [
    { header: 'Data/hora (UTC)', key: 'at', width: 22 },
    { header: 'Usuário', key: 'who', width: 28 },
    { header: 'Projeto', key: 'proj', width: 12 },
    { header: 'Tabela', key: 'table', width: 18 },
    { header: 'Registro', key: 'code', width: 14 },
    { header: 'Operação', key: 'op', width: 10 },
    { header: 'Campo', key: 'field', width: 18 },
    { header: 'Valor anterior', key: 'old', width: 40 },
    { header: 'Valor novo', key: 'new', width: 40 },
  ];
  const fmt = (v: unknown) => (v === null || v === undefined ? '' : typeof v === 'string' ? v : JSON.stringify(v)).slice(0, 32000);
  for (const a of audit) {
    ws.addRow({
      at: a.occurred_at,
      who: a.actor_email ?? a.actor_id ?? 'sistema',
      proj: a.project_id ? (pcode.get(a.project_id) ?? a.project_id) : '',
      table: a.table_name,
      code: a.record_code ?? a.record_id ?? '',
      op: a.operation,
      field: a.field ?? '',
      old: fmt(a.old_value),
      new: fmt(a.new_value),
    });
  }
  styleHeader(ws);
}

const EXPORT_ORDER: EntityKey[] = [
  'projects',
  'actions',
  'wbs_items',
  'milestones',
  'risks',
  'issues',
  'stakeholders',
  'decisions',
  'change_requests',
  'lessons_learned',
];

export function buildWorkbook(d: Dataset, meta: ExportMeta): ExcelJS.Workbook {
  const today = meta.today ?? todayUTC();
  const wb = new ExcelJS.Workbook();
  wb.creator = 'Gestão Executiva de Projetos';
  wb.created = new Date();
  const kpis = projectKpis(d, today);
  addSummary(wb, portfolioSummary(d, kpis, today), meta);
  const rows = toSheetRows(d);
  for (const e of EXPORT_ORDER) addDataSheet(wb, e, rows[e], false);
  addIndicators(wb, kpis);
  addHistory(wb, d.audit, d.projects);
  addInstructions(wb);
  return wb;
}

export function buildTemplate(): ExcelJS.Workbook {
  const wb = new ExcelJS.Workbook();
  wb.creator = 'Gestão Executiva de Projetos';
  addInstructions(wb);
  for (const e of EXPORT_ORDER) addDataSheet(wb, e, [], true);
  wb.getWorksheet('Instruções')!.getRow(1).getCell(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: TEAL } };
  return wb;
}

export async function workbookToBuffer(wb: ExcelJS.Workbook): Promise<ArrayBuffer> {
  const buf = await wb.xlsx.writeBuffer();
  return buf as ArrayBuffer;
}

function csvEscape(s: string): string {
  return /[";\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

/** CSV (separador ";" + BOM UTF-8, compatível com Excel pt-BR). */
export function toCsv(entity: EntityKey, rows: SheetRow[]): string {
  const def = SHEET_BY_ENTITY[entity];
  const head = def.columns.map((c) => csvEscape(c.header)).join(';');
  const lines = rows.map((r) =>
    def.columns
      .map((c) => {
        const v = r[c.field];
        if (v === null || v === undefined) return '';
        if (c.type === 'number' || c.type === 'int') return String(v).replace('.', ',');
        if (c.type === 'bool') return v ? 'Sim' : 'Não';
        if (c.type === 'enum') return csvEscape(labelOf(c.options ?? [], String(v)));
        if (c.type === 'date') return String(v).slice(0, 10);
        return csvEscape(String(v));
      })
      .join(';'),
  );
  return '\uFEFF' + [head, ...lines].join('\r\n') + '\r\n';
}
