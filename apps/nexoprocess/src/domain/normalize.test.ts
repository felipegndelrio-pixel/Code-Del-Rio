import { describe, expect, it } from 'vitest';
import { normalizeWorkspace } from './factory';
import { computeMetrics } from './metrics';
import { compareScenarios } from './compare';
import { demoWorkspace } from './demo';

const minimal = {
  id: 'w_parcial',
  asIs: { name: 'Backup parcial', volumePeriod: 'mes', hoursPerDay: 8, costPerHourByRole: {}, stageOrder: [], activities: [] },
  scenarios: [],
};

describe('normalização de projeto lido de backup', () => {
  it('um backup mínimo ganha todos os campos que as telas usam', () => {
    const w = normalizeWorkspace(minimal);
    expect(w.actions).toEqual([]);
    expect(w.results).toEqual([]);
    expect(w.risks).toEqual([]);
    expect(w.recDecisions).toEqual({});
    expect(w.bottleneck).toEqual({ criterion: 'duration', thresholdPct: 15 });
    expect(w.raci.roles).toEqual([]);
    expect(w.history).toEqual([]);
    expect(w.asIsBaseline.activities).toEqual([]);
    // As telas conseguem calcular métricas sobre o resultado normalizado.
    expect(() => computeMetrics(w.asIs)).not.toThrow();
  });

  it('cenário sem processo recebe uma cópia do AS-IS e horizonte padrão', () => {
    const w = normalizeWorkspace({ ...minimal, scenarios: [{ id: 's1', name: 'TO-BE' }] });
    expect(w.scenarios[0].process.activities).toEqual([]);
    expect(w.scenarios[0].changes).toEqual([]);
    expect(w.scenarios[0].horizonMonths).toBe(12);
    expect(w.activeScenarioId).toBe('s1');
    expect(() => compareScenarios(w.asIs, w.scenarios[0])).not.toThrow();
  });

  it('atividades sem id ou nome são descartadas, sem derrubar o restante', () => {
    const w = normalizeWorkspace({ ...minimal, asIs: { ...minimal.asIs, activities: [null, { id: 'A1' }, { id: 'A2', name: 'Conferir', next: 'A3' }] } });
    expect(w.asIs.activities.map((a) => a.id)).toEqual(['A2']);
    expect(w.asIs.activities[0].next).toEqual([]);
  });

  it('sem identificador ou sem processo AS-IS, falha com mensagem clara', () => {
    expect(() => normalizeWorkspace({ asIs: minimal.asIs })).toThrow(/identificador/);
    expect(() => normalizeWorkspace({ id: 'x' })).toThrow(/AS-IS/);
  });

  it('um projeto completo da própria aplicação sai inalterado nos dados principais', () => {
    const original = demoWorkspace(new Date('2026-01-01T12:00:00Z'));
    const again = normalizeWorkspace(JSON.parse(JSON.stringify(original)));
    expect(again.id).toBe(original.id);
    expect(again.asIs).toEqual(original.asIs);
    expect(again.scenarios).toEqual(original.scenarios);
    expect(again.actions).toEqual(original.actions);
    expect(again.recDecisions).toEqual(original.recDecisions);
  });
});
