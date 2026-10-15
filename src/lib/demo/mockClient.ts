// =====================================================================
// MODO DEMONSTRAÇÃO (VITE_DEMO=true)
// Cliente local que imita a API do Supabase usada pela aplicação, com as
// mesmas regras de negócio do banco (códigos, autoria da conclusão, decisões,
// snapshot de métricas, auditoria, importação tudo-ou-nada).
// Os dados ficam SOMENTE neste aparelho (localStorage). Não há servidor,
// autenticação real nem isolamento entre usuários: serve para conhecer o
// produto, não para uso em produção.
// =====================================================================
import { seedDemo } from './seed';

type Row = Record<string, any>;
export interface DemoDb {
  version: 1;
  tables: Record<string, Row[]>;
  seq: Record<string, number>;
  files: Record<string, { mime: string; b64: string }>;
  loggedIn: boolean;
}

const KEY = 'gestao-demo-v1';
export const DEMO_USER = { id: '00000000-0000-4000-8000-000000000001', email: 'voce@demo.local' };
const TABLES = [
  'profiles', 'projects', 'project_members', 'wbs_items', 'wbs_dependencies', 'milestones', 'actions',
  'action_dependencies', 'action_comments', 'risks', 'issues', 'change_requests', 'decisions', 'stakeholders',
  'raci_assignments', 'status_reports', 'lessons_learned', 'documents', 'audit_log',
];
const NO_ID = new Set(['project_members', 'action_dependencies', 'wbs_dependencies']);
const PREFIX: Record<string, string> = {
  projects: 'PRJ', actions: 'ACT', wbs_items: 'EAP', milestones: 'MAR', risks: 'RSK', issues: 'PRB',
  change_requests: 'MUD', decisions: 'DEC', stakeholders: 'STK', status_reports: 'REL', lessons_learned: 'LIC',
};
const AUDITED = new Set(TABLES.filter((t) => t !== 'audit_log' && t !== 'profiles'));

class DemoError extends Error {
  code: string;
  constructor(code: string, message: string) {
    super(message);
    this.code = code;
  }
}

const today = () => new Date().toISOString().slice(0, 10);
const now = () => new Date().toISOString();
const uuid = () =>
  typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
        const r = (Math.random() * 16) | 0;
        return (c === 'x' ? r : (r & 0x3) | 0x8).toString(16);
      });
const clone = <T>(x: T): T => JSON.parse(JSON.stringify(x));

// ---------------------------------------------------------------------
// Persistência
// ---------------------------------------------------------------------
function emptyDb(): DemoDb {
  return { version: 1, tables: Object.fromEntries(TABLES.map((t) => [t, []])), seq: {}, files: {}, loggedIn: true };
}

let db: DemoDb;
function save() {
  try {
    localStorage.setItem(KEY, JSON.stringify(db));
  } catch {
    /* armazenamento indisponível (aba privada / iframe): segue em memória */
  }
}
function load(): DemoDb {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as DemoDb;
      if (parsed.version === 1) return parsed;
    }
  } catch {
    /* ignora e recria */
  }
  db = emptyDb();
  try {
    seedDemo(internal);
  } catch (e) {
    console.error('Falha ao gerar dados de exemplo', e);
  }
  return db;
}

export function resetDemo() {
  try {
    localStorage.removeItem(KEY);
  } catch {
    /* noop */
  }
  db = emptyDb();
  seedDemo(internal);
  save();
}

// ---------------------------------------------------------------------
// Regras de negócio (espelham os gatilhos do PostgreSQL)
// ---------------------------------------------------------------------
const DEFAULTS: Record<string, () => Row> = {
  projects: () => ({ status: 'planejado', priority: 'media', created_by: DEMO_USER.id }),
  wbs_items: () => ({ progress: 0, weight: 1, is_deliverable: false, sort_order: 0, parent_id: null }),
  milestones: () => ({ status: 'pendente' }),
  actions: () => ({ status: 'nao_iniciada', priority: 'media', criticality: 'media', progress: 0, created_by: DEMO_USER.id }),
  risks: () => ({ status: 'aberto' }),
  issues: () => ({ severity: 'media', status: 'aberto', opened_on: today(), created_by: DEMO_USER.id }),
  change_requests: () => ({ status: 'submetida' }),
  decisions: () => ({ status: 'pendente' }),
  status_reports: () => ({ report_date: today(), metrics: {} }),
  lessons_learned: () => ({ created_by: DEMO_USER.id }),
  documents: () => ({ entity_type: 'project' }),
  wbs_dependencies: () => ({ lag_days: 0 }),
};

