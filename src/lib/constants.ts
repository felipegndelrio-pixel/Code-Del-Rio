import type { MemberRole } from './types';

export type Option = { value: string; label: string };

const opts = (pairs: [string, string][]): Option[] => pairs.map(([value, label]) => ({ value, label }));

export const PROJECT_STATUS = opts([
  ['planejado', 'Planejado'],
  ['em_andamento', 'Em andamento'],
  ['suspenso', 'Suspenso'],
  ['concluido', 'Concluído'],
  ['cancelado', 'Cancelado'],
]);
export const PRIORITY = opts([
  ['baixa', 'Baixa'],
  ['media', 'Média'],
  ['alta', 'Alta'],
  ['critica', 'Crítica'],
]);
export const CRITICALITY = opts([
  ['baixa', 'Baixa'],
  ['media', 'Média'],
  ['alta', 'Alta'],
]);
export const ACTION_STATUS = opts([
  ['nao_iniciada', 'Não iniciada'],
  ['em_andamento', 'Em andamento'],
  ['bloqueada', 'Bloqueada'],
  ['concluida', 'Concluída'],
  ['cancelada', 'Cancelada'],
]);
export const MILESTONE_STATUS = opts([
  ['pendente', 'Pendente'],
  ['atingido', 'Atingido'],
  ['cancelado', 'Cancelado'],
]);
export const RISK_STATUS = opts([
  ['aberto', 'Aberto'],
  ['em_tratamento', 'Em tratamento'],
  ['fechado', 'Fechado'],
  ['materializado', 'Materializado'],
]);
export const RISK_STRATEGY = opts([
  ['evitar', 'Evitar'],
  ['mitigar', 'Mitigar'],
  ['transferir', 'Transferir'],
  ['aceitar', 'Aceitar'],
  ['escalar', 'Escalar'],
  ['explorar', 'Explorar (oportunidade)'],
  ['melhorar', 'Melhorar (oportunidade)'],
  ['compartilhar', 'Compartilhar (oportunidade)'],
]);
export const SCALE_1_5 = opts([
  ['1', '1 — Muito baixa'],
  ['2', '2 — Baixa'],
  ['3', '3 — Média'],
  ['4', '4 — Alta'],
  ['5', '5 — Muito alta'],
]);
export const ISSUE_STATUS = opts([
  ['aberto', 'Aberto'],
  ['em_analise', 'Em análise'],
  ['resolvido', 'Resolvido'],
  ['fechado', 'Fechado'],
]);
export const CHANGE_STATUS = opts([
  ['submetida', 'Submetida'],
  ['em_analise', 'Em análise'],
  ['aprovada', 'Aprovada'],
  ['rejeitada', 'Rejeitada'],
  ['implementada', 'Implementada'],
  ['cancelada', 'Cancelada'],
]);
export const DECISION_STATUS = opts([
  ['pendente', 'Pendente'],
  ['aprovada', 'Aprovada'],
  ['rejeitada', 'Rejeitada'],
  ['adiada', 'Adiada'],
]);
export const LEVEL = opts([
  ['baixa', 'Baixa'],
  ['media', 'Média'],
  ['alta', 'Alta'],
]);
export const ENGAGEMENT = opts([
  ['desconhece', 'Desconhece'],
  ['resistente', 'Resistente'],
  ['neutro', 'Neutro'],
  ['apoiador', 'Apoiador'],
  ['lider', 'Líder'],
]);
export const HEALTH = opts([
  ['verde', 'Verde'],
  ['amarelo', 'Amarelo'],
  ['vermelho', 'Vermelho'],
]);
export const MEMBER_ROLES: Option[] = opts([
  ['sponsor', 'Sponsor / gestor autorizado'],
  ['gerente', 'Gerente de projeto'],
  ['responsavel', 'Responsável por ações'],
  ['observador', 'Colaborador / observador'],
]);

export const ROLE_LABEL: Record<MemberRole, string> = {
  sponsor: 'Sponsor',
  gerente: 'Gerente',
  responsavel: 'Responsável',
  observador: 'Observador',
};

export function labelOf(options: Option[], value: string | null | undefined): string {
  if (value === null || value === undefined || value === '') return '—';
  return options.find((o) => o.value === String(value))?.label ?? String(value);
}

export const ALL_LABELS: Record<string, Option[]> = {
  project_status: PROJECT_STATUS,
  action_status: ACTION_STATUS,
  priority: PRIORITY,
};

export const CLOSED_PROJECT = new Set(['concluido', 'cancelado']);
export const CLOSED_ACTION = new Set(['concluida', 'cancelada']);
