import { describe, expect, it } from 'vitest';
import { automationScore, fmeaPriority, raciIssues, riskScore, rpn, simulate, simulationReadiness, suggestRaci, triangular } from './advanced';
import { demoProcess } from './demo';
import { newActivity, newProcess, newScenario, newWorkspace } from './factory';
import { journey } from './journey';
import { computeMetrics } from './metrics';
import { recommend } from './recommendations';
import { addActivity, combineActivities, removeActivity, restoreFromAsIs, updateActivity } from './tobe';
import { validateProcess } from './validation';

describe('recomendações por regras', () => {
  const p = demoProcess();
  const recs = recommend(p, 'duration', 15);
  it('todas têm evidência, regra, hipótese e ação', () => {
    expect(recs.length).toBeGreaterThan(3);
    for (const r of recs) {
      expect(r.evidence.length).toBeGreaterThan(0);
      expect(r.rule).toMatch(/^Regra R\d/);
      expect(r.hypothesis.length).toBeGreaterThan(10);
      expect(r.action.length).toBeGreaterThan(10);
    }
  });
  it('retrabalho com frequência vai para "Resolver primeiro"', () => {
    const r = recs.find((x) => x.id === 'R2:A3')!;
    expect(r.group).toBe('resolver');
    expect(r.evidence.some((e) => e.kind === 'fato' && /20%/.test(e.text))).toBe(true);
  });
  it('espera maior que trabalho gera recomendação de espera', () => {
    expect(recs.some((r) => r.id === 'R4:B2')).toBe(true);
  });
  it('responsável sugerido só quando informado', () => {
    for (const r of recs) if (r.activityId && !p.activities.find((a) => a.id === r.activityId)!.owner) expect(r.owner).toBeUndefined();
  });
  it('não sugere economia em percentual genérico', () => {
    for (const r of recs) expect(`${r.ceiling ?? ''} ${r.action}`).not.toMatch(/reduz(ir)? \d+%/);
  });
  it('sem dados de Lean/duração, recomenda completar dados', () => {
    const q = newProcess('x');
    q.activities = [newActivity({ id: 'A1', stage: 'E', name: 'Fazer', order: 1 })];
    q.stageOrder = ['E'];
    const r = recommend(q);
    expect(r.map((x) => x.id)).toEqual(expect.arrayContaining(['R6:lean', 'R7:owner']));
  });
});

describe('TO-BE preserva o AS-IS e registra mudanças', () => {
  it('remover religa o fluxo e registra histórico', () => {
    const asIs = demoProcess();
    const sc = newScenario(asIs, 'Futuro');
    const after = removeActivity(sc, 'E2', { justification: 'Transporte agendado automaticamente', hypothesis: 'Integração com transportadora' });
    expect(after.process.activities.find((a) => a.id === 'E1')!.next).toEqual(['E3']);
    expect(after.changes).toHaveLength(1);
    expect(after.changes[0].kind).toBe('remove');
    expect(validateProcess(after.process).filter((i) => i.severity === 'error')).toEqual([]);
    expect(asIs.activities.find((a) => a.id === 'E2')).toBeTruthy();
    expect(sc.process.activities.find((a) => a.id === 'E2')).toBeTruthy();
  });
  it('atualizar registra antes/depois; sem mudança não gera registro', () => {
    const sc = newScenario(demoProcess(), 'F');
    const s2 = updateActivity(sc, 'B2', { wait: 120 }, 'reduce_wait', { hypothesis: 'SLA de 2h' })!;
    expect(s2.changes[0].before).toEqual({ wait: 480 });
    expect(s2.changes[0].after).toEqual({ wait: 120 });
    expect(updateActivity(s2, 'B2', { wait: 120 }, 'edit', {})).toBeNull();
  });
  it('marcar como automatizável não reduz tempo sozinho', () => {
    const sc = newScenario(demoProcess(), 'F');
    const s2 = updateActivity(sc, 'A1', { notes: 'candidata a automação' }, 'automate', {})!;
    expect(computeMetrics(s2.process).effortPeriodH.value).toBeCloseTo(computeMetrics(sc.process).effortPeriodH.value!, 9);
  });
  it('combinar, adicionar e restaurar', () => {
    const asIs = demoProcess();
    let sc = newScenario(asIs, 'F');
    sc = combineActivities(sc, 'E1', 'E2', { name: 'Faturar e agendar transporte', duration: 12 }, {});
    expect(sc.process.activities.some((a) => a.id === 'E2')).toBe(false);
    expect(sc.process.activities.find((a) => a.id === 'E1')!.next).toEqual(['E3']);
    sc = addActivity(sc, newActivity({ id: 'N1', stage: 'Expedição', name: 'Enviar rastreio', duration: 1, people: 1 }), 'E3', {});
    expect(sc.process.activities.find((a) => a.id === 'E3')!.next).toEqual(['N1']);
    expect(sc.process.activities.find((a) => a.id === 'N1')!.next).toEqual(['F1']);
    const restored = restoreFromAsIs(sc, asIs.activities, 'E1', {})!;
    expect(restored.process.activities.find((a) => a.id === 'E1')!.name).toBe('Emitir nota fiscal');
    expect(restored.changes.map((c) => c.kind)).toEqual(['combine', 'add', 'restore']);
  });
  it('decisões não podem ser removidas automaticamente', () => {
    expect(() => removeActivity(newScenario(demoProcess(), 'F'), 'D1', {})).toThrow(/Decisões/);
  });
});