function req(row: Row, field: string, label: string) {
  if (row[field] === undefined || row[field] === null || String(row[field]).trim() === '') throw new DemoError('23502', `${label} é obrigatório`);
}
function dateOrder(row: Row, a: string, b: string) {
  if (row[a] && row[b] && row[b] < row[a]) throw new DemoError('23514', `Data final anterior à inicial (${b})`);
}
function range(row: Row, f: string, min: number, max: number) {
  if (row[f] !== null && row[f] !== undefined && (Number(row[f]) < min || Number(row[f]) > max)) throw new DemoError('23514', `${f} fora do intervalo ${min}–${max}`);
}

function constraints(table: string, r: Row) {
  switch (table) {
    case 'projects':
      req(r, 'name', 'Nome');
      dateOrder(r, 'planned_start', 'planned_end');
      dateOrder(r, 'actual_start', 'actual_end');
      range(r, 'progress_manual', 0, 100);
      break;
    case 'actions':
      req(r, 'title', 'Título');
      dateOrder(r, 'start_date', 'due_date');
      range(r, 'progress', 0, 100);
      if (r.status === 'bloqueada' && !String(r.blockers ?? '').trim()) throw new DemoError('23514', 'Ação bloqueada exige descrição do bloqueio');
      break;
    case 'wbs_items':
      req(r, 'name', 'Nome');
      dateOrder(r, 'planned_start', 'planned_end');
      range(r, 'progress', 0, 100);
      break;
    case 'milestones':
      req(r, 'name', 'Nome');
      req(r, 'planned_date', 'Data planejada');
      if (r.status === 'atingido' && !r.actual_date) throw new DemoError('23514', 'Marco atingido exige data real');
      break;
    case 'risks':
      req(r, 'title', 'Risco');
      range(r, 'probability', 1, 5);
      range(r, 'impact', 1, 5);
      req(r, 'probability', 'Probabilidade');
      req(r, 'impact', 'Impacto');
      break;
    case 'issues':
    case 'decisions':
    case 'change_requests':
      req(r, 'title', 'Título');
      break;
    case 'stakeholders':
      req(r, 'name', 'Nome');
      break;
    case 'status_reports':
      req(r, 'summary', 'Mensagem-chave');
      req(r, 'overall_health', 'Saúde geral');
      break;
    case 'lessons_learned':
      req(r, 'situation', 'Situação');
      break;
    case 'raci_assignments': {
      if (r.raci === 'A' && db.tables.raci_assignments.some((x) => x.id !== r.id && x.project_id === r.project_id && x.activity === r.activity && x.raci === 'A'))
        throw new DemoError('23505', 'Cada atividade aceita apenas um "A"');
      if (db.tables.raci_assignments.some((x) => x.id !== r.id && x.project_id === r.project_id && x.activity === r.activity && x.stakeholder_id === r.stakeholder_id))
        throw new DemoError('23505', 'Registro duplicado');
      break;
    }
    case 'documents':
      if (!/\.(pdf|png|jpe?g|webp|xlsx|xls|csv|docx|pptx|txt)$/i.test(r.file_name ?? '')) throw new DemoError('23514', 'Extensão não permitida');
      if (Number(r.size_bytes) > 20971520) throw new DemoError('23514', 'Arquivo excede 20 MB');
      break;
  }
}

function nextCode(table: string): string {
  const prefix = PREFIX[table];
  for (;;) {
    db.seq[table] = (db.seq[table] ?? 0) + 1;
    const code = `${prefix}-${String(db.seq[table]).padStart(5, '0')}`;
    if (!db.tables[table].some((r) => r.code === code)) return code;
  }
}

