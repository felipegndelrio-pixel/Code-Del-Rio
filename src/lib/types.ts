export type ProjectStatus = 'planejado' | 'em_andamento' | 'suspenso' | 'concluido' | 'cancelado';
export type Priority = 'baixa' | 'media' | 'alta' | 'critica';
export type MemberRole = 'sponsor' | 'gerente' | 'responsavel' | 'observador';
export type ActionStatus = 'nao_iniciada' | 'em_andamento' | 'bloqueada' | 'concluida' | 'cancelada';
export type Health = 'verde' | 'amarelo' | 'vermelho';

export interface Profile {
  id: string;
  email: string;
  full_name: string | null;
  area: string | null;
  is_platform_admin: boolean;
  can_create_projects: boolean;
  active: boolean;
  created_at: string;
}

export interface Project {
  id: string;
  code: string;
  name: string;
  description: string | null;
  objectives: string | null;
  justification: string | null;
  area: string | null;
  stakeholders_summary: string | null;
  sponsor_id: string | null;
  manager_id: string | null;
  status: ProjectStatus;
  priority: Priority;
  planned_start: string | null;
  planned_end: string | null;
  actual_start: string | null;
  actual_end: string | null;
  budget_planned: number | null;
  budget_actual: number | null;
  progress_manual: number | null;
  closure_notes: string | null;
  closed_at: string | null;
  closed_by: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface ProjectMember {
  project_id: string;
  user_id: string;
  role: MemberRole;
  created_at: string;
}

export interface WbsItem {
  id: string;
  code: string;
  project_id: string;
  parent_id: string | null;
  name: string;
  description: string | null;
  is_deliverable: boolean;
  owner_id: string | null;
  planned_start: string | null;
  planned_end: string | null;
  actual_start: string | null;
  actual_end: string | null;
  progress: number;
  weight: number;
  planned_cost: number | null;
  actual_cost: number | null;
  sort_order: number;
}

export interface WbsDependency {
  project_id: string;
  predecessor_id: string;
  successor_id: string;
  lag_days: number;
}

export interface Milestone {
  id: string;
  code: string;
  project_id: string;
  wbs_item_id: string | null;
  name: string;
  description: string | null;
  planned_date: string;
  forecast_date: string | null;
  actual_date: string | null;
  status: 'pendente' | 'atingido' | 'cancelado';
}

export interface Action {
  id: string;
  code: string;
  project_id: string;
  wbs_item_id: string | null;
  milestone_id: string | null;
  title: string;
  description: string | null;
  objective: string | null;
  owner_id: string | null;
  participants: string | null;
  start_date: string | null;
  due_date: string | null;
  actual_start: string | null;
  status: ActionStatus;
  priority: Priority;
  criticality: 'baixa' | 'media' | 'alta';
  progress: number;
  blockers: string | null;
  evidence: string | null;
  next_step: string | null;
  completed_at: string | null;
  completed_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface ActionDependency {
  project_id: string;
  action_id: string;
  depends_on_id: string;
}

export interface ActionComment {
  id: string;
  project_id: string;
  action_id: string;
  author_id: string | null;
  body: string;
  created_at: string;
}

export interface Risk {
  id: string;
  code: string;
  project_id: string;
  title: string;
  description: string | null;
  category: string | null;
  cause: string | null;
  effect: string | null;
  probability: number;
  impact: number;
  score: number;
  owner_id: string | null;
  response_strategy: string | null;
  response_plan: string | null;
  contingency_plan: string | null;
  trigger_event: string | null;
  status: 'aberto' | 'em_tratamento' | 'fechado' | 'materializado';
  review_date: string | null;
}

export interface Issue {
  id: string;
  code: string;
  project_id: string;
  title: string;
  description: string | null;
  severity: Priority;
  owner_id: string | null;
  status: 'aberto' | 'em_analise' | 'resolvido' | 'fechado';
  opened_on: string;
  due_date: string | null;
  resolved_on: string | null;
  resolution: string | null;
}

export interface ChangeRequest {
  id: string;
  code: string;
  project_id: string;
  title: string;
  description: string | null;
  justification: string | null;
  requested_by_name: string | null;
  impact_scope: string | null;
  impact_schedule_days: number | null;
  impact_cost: number | null;
  status: string;
  decision_notes: string | null;
  decided_by: string | null;
  decided_at: string | null;
}

export interface Decision {
  id: string;
  code: string;
  project_id: string;
  title: string;
  context: string | null;
  options: string | null;
  decision: string | null;
  impact: string | null;
  status: 'pendente' | 'aprovada' | 'rejeitada' | 'adiada';
  owner_id: string | null;
  due_date: string | null;
  decided_by: string | null;
  decided_at: string | null;
}

export interface Stakeholder {
  id: string;
  code: string;
  project_id: string;
  name: string;
  organization: string | null;
  role_title: string | null;
  email: string | null;
  influence: string | null;
  interest: string | null;
  engagement_current: string | null;
  engagement_desired: string | null;
  strategy: string | null;
}

export interface RaciAssignment {
  id: string;
  project_id: string;
  activity: string;
  stakeholder_id: string;
  raci: 'R' | 'A' | 'C' | 'I';
}

export interface StatusReport {
  id: string;
  code: string;
  project_id: string;
  report_date: string;
  period_start: string | null;
  period_end: string | null;
  overall_health: Health;
  schedule_health: Health | null;
  cost_health: Health | null;
  scope_health: Health | null;
  summary: string;
  achievements: string | null;
  next_steps: string | null;
  attention_points: string | null;
  metrics: Record<string, unknown>;
  author_id: string | null;
  created_at: string;
}

export interface Lesson {
  id: string;
  code: string;
  project_id: string;
  category: string | null;
  situation: string;
  what_worked: string | null;
  what_to_improve: string | null;
  recommendation: string | null;
  created_by: string | null;
  created_at: string;
}

export interface DocumentRow {
  id: string;
  project_id: string;
  entity_type: string;
  entity_id: string | null;
  file_name: string;
  storage_path: string;
  mime_type: string;
  size_bytes: number;
  sha256: string | null;
  uploaded_by: string | null;
  created_at: string;
}

export interface AuditEntry {
  id: number;
  occurred_at: string;
  actor_id: string | null;
  actor_email: string | null;
  project_id: string | null;
  table_name: string;
  record_id: string | null;
  record_code: string | null;
  operation: 'INSERT' | 'UPDATE' | 'DELETE';
  field: string | null;
  old_value: unknown;
  new_value: unknown;
}