describe('simulação de incerteza', () => {
  it('triangular respeita limites e moda', () => {
    expect(triangular(0, 1, 2, 4)).toBe(1);
    expect(triangular(1, 1, 2, 4)).toBe(4);
    expect(triangular(1 / 3, 1, 2, 4)).toBeCloseTo(2, 9);
  });
  it('1.500 iterações reproduzíveis com P10 ≤ P50 ≤ P90 dentro dos limites', () => {
    const p = demoProcess();
    expect(simulationReadiness(p).ready).toBe(true);
    const a = simulate(p, 1500, 42);
    const b = simulate(p, 1500, 42);
    expect(a).toEqual(b);
    expect(a.iterations).toBe(1500);
    expect(a.elapsed.p10).toBeLessThanOrEqual(a.elapsed.p50);
    expect(a.elapsed.p50).toBeLessThanOrEqual(a.elapsed.p90);
    expect(a.histogram.reduce((s, h) => s + h.count, 0)).toBe(1500);
    // O mínimo simulado nunca fica abaixo da soma dos mínimos do caminho
    expect(a.elapsed.min).toBeGreaterThan(0);
  });
  it('sem mínimo/máximo não simula nem inventa', () => {
    const p = demoProcess();
    delete p.activities[1].minDuration;
    const r = simulationReadiness(p);
    expect(r.ready).toBe(false);
    expect(r.missing[0].id).toBe('A1');
    expect(() => simulate(p)).toThrow();
  });
});

describe('RACI, riscos e automação', () => {
  it('RACI sugere apenas R e nunca A', () => {
    const p = demoProcess();
    const r = suggestRaci(p, { roles: [], cells: {}, suggested: {} });
    const all = Object.values(r.cells).flatMap((c) => Object.values(c));
    expect(all.every((x) => x === 'R')).toBe(true);
    expect(raciIssues(p, r).some((i) => /presta contas/.test(i.issue))).toBe(true);
  });
  it('pontuações só com entrada completa', () => {
    expect(riskScore({ id: '1', description: 'x', status: 'aberto', probability: 4 })).toBeNull();
    expect(riskScore({ id: '1', description: 'x', status: 'aberto', probability: 4, impact: 4 })).toBe(16);
    expect(rpn({ id: '1', description: 'x', status: 'aberto', severity: 9, occurrence: 2 })).toBeNull();
    expect(fmeaPriority({ id: '1', description: 'x', status: 'aberto', severity: 9, occurrence: 2, detection: 2 })).toBe('alta');
    expect(fmeaPriority({ id: '1', description: 'x', status: 'aberto', severity: 4, occurrence: 4, detection: 4 })).toBe('normal');
  });
  it('índice de automação inverte critérios desfavoráveis e exige 4 respostas', () => {
    expect(automationScore({ answers: { repetitividade: 5, regras: 5 } }).score).toBeNull();
    expect(automationScore({ answers: { repetitividade: 5, regras: 5, dados: 5, excecoes: 1 } }).score).toBe(100);
    expect(automationScore({ answers: { repetitividade: 1, regras: 1, dados: 1, excecoes: 5, julgamento: 5, risco_erro: 5 } }).score).toBe(0);
  });
});

describe('jornada', () => {
  it('avança conforme os dados e bloqueia com erros', () => {
    const w = newWorkspace(demoProcess(), { kind: 'demo' }, true);
    let j = journey(w);
    expect(j.steps.find((s) => s.key === 'validar')!.state).not.toBe('bloqueado');
    w.validationAcceptedAt = new Date().toISOString();
    w.visited.map = 'x';
    j = journey(w);
    expect(j.next!.key).toBe('diagnostico');
    w.asIs.activities[1].next = ['NAO_EXISTE'];
    j = journey(w);
    expect(j.blocked).toBe(true);
    expect(j.steps.find((s) => s.key === 'plano')!.state).toBe('bloqueado');
  });
});
