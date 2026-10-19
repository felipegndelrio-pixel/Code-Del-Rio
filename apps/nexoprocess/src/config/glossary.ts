// Termos técnicos explicados em linguagem simples (ajuda contextual).
export const GLOSSARY = {
  bpmn: { term: 'BPMN', text: 'Notação padrão para desenhar processos: círculos são início/fim, retângulos são atividades e losangos são decisões. Você não precisa desenhar: o mapa é montado a partir dos seus dados.' },
  lean: { term: 'Lean', text: 'Abordagem de melhoria que separa o que agrega valor ao cliente do que é desperdício, para reduzir esperas, erros e esforço.' },
  va: { term: 'Agrega valor', text: 'O cliente pagaria por isso: transforma o produto/serviço do jeito que ele quer.' },
  nnva: { term: 'Necessário (não agrega valor)', text: 'Não muda nada para o cliente, mas hoje é exigido (lei, controle, sistema). Candidato a simplificar ou automatizar.' },
  waste: { term: 'Desperdício', text: 'Consome tempo e não agrega valor nem é exigido: espera, retrabalho, movimentação, conferências repetidas.' },
  lead: { term: 'Tempo decorrido (lead time)', text: 'Quanto tempo passa do início ao fim de uma execução, incluindo esperas. Não é a soma de tudo: caminhos alternativos e paralelos contam só o mais longo.' },
  active: { term: 'Tempo de trabalho ativo', text: 'Tempo em que alguém está de fato trabalhando no item, sem contar esperas.' },
  effort: { term: 'Esforço (pessoa-hora)', text: 'Duração em horas × número de pessoas trabalhando ao mesmo tempo. 30 min com 2 pessoas = 1 pessoa-hora.' },
  rework: { term: 'Retrabalho', text: 'Fazer de novo algo que deveria ter saído certo antes. Só consideramos o que você marcou ou modelou como retrabalho.' },
  bottleneck: { term: 'Gargalo', text: 'Atividade que concentra uma parte desproporcional do tempo, esforço ou custo. A ferramenta mostra a concentração; a causa precisa ser confirmada no dia a dia.' },
  raci: { term: 'RACI', text: 'Matriz de papéis: R = executa; A = presta contas (só um por atividade); C = é consultado; I = é informado.' },
  fmea: { term: 'FMEA', text: 'Análise de modos de falha: para cada falha possível você dá notas de 1 a 10 para Severidade, Ocorrência e Detecção. RPN = S × O × D.' },
  asis: { term: 'AS-IS', text: 'Como o processo funciona hoje.' },
  tobe: { term: 'TO-BE', text: 'Como o processo pode funcionar depois das mudanças propostas. É uma hipótese até ser implantado e medido.' },
  payback: { term: 'Payback', text: 'Quantos meses o benefício líquido leva para pagar o investimento inicial.' },
  roi: { term: 'ROI', text: 'Retorno sobre o investimento no horizonte escolhido: (benefício líquido no período − investimento) ÷ investimento.' },
  pareto: { term: 'Pareto', text: 'Ordena as atividades da que mais contribui para a que menos contribui, com o acumulado. Ajuda a focar no pouco que explica muito.' },
  yamazumi: { term: 'Gráfico de carga (Yamazumi)', text: 'Barras empilhadas por etapa ou responsável, mostrando quanto do tempo é valor, necessário ou desperdício.' },
  montecarlo: { term: 'Simulação (Monte Carlo)', text: 'Sorteia muitas vezes a duração de cada atividade entre o mínimo e o máximo informados para ver a faixa provável do prazo. É uma estimativa, não garantia.' },
  capacity: { term: 'Capacidade liberada', text: 'Horas de trabalho que deixariam de ser necessárias. Não é dinheiro economizado até que a capacidade seja realocada ou o custo reduzido de fato.' },
} as const;

export type GlossaryKey = keyof typeof GLOSSARY;
