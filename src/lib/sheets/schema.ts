// Definição única das abas de planilha: usada na exportação, no template
// oficial, no mapeamento de colunas e na validação da importação.
import {
  ACTION_STATUS,
  CHANGE_STATUS,
  CRITICALITY,
  DECISION_STATUS,
  ENGAGEMENT,
  ISSUE_STATUS,
  LEVEL,
  MILESTONE_STATUS,
  PRIORITY,
  PROJECT_STATUS,
  RISK_STATUS,
  RISK_STRATEGY,
  type Option,
} from '../constants';

export type ColType = 'text' | 'longtext' | 'date' | 'datetime' | 'number' | 'int' | 'bool' | 'enum' | 'email' | 'code' | 'codes';

export interface ColDef {
  field: string;
  header: string;
  type: ColType;
  required?: boolean;
  options?: Option[];
  min?: number;
  max?: number;
  /** Somente exportação (calculado/sistema) — ignorado na importação. */
  exportOnly?: boolean;
  help?: string;
}

export type EntityKey =
  | 'projects'
  | 'wbs_items'
  | 'milestones'
  | 'actions'
  | 'risks'
  | 'issues'
  | 'decisions'
  | 'change_requests'
  | 'stakeholders'
  | 'lessons_learned';

export interface SheetDef {
  entity: EntityKey;
  sheet: string;
  description: string;
  columns: ColDef[];
}

const code = (help = 'ID estável. Em branco = criar novo registro; preenchido = atualizar o registro existente.'): ColDef => ({
  field: 'code',
  header: 'Código',
  type: 'code',
  help,
});
const projectCode: ColDef = {
  field: 'project_code',
  header: 'Código do projeto',
  type: 'code',
  required: true,
  help: 'Código PRJ-xxxxx de um projeto existente ou presente na aba Projetos.',
};