export function projectMetrics(projectId: string): Row {
  const acts = db.tables.actions.filter((a) => a.project_id === projectId);
  const active = acts.filter((a) => a.status !== 'cancelada');
  const open = (s: string) => s === 'aberto' || s === 'em_tratamento';
  const risks = db.tables.risks.filter((r) => r.project_id === projectId && open(r.status));
  return {
    acoes_total: active.length,
    acoes_concluidas: acts.filter((a) => a.status === 'concluida').length,
    acoes_atrasadas: acts.filter((a) => !['concluida', 'cancelada'].includes(a.status) && a.due_date && a.due_date < today()).length,
    acoes_bloqueadas: acts.filter((a) => a.status === 'bloqueada').length,
    avanco_medio_acoes: active.length ? Math.round((active.reduce((s, a) => s + Number(a.progress), 0) / active.length) * 10) / 10 : 0,
    riscos_abertos: risks.length,
    riscos_altos: risks.filter((r) => r.probability * r.impact >= 15).length,
    problemas_abertos: db.tables.issues.filter((i) => i.project_id === projectId && ['aberto', 'em_analise'].includes(i.status)).length,
    decisoes_pendentes: db.tables.decisions.filter((d) => d.project_id === projectId && d.status === 'pendente').length,
    gerado_em: now(),
  };
}

function rules(table: string, r: Row, old: Row | null) {
  const uid = DEMO_USER.id;
  if (table === 'projects') {
    if (old) r.created_by = old.created_by;
    const closed = (s: string) => s === 'concluido' || s === 'cancelado';
    if (closed(r.status) && (!old || !closed(old.status))) {
      r.closed_at = now();
      r.closed_by = uid;
      if (r.status === 'concluido' && !r.actual_end) r.actual_end = today();
    } else if (!closed(r.status) && old && closed(old.status)) {
      r.closed_at = null;
      r.closed_by = null;
    }
    if (r.status === 'em_andamento' && !r.actual_start) r.actual_start = today();
  }
  if (table === 'actions') {
    if (r.status === 'concluida' && (!old || old.status !== 'concluida')) {
      r.completed_at = now();
      r.completed_by = uid;
      r.progress = 100;
    } else if (r.status !== 'concluida') {
      r.completed_at = null;
      r.completed_by = null;
      if (old?.status === 'concluida' && r.progress === 100) r.progress = 90;
    } else if (old) {
      r.completed_at = old.completed_at;
      r.completed_by = old.completed_by;
      r.progress = 100;
    }
    if (r.status === 'em_andamento' && !r.actual_start) r.actual_start = today();
  }
  if (table === 'risks') r.score = Number(r.probability) * Number(r.impact);
  if (table === 'decisions' || table === 'change_requests') {
    const final = table === 'decisions' ? ['aprovada', 'rejeitada'] : ['aprovada', 'rejeitada', 'implementada'];
    if (final.includes(r.status) && (!old || !final.includes(old.status))) {
      r.decided_by = uid;
      r.decided_at = now();
    } else if (!final.includes(r.status)) {
      r.decided_by = null;
      r.decided_at = null;
    } else if (old) {
      r.decided_by = old.decided_by;
      r.decided_at = old.decided_at;
    }
  }
  if (table === 'status_reports') {
    if (!old) {
      r.metrics = projectMetrics(r.project_id);
      r.author_id = uid;
    } else {
      r.metrics = old.metrics;
      r.author_id = old.author_id;
    }
  }
  if (table === 'action_comments' && !old) r.author_id = uid;
  if (table === 'documents' && !old) r.uploaded_by = uid;
}

function audit(table: string, op: 'INSERT' | 'UPDATE' | 'DELETE', oldR: Row | null, newR: Row | null) {
  if (!AUDITED.has(table)) return;
  const row = (newR ?? oldR)!;
  const projectId = table === 'projects' ? row.id : row.project_id;
  const recordId = table === 'project_members' ? row.user_id : table === 'action_dependencies' ? row.action_id : table === 'wbs_dependencies' ? row.successor_id : row.id;
  const base = { occurred_at: now(), actor_id: DEMO_USER.id, actor_email: DEMO_USER.email, project_id: projectId ?? null, table_name: table, record_id: recordId ?? null, record_code: row.code ?? null };
  const push = (extra: Row) => {
    db.seq.audit_log = (db.seq.audit_log ?? 0) + 1;
    db.tables.audit_log.push({ id: db.seq.audit_log, ...base, ...extra });
  };
  if (op === 'INSERT') push({ operation: op, field: null, old_value: null, new_value: clone(newR) });
  else if (op === 'DELETE') push({ operation: op, field: null, old_value: clone(oldR), new_value: null });
  else
    for (const k of Object.keys(newR!)) {
      if (['updated_at', 'updated_by', 'created_at'].includes(k)) continue;
      if (JSON.stringify(newR![k] ?? null) !== JSON.stringify(oldR![k] ?? null)) push({ operation: op, field: k, old_value: oldR![k] ?? null, new_value: newR![k] ?? null });
    }
}

