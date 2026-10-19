// Mapeamento de colunas e conversão de linhas da planilha no modelo de processo.
// Nada é corrigido em silêncio: cada interpretação gera um aviso por linha.
import { newProcess, normalizeStages } from '../domain/factory';
import type { Activity, DurationUnit, ElementType, LeanClass, Period, ProcessModel } from '../domain/types';
import { parseLocaleNumber } from '../domain/units';
import { CALC_HEADERS, FIELDS, normalizeHeader, PROCESS_FIELDS, type FieldKey } from './fields';
import type { ParsedSheet } from './parse';

export type Mapping = Partial<Record<FieldKey, number>>;
export interface MappingResult {
  mapping: Mapping;
  confidence: Partial<Record<FieldKey, 'exata' | 'provável'>>;
  ignored: string[];
  duplicates: { field: FieldKey; headers: string[] }[];
  missingMinimal: FieldKey[];
}

const CALC_NORMALIZED = CALC_HEADERS.map(normalizeHeader);

export function autoMap(headers: string[]): MappingResult {
  const mapping: Mapping = {};
  const confidence: MappingResult['confidence'] = {};
  const dupHeaders = new Map<FieldKey, string[]>();
  const ignored: string[] = [];
  headers.forEach((h, idx) => {
    const n = normalizeHeader(h);
    if (!n || CALC_NORMALIZED.includes(n)) return;
    let found: { key: FieldKey; exact: boolean } | undefined;
    for (const f of FIELDS) {
      if (n === f.key || n === normalizeHeader(f.label)) {
        found = { key: f.key, exact: true };
        break;
      }
    }
    if (!found) for (const f of FIELDS) if (f.aliases.includes(n)) {
      found = { key: f.key, exact: false };
      break;
    }
    if (!found) {
      ignored.push(h);
      return;
    }
    if (mapping[found.key] !== undefined) {
      const list = dupHeaders.get(found.key) ?? [headers[mapping[found.key]!]];
      list.push(h);
      dupHeaders.set(found.key, list);
      // Coluna exata vence alias.
      if (found.exact && confidence[found.key] !== 'exata') {
        mapping[found.key] = idx;
        confidence[found.key] = 'exata';
      }
      return;
    }
    mapping[found.key] = idx;
    confidence[found.key] = found.exact ? 'exata' : 'provável';
  });
  const missingMinimal = FIELDS.filter((f) => f.minimal && mapping[f.key] === undefined && f.key !== 'ordem').map((f) => f.key);
  return { mapping, confidence, ignored, duplicates: [...dupHeaders].map(([field, hs]) => ({ field, headers: hs })), missingMinimal };
}

export function pickActivitySheet(sheets: ParsedSheet[]): number {
  const named = sheets.findIndex((s) => normalizeHeader(s.name) === 'atividades' && s.rows.length);
  if (named >= 0) return named;
  let best = 0;
  let bestScore = -1;
  sheets.forEach((s, i) => {
    const m = autoMap(s.headers);
    const score = Object.keys(m.mapping).length * 10 + (s.rows.length ? 1 : 0);
    if (score > bestScore) {
      best = i;
      bestScore = score;
    }
  });
  return best;
}

export interface RowIssue {
  row: number;
  field?: FieldKey;
  severity: 'error' | 'warning' | 'info';
  message: string;
}

export interface ImportOptions {
  /** Unidade usada quando a célula de unidade está vazia — escolhida e confirmada pelo usuário. */
  defaultUnit: DurationUnit;
  processName?: string;
}

const str = (v: unknown) => (v === null || v === undefined ? '' : v instanceof Date ? v.toISOString().slice(0, 10) : String(v).trim());

