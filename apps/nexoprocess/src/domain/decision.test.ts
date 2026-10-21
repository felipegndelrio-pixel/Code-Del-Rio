import { describe, expect, it } from 'vitest';
import { businessCases, compareScenarios, DEFAULT_SENSITIVITY, responsibilityChanges, roleLoads } from './compare';
import { demoProcess, demoWorkspace } from './demo';
import { actionFromRecommendation, completionIssue, planCandidates, relatedProblemOf } from './plan';
import { recommend } from './recommendations';
import type { ActionItem } from './types';

describe('recomendações completas', () => {
  const recs = recommend(demoProcess());
  it('toda recomendação traz impacto, dependências e dados ausentes', () => {
    for (const r of recs) {
      expect(r.impact.length).toBeGreaterThan(0);
      expect(Array.isArray(r.dependencies)).toBe(true);
      expect(Array.isArray(r.missingInfo)).toBe(true);
    }
  });
  it('atividade exigida (controle) recebe alerta e não é tratada como desperdício', () => {
    const r9 = recs.find((r) => r.id === 'R9:B1')!;
    expect(r9.caution).toMatch(/Não elimine/);
    expect(r9.dependencies.join(' ')).toMatch(/Validação da área responsável/);
  });
  it('necessária sem motivo pede o motivo', () => {
    const p = demoProcess();
    p.activities.find((a) => a.id === 'B1')!.leanReason = undefined;
    const r = recommend(p).find((x) => x.id === 'R9:B1')!;
    expect(r.caution).toBeUndefined();
    expect(r.missingInfo.join(' ')).toMatch(/Motivo de a atividade ser necessária/);
  });
  it('dados ausentes refletem o que falta de fato', () => {
    const p = demoProcess();
    const a = p.activities.find((x) => x.id === 'C3')!;
    a.frequencyPct = undefined;
    const r = recommend(p).find((x) => x.id === 'R2:C3')!;
    expect(r.missingInfo.join(' ')).toMatch(/Frequência do retrabalho/);
  });
});

describe('casos conservador / base / otimista', () => {
  const w = demoWorkspace(new Date('2026-01-01T12:00:00Z'));
  const b = compareScenarios(w.asIs, w.scenarios[0]).business;
  const [cons, base, opt] = businessCases(b, DEFAULT_SENSITIVITY);
  it('caso base reproduz o business case', () => {
    expect(base.netBenefitMonth).toBeCloseTo(b.netBenefitMonth!, 6);
    expect(base.paybackMonths).toBeCloseTo(b.paybackMonths!, 6);
  });
  it('aplica realização e fator de investimento de forma transparente', () => {
    expect(cons.grossBenefitMonth).toBeCloseTo(b.grossBenefitMonth! * 0.5, 6);
    expect(cons.netBenefitMonth).toBeCloseTo(b.grossBenefitMonth! * 0.5 - b.recurringCostPerMonth!, 6);
    expect(cons.investment).toBeCloseTo(b.investment! * 1.3, 6);
    expect(opt.freedHoursMonth).toBeCloseTo(b.freedHoursMonth! * 1.1, 6);
    expect(cons.paybackMonths!).toBeGreaterThan(base.paybackMonths!);
    expect(opt.paybackMonths!).toBeLessThan(base.paybackMonths!);
  });
  it('sem benefício líquido positivo não há payback', () => {
    const [c] = businessCases({ ...b, recurringCostPerMonth: b.grossBenefitMonth! }, { conservative: { realizationPct: 50, investmentPct: 100 }, optimistic: { realizationPct: 100, investmentPct: 100 } });
    expect(c.netBenefitMonth!).toBeLessThan(0);
    expect(c.paybackMonths).toBeNull();
    expect(c.roiPct).toBeNull();
    expect(c.reason).toMatch(/sem payback/);
  });
});