function ensureMember(projectId: string, userId: string, role: string) {
  const m = db.tables.project_members.find((x) => x.project_id === projectId && x.user_id === userId);
  if (!m) dbInsert('project_members', { project_id: projectId, user_id: userId, role });
  else if (['responsavel', 'observador'].includes(m.role) && m.role !== role) dbUpdate('project_members', m, { role });
}

function dbInsert(table: string, input: Row): Row {
  const r: Row = { ...(DEFAULTS[table]?.() ?? {}), ...clone(input) };
  if (!NO_ID.has(table) && !r.id) r.id = uuid();
  if (table !== 'audit_log') {
    r.created_at = r.created_at ?? now();
    if (!NO_ID.has(table)) r.updated_at = now();
  }
  if (PREFIX[table]) r.code = r.code && String(r.code).trim() ? String(r.code).trim().toUpperCase() : nextCode(table);
  if (PREFIX[table] && db.tables[table].some((x) => x.code === r.code)) throw new DemoError('23505', `Código ${r.code} já existe`);
  if (!NO_ID.has(table) && db.tables[table].some((x) => x.id === r.id)) throw new DemoError('23505', 'Registro duplicado');
  if (table === 'project_members' && db.tables.project_members.some((x) => x.project_id === r.project_id && x.user_id === r.user_id)) throw new DemoError('23505', 'Usuário já é membro');
  if (table === 'action_dependencies' && db.tables.action_dependencies.some((x) => x.action_id === r.action_id && x.depends_on_id === r.depends_on_id)) throw new DemoError('23505', 'Dependência já existe');
  if (table === 'wbs_dependencies' && db.tables.wbs_dependencies.some((x) => x.predecessor_id === r.predecessor_id && x.successor_id === r.successor_id)) throw new DemoError('23505', 'Dependência já existe');
  rules(table, r, null);
  constraints(table, r);
  db.tables[table].push(r);
  audit(table, 'INSERT', null, r);
  if (table === 'projects') {
    ensureMember(r.id, DEMO_USER.id, 'gerente');
    if (r.manager_id) ensureMember(r.id, r.manager_id, 'gerente');
    if (r.sponsor_id) ensureMember(r.id, r.sponsor_id, 'sponsor');
  }
  return r;
}

function dbUpdate(table: string, row: Row, patch: Row): Row {
  const old = clone(row);
  const next: Row = { ...row, ...clone(patch), id: row.id, code: row.code };
  if (table === 'audit_log') throw new DemoError('42501', 'A trilha de auditoria é imutável');
  if (!NO_ID.has(table)) next.updated_at = now();
  rules(table, next, old);
  constraints(table, next);
  Object.assign(row, next);
  audit(table, 'UPDATE', old, row);
  if (table === 'projects') {
    if (row.manager_id && row.manager_id !== old.manager_id) ensureMember(row.id, row.manager_id, 'gerente');
    if (row.sponsor_id && row.sponsor_id !== old.sponsor_id) ensureMember(row.id, row.sponsor_id, 'sponsor');
  }
  return row;
}

const CHILDREN: Record<string, [string, string][]> = {
  projects: TABLES.filter((t) => !['profiles', 'projects', 'audit_log'].includes(t)).map((t) => [t, 'project_id']),
  actions: [['action_dependencies', 'action_id'], ['action_dependencies', 'depends_on_id'], ['action_comments', 'action_id']],
  wbs_items: [['wbs_dependencies', 'predecessor_id'], ['wbs_dependencies', 'successor_id']],
  stakeholders: [['raci_assignments', 'stakeholder_id']],
};
const SET_NULL: Record<string, [string, string][]> = {
  wbs_items: [['wbs_items', 'parent_id'], ['actions', 'wbs_item_id'], ['milestones', 'wbs_item_id']],
  milestones: [['actions', 'milestone_id']],
};

