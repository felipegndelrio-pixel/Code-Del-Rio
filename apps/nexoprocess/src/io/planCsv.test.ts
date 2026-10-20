import { describe, expect, it } from 'vitest';
import { demoWorkspace } from '../domain/demo';
import { fmtDate } from '../domain/units';
import { actionsToCsv, parseDue, parsePlanCsv } from './planCsv';

describe('plano de ação ⇄ CSV', () => {
  it('lê colunas simples (Ação; Responsável; Prazo) e deixa pendente o que não veio', () => {
    const r = parsePlanCsv('Ação;Responsável;Prazo\nTreinar equipe;Ana;15/11/2026\nRevisar checklist;;\n');
    expect(r.actions).toHaveLength(2);
    expect(r.actions[0]).toMatchObject({ description: 'Treinar equipe', owner: 'Ana', due: '2026-11-15', status: 'a_fazer', priority: 'media' });
    expect(r.actions[1].owner).toBeUndefined(); // nunca preenchido automaticamente
    expect(r.actions[1].due).toBeUndefined();
    expect(r.missingOwner).toBe(1);
    expect(r.missingDue).toBe(1);
  });

  it('aceita vírgula, cabeçalhos sem acento e datas ISO', () => {
    const r = parsePlanCsv('acao,responsavel,prazo,prioridade\n"Comprar, instalar",Rui,2026-12-01,alta\n');
    expect(r.actions[0]).toMatchObject({ description: 'Comprar, instalar', owner: 'Rui', due: '2026-12-01', priority: 'alta' });
  });

  it('data inválida não vira data: fica pendente e gera aviso', () => {
    const r = parsePlanCsv('Ação;Prazo\nA;31/02/2026\nB;amanhã\n');
    expect(r.actions.map((a) => a.due)).toEqual([undefined, undefined]);
    expect(r.notes.join(' ')).toMatch(/Linha 2: prazo “31\/02\/2026”/);
  });

  it('“Concluída” sem resultado observado não é importada como concluída', () => {
    const r = parsePlanCsv('Ação;Situação\nA;Concluída\nB;Em andamento\n');
    expect(r.actions.map((a) => a.status)).toEqual(['a_fazer', 'em_andamento']);
    expect(r.notes[0]).toMatch(/exige o resultado observado/);
  });

  it('sem coluna Ação: erro explicando os cabeçalhos esperados', () => {
    expect(() => parsePlanCsv('Nome;Data\nx;y\n')).toThrow(/coluna “Ação”/);
  });

  it('exportação reimporta igual e é segura contra fórmulas', () => {
    const w = demoWorkspace();
    w.actions = [{ id: 'a1', description: '=HYPERLINK("x")', owner: '@Gestor', due: '2026-11-15', priority: 'alta', status: 'em_andamento', origin: { kind: 'manual' }, createdAt: '2026-10-01T00:00:00Z' }];
    const csv = actionsToCsv(w);
    expect(csv).not.toMatch(/(^|;|\n)"?[=+@]/);
    expect(csv).toContain('15/11/2026');
    const back = parsePlanCsv(csv).actions[0];
    expect(back).toMatchObject({ description: '=HYPERLINK("x")', owner: '@Gestor', due: '2026-11-15', priority: 'alta', status: 'em_andamento' });
  });

  it('parseDue aceita formatos comuns e rejeita datas impossíveis', () => {
    expect(parseDue('5/3/27')).toBe('2027-03-05');
    expect(parseDue('05-03-2027')).toBe('2027-03-05');
    expect(parseDue('2027-13-01')).toBeNull();
  });

  it('prazo exibido é o dia digitado (sem recuo de fuso)', () => {
    expect(fmtDate('2026-11-15')).toBe('15/11/2026');
  });
});