describe('responsabilidades alteradas', () => {
  const w = demoWorkspace();
  const sc = w.scenarios[0];
  it('detecta a transferência de responsável', () => {
    expect(responsibilityChanges(w.asIs, sc.process)).toEqual([{ activityId: 'E2', activity: 'Agendar transporte', kind: 'transferida', from: 'Analista de logística', to: 'Faturista' }]);
  });
  it('carga mensal sai de um responsável e vai para outro', () => {
    const cmp = compareScenarios(w.asIs, sc);
    const loads = roleLoads(cmp.asIs, cmp.toBe);
    const log = loads.find((l) => l.role === 'Analista de logística')!;
    const fat = loads.find((l) => l.role === 'Faturista')!;
    expect(log.toBeMonthH).toBe(0);
    expect(log.diffMonthH).toBeCloseTo(-200, 6); // 10 min × 1 pessoa × 1.200 pedidos
    expect(fat.diffMonthH).toBeCloseTo(200, 6);
  });
  it('atividade nova e removida aparecem', () => {
    const toBe = structuredClone(sc.process);
    toBe.activities = toBe.activities.filter((a) => a.id !== 'C2');
    toBe.activities.push({ ...toBe.activities.find((a) => a.id === 'C4')!, id: 'N1', name: 'Nova checagem', owner: undefined });
    const ch = responsibilityChanges(w.asIs, toBe);
    expect(ch).toContainEqual({ activityId: 'C2', activity: 'Conferir itens separados', kind: 'removida', from: 'Conferente' });
    expect(ch).toContainEqual({ activityId: 'N1', activity: 'Nova checagem', kind: 'nova', to: undefined });
  });
});

describe('plano de ação', () => {
  const base: ActionItem = { id: 'a', description: 'x', priority: 'media', status: 'a_fazer', createdAt: '2026-01-01' };
  it('não conclui sem resultado observado e data', () => {
    expect(completionIssue(base)).toBeNull();
    expect(completionIssue({ ...base, status: 'concluida' })).toMatch(/resultado observado/);
    expect(completionIssue({ ...base, status: 'concluida', observedResult: '  ' })).toMatch(/resultado observado/);
    expect(completionIssue({ ...base, status: 'concluida', observedResult: 'Fila caiu para 2 h', completedAt: undefined })).toMatch(/data/);
    expect(completionIssue({ ...base, status: 'concluida', observedResult: 'Fila caiu para 2 h', completedAt: '2026-02-01' })).toBeNull();
  });
});

describe('demonstração coerente', () => {
  const w = demoWorkspace(new Date('2026-01-01T12:00:00Z'));
  const recs = recommend(w.asIs);
  it('recomendações aceitas existem e originam as mudanças do TO-BE', () => {
    const accepted = Object.keys(w.recDecisions);
    for (const id of accepted) expect(recs.some((r) => r.id === id), id).toBe(true);
    const linked = w.scenarios[0].changes.filter((c) => c.recId).map((c) => c.recId);
    expect(linked.sort()).toEqual(accepted.sort());
  });
  it('cada ação vem de uma mudança, com problema, responsável e prazo — nenhuma concluída', () => {
    const ids = new Set(w.scenarios[0].changes.map((c) => c.id));
    expect(w.actions).toHaveLength(4);
    for (const a of w.actions) {
      expect(ids.has(a.origin!.ref!)).toBe(true);
      expect(relatedProblemOf(a, w)).toBeTruthy();
      expect(a.owner && a.due).toBeTruthy();
      expect(a.status).not.toBe('concluida');
    }
    expect(w.results).toEqual([]);
  });
});

describe('plano a partir das oportunidades', () => {
  it('a ação nasce sem responsável e sem prazo, ligada à oportunidade', () => {
    const [r] = recommend(demoProcess());
    expect(r.owner).toBeTruthy(); // a oportunidade conhece o dono da atividade…
    const a = actionFromRecommendation(r);
    expect(a.owner).toBeUndefined(); // …mas o responsável da ação é decisão da equipe
    expect(a.due).toBeUndefined();
    expect(a).toMatchObject({ status: 'a_fazer', origin: { kind: 'recommendation', ref: r.id } });
    expect(actionFromRecommendation(r, '  Ação editada ').description).toBe('Ação editada');
  });

  it('candidatas: sem as rejeitadas e sem as que já viraram ação', () => {
    const w = demoWorkspace();
    const recs = recommend(w.asIs);
    w.actions = [actionFromRecommendation(recs[0])];
    w.recDecisions = { [recs[1].id]: { status: 'rejected', decidedAt: '2026-01-01T00:00:00Z' } };
    const ids = planCandidates(recs, w).map((r) => r.id);
    expect(ids).not.toContain(recs[0].id);
    expect(ids).not.toContain(recs[1].id);
    expect(ids).toHaveLength(recs.length - 2);
  });
});