function dbDelete(table: string, row: Row) {
  if (table === 'audit_log') throw new DemoError('42501', 'A trilha de auditoria é imutável');
  if (table === 'project_members' && row.role === 'gerente' && !db.tables.project_members.some((m) => m.project_id === row.project_id && m.role === 'gerente' && m.user_id !== row.user_id))
    throw new DemoError('23514', 'O projeto precisa manter ao menos um gerente');
  for (const [t, col] of SET_NULL[table] ?? []) for (const c of db.tables[t]) if (c[col] === row.id) c[col] = null;
  for (const [t, col] of CHILDREN[table] ?? []) for (const c of db.tables[t].filter((x) => x[col] === row.id)) removeRow(t, c);
  removeRow(table, row);
}
function removeRow(table: string, row: Row) {
  const i = db.tables[table].indexOf(row);
  if (i >= 0) {
    db.tables[table].splice(i, 1);
    audit(table, 'DELETE', row, null);
  }
}

export const internal = {
  insert: dbInsert,
  update: dbUpdate,
  remove: dbDelete,
  rows: (t: string) => db.tables[t],
  setDb: (d: DemoDb) => (db = d),
  getDb: () => db,
};

// ---------------------------------------------------------------------
// Query builder compatível com o subconjunto usado do supabase-js
// ---------------------------------------------------------------------
type Result = { data: any; error: { code?: string; message: string } | null };

class Query implements PromiseLike<Result> {
  private op: 'select' | 'insert' | 'update' | 'delete' = 'select';
  private filters: ((r: Row) => boolean)[] = [];
  private orderBy: { col: string; asc: boolean } | null = null;
  private rangeArgs: [number, number] | null = null;
  private payload: any = null;
  private returning = false;
  private mode: '' | 'single' | 'maybe' = '';
  constructor(private table: string) {}
  select() {
    if (this.op !== 'select') this.returning = true;
    return this;
  }
  insert(rows: any) {
    this.op = 'insert';
    this.payload = rows;
    return this;
  }
  update(patch: any) {
    this.op = 'update';
    this.payload = patch;
    return this;
  }
  delete() {
    this.op = 'delete';
    return this;
  }
  eq(col: string, v: any) {
    this.filters.push((r) => String(r[col]) === String(v));
    return this;
  }
  in(col: string, vs: any[]) {
    const set = new Set(vs.map(String));
    this.filters.push((r) => set.has(String(r[col])));
    return this;
  }
  order(col: string, opts?: { ascending?: boolean }) {
    this.orderBy = { col, asc: opts?.ascending ?? true };
    return this;
  }
  range(a: number, b: number) {
    this.rangeArgs = [a, b];
    return this;
  }
  single() {
    this.mode = 'single';
    return this;
  }
  maybeSingle() {
    this.mode = 'maybe';
    return this;
  }
  then<A = Result, B = never>(ok?: ((v: Result) => A | PromiseLike<A>) | null, fail?: ((e: any) => B | PromiseLike<B>) | null): PromiseLike<A | B> {
    return Promise.resolve()
      .then(() => this.exec())
      .then(ok, fail);
  }
  private matches() {
    return db.tables[this.table].filter((r) => this.filters.every((f) => f(r)));
  }
  private exec(): Result {
    if (!db.tables[this.table]) return { data: null, error: { code: '42P01', message: `Tabela ${this.table} inexistente` } };
    const snapshot = clone(db);
    try {
      let data: any;
      if (this.op === 'select') {
        let rows = this.matches();
        if (this.orderBy) {
          const { col, asc } = this.orderBy;
          rows = [...rows].sort((a, b) => {
            const x = a[col] ?? '';
            const y = b[col] ?? '';
            return (x < y ? -1 : x > y ? 1 : 0) * (asc ? 1 : -1);
          });
        }
        if (this.rangeArgs) rows = rows.slice(this.rangeArgs[0], this.rangeArgs[1] + 1);
        data = clone(rows);
      } else if (this.op === 'insert') {
        const list = Array.isArray(this.payload) ? this.payload : [this.payload];
        data = list.map((r: Row) => clone(dbInsert(this.table, r)));
      } else if (this.op === 'update') {
        data = this.matches().map((r) => clone(dbUpdate(this.table, r, this.payload)));
      } else {
        const rows = this.matches();
        data = clone(rows);
        rows.forEach((r) => dbDelete(this.table, r));
      }
      save();
      if (this.op !== 'select' && !this.returning) data = null;
      if (this.mode && Array.isArray(data)) {
        if (data.length === 0) return this.mode === 'maybe' ? { data: null, error: null } : { data: null, error: { code: 'PGRST116', message: 'Registro não encontrado' } };
        data = data[0];
      }
      return { data, error: null };
    } catch (e) {
      db = snapshot; // comando atômico, como no banco
      const err = e as DemoError;
      return { data: null, error: { code: err.code ?? 'P0001', message: err.message } };
    }
  }
}

