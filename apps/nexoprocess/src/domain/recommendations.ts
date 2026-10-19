// "O que melhorar agora?" — recomendações DETERMINÍSTICAS baseadas em regras
// explícitas sobre os dados. Não há IA generativa aqui; a interface rotula
// como "análise automática baseada nos dados e regras".
import { bottlenecks, computeMetrics, type ProcessMetrics } from './metrics';
import type { Activity, BottleneckCriterion, ProcessModel } from './types';
import { fmtHours, fmtNum, fmtPct, isNum } from './units';

export type RecGroup = 'resolver' | 'investigar' | 'automatizar' | 'monitorar';
export const GROUP_LABEL: Record<RecGroup, string> = {
  resolver: 'Resolver primeiro',
  investigar: 'Investigar',
  automatizar: 'Automatizar ou simplificar',
  monitorar: 'Monitorar',
};

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
  /** Tipo de mudança sugerida no TO-BE. */
  changeKind?: 'remove' | 'simplify' | 'automate' | 'reduce_wait' | 'reduce_rework';
}

const P = (s: number): Recommendation['priority'] => (s >= 70 ? 'alta' : s >= 40 ? 'media' : 'baixa');

export function recommend(p: ProcessModel, criterion: BottleneckCriterion = 'duration', thresholdPct = 15, m: ProcessMetrics = computeMetrics(p)): Recommendation[] {
  const recs: Recommendation[] = [];
  const work = m.workItems;
  const totalActive = m.activeSumH.value ?? 0;
  const per = (a: Activity) => m.per.get(a.id)!;
  const periodTxt = p.volumePeriod === 'mes' ? 'mês' : p.volumePeriod;
  const ceilingOf = (a: Activity) => {
    const x = per(a);
    if (x.effortPeriodH !== null) return `Até ${fmtNum(x.effortPeriodH)} pessoa-h/${periodTxt} se a atividade deixasse de existir (teto teórico, não previsão).`;
    if (x.effortH !== null) return `Até ${fmtNum(x.effortH * x.weight)} pessoa-h por execução (teto teórico, não previsão).`;
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
      title: `Eliminar ou reduzir “${a.name}”`,
      activityId: a.id,
      problem: 'A atividade foi classificada como desperdício: consome tempo sem gerar valor para o cliente.',
      evidence: [
        { kind: 'fato', text: `Classificação Lean informada: desperdício.` },
        ...(x.activeH !== null ? [{ kind: 'fato' as const, text: `Duração ativa: ${fmtHours(x.activeH)} por ocorrência.` }] : []),
        ...(share !== null ? [{ kind: 'inferencia' as const, text: `${fmtPct(share)} da soma das durações registradas.` }] : []),
      ],
      rule: 'Regra R1: toda atividade classificada como desperdício gera recomendação; prioridade cresce com a participação na duração total.',
      hypothesis: 'A atividade pode ser eliminada ou reduzida sem prejudicar o resultado do processo.',
      action: 'Entender por que a atividade existe (5 porquês) e testar removê-la ou combiná-la com outra.',
      ceiling: ceilingOf(a),
      owner: a.owner,
      successIndicator: 'Redução do tempo ativo e do esforço por execução, sem aumento de erros.',
      risks: 'Remover um controle disfarçado de desperdício pode aumentar falhas a jusante.',
      nextStep: 'Validar com quem executa se a atividade pode deixar de existir.',
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
      title: `Reduzir retrabalho em “${a.name}”`,
      activityId: a.id,
      problem: 'Retrabalho indica que algo saiu errado antes — o custo real está na causa, não na correção.',
      evidence: [
        { kind: 'fato', text: 'Atividade marcada como retrabalho.' },
        ...(isNum(a.frequencyPct) ? [{ kind: 'fato' as const, text: `Ocorre em ${fmtPct(a.frequencyPct)} das execuções (informado).` }] : [{ kind: 'fato' as const, text: 'Frequência não informada.' }]),
        ...(x.effortPeriodH !== null && hasFreq ? [{ kind: 'inferencia' as const, text: `Esforço estimado: ${fmtNum(x.effortPeriodH)} pessoa-h/${periodTxt}.` }] : []),
      ],
      rule: 'Regra R2: atividades marcadas como retrabalho geram recomendação; com frequência informada vão para “Resolver primeiro”, sem ela para “Investigar”.',
      hypothesis: 'A causa do retrabalho está em uma etapa anterior (dados incompletos, instrução ambígua, falta de checagem na origem).',
      action: 'Mapear as causas do retrabalho e criar prevenção na origem (checklist, campo obrigatório, validação automática).',
      ceiling: hasFreq ? ceilingOf(a) : undefined,
      owner: a.owner,
      successIndicator: 'Queda da frequência de retrabalho (%) e do esforço associado.',
      risks: 'Barreiras na origem podem aumentar o tempo da etapa anterior.',
      dataNeeded: hasFreq ? undefined : 'Informe a frequência (%) para estimar o impacto.',
      nextStep: hasFreq ? 'Levantar as 3 causas mais frequentes com quem executa.' : 'Medir em quantas execuções o retrabalho acontece.',
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
      title: `Investigar o gargalo “${a.name}”`,
      activityId: a.id,
      problem: 'A atividade concentra uma parte desproporcional do processo no critério selecionado.',
      evidence: [
        { kind: 'inferencia', text: `${fmtPct(b.share)} do total do critério (${criterionLabel(criterion)}).` },
        { kind: 'fato', text: `Posição ${i + 1} no Pareto.` },
      ],
      rule: `Regra R3: atividades com participação ≥ ${thresholdPct}% no critério “${criterionLabel(criterion)}” (máx. 5) são destacadas. Concentração não prova causa-raiz.`,
      hypothesis: 'A concentração decorre de método, capacidade, dependência ou variação — precisa de observação para confirmar.',
      action: 'Observar a execução (gemba), medir variação e verificar se há fila, falta de padrão ou excesso de aprovações.',
      ceiling: ceilingOf(a),
      owner: a.owner,
      successIndicator: `Redução da participação da atividade em ${criterionLabel(criterion).toLowerCase()}.`,
      risks: 'Otimizar uma atividade que não limita o fluxo pode não reduzir o tempo total.',
      nextStep: 'Cronometrar 10 execuções reais e comparar com o valor informado.',
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
      title: `Reduzir a espera antes de “${a.name}”`,
      activityId: a.id,
      problem: 'O item fica mais tempo parado do que sendo trabalhado — o cliente sente a espera.',
      evidence: [
        { kind: 'fato', text: `Espera informada: ${fmtHours(x.waitH)}; trabalho ativo: ${fmtHours(x.activeH)}.` },
        { kind: 'inferencia', text: Number.isFinite(ratio) ? `Espera ${fmtNum(ratio, 1)}× maior que o trabalho.` : 'Espera sem trabalho ativo correspondente.' },
      ],
      rule: 'Regra R4: espera informada ≥ 2× o tempo ativo da atividade e ≥ 5% da soma das esperas.',
      hypothesis: 'A espera vem de fila, lote, aprovação ou dependência externa que pode ser reduzida.',
      action: 'Identificar a fonte da espera (lote, horário fixo, aprovação) e testar fluxo contínuo ou SLA.',
      owner: a.owner,
      successIndicator: 'Tempo decorrido por execução (lead time) menor.',
      risks: 'Reduzir lotes pode aumentar trocas de contexto da equipe.',
      nextStep: 'Medir quando o item chega e quando é iniciado durante uma semana.',
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
      title: `Avaliar automação ou simplificação de “${a.name}”`,
      activityId: a.id,
      problem: 'Atividade necessária, mas que não agrega valor, com volume relevante.',
      evidence: [
        { kind: 'fato', text: 'Classificação Lean informada: necessário (não agrega valor).' },
        { kind: 'fato', text: `Ocorre ${fmtNum(x.execPerPeriod)} vez(es)/${periodTxt}.` },
        { kind: 'inferencia', text: `${fmtPct(share)} do esforço do período.` },
      ],
      rule: 'Regra R5: atividade “necessária” com ≥ 5% do esforço do período.',
      hypothesis: 'A atividade segue regras estáveis e dados estruturados, podendo ser automatizada ou simplificada.',
      action: 'Avaliar critérios de automação (regras, dados, exceções, julgamento humano) na seção Automação e IA.',
      ceiling: ceilingOf(a),
      owner: a.owner,
      successIndicator: 'Esforço por execução menor com a mesma taxa de erro ou menor.',
      risks: 'Automatizar um processo ruim acelera o erro; exceções podem exigir tratamento humano.',
      nextStep: 'Contar exceções em uma amostra de 20 execuções.',
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
      title: `Classificar ${unclassified.length} atividade(s) quanto ao valor (Lean)`,
      problem: 'Sem classificação não dá para separar valor de desperdício.',
      evidence: [{ kind: 'fato', text: `${unclassified.length} de ${work.filter((a) => a.type === 'task').length} atividades sem classificação.` }],
      rule: 'Regra R6: existência de atividades não classificadas.',
      hypothesis: 'Parte dessas atividades pode ser desperdício não visível hoje.',
      action: 'Classificar com quem executa: o cliente pagaria por isso? É exigido por lei/controle? Senão, é desperdício.',
      successIndicator: '100% das atividades classificadas.',
      risks: 'Classificação feita por uma só pessoa tende a ser enviesada.',
      nextStep: 'Fazer uma sessão curta de classificação com a equipe.',
    });
  }
  const noOwner = work.filter((a) => a.type === 'task' && !a.owner?.trim());
  if (noOwner.length)
    recs.push({
      id: 'R7:owner',
      group: 'monitorar',
      priority: 'media',
      score: 40,
      title: `Definir responsável de ${noOwner.length} atividade(s)`,
      problem: 'Atividades sem dono tendem a atrasar e a gerar retrabalho.',
      evidence: [{ kind: 'fato', text: `${noOwner.length} atividade(s) sem responsável informado.` }],
      rule: 'Regra R7: atividade sem responsável.',
      hypothesis: 'Falta clareza de papéis nessas atividades.',
      action: 'Definir o responsável (R) e quem presta contas (A) na matriz RACI.',
      successIndicator: 'Todas as atividades com responsável definido.',
      risks: 'Nenhum relevante.',
      nextStep: 'Abrir a aba Responsabilidades e completar a matriz.',
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
      title: `Reduzir passagens de bastão (${handoffs} trocas de responsável)`,
      problem: 'Cada troca de responsável costuma adicionar espera e risco de perda de informação.',
      evidence: [{ kind: 'inferencia', text: `${handoffs} ligações diretas entre atividades de responsáveis diferentes.` }],
      rule: 'Regra R8: 4 ou mais trocas diretas de responsável entre atividades.',
      hypothesis: 'Agrupar atividades sequenciais sob o mesmo responsável reduz espera e erros.',
      action: 'Avaliar se atividades vizinhas podem ser feitas pela mesma função.',
      successIndicator: 'Menos trocas de responsável e menor tempo decorrido.',
      risks: 'Concentrar atividades pode exigir capacitação e mudar a carga de trabalho.',
      nextStep: 'Revisar as trocas no mapa com os responsáveis envolvidos.',
    });

  // R9 — Atividade crítica: monitorar
  for (const a of work.filter((x) => x.critical)) {
    recs.push({
      id: `R9:${a.id}`,
      group: 'monitorar',
      priority: 'media',
      score: 38,
      title: `Garantir controle em “${a.name}” (crítica)`,
      activityId: a.id,
      problem: 'Falhas nesta atividade têm impacto relevante.',
      evidence: [{ kind: 'fato', text: 'Atividade marcada como crítica.' }],
      rule: 'Regra R9: atividade marcada como crítica.',
      hypothesis: 'Um controle preventivo (checagem, indicador) reduz o risco de falha.',
      action: 'Registrar o risco na aba Riscos e definir controle e indicador.',
      owner: a.owner,
      successIndicator: 'Risco registrado com controle e responsável.',
      risks: 'Controles excessivos aumentam o tempo do processo.',
      nextStep: 'Cadastrar o risco e a mitigação.',
    });
  }
  return recs.sort((a, b) => b.score - a.score);
}

function criterionLabel(c: BottleneckCriterion) {
  return { duration: 'Duração ativa', effort: 'Esforço', cost: 'Custo', wait: 'Espera', rework: 'Retrabalho' }[c];
}
