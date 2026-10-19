import { describe, expect, it } from 'vitest';
import { compareScenarios, figures } from './compare';
import { demoProcess } from './demo';
import { newActivity, newProcess, newScenario } from './factory';
import { buildGraph } from './graph';
import { bottlenecks, computeMetrics, dataGaps, pareto } from './metrics';
import type { Activity, ProcessModel } from './types';
import { fmtHours, parseLocaleNumber, periodToMonthFactor, reductionPct, safeDiv, toHours } from './units';
import { validateProcess } from './validation';

function proc(acts: Partial<Activity>[], extra: Partial<ProcessModel> = {}): ProcessModel {
  const p = { ...newProcess('Teste'), ...extra };
  p.activities = acts.map((a, i) => newActivity({ id: `A${i + 1}`, stage: 'E1', name: `Atividade ${i + 1}`, order: i + 1, ...a }));
  p.stageOrder = [...new Set(p.activities.map((a) => a.stage))];
  return p;
}

describe('unidades', () => {
  it('converte minutos, horas e dias (com premissa de horas/dia)', () => {
    expect(toHours(90, 'min', 8)).toBe(1.5);
    expect(toHours(2, 'h', 8)).toBe(2);
    expect(toHours(1.5, 'd', 8)).toBe(12);
    expect(toHours(1, 'd', 6)).toBe(6);
  });
  it('divisão e redução percentual seguras', () => {
    expect(safeDiv(1, 0)).toBeNull();
    expect(safeDiv(null, 2)).toBeNull();
    expect(reductionPct(0, 10)).toBeNull();
    expect(reductionPct(100, 75)).toBe(25);
    expect(reductionPct(100, 120)).toBe(-20);
  });
  it('conversão de período para mês exige premissa para volume diário', () => {
    expect(periodToMonthFactor({ volumePeriod: 'mes' })).toBe(1);
    expect(periodToMonthFactor({ volumePeriod: 'ano' })).toBeCloseTo(1 / 12);
    expect(periodToMonthFactor({ volumePeriod: 'semana' })).toBeCloseTo(52 / 12);
    expect(periodToMonthFactor({ volumePeriod: 'dia' })).toBeNull();
    expect(periodToMonthFactor({ volumePeriod: 'dia', operatingDaysPerMonth: 22 })).toBe(22);
  });
  it('lê números em formato brasileiro e internacional', () => {
    expect(parseLocaleNumber('1.234,5')).toBe(1234.5);
    expect(parseLocaleNumber('1,234.5')).toBe(1234.5);
    expect(parseLocaleNumber('30')).toBe(30);
    expect(parseLocaleNumber('R$ 60,00')).toBe(60);
    expect(parseLocaleNumber('')).toBeUndefined();
    expect(parseLocaleNumber('abc')).toBeNaN();
  });
  it('formata horas sem precisão excessiva', () => {
    expect(fmtHours(0.5)).toBe('30 min');
    expect(fmtHours(2.5)).toBe('2 h 30 min');
    expect(fmtHours(null)).toBe('—');
  });
});