// ---------------------------------------------------------------------
// RPCs
// ---------------------------------------------------------------------
const IMPORT_COLUMNS: Record<string, string[]> = {
  projects: ['name', 'description', 'objectives', 'justification', 'area', 'stakeholders_summary', 'status', 'priority', 'planned_start', 'planned_end', 'actual_start', 'actual_end', 'budget_planned', 'budget_actual', 'progress_manual', 'closure_notes'],
  wbs_items: ['name', 'description', 'is_deliverable', 'planned_start', 'planned_end', 'actual_start', 'actual_end', 'progress', 'weight', 'planned_cost', 'actual_cost', 'sort_order'],
  milestones: ['name', 'description', 'planned_date', 'forecast_date', 'actual_date', 'status'],
  actions: ['title', 'description', 'objective', 'participants', 'start_date', 'due_date', 'actual_start', 'status', 'priority', 'criticality', 'progress', 'blockers', 'evidence', 'next_step'],
  risks: ['title', 'description', 'category', 'cause', 'effect', 'probability', 'impact', 'response_strategy', 'response_plan', 'contingency_plan', 'trigger_event', 'status', 'review_date'],
  issues: ['title', 'description', 'severity', 'status', 'opened_on', 'due_date', 'resolved_on', 'resolution'],
  decisions: ['title', 'context', 'options', 'decision', 'impact', 'status', 'due_date'],
  change_requests: ['title', 'description', 'justification', 'requested_by_name', 'impact_scope', 'impact_schedule_days', 'impact_cost', 'status', 'decision_notes'],
  stakeholders: ['name', 'organization', 'role_title', 'email', 'influence', 'interest', 'engagement_current', 'engagement_desired', 'strategy'],
  lessons_learned: ['category', 'situation', 'what_worked', 'what_to_improve', 'recommendation'],
};
const IMPORT_ORDER = Object.keys(IMPORT_COLUMNS);

function resolveProject(code: any): string {
  if (!code || !String(code).trim()) throw new DemoError('P0001', 'Código do projeto (project_code) é obrigatório');
  const p = db.tables.projects.find((x) => x.code === String(code).trim().toUpperCase());
  if (!p) throw new DemoError('P0001', `Projeto ${String(code).toUpperCase()} não encontrado ou sem acesso`);
  return p.id;
}
function resolveUser(email: any): string | null {
  if (!email || !String(email).trim()) return null;
  const p = db.tables.profiles.find((x) => x.email.toLowerCase() === String(email).trim().toLowerCase());
  if (!p) throw new DemoError('P0001', `Usuário ${email} não encontrado entre os membros visíveis`);
  return p.id;
}
function resolveCode(table: string, code: any, projectId: string): string | null {
  if (!code || !String(code).trim()) return null;
  const r = db.tables[table].find((x) => x.code === String(code).trim().toUpperCase() && x.project_id === projectId);
  if (!r) throw new DemoError('P0001', `Código ${String(code).toUpperCase()} não encontrado neste projeto`);
  return r.id;
}

