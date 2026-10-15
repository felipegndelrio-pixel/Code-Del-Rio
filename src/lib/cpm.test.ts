import { describe, expect, it } from 'vitest';
import { criticalPath } from './cpm';
import type { WbsDependency, WbsItem } from './types';

const w = (id: string, s: string | null, e: string | null): WbsItem => ({ id, code: id.toUpperCase(), parent_id: null, planned_start: s, planned_end: e }) as WbsItem;
const d = (p: string, s: string): WbsDependency => ({ project_id: 'p', predecessor_id: p, successor_id: s, lag_days: 0 });

describe('Caminho crítico', () => {
  it('identifica o caminho mais longo', () => {
    const items = [w('a', '2026-01-01', '2026-01-05'), w('b', '2026-01-06', '2026-01-15'), w('c', '2026-01-06', '2026-01-07'), w('d', '2026-01-16', '2026-01-20')];
    const r = criticalPath(items, [d('a', 'b'), d('a', 'c'), d('b', 'd'), d('c', 'd')]);
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.criticalPath).toEqual(['a', 'b', 'd']);
      expect(r.projectDuration).toBe(20);
      expect(r.nodes.c.slack).toBe(8);
    }
  });
  it('não calcula sem datas', () => {
    const r = criticalPath([w('a', null, null), w('b', '2026-01-01', '2026-01-02')], [d('a', 'b')]);
    expect(r.ok).toBe(false);
  });
  it('não calcula sem dependências', () => {
    expect(criticalPath([w('a', '2026-01-01', '2026-01-02')], []).ok).toBe(false);
  });
  it('detecta ciclo', () => {
    const r = criticalPath([w('a', '2026-01-01', '2026-01-02'), w('b', '2026-01-01', '2026-01-02')], [d('a', 'b'), d('b', 'a')]);
    expect(r).toMatchObject({ ok: false, reason: expect.stringMatching(/circular/) });
  });
});