export function parseType(raw: string): ElementType | undefined | null {
  const n = normalizeHeader(raw);
  if (!n) return undefined;
  if (['inicio', 'start', 'evento_de_inicio', 'comeco'].includes(n)) return 'start';
  if (['atividade', 'tarefa', 'task', 'activity', 'etapa'].includes(n)) return 'task';
  if (['decisao', 'gateway', 'decision', 'pergunta', 'condicao'].includes(n)) return 'decision';
  if (['fim', 'end', 'termino', 'final', 'evento_de_fim'].includes(n)) return 'end';
  return null;
}
export function parseUnit(raw: string): DurationUnit | undefined | null {
  const n = normalizeHeader(raw);
  if (!n) return undefined;
  if (['min', 'mins', 'minuto', 'minutos', 'm', 'minute', 'minutes'].includes(n)) return 'min';
  if (['h', 'hr', 'hrs', 'hora', 'horas', 'hour', 'hours'].includes(n)) return 'h';
  if (['d', 'dia', 'dias', 'day', 'days', 'dia_util', 'dias_uteis'].includes(n)) return 'd';
  return null;
}
export function parseLean(raw: string): LeanClass | undefined | null {
  const n = normalizeHeader(raw);
  if (!n || ['nao_classificado', 'sem_classificacao', 'nc', 'na'].includes(n)) return undefined;
  if (['agrega_valor', 'va', 'av', 'valor', 'agrega', 'value_added', 'value'].includes(n)) return 'VA';
  if (['necessario', 'nnva', 'nav', 'necessario_sem_agregar_valor', 'necessario_sem_agregar', 'necessario_nao_agrega_valor', 'necessaria', 'business_value_added', 'bva'].includes(n)) return 'NNVA';
  if (['desperdicio', 'w', 'waste', 'nao_agrega_valor', 'naoagrega', 'muda'].includes(n)) return 'W';
  return null;
}
export function parseBool(raw: string): boolean | undefined | null {
  const n = normalizeHeader(raw);
  if (!n) return undefined;
  if (['sim', 's', 'yes', 'y', 'true', 'verdadeiro', '1', 'x'].includes(n)) return true;
  if (['nao', 'n', 'no', 'false', 'falso', '0'].includes(n)) return false;
  return null;
}
export function parsePeriod(raw: string): Period | undefined | null {
  const n = normalizeHeader(raw);
  if (!n) return undefined;
  if (['dia', 'diario', 'day', 'daily', 'por_dia'].includes(n)) return 'dia';
  if (['semana', 'semanal', 'week', 'weekly', 'por_semana'].includes(n)) return 'semana';
  if (['mes', 'mensal', 'month', 'monthly', 'por_mes'].includes(n)) return 'mes';
  if (['ano', 'anual', 'year', 'yearly', 'por_ano'].includes(n)) return 'ano';
  return null;
}

export interface ImportResult {
  process: ProcessModel;
  issues: RowIssue[];
  flowInferred: boolean;
  /** Nenhum erro bloqueante na leitura. */
  ok: boolean;
}