function importRow(entity: string, row: Row): 'inserted' | 'updated' | 'unchanged' {
  const data: Row = {};
  for (const k of IMPORT_COLUMNS[entity]) if (k in row) data[k] = typeof row[k] === 'string' && row[k].trim() === '' ? null : row[k];
  let projectId: string | null = null;
  if (entity !== 'projects') {
    projectId = resolveProject(row.project_code);
    data.project_id = projectId;
  }
  if ('owner_email' in row) data.owner_id = resolveUser(row.owner_email);
  if (entity === 'projects' && 'sponsor_email' in row) data.sponsor_id = resolveUser(row.sponsor_email);
  if (entity === 'projects' && 'manager_email' in row) data.manager_id = resolveUser(row.manager_email);
  if ((entity === 'milestones' || entity === 'actions') && 'wbs_code' in row) data.wbs_item_id = resolveCode('wbs_items', row.wbs_code, projectId!);
  if (entity === 'actions' && 'milestone_code' in row) data.milestone_id = resolveCode('milestones', row.milestone_code, projectId!);
  const code = row.code && String(row.code).trim() ? String(row.code).trim().toUpperCase() : null;
  const existing = code ? db.tables[entity].find((x) => x.code === code) : null;
  if (existing) {
    if (entity !== 'projects' && existing.project_id !== projectId) throw new DemoError('P0001', `Código ${code} pertence a outro projeto; mover registros entre projetos não é permitido`);
    const patch: Row = {};
    for (const [k, v] of Object.entries(data)) if (k !== 'project_id' && JSON.stringify(existing[k] ?? null) !== JSON.stringify(v ?? null)) patch[k] = v;
    if (!Object.keys(patch).length) return 'unchanged';
    dbUpdate(entity, existing, patch);
    return 'updated';
  }
  dbInsert(entity, { ...data, ...(code ? { code } : {}) });
  return 'inserted';
}

function importLinks(entity: string, row: Row) {
  if (!row.code || !String(row.code).trim()) return;
  const projectId = resolveProject(row.project_code);
  const id = resolveCode(entity, row.code, projectId)!;
  const codes = (s: any) => (s && String(s).trim() ? String(s).split(',').map((x) => x.trim()).filter(Boolean) : []);
  if (entity === 'actions' && 'depends_on' in row) {
    const want = codes(row.depends_on).map((c) => resolveCode('actions', c, projectId)!);
    const have = db.tables.action_dependencies.filter((d) => d.action_id === id);
    for (const d of have) if (!want.includes(d.depends_on_id)) removeRow('action_dependencies', d);
    for (const w of want) if (!have.some((d) => d.depends_on_id === w)) dbInsert('action_dependencies', { project_id: projectId, action_id: id, depends_on_id: w });
  }
  if (entity === 'wbs_items') {
    const item = db.tables.wbs_items.find((w) => w.id === id)!;
    if ('parent_code' in row) {
      const p = resolveCode('wbs_items', row.parent_code, projectId);
      if (item.parent_id !== p) dbUpdate('wbs_items', item, { parent_id: p });
    }
    if ('predecessors' in row) {
      const want = codes(row.predecessors).map((c) => resolveCode('wbs_items', c, projectId)!);
      const have = db.tables.wbs_dependencies.filter((d) => d.successor_id === id);
      for (const d of have) if (!want.includes(d.predecessor_id)) removeRow('wbs_dependencies', d);
      for (const w of want) if (!have.some((d) => d.predecessor_id === w)) dbInsert('wbs_dependencies', { project_id: projectId, predecessor_id: w, successor_id: id });
    }
  }
}

function importRecords(payload: Row, dryRun: boolean) {
  const total = IMPORT_ORDER.reduce((n, e) => n + (Array.isArray(payload[e]) ? payload[e].length : 0), 0);
  if (total > 5000) throw new DemoError('P0001', `Limite de 5.000 linhas por importação excedido (${total}).`);
  const original = db;
  db = clone(db); // staging
  const errors: Row[] = [];
  const summary: Row = {};
  for (const e of IMPORT_ORDER) {
    if (!Array.isArray(payload[e])) continue;
    summary[e] = { inserted: 0, updated: 0, unchanged: 0 };
    for (const row of payload[e]) {
      const before = clone(db);
      try {
        summary[e][importRow(e, row)]++;
      } catch (err) {
        db = before;
        errors.push({ entity: e, row: row._row ?? null, code: row.code ?? null, message: (err as Error).message });
      }
    }
  }
  for (const e of ['wbs_items', 'actions']) {
    if (!Array.isArray(payload[e])) continue;
    for (const row of payload[e]) {
      const before = clone(db);
      try {
        importLinks(e, row);
      } catch (err) {
        db = before;
        errors.push({ entity: e, row: row._row ?? null, code: row.code ?? null, message: 'Vínculo: ' + (err as Error).message });
      }
    }
  }
  if (dryRun || errors.length) {
    db = original;
    return { committed: false, dry_run: dryRun, errors, summary };
  }
  save();
  return { committed: true, dry_run: false, errors, summary };
}

