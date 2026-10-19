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