export const SHEETS: SheetDef[] = [
  {
    entity: 'projects',
    sheet: 'Projetos',
    description: 'Cadastro de projetos.',
    columns: [
      code(),
      { field: 'name', header: 'Nome', type: 'text', required: true },
      { field: 'description', header: 'Descrição', type: 'longtext' },
      { field: 'objectives', header: 'Objetivos', type: 'longtext' },
      { field: 'justification', header: 'Justificativa', type: 'longtext' },
      { field: 'area', header: 'Área', type: 'text' },
      { field: 'stakeholders_summary', header: 'Stakeholders (resumo)', type: 'longtext' },
      { field: 'sponsor_email', header: 'E-mail do sponsor', type: 'email', help: 'Usuário já cadastrado na plataforma.' },
      { field: 'manager_email', header: 'E-mail do gerente', type: 'email', help: 'Usuário já cadastrado na plataforma.' },
      { field: 'status', header: 'Status', type: 'enum', options: PROJECT_STATUS },
      { field: 'priority', header: 'Prioridade', type: 'enum', options: PRIORITY },
      { field: 'planned_start', header: 'Início planejado', type: 'date' },
      { field: 'planned_end', header: 'Fim planejado', type: 'date' },
      { field: 'actual_start', header: 'Início real', type: 'date' },
      { field: 'actual_end', header: 'Fim real', type: 'date' },
      { field: 'budget_planned', header: 'Orçamento planejado (R$)', type: 'number', min: 0 },
      { field: 'budget_actual', header: 'Custo realizado (R$)', type: 'number', min: 0 },
      { field: 'progress_manual', header: 'Avanço manual (%)', type: 'int', min: 0, max: 100 },
      { field: 'closure_notes', header: 'Notas de encerramento', type: 'longtext' },
    ],
  },
  {
    entity: 'wbs_items',
    sheet: 'Cronograma',
    description: 'EAP, entregas e atividades do cronograma.',
    columns: [
      code(),
      projectCode,
      { field: 'parent_code', header: 'Código do item pai', type: 'code' },
      { field: 'name', header: 'Nome', type: 'text', required: true },
      { field: 'description', header: 'Descrição', type: 'longtext' },
      { field: 'is_deliverable', header: 'É entrega?', type: 'bool' },
      { field: 'owner_email', header: 'E-mail do responsável', type: 'email' },
      { field: 'planned_start', header: 'Início planejado', type: 'date' },
      { field: 'planned_end', header: 'Fim planejado', type: 'date' },
      { field: 'actual_start', header: 'Início real', type: 'date' },
      { field: 'actual_end', header: 'Fim real', type: 'date' },
      { field: 'progress', header: 'Avanço (%)', type: 'int', min: 0, max: 100 },
      { field: 'weight', header: 'Peso', type: 'number', min: 0.01 },
      { field: 'planned_cost', header: 'Custo planejado (R$)', type: 'number', min: 0 },
      { field: 'actual_cost', header: 'Custo real (R$)', type: 'number', min: 0 },
      { field: 'sort_order', header: 'Ordem', type: 'int' },
      { field: 'predecessors', header: 'Predecessoras (códigos)', type: 'codes', help: 'Códigos EAP separados por vírgula (término-início).' },
    ],
  },
  {
    entity: 'milestones',
    sheet: 'Marcos',
    description: 'Marcos do projeto.',
    columns: [
      code(),
      projectCode,
      { field: 'wbs_code', header: 'Código EAP', type: 'code' },
      { field: 'name', header: 'Nome', type: 'text', required: true },
      { field: 'description', header: 'Descrição', type: 'longtext' },
      { field: 'planned_date', header: 'Data planejada', type: 'date', required: true },
      { field: 'forecast_date', header: 'Data prevista', type: 'date' },
      { field: 'actual_date', header: 'Data real', type: 'date' },
      { field: 'status', header: 'Status', type: 'enum', options: MILESTONE_STATUS },
    ],
  },
  {
    entity: 'actions',
    sheet: 'Ações',
    description: 'Plano de ação.',
    columns: [
      code(),
      projectCode,
      { field: 'wbs_code', header: 'Código EAP', type: 'code' },
      { field: 'milestone_code', header: 'Código do marco', type: 'code' },
      { field: 'title', header: 'Ação', type: 'text', required: true },
      { field: 'description', header: 'Descrição', type: 'longtext' },
      { field: 'objective', header: 'Objetivo', type: 'longtext' },
      { field: 'owner_email', header: 'E-mail do responsável', type: 'email', help: 'Precisa ser membro do projeto.' },
      { field: 'participants', header: 'Participantes', type: 'text' },
      { field: 'start_date', header: 'Início', type: 'date' },
      { field: 'due_date', header: 'Prazo', type: 'date' },
      { field: 'actual_start', header: 'Início real', type: 'date' },
      { field: 'status', header: 'Status', type: 'enum', options: ACTION_STATUS },
      { field: 'priority', header: 'Prioridade', type: 'enum', options: PRIORITY },
      { field: 'criticality', header: 'Criticidade', type: 'enum', options: CRITICALITY },
      { field: 'progress', header: 'Avanço (%)', type: 'int', min: 0, max: 100 },
      { field: 'blockers', header: 'Bloqueios', type: 'longtext' },
      { field: 'evidence', header: 'Evidências', type: 'longtext' },
      { field: 'next_step', header: 'Próximo passo', type: 'longtext' },
      { field: 'depends_on', header: 'Depende de (códigos)', type: 'codes', help: 'Códigos ACT separados por vírgula.' },
      { field: 'completed_at', header: 'Concluída em', type: 'datetime', exportOnly: true },
      { field: 'completed_by_email', header: 'Concluída por', type: 'email', exportOnly: true },
    ],
  },
  {
    entity: 'risks',
    sheet: 'Riscos',
    description: 'Registro de riscos e respostas.',
    columns: [
      code(),
      projectCode,
      { field: 'title', header: 'Risco', type: 'text', required: true },
      { field: 'description', header: 'Descrição', type: 'longtext' },
      { field: 'category', header: 'Categoria', type: 'text' },
      { field: 'cause', header: 'Causa', type: 'longtext' },
      { field: 'effect', header: 'Efeito', type: 'longtext' },
      { field: 'probability', header: 'Probabilidade (1-5)', type: 'int', required: true, min: 1, max: 5 },
      { field: 'impact', header: 'Impacto (1-5)', type: 'int', required: true, min: 1, max: 5 },
      { field: 'score', header: 'Severidade (P×I)', type: 'int', exportOnly: true },
      { field: 'owner_email', header: 'E-mail do responsável', type: 'email' },
      { field: 'response_strategy', header: 'Estratégia', type: 'enum', options: RISK_STRATEGY },
      { field: 'response_plan', header: 'Plano de resposta', type: 'longtext' },
      { field: 'contingency_plan', header: 'Plano de contingência', type: 'longtext' },
      { field: 'trigger_event', header: 'Gatilho', type: 'longtext' },
      { field: 'status', header: 'Status', type: 'enum', options: RISK_STATUS },
      { field: 'review_date', header: 'Próxima revisão', type: 'date' },
    ],
  },
  {
    entity: 'issues',
    sheet: 'Problemas',
    description: 'Problemas e impedimentos.',
    columns: [
      code(),
      projectCode,
      { field: 'title', header: 'Problema', type: 'text', required: true },
      { field: 'description', header: 'Descrição', type: 'longtext' },
      { field: 'severity', header: 'Severidade', type: 'enum', options: PRIORITY },
      { field: 'owner_email', header: 'E-mail do responsável', type: 'email' },
      { field: 'status', header: 'Status', type: 'enum', options: ISSUE_STATUS },
      { field: 'opened_on', header: 'Aberto em', type: 'date' },
      { field: 'due_date', header: 'Prazo', type: 'date' },
      { field: 'resolved_on', header: 'Resolvido em', type: 'date' },
      { field: 'resolution', header: 'Resolução', type: 'longtext' },
    ],
  },
  {
    entity: 'decisions',
    sheet: 'Decisões',
    description: 'Decisões e aprovações.',
    columns: [
      code(),
      projectCode,
      { field: 'title', header: 'Decisão', type: 'text', required: true },
      { field: 'context', header: 'Contexto', type: 'longtext' },
      { field: 'options', header: 'Opções', type: 'longtext' },
      { field: 'decision', header: 'Decisão tomada', type: 'longtext' },
      { field: 'impact', header: 'Impacto', type: 'longtext' },
      { field: 'status', header: 'Status', type: 'enum', options: DECISION_STATUS },
      { field: 'owner_email', header: 'E-mail de quem decide', type: 'email' },
      { field: 'due_date', header: 'Prazo', type: 'date' },
      { field: 'decided_by_email', header: 'Decidido por', type: 'email', exportOnly: true },
      { field: 'decided_at', header: 'Decidido em', type: 'datetime', exportOnly: true },
    ],
  },
  {
    entity: 'change_requests',
    sheet: 'Mudanças',
    description: 'Solicitações de mudança.',
    columns: [
      code(),
      projectCode,
      { field: 'title', header: 'Mudança', type: 'text', required: true },
      { field: 'description', header: 'Descrição', type: 'longtext' },
      { field: 'justification', header: 'Justificativa', type: 'longtext' },
      { field: 'requested_by_name', header: 'Solicitante', type: 'text' },
      { field: 'impact_scope', header: 'Impacto em escopo', type: 'longtext' },
      { field: 'impact_schedule_days', header: 'Impacto em prazo (dias)', type: 'int' },
      { field: 'impact_cost', header: 'Impacto em custo (R$)', type: 'number' },
      { field: 'status', header: 'Status', type: 'enum', options: CHANGE_STATUS },
      { field: 'decision_notes', header: 'Parecer', type: 'longtext' },
      { field: 'decided_at', header: 'Decidido em', type: 'datetime', exportOnly: true },
    ],
  },
  {
    entity: 'stakeholders',
    sheet: 'Stakeholders',
    description: 'Partes interessadas.',
    columns: [
      code(),
      projectCode,
      { field: 'name', header: 'Nome', type: 'text', required: true },
      { field: 'organization', header: 'Organização', type: 'text' },
      { field: 'role_title', header: 'Cargo / papel', type: 'text' },
      { field: 'email', header: 'E-mail', type: 'email' },
      { field: 'influence', header: 'Influência', type: 'enum', options: LEVEL },
      { field: 'interest', header: 'Interesse', type: 'enum', options: LEVEL },
      { field: 'engagement_current', header: 'Engajamento atual', type: 'enum', options: ENGAGEMENT },
      { field: 'engagement_desired', header: 'Engajamento desejado', type: 'enum', options: ENGAGEMENT },
      { field: 'strategy', header: 'Estratégia', type: 'longtext' },
    ],
  },
  {
    entity: 'lessons_learned',
    sheet: 'Lições',
    description: 'Lições aprendidas.',
    columns: [
      code(),
      projectCode,
      { field: 'category', header: 'Categoria', type: 'text' },
      { field: 'situation', header: 'Situação', type: 'longtext', required: true },
      { field: 'what_worked', header: 'O que funcionou', type: 'longtext' },
      { field: 'what_to_improve', header: 'O que melhorar', type: 'longtext' },
      { field: 'recommendation', header: 'Recomendação', type: 'longtext' },
    ],
  },
];

export const SHEET_BY_ENTITY = Object.fromEntries(SHEETS.map((s) => [s.entity, s])) as Record<EntityKey, SheetDef>;

/** Prefixos dos códigos gerados automaticamente. */
export const CODE_PREFIX: Record<EntityKey, string> = {
  projects: 'PRJ',
  wbs_items: 'EAP',
  milestones: 'MAR',
  actions: 'ACT',
  risks: 'RSK',
  issues: 'PRB',
  decisions: 'DEC',
  change_requests: 'MUD',
  stakeholders: 'STK',
  lessons_learned: 'LIC',
};

export const READ_ONLY_SHEETS = ['Resumo', 'Indicadores', 'Histórico', 'Instruções'];

export function normalizeKey(s: string): string {
  return s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}
