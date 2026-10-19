// Modelo de dados do NexoProcess. Tudo aqui é serializável (JSON) e fica
// armazenado localmente no IndexedDB do navegador.

export type DurationUnit = 'min' | 'h' | 'd';
export type ElementType = 'start' | 'task' | 'decision' | 'end';
/** VA = agrega valor · NNVA = necessário sem agregar valor · W = desperdício */
export type LeanClass = 'VA' | 'NNVA' | 'W';
export type Period = 'dia' | 'semana' | 'mes' | 'ano';

export interface Activity {
  id: string;
  /** Etapa macro (grupo) — chave por nome. */
  stage: string;
  name: string;
  type: ElementType;
  order: number;
  /** Tempo de trabalho ativo por execução, na unidade `unit`. */
  duration?: number;
  /** Unidade de duração, espera, mínimo e máximo desta atividade. */
  unit: DurationUnit;
  /** Tempo de espera antes da atividade (fila), na mesma unidade. */
  wait?: number;
  minDuration?: number;
  maxDuration?: number;
  /** Pessoas trabalhando simultaneamente na atividade. */
  people?: number;
  owner?: string;
  /** Sequência informada. Mais de um destino = caminhos em paralelo. */
  next: string[];
  nextYes?: string;
  nextNo?: string;
  lean?: LeanClass;
  /** Atividade marcada como retrabalho (refazer algo). */
  rework?: boolean;
  /** % das execuções que passam por esta atividade (0–100). Ausente = não informado. */
  frequencyPct?: number;
  /** Execuções desta atividade no período do processo (sobrepõe volume × frequência). */
  volume?: number;
  critical?: boolean;
  costPerHour?: number;
  /** Custo variável por execução (ex.: taxa de sistema, frete). */
  variableCost?: number;
  notes?: string;
  /** Conexões geradas pela ordem das linhas (não informadas pelo usuário). */
  flowInferred?: boolean;
  /** Linha de origem na planilha (para mensagens de erro). */
  sourceRow?: number;
}

export interface ProcessModel {
  name: string;
  description?: string;
  area?: string;
  processOwner?: string;
  /** Execuções do processo por período. */
  volume?: number;
  volumePeriod: Period;
  /** Necessário só quando o volume é diário: dias de operação por mês. */
  operatingDaysPerMonth?: number;
  /** Premissa de conversão: 1 dia = N horas de trabalho. */
  hoursPerDay: number;
  defaultCostPerHour?: number;
  /** Custo-hora carregado por função/responsável. */
  costPerHourByRole: Record<string, number>;
  /** Se verdadeiro, o custo variável já inclui mão de obra (evita dupla contagem). */
  variableCostIncludesLabor?: boolean;
  stageOrder: string[];
  activities: Activity[];
}

export type RecStatus = 'pending' | 'accepted' | 'rejected' | 'investigating';
export interface RecDecision {
  status: RecStatus;
  note?: string;
  editedAction?: string;
  decidedAt: string;
}

export type ChangeKind = 'remove' | 'simplify' | 'automate' | 'combine' | 'reorder' | 'reduce_wait' | 'reduce_rework' | 'edit' | 'add' | 'restore';
export interface ChangeEntry {
  id: string;
  at: string;
  kind: ChangeKind;
  activityId?: string;
  activityName?: string;
  summary: string;
  before?: Partial<Activity>;
  after?: Partial<Activity>;
  justification?: string;
  hypothesis?: string;
  validator?: string;
  recId?: string;
  author?: string;
}

export type AssumptionStatus = 'a_validar' | 'validada' | 'rejeitada';
export interface Assumption {
  id: string;
  text: string;
  source?: string;
  status: AssumptionStatus;
}

export interface Scenario {
  id: string;
  name: string;
  createdAt: string;
  updatedAt: string;
  process: ProcessModel;
  changes: ChangeEntry[];
  /** Investimento inicial (único), em R$. */
  investment?: number;
  /** Custo recorrente incremental do cenário futuro, em R$ por mês. */
  recurringCostPerMonth?: number;
  /** Horizonte de análise para ROI, em meses (premissa editável). */
  horizonMonths: number;
  assumptions: Assumption[];
  dependencies?: string;
  risks?: string;
  approvedTarget?: { description: string; value?: number; unit?: string; approvedBy?: string; approvedAt?: string };
}

