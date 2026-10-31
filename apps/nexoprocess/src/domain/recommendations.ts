// "O que melhorar agora?" — recomendações DETERMINÍSTICAS baseadas em regras
// explícitas sobre os dados. Não há IA generativa aqui; a interface rotula
// como "análise automática baseada nos dados e regras".
import { bottlenecks, computeMetrics, type ProcessMetrics } from './metrics';
import { LEAN_REASON_LABEL, MANDATORY_REASONS, type Activity, type BottleneckCriterion, type ProcessModel } from './types';
import { fmtHours, fmtNum, fmtPct, isNum } from './units';

import { lazyLabels } from '../i18n';
import { tr } from '../i18n';
export type RecGroup = 'resolver' | 'investigar' | 'automatizar' | 'monitorar';
export const GROUP_LABEL: Record<RecGroup, string> = lazyLabels({
  resolver: 'd.recgroup.resolver',
  investigar: 'd.recgroup.investigar',
  automatizar: 'd.recgroup.automatizar',
  monitorar: 'd.recgroup.monitorar',
});

export interface Evidence {
  /** Fato = consta nos dados; Inferência = derivado por regra. */
  kind: 'fato' | 'inferencia';
  text: string;
}

export interface Recommendation {
  id: string;
  group: RecGroup;
  priority: 'alta' | 'media' | 'baixa';
  score: number;
  title: string;
  activityId?: string;
  problem: string;
  evidence: Evidence[];
  rule: string;
  hypothesis: string;
  action: string;
  /** Teto teórico (100% de eliminação) — NÃO é previsão. */
  ceiling?: string;
  owner?: string;
  successIndicator: string;
  risks: string;
  dataNeeded?: string;
  nextStep: string;
  /** Impacto esperado (teto teórico ou motivo de não ser quantificável). */
  impact: string;
  /** O que precisa existir antes da intervenção. */
  dependencies: string[];
  /** Dados que faltam para decidir com segurança. */
  missingInfo: string[];
  /** Alerta quando a atividade é exigida (regulatório, controle, segurança). */
  caution?: string;
  /** Tipo de mudança sugerida no TO-BE. */
  changeKind?: 'remove' | 'simplify' | 'automate' | 'reduce_wait' | 'reduce_rework';
}

const P = (s: number): Recommendation['priority'] => (s >= 70 ? 'alta' : s >= 40 ? 'media' : 'baixa');

type RawRec = Omit<Recommendation, 'impact' | 'dependencies' | 'missingInfo' | 'caution'>;

