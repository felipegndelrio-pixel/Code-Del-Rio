// Assistente conversacional estruturado: interpretação determinística de texto
// livre (sempre apresentada para confirmação) e conversão do rascunho em processo.
import { newActivity, newProcess, normalizeStages } from './factory';
import type { Activity, DurationUnit, LeanClass, Period, ProcessModel } from './types';
import { parseLocaleNumber, uid } from './units';

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
}

export function emptyDraft(): AssistantDraft {
  return { version: 1, step: 'name', name: '', stages: [], decisions: [], period: 'mes', detailIndex: 0 };
}

/**
 * Divide texto livre em itens: uma linha por item, ou separadores comuns
 * (";", " → ", " -> ", "(e) depois", "(e) em seguida", "(e) então"), removendo
 * numeração ("1.", "2)", "-", "•").
 */
export function parseList(text: string): string[] {
  const normalized = text
    .replace(/\r/g, '')
    .replace(/\s*(?:→|->|=>)\s*/g, '\n')
    .replace(/;\s*/g, '\n')
    .replace(/,?\s+(?:e\s+)?(?:depois|em seguida|então|após isso|por fim|finalmente)\s+/gi, '\n');
  return normalized
    .split('\n')
    .map((s) => s.replace(/^\s*(?:\d+\s*[.)º°-]\s*|[-•*]\s+)/, '').trim())
    .map((s) => s.replace(/[.]+$/, '').trim())
    .filter((s) => s.length > 0)
    .map((s) => s.charAt(0).toUpperCase() + s.slice(1));
}

const UNIT_RE = '(min(?:uto)?s?|h(?:ora)?s?|hr?s?|d(?:ia)?s?)';
/** Extrai duração ("(10 min)", "- 2h", "1,5 horas") e responsável ("por Atendente") de uma linha. */
export function parseActivityLine(line: string): { name: string; duration?: number; unit?: DurationUnit; owner?: string } {
  let name = line.trim();
  let duration: number | undefined;
  let unit: DurationUnit | undefined;
  let owner: string | undefined;
  const dur = new RegExp(`[\\s(,–—-]*\\(?\\s*(\\d+(?:[.,]\\d+)?)\\s*${UNIT_RE}\\s*\\)?\\s*$`, 'i').exec(name);
  if (dur) {
    const n = parseLocaleNumber(dur[1]);
    if (n !== undefined && !Number.isNaN(n)) {
      duration = n;
      const u = dur[2].toLowerCase();
      unit = u.startsWith('m') ? 'min' : u.startsWith('h') ? 'h' : 'd';
      name = name.slice(0, dur.index).trim();
    }
  }
  const by = /\s+(?:por|pelo|pela|feito por|responsável:?)\s+(?:o |a )?([A-ZÀ-Ú][\wÀ-ú ]{1,40})$/u.exec(name);
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

/** Converte o rascunho em processo AS-IS. Valores "não sei" ficam ausentes (nunca zero). */
export function draftToProcess(d: AssistantDraft): ProcessModel {
  const p = newProcess(d.name.trim() || 'Novo processo');
  p.description = [d.trigger && `Início: ${d.trigger.trim()}`, d.outcome && `Resultado: ${d.outcome.trim()}`].filter(Boolean).join(' · ') || undefined;
  p.volume = d.volumeUnknown ? undefined : d.volume;
  p.volumePeriod = d.period;
  p.defaultCostPerHour = d.costUnknown ? undefined : d.costPerHour;
  const stages = d.stages.filter((s) => !s.skipped && s.name.trim() && s.activities.some((a) => a.name.trim()));
  const flat = stages.flatMap((s) => s.activities.filter((a) => a.name.trim()).map((a) => ({ s, a })));
  if (!flat.length) return p;
  const idOf = new Map(flat.map((x, i) => [x.a.key, `A${i + 1}`]));
  const decisions = d.decisions.filter((x) => x.question.trim() && idOf.has(x.afterKey) && (x.noTarget === '__end' || idOf.has(x.noTarget)));
  const decAfter = new Map(decisions.map((x, i) => [x.afterKey, { ...x, id: `D${i + 1}` }]));
  const acts: Activity[] = [];
  let order = 0;
  const firstStage = flat[0].s.name.trim();
  const lastStage = flat[flat.length - 1].s.name.trim();
  acts.push(newActivity({ id: 'INICIO', stage: firstStage, name: d.trigger?.trim() || 'Início', type: 'start', order: ++order, next: [idOf.get(flat[0].a.key)!] }));
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
      notes: [a.durationUnknown && 'Duração ainda não medida.', a.waitState === 'nao_sei' && 'Espera ainda não medida.', a.rework === 'nao_sei' && 'Retrabalho: não se sabe.'].filter(Boolean).join(' ') || undefined,
    });
    const dec = decAfter.get(a.key);
    if (dec) {
      act.next = [dec.id];
      acts.push(act);
      const no = dec.noTarget === '__end' ? 'FIM_NAO' : idOf.get(dec.noTarget)!;
      if (dec.noTarget === '__end') needsNoEnd = true;
      acts.push(newActivity({ id: dec.id, stage: s.name.trim(), name: dec.question.trim(), type: 'decision', order: ++order, nextYes: nextId, nextNo: no }));
    } else {
      act.next = [nextId];
      acts.push(act);
    }
  });
  acts.push(newActivity({ id: 'FIM', stage: lastStage, name: d.outcome?.trim() || 'Fim', type: 'end', order: ++order }));
  if (needsNoEnd) acts.push(newActivity({ id: 'FIM_NAO', stage: lastStage, name: 'Encerrado (resposta não)', type: 'end', order: ++order }));
  p.activities = acts;
  p.stageOrder = stages.map((s) => s.name.trim());
  return normalizeStages(p);
}
