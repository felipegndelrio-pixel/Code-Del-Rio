// Prova de que o PT mostra exatamente os mesmos textos de antes da migração.
// golden/nav-pt.json foi gerado de src/config/nav.ts na tag v2.5.0-rc1, ANTES de o
// arquivo passar a ler o dicionário. Não regenere o golden para fazer o teste passar.
import { describe, expect, it } from 'vitest';
import { MOBILE_TABS, NAV, STEP_PATH } from '../config/nav';
import golden from './golden/nav-pt.json';

const snapshot = (nav: typeof NAV) =>
  nav.map((g) => ({ label: g.label, items: g.items.map((i) => ({ path: i.path, label: i.label, short: i.short, objective: i.objective, step: i.step ?? null })) }));

describe('PT igual ao golden da v2.5.0-rc1', () => {
  it('navegação: grupos, rótulos, nomes curtos, objetivos, ordem e rotas', () => {
    expect(snapshot(NAV)).toEqual(golden.nav);
  });
  it('abas do celular e rotas das etapas', () => {
    expect(MOBILE_TABS).toEqual(golden.mobileTabs);
    expect(STEP_PATH).toEqual(golden.stepPath);
  });
});
