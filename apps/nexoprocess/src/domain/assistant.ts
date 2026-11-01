// Assistente conversacional estruturado: interpretação determinística de texto
// livre (sempre apresentada para confirmação) e conversão do rascunho em processo.
import { newActivity, newProcess, normalizeStages } from './factory';
import type { Activity, DurationUnit, LeanClass, Period, ProcessModel } from './types';
import { parseLocaleNumber, uid } from './units';

import { getActiveLocale, tr } from '../i18n';
export type Unknown = 'nao_sei';
export interface DraftActivity {
  key: string;
  name: string;
  duration?: number;
  unit: DurationUnit;
  durationUnknown?: boolean;
  owner?: string;
  people?: number;
  wait?: number;
  waitState?: 'nao_ha' | 'informada' | 'nao_sei';
  rework?: 'sim' | 'nao' | 'nao_sei';
  reworkPct?: number;
  lean?: LeanClass | Unknown;
  /** Detalhes revisados pelo usuário (ou já presentes no texto). */
  reviewed?: boolean;
}
export interface DraftStage {
  key: string;
  name: string;
  activities: DraftActivity[];
  skipped?: boolean;
}
export interface DraftDecision {
  key: string;
  question: string;
  afterKey: string;
  noTarget: string; // chave de atividade ou '__end'
}
export interface AssistantDraft {
  version: 1;
  /** Identifica o rascunho: o mesmo rascunho nunca vira dois projetos (ver state/draftCommit). */
  draftId?: string;
  step: string;
  name: string;
  trigger?: string;
  outcome?: string;
  stages: DraftStage[];
  decisions: DraftDecision[];
  decisionsAnswered?: boolean;
  volume?: number;
  volumeUnknown?: boolean;
  period: Period;
  costPerHour?: number;
  costUnknown?: boolean;
  detailIndex: number;
  /** Correção feita a partir do resumo: ao continuar, volta direto ao resumo. */
  returnToReview?: boolean;
}

export function emptyDraft(): AssistantDraft {
  return { version: 1, draftId: uid('rd'), step: 'name', name: '', stages: [], decisions: [], period: 'mes', detailIndex: 0 };
}

/**
 * Divide texto livre em itens: uma linha por item, ou separadores comuns
 * (";", " → ", " -> ", "(e) depois", "(e) em seguida", "(e) então"), removendo
 * numeração ("1.", "2)", "-", "•").
 */
/** O PT usa exatamente as expressões de sempre; o EN acrescenta as palavras em inglês. */
const en = () => getActiveLocale() === 'en';
const unitRe = () => (en() ? '(min(?:ute|uto)?s?|h(?:our|ora)?s?|hr?s?|d(?:ay|ia)?s?)' : '(min(?:uto)?s?|h(?:ora)?s?|hr?s?|d(?:ia)?s?)');

export function parseList(text: string): string[] {
  const normalized = text
    .replace(/\r/g, '')
    .replace(/\s*(?:→|->|=>)\s*/g, '\n')
    .replace(/;\s*/g, '\n')
    .replace(en() ? /,?\s+(?:and\s+)?(?:then|next|after that|finally|depois|em seguida|então|após isso|por fim|finalmente)\s+/gi : /,?\s+(?:e\s+)?(?:depois|em seguida|então|após isso|por fim|finalmente)\s+/gi, '\n');
  return normalized
    .split('\n')
    .map((s) => s.replace(/^\s*(?:\d+\s*[.)º°-]\s*|[-•*]\s+)/, '').trim())
    .map((s) => s.replace(/[.]+$/, '').trim())
    .filter((s) => s.length > 0)
    .map((s) => s.charAt(0).toUpperCase() + s.slice(1));
}