export function rowsToProcess(sheet: ParsedSheet, mapping: Mapping, opts: ImportOptions, processSheet?: ParsedSheet, costSheet?: ParsedSheet): ImportResult {
  const issues: RowIssue[] = [];
  const p = newProcess(opts.processName || 'Processo importado');
  if (processSheet) applyProcessSheet(p, processSheet, issues);
  if (costSheet) applyCostSheet(p, costSheet, issues);
  const get = (values: unknown[], k: FieldKey) => (mapping[k] === undefined ? '' : str(values[mapping[k]!]));
  const hasFlow = mapping.proxima_atividade !== undefined || mapping.proxima_se_sim !== undefined || mapping.proxima_se_nao !== undefined;

  type Raw = { a: Activity; next: string[]; yes: string; no: string };
  const raws: Raw[] = [];
  const usedIds = new Set<string>();
  sheet.rows.forEach((r, i) => {
    const row = r.rowNumber;
    const v = r.values;
    const name = get(v, 'atividade');
    const stage = get(v, 'etapa_macro');
    const typeRaw = get(v, 'tipo_elemento');
    let type = parseType(typeRaw);
    if (type === null) {
      issues.push({ row, field: 'tipo_elemento', severity: 'warning', message: `Tipo "${typeRaw}" não reconhecido; tratado como atividade. Use: início, atividade, decisão ou fim.` });
      type = 'task';
    }
    const yesRaw = get(v, 'proxima_se_sim');
    const noRaw = get(v, 'proxima_se_nao');
    if (!type) type = yesRaw || noRaw ? 'decision' : 'task';
    if (!name && !stage) {
      // Linha sem nenhum campo mapeado preenchido = linha vazia do modelo: ignora sem alerta.
      const anyMapped = Object.values(mapping).some((i) => i !== undefined && str(v[i]) !== '');
      if (anyMapped) issues.push({ row, severity: 'warning', message: 'Linha sem atividade nem etapa foi ignorada.' });
      return;
    }
    let id = get(v, 'id_atividade');
    if (id && usedIds.has(id)) {
      issues.push({ row, field: 'id_atividade', severity: 'error', message: `Código "${id}" duplicado. Cada atividade precisa de um código único.` });
    }
    if (!id) {
      let n = i + 1;
      while (usedIds.has(`L${n}`)) n++;
      id = `L${n}`;
    }
    usedIds.add(id);
    const num = (k: FieldKey, label: string): number | undefined => {
      const raw = get(v, k);
      if (!raw) return undefined;
      const x = parseLocaleNumber(raw);
      if (x === undefined) return undefined;
      if (Number.isNaN(x)) {
        issues.push({ row, field: k, severity: 'error', message: `${label}: "${raw}" não é um número.` });
        return undefined;
      }
      if (x < 0) issues.push({ row, field: k, severity: 'error', message: `${label}: valor negativo (${raw}).` });
      return x;
    };
    const unitRaw = get(v, 'unidade_duracao');
    let unit = parseUnit(unitRaw);
    if (unit === null) {
      issues.push({ row, field: 'unidade_duracao', severity: 'error', message: `Unidade "${unitRaw}" não reconhecida. Use minutos, horas ou dias.` });
      unit = opts.defaultUnit;
    }
    const duration = num('duracao', 'Duração');
    if (!unit) {
      unit = opts.defaultUnit;
      if (duration !== undefined) issues.push({ row, field: 'unidade_duracao', severity: 'info', message: `Unidade vazia: usada a unidade padrão escolhida (${opts.defaultUnit === 'min' ? 'minutos' : opts.defaultUnit === 'h' ? 'horas' : 'dias'}).` });
    }
    const leanRaw = get(v, 'classificacao_lean');
    let lean = parseLean(leanRaw);
    if (lean === null) {
      issues.push({ row, field: 'classificacao_lean', severity: 'warning', message: `Classificação Lean "${leanRaw}" não reconhecida; ficou como não classificada.` });
      lean = undefined;
    }
    const bool = (k: FieldKey, label: string) => {
      const raw = get(v, k);
      const b = parseBool(raw);
      if (b === null) {
        issues.push({ row, field: k, severity: 'warning', message: `${label}: "${raw}" não é sim/não; ignorado.` });
        return undefined;
      }
      return b;
    };
    const ordRaw = get(v, 'ordem');
    let order = ordRaw ? parseLocaleNumber(ordRaw) : undefined;
    if (ordRaw && (order === undefined || Number.isNaN(order))) {
      issues.push({ row, field: 'ordem', severity: 'warning', message: `Ordem "${ordRaw}" inválida; usada a posição da linha.` });
      order = undefined;
    }
    const a: Activity = {
      id,
      stage: stage || 'Sem etapa',
      name: name || '(sem nome)',
      type,
      order: order ?? i + 1,
      unit,
      duration,
      wait: num('tempo_espera', 'Tempo de espera'),
      minDuration: num('duracao_minima', 'Duração mínima'),
      maxDuration: num('duracao_maxima', 'Duração máxima'),
      people: num('quantidade_pessoas', 'Pessoas'),
      owner: get(v, 'responsavel') || undefined,
      next: [],
      lean,
      rework: bool('retrabalho', 'Retrabalho') || undefined,
      frequencyPct: num('frequencia_pct', 'Frequência'),
      critical: bool('atividade_critica', 'Crítica') || undefined,
      volume: num('volume_periodo', 'Volume da atividade'),
      costPerHour: num('custo_hora', 'Custo-hora'),
      variableCost: num('custo_variavel', 'Custo variável'),
      notes: get(v, 'observacoes') || undefined,
      sourceRow: row,
    };
    if (!stage) issues.push({ row, field: 'etapa_macro', severity: 'warning', message: 'Etapa macro vazia: atividade agrupada em "Sem etapa".' });
    if (!name) issues.push({ row, field: 'atividade', severity: 'error', message: 'Nome da atividade vazio.' });
    if (a.frequencyPct !== undefined && (a.frequencyPct < 0 || a.frequencyPct > 100)) issues.push({ row, field: 'frequencia_pct', severity: 'error', message: 'Frequência deve estar entre 0 e 100.' });
    const split = (s: string) => s.split(/[,;|\n]+/).map((x) => x.trim()).filter(Boolean);
    raws.push({ a, next: split(get(v, 'proxima_atividade')), yes: yesRaw, no: noRaw });
  });

  // Resolução de referências: código exato → nome único → número de ordem.
  const byId = new Map(raws.map((r) => [r.a.id, r.a]));
  const byName = new Map<string, Activity[]>();
  for (const r of raws) {
    const k = normalizeHeader(r.a.name);
    byName.set(k, [...(byName.get(k) ?? []), r.a]);
  }
  const byOrder = new Map<number, Activity[]>();
  for (const r of raws) byOrder.set(r.a.order, [...(byOrder.get(r.a.order) ?? []), r.a]);
  const resolve = (ref: string, row: number, field: FieldKey): string => {
    if (byId.has(ref)) return ref;
    const nm = byName.get(normalizeHeader(ref));
    if (nm?.length === 1) {
      issues.push({ row, field, severity: 'info', message: `"${ref}" foi ligado à atividade de mesmo nome (código ${nm[0].id}).` });
      return nm[0].id;
    }
    const n = parseLocaleNumber(ref);
    if (n !== undefined && !Number.isNaN(n) && byOrder.get(n)?.length === 1) {
      issues.push({ row, field, severity: 'info', message: `"${ref}" foi interpretado como a atividade de ordem ${n} (código ${byOrder.get(n)![0].id}).` });
      return byOrder.get(n)![0].id;
    }
    return ref; // permanece inválida — a validação apontará
  };
  for (const r of raws) {
    const row = r.a.sourceRow!;
    r.a.next = r.next.map((x) => resolve(x, row, 'proxima_atividade'));
    if (r.yes) r.a.nextYes = resolve(r.yes, row, 'proxima_se_sim');
    if (r.no) r.a.nextNo = resolve(r.no, row, 'proxima_se_nao');
  }

  const acts = raws.map((r) => r.a).sort((x, y) => x.order - y.order);
  const orders = acts.map((a) => a.order);
  if (new Set(orders).size !== orders.length) issues.push({ row: 0, field: 'ordem', severity: 'warning', message: 'Há números de ordem repetidos; empates seguem a ordem das linhas.' });

  let flowInferred = false;
  if (!hasFlow && acts.length > 1) {
    flowInferred = true;
    acts.forEach((a, i) => {
      const nxt = acts[i + 1];
      if (!nxt || a.type === 'end') return;
      a.next = [nxt.id];
      a.flowInferred = true;
    });
    if (acts.some((a) => a.type === 'decision'))
      issues.push({ row: 0, severity: 'warning', message: 'Há decisões, mas a planilha não tem colunas de caminho (próxima se sim/não). Elas foram ligadas apenas à linha seguinte — revise as conexões.' });
  }
  // Atividades marcadas como início não seguem a ordem para trás etc.: nada mais é inferido.
  p.activities = acts;
  if (!p.stageOrder.length) p.stageOrder = [];
  const normalized = normalizeStages(p);
  return { process: normalized, issues, flowInferred, ok: !issues.some((i) => i.severity === 'error') };
}

