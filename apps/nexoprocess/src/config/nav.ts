// Navegação do projeto: grupos por fase da jornada. Fonte única para a barra
// lateral (desktop), o menu de etapas (celular) e o cabeçalho de etapa.
import { BarChart3, ClipboardList, Download, FileText, GitBranch, LayoutDashboard, Lightbulb, ListChecks, Scale, ShieldAlert, Sparkles, Table2, Target, Timer, Users, Wand2, type LucideIcon } from 'lucide-react';
import type { StepKey } from '../domain/journey';

export interface NavItem {
  path: string;
  label: string;
  short: string;
  step?: StepKey;
  icon: LucideIcon;
  objective: string;
}
export interface NavGroup {
  label: string;
  items: NavItem[];
}

export const NAV: NavGroup[] = [
  { label: 'Projeto', items: [{ path: 'visao-geral', label: 'Visão geral', short: 'Visão geral', icon: LayoutDashboard, objective: 'Onde o projeto está, o que falta e qual é a próxima ação.' }] },
  {
    label: 'Levantamento',
    items: [
      { path: 'dados', label: 'Dados do processo', short: 'Dados', step: 'asis', icon: Table2, objective: '' },
      { path: 'validar', label: 'Validação', short: 'Validar', step: 'validar', icon: ListChecks, objective: '' },
    ],
  },
  {
    label: 'Análise',
    items: [
      { path: 'mapa', label: 'Mapa AS-IS', short: 'Mapa', step: 'mapa', icon: GitBranch, objective: '' },
      { path: 'diagnostico', label: 'Diagnóstico', short: 'Diagnóstico', step: 'diagnostico', icon: BarChart3, objective: '' },
      { path: 'recomendacoes', label: 'Oportunidades', short: 'Oportunidades', step: 'recomendacoes', icon: Lightbulb, objective: '' },
    ],
  },
  {
    label: 'Melhoria',
    items: [
      { path: 'tobe', label: 'Cenário futuro (TO-BE)', short: 'TO-BE', step: 'tobe', icon: Wand2, objective: '' },
      { path: 'comparar', label: 'Comparação e impacto', short: 'Comparar', step: 'comparar', icon: Scale, objective: '' },
      { path: 'plano', label: 'Plano de ação', short: 'Plano', step: 'plano', icon: ClipboardList, objective: '' },
      { path: 'resultados', label: 'Resultados reais', short: 'Resultados', step: 'resultados', icon: Target, objective: '' },
    ],
  },
  {
    label: 'Análises complementares',
    items: [
      { path: 'riscos', label: 'Riscos e FMEA', short: 'Riscos', icon: ShieldAlert, objective: 'Registrar o que pode dar errado, a prioridade e o controle.' },
      { path: 'responsabilidades', label: 'Responsabilidades (RACI)', short: 'RACI', icon: Users, objective: 'Definir quem executa, quem presta contas, quem é consultado e informado.' },
      { path: 'simulacao', label: 'Simulação de prazo', short: 'Simulação', icon: Timer, objective: 'Ver a faixa provável do prazo a partir de mínimos e máximos informados.' },
      { path: 'automacao', label: 'Automação e IA', short: 'Automação', icon: Sparkles, objective: 'Avaliar com critérios explícitos onde automação ou IA fazem sentido.' },
    ],
  },
  {
    label: 'Saídas',
    items: [
      { path: 'exportar', label: 'Exportar', short: 'Exportar', icon: Download, objective: 'Baixar mapas, dados e o projeto completo.' },
      { path: 'relatorio', label: 'Relatório executivo', short: 'Relatório', icon: FileText, objective: 'Documento para apresentar e imprimir em PDF.' },
    ],
  },
];

export const NAV_ITEMS = NAV.flatMap((g) => g.items);
/** Destinos da barra inferior no celular (o restante fica no menu de etapas). */
export const MOBILE_TABS = ['visao-geral', 'dados', 'mapa', 'diagnostico', 'plano'];

/** Rota de cada etapa da jornada. */
export const STEP_PATH: Record<StepKey, string> = {
  iniciar: 'visao-geral',
  asis: 'dados',
  validar: 'validar',
  mapa: 'mapa',
  diagnostico: 'diagnostico',
  recomendacoes: 'recomendacoes',
  tobe: 'tobe',
  comparar: 'comparar',
  plano: 'plano',
  resultados: 'resultados',
};