describe('esforço, custo e valores ausentes', () => {
  it('esforço = duração em horas × pessoas; sem pessoas não calcula', () => {
    const p = proc([{ duration: 30, people: 2 }, { duration: 60 }]);
    const m = computeMetrics(p);
    expect(m.per.get('A1')!.effortH).toBe(1);
    expect(m.per.get('A2')!.effortH).toBeNull();
    expect(m.effortExecH.value).toBe(1);
    expect(m.effortExecH.coverage.missing).toEqual(['A2']);
  });
  it('sem custo-hora o custo não é inventado', () => {
    const p = proc([{ duration: 30, people: 1 }], { volume: 1000 });
    const m = computeMetrics(p);
    expect(m.effortPeriodH.value).toBe(500);
    expect(m.laborCostPeriod.value).toBeNull();
    expect(m.totalCostPeriod.value).toBeNull();
    expect(m.totalCostPeriod.reason).toMatch(/custo-hora/);
  });
  it('sem volume não calcula esforço/custo por período', () => {
    const p = proc([{ duration: 30, people: 1 }], { defaultCostPerHour: 60 });
    const m = computeMetrics(p);
    expect(m.effortPeriodH.value).toBeNull();
    expect(m.effortPeriodH.reason).toMatch(/volume/);
    expect(m.totalCostPeriod.value).toBeNull();
  });
  it('soma de durações vazia é null, não zero', () => {
    const p = proc([{}, {}]);
    const m = computeMetrics(p);
    expect(m.activeSumH.value).toBeNull();
    expect(m.lean.pct.VA).toBeNull();
  });
  it('custo-hora: atividade > função > padrão', () => {
    const p = proc([{ duration: 60, people: 1, owner: 'X', costPerHour: 100 }, { duration: 60, people: 1, owner: 'X' }, { duration: 60, people: 1, owner: 'Y' }], {
      volume: 10,
      defaultCostPerHour: 20,
      costPerHourByRole: { X: 50 },
    });
    const m = computeMetrics(p);
    expect(m.per.get('A1')!.costPerHour).toBe(100);
    expect(m.per.get('A2')!.costPerHour).toBe(50);
    expect(m.per.get('A3')!.costPerHour).toBe(20);
    expect(m.laborCostPeriod.value).toBe(10 * (100 + 50 + 20));
  });
  it('evita dupla contagem quando o custo variável já inclui mão de obra', () => {
    const base = { volume: 100, defaultCostPerHour: 60 };
    const acts = [{ duration: 60, people: 1, variableCost: 80 }];
    const sum = computeMetrics(proc(acts, base));
    expect(sum.totalCostPeriod.value).toBe(100 * 60 + 100 * 80);
    const overlap = computeMetrics(proc(acts, { ...base, variableCostIncludesLabor: true }));
    expect(overlap.totalCostPeriod.value).toBe(100 * 80);
    expect(overlap.totalCostPeriod.overlapNote).toMatch(/dupla contagem/);
  });
  it('frequência pondera esforço por execução e por período', () => {
    const p = proc([{ duration: 60, people: 1 }, { duration: 60, people: 1, frequencyPct: 25 }], { volume: 100 });
    const m = computeMetrics(p);
    expect(m.effortExecH.value).toBe(1.25);
    expect(m.effortPeriodH.value).toBe(125);
  });
});

describe('Lean, tempo agregado e tempo decorrido', () => {
  it('distribuição Lean tem base em duração e separa não classificadas', () => {
    const p = proc([
      { duration: 30, lean: 'VA' },
      { duration: 60, lean: 'W' },
      { duration: 30, lean: 'NNVA' },
      { duration: 100 },
    ]);
    const m = computeMetrics(p);
    expect(m.lean.classifiedHours).toBe(2);
    expect(m.lean.pct.W).toBe(50);
    expect(m.lean.pct.VA).toBe(25);
    expect(m.lean.hours.U).toBeCloseTo(100 / 60);
    expect(m.counts.unclassified).toBe(1);
  });
  it('sequência linear: tempo decorrido = soma ativo + esperas', () => {
    const p = proc([
      { duration: 30, wait: 30, next: ['A2'] },
      { duration: 60, next: [] },
    ]);
    const m = computeMetrics(p);
    expect(m.elapsed.status).toBe('ok');
    if (m.elapsed.status === 'ok') {
      expect(m.elapsed.hours).toBe(2);
      expect(m.elapsed.basis).toBe('sequencia_unica');
    }
  });
  it('decisão: tempo decorrido é o caminho mais longo, diferente da soma das durações', () => {
    const p = proc([
      { duration: 60, next: ['A2'] },
      { type: 'decision', nextYes: 'A3', nextNo: 'A4' },
      { duration: 60, next: ['A5'] },
      { duration: 240, next: ['A5'] },
      { duration: 30 },
    ]);
    const m = computeMetrics(p);
    expect(m.activeSumH.value).toBe(1 + 1 + 4 + 0.5);
    expect(m.elapsed.status).toBe('ok');
    if (m.elapsed.status === 'ok') {
      expect(m.elapsed.hours).toBe(5.5);
      expect(m.elapsed.basis).toBe('caminho_mais_longo');
      expect(m.elapsed.path).toEqual(['A1', 'A2', 'A4', 'A5']);
    }
  });
  it('paralelo: não soma ramos paralelos no tempo decorrido', () => {
    const p = proc([{ duration: 60, next: ['A2', 'A3'] }, { duration: 120, next: ['A4'] }, { duration: 60, next: ['A4'] }, { duration: 60 }]);
    const m = computeMetrics(p);
    expect(m.activeSumH.value).toBe(5);
    if (m.elapsed.status !== 'ok') throw new Error('esperado ok');
    expect(m.elapsed.hours).toBe(4);
  });
  it('retrabalho (ciclo) não entra no caminho mais longo e é detectado', () => {
    const p = demoProcess();
    const g = buildGraph(p);
    expect(g.backEdges.map((e) => `${e.from}->${e.to}`).sort()).toEqual(['A3->A2', 'C3->C2']);
    const m = computeMetrics(p);
    expect(m.elapsed.status).toBe('ok');
    expect(m.counts.loops).toBe(2);
  });
  it('não calcula tempo decorrido com atividade sem duração', () => {
    const p = proc([{ duration: 10, next: ['A2'] }, {}]);
    const m = computeMetrics(p);
    expect(m.elapsed.status).toBe('nao_calculado');
  });
  it('não calcula com ligação para atividade inexistente', () => {
    const p = proc([{ duration: 10, next: ['ZZ'] }]);
    expect(computeMetrics(p).elapsed.status).toBe('nao_calculado');
  });
});