/** Extrai duração ("(10 min)", "- 2h", "1,5 horas") e responsável ("por Atendente") de uma linha. */
export function parseActivityLine(line: string): { name: string; duration?: number; unit?: DurationUnit; owner?: string } {
  let name = line.trim();
  let duration: number | undefined;
  let unit: DurationUnit | undefined;
  let owner: string | undefined;
  const dur = new RegExp(`[\\s(,–—-]*\\(?\\s*(\\d+(?:[.,]\\d+)?)\\s*${unitRe()}\\s*\\)?\\s*$`, 'i').exec(name);
  if (dur) {
    const n = parseLocaleNumber(dur[1]);
    if (n !== undefined && !Number.isNaN(n)) {
      duration = n;
      const u = dur[2].toLowerCase();
      unit = u.startsWith('m') ? 'min' : u.startsWith('h') ? 'h' : 'd';
      name = name.slice(0, dur.index).trim();
    }
  }
  const by = (en() ? /\s+(?:[Bb]y|[Dd]one by|[Oo]wner:?|por|pelo|pela|feito por|responsável:?)\s+(?:the )?([A-ZÀ-Ú][\wÀ-ú ]{1,40})$/u : /\s+(?:por|pelo|pela|feito por|responsável:?)\s+(?:o |a )?([A-ZÀ-Ú][\wÀ-ú ]{1,40})$/u).exec(name);
  if (by) {
    owner = by[1].trim();
    name = name.slice(0, by.index).trim();
  }
  name = name.replace(/[\s,–—-]+$/, '').trim();
  return { name: name || line.trim(), duration, unit, owner };
}

export function draftActivityFrom(line: string): DraftActivity {
  const p = parseActivityLine(line);
  return { key: uid('da'), name: p.name, duration: p.duration, unit: p.unit ?? 'min', owner: p.owner, reviewed: p.duration !== undefined && !!p.owner };
}

export function allActivities(d: AssistantDraft): (DraftActivity & { stage: string })[] {
  return d.stages.filter((s) => !s.skipped).flatMap((s) => s.activities.map((a) => ({ ...a, stage: s.name })));
}

export type DecisionProblem = 'sem_pergunta' | 'atividade_removida' | 'destino_removido';
export interface DroppedStage {
  key: string;
  name: string;
  /** pulada = "Ainda não sei — completo depois"; sem_atividades = nenhuma atividade com nome; sem_nome = etapa sem nome. */
  reason: 'pulada' | 'sem_atividades' | 'sem_nome';
  activities: string[];
}
/** O que o rascunho vira no projeto: a revisão e a gravação usam esta mesma análise. */
export interface DraftAnalysis {
  stages: DraftStage[];
  flat: { s: DraftStage; a: DraftActivity }[];
  decisions: DraftDecision[];
  invalidDecisions: { decision: DraftDecision; n: number; problem: DecisionProblem }[];
  droppedStages: DroppedStage[];
}

export function analyzeDraft(d: AssistantDraft): DraftAnalysis {
  const named = (s: DraftStage) => s.activities.filter((a) => a.name.trim());
  const stages = d.stages.filter((s) => !s.skipped && s.name.trim() && named(s).length > 0);
  const droppedStages: DroppedStage[] = d.stages
    .filter((s) => !stages.includes(s))
    .filter((s) => s.name.trim() || named(s).length > 0)
    .map((s) => ({ key: s.key, name: s.name.trim(), reason: !s.name.trim() ? 'sem_nome' : s.skipped ? 'pulada' : 'sem_atividades', activities: named(s).map((a) => a.name.trim()) }));
  const flat = stages.flatMap((s) => named(s).map((a) => ({ s, a })));
  const keys = new Set(flat.map((x) => x.a.key));
  const decisions: DraftDecision[] = [];
  const invalidDecisions: DraftAnalysis['invalidDecisions'] = [];
  d.decisions.forEach((x, i) => {
    const problem: DecisionProblem | null = !x.question.trim() ? 'sem_pergunta' : !keys.has(x.afterKey) ? 'atividade_removida' : x.noTarget !== '__end' && !keys.has(x.noTarget) ? 'destino_removido' : null;
    if (problem) invalidDecisions.push({ decision: x, n: i + 1, problem });
    else decisions.push(x);
  });
  return { stages, flat, decisions, invalidDecisions, droppedStages };
}