export function recommend(p: ProcessModel, criterion: BottleneckCriterion = 'duration', thresholdPct = 15, m: ProcessMetrics = computeMetrics(p)): Recommendation[] {
  const recs: RawRec[] = [];
  const work = m.workItems;
  const totalActive = m.activeSumH.value ?? 0;
  const per = (a: Activity) => m.per.get(a.id)!;
  const periodTxt = p.volumePeriod === 'mes' ? tr('d.rec.001') : p.volumePeriod;
  const ceilingOf = (a: Activity) => {
    const x = per(a);
    if (x.effortPeriodH !== null) return tr('d.rec.002', { p0: fmtNum(x.effortPeriodH), periodTxt });
    if (x.effortH !== null) return tr('d.rec.003', { p0: fmtNum(x.effortH * x.weight) });
    return undefined;
  };

  // R1 — Desperdício declarado
  for (const a of work.filter((x) => x.lean === 'W' && !x.rework)) {
    const x = per(a);
    const share = x.activeH !== null && totalActive > 0 ? (x.activeH / totalActive) * 100 : null;
    const score = 60 + Math.min(30, (share ?? 0) * 1.5);
    recs.push({
      id: `R1:${a.id}`,
      group: 'resolver',
      priority: P(score),
      score,
      title: tr('d.rec.004', { name: a.name }),
      activityId: a.id,
      problem: tr('d.rec.005'),
      evidence: [
        { kind: 'fato', text: tr('d.rec.006') },
        ...(x.activeH !== null ? [{ kind: 'fato' as const, text: tr('d.rec.007', { p0: fmtHours(x.activeH) }) }] : []),
        ...(share !== null ? [{ kind: 'inferencia' as const, text: tr('d.rec.008', { p0: fmtPct(share) }) }] : []),
      ],
      rule: tr('d.rec.009'),
      hypothesis: tr('d.rec.010'),
      action: tr('d.rec.011'),
      ceiling: ceilingOf(a),
      owner: a.owner,
      successIndicator: tr('d.rec.012'),
      risks: tr('d.rec.013'),
      nextStep: tr('d.rec.014'),
      changeKind: 'remove',
    });
  }

  // R2 — Retrabalho marcado ou ciclos de retorno
  for (const a of work.filter((x) => x.rework)) {
    const x = per(a);
    const hasFreq = x.weightSource !== 'premissa_100';
    const score = 65 + (hasFreq && isNum(a.frequencyPct) ? Math.min(25, a.frequencyPct) : 0);
    recs.push({
      id: `R2:${a.id}`,
      group: hasFreq ? 'resolver' : 'investigar',
      priority: P(score),
      score,
      title: tr('d.rec.015', { name: a.name }),
      activityId: a.id,
      problem: tr('d.rec.016'),
      evidence: [
        { kind: 'fato', text: tr('d.rec.017') },
        ...(isNum(a.frequencyPct) ? [{ kind: 'fato' as const, text: tr('d.rec.018', { p0: fmtPct(a.frequencyPct) }) }] : [{ kind: 'fato' as const, text: tr('d.rec.019') }]),
        ...(x.effortPeriodH !== null && hasFreq ? [{ kind: 'inferencia' as const, text: tr('d.rec.020', { p0: fmtNum(x.effortPeriodH), periodTxt }) }] : []),
      ],
      rule: tr('d.rec.021'),
      hypothesis: tr('d.rec.022'),
      action: tr('d.rec.023'),
      ceiling: hasFreq ? ceilingOf(a) : undefined,
      owner: a.owner,
      successIndicator: tr('d.rec.024'),
      risks: tr('d.rec.025'),
      dataNeeded: hasFreq ? undefined : tr('d.rec.026'),
      nextStep: hasFreq ? tr('d.rec.027') : tr('d.rec.028'),
      changeKind: 'reduce_rework',
    });
  }

  // R3 — Gargalos (concentração no critério escolhido)
  const bn = bottlenecks(p, m, criterion, thresholdPct);
  bn.flagged.forEach((b, i) => {
    const a = m.graph.byId.get(b.id)!;
    if (recs.some((r) => r.activityId === a.id && r.group === 'resolver')) return;
    const score = 55 + Math.min(35, b.share) - i * 3;
    recs.push({
      id: `R3:${a.id}:${criterion}`,
      group: 'investigar',
      priority: P(score),
      score,
      title: tr('d.rec.029', { name: a.name }),
      activityId: a.id,
      problem: tr('d.rec.030'),
      evidence: [
        { kind: 'inferencia', text: tr('d.rec.031', { p0: fmtPct(b.share), p1: criterionLabel(criterion) }) },
        { kind: 'fato', text: tr('d.rec.032', { p0: i + 1 }) },
      ],
      rule: tr('d.rec.033', { thresholdPct, p1: criterionLabel(criterion) }),
      hypothesis: tr('d.rec.034'),
      action: tr('d.rec.035'),
      ceiling: ceilingOf(a),
      owner: a.owner,
      successIndicator: tr('d.rec.036', { p0: criterionLabel(criterion).toLowerCase() }),
      risks: tr('d.rec.037'),
      nextStep: tr('d.rec.038'),
      changeKind: 'simplify',
    });
  });

  // R4 — Espera muito maior que o trabalho e relevante no total de esperas
  const totalWait = m.waitSumH.value ?? 0;
  for (const a of work) {
    const x = per(a);
    if (x.waitH === null || x.activeH === null || x.waitH <= 0 || x.waitH < 2 * x.activeH) continue;
    if (totalWait > 0 && x.waitH / totalWait < 0.05) continue;
    const ratio = x.activeH > 0 ? x.waitH / x.activeH : Infinity;
    const score = Math.min(85, 45 + Math.log2(Math.max(ratio, 1)) * 8);
    recs.push({
      id: `R4:${a.id}`,
      group: 'resolver',
      priority: P(score),
      score,
      title: tr('d.rec.039', { name: a.name }),
      activityId: a.id,
      problem: tr('d.rec.040'),
      evidence: [
        { kind: 'fato', text: tr('d.rec.041', { p0: fmtHours(x.waitH), p1: fmtHours(x.activeH) }) },
        { kind: 'inferencia', text: Number.isFinite(ratio) ? tr('d.rec.042', { p0: fmtNum(ratio, 1) }) : tr('d.rec.043') },
      ],
      rule: tr('d.rec.044'),
      hypothesis: tr('d.rec.045'),
      action: tr('d.rec.046'),
      owner: a.owner,
      successIndicator: tr('d.rec.047'),
      risks: tr('d.rec.048'),
      nextStep: tr('d.rec.049'),
      changeKind: 'reduce_wait',
    });
  }

  // R5 — Necessário sem agregar valor, repetitivo e com volume → candidato a automação
  for (const a of work.filter((x) => x.lean === 'NNVA' && x.type === 'task')) {
    const x = per(a);
    if (x.execPerPeriod === null || x.effortH === null) continue;
    const share = m.effortPeriodH.value ? ((x.effortPeriodH ?? 0) / m.effortPeriodH.value) * 100 : 0;
    if (share < 5) continue;
    const score = 35 + Math.min(40, share * 2);
    recs.push({
      id: `R5:${a.id}`,
      group: 'automatizar',
      priority: P(score),
      score,
      title: tr('d.rec.050', { name: a.name }),
      activityId: a.id,
      problem: tr('d.rec.051'),
      evidence: [
        { kind: 'fato', text: tr('d.rec.052') },
        { kind: 'fato', text: tr('d.rec.053', { p0: fmtNum(x.execPerPeriod), periodTxt }) },
        { kind: 'inferencia', text: tr('d.rec.054', { p0: fmtPct(share) }) },
      ],
      rule: tr('d.rec.055'),
      hypothesis: tr('d.rec.056'),
      action: tr('d.rec.057'),
      ceiling: ceilingOf(a),
      owner: a.owner,
      successIndicator: tr('d.rec.058'),
      risks: tr('d.rec.059'),
      nextStep: tr('d.rec.060'),
      changeKind: 'automate',
    });
  }

  // R6 — Dados que faltam para decidir
  const unclassified = work.filter((a) => a.type === 'task' && !a.lean);
  if (unclassified.length) {
    recs.push({
      id: 'R6:lean',
      group: 'monitorar',
      priority: 'baixa',
      score: 20,
      title: tr('d.rec.061', { length: unclassified.length }),
      problem: tr('d.rec.062'),
      evidence: [{ kind: 'fato', text: tr('d.rec.063', { length: unclassified.length, p1: work.filter((a) => a.type === 'task').length }) }],
      rule: tr('d.rec.064'),
      hypothesis: tr('d.rec.065'),
      action: tr('d.rec.066'),
      successIndicator: tr('d.rec.067'),
      risks: tr('d.rec.068'),
      nextStep: tr('d.rec.069'),
    });
  }
  const noOwner = work.filter((a) => a.type === 'task' && !a.owner?.trim());
  if (noOwner.length)
    recs.push({
      id: 'R7:owner',
      group: 'monitorar',
      priority: 'media',
      score: 40,
      title: tr('d.rec.070', { length: noOwner.length }),
      problem: tr('d.rec.071'),
      evidence: [{ kind: 'fato', text: tr('d.rec.072', { length: noOwner.length }) }],
      rule: tr('d.rec.073'),
      hypothesis: tr('d.rec.074'),
      action: tr('d.rec.075'),
      successIndicator: tr('d.rec.076'),
      risks: tr('d.rec.077'),
      nextStep: tr('d.rec.078'),
    });

  // R8 — Muitas trocas de responsável em sequência (handoffs)
  let handoffs = 0;
  for (const e of m.graph.edges) {
    if (e.back) continue;
    const a = m.graph.byId.get(e.from)!;
    const b = m.graph.byId.get(e.to)!;
    if (a.type === 'task' && b.type === 'task' && a.owner && b.owner && a.owner !== b.owner) handoffs++;
  }
  if (handoffs >= 4)
    recs.push({
      id: 'R8:handoffs',
      group: 'investigar',
      priority: 'media',
      score: 45,
      title: tr('d.rec.079', { handoffs }),
      problem: tr('d.rec.080'),
      evidence: [{ kind: 'inferencia', text: tr('d.rec.081', { handoffs }) }],
      rule: tr('d.rec.082'),
      hypothesis: tr('d.rec.083'),
      action: tr('d.rec.084'),
      successIndicator: tr('d.rec.085'),
      risks: tr('d.rec.086'),
      nextStep: tr('d.rec.087'),
    });

  // R9 — Atividade crítica: monitorar
  for (const a of work.filter((x) => x.critical)) {
    recs.push({
      id: `R9:${a.id}`,
      group: 'monitorar',
      priority: 'media',
      score: 38,
      title: tr('d.rec.088', { name: a.name }),
      activityId: a.id,
      problem: tr('d.rec.089'),
      evidence: [{ kind: 'fato', text: tr('d.rec.090') }],
      rule: tr('d.rec.091'),
      hypothesis: tr('d.rec.092'),
      action: tr('d.rec.093'),
      owner: a.owner,
      successIndicator: tr('d.rec.094'),
      risks: tr('d.rec.095'),
      nextStep: tr('d.rec.096'),
    });
  }
  return recs.map((r) => enrich(r, p, m)).sort((a, b) => b.score - a.score);
}