describe('gargalos e Pareto', () => {
  it('ordena por contribuição e marca acima do limiar', () => {
    const p = proc([{ duration: 10 }, { duration: 70 }, { duration: 20 }]);
    const m = computeMetrics(p);
    const pr = pareto(p, m, 'duration');
    expect(pr.items.map((i) => i.id)).toEqual(['A2', 'A3', 'A1']);
    expect(pr.items[0].share).toBeCloseTo(70);
    expect(pr.items[2].cumulative).toBeCloseTo(100);
    const b = bottlenecks(p, m, 'duration', 25);
    expect(b.flagged.map((x) => x.id)).toEqual(['A2']);
  });
  it('critério sem dados retorna motivo em vez de zero', () => {
    const p = proc([{ duration: 10 }]);
    const m = computeMetrics(p);
    const pr = pareto(p, m, 'cost');
    expect(pr.total).toBeNull();
    expect(pr.reason).toMatch(/custo-hora/);
  });
  it('lacunas de dados indicam o que destravar', () => {
    const p = proc([{ duration: 10 }]);
    const gaps = dataGaps(p, computeMetrics(p));
    expect(gaps.map((g) => g.field)).toEqual(expect.arrayContaining(['quantidade_pessoas', 'volume', 'custo_hora']));
  });
});

describe('validação', () => {
  it('detecta duplicados, referências inexistentes, valores inválidos e decisões sem caminho', () => {
    const p = proc([{ duration: -5, next: ['X9'] }, { id: 'A1', type: 'decision' } as Partial<Activity>, { frequencyPct: 150 }]);
    const codes = validateProcess(p).map((i) => i.code);
    expect(codes).toEqual(expect.arrayContaining(['duplicate_id', 'dangling', 'invalid_duration', 'invalid_frequency']));
  });
  it('sugere correção (sem aplicar) para ligação inexistente', () => {
    const p = proc([{ duration: 5, next: ['X9'] }]);
    const issue = validateProcess(p).find((i) => i.code === 'dangling')!;
    expect(p.activities[0].next).toEqual(['X9']);
    const fixed = issue.autofix!.apply(p);
    expect(fixed.activities[0].next).toEqual([]);
    expect(p.activities[0].next).toEqual(['X9']);
  });
  it('o exemplo demonstrativo não tem erros', () => {
    expect(validateProcess(demoProcess()).filter((i) => i.severity === 'error')).toEqual([]);
  });
});