function applyProcessSheet(p: ProcessModel, s: ParsedSheet, issues: RowIssue[]) {
  // Formato chave-valor: coluna A = campo, coluna B = valor (cabeçalho na linha 1).
  for (const r of s.rows) {
    const key = normalizeHeader(r.values[0]);
    const raw = str(r.values[1]);
    const def = PROCESS_FIELDS.find((f) => normalizeHeader(f.label) === key || f.key === key);
    if (!def || !raw) continue;
    const n = parseLocaleNumber(raw);
    const bad = () => issues.push({ row: r.rowNumber, severity: 'warning', message: `Aba Processo — "${def.label}": valor "${raw}" inválido; ignorado.` });
    switch (def.key) {
      case 'nome_processo':
        p.name = raw;
        break;
      case 'descricao':
        p.description = raw;
        break;
      case 'area':
        p.area = raw;
        break;
      case 'dono_processo':
        p.processOwner = raw;
        break;
      case 'volume':
        if (n !== undefined && !Number.isNaN(n) && n >= 0) p.volume = n;
        else bad();
        break;
      case 'periodo_volume': {
        const per = parsePeriod(raw);
        if (per) p.volumePeriod = per;
        else bad();
        break;
      }
      case 'dias_operacao_mes':
        if (n !== undefined && n > 0 && n <= 31) p.operatingDaysPerMonth = n;
        else bad();
        break;
      case 'horas_por_dia':
        if (n !== undefined && n > 0 && n <= 24) p.hoursPerDay = n;
        else bad();
        break;
      case 'custo_hora_padrao':
        if (n !== undefined && !Number.isNaN(n) && n >= 0) p.defaultCostPerHour = n;
        else bad();
        break;
      case 'custo_variavel_inclui_mao_de_obra': {
        const b = parseBool(raw);
        if (b === null) bad();
        else p.variableCostIncludesLabor = b;
        break;
      }
    }
  }
}

function applyCostSheet(p: ProcessModel, s: ParsedSheet, issues: RowIssue[]) {
  for (const r of s.rows) {
    const role = str(r.values[0]);
    const raw = str(r.values[1]);
    if (!role || !raw) continue;
    const n = parseLocaleNumber(raw);
    if (n === undefined || Number.isNaN(n) || n < 0) {
      issues.push({ row: r.rowNumber, severity: 'warning', message: `Custos por função — "${role}": valor "${raw}" inválido; ignorado.` });
      continue;
    }
    p.costPerHourByRole[role] = n;
  }
}

export function findSheet(sheets: ParsedSheet[], name: string): ParsedSheet | undefined {
  return sheets.find((s) => normalizeHeader(s.name) === normalizeHeader(name));
}