const DEPS: Record<NonNullable<Recommendation['changeKind']>, string> = lazyLabels({
  remove: 'd.recdep.remove',
  simplify: 'd.recdep.simplify',
  automate: 'd.recdep.automate',
  reduce_wait: 'd.recdep.reduce_wait',
  reduce_rework: 'd.recdep.reduce_rework',
});

/** Completa a recomendação com impacto, dependências, dados ausentes e alertas — só a partir dos dados. */
function enrich(r: RawRec, p: ProcessModel, m: ProcessMetrics): Recommendation {
  const a = r.activityId ? p.activities.find((x) => x.id === r.activityId) : undefined;
  const x = a ? m.per.get(a.id) : undefined;
  const dependencies: string[] = [];
  if (r.changeKind) dependencies.push(DEPS[r.changeKind]);
  if (a && !a.owner?.trim()) dependencies.push(tr('d.rec.097'));
  if (r.group === 'investigar' || r.group === 'monitorar') dependencies.push(tr('d.rec.098'));
  const missingInfo: string[] = [];
  if (r.dataNeeded) missingInfo.push(r.dataNeeded);
  if (a && x) {
    if (x.activeH === null) missingInfo.push(tr('d.rec.099'));
    if (x.effortH === null && x.activeH !== null) missingInfo.push(tr('d.rec.100'));
    if (x.execPerPeriod === null) missingInfo.push(tr('d.rec.101'));
    if (x.costPerHour === null) missingInfo.push(tr('d.rec.102'));
    if (a.rework && !isNum(a.frequencyPct)) missingInfo.push(tr('d.rec.103'));
  }
  let caution: string | undefined;
  if (a?.lean === 'NNVA' && a.leanReason && MANDATORY_REASONS.includes(a.leanReason)) {
    caution = tr('d.rec.104', { p0: LEAN_REASON_LABEL[a.leanReason].toLowerCase(), p1: a.leanReasonNote ? `: ${a.leanReasonNote}` : '' });
    dependencies.push(tr('d.rec.105'));
  } else if (a?.lean === 'NNVA' && !a.leanReason) {
    missingInfo.push(tr('d.rec.106'));
  }
  return {
    ...r,
    impact: r.ceiling ?? (r.activityId ? tr('d.rec.107') : tr('d.rec.108')),
    dependencies: [...new Set(dependencies)],
    missingInfo: [...new Set(missingInfo)],
    caution,
  };
}

function criterionLabel(c: BottleneckCriterion) {
  return { duration: tr('d.rec.109'), effort: tr('d.rec.110'), cost: 'Custo', wait: 'Espera', rework: 'Retrabalho' }[c];
}
