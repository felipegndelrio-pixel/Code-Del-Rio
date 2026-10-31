// Jornada guiada: estado de cada etapa calculado a partir do workspace.
import { lazyLabels, tr } from '../i18n';
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

const DEF = (): Omit<JourneyStep, 'state' | 'n'>[] => [
  { key: 'iniciar', label: tr('d.journey.def.iniciar.label'), short: tr('journey.iniciar.short'), why: tr('d.journey.def.iniciar.why') },
  { key: 'asis', label: tr('d.journey.def.asis.label'), short: tr('journey.asis.short'), why: tr('d.journey.def.asis.why') },
  { key: 'validar', label: tr('d.journey.def.validar.label'), short: tr('journey.validar.short'), why: tr('d.journey.def.validar.why') },
  { key: 'mapa', label: tr('d.journey.def.mapa.label'), short: tr('journey.mapa.short'), why: tr('d.journey.def.mapa.why') },
  { key: 'diagnostico', label: tr('d.journey.def.diagnostico.label'), short: tr('journey.diagnostico.short'), why: tr('d.journey.def.diagnostico.why') },
  { key: 'recomendacoes', label: tr('d.journey.def.recomendacoes.label'), short: tr('journey.recomendacoes.short'), why: tr('d.journey.def.recomendacoes.why') },
  { key: 'tobe', label: tr('d.journey.def.tobe.label'), short: tr('journey.tobe.short'), why: tr('d.journey.def.tobe.why') },
  { key: 'comparar', label: tr('d.journey.def.comparar.label'), short: tr('journey.comparar.short'), why: tr('d.journey.def.comparar.why') },
  { key: 'plano', label: tr('d.journey.def.plano.label'), short: tr('journey.plano.short'), why: tr('d.journey.def.plano.why') },
  { key: 'resultados', label: tr('d.journey.def.resultados.label'), short: tr('journey.resultados.short'), why: tr('d.journey.def.resultados.why') },
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
  const steps = DEF().map((d, i) => {
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

export const STEP_OBJECTIVE: Record<StepKey, string> = lazyLabels({
  iniciar: 'd.journey.obj.iniciar',
  asis: 'd.journey.obj.asis',
  validar: 'd.journey.obj.validar',
  mapa: 'd.journey.obj.mapa',
  diagnostico: 'd.journey.obj.diagnostico',
  recomendacoes: 'd.journey.obj.recomendacoes',
  tobe: 'd.journey.obj.tobe',
  comparar: 'd.journey.obj.comparar',
  plano: 'd.journey.obj.plano',
  resultados: 'd.journey.obj.resultados',
});

export function stepRequirements(key: StepKey, w: Workspace): Requirement[] {
  const p = w.asIs;
  const tasks = p.activities.filter((a) => a.type === 'task');
  const share = (f: (a: (typeof tasks)[number]) => boolean) => (tasks.length ? tasks.filter(f).length / tasks.length : 0);
  const pct = (x: number) => tr('d.journey.001', { p0: Math.round(x * 100) });
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
        { label: tr('d.journey.002'), kind: 'obrigatório', ok: tasks.length > 0, detail: tr('d.journey.003', { length: tasks.length }) },
        { label: tr('d.journey.004'), kind: 'recomendado', ok: dur === 1, detail: pct(dur) },
        { label: tr('d.journey.005'), kind: 'recomendado', ok: own === 1, detail: pct(own) },
        { label: tr('d.journey.006'), kind: 'recomendado', ok: ppl === 1, detail: pct(ppl) },
        { label: tr('d.journey.007'), kind: 'recomendado', ok: hasVolume },
        { label: tr('d.journey.008'), kind: 'opcional', ok: hasCost },
      ];
    case 'validar':
      return [{ label: tr('d.journey.009'), kind: 'obrigatório', ok: errors === 0, detail: errors ? tr('d.journey.010', { errors }) : undefined }];
    case 'mapa':
      return [
        { label: tr('d.journey.011'), kind: 'obrigatório', ok: tasks.length > 0 },
        { label: tr('d.journey.012'), kind: 'recomendado', ok: errors === 0 },
      ];
    case 'diagnostico':
      return [
        { label: tr('d.journey.013'), kind: 'obrigatório', ok: dur > 0, detail: pct(dur) },
        { label: tr('d.journey.014'), kind: 'recomendado', ok: ppl === 1, detail: pct(ppl) },
        { label: tr('d.journey.015'), kind: 'recomendado', ok: lean === 1, detail: pct(lean) },
        { label: tr('d.journey.016'), kind: 'recomendado', ok: hasVolume },
        { label: tr('d.journey.017'), kind: 'opcional', ok: hasCost },
      ];
    case 'recomendacoes':
      return [
        { label: tr('d.journey.018'), kind: 'obrigatório', ok: dur > 0 },
        { label: tr('d.journey.019'), kind: 'recomendado', ok: lean === 1, detail: pct(lean) },
      ];
    case 'tobe':
      return [
        { label: tr('d.journey.020'), kind: 'obrigatório', ok: errors === 0 },
        { label: tr('d.journey.021'), kind: 'recomendado', ok: Object.values(w.recDecisions).some((d) => d.status !== 'pending') },
      ];
    case 'comparar':
      return [
        { label: tr('d.journey.022'), kind: 'obrigatório', ok: !!sc },
        { label: tr('d.journey.023'), kind: 'recomendado', ok: !!sc && sc.changes.length > 0 },
        { label: tr('d.journey.024'), kind: 'recomendado', ok: hasVolume },
        { label: tr('d.journey.025'), kind: 'opcional', ok: hasCost },
        { label: tr('d.journey.026'), kind: 'opcional', ok: !!sc && typeof sc.investment === 'number' && typeof sc.recurringCostPerMonth === 'number' },
      ];
    case 'plano':
      return [{ label: tr('d.journey.027'), kind: 'recomendado', ok: (!!sc && sc.changes.length > 0) || Object.values(w.recDecisions).some((d) => d.status === 'accepted') }];
    case 'resultados':
      return [{ label: tr('d.journey.028'), kind: 'recomendado', ok: w.actions.some((a) => a.status === 'concluida') }];
  }
}
