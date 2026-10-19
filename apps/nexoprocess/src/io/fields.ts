// Dicionário de campos da planilha: um só lugar para o modelo XLSX/CSV,
// a detecção automática de colunas e a ajuda contextual.

export type FieldKind = 'text' | 'number' | 'int' | 'pct' | 'type' | 'unit' | 'lean' | 'bool' | 'ref' | 'refs';
export type FieldKey =
  | 'id_atividade'
  | 'etapa_macro'
  | 'atividade'
  | 'ordem'
  | 'tipo_elemento'
  | 'duracao'
  | 'unidade_duracao'
  | 'responsavel'
  | 'quantidade_pessoas'
  | 'proxima_atividade'
  | 'proxima_se_sim'
  | 'proxima_se_nao'
  | 'classificacao_lean'
  | 'tempo_espera'
  | 'retrabalho'
  | 'frequencia_pct'
  | 'atividade_critica'
  | 'volume_periodo'
  | 'custo_hora'
  | 'custo_variavel'
  | 'duracao_minima'
  | 'duracao_maxima'
  | 'observacoes';

export interface FieldDef {
  key: FieldKey;
  /** Cabeçalho usado no modelo oficial. */
  label: string;
  kind: FieldKind;
  minimal: boolean;
  help: string;
  example: string;
  aliases: string[];
  width: number;
}

export const FIELDS: FieldDef[] = [
  { key: 'id_atividade', label: 'Código', kind: 'text', minimal: false, help: 'Código curto e único (ex.: A1). Usado para ligar atividades. Se faltar, é gerado.', example: 'A1', aliases: ['id', 'codigo', 'cod', 'id_atividade', 'codigo_atividade', 'activity_id', 'code'], width: 10 },
  { key: 'etapa_macro', label: 'Etapa macro', kind: 'text', minimal: true, help: 'Grupo ou fase principal (ex.: Recebimento). Vira um bloco no mapa macro.', example: 'Recebimento', aliases: ['etapa', 'etapa_macro', 'macro_etapa', 'macroetapa', 'fase', 'grupo', 'stage', 'phase', 'macro'], width: 20 },
  { key: 'atividade', label: 'Atividade', kind: 'text', minimal: true, help: 'O que acontece nesta etapa, com verbo (ex.: Registrar pedido).', example: 'Registrar pedido no sistema', aliases: ['atividade', 'nome_atividade', 'descricao_atividade', 'tarefa', 'activity', 'task', 'nome', 'name', 'descricao'], width: 34 },
  { key: 'ordem', label: 'Ordem', kind: 'number', minimal: true, help: 'Posição no processo (1, 2, 3…). Sem coluna de próxima atividade, o fluxo segue esta ordem.', example: '1', aliases: ['ordem', 'sequencia', 'seq', 'posicao', 'order', 'step', 'passo'], width: 8 },
  { key: 'tipo_elemento', label: 'Tipo', kind: 'type', minimal: false, help: 'início, atividade, decisão ou fim. Vazio = atividade.', example: 'atividade', aliases: ['tipo', 'tipo_elemento', 'type', 'element_type', 'elemento'], width: 12 },
  { key: 'duracao', label: 'Duração', kind: 'number', minimal: true, help: 'Tempo de trabalho ativo de UMA execução, sem contar espera.', example: '10', aliases: ['duracao', 'tempo', 'duracao_estimada', 'tempo_execucao', 'tempo_de_execucao', 'duration', 'time', 'tempo_ativo'], width: 10 },
  { key: 'unidade_duracao', label: 'Unidade', kind: 'unit', minimal: true, help: 'minutos, horas ou dias. Vale também para espera, mínimo e máximo.', example: 'minutos', aliases: ['unidade', 'unidade_duracao', 'unidade_tempo', 'unidade_de_tempo', 'unit', 'duration_unit'], width: 11 },
  { key: 'responsavel', label: 'Responsável', kind: 'text', minimal: false, help: 'Função ou área que executa (prefira a função, não o nome da pessoa).', example: 'Atendente', aliases: ['responsavel', 'dono', 'executor', 'area_responsavel', 'owner', 'responsible', 'role', 'funcao', 'cargo'], width: 20 },
  { key: 'quantidade_pessoas', label: 'Pessoas', kind: 'number', minimal: false, help: 'Quantas pessoas trabalham AO MESMO TEMPO nesta atividade.', example: '1', aliases: ['pessoas', 'qtd_pessoas', 'quantidade_pessoas', 'quantidade_de_pessoas', 'n_pessoas', 'num_pessoas', 'people', 'headcount'], width: 9 },
  { key: 'proxima_atividade', label: 'Próxima atividade', kind: 'refs', minimal: false, help: 'Código da próxima atividade. Vários códigos separados por vírgula = caminhos em paralelo.', example: 'A2', aliases: ['proxima', 'proxima_atividade', 'next', 'next_activity', 'sucessor', 'sucessora', 'segue_para'], width: 14 },
  { key: 'proxima_se_sim', label: 'Próxima se SIM', kind: 'ref', minimal: false, help: 'Para decisões: para onde segue quando a resposta é sim.', example: 'B1', aliases: ['proxima_se_sim', 'se_sim', 'sim', 'next_if_yes', 'yes', 'caminho_sim'], width: 13 },
  { key: 'proxima_se_nao', label: 'Próxima se NÃO', kind: 'ref', minimal: false, help: 'Para decisões: para onde segue quando a resposta é não.', example: 'A3', aliases: ['proxima_se_nao', 'se_nao', 'nao', 'next_if_no', 'no', 'caminho_nao'], width: 13 },
  { key: 'classificacao_lean', label: 'Classificação Lean', kind: 'lean', minimal: false, help: 'agrega valor (o cliente pagaria), necessário (exigido, mas não agrega), desperdício (poderia não existir).', example: 'necessário', aliases: ['lean', 'classificacao_lean', 'classificacao', 'valor', 'value_class', 'tipo_valor'], width: 18 },
  { key: 'tempo_espera', label: 'Tempo de espera', kind: 'number', minimal: false, help: 'Tempo parado ANTES da atividade (fila, aprovação, cliente). Mesma unidade da duração.', example: '30', aliases: ['espera', 'tempo_espera', 'tempo_de_espera', 'fila', 'wait', 'wait_time'], width: 11 },
  { key: 'retrabalho', label: 'É retrabalho?', kind: 'bool', minimal: false, help: 'sim se a atividade existe para refazer/corrigir algo.', example: 'não', aliases: ['retrabalho', 'rework', 'e_retrabalho', 'eh_retrabalho'], width: 11 },
  { key: 'frequencia_pct', label: 'Frequência (%)', kind: 'pct', minimal: false, help: 'Percentual das execuções que passam por esta atividade (ex.: 20 = 1 a cada 5). Vazio = não informado.', example: '100', aliases: ['frequencia', 'frequencia_pct', 'frequencia_percentual', 'percentual_execucoes', 'frequency', 'taxa'], width: 11 },
  { key: 'atividade_critica', label: 'Crítica?', kind: 'bool', minimal: false, help: 'sim se uma falha aqui causa impacto relevante (cliente, conformidade, segurança).', example: 'não', aliases: ['critica', 'atividade_critica', 'critical', 'criticidade'], width: 9 },
  { key: 'volume_periodo', label: 'Volume da atividade', kind: 'number', minimal: false, help: 'Opcional: quantas vezes a atividade ocorre no período (sobrepõe o volume do processo).', example: '', aliases: ['volume_periodo', 'volume_atividade', 'execucoes', 'volume'], width: 12 },
  { key: 'custo_hora', label: 'Custo-hora (R$)', kind: 'number', minimal: false, help: 'Custo-hora carregado (salário + encargos + benefícios) de quem executa. Opcional.', example: '45', aliases: ['custo_hora', 'custo_por_hora', 'valor_hora', 'hourly_cost', 'cost_per_hour', 'custo_hora_r'], width: 12 },
  { key: 'custo_variavel', label: 'Custo variável por execução (R$)', kind: 'number', minimal: false, help: 'Outros custos por execução (taxas, materiais). Diga na aba Processo se já inclui mão de obra.', example: '', aliases: ['custo_variavel', 'custo_unitario', 'custo_por_execucao', 'variable_cost', 'unit_cost', 'custo_variavel_por_execucao_r'], width: 14 },
  { key: 'duracao_minima', label: 'Duração mínima', kind: 'number', minimal: false, help: 'Para simular incerteza: o menor tempo realista.', example: '6', aliases: ['duracao_minima', 'tempo_minimo', 'minimo', 'min', 'min_duration', 'otimista'], width: 11 },
  { key: 'duracao_maxima', label: 'Duração máxima', kind: 'number', minimal: false, help: 'Para simular incerteza: o maior tempo realista.', example: '20', aliases: ['duracao_maxima', 'tempo_maximo', 'maximo', 'max', 'max_duration', 'pessimista'], width: 11 },
  { key: 'observacoes', label: 'Observações', kind: 'text', minimal: false, help: 'Qualquer contexto útil.', example: '', aliases: ['observacoes', 'obs', 'notas', 'comentarios', 'notes', 'observacao'], width: 30 },
];

