import { describe, expect, it } from 'vitest';
import { demoProcess } from '../domain/demo';
import { processToCsv } from './workbook';

describe('exportação CSV segura contra injeção de fórmulas', () => {
  it('texto iniciado por = + - @ recebe apóstrofo e não vira fórmula no Excel', () => {
    const p = demoProcess();
    p.activities[1].name = '=HYPERLINK("http://exemplo.invalido";"clique")';
    p.activities[1].owner = '@Gestor';
    const csv = processToCsv(p);
    expect(csv).toContain(`'=HYPERLINK(""http://exemplo.invalido"";""clique"")`);
    expect(csv).toContain(`'@Gestor`);
    // Nenhuma célula começa com fórmula, com ou sem aspas de CSV.
    expect(csv).not.toMatch(/(^|;|\n)"?[=+@]/);
  });

  it('números negativos e valores comuns continuam sem apóstrofo', () => {
    const p = demoProcess();
    p.activities[1].duration = -5;
    const csv = processToCsv(p);
    expect(csv).toContain('-5');
    expect(csv).not.toContain("'-5");
    expect(csv).toContain('Consultar limite de crédito');
  });
});
