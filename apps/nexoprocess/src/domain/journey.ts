// Jornada guiada: estado de cada etapa calculado a partir do workspace.
import { validateProcess } from './validation';
import type { Workspace } from './types';

export type StepKey = 'iniciar' | 'asis' | 'validar' | 'mapa' | 'diagnostico' | 'recomendacoes' | 'tobe' | 'comparar' | 'plano' | 'resultados';
export type StepState = 'feito' | 'atual' | 'pendente' | 'bloqueado';

export interface JourneyStep {
  key: StepKey;
  n: number;
  label: string;
  short: string;
  why: string;
  state: StepState;
}

const DEF: Omit<JourneyStep, 'state' | 'n'>[] = [
  { key: 'iniciar', label: 'Iniciar', short: 'Início', why: 'Escolha como começar.' },
  { key: 'asis', label: 'Informar o processo atual (AS-IS)', short: 'AS-IS', why: 'Precisamos das etapas e atividades como acontecem hoje.' },
  { key: 'validar', label: 'Validar dados', short: 'Validar', why: 'Erros de dados levam a conclusões erradas.' },
  { key: 'mapa', label: 'Ver o mapa', short: 'Mapa', why: 'Confirme se o fluxo desenhado representa a realidade.' },
  { key: 'diagnostico', label: 'Diagnóstico', short: 'Diagnóstico', why: 'Onde estão o tempo, o esforço e o desperdício.' },
  { key: 'recomendacoes', label: 'Avaliar recomendações', short: 'Recomendações', why: 'Decida o que vale testar.' },
  { key: 'tobe', label: 'Construir o futuro (TO-BE)', short: 'TO-BE', why: 'Descreva como o processo vai funcionar após as mudanças.' },
  { key: 'comparar', label: 'Comparar cenários', short: 'Comparar', why: 'Quanto muda em tempo, esforço, custo e capacidade.' },
  { key: 'plano', label: 'Plano de ação', short: 'Plano', why: 'Quem faz o quê, até quando.' },
  { key: 'resultados', label: 'Registrar resultados reais', short: 'Resultados', why: 'Compare o realizado com o estimado.' },
];

export function journey(w: Workspace): { steps: JourneyStep[]; next: JourneyStep | undefined; blocked: boolean } {
  const issues = validateProcess(w.asIs);
  const errors = issues.filter((i) => i.severity === 'error').length;
  const warnings = issues.filter((i) => i.severity === 'warning').length;
  const done: Record<StepKey, boolean> = {
    iniciar: true,
    asis: w.asIs.activities.length > 0,
    validar: errors === 0 && (warnings === 0 || !!w.validationAcceptedAt),
    mapa: !!w.visited.map,
    diagnostico: !!w.visited.diagnosis,
    recomendacoes: Object.values(w.recDecisions).some((d) => d.status !== 'pending'),
    tobe: w.scenarios.some((s) => s.changes.length > 0),
    comparar: !!w.visited.compare,
    plano: w.actions.length > 0,
    resultados: w.results.length > 0,
  };
  const blocked = errors > 0;
  let currentSet = false;
  const steps = DEF.map((d, i) => {
    let state: StepState;
    if (done[d.key]) state = 'feito';
    else if (blocked && i > 2) state = 'bloqueado';
    else if (!currentSet) {
      state = 'atual';
      currentSet = true;
    } else state = 'pendente';
    return { ...d, n: i + 1, state };
  });
  return { steps, next: steps.find((s) => s.state === 'atual'), blocked };
}

// ---------------------------------------------------------------------------
// Orientação contextual por etapa: objetivo e o que é necessário, com estado
// calculado dos dados reais (obrigatório × recomendado × opcional).

export type ReqKind = 'obrigatório' | 'recomendado' | 'opcional';
export interface Requirement {
  label: string;
  kind: ReqKind;
  ok: boolean;
  detail?: string;
}

export const STEP_OBJECTIVE: Record<StepKey, string> = {
  iniciar: 'Escolher como começar o projeto.',
  asis: 'Registrar como o processo funciona hoje: etapas, atividades, tempos e responsáveis.',
  validar: 'Garantir que os dados estão coerentes antes de calcular qualquer indicador.',
  mapa: 'Ver o fluxo desenhado a partir dos dados e confirmar se representa a realidade.',
  diagnostico: 'Entender onde estão o tempo, o esforço, as esperas e o desperdício.',
  recomendacoes: 'Decidir quais oportunidades de melhoria valem ser testadas.',
  tobe: 'Descrever como o processo vai funcionar depois das mudanças, com hipóteses explícitas.',
  comparar: 'Comparar hoje × futuro em tempo, esforço, capacidade e custo.',
  plano: 'Transformar as mudanças em ações com responsável, prazo e critério de sucesso.',
  resultados: 'Registrar o que realmente aconteceu e comparar com o previsto.',
};