function addMember(projectId: string, email: string, role: string) {
  const p = db.tables.profiles.find((x) => x.email.toLowerCase() === String(email).trim().toLowerCase());
  if (!p)
    throw new DemoError(
      'P0001',
      `No modo demonstração use um usuário de exemplo: ${db.tables.profiles
        .filter((x) => x.id !== DEMO_USER.id)
        .map((x) => x.email)
        .join(', ')}`,
    );
  const m = db.tables.project_members.find((x) => x.project_id === projectId && x.user_id === p.id);
  if (m) dbUpdate('project_members', m, { role });
  else dbInsert('project_members', { project_id: projectId, user_id: p.id, role });
}

// ---------------------------------------------------------------------
// Auth e Storage
// ---------------------------------------------------------------------
type Listener = (event: string, session: any) => void;
const listeners = new Set<Listener>();
const session = () => (db.loggedIn ? { access_token: 'demo', user: { id: DEMO_USER.id, email: DEMO_USER.email } } : null);
const emit = (ev: string) => listeners.forEach((l) => l(ev, session()));

function toB64(buf: ArrayBuffer): string {
  let s = '';
  const bytes = new Uint8Array(buf);
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(s);
}
function fromB64(b64: string): Uint8Array<ArrayBuffer> {
  const s = atob(b64);
  const out = new Uint8Array(new ArrayBuffer(s.length));
  for (let i = 0; i < s.length; i++) out[i] = s.charCodeAt(i);
  return out;
}

export function createDemoClient(): any {
  db = load();
  save();
  return {
    from: (table: string) => new Query(table),
    rpc: async (fn: string, args: Row) => {
      const snapshot = clone(db);
      try {
        if (fn === 'import_records') return { data: importRecords(args.p_payload ?? {}, args.p_dry_run !== false), error: null };
        if (fn === 'add_project_member') {
          addMember(args.p_project, args.p_email, args.p_role);
          save();
          return { data: null, error: null };
        }
        return { data: null, error: { code: '42883', message: `Função ${fn} indisponível no modo demo` } };
      } catch (e) {
        db = snapshot;
        return { data: null, error: { code: (e as DemoError).code ?? 'P0001', message: (e as Error).message } };
      }
    },
    auth: {
      getSession: async () => ({ data: { session: session() }, error: null }),
      onAuthStateChange: (cb: Listener) => {
        listeners.add(cb);
        return { data: { subscription: { unsubscribe: () => listeners.delete(cb) } } };
      },
      signInWithPassword: async () => {
        db.loggedIn = true;
        save();
        emit('SIGNED_IN');
        return { data: { session: session(), user: session()!.user }, error: null };
      },
      signUp: async () => {
        db.loggedIn = true;
        save();
        emit('SIGNED_IN');
        return { data: { session: session(), user: session()!.user }, error: null };
      },
      signOut: async () => {
        db.loggedIn = false;
        save();
        emit('SIGNED_OUT');
        return { error: null };
      },
      resetPasswordForEmail: async () => ({ data: {}, error: null }),
      updateUser: async () => ({ data: { user: session()?.user }, error: null }),
    },
    storage: {
      from: () => ({
        upload: async (path: string, buf: ArrayBuffer, opts?: { contentType?: string }) => {
          if (buf.byteLength > 2 * 1024 * 1024) return { data: null, error: { message: 'No modo demonstração os anexos são limitados a 2 MB (ficam salvos no aparelho).' } };
          db.files[path] = { mime: opts?.contentType ?? 'application/octet-stream', b64: toB64(buf) };
          save();
          return { data: { path }, error: null };
        },
        createSignedUrl: async (path: string) => {
          const f = db.files[path];
          if (!f) return { data: null, error: { message: 'Arquivo não encontrado' } };
          return { data: { signedUrl: URL.createObjectURL(new Blob([fromB64(f.b64)], { type: f.mime })) }, error: null };
        },
        remove: async (paths: string[]) => {
          paths.forEach((p) => delete db.files[p]);
          save();
          return { data: paths, error: null };
        },
      }),
    },
  };
}