export const FIELD_BY_KEY = Object.fromEntries(FIELDS.map((f) => [f.key, f])) as Record<FieldKey, FieldDef>;

/** Cabeçalhos calculados do modelo oficial — ignorados na importação. */
export const CALC_HEADERS = ['Duração em horas (calculado)', 'Esforço pessoa-h (calculado)', 'Custo por execução R$ (calculado)'];

export function normalizeHeader(s: unknown): string {
  return String(s ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
}

/** Campos do nível "Processo" (aba Processo do modelo). */
export const PROCESS_FIELDS = [
  { key: 'nome_processo', label: 'Nome do processo', help: 'Ex.: Processamento de pedido', kind: 'text' },
  { key: 'descricao', label: 'Descrição', help: 'Objetivo e escopo em uma frase', kind: 'text' },
  { key: 'area', label: 'Área', help: 'Área dona do processo', kind: 'text' },
  { key: 'dono_processo', label: 'Dono do processo', help: 'Função responsável pelo resultado', kind: 'text' },
  { key: 'volume', label: 'Volume de execuções', help: 'Quantas vezes o processo roda no período', kind: 'number' },
  { key: 'periodo_volume', label: 'Período do volume', help: 'dia, semana, mês ou ano', kind: 'period' },
  { key: 'dias_operacao_mes', label: 'Dias de operação por mês', help: 'Só se o volume for diário', kind: 'number' },
  { key: 'horas_por_dia', label: 'Horas de trabalho por dia', help: 'Converte durações em dias (ex.: 8)', kind: 'number' },
  { key: 'custo_hora_padrao', label: 'Custo-hora padrão (R$)', help: 'Usado quando a atividade/função não tem custo-hora', kind: 'number' },
  { key: 'custo_variavel_inclui_mao_de_obra', label: 'Custo variável já inclui mão de obra?', help: 'sim evita somar o mesmo custo duas vezes', kind: 'bool' },
] as const;