export function stepRequirements(key: StepKey, w: Workspace): Requirement[] {
  const p = w.asIs;
  const tasks = p.activities.filter((a) => a.type === 'task');
  const share = (f: (a: (typeof tasks)[number]) => boolean) => (tasks.length ? tasks.filter(f).length / tasks.length : 0);
  const pct = (x: number) => `${Math.round(x * 100)}% das atividades`;
  const errors = validateProcess(p).filter((i) => i.severity === 'error').length;
  const dur = share((a) => typeof a.duration === 'number');
  const ppl = share((a) => typeof a.people === 'number');
  const own = share((a) => !!a.owner?.trim());
  const lean = share((a) => !!a.lean);
  const hasVolume = typeof p.volume === 'number';
  const hasCost = typeof p.defaultCostPerHour === 'number' || Object.keys(p.costPerHourByRole).length > 0 || tasks.some((a) => typeof a.costPerHour === 'number');
  const sc = w.scenarios.find((s) => s.id === w.activeScenarioId) ?? w.scenarios[0];
  switch (key) {
    case 'iniciar':
      return [];
    case 'asis':
      return [
        { label: 'Atividades cadastradas', kind: 'obrigatório', ok: tasks.length > 0, detail: `${tasks.length} atividade(s)` },
        { label: 'Duração das atividades', kind: 'recomendado', ok: dur === 1, detail: pct(dur) },
        { label: 'Responsáveis', kind: 'recomendado', ok: own === 1, detail: pct(own) },
        { label: 'Pessoas por atividade', kind: 'recomendado', ok: ppl === 1, detail: pct(ppl) },
        { label: 'Volume de execuções', kind: 'recomendado', ok: hasVolume },
        { label: 'Custo-hora', kind: 'opcional', ok: hasCost },
      ];
    case 'validar':
      return [{ label: 'Sem erros de dados', kind: 'obrigatório', ok: errors === 0, detail: errors ? `${errors} erro(s)` : undefined }];
    case 'mapa':
      return [
        { label: 'Atividades cadastradas', kind: 'obrigatório', ok: tasks.length > 0 },
        { label: 'Ligações entre atividades válidas', kind: 'recomendado', ok: errors === 0 },
      ];
    case 'diagnostico':
      return [
        { label: 'Duração das atividades', kind: 'obrigatório', ok: dur > 0, detail: pct(dur) },
        { label: 'Pessoas por atividade (esforço)', kind: 'recomendado', ok: ppl === 1, detail: pct(ppl) },
        { label: 'Classificação Lean', kind: 'recomendado', ok: lean === 1, detail: pct(lean) },
        { label: 'Volume (esforço por período)', kind: 'recomendado', ok: hasVolume },
        { label: 'Custo-hora (custo estimado)', kind: 'opcional', ok: hasCost },
      ];
    case 'recomendacoes':
      return [
        { label: 'Diagnóstico com durações', kind: 'obrigatório', ok: dur > 0 },
        { label: 'Classificação Lean', kind: 'recomendado', ok: lean === 1, detail: pct(lean) },
      ];
    case 'tobe':
      return [
        { label: 'AS-IS sem erros', kind: 'obrigatório', ok: errors === 0 },
        { label: 'Recomendações avaliadas', kind: 'recomendado', ok: Object.values(w.recDecisions).some((d) => d.status !== 'pending') },
      ];
    case 'comparar':
      return [
        { label: 'Cenário TO-BE criado', kind: 'obrigatório', ok: !!sc },
        { label: 'Mudanças registradas no TO-BE', kind: 'recomendado', ok: !!sc && sc.changes.length > 0 },
        { label: 'Volume (comparação mensal)', kind: 'recomendado', ok: hasVolume },
        { label: 'Custo-hora (benefício financeiro)', kind: 'opcional', ok: hasCost },
        { label: 'Investimento e custo recorrente (payback/ROI)', kind: 'opcional', ok: !!sc && typeof sc.investment === 'number' && typeof sc.recurringCostPerMonth === 'number' },
      ];
    case 'plano':
      return [{ label: 'Mudanças ou recomendações aceitas para virar ações', kind: 'recomendado', ok: (!!sc && sc.changes.length > 0) || Object.values(w.recDecisions).some((d) => d.status === 'accepted') }];
    case 'resultados':
      return [{ label: 'Ações implantadas', kind: 'recomendado', ok: w.actions.some((a) => a.status === 'concluida') }];
  }
}