/**
 * Converte o rascunho em processo AS-IS. Valores "não sei" ficam ausentes (nunca zero).
 * Só entra o que analyzeDraft considera válido; a revisão mostra o resto antes de criar.
 * Várias decisões depois da mesma atividade viram uma sequência (sim → próxima decisão).
 */
export function draftToProcess(d: AssistantDraft): ProcessModel {
  const p = newProcess(d.name.trim() || tr('d.assistant.001'));
  p.description = [d.trigger && tr('d.assistant.002', { p0: d.trigger.trim() }), d.outcome && tr('d.assistant.003', { p0: d.outcome.trim() })].filter(Boolean).join(' · ') || undefined;
  p.volume = d.volumeUnknown ? undefined : d.volume;
  p.volumePeriod = d.period;
  p.defaultCostPerHour = d.costUnknown ? undefined : d.costPerHour;
  const { stages, flat, decisions } = analyzeDraft(d);
  if (!flat.length) return p;
  const idOf = new Map(flat.map((x, i) => [x.a.key, `A${i + 1}`]));
  const decAfter = new Map<string, (DraftDecision & { id: string })[]>();
  decisions.forEach((x, i) => decAfter.set(x.afterKey, [...(decAfter.get(x.afterKey) ?? []), { ...x, id: `D${i + 1}` }]));
  const acts: Activity[] = [];
  let order = 0;
  const firstStage = flat[0].s.name.trim();
  const lastStage = flat[flat.length - 1].s.name.trim();
  acts.push(newActivity({ id: 'INICIO', stage: firstStage, name: d.trigger?.trim() || tr('d.assistant.004'), type: 'start', order: ++order, next: [idOf.get(flat[0].a.key)!] }));
  let needsNoEnd = false;
  flat.forEach(({ s, a }, i) => {
    const nextId = flat[i + 1] ? idOf.get(flat[i + 1].a.key)! : 'FIM';
    const act = newActivity({
      id: idOf.get(a.key)!,
      stage: s.name.trim(),
      name: a.name.trim(),
      order: ++order,
      unit: a.unit,
      duration: a.durationUnknown ? undefined : a.duration,
      owner: a.owner?.trim() || undefined,
      people: a.people,
      wait: a.waitState === 'informada' ? a.wait : undefined,
      rework: a.rework === 'sim' || undefined,
      frequencyPct: a.rework === 'sim' ? a.reworkPct : undefined,
      lean: a.lean && a.lean !== 'nao_sei' ? a.lean : undefined,
      notes: [a.durationUnknown && tr('d.assistant.005'), a.waitState === 'nao_sei' && tr('d.assistant.006'), a.rework === 'nao_sei' && tr('d.assistant.007')].filter(Boolean).join(' ') || undefined,
    });
    const chain = decAfter.get(a.key) ?? [];
    act.next = [chain[0]?.id ?? nextId];
    acts.push(act);
    chain.forEach((dec, j) => {
      const no = dec.noTarget === '__end' ? 'FIM_NAO' : idOf.get(dec.noTarget)!;
      if (dec.noTarget === '__end') needsNoEnd = true;
      acts.push(newActivity({ id: dec.id, stage: s.name.trim(), name: dec.question.trim(), type: 'decision', order: ++order, nextYes: chain[j + 1]?.id ?? nextId, nextNo: no }));
    });
  });
  acts.push(newActivity({ id: 'FIM', stage: lastStage, name: d.outcome?.trim() || tr('d.type.end'), type: 'end', order: ++order }));
  if (needsNoEnd) acts.push(newActivity({ id: 'FIM_NAO', stage: lastStage, name: tr('d.assistant.008'), type: 'end', order: ++order }));
  p.activities = acts;
  p.stageOrder = stages.map((s) => s.name.trim());
  return normalizeStages(p);
}
