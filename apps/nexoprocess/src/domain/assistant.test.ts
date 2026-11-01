import { afterEach, describe, expect, it } from 'vitest';
import { setActiveLocale } from '../i18n';
import { draftActivityFrom, draftToProcess, emptyDraft, parseActivityLine, parseList } from './assistant';
import { computeMetrics } from './metrics';
import { validateProcess } from './validation';

describe('interpretação de texto livre', () => {
  it('separa por linhas, numeração, setas e “depois”', () => {
    expect(parseList('1. Solicitar\n2) Aprovar\n- Comprar')).toEqual(['Solicitar', 'Aprovar', 'Comprar']);
    expect(parseList('solicitar → aprovar -> comprar; receber')).toEqual(['Solicitar', 'Aprovar', 'Comprar', 'Receber']);
    expect(parseList('A área pede o material, depois o gestor aprova e em seguida compras cota')).toEqual(['A área pede o material', 'O gestor aprova', 'Compras cota']);
    expect(parseList('  \n\n ')).toEqual([]);
  });
  it('extrai duração e responsável quando presentes', () => {
    expect(parseActivityLine('Registrar pedido (10 min)')).toEqual({ name: 'Registrar pedido', duration: 10, unit: 'min', owner: undefined });
    expect(parseActivityLine('Aprovar compra por Gestor - 1,5 h')).toEqual({ name: 'Aprovar compra', duration: 1.5, unit: 'h', owner: 'Gestor' });
    expect(parseActivityLine('Cotar fornecedores 2 dias')).toMatchObject({ name: 'Cotar fornecedores', duration: 2, unit: 'd' });
    expect(parseActivityLine('Conferir nota')).toEqual({ name: 'Conferir nota', duration: undefined, unit: undefined, owner: undefined });
  });
  it('atividade com duração e responsável no texto não precisa de nova pergunta', () => {
    expect(draftActivityFrom('Aprovar por Gestor (15 min)').reviewed).toBe(true);
    expect(draftActivityFrom('Aprovar').reviewed).toBe(false);
  });
});

describe('rascunho → processo', () => {
  const draft = () => {
    const d = emptyDraft();
    d.name = 'Aprovação de compras';
    d.trigger = 'Área solicita material';
    d.outcome = 'Pedido de compra emitido';
    const a1 = draftActivityFrom('Registrar solicitação por Solicitante (10 min)');
    const a2 = draftActivityFrom('Analisar orçamento');
    a2.durationUnknown = true;
    a2.owner = 'Gestor';
    a2.people = 1;
    const a3 = draftActivityFrom('Emitir pedido por Compras (20 min)');
    a3.people = 1;
    a3.waitState = 'informada';
    a3.wait = 60;
    d.stages = [
      { key: 's1', name: 'Solicitação', activities: [a1] },
      { key: 's2', name: 'Aprovação', activities: [a2] },
      { key: 's3', name: 'Compra', activities: [a3] },
    ];
    d.decisions = [{ key: 'x', question: 'Orçamento aprovado?', afterKey: a2.key, noTarget: '__end' }];
    d.volume = 300;
    d.costUnknown = true;
    return d;
  };
  it('gera processo válido com início, decisão e fins', () => {
    const p = draftToProcess(draft());
    expect(validateProcess(p).filter((i) => i.severity === 'error')).toEqual([]);
    expect(p.activities.map((a) => a.type)).toEqual(['start', 'task', 'task', 'decision', 'task', 'end', 'end']);
    expect(p.activities[0].name).toBe('Área solicita material');
    const dec = p.activities.find((a) => a.type === 'decision')!;
    expect(dec).toMatchObject({ name: 'Orçamento aprovado?', nextYes: 'A3', nextNo: 'FIM_NAO' });
    expect(p.stageOrder).toEqual(['Solicitação', 'Aprovação', 'Compra']);
  });
  it('“não sei” fica ausente, nunca zero, e é anotado', () => {
    const p = draftToProcess(draft());
    const a2 = p.activities.find((a) => a.id === 'A2')!;
    expect(a2.duration).toBeUndefined();
    expect(a2.notes).toMatch(/ainda não medida/);
    expect(p.defaultCostPerHour).toBeUndefined();
    const m = computeMetrics(p);
    expect(m.elapsed.status).toBe('nao_calculado');
    expect(m.totalCostPeriod.value).toBeNull();
  });
  it('rascunho vazio não gera atividades', () => {
    expect(draftToProcess(emptyDraft()).activities).toEqual([]);
  });
});

describe('interpretação de texto livre em EN (só com o idioma ativo EN)', () => {
  afterEach(() => setActiveLocale('pt'));
  it('responsável, duração e separadores em inglês', () => {
    setActiveLocale('en');
    expect(parseActivityLine('Approve purchase by Manager (15 min)')).toEqual({ name: 'Approve purchase', duration: 15, unit: 'min', owner: 'Manager' });
    expect(parseActivityLine('Review quote by the Buyer - 2 hours')).toMatchObject({ name: 'Review quote', duration: 2, unit: 'h', owner: 'Buyer' });
    expect(parseActivityLine('Ship order (1 day)')).toMatchObject({ duration: 1, unit: 'd' });
    expect(parseList('request, then approve, finally buy')).toEqual(['Request', 'Approve', 'Buy']);
  });
  it('em PT nada muda, mesmo com palavras em inglês', () => {
    expect(parseActivityLine('Approve purchase by Manager (15 min)')).toEqual({ name: 'Approve purchase by Manager', duration: 15, unit: 'min', owner: undefined });
    expect(parseList('request, then approve')).toEqual(['Request, then approve']);
  });
});