export type ActionStatus = 'a_fazer' | 'em_andamento' | 'bloqueada' | 'concluida' | 'cancelada';
export type Priority = 'alta' | 'media' | 'baixa';
export interface ActionItem {
  id: string;
  description: string;
  owner?: string;
  due?: string;
  priority: Priority;
  dependencies?: string;
  status: ActionStatus;
  successIndicator?: string;
  expectedValue?: string;
  doneCriteria?: string;
  origin?: { kind: 'recommendation' | 'change' | 'manual'; ref?: string };
  createdAt: string;
}

export type ResultMetric = 'effort_period' | 'cost_period' | 'active_exec' | 'elapsed_exec' | 'volume' | 'custom';
export interface RealizedResult {
  id: string;
  scenarioId?: string;
  /** Período de referência, ex.: 2026-11 */
  period: string;
  metric: ResultMetric;
  label?: string;
  value: number | null;
  unit: string;
  source?: string;
  note?: string;
  /** "sem dados ainda" é diferente de zero. */
  noData?: boolean;
  recordedAt: string;
}

export type RiskStatus = 'aberto' | 'mitigando' | 'fechado';
export interface Risk {
  id: string;
  description: string;
  activityId?: string;
  probability?: number; // 1–5
  impact?: number; // 1–5
  control?: string;
  owner?: string;
  status: RiskStatus;
  // FMEA simplificada (1–10), opcional
  severity?: number;
  occurrence?: number;
  detection?: number;
  failureMode?: string;
  effect?: string;
}

export type RaciRole = 'R' | 'A' | 'C' | 'I';
export interface RaciState {
  roles: string[];
  cells: Record<string, Record<string, RaciRole>>;
  /** Células sugeridas a partir dos dados ainda não confirmadas pelo usuário. */
  suggested: Record<string, Record<string, boolean>>;
}

export type AiStage = 'descoberta' | 'dados' | 'avaliacao' | 'piloto' | 'implantacao' | 'monitoramento' | 'otimizacao' | 'descontinuada';
export interface AutomationAssessment {
  activityId: string;
  /** Respostas 1–5 (ou ausentes) aos critérios. */
  answers: Partial<Record<AutomationCriterion, number>>;
  checklist: Partial<Record<string, boolean>>;
  stage: AiStage;
  notes?: string;
  nextTest?: string;
}
export type AutomationCriterion = 'repetitividade' | 'regras' | 'dados' | 'excecoes' | 'julgamento' | 'risco_erro';

export interface HistoryEntry {
  at: string;
  area: string;
  message: string;
}

export interface Snapshot {
  id: string;
  at: string;
  label: string;
  process: ProcessModel;
}

export type BottleneckCriterion = 'duration' | 'effort' | 'cost' | 'wait' | 'rework';

export interface Workspace {
  id: string;
  schemaVersion: 1;
  isDemo: boolean;
  createdAt: string;
  updatedAt: string;
  source: { kind: 'demo' | 'wizard' | 'import' | 'backup'; fileName?: string; fileHash?: string; importedAt?: string };
  asIs: ProcessModel;
  /** Cópia imutável do AS-IS como foi criado/importado — restaurável. */
  asIsBaseline: ProcessModel;
  validationAcceptedAt?: string;
  visited: Partial<Record<'map' | 'diagnosis' | 'recommendations' | 'compare' | 'report', string>>;
  bottleneck: { criterion: BottleneckCriterion; thresholdPct: number };
  recDecisions: Record<string, RecDecision>;
  scenarios: Scenario[];
  activeScenarioId?: string;
  actions: ActionItem[];
  results: RealizedResult[];
  risks: Risk[];
  raci: RaciState;
  automation: Record<string, AutomationAssessment>;
  history: HistoryEntry[];
  snapshots: Snapshot[];
}

export const LEAN_LABEL: Record<LeanClass | 'U', string> = {
  VA: 'Agrega valor',
  NNVA: 'Necessário (não agrega valor)',
  W: 'Desperdício',
  U: 'Não classificado',
};

export const TYPE_LABEL: Record<ElementType, string> = {
  start: 'Início',
  task: 'Atividade',
  decision: 'Decisão',
  end: 'Fim',
};

export const PERIOD_LABEL: Record<Period, string> = { dia: 'dia', semana: 'semana', mes: 'mês', ano: 'ano' };
export const UNIT_LABEL: Record<DurationUnit, string> = { min: 'minutos', h: 'horas', d: 'dias' };
