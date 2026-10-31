// Navegação do projeto: grupos por fase da jornada. Fonte única para a barra
// lateral (desktop), o menu de etapas (celular) e o cabeçalho de etapa.
import { BarChart3, ClipboardList, Download, FileText, GitBranch, LayoutDashboard, Lightbulb, ListChecks, Scale, ShieldAlert, Sparkles, Table2, Target, Timer, Users, Wand2, type LucideIcon } from 'lucide-react';
import type { StepKey } from '../domain/journey';
import { translator, type Locale, type MessageKey } from '../i18n';

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

type NavItemDef = Omit<NavItem, 'label' | 'short' | 'objective'> & { key: string; hasObjective?: boolean };
interface NavGroupDef {
  key: string;
  items: NavItemDef[];
}

// Textos no dicionário (i18n/messages): nav.<key>.label | .short | .objective.
const NAV_DEF: NavGroupDef[] = [
  { key: 'project', items: [{ key: 'overview', path: 'visao-geral', icon: LayoutDashboard, hasObjective: true }] },
  {
    key: 'survey',
    items: [
      { key: 'data', path: 'dados', step: 'asis', icon: Table2 },
      { key: 'validate', path: 'validar', step: 'validar', icon: ListChecks },
    ],
  },
  {
    key: 'analysis',
    items: [
      { key: 'map', path: 'mapa', step: 'mapa', icon: GitBranch },
      { key: 'diagnosis', path: 'diagnostico', step: 'diagnostico', icon: BarChart3 },
      { key: 'opportunities', path: 'recomendacoes', step: 'recomendacoes', icon: Lightbulb },
    ],
  },
  {
    key: 'improvement',
    items: [
      { key: 'tobe', path: 'tobe', step: 'tobe', icon: Wand2 },
      { key: 'compare', path: 'comparar', step: 'comparar', icon: Scale },
      { key: 'plan', path: 'plano', step: 'plano', icon: ClipboardList },
      { key: 'results', path: 'resultados', step: 'resultados', icon: Target },
    ],
  },
  {
    key: 'complementary',
    items: [
      { key: 'risks', path: 'riscos', icon: ShieldAlert, hasObjective: true },
      { key: 'raci', path: 'responsabilidades', icon: Users, hasObjective: true },
      { key: 'simulation', path: 'simulacao', icon: Timer, hasObjective: true },
      { key: 'automation', path: 'automacao', icon: Sparkles, hasObjective: true },
    ],
  },
  {
    key: 'outputs',
    items: [
      { key: 'export', path: 'exportar', icon: Download, hasObjective: true },
      { key: 'report', path: 'relatorio', icon: FileText, hasObjective: true },
    ],
  },
];

/** Navegação no idioma pedido. PT é o mesmo conteúdo da v2.5.0-rc1 (teste golden). */
export function navFor(locale: Locale): NavGroup[] {
  const t = translator(locale);
  const k = (key: string) => key as MessageKey;
  return NAV_DEF.map((g) => ({
    label: t(k(`nav.group.${g.key}`)),
    items: g.items.map(({ key, hasObjective, ...rest }) => ({
      ...rest,
      label: t(k(`nav.${key}.label`)),
      short: t(k(`nav.${key}.short`)),
      objective: hasObjective ? t(k(`nav.${key}.objective`)) : '',
    })),
  }));
}

export const NAV: NavGroup[] = navFor('pt');

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