describe('business case AS-IS × TO-BE (cenário de referência)', () => {
  const asIs = proc([{ duration: 30, people: 1 }], { volume: 1000, defaultCostPerHour: 60 });
  it('1.000 exec/mês, 30 → 20 min, R$ 60/h', () => {
    const sc = newScenario(asIs, 'TO-BE');
    sc.process.activities[0].duration = 20;
    const c = compareScenarios(asIs, sc);
    expect(c.asIs.effortMonthH).toBe(500);
    expect(c.toBe.effortMonthH).toBeCloseTo(333.333, 2);
    expect(c.asIs.costMonth).toBe(30000);
    expect(c.toBe.costMonth).toBeCloseTo(20000, 6);
    expect(c.business.freedHoursMonth).toBeCloseTo(166.667, 2);
    expect(c.business.grossBenefitMonth).toBeCloseTo(10000, 6);
    // Sem custo recorrente informado não há benefício líquido nem payback.
    expect(c.business.netBenefitMonth).toBeNull();
    expect(c.business.paybackMonths).toBeNull();
    // O AS-IS não foi alterado.
    expect(asIs.activities[0].duration).toBe(30);
  });
  it('custo incremental, payback e ROI', () => {
    const sc = newScenario(asIs, 'TO-BE');
    sc.process.activities[0].duration = 20;
    sc.recurringCostPerMonth = 2000;
    sc.investment = 40000;
    sc.horizonMonths = 12;
    const b = compareScenarios(asIs, sc).business;
    expect(b.netBenefitMonth).toBeCloseTo(8000, 6);
    expect(b.paybackMonths).toBeCloseTo(5, 6);
    expect(b.roiPct).toBeCloseTo(140, 6);
  });
  it('benefício líquido não positivo não gera payback', () => {
    const sc = newScenario(asIs, 'TO-BE');
    sc.process.activities[0].duration = 29;
    sc.recurringCostPerMonth = 5000;
    sc.investment = 1000;
    const b = compareScenarios(asIs, sc).business;
    expect(b.netBenefitMonth! < 0).toBe(true);
    expect(b.paybackMonths).toBeNull();
    expect(b.reasons.payback).toMatch(/não é positivo/);
  });
  it('investimento zero: payback imediato e ROI não aplicável', () => {
    const sc = newScenario(asIs, 'TO-BE');
    sc.process.activities[0].duration = 20;
    sc.recurringCostPerMonth = 0;
    sc.investment = 0;
    const b = compareScenarios(asIs, sc).business;
    expect(b.paybackMonths).toBe(0);
    expect(b.roiPct).toBeNull();
  });
  it('sem custo-hora: horas liberadas existem, benefício financeiro não', () => {
    const noCost = proc([{ duration: 30, people: 1 }], { volume: 1000 });
    const sc = newScenario(noCost, 'TO-BE');
    sc.process.activities[0].duration = 20;
    const b = compareScenarios(noCost, sc).business;
    expect(b.freedHoursMonth).toBeCloseTo(166.667, 2);
    expect(b.grossBenefitMonth).toBeNull();
  });
  it('volumes diferentes: compara normalizando pelo volume do AS-IS', () => {
    const sc = newScenario(asIs, 'TO-BE');
    sc.process.activities[0].duration = 20;
    sc.process.volume = 2000;
    const c = compareScenarios(asIs, sc);
    expect(c.business.volumeDiffers).toBe(true);
    expect(c.toBe.effortMonthH).toBeCloseTo(666.667, 2);
    expect(c.rows.find((r) => r.key === 'effortMonth')!.toBe).toBeCloseTo(333.333, 2);
    expect(c.business.grossBenefitMonth).toBeCloseTo(10000, 6);
  });
  it('volume vazio no TO-BE herda o volume do AS-IS', () => {
    const sc = newScenario(asIs, 'TO-BE');
    sc.process.activities[0].duration = 20;
    sc.process.volume = undefined;
    expect(compareScenarios(asIs, sc).business.freedHoursMonth).toBeCloseTo(166.667, 2);
  });
  it('períodos diferentes (semana × mês) são convertidos para mês', () => {
    const weekly = proc([{ duration: 60, people: 1 }], { volume: 12, volumePeriod: 'semana' });
    expect(figures(weekly).effortMonthH).toBeCloseTo(52, 6);
  });
  it('editar o TO-BE não altera o AS-IS (cópia independente)', () => {
    const p = demoProcess();
    const sc = newScenario(p, 'Futuro');
    sc.process.activities[1].duration = 1;
    sc.process.activities.pop();
    expect(p.activities[1].duration).toBe(10);
    expect(p.activities.length).toBe(19);
  });
});

describe('decisões não distorcem a cobertura', () => {
  it('decisão sem duração não conta como dado faltante', () => {
    const p = proc([{ duration: 10, people: 1, next: ['A2'] }, { type: 'decision', nextYes: 'A3', nextNo: 'A3' }, { duration: 5, people: 1, lean: 'VA' }]);
    const m = computeMetrics(p);
    expect(m.activeSumH.coverage).toMatchObject({ used: 2, total: 2 });
    expect(m.effortExecH.coverage.missing).toEqual([]);
    expect(m.counts.unclassified).toBe(1);
  });
  it('ciclo de retrabalho que passa por decisão não gera alerta de laço infinito', () => {
    expect(validateProcess(demoProcess()).filter((i) => i.severity !== 'info')).toEqual([]);
    const loop = proc([{ duration: 1, next: ['A2'] }, { duration: 1, next: ['A1'] }]);
    expect(validateProcess(loop).some((i) => i.code === 'loop_no_decision')).toBe(true);
  });
});
